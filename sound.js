// ============================================================
// sound.js — 효과음 · 분위기 사운드
// 소리 파일 없이 Web Audio 로 직접 만든다 (레트로 게임기 같은 단순한 파형).
//  - 브라우저 정책상 첫 클릭 이후에만 소리가 난다 → Sfx.unlock() 을 첫 클릭에서 부른다.
//  - 소리를 못 쓰는 환경이면 모든 함수가 조용히 아무 일도 하지 않는다.
// ============================================================

const Sfx = (() => {
  let ctx = null, master = null, muted = false, ambience = null;

  function ready() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  // 음 하나: 주파수, 길이(초), 파형, 크기, 시작 지연(초), 끝 주파수(미끄러짐)
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ready()) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) { /* 소리 실패는 게임에 영향 없음 */ }
  }

  // 분위기: 낮게 웅웅거리는 전기 소리 + CCTV 잡음
  function startAmbience() {
    if (ambience || !ready()) return;
    try {
      const out = ctx.createGain();
      out.gain.value = 0.35;
      out.connect(master);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass"; lowpass.frequency.value = 180;
      lowpass.connect(out);
      const hums = [55, 55.6, 110.3].map((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = f;
        g.gain.value = i === 2 ? 0.05 : 0.12;
        o.connect(g); g.connect(lowpass); o.start();
        return o;
      });

      const len = ctx.sampleRate * 2, buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer; noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass"; band.frequency.value = 2400; band.Q.value = 0.6;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.035;
      noise.connect(band); band.connect(noiseGain); noiseGain.connect(out);
      noise.start();

      ambience = { out, hums, noise };
    } catch (e) { ambience = null; }
  }

  function stopAmbience() {
    if (!ambience) return;
    try {
      ambience.hums.forEach((o) => o.stop());
      ambience.noise.stop();
      ambience.out.disconnect();
    } catch (e) { /* 무시 */ }
    ambience = null;
  }

  return {
    unlock() { if (ready()) startAmbience(); },
    startAmbience,
    stopAmbience,
    click() { tone(880, 0.05, "square", 0.08); },
    open() { tone(330, 0.08, "square", 0.1); tone(660, 0.1, "square", 0.1, 0.07); },
    correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, "square", 0.14, i * 0.09)); },
    wrong() { tone(196, 0.3, "sawtooth", 0.2, 0, 98); tone(92, 0.35, "square", 0.12, 0.12, 55); },
    win() { [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, "square", 0.14, i * 0.13)); },
    lose() { [392, 330, 262, 196, 131].forEach((f, i) => tone(f, 0.32, "sawtooth", 0.16, i * 0.2)); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
})();
