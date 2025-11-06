
import React, { useMemo, useState } from 'react'
import { ROWS, COLS, MAX_MULT, SYMBOLS, DEFAULT_WEIGHTS, idx, emptyMult, generateBoard, findClusters, collapseAndRefill, countScatter, awardFreeSpins } from './engine'
import PT from './data/paytable.json'
import './index.css'

const url = (name)=> `${import.meta.env.BASE_URL}sfx/${name}`;
const sfx = { click:new Audio(url('click.wav')), spin:new Audio(url('spin.wav')), win:new Audio(url('win.wav')), big:new Audio(url('bigwin.wav')), scatter:new Audio(url('scatter.wav')), free:new Audio(url('free.wav')), drop:new Audio(url('drop.wav')) };
Object.values(sfx).forEach(a=> { a.preload='auto'; a.volume=.4; });

const TEMPO={ normal:{explode:120,post:70,drop:110,settle:80,between:60,start:100}, turbo:{explode:75,post:40,drop:70,settle:55,between:35,start:60}, hyper:{explode:55,post:25,drop:55,settle:40,between:25,start:45} };
const sleep=(ms)=> new Promise(r=> setTimeout(r, ms));

// Sugar Rush 规则差异修正点：倍数按 2x→4x→8x…128x 递增；Base 每局清空；Free 期间持久&可继续翻倍
function nextMult(m){
  if(m<2) return 2;
  return Math.min(MAX_MULT, m*2);
}
const RETRIG = { 3:5, 4:10, 5:20, 6:25, 7:30 };

function payBySize(sym, size){
  if(sym==='S') return 0;
  const thresholds=PT.thresholds, ladder=PT.symbols[sym]||[];
  let i=-1; for(let k=0;k<thresholds.length;k++){ if(size>=thresholds[k]) i=k; else break; }
  return i<0? 0 : ladder[i];
}

