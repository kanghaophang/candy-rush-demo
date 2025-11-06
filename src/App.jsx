
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Candy Rush 7x7 — Version A (Web Demo)
 * - Theme: Candy (可换皮)
 * - Free Game: 启用（持久倍数）
 * - Admin: 内置本地控制台（调整下注、RTP/权重、清空倍数等）
 *
 * 说明：
 * - 纯前端，无钱包、无后端。Admin 改动只存在于浏览器内存。
 * - 玩法参考 Sugar Rush：7x7、簇消群集支付、下落、格子倍数随命中累积，免费游戏内倍数保留。
 * - 为避免版权与算法窃取，概率和倍数规则采用合理近似：
 *   * 簇= 5+ 同色相邻（4向）
 *   * 单簇奖励 = base(symbol)*clusterSize * avg(cellMultipliers in cluster)
 *   * 命中后：被消除的格子倍数 +1（上限 128x）
 *   * Base Game 结束后倍数清零；Free Game 期间倍数持续到回合结束
 *   * Scatter(🍬S) 3+ 触发免费：3→10, 4→12, 5→15, 6→20, 7→30
 *
 * Tailwind 已可用；无需额外样式库。
 */

// ============== 常量配置 ==============
const ROWS = 7;
const COLS = 7;
const BOARD_SIZE = ROWS * COLS;
const MAX_MULT = 128; // 单格倍数上限

// 糖果符号（含 Scatter）。可换皮：替换 emoji 或颜色即可
const SYMBOLS = [
  { key: "R", label: "🍓", color: "bg-rose-300", base: 1.2 },
  { key: "O", label: "🍊", color: "bg-orange-300", base: 1.1 },
  { key: "Y", label: "🍋", color: "bg-yellow-300", base: 1.0 },
  { key: "G", label: "🍏", color: "bg-green-300", base: 1.15 },
  { key: "B", label: "🫐", color: "bg-blue-300", base: 1.25 },
  { key: "P", label: "🍇", color: "bg-violet-300", base: 1.3 },
  // Scatter：触发免费，不参与普通簇消
  { key: "S", label: "🍬S", color: "bg-pink-300", base: 0 },
];

// 默认权重（越大越常见）。Admin 可调以影响命中率 ~ RTP
const DEFAULT_WEIGHTS = {
  R: 18,
  O: 18,
  Y: 18,
  G: 16,
  B: 14,
  P: 12,
  S: 3, // Scatter 稀有
};

// Free Spins 发放表
const SCATTER_FS = [
  { n: 7, fs: 30 },
  { n: 6, fs: 20 },
  { n: 5, fs: 15 },
  { n: 4, fs: 12 },
  { n: 3, fs: 10 },
];

// ============== 工具函数 ==============
const idx = (r, c) => r * COLS + c;
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

function weightedPick(weightsMap) {
  const entries = Object.entries(weightsMap);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [k, w] of entries) {
    if ((roll -= w) <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function clone(arr) {
  return JSON.parse(JSON.stringify(arr));
}

function makeEmptyMultipliers() {
  return new Array(BOARD_SIZE).fill(1);
}

function average(arr) {
  if (!arr.length) return 1;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// 生成初始盘面
function generateBoard(weights) {
  const board = new Array(BOARD_SIZE).fill(null);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let pick = weightedPick(weights);
      // 避免过多初始 Scatter 破坏体验（最多2个）
      if (pick === "S") {
        const scNow = board.filter((x) => x === "S").length;
        if (scNow >= 2) pick = weightedPick({ ...weights, S: 0 });
      }
      board[idx(r, c)] = pick;
    }
  }
  return board;
}

// 查找所有簇（>=5 的 4向连通同色），不包含 S
function findClusters(board) {
  const seen = new Array(BOARD_SIZE).fill(false);
  const clusters = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(r, c);
      if (seen[i]) continue;
      const sym = board[i];
      if (!sym || sym === "S") continue;
      // BFS
      const q = [[r, c]];
      const comp = [];
      seen[i] = true;
      while (q.length) {
        const [rr, cc] = q.shift();
        comp.push(idx(rr, cc));
        for (const [dr, dc] of dirs) {
          const nr = rr + dr;
          const nc = cc + dc;
          if (!inBounds(nr, nc)) continue;
          const ni = idx(nr, nc);
          if (seen[ni]) continue;
          if (board[ni] === sym) {
            seen[ni] = true;
            q.push([nr, nc]);
          }
        }
      }
      if (comp.length >= 5) clusters.push({ symbol: sym, cells: comp });
    }
  }
  return clusters;
}

