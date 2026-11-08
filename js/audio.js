export function createAudio() {
  let ctx = null;
  let crowd = null;
  let crowdGain = null;
  const api = {
    enabled: true,
    unlock,
    click,
    kick,
    pass,
    shot,
    tackle,
    whistle,
    goal,
    save,
    ui,
    reveal,
    startCrowd,
    setCrowd,
    stopCrowd,
  };
  return api;

  function ac() {
    if (!api.enabled) return null;
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function unlock() {
    ac();
  }

  function tone(freq, dur, type, gain, toFreq) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, gain, freq, q) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(a.destination);
    src.start(t);
  }

  function click() {
    tone(720, 0.045, "square", 0.045, 360);
  }

  function ui() {
    tone(560, 0.07, "triangle", 0.05, 740);
  }

  function kick() {
    noise(0.09, 0.16, 180, 0.7);
    tone(150, 0.12, "sine", 0.09, 55);
  }

  function pass(kind) {
    if (kind === "through" || kind === "lob" || kind === "clear") {
      noise(0.12, 0.1, 980, 0.55);
      tone(480, 0.12, "triangle", 0.06, 240);
    } else {
      kick();
    }
  }

  function shot() {
    noise(0.16, 0.2, 240, 0.45);
    tone(96, 0.18, "sine", 0.11, 42);
  }

  function tackle() {
    noise(0.11, 0.18, 140, 0.65);
    tone(180, 0.07, "square", 0.04, 70);
  }

  function whistle() {
    tone(1880, 0.16, "sine", 0.06, 1760);
    tone(1880, 0.28, "triangle", 0.045, 1500);
  }

  function goal() {
    const a = ac();
    if (!a) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      const t = a.currentTime + i * 0.07;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g);
      g.connect(a.destination);
      o.start(t);
      o.stop(t + 0.48);
    });
    noise(0.4, 0.08, 800, 0.4);
  }

  function save() {
    noise(0.12, 0.1, 400, 0.8);
    tone(220, 0.15, "sine", 0.05, 90);
  }

  function reveal(tier) {
    if (tier === "crown") {
      tone(880, 0.25, "triangle", 0.06, 1320);
      tone(1320, 0.4, "sine", 0.05, 1760);
    } else if (tier === "gold") tone(740, 0.22, "triangle", 0.05, 1180);
    else if (tier === "silver") tone(560, 0.16, "triangle", 0.04, 820);
    else tone(360, 0.12, "sine", 0.035, 520);
  }

  function startCrowd() {
    const a = ac();
    if (!a || crowd) return;
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last * 2.2;
    }
    crowd = a.createBufferSource();
    crowd.buffer = buf;
    crowd.loop = true;
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    crowdGain = a.createGain();
    crowdGain.gain.value = 0.012;
    crowd.connect(filter);
    filter.connect(crowdGain);
    crowdGain.connect(a.destination);
    crowd.start();
  }

  function setCrowd(level) {
    if (!crowdGain || !ctx) return;
    const now = ctx.currentTime;
    crowdGain.gain.cancelScheduledValues(now);
    crowdGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(0.05, level)), now + 0.2);
  }

  function stopCrowd() {
    if (!crowd) return;
    try {
      crowd.stop();
    } catch {
      /* already stopped */
    }
    crowd.disconnect();
    crowd = null;
    crowdGain = null;
  }
}
