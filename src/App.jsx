
import React, { useMemo, useState } from 'react'
import { ROWS, COLS, MAX_MULT, SYMBOLS, DEFAULT_WEIGHTS, idx, emptyMult, generateBoard, findClusters, collapseAndRefill, countScatter, awardFreeSpins } from './engine'
import { makeSFX } from './sfx'
import './index.css'

const sfx = typeof window!=='undefined' ? makeSFX() : { click(){}, spin(){}, win(){}, big(){}, scatter(){}, free(){}, drop(){} };

export default function App(){
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(1);
  const [lastWin, setLastWin] = useState(0);
  const [totalWin, setTotalWin] = useState(0);

  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [board, setBoard] = useState(()=> generateBoard(weights));
  const [tempMult, setTempMult] = useState(()=> emptyMult());
  const [freeMult, setFreeMult] = useState(()=> emptyMult());

  const [inFree, setInFree] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);

  const [isSpinning, setIsSpinning] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminOK, setAdminOK] = useState(false);
  const [pass, setPass] = useState('');

  const effMult = useMemo(()=> inFree ? freeMult : tempMult, [inFree, tempMult, freeMult]);
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
  const [exploding, setExploding] = useState(new Set());
  const stepDelay = turbo? 90: 240;
  function symDef(k){ return SYMBOLS.find(s=>s.key===k); }

  async function resolveOnce(cur){
    const clusters = findClusters(cur);
    if(!clusters.length) return { did:false, cur };
    let win=0;
    const nb=[...cur];
    const tM=[...tempMult], fM=[...freeMult];
    for(const cl of clusters){
      const def = symDef(cl.symbol);
      const mvals = cl.cells.map(i=> (inFree? fM[i]:tM[i]));
      const avgM = Math.max(1, Math.floor(mvals.reduce((a,b)=>a+b,0)/mvals.length));
      const pay = def.base * cl.cells.length * avgM * bet;
      win += pay;
      setExploding(new Set(cl.cells));
      sfx.win();
      await sleep(turbo? 40: 120);
      setExploding(new Set());
      for(const i of cl.cells){
        if(inFree) fM[i] = Math.min(MAX_MULT, fM[i]+1);
        else tM[i] = Math.min(MAX_MULT, tM[i]+1);
        nb[i]=null;
      }
    }
    setTempMult(tM); setFreeMult(fM);
    setLastWin(w=> w+win); setTotalWin(w=> w+win);
    collapseAndRefill(nb, weights);
    setBoard([...nb]);
    sfx.drop();
    await sleep(stepDelay);
    return { did:true, cur: nb };
  }

  async function doSpin(){
    if(isSpinning) return;
    if(balance < bet && freeSpins<=0) return;
    setIsSpinning(true);
    setLastWin(0);
    sfx.spin();
    if(!inFree) setTempMult(emptyMult());
    const fresh = generateBoard(weights);
    setBoard([...fresh]);
    let cur=[...board];
    if(freeSpins<=0) setBalance(b=> b - bet);
    await sleep(turbo?60:160);
    while(true){
      const { did, cur: nb } = await resolveOnce(cur);
      cur = nb; if(!did) break;
    }
    const sc = countScatter(cur);
    if(sc>=3) sfx.scatter();
    const addFs = awardFreeSpins(sc);
    if(addFs>0){
      if(!inFree){ setFreeMult(emptyMult()); setInFree(true); }
      setFreeSpins(x=> x+addFs); sfx.free();
    }
    if(inFree){
      setFreeSpins(x=> x-1);
      if(freeSpins-1<=0){
        await sleep(stepDelay);
        setBalance(b=> b + lastWin); setLastWin(0);
        setInFree(false); setFreeSpins(0); setFreeMult(emptyMult());
      }
    }else{
      setBalance(b=> b + lastWin); setLastWin(0);
    }
    setIsSpinning(false);
    if(auto && (balance>=bet || (inFree||freeSpins>0))){
      const remain = auto===Infinity? Infinity : auto-1; setAuto(remain);
      if(remain!==0) doSpin();
    }
  }

  function newBoard(){
    setBoard(generateBoard(weights)); setTempMult(emptyMult()); setFreeMult(emptyMult());
  }
  function nudgeWeightsByTarget(target){
    const clamp=(x,lo,hi)=> Math.max(lo, Math.min(hi,x));
    const mult=clamp(target,.7,1.4);
    const base={...DEFAULT_WEIGHTS};
    const adj=Object.fromEntries(Object.entries(base).map(([k,w])=>{
      if(k==='S') return [k, Math.max(1, Math.round(w / mult))];
      return [k, Math.max(1, Math.round(w * mult))];
    }));
    setWeights(adj);
  }
  function AutoMenu(){
    return (
      <div className="flex gap-2">
        <button className={"px-3 py-2 rounded-xl bg-white shadow "+(auto===10?'ring-2 ring-rose-400':'')} onClick={()=> setAuto(10)}>x10</button>
        <button className={"px-3 py-2 rounded-xl bg-white shadow "+(auto===50?'ring-2 ring-rose-400':'')} onClick={()=> setAuto(50)}>x50</button>
        <button className={"px-3 py-2 rounded-xl bg-white shadow "+(auto===Infinity?'ring-2 ring-rose-400':'')} onClick={()=> setAuto(Infinity)}>∞</button>
        <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={()=> setAuto(0)}>Stop</button>
      </div>
    )
  }
  function Cell({i,k}){
    const def=symDef(k); const m=effMult[i]||1; const isSc=k==='S'; const boom=exploding.has(i);
    return (
      <div className={`relative flex items-center justify-center rounded-xl border border-white/40 shadow-sm select-none ${def?.color||'bg-slate-200'} ${boom?'explode':'fall'}`} style={{aspectRatio:'1/1'}}>
        <div className="text-2xl md:text-3xl">{def?.label||'?'}</div>
        {m>1 && <div className="absolute bottom-1 right-1 text-[10px] md:text-xs bg-black/60 text-white rounded px-1">x{m}</div>}
        {isSc && <div className="absolute inset-0 rounded-xl ring-2 ring-pink-400"></div>}
      </div>
    )
  }
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50 to-pink-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <h1 className="text-2xl md:text-3xl font-bold">Candy Rush 7x7 — Pro</h1>
          <div className="text-xs opacity-70">完整版 · Auto · Free 持久倍数 · 动画 & 音效 · Admin</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">余额</div>
              <div className={"text-xl font-semibold "+(lastWin>0?'pulse-win':'')}>RM {balance.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">上局赢分</div>
              <div className="text-xl font-semibold">RM {lastWin.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">单注 Bet</div>
              <div className="flex items-center gap-2 mt-1">
                <button className="px-2 py-1 bg-white rounded-lg shadow active:scale-95" onClick={()=> setBet(b=> Math.max(0.2, +(b-0.2).toFixed(2)))}>-</button>
                <div className="min-w-[64px] text-center font-semibold">RM {bet.toFixed(2)}</div>
                <button className="px-2 py-1 bg-white rounded-lg shadow active:scale-95" onClick={()=> setBet(b=> +(b+0.2).toFixed(2))}>+</button>
              </div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">免费局 Free</div>
              <div className="text-xl font-semibold">{freeSpins}</div>
              {inFree && <div className="text-[11px] text-pink-600 mt-1">Free 进行中（倍数保留）</div>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={doSpin} disabled={isSpinning} className={"flex-1 h-12 rounded-2xl font-bold text-white shadow "+(isSpinning?'bg-slate-400':'bg-rose-500 hover:bg-rose-600 active:scale-[0.98]')}>
              {inFree? (isSpinning?'Free…':'Free Spin') : (isSpinning?'Spinning…':'Spin')}
            </button>
            <button onClick={()=>{ setTurbo(t=>!t); sfx.click(); }} className={"px-4 h-12 rounded-2xl font-semibold shadow "+(turbo?'bg-white ring-2 ring-rose-400':'bg-white/70')}>Turbo</button>
          </div>
          <div className="space-y-2">
            <div className="text-xs opacity-60">自动转 Auto</div>
            <AutoMenu/>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button onClick={()=>{ setBoard(generateBoard(weights)); setTempMult(emptyMult()); setFreeMult(emptyMult()); sfx.click(); }} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">新盘 New</button>
            <button onClick={()=> setShowAdmin(true)} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">Admin</button>
            <button onClick={()=> { setTempMult(emptyMult()); setFreeMult(emptyMult()); }} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">清空倍数</button>
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="grid grid-cols-7 gap-2 bg-white/70 p-2 rounded-2xl shadow">
            {board.map((k,i)=> <Cell key={i} i={i} k={k}/>)}
          </div>
        </div>
      </div>
      {showAdmin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-lg">Admin 控制台（本地）</div>
              <button className="text-sm opacity-70 hover:opacity-100" onClick={()=> setShowAdmin(false)}>关闭</button>
            </div>
            {!adminOK ? (
              <div className="space-y-3">
                <div className="text-sm">输入密码解锁（默认：<span className="font-mono">candy</span>）</div>
                <input className="w-full px-3 py-2 rounded-lg border bg-slate-50" placeholder="Admin Password" value={pass} onChange={e=> setPass(e.target.value)}/>
                <button onClick={()=> setAdminOK(pass.trim()==='candy')} className="px-3 py-2 bg-rose-500 text-white rounded-xl font-semibold">解锁 Unlock</button>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 bg-rose-50 rounded-xl border">
                    <div className="font-semibold mb-2">权重 Weights</div>
                    {Object.keys(weights).map(k=> (
                      <div key={k} className="flex items-center gap-2 text-sm mb-1">
                        <div className="w-10 font-mono">{k}</div>
                        <input type="range" min={0} max={40} value={weights[k]} onChange={e=> setWeights({ ...weights, [k]: +e.target.value })} className="flex-1"/>
                        <div className="w-8 text-right">{weights[k]}</div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <button className="px-3 py-1 bg-white rounded-lg border" onClick={()=> setWeights(DEFAULT_WEIGHTS)}>默认</button>
                      <button className="px-3 py-1 bg-white rounded-lg border" onClick={()=> setBoard(generateBoard(weights))}>重建盘</button>
                    </div>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-xl border">
                    <div className="font-semibold mb-2">目标RTP倾向</div>
                    <div className="text-xs opacity-70 mb-2">影响符号权重分布（0.7~1.4），非严格RTP</div>
                    <input type="range" min={0.7} max={1.4} step={0.01} defaultValue={1.0} onChange={e=> nudgeWeightsByTarget(parseFloat(e.target.value))} className="w-full"/>
                    <div className="text-xs mt-1">←更难出/更低返       更高命中→</div>
                  </div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="font-semibold mb-2">余额与下注</div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <span>余额</span>
                      <input type="number" className="px-2 py-1 border rounded" value={balance} onChange={e=> setBalance(parseFloat(e.target.value||'0'))}/>
                      <button className="px-2 py-1 bg-white rounded border" onClick={()=> setBalance(1000)}>设为1000</button>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span>单注</span>
                      <input type="number" className="px-2 py-1 border rounded" step={0.2} value={bet} onChange={e=> setBet(parseFloat(e.target.value||'1'))}/>
                      <button className="px-2 py-1 bg-white rounded border" onClick={()=> setBet(1)}>设为1</button>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold mb-2">维护</div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <button className="px-3 py-2 bg-white rounded border" onClick={()=> { setTempMult(emptyMult()); setFreeMult(emptyMult()); }}>清空全局倍数</button>
                      <button className="px-3 py-2 bg-white rounded border" onClick={()=> { setInFree(false); setFreeSpins(0); setFreeMult(emptyMult()); }}>结束免费</button>
                    </div>
                    <div className="text-xs opacity-70">演示为前端单机版，不含真实钱包与后端风控。</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