// 让棋子下落并补充
function collapseAndRefill(board, weights) {
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = board[idx(r, c)];
      if (v) col.push(v);
    }
    // 补充新符号
    while (col.length < ROWS) {
      col.push(weightedPick(weights));
    }
    // 写回自底向上
    for (let r = ROWS - 1; r >= 0; r--) {
      board[idx(r, c)] = col[ROWS - 1 - r];
    }
  }
}

// 统计 Scatter 数
function countScatter(board) {
  return board.filter((x) => x === "S").length;
}

function awardFreeSpins(scCount) {
  for (const row of SCATTER_FS) {
    if (scCount >= row.n) return row.fs;
  }
  return 0;
}

// ============== 主组件 ==============
export default function App() {
  // 资金、下注、统计
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(1);
  const [lastWin, setLastWin] = useState(0);
  const [totalWin, setTotalWin] = useState(0);

  // 板面 & 倍数
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [board, setBoard] = useState(() => generateBoard(weights));
  const [cellMult, setCellMult] = useState(() => makeEmptyMultipliers()); // 当前盘面倍数（base 清零）

  // 免费游戏状态
  const [freeSpins, setFreeSpins] = useState(0);
  const [inFree, setInFree] = useState(false);
  const [persistMult, setPersistMult] = useState(() => makeEmptyMultipliers()); // Free Game 持续倍数

  // UI
  const [isSpinning, setIsSpinning] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPassOk, setAdminPassOk] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const turboDelay = turbo ? 200 : 550; // 每次掉落/结算视觉延迟

  // 计算展示用的倍数层（Base 用 cellMult；Free 用 persistMult 叠加）
  const effectiveMult = useMemo(() => {
    if (!inFree) return cellMult;
    // Free 期间：显示持久倍数（更有价值）
    return persistMult;
  }, [cellMult, persistMult, inFree]);

  // 纯前端“RTP”调节：
  // - 调高常见符号权重（提升命中率 / 降低平均簇大小）
  // - 调低稀有与 Scatter 权重（减少FS频率）
  function nudgeWeightsByTarget(target) {
    // target 0.85 ~ 1.20（相对命中意图）
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const mult = clamp(target, 0.7, 1.4);
    const base = { ...DEFAULT_WEIGHTS };
    // 根据 target 线性调整
    const adjusted = Object.fromEntries(
      Object.entries(base).map(([k, w]) => {
        if (k === "S") return [k, Math.max(1, Math.round(w / mult))];
        return [k, Math.max(1, Math.round(w * mult))];
      })
    );
    setWeights(adjusted);
  }

  function symbolDef(key) {
    return SYMBOLS.find((s) => s.key === key);
  }

  function formatMoney(x) {
    return x.toFixed(2);
  }

  // ======= 核心一次 Spin 流程 =======
  async function runOneResolution(currentBoard, useWeights) {
    // 计算簇
    const clusters = findClusters(currentBoard);
    if (!clusters.length) return { board: currentBoard, win: 0, didExplode: false };

    // 计算奖励 + 倍数增长
    let spinWin = 0;
    const newBoard = currentBoard.slice();
    const newCellMult = clone(cellMult);
    const newPersist = clone(persistMult);

    for (const cl of clusters) {
      const def = symbolDef(cl.symbol);
      const mVals = cl.cells.map((i) => (inFree ? newPersist[i] : newCellMult[i]));
      const avgM = Math.max(1, Math.floor(average(mVals)));
      const payout = def.base * cl.cells.length * avgM * bet;
      spinWin += payout;

      // 增加倍数并清空棋子
      for (const i of cl.cells) {
        const inc = (arr) => (arr[i] = Math.min(MAX_MULT, arr[i] + 1));
        if (inFree) {
          inc(newPersist);
        } else {
          inc(newCellMult);
        }
        newBoard[i] = null;
      }
    }

    // 写回倍数
    if (inFree) setPersistMult(newPersist);
    else setCellMult(newCellMult);

    setLastWin((w) => w + spinWin);
    setTotalWin((w) => w + spinWin);

    // 下落补充
    collapseAndRefill(newBoard, useWeights);
    setBoard(newBoard.slice());
    await waitMs(turboDelay);

    return { board: newBoard, win: spinWin, didExplode: true };
  }

  function waitMs(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function doSpin() {
    if (isSpinning) return;
    if (balance < bet && freeSpins <= 0) return; // 余额不足且无FS
    setIsSpinning(true);
    setLastWin(0);

    let workingBoard = board.slice();

    // 扣注（免费局不扣）
    if (freeSpins <= 0) setBalance((b) => b - bet);

    // Base 开始时清空临时倍数
    if (!inFree) setCellMult(makeEmptyMultipliers());

    // 首次展示（预备动画间隙）
    await waitMs(turbo ? 120 : 260);

    // 连消直到没有簇
    while (true) {
      const { board: nb, didExplode } = await runOneResolution(workingBoard, weights);
      workingBoard = nb;
      if (!didExplode) break;
    }

    // 统计 Scatter → 触发/补发免费
    const sc = countScatter(workingBoard);
    const addFs = awardFreeSpins(sc);

    if (addFs > 0) {
      // 进入或叠加 Free
      if (!inFree) {
        setInFree(true);
        setPersistMult(makeEmptyMultipliers()); // 新一轮FS，持久倍数从1开始
      }
      setFreeSpins((x) => x + addFs);
    }

    // Base 局结束：如果没有进 Free，清空临时倍数
    if (!inFree) {
      setCellMult(makeEmptyMultipliers());
    }

    // 结束：若处于 Free 则递减局数，归集奖励
    if (inFree) {
      setFreeSpins((x) => x - 1);
      // 若 Free 用尽，结算并重置持久倍数
      if (freeSpins - 1 <= 0) {
        await waitMs(turbo ? 120 : 260);
        // Free 结束将最后赢分加回余额
        setBalance((b) => b + lastWin);
        setInFree(false);
        setFreeSpins(0);
        setPersistMult(makeEmptyMultipliers());
        setLastWin(0);
      }
    } else {
      // Base 直接把赢分加回余额
      setBalance((b) => b + lastWin);
      setLastWin(0);
    }

    setIsSpinning(false);
  }

  // 新盘
  function newBoardBtn() {
    setBoard(generateBoard(weights));
    setCellMult(makeEmptyMultipliers());
  }

  // Admin 登录
  function tryAdminUnlock() {
    // 默认密码：candy (可改)
    if (adminPassInput.trim() === "candy") {
      setAdminPassOk(true);
    }
  }

  // 清空倍数（Base / Free 各自）
  function resetMultipliers() {
    setCellMult(makeEmptyMultipliers());
    setPersistMult(makeEmptyMultipliers());
  }

  // UI 渲染帮助
  function Cell({ i, k }) {
    const sdef = SYMBOLS.find((s) => s.key === k);
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const m = (inFree ? persistMult[i] : cellMult[i]) || 1;
    const isScatter = k === "S";

    return (
      <div
        className={`relative flex items-center justify-center rounded-xl shadow-sm select-none border border-white/40 ${
          sdef?.color || "bg-slate-200"
        } ${isScatter ? "ring-2 ring-pink-400" : ""}`}
        style={{ aspectRatio: "1/1" }}
        title={`(${r + 1},${c + 1}) x${m}`}
      >
        <div className="text-2xl md:text-3xl drop-shadow-sm">{sdef?.label || "?"}</div>
        {m > 1 && (
          <div className="absolute bottom-1 right-1 text-[10px] md:text-xs bg-black/60 text-white rounded px-1">x{m}</div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-rose-50 to-pink-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
        {/* 左：信息与控制 */}
        <div className="md:col-span-1 space-y-3">
          <h1 className="text-2xl md:text-3xl font-bold">Candy Rush 7x7 — Demo</h1>
          <div className="text-sm opacity-70">Version A · 网页单机 · Free Game · Admin(本地)</div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">余额 Balance</div>
              <div className="text-xl font-semibold">RM {formatMoney(balance)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">上局赢分 Last Win</div>
              <div className="text-xl font-semibold">RM {formatMoney(lastWin)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">单注 Bet</div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  className="px-2 py-1 bg-white rounded-lg shadow active:scale-95"
                  onClick={() => setBet((b) => Math.max(0.2, +(b - 0.2).toFixed(2)))}
                >
                  −
                </button>
                <div className="min-w-[64px] text-center font-semibold">RM {bet.toFixed(2)}</div>
                <button
                  className="px-2 py-1 bg-white rounded-lg shadow active:scale-95"
                  onClick={() => setBet((b) => +(b + 0.2).toFixed(2))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">免费局 Free Spins</div>
              <div className="text-xl font-semibold">{freeSpins}</div>
              {inFree && <div className="text-[11px] text-pink-600 mt-1">Free Game 进行中（倍数保留）</div>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={doSpin}
              disabled={isSpinning}
              className={`flex-1 h-12 rounded-2xl font-bold shadow text-white ${
                isSpinning ? "bg-slate-400" : "bg-rose-500 hover:bg-rose-600 active:scale-[0.98]"
              }`}
            >
              {inFree ? (isSpinning ? "Free…" : "Free Spin") : isSpinning ? "Spinning…" : "Spin"}
            </button>
            <button
              onClick={() => setTurbo((t) => !t)}
              className={`px-4 h-12 rounded-2xl font-semibold shadow ${turbo ? "bg-white ring-2 ring-rose-400" : "bg-white/70"}`}
            >
              Turbo
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button onClick={newBoardBtn} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">
              新盘 New Board
            </button>
            <button onClick={() => setShowAdmin(true)} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">
              Admin
            </button>
            <button onClick={resetMultipliers} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">
              清空倍数 Reset Mult
            </button>
          </div>

          <div className="p-3 bg-white/60 rounded-xl text-[12px] leading-5">
            <div className="font-semibold mb-1">规则要点（近似实现）</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>7×7 盘面，5+ 相邻同色形成簇，消除并下落补充。</li>
              <li>命中格子倍数 +1（上限 128x）。Base 局后清零，Free 期间保留。</li>
              <li>单簇奖励 = 符号基数 × 簇大小 × 簇内格子的平均倍数 × 下注。</li>
              <li>Scatter(🍬S) 3+ 触发免费：3→10, 4→12, 5→15, 6→20, 7→30。</li>
            </ul>
          </div>
        </div>

        {/* 中：游戏盘 */}
        <div className="md:col-span-2">
          <div className="grid grid-cols-7 gap-2 bg-white/70 p-2 rounded-2xl shadow">
            {board.map((k, i) => (
              <Cell key={i} i={i} k={k} />
            ))}
          </div>
        </div>
      </div>

      {/* Admin 面板（本地） */}
      {showAdmin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-lg">Admin 控制台（本地）</div>
              <button className="text-sm opacity-70 hover:opacity-100" onClick={() => setShowAdmin(false)}>
                关闭
              </button>
            </div>

            {!adminPassOk ? (
              <div className="space-y-3">
                <div className="text-sm">
                  输入密码以解锁（默认：<span className="font-mono">candy</span>）
                </div>
                <input
                  className="w-full px-3 py-2 rounded-lg border bg-slate-50"
                  placeholder="Admin Password"
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                />
                <button onClick={tryAdminUnlock} className="px-3 py-2 bg-rose-500 text-white rounded-xl font-semibold">
                  解锁 Unlock
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 bg-rose-50 rounded-xl border">
                    <div className="font-semibold mb-2">权重 Weights</div>
                    {Object.keys(weights).map((k) => (
                      <div key={k} className="flex items-center gap-2 text-sm mb-1">
                        <div className="w-10 font-mono">{k}</div>
                        <input
                          type="range"
                          min={0}
                          max={40}
                          value={weights[k]}
                          onChange={(e) => setWeights({ ...weights, [k]: +e.target.value })}
                          className="flex-1"
                        />
                        <div className="w-8 text-right">{weights[k]}</div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <button className="px-3 py-1 bg-white rounded-lg border" onClick={() => setWeights(DEFAULT_WEIGHTS)}>
                        重置默认
                      </button>
                      <button className="px-3 py-1 bg-white rounded-lg border" onClick={() => setBoard(generateBoard(weights))}>
                        以当前权重重建盘
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-rose-50 rounded-xl border">
                    <div className="font-semibold mb-2">目标RTP倾向</div>
                    <div className="text-xs opacity-70 mb-2">仅影响权重近似分布（0.7~1.4），非严格数学RTP</div>
                    <input
                      type="range"
                      min={0.7}
                      max={1.4}
                      step={0.01}
                      defaultValue={1.0}
                      onChange={(e) => nudgeWeightsByTarget(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs mt-1">←更难出/更低返       更高命中→</div>
                  </div>
                </div>

                <div className="p-3 bg-rose-50 rounded-xl border grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="font-semibold mb-2">余额与下注</div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <span>余额</span>
                      <input
                        type="number"
                        className="px-2 py-1 border rounded"
                        value={balance}
                        onChange={(e) => setBalance(parseFloat(e.target.value || "0"))}
                      />
                      <button className="px-2 py-1 bg-white rounded border" onClick={() => setBalance(1000)}>
                        设为1000
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span>单注</span>
                      <input
                        type="number"
                        className="px-2 py-1 border rounded"
                        step={0.2}
                        value={bet}
                        onChange={(e) => setBet(parseFloat(e.target.value || "1"))}
                      />
                      <button className="px-2 py-1 bg-white rounded border" onClick={() => setBet(1)}>
                        设为1
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold mb-2">维护</div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <button className="px-3 py-2 bg-white rounded border" onClick={resetMultipliers}>
                        清空全局倍数
                      </button>
                      <button
                        className="px-3 py-2 bg-white rounded border"
                        onClick={() => {
                          setInFree(false);
                          setFreeSpins(0);
                          setPersistMult(makeEmptyMultipliers());
                        }}
                      >
                        结束免费
                      </button>
                    </div>
                    <div className="text-xs opacity-70">注意：本演示为单机版，不含真实钱包与风控。</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
