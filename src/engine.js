
export const ROWS=7, COLS=7, MAX_MULT=1028;
export const SYMBOLS=[
  { key:'R', label:'🍓', color:'bg-rose-300' },
  { key:'O', label:'🍊', color:'bg-orange-300' },
  { key:'Y', label:'🍋', color:'bg-yellow-300' },
  { key:'G', label:'🍏', color:'bg-green-300' },
  { key:'B', label:'🫐', color:'bg-blue-300' },
  { key:'P', label:'🍇', color:'bg-violet-300' },
  { key:'S', label:'🍬S', color:'bg-pink-300' },
];
export const DEFAULT_WEIGHTS={R:18,O:18,Y:18,G:16,B:14,P:12,S:3};
export const idx=(r,c)=> r*COLS+c, inBounds=(r,c)=> r>=0&&r<ROWS&&c>=0&&c<COLS;
export const emptyMult=()=> new Array(ROWS*COLS).fill(1);
export function weightedPick(w){ const e=Object.entries(w); const t=e.reduce((s,[,v])=>s+v,0); let roll=Math.random()*t;
  for(const [k,v] of e){ if((roll-=v)<=0) return k; } return e[e.length-1][0]; }
export function generateBoard(w){
  const b=new Array(ROWS*COLS).fill(null);
  for(let r=0;r<ROWS;r++){ for(let c=0;c<COLS;c++){ let p=weightedPick(w);
    if(p==='S'){ const sc=b.filter(x=>x==='S').length; if(sc>=2) p=weightedPick({...w,S:0}); }
    b[idx(r,c)]=p; } }
  return b;
}
export function findClusters(board){
  const seen=new Array(ROWS*COLS).fill(false), dirs=[[1,0],[-1,0],[0,1],[0,-1]], clusters=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){ const i=idx(r,c); if(seen[i]) continue;
    const sym=board[i]; if(!sym||sym==='S') continue;
    const q=[[r,c]]; seen[i]=true; const comp=[];
    while(q.length){ const [rr,cc]=q.shift(); comp.push(idx(rr,cc));
      for(const [dr,dc] of dirs){ const nr=rr+dr,nc=cc+dc; if(!inBounds(nr,nc)) continue; const ni=idx(nr,nc);
        if(seen[ni]) continue; if(board[ni]===sym){ seen[ni]=true; q.push([nr,nc]); } } }
    if(comp.length>=5) clusters.push({symbol:sym,cells:comp});
  }
  return clusters;
}
export function collapseAndRefill(board, w){
  for(let c=0;c<COLS;c++){
    const col=[]; for(let r=ROWS-1;r>=0;r--){ const v=board[idx(r,c)]; if(v) col.push(v); }
    while(col.length<ROWS){ col.push(weightedPick(w)); }
    for(let r=ROWS-1;r>=0;r--){ board[idx(r,c)]=col[ROWS-1-r]; }
  }
}
export const countScatter=(b)=> b.filter(x=>x==='S').length;
export function awardFreeSpins(sc){ if(sc>=7) return 30; if(sc>=6) return 20; if(sc>=5) return 15; if(sc>=4) return 12; if(sc>=3) return 10; return 0; }
