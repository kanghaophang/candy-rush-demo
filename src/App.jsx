
import React, { useMemo, useState } from 'react'
import { ROWS, COLS, MAX_MULT, SYMBOLS, DEFAULT_WEIGHTS, idx, emptyMult, generateBoard, findClusters, collapseAndRefill, countScatter, awardFreeSpins } from './engine'
import PT from './data/paytable.json'
import './index.css'

// audio helper: use BASE_URL so GH Pages works under subpath
const url = (name)=> `${import.meta.env.BASE_URL}sfx/${name}`;
const sfx = {
  click:  new Audio(url('click.wav')),
  spin:   new Audio(url('spin.wav')),
  win:    new Audio(url('win.wav')),
  big:    new Audio(url('bigwin.wav')),
  scatter:new Audio(url('scatter.wav')),
  free:   new Audio(url('free.wav')),
  drop:   new Audio(url('drop.wav')),
};
Object.values(sfx).forEach(a=> { a.preload = 'auto'; a.volume = 0.4; });

const TEMPO = {
  normal: { explode:120, post:70, drop:110, settle:80, between:60, start:100 },
  turbo:  { explode:75,  post:40, drop:70,  settle:55, between:35, start:60  },
  hyper:  { explode:55,  post:25, drop:55,  settle:40, between:25, start:45  },
};
function useTempo(mode){ return TEMPO[mode] || TEMPO.normal; }
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

