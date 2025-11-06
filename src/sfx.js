
export function makeSFX(){
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  const now = ()=> ctx.currentTime;
  function beep(freq=440, dur=.07, type='sine', vol=.04){
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=vol;
    o.connect(g); g.connect(ctx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, now()+dur); o.stop(now()+dur+.02);
  }
  return {
    click(){beep(520,.05,'triangle',.05)}, spin(){beep(260,.05,'square',.04)},
    win(){beep(880,.12,'sine',.06)}, big(){beep(660,.16,'sawtooth',.07)},
    scatter(){beep(1040,.14,'triangle',.06)}, free(){beep(1240,.18,'sawtooth',.07)},
    drop(){beep(340,.04,'square',.03)},
  };
}