export default function App(){
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(1);
  const [lastWin, setLastWin] = useState(0);
  const [totalWin, setTotalWin] = useState(0);

  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [board, setBoard] = useState(()=> generateBoard(weights));
  const [tempMult, setTempMult] = useState(()=> emptyMult()); // base game
  const [freeMult, setFreeMult] = useState(()=> emptyMult()); // persistent in Free

  const [inFree, setInFree] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);

  const [isSpinning, setIsSpinning] = useState(false);
  const [speed, setSpeed] = useState('normal');
  const [auto, setAuto] = useState(0);
  const [exploding, setExploding] = useState(new Set());
  const [banner, setBanner] = useState('');

  const effMult = useMemo(()=> inFree? freeMult : tempMult, [inFree, tempMult, freeMult]);
  const tempo = TEMPO[speed] || TEMPO.normal;

  function symDef(k){ return SYMBOLS.find(s=>s.key===k); }

  async function resolveOnce(cur){
    const clusters = findClusters(cur);
    if(!clusters.length) return { did:false, cur };
    let win=0;
    const nb=[...cur];
    const tM=[...tempMult], fM=[...freeMult];

    // 同批爆
    const boom = new Set();
    clusters.forEach(cl => cl.cells.forEach(i=> boom.add(i)));
    setExploding(boom); (sfx.win.currentTime=0, sfx.win.play());
    await sleep(tempo.explode);
    setExploding(new Set());
    await sleep(tempo.post);

    // 结算 + 倍数翻倍
    for(const cl of clusters){
      const size = cl.cells.length;
      const mults = cl.cells.map(i=> (inFree? fM[i]: tM[i]));
      const avgM = Math.max(1, Math.floor(mults.reduce((a,b)=>a+b,0)/mults.length));
      const unit = payBySize(cl.symbol, size);
      const pay = unit * avgM * bet;
      win += pay;
      for(const i of cl.cells){
        if(inFree) fM[i] = nextMult(fM[i]);
        else       tM[i] = nextMult(tM[i]);
        nb[i] = null;
      }
    }
    setTempMult(tM); setFreeMult(fM);
    setLastWin(w=> w+win); setTotalWin(w=> w+win);

    // 掉落
    collapseAndRefill(nb, weights);
    setBoard([...nb]); (sfx.drop.currentTime=0, sfx.drop.play());
    await sleep(tempo.drop);
    setBoard(b=> [...b]); await sleep(tempo.settle);
    await sleep(tempo.between);

    // 大奖横幅（按单轮赢分与 bet 比）
    const ratio = win / Math.max(0.01, bet);
    if(ratio>=100) setBanner('EPIC WIN'); else if(ratio>=50) setBanner('MEGA WIN'); else if(ratio>=20) setBanner('BIG WIN'); else setBanner('');

    return { did:true, cur: nb };
  }

  async function doSpin(){
    if(isSpinning) return;
    if(balance < bet && freeSpins<=0) return;

    setIsSpinning(true);
    setLastWin(0);
    (sfx.spin.currentTime=0, sfx.spin.play());
    if(!inFree) setTempMult(emptyMult());
    const fresh = generateBoard(weights);
    setBoard([...fresh]);
    let cur=[...fresh];

    if(freeSpins<=0) setBalance(b=> b - bet);
    await sleep(tempo.start);

    while(true){
      const { did, cur: nb } = await resolveOnce(cur);
      cur = nb; if(!did) break;
    }

    // Scatter → 进入或重触发 Free
    const sc = countScatter(cur);
    if(sc>=3){ (sfx.scatter.currentTime=0, sfx.scatter.play()); }
    if(!inFree){
      const addFs = awardFreeSpins(sc);
      if(addFs>0){
        setInFree(true); setFreeMult(emptyMult());
        setFreeSpins(addFs);
        (sfx.free.currentTime=0, sfx.free.play());
      }
    }else{
      // Retrigger during free
      let add = 0;
      Object.keys(RETRIG).sort((a,b)=>b-a).forEach(k=> { if(sc>=+k && add===0) add = RETRIG[k]; });
      if(add>0){ setFreeSpins(x=> x+add); (sfx.free.currentTime=0, sfx.free.play()); }
      setFreeSpins(x=> x-1);
      if(freeSpins-1<=0){
        await sleep(tempo.between);
        setBalance(b=> b + lastWin);
        setLastWin(0);
        setInFree(false);
        setFreeSpins(0);
        setFreeMult(emptyMult());
      }
    }

    if(!inFree){
      setBalance(b=> b + lastWin);
      setLastWin(0);
    }

    setIsSpinning(false);

    if(auto && (balance>=bet || (inFree||freeSpins>0))){
      const remain = auto===Infinity? Infinity : auto-1;
      setAuto(remain);
      if(remain!==0) doSpin();
    }
  }

  function Cell({i,k}){
    const def = symDef(k);
    const isSc = k==='S';
    const m = (inFree? freeMult[i]: tempMult[i]) || 1;
    return (
      <div className={`relative flex items-center justify-center rounded-xl border border-white/40 shadow-sm select-none ${def?.color||'bg-slate-200'} fall settle`} style={{aspectRatio:'1/1'}}>
        <div className="text-2xl md:text-3xl">{def?.label||'?'}</div>
        {m>1 && <div className="badge">x{m}</div>}
        {isSc && <div className="absolute inset-0 rounded-xl ring-2 ring-pink-400"></div>}
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50 to-pink-100 text-slate-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <h1 className="text-2xl md:text-3xl font-bold">Candy Rush 7x7 — A1.2</h1>
          <div className="text-xs opacity-70">倍数 2→4→8→…128 持久（Free）· 每局重置（Base）· 真实赔率 · 三速节拍</div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">余额</div>
              <div className="text-xl font-semibold">RM {balance.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">上局赢分</div>
              <div className="text-xl font-semibold">RM {lastWin.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">单注</div>
              <div className="flex items-center gap-2 mt-1">
                <button className="px-2 py-1 bg-white rounded-lg shadow active:scale-95" onClick={()=> setBet(b=> Math.max(0.2, +(b-0.2).toFixed(2)))}>-</button>
                <div className="min-w-[64px] text-center font-semibold">RM {bet.toFixed(2)}</div>
                <button className="px-2 py-1 bg-white rounded-lg shadow active:scale-95" onClick={()=> setBet(b=> +(b+0.2).toFixed(2))}>+</button>
              </div>
            </div>
            <div className="p-3 bg-white/70 rounded-xl shadow">
              <div className="text-xs opacity-60">Free 剩余</div>
              <div className="text-xl font-semibold">{freeSpins}</div>
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
              <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={()=> setAuto(10)}>x10</button>
              <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={()=> setAuto(50)}>x50</button>
              <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={()=> setAuto(Infinity)}>∞</button>
              <button className="px-3 py-2 rounded-xl bg-white shadow" onClick={()=> setAuto(0)}>Stop</button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="relative">
            <div className="grid grid-cols-7 gap-2 bg-white/70 p-2 rounded-2xl shadow">
              {board.map((k,i)=> <Cell key={i} i={i} k={k} inFree={inFree} tempMult={tempMult} freeMult={freeMult}/>)}
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

function Cell({i,k,inFree,tempMult,freeMult}){
  const def = SYMBOLS.find(s=>s.key===k);
  const isSc = k==='S';
  const m = (inFree? freeMult[i]: tempMult[i]) || 1;
  return (
    <div className={`relative flex items-center justify-center rounded-xl border border-white/40 shadow-sm select-none ${def?.color||'bg-slate-200'} fall settle`} style={{aspectRatio:'1/1'}}>
      <div className="text-2xl md:text-3xl">{def?.label||'?'}</div>
      {m>1 && <div className="badge">x{m}</div>}
      {isSc && <div className="absolute inset-0 rounded-xl ring-2 ring-pink-400"></div>}
    </div>
  )
}
