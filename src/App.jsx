
import React, { useMemo, useState } from 'react'
import { ROWS, COLS, MAX_MULT, SYMBOLS, DEFAULT_WEIGHTS, idx, emptyMult, generateBoard, findClusters, collapseAndRefill, countScatter, awardFreeSpins } from './engine'
import PT from './data/paytable.json'
import './index.css'

const url = (name)=> `${import.meta.env.BASE_URL}sfx/${name}`;
const sfx = { click:new Audio(url('click.wav')), spin:new Audio(url('spin.wav')), win:new Audio(url('win.wav')), big:new Audio(url('bigwin.wav')), scatter:new Audio(url('scatter.wav')), free:new Audio(url('free.wav')), drop:new Audio(url('drop.wav')) };
Object.values(sfx).forEach(a=> { a.preload='auto'; a.volume=.4; });

const TEMPO={ normal:{explode:120,post:70,drop:120,settle:85,between:65,start:100}, turbo:{explode:75,post:40,drop:85,settle:60,between:40,start:60}, hyper:{explode:55,post:25,drop:65,settle:45,between:28,start:45} };
const sleep=(ms)=> new Promise(r=> setTimeout(r, ms));
const RETRIG={3:5,4:10,5:20,6:25,7:30};

function payBySize(sym, size){
  if(sym==='S') return 0;
  const thresholds=PT.thresholds, ladder=PT.symbols[sym]||[];
  let i=-1; for(let k=0;k<thresholds.length;k++){ if(size>=thresholds[k]) i=k; else break; }
  return i<0? 0 : ladder[i];
}
function nextMult(m){ if(m<2) return 2; return Math.min(MAX_MULT, m*2); }

// Collapse + distance tracker
function collapseWithDistances(board, weights){
  const nb = [...board];
  const dist = new Array(ROWS*COLS).fill(0);
  for(let c=0;c<COLS;c++){
    // collect non-null (bottom-up) with their original row index
    const stack=[];
    for(let r=ROWS-1;r>=0;r--){
      const i = r*COLS+c;
      const v = nb[i];
      if(v){ stack.push({v, r0:r}); nb[i]=null; }
    }
    // place back bottom-up
    let rWrite = ROWS-1;
    for(const it of stack){
      nb[rWrite*COLS+c] = it.v;
      dist[rWrite*COLS+c] = rWrite - it.r0; // how far it moved down
      rWrite--;
    }
    // fill the rest with new picks (from "above"): treat as falling from above top
    while(rWrite>=0){
      nb[rWrite*COLS+c] = weightedPickShim(weights);
      // approximate distance as how many empty slots above it + 1
      dist[rWrite*COLS+c] = (rWrite+1); // higher row => longer fall
      rWrite--;
    }
  }
  return { nb, dist };
}