function payBySize(sym, size){
  if(sym==='S') return 0;
  const thresholds = PT.thresholds;
  const ladder = PT.symbols[sym] || [];
  let i = -1;
  for(let k=0;k<thresholds.length;k++){
    if(size >= thresholds[k]) i = k; else break;
  }
  if(i<0) return 0;
  return ladder[i]; // multiplier (× bet × avg cell mult)
}

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
  const [speed, setSpeed] = useState('normal'); // 'normal' | 'turbo' | 'hyper'
  const [auto, setAuto] = useState(0);

  const [exploding, setExploding] = useState(new Set());
  const [banner, setBanner] = useState(''); // 'BIG WIN' | 'MEGA WIN' | 'EPIC WIN'

  const effMult = useMemo(()=> inFree ? freeMult : tempMult, [inFree, tempMult, freeMult]);
  const tempo = useTempo(speed);

  function symDef(k){ return SYMBOLS.find(s=> s.key===k); }

  async function resolveOnce(cur){
    const clusters = findClusters(cur);
    if(!clusters.length) return { did:false, cur };

    let win=0;
    const nb=[...cur];
    const tM=[...tempMult], fM=[...freeMult];

    // 同步爆炸（更干净的节奏）
    const boom = new Set();
    clusters.forEach(cl => cl.cells.forEach(i=> boom.add(i)));
    setExploding(boom); (sfx.win.currentTime=0, sfx.win.play());
    await sleep(tempo.explode);
    setExploding(new Set());
    await sleep(tempo.post);

    // 结算 & 叠倍
    for(const cl of clusters){
      const size = cl.cells.length;
      const mults = cl.cells.map(i=> inFree ? fM[i] : tM[i]);
      const avgM = Math.max(1, Math.floor(mults.reduce((a,b)=>a+b,0)/mults.length));
      const unit = payBySize(cl.symbol, size);
      const pay = unit * avgM * bet;
      win += pay;
      for(const i of cl.cells){
        if(inFree) fM[i] = Math.min(MAX_MULT, fM[i]+1);
        else       tM[i] = Math.min(MAX_MULT, tM[i]+1);
        nb[i] = null;
      }
    }

    setTempMult(tM); setFreeMult(fM);
    setLastWin(w=> w+win); setTotalWin(w=> w+win);

    // 大奖横幅（按单轮赢分与bet比）
    const ratio = win / Math.max(0.01, bet);
    if(ratio >= 100) setBanner('EPIC WIN');
    else if(ratio >= 50) setBanner('MEGA WIN');
    else if(ratio >= 20) setBanner('BIG WIN');
    if(ratio >= 20) { (sfx.big.currentTime=0, sfx.big.play()); }

    // 掉落 + 补新
    collapseAndRefill(nb, weights);
    setBoard([...nb]); (sfx.drop.currentTime=0, sfx.drop.play());
    await sleep(tempo.drop);
    setBoard(b=> [...b]); // settle tick
    await sleep(tempo.settle);

    await sleep(tempo.between);
    setBanner('');
    return { did:true, cur: nb };
  }

  async function doSpin(){
    if(isSpinning) return;
    if(balance < bet && freeSpins<=0) return;

    setIsSpinning(true);
    setLastWin(0);
    (sfx.spin.currentTime=0, sfx.spin.play());
    if(!inFree) setTempMult(emptyMult());

    // 每次 Spin 先出新盘（符合原作）
    const fresh = generateBoard(weights);
    setBoard([...fresh]);
    let cur = [...fresh];

    if(freeSpins<=0) setBalance(b=> b - bet);
    await sleep(tempo.start);

    while(true){
      const { did, cur: nb } = await resolveOnce(cur);
      cur = nb;
      if(!did) break;
    }

    // Scatter → Free
    const sc = countScatter(cur);
    if(sc>=3){ (sfx.scatter.currentTime=0, sfx.scatter.play()); }
    const addFs = awardFreeSpins(sc);
    if(addFs>0){
      if(!inFree){ setFreeMult(emptyMult()); setInFree(true); }
      setFreeSpins(x=> x+addFs);
      (sfx.free.currentTime=0, sfx.free.play());
    }

    if(inFree){
      setFreeSpins(x=> x-1);
      if(freeSpins-1<=0){
        await sleep(tempo.between);
        setBalance(b=> b + lastWin);
        setLastWin(0);
        setInFree(false);
        setFreeSpins(0);
        setFreeMult(emptyMult());
      }
    }else{
      setBalance(b=> b + lastWin);
      setLastWin(0);
    }

    setIsSpinning(false);

    // Auto next
    if(auto && (balance>=bet || (inFree||freeSpins>0))){
      const remain = auto===Infinity? Infinity : auto-1;
      setAuto(remain);
      if(remain!==0) doSpin();
    }
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

  function Cell({i,k}){
    const def = SYMBOLS.find(s=>s.key===k);
    const m = effMult[i] || 1;
    const boom = exploding.has(i);
    const isSc = k==='S';
    return (
      <div className={`relative flex items-center justify-center rounded-xl border border-white/40 shadow-sm select-none ${def?.color||'bg-slate-200'} ${boom? 'explode':'fall'} settle`} style={{aspectRatio:'1/1'}}>
        <div className="text-2xl md:text-3xl">{def?.label||'?'}</div>
        {m>1 && <div className="absolute bottom-1 right-1 text-[10px] md:text-xs bg-black/60 text-white rounded px-1">x{m}</div>}
        {isSc && <div className="absolute inset-0 rounded-xl ring-2 ring-pink-400"></div>}
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50 to-pink-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
        {/* 左侧控制 */}
        <div className="space-y-3">
          <h1 className="text-2xl md:text-3xl font-bold">Candy Rush 7x7 — A1 Pack</h1>
          <div className="text-xs opacity-70">真实赔率表 · 三档速度 · 动画节拍 · 大奖横幅 · 真音效</div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">余额 Balance</div>
              <div className="text-xl font-semibold">RM {balance.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">上局赢分 Last Win</div>
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
              <div className="text-xs opacity-60">免费局 Free Spins</div>
              <div className="text-xl font-semibold">{freeSpins}</div>
              {inFree && <div className="text-[11px] text-pink-600 mt-1">Free 进行中（倍数保留）</div>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={doSpin} disabled={isSpinning} className={"flex-1 h-12 rounded-2xl font-bold text-white shadow "+(isSpinning?'bg-slate-400':'bg-rose-500 hover:bg-rose-600 active:scale-[0.98]')}>
              {inFree? (isSpinning?'Free…':'Free Spin') : (isSpinning?'Spinning…':'Spin')}
            </button>
            <div className="flex gap-1">
              <button className={"px-3 h-12 rounded-2xl font-semibold shadow bg-white/70 "+(speed==='normal'?'ring-2 ring-rose-400':'')} onClick={()=> setSpeed('normal')}>N</button>
              <button className={"px-3 h-12 rounded-2xl font-semibold shadow bg-white/70 "+(speed==='turbo'?'ring-2 ring-rose-400':'')} onClick={()=> setSpeed('turbo')}>T</button>
              <button className={"px-3 h-12 rounded-2xl font-semibold shadow bg-white/70 "+(speed==='hyper'?'ring-2 ring-rose-400':'')} onClick={()=> setSpeed('hyper')}>H</button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs opacity-60">自动转 Auto</div>
            <div className="flex gap-2">
              <button className={"px-3 py-2 rounded-xl bg-white shadow"} onClick={()=> setAuto(10)}>x10</button>
              <button className={"px-3 py-2 rounded-xl bg-white shadow"} onClick={()=> setAuto(50)}>x50</button>
              <button className={"px-3 py-2 rounded-xl bg-white shadow"} onClick={()=> setAuto(Infinity)}>∞</button>
              <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={()=> setAuto(0)}>Stop</button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button onClick={()=>{ setBoard(generateBoard(weights)); setTempMult(emptyMult()); setFreeMult(emptyMult()); }} className="px-3 py-2 rounded-xl bg-white shadow active:scale-95">新盘 New</button>
          </div>
        </div>

        {/* 盘面 */}
        <div className="md:col-span-2">
          <div className="relative">
            <div className="grid grid-cols-7 gap-2 bg-white/70 p-2 rounded-2xl shadow">
              {board.map((k,i)=> <Cell key={i} i={i} k={k}/>)}
            </div>
            {banner && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                <div className="bigwin px-4 py-2 rounded-xl bg-yellow-300/90 text-amber-900 font-extrabold shadow-lg">{banner}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({i,k}){
  const def = SYMBOLS.find(s=>s.key===k);
  const isSc = k==='S';
  // mult indicator handled by parent via effMult; for Cell-only we keep visuals
  return (
    <div className={`relative flex items-center justify-center rounded-xl border border-white/40 shadow-sm select-none ${def?.color||'bg-slate-200'} fall settle`} style={{aspectRatio:'1/1'}}>
      <div className="text-2xl md:text-3xl">{def?.label||'?'}</div>
      {isSc && <div className="absolute inset-0 rounded-xl ring-2 ring-pink-400"></div>}
    </div>
  )
}
