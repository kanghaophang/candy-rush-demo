
export const ROWS = 7, COLS = 7, MAX_MULT = 128;
export const SYMBOLS = [
  { key:'R', label:'🍓', color:'bg-rose-300', base:1.2 },
  { key:'O', label:'🍊', color:'bg-orange-300', base:1.1 },
  { key:'Y', label:'🍋', color:'bg-yellow-300', base:1.0 },
  { key:'G', label:'🍏', color:'bg-green-300', base:1.15 },
  { key:'B', label:'🫐', color:'bg-blue-300', base:1.25 },
  { key:'P', label:'🍇', color:'bg-violet-300', base:1.3 },
  { key:'S', label:'🍬S', color:'bg-pink-300', base:0 },
];
export const DEFAULT_WEIGHTS = { R:18,O:18,Y:18,G:16,B:14,P:12,S:3 };
export const SCATTER_FS = [ {n:7,fs:30}, {n:6,fs:20}, {n:5,fs:15}, {n:4,fs:12}, {n:3,fs:10} ];
export const idx=(r,c)=> r*COLS+c, inBounds=(r,c)=> r>=0&&r<ROWS&&c>=0&&c<COLS;
export const emptyMult=()=> new Array(ROWS*COLS).fill(1);
export function weightedPick(weights){
  const ents=Object.entries(weights); const total=ents.reduce((s,[,w])=>s+w,0); let roll=Math.random()*total;
  for(const [k,w] of ents){ if((roll-=w)<=0) return k; } return ents[ents.length-1][0];
}
export function generateBoard(weights){
  const n=ROWS*COLS, b=new Array(n).fill(null);
  for(let r=0;r<ROWS;r++){ for(let c=0;c<COLS;c++){ let pick=weightedPick(weights);
    if(pick==='S'){ const sc=b.filter(x=>x==='S').length; if(sc>=2) pick=weightedPick({...weights,S:0}); }
    b[idx(r,c)]=pick;
  }}
  return b;
}
export function findClusters(board){
  const seen=new Array(ROWS*COLS).fill(false), dirs=[[1,0],[-1,0],[0,1],[0,-1]], clusters=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){ const i=idx(r,c); if(seen[i]) continue;
    const sym=board[i]; if(!sym||sym==='S') continue; const q=[[r,c]]; seen[i]=true; const comp=[];
    while(q.length){ const [rr,cc]=q.shift(); comp.push(idx(rr,cc));
      for(const [dr,dc] of dirs){ const nr=rr+dr,nc=cc+dc; if(!inBounds(nr,nc)) continue; const ni=idx(nr,nc);
        if(seen[ni]) continue; if(board[ni]===sym){ seen[ni]=true; q.push([nr,nc]); } } }
    if(comp.length>=5) clusters.push({symbol:sym,cells:comp});
  }
  return clusters;
}
export function collapseAndRefill(board, weights){
  for(let c=0;c<COLS;c++){
    const col=[]; for(let r=ROWS-1;r>=0;r--){ const v=board[idx(r,c)]; if(v) col.push(v); }
    while(col.length<ROWS){ col.push(weightedPick(weights)); }
    for(let r=ROWS-1;r>=0;r--){ board[idx(r,c)]=col[ROWS-1-r]; }
  }
}
export const countScatter=(board)=> board.filter(x=>x==='S').length;
export function awardFreeSpins(sc){ for(const row of [{n:7,fs:30},{n:6,fs:20},{n:5,fs:15},{n:4,fs:12},{n:3,fs:10}]){ if(sc>=row.n) return row.fs; } return 0; }