// lightweight weighted pick (mirrors engine.js but local)
function weightedPickShim(weights){
  const ents = Object.entries(weights);
  const total = ents.reduce((s,[,v])=>s+v,0);
  let roll = Math.random()*total;
  for(const [k,v] of ents){ if((roll-=v)<=0) return k; }
  return ents[ents.length-1][0];
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
  const [speed, setSpeed] = useState('normal');
  const [auto, setAuto] = useState(0);
  const [exploding, setExploding] = useState(new Set());
  const [banner, setBanner] = useState('');
  const [showRTP, setShowRTP] = useState(false);
  const [rtpTilt, setRtpTilt] = useState(1.0);
  const [pass, setPass] = useState('');
  const [admin, setAdmin] = useState(false);

  const [dropDist, setDropDist] = useState(()=> new Array(ROWS*COLS).fill(0));

  const effMult = useMemo(()=> inFree? freeMult : tempMult, [inFree, tempMult, freeMult]);
  const tempo = TEMPO[speed] || TEMPO.normal;

  function applyRtpTilt(mult){
    const base={...DEFAULT_WEIGHTS};
    const adj=Object.fromEntries(Object.entries(base).map(([k,w])=>{
      if(k==='S') return [k, Math.max(1, Math.round(w / mult))];
      return [k, Math.max(1, Math.round(w * mult))];
    }));
    setWeights(adj); setRtpTilt(mult);
  }

  async function resolveOnce(cur){
    const clusters = findClusters(cur);
    if(!clusters.length) return { did:false, cur };
    let win=0;
    const nb=[...cur];
    const tM=[...tempMult], fM=[...freeMult];

    // explode
    const boom = new Set(); clusters.forEach(cl=> cl.cells.forEach(i=> boom.add(i)));
    setExploding(boom); (sfx.win.currentTime=0, sfx.win.play());
    await sleep(tempo.explode); setExploding(new Set()); await sleep(tempo.post);

    // payout + mult
    for(const cl of clusters){
      const size = cl.cells.length;
      const mults = cl.cells.map(i=> (inFree? fM[i] : tM[i]));
      const avgM = Math.max(1, Math.floor(mults.reduce((a,b)=>a+b,0)/mults.length));
      const unit = payBySize(cl.symbol, size);
      const pay = unit * avgM * bet;
      win += pay;
      for(const i of cl.cells){
        if(inFree) fM[i] = nextMult(fM[i]); else tM[i] = nextMult(tM[i]);
        nb[i]=null;
      }
    }

    setTempMult(tM); setFreeMult(fM);
    setLastWin(w=> w+win); setTotalWin(w=> w+win);
    const ratio = win / Math.max(0.01, bet);
    if(ratio>=100) setBanner('EPIC WIN'); else if(ratio>=50) setBanner('MEGA WIN'); else if(ratio>=20) setBanner('BIG WIN'); else setBanner('');

    // column-based drop w/ distance tracking
    const res = collapseWithDistances(nb, weights);
    setBoard(res.nb); setDropDist(res.dist);
    (sfx.drop.currentTime=0, sfx.drop.play());
    await sleep(tempo.drop);
    setBoard(b=> [...b]); await sleep(tempo.settle);
    await sleep(tempo.between);
    return { did:true, cur: res.nb };
  }

  async function doSpin(){
    if(isSpinning) return;
    if(balance < bet && freeSpins<=0) return;
    setIsSpinning(true); setLastWin(0);
    (sfx.spin.currentTime=0, sfx.spin.play());
    if(!inFree) setTempMult(emptyMult());

    const fresh = generateBoard(weights);
    setBoard([...fresh]); setDropDist(new Array(ROWS*COLS).fill(0));
    let cur=[...fresh];

    if(freeSpins<=0) setBalance(b=> b - bet);
    await sleep(tempo.start);

    while(true){
      const { did, cur: nb } = await resolveOnce(cur);
      cur = nb; if(!did) break;
    }

    const sc = countScatter(cur);
    if(sc>=3){ (sfx.scatter.currentTime=0, sfx.scatter.play()); }

    if(!inFree){
      const addFs = awardFreeSpins(sc);
      if(addFs>0){ setInFree(true); setFreeMult(emptyMult()); setFreeSpins(addFs); (sfx.free.currentTime=0, sfx.free.play()); }
      else { setBalance(b=> b + lastWin); setLastWin(0); }
    }else{
      let add=0; Object.keys(RETRIG).sort((a,b)=>b-a).forEach(k=> { if(sc>=+k && add===0) add = RETRIG[k]; });
      if(add>0){ setFreeSpins(x=> x+add); (sfx.free.currentTime=0, sfx.free.play()); }
      setFreeSpins(x=> x-1);
      if(freeSpins-1<=0){
        await sleep(tempo.between);
        setBalance(b=> b + lastWin); setLastWin(0);
        setInFree(false); setFreeSpins(0); setFreeMult(emptyMult());
      }
    }
    setIsSpinning(false);
    if(auto && (balance>=bet || (inFree||freeSpins>0))){ const remain=auto===Infinity?Infinity:auto-1; setAuto(remain); if(remain!==0) doSpin(); }
  }

  function Cell({i,k}){
    const def = SYMBOLS.find(s=>s.key===k);
    const isSc = k==='S';
    const m = (inFree? freeMult[i]: tempMult[i]) || 1;
    const col = i % COLS;
    const d = dropDist[i] || 0;
    // Column offset (12ms per column) + distance factor (22ms per row fallen)
    const delayMs = col*12 + d*22;
    return (
      <div className={`relative flex items-center justify-center rounded-xl border border-white/40 shadow-sm select-none ${def?.color||'bg-slate-200'} fall settle`} style={{aspectRatio:'1/1', '--d': `${delayMs}ms`}}>
        <div className="text-2xl md:text-3xl">{def?.label||'?'}</div>
        {m>1 && <div className="badge">x{m}</div>}
        {isSc && <div className="absolute inset-0 rounded-xl ring-2 ring-pink-400"></div>}
      </div>
    )
  }

  const grid = (
    <div className="board-frame p-2">
      <div className="grid grid-cols-7 gap-2">
        {board.map((k,i)=> <Cell key={i} i={i} k={k} />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-candy text-slate-800">
      {/* Top bar */}
      <div className="max-w-6xl mx-auto px-4 pt-3 pb-1 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-white/80 shadow border">Free 剩余：<b>{freeSpins}</b></div>
          <div className="px-3 py-1 rounded-full bg-white/80 shadow border">总赢分：<b>RM {totalWin.toFixed(2)}</b></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=> setShowRTP(true)} className="px-3 py-1 rounded-full bg-white/80 shadow border">RTP 调整</button>
        </div>
      </div>

      {/* Middle: grid + right column */}
      <div className="max-w-6xl mx-auto px-4 pb-2 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-9">{grid}</div>
        <div className="col-span-3 flex flex-col items-center gap-3">
          <button onClick={doSpin} disabled={isSpinning} className={"btn-round btn-spin text-lg " + (isSpinning?'opacity-60':'')}>{inFree?'FREE':'SPIN'}</button>
          <button onClick={()=> setAuto(10)} className="btn-round btn-sec text-xs">AUTO<br/>x10</button>
          <button onClick={()=> setAuto(50)} className="btn-round btn-sec text-xs">AUTO<br/>x50</button>
          <div className="flex gap-2">
            <button onClick={()=> setSpeed('normal')} className={"btn-round btn-sec text-xs "+(speed==='normal'?'ring-2 ring-rose-400':'')}>N</button>
            <button onClick={()=> setSpeed('turbo')}  className={"btn-round btn-sec text-xs "+(speed==='turbo'?'ring-2 ring-rose-400':'')}>T</button>
            <button onClick={()=> setSpeed('hyper')}  className={"btn-round btn-sec text-xs "+(speed==='hyper'?'ring-2 ring-rose-400':'')}>H</button>
          </div>
        </div>
      </div>

      {/* Bottom HUD */}
      <div className="max-w-6xl mx-auto px-4 pb-4">
        <div className="board-frame px-4 py-2 grid grid-cols-3 gap-3 items-center">
          <div className="flex items-center gap-3">
            <div>余额</div><div className="text-xl font-bold">RM {balance.toFixed(2)}</div>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <button className="px-3 py-2 bg-white rounded-xl shadow border" onClick={()=> setBet(b=> Math.max(0.2, +(b-0.2).toFixed(2)))}>-</button>
            <div className="min-w-[90px] text-center font-bold">Bet RM {bet.toFixed(2)}</div>
            <button className="px-3 py-2 bg-white rounded-xl shadow border" onClick={()=> setBet(b=> +(b+0.2).toFixed(2))}>+</button>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <div>上局赢分</div><div className="text-xl font-bold">RM {lastWin.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* RTP modal */}
      {showRTP && (
        <div className="modal" onClick={()=> setShowRTP(false)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()}>
            {!admin ? (
              <div>
                <div className="font-bold mb-2">Admin 验证</div>
                <div className="text-sm mb-2">输入密码（默认 <span className="font-mono">candy</span>）解锁 RTP & 权重</div>
                <input className="w-full px-3 py-2 border rounded mb-2" placeholder="Admin Password" value={pass} onChange={e=> setPass(e.target.value)} />
                <button className="px-3 py-2 bg-rose-500 text-white rounded" onClick={()=> setAdmin(pass.trim()==='candy')}>解锁</button>
              </div>
            ) : (
              <div className="grid gap-3">
                <div>
                  <div className="font-bold mb-1">RTP 倾向（0.7–1.4）</div>
                  <input type="range" min={0.7} max={1.4} step={0.01} value={rtpTilt} onChange={e=> applyRtpTilt(parseFloat(e.target.value))} className="w-full" />
                  <div className="text-xs opacity-70 mt-1">当前：{rtpTilt.toFixed(2)}（右侧更高命中，左侧更硬）</div>
                </div>
                <div className="font-bold">符号权重</div>
                {Object.keys(weights).map(k=> (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <div className="w-10 font-mono">{k}</div>
                    <input type="range" min={0} max={40} value={weights[k]} onChange={e=> setWeights({ ...weights, [k]: +e.target.value })} className="flex-1" />
                    <div className="w-8 text-right">{weights[k]}</div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-white rounded border" onClick={()=> { setWeights(DEFAULT_WEIGHTS); setRtpTilt(1.0); }}>重置默认</button>
                  <button className="px-3 py-2 bg-white rounded border" onClick={()=> setShowRTP(false)}>完成</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="banner px-5 py-2 rounded-xl bg-yellow-300/90 text-amber-900 font-extrabold shadow-lg">{banner}</div>
        </div>
      )}
    </div>
  )
}
