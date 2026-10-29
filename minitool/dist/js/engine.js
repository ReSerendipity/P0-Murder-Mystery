/* =========================================================
   P0 事故剧本杀 · 引擎
   ========================================================= */
"use strict";

/* ---------- 工具 ---------- */
const $ = (id) => document.getElementById(id);
let seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
function rnd() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function indexById(list, keyFn) {
  var map = {};
  for (var i = 0; i < list.length; i++) map[keyFn(list[i])] = list[i];
  return map;
}
const AGENT_MAP = indexById(AGENTS, function (a) { return a.id; });
const CLUE_MAP = indexById(CLUES, function (c) { return c.no; });

/* ---------- 音效（全部代码合成） ---------- */
const SFX = {
  ctx: null, master: null, muted: false, ambient: null,
  tensionTimer: null, tensionLevel: 0,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch (e) {
      this.ctx = null;
      console.warn("AudioContext 不可用", e);
    }
  },
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    dur = dur || 0.05; type = type || "sine"; vol = vol == null ? 0.05 : vol;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, vol, freq, q) {
    if (!this.ctx || this.muted) return;
    dur = dur || 0.2; vol = vol || 0.04; freq = freq || 800; q = q || 1;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t);
  },
  startAmbient() {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 340;
    this.ambient = this.ctx.createGain(); this.ambient.gain.value = 0.01;
    src.connect(lp); lp.connect(this.ambient); this.ambient.connect(this.master);
    src.start();
    // 呼吸感：用低频 LFO 轻微调制环境音量，避免一成不变的静态噪音
    const lfo = this.ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.003;
    lfo.connect(lfoGain); lfoGain.connect(this.ambient.gain); lfo.start();
    // 机房低鸣：55Hz 正弦经低通后的极弱底噪，铺一层空间感
    const drone = this.ctx.createOscillator(); drone.type = "sine"; drone.frequency.value = 55;
    const dlp = this.ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 220;
    const dg = this.ctx.createGain(); dg.gain.value = 0.012;
    drone.connect(dlp); dlp.connect(dg); dg.connect(this.master);
    drone.start();
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  },
  voice(agent) {
    if (!agent || !this.ctx || this.muted) return;
    // 每个字轻微抖动音高 + 向下滑音 + 基频与八度泛音，确保笔记本扬声器也能听清文字音
    const j = 1 + (Math.random() * 0.06 - 0.03);          // ±3% 音高随机
    const f = agent.freq * j;
    const t = this.ctx.currentTime;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(4200, f * 9);            // 适当放宽，保留可闻的高频
    lp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.006);       // 明显可闻的音量（此前 0.022 偏轻）
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const o1 = this.ctx.createOscillator();
    o1.type = agent.wave;
    o1.frequency.setValueAtTime(f, t);
    o1.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.04);  // 语音式下滑
    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(f * 2, t);                 // 八度泛音：补足纯正弦角色（Kimi/豆包等）的存在感
    o2.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.04);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.45;
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(this.master);
    o1.start(t); o2.start(t);
    o1.stop(t + 0.06); o2.stop(t + 0.06);
  },
  typeTick() {                                        // 旁白打字机轻响：无角色说话时的中性文字音
    this.tone(700 + Math.random() * 140, 0.02, "triangle", 0.03);
  },
  clue() {
    this.tone(660, 0.08, "sine", 0.05, 990);
    setTimeout(() => this.tone(1320, 0.07, "sine", 0.03), 70);
  },
  sting() {
    this.tone(220, 0.38, "sawtooth", 0.055);
    this.tone(233, 0.38, "sawtooth", 0.05);
    this.noise(0.3, 0.05, 1400, 0.7);
  },
  thud() { this.tone(88, 0.22, "sine", 0.08, 50); },
  tick() { this.tone(1180, 0.018, "square", 0.012); },
  endingGood() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, "triangle", 0.05), i * 130));
  },
  endingBad() {
    this.tone(110, 1.4, "sawtooth", 0.05);
    this.tone(116, 1.4, "sine", 0.04);
  },

  /* ---------- 计时紧张层：心跳随剩余时间加速 ---------- */
  startTension() {
    if (this.tensionTimer || !this.ctx) return;
    const beat = () => {
      if (!this.ctx || this.muted) return;
      if (this.tensionLevel === 1) {                 // 危险（<=120s）：缓慢双跳
        this.tone(70, 0.12, "sine", 0.06, 48);
        setTimeout(() => this.tone(60, 0.12, "sine", 0.05, 42), 180);
      } else if (this.tensionLevel === 2) {          // 临界（<=60s）：更快更高
        this.tone(84, 0.1, "sine", 0.07, 56);
        setTimeout(() => this.tone(72, 0.1, "sine", 0.06, 48), 120);
      }
    };
    this.tensionTimer = setInterval(beat, this.tensionLevel === 2 ? 1000 : 2000);
  },
  setTension(level) {
    if (level === this.tensionLevel) return;
    this.tensionLevel = level;
    if (this.tensionTimer) { clearInterval(this.tensionTimer); this.tensionTimer = null; }
    if (level === 0 || !this.ctx) return;
    this.startTension();
  },
  stopTension() { this.setTension(0); },

  /* ---------- 事件音 ---------- */
  investigate() {                                     // 进入调查现场：上扫 + 轻噪
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.34);
    this.noise(0.18, 0.02, 1200, 0.8);
  },
  enterAgentSfx(agent) {                              // 进入询问：下行 whoosh + 角色签名音
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.28);
    if (agent) setTimeout(() => this.tone(agent.freq, 0.06, agent.wave, 0.02), 140);
  },
  returnHub() {                                       // 返回作战室：柔和下行音
    this.tone(330, 0.06, "sine", 0.025, 247);
  },
  archiveOpen() {                                     // 打开线索档案：抽屉声 + 和声
    this.noise(0.08, 0.03, 2200, 1.2);
    this.tone(523, 0.07, "triangle", 0.03);
    setTimeout(() => this.tone(659, 0.08, "triangle", 0.025), 60);
  },
  reveal() {                                          // 真相档案：上行和弦
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.32, "sine", 0.04), i * 90));
  },
  paper() {                                           // 出示线索：纸张翻动
    this.noise(0.12, 0.035, 1600, 0.6);
  },
  accuse() {                                          // 进入指认（红屏）：压迫式下滑
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.7);
    this.tone(55, 0.7, "sine", 0.05, 40);
  },
  cardDone() {                                        // 结案卡生成：快门 + 确认音
    this.noise(0.05, 0.04, 3000, 1.5);
    setTimeout(() => this.tone(1320, 0.05, "square", 0.02), 30);
    setTimeout(() => { this.tone(523, 0.18, "triangle", 0.035); this.tone(784, 0.2, "triangle", 0.03); }, 60);
  },
  uiClick() {                                         // 通用 UI 轻点（术语表/记录/作弊/简报）
    this.tone(880, 0.025, "square", 0.018);
  },
  select() {                                          // 进入支撑线索选择：确认音
    this.tone(660, 0.05, "sine", 0.03);
  },
  closePanel() {                                       // 关闭面板：柔和下行 + 轻噪，给用户明确"合上"反馈
    if (!this.ctx || this.muted) return;
    this.tone(420, 0.07, "sine", 0.022, 240);
    this.noise(0.06, 0.018, 1600, 0.9);
  },
  reportOpen() {                                       // 打开结案复盘：档案抽出的沙沙声 + 低沉确认音
    if (!this.ctx || this.muted) return;
    this.noise(0.14, 0.03, 1500, 0.7);
    this.tone(392, 0.12, "sine", 0.03, 294);
  },
  lineCue() {                                          // 推进到下一句：极轻的"翻页"提示，区别于逐字 tick
    this.tone(560, 0.035, "triangle", 0.016, 700);
  },
  transition() {                                       // 场景切换：上扫 whoosh，标记进入新段落
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.38);
  }
};

/* ---------- 状态 ---------- */
const STATE = {
  started: false, ended: false, ending: null,
  secs: 1024, timerId: null,
  scene: null, lineIndex: 0, typing: null, lineDone: false,
  clues: new Set(), asked: new Set(), broken: new Set(), topics: {},
  accused: null, accusation: null, supports: [],
  muted: false, auto: false, autoTimer: null, cheats: 0,
  sealed: false, warned60: false,
  history: [],
  order: { inv: [], agents: [], statements: [] }
};

const bgEl = $("bg"), topbar = $("topbar"), dialogue = $("dialogue"),
  textEl = $("text"), nameEl = $("nameplate"), roleEl = $("roleTag"),
  waveEl = $("wave"), choicesEl = $("choices"),
  portraitEl = $("portrait"), portraitWrap = $("portraitWrap"),
  timerEl = $("timer"), tbar = $("tbar"), tbarFill = $("tbarFill"),
  clueCountEl = $("clueCount"), toastEl = $("toast"),
  overlay = $("overlay"), panel = $("panel"),
  supportOverlay = $("supportOverlay"), supportGrid = $("supportGrid"),
  supportCount = $("supportCount"), supportConfirm = $("supportConfirm");

/* ---------- 计时 ---------- */
function fmt(s) {
  s = Math.max(0, s);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function renderTimer() {
  timerEl.textContent = String(Math.max(0, STATE.secs));
  const pct = STATE.secs / 1024 * 100;
  tbarFill.style.width = pct + "%";
  const danger = STATE.secs <= 120;
  const critical = STATE.secs <= 60 && STATE.started && !STATE.ended;
  timerEl.classList.toggle("danger", danger);
  timerEl.classList.toggle("critical", critical);
  timerEl.classList.toggle("sealed", STATE.sealed);
  tbar.classList.toggle("danger", danger);
  const sw = $("sysWarn");
  if (sw) sw.classList.toggle("on", critical);
  // 60 秒一次性警示（spend 可能跳过整数秒，故放这里而非 tick）
  if (critical && !STATE.warned60) {
    STATE.warned60 = true;
    SFX.tick();
    SFX.tone(392, 0.16, "square", 0.05);
    SFX.tone(262, 0.3, "square", 0.05, 0.18);
  }
  // 计时紧张层：随剩余时间进入危险/临界心跳
  if (STATE.started && !STATE.ended && !STATE.sealed) {
    SFX.setTension(critical ? 2 : danger ? 1 : 0);
  } else {
    SFX.setTension(0);
  }
}
function startTimer() {
  renderTimer();
  STATE.timerId = setInterval(() => {
    if (!STATE.started || STATE.ended || STATE.sealed) return;
    if (document.hidden) return;
    STATE.secs--;
    if (STATE.secs <= 0) { STATE.secs = 0; renderTimer(); ending("J"); return; }
    if (STATE.secs % 60 === 0) SFX.tick();
    if (STATE.secs === 120) { SFX.tick(); SFX.tick(); }
    renderTimer();
  }, 1000);
}
function spend(sec) {
  if (STATE.ended || STATE.sealed || !sec) return;
  STATE.secs = Math.max(0, STATE.secs - sec);
  renderTimer();
  const d = $("timerDelta");
  if (d) {
    d.textContent = "−" + sec + "s";
    d.classList.remove("show");
    void d.offsetWidth;
    d.classList.add("show");
  }
  if (STATE.secs === 0) { ending("J"); }
}

/* ---------- 立绘 / 说话 ---------- */
function setPortrait(id) {
  if (!id) {
    setSpeaking(false);
    portraitEl.classList.remove("in");
    setTimeout(() => { if (!portraitEl.classList.contains("in")) portraitEl.removeAttribute("src"); }, 300);
    return;
  }
  const a = AGENT_MAP[id];
  if (!a) return;
  const idx = AGENTS.findIndex((x) => x.id === id);
  if (idx >= 0 && RAIL.built && RAIL.index !== idx) railFocus(idx, false);
  const isDoubao = id === "豆包";
  portraitEl.classList.toggle("avatar", isDoubao);
  if (portraitEl.getAttribute("src") !== a.px) {
    portraitEl.classList.remove("in");
    portraitEl.setAttribute("src", a.px);
    requestAnimationFrame(() => requestAnimationFrame(() => portraitEl.classList.add("in")));
  } else {
    portraitEl.classList.add("in");
  }
  portraitEl.alt = id;
}
function setSpeaking(on) {
  portraitEl.classList.toggle("speaking", on);
  portraitWrap.classList.toggle("speaking", on);
  waveEl.classList.toggle("on", on);
}

/* ---------- 打字机 ---------- */
function typeText(str, who) {
  clearInterval(STATE.typing);
  STATE.typing = null;
  STATE.lineDone = false;
  textEl.textContent = "";
  const tn = document.createTextNode("");
  const caret = document.createElement("span");
  caret.className = "caret";
  textEl.appendChild(tn);
  textEl.appendChild(caret);
  const agent = who ? AGENT_MAP[who] : null;
  let i = 0;
  setSpeaking(!!who);
  const speed = str.length > 90 ? 16 : 21;
  STATE.typing = setInterval(() => {
    i += 1;
    tn.nodeValue = str.slice(0, i);
    if (i % 2 === 0) { if (agent) SFX.voice(agent); else SFX.typeTick(); }
    if (i >= str.length) {
      clearInterval(STATE.typing);
      STATE.typing = null;
      finishLine();
    }
  }, speed);
}
function finishLine() {
  clearInterval(STATE.typing);
  STATE.typing = null;
  STATE.lineDone = true;
  const s = STATE.scene;
  const ln = s && s.lines[STATE.lineIndex];
  if (ln) textEl.textContent = ln.text;
  const caret = textEl.querySelector(".caret");
  if (caret) caret.remove();
  // 说话动画持续到整行显示结束：该行是谁说的，立绘就继续动
  setSpeaking(!!(ln && ln.who));
  const last = !s || STATE.lineIndex >= s.lines.length - 1;
  if (last) {
    showChoices(s ? s.choices : null);
    if (STATE.auto && !STATE.ended) {
      clearTimeout(STATE.autoTimer);
      STATE.autoTimer = setTimeout(() => { if (STATE.auto) advance(); }, 1500);
    }
  } else if (s && s.autoNext && !STATE.ended) {
    clearTimeout(STATE.autoTimer);
    STATE.autoTimer = setTimeout(() => {
      if (!STATE.ended && STATE.started && !STATE.typing) advance();
    }, 2400);
  }
}

/* ---------- 场景 ---------- */
function showScene(scene) {
  closeOverlay();
  STATE.scene = scene;
  STATE.lineIndex = 0;
  STATE.lineDone = false;
  clearTimeout(STATE.autoTimer);
  if (scene.bg) bgEl.dataset.bg = scene.bg;
  const wall = document.querySelector(".wall");
  if (wall) wall.style.opacity = (scene.wall === false || scene.portrait) ? "0" : "1";
  if (scene.portrait !== undefined) setPortrait(scene.portrait);
  choicesEl.classList.remove("on");
  document.getElementById("stage").classList.remove("choosing");
  choicesEl.classList.toggle("grid", !!scene.grid);
  choicesEl.innerHTML = "";
  dialogue.classList.add("on");
  if (!scene.lines || scene.lines.length === 0) {
    textEl.textContent = "";
    finishLine();
    return;
  }
  const ln = scene.lines[0];
  renderLine(ln, scene.instant);
}

function renderLine(ln, instant) {
  if (ln.who) {
    nameEl.textContent = ln.who;
    nameEl.classList.remove("narrator");
    roleEl.textContent = (AGENT_MAP[ln.who] || {}).duty || "";
    setPortrait(ln.who);
  } else {
    nameEl.textContent = "记录";
    nameEl.classList.add("narrator");
    roleEl.textContent = "CASE LOG";
  }
  textEl.classList.toggle("narr", !ln.who);
  STATE.history.push({ who: ln.who || null, text: ln.text });
  if (instant) {
    textEl.textContent = ln.text;
    STATE.lineDone = true;
    setSpeaking(!!ln.who);
    const last = STATE.lineIndex >= STATE.scene.lines.length - 1;
    if (last) showChoices(STATE.scene.choices);
  } else {
    typeText(ln.text, ln.who);
  }
}

function advance() {
  if (!STATE.started || STATE.ended) return;
  clearTimeout(STATE.autoTimer);
  const s = STATE.scene;
  if (!s || !s.lines || !s.lines.length) return;
  if (STATE.typing) { finishLine(); return; }
  if (STATE.lineIndex < s.lines.length - 1) {
    STATE.lineIndex++;
    const ln = s.lines[STATE.lineIndex];
    SFX.lineCue();
    renderLine(ln, false);
  } else if (!choicesEl.classList.contains("on")) {
    showChoices(s.choices);
  }
}

function showChoices(list) {
  choicesEl.innerHTML = "";
  if (!list || !list.length) return;
  let n = 0;
  list.forEach((c, i) => {
    if (c.type === "header") {
      const h = document.createElement("div");
      h.className = "choice-title";
      h.textContent = c.label;
      choicesEl.appendChild(h);
      return;
    }
    n++;
    const b = document.createElement("button");
    b.className = "choice" + (c.locked ? " locked" : "") + (c.done ? " done" : "") + (c.end ? " end" : "");
    b.style.animationDelay = Math.min(i * 35, 280) + "ms";
    b.innerHTML = '<span class="idx">' + String(n).padStart(2, "0") + "</span>" +
      '<span class="lbl"></span>' +
      (c.badge ? '<span class="badge"></span>' : "") +
      (c.cost ? '<span class="cost">' + (c.cost > 0 ? "-" + c.cost + "s" : "") + "</span>" : "");
    b.querySelector(".lbl").textContent = c.label;
    if (c.badge) {
      const bd = b.querySelector(".badge");
      bd.textContent = c.badge.t;
      if (c.badge.c) bd.classList.add(c.badge.c);
    }
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      choose(c);
    });
    choicesEl.appendChild(b);
  });
  choicesEl.classList.add("on");
  document.getElementById("stage").classList.add("choosing");
  if (choicesEl.scrollHeight > choicesEl.clientHeight + 6) {
    const h = document.createElement("div");
    h.className = "scroll-hint";
    h.textContent = "↓ 滚动查看更多";
    choicesEl.appendChild(h);
    const sync = () => {
      const atEnd = choicesEl.scrollTop + choicesEl.clientHeight >= choicesEl.scrollHeight - 10;
      h.style.opacity = atEnd ? "0" : "1";
    };
    choicesEl.onscroll = sync;
    sync();
  }
}

function choose(c) {
  if (STATE.ended || !c || c.locked || c.done) return;
  SFX.tone(880, 0.04, "sine", 0.04);
  document.getElementById("stage").classList.remove("choosing");
  choicesEl.classList.remove("on");
  choicesEl.innerHTML = "";
  if (c.cost) { spend(c.cost); if (STATE.ended) return; }
  if (c.action) c.action();
  else if (c.to) c.to();
}

/* ---------- 序章 ---------- */
function showPrologue(i) {
  SFX.transition();
  const p = PROLOGUE[i];
  const choices = i === 0
    ? [
        { label: "先给我讲讲发生了什么（30 秒白话版）", action: showBrief },
        { label: "我熟悉这类事故，直接开始", action: () => showPrologue(1) }
      ]
    : [{
        label: i < PROLOGUE.length - 1 ? "继续" : "进入作战室",
        action: () => { i < PROLOGUE.length - 1 ? showPrologue(i + 1) : showHub(); }
      }];
  showScene({
    bg: p.bg,
    portrait: null,
    autoNext: true,
    lines: p.lines,
    choices
  });
}

/* ---------- 白话简报 ---------- */
function showBrief() {
  SFX.transition();
  showScene({
    bg: "room",
    portrait: null,
    autoNext: true,
    lines: BRIEF,
    choices: [{ label: "明白了，开始查", action: () => showPrologue(1) }]
  });
}

/* ---------- 术语表 ---------- */
function openGlossary() {
  panel.className = "panel glossary-panel";
  panel.innerHTML =
    '<div class="panel-head"><h3>术语表 · 不懂数据库也能玩</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="panel-body">' +
      '<div class="glossary-note">这个案子里只有 ' + GLOSSARY.length + ' 个词需要懂。每个词都配了一句人话和一句类比。</div>' +
      '<div class="glossary-grid">' +
      GLOSSARY.map((g, i) =>
        '<div class="gloss-card"><div class="g-idx">' + String(i + 1).padStart(2, "0") + "</div>" +
        '<div class="g-term">' + g.t + "</div>" +
        '<div class="g-plain">' + g.p + "</div>" +
        '<div class="g-analogy">≈ ' + g.a + "</div></div>"
      ).join("") +
      "</div>" +
      '<div class="glossary-foot">开局选过「白话简报」的话，这些内容你已经看过一遍了。</div>' +
    "</div>";
  overlay.classList.add("on");
  SFX.uiClick();
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
}

/* ---------- 标题页：白话简报 + 术语表 ---------- */
function openBriefPanel(fromTitle) {
  const lines = BRIEF.map((b) =>
    '<p class="brief-line">' + b.text.replace(/\n/g, "<br>") + "</p>").join("");
  panel.className = "panel brief-panel";
  panel.innerHTML =
    '<div class="panel-head"><h3>30 秒看懂这个案子</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="panel-body">' +
      '<div class="brief-intro">这个案子里只有 ' + GLOSSARY.length + ' 个词需要懂。先看人话版，再决定要不要玩。</div>' +
      '<div class="brief-body">' + lines + "</div>" +
      '<div class="brief-sub">术语表</div>' +
      '<div class="glossary-grid">' +
      GLOSSARY.map((g, i) =>
        '<div class="gloss-card"><div class="g-idx">' + String(i + 1).padStart(2, "0") + "</div>" +
        '<div class="g-term">' + g.t + "</div>" +
        '<div class="g-plain">' + g.p + "</div>" +
        '<div class="g-analogy">≈ ' + g.a + "</div></div>").join("") +
      "</div>" +
      '<div class="brief-credit">素材与授权：代码以 Apache-2.0 开源；9 张角色立绘为第三方同人二创素材，版权归原作者，不包含在 Apache-2.0 授权范围内，仅用于本演示。商用或再分发请替换为自有立绘。</div>' +
      '<div class="brief-actions">' +
        '<button class="btn primary" id="briefStart">知道了，开始查案</button>' +
        '<button class="btn" id="briefClose">先等等</button>' +
      "</div>" +
    "</div>";
  overlay.classList.add("on");
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelector("#briefClose").onclick = closeOverlay;
  panel.querySelector("#briefStart").onclick = () => {
    closeOverlay();
    setTimeout(() => startGame(), 120);
  };
}

/* ---------- 作战室 Hub ---------- */
function showHub() {
  SFX.returnHub();
  const n = STATE.clues.size;
  const doneInv = STATE.order.inv.filter((inv) => inv.clues.every((x) => STATE.clues.has(x))).length;
  const list = [{ type: "header", label: "调查现场 · " + doneInv + " / " + STATE.order.inv.length }];
  STATE.order.inv.forEach((inv) => {
    const done = inv.clues.every((x) => STATE.clues.has(x));
    list.push({ label: inv.title, cost: inv.cost, done, action: () => showInvestigation(inv) });
  });
  list.push({ type: "header", label: "询问 Agent · " + STATE.asked.size + " / " + AGENTS.length + " 已问" });
  STATE.order.agents.forEach((a) => {
    const asked = STATE.asked.has(a.id);
    list.push({ label: "询问 " + a.id + " · " + a.duty, cost: 18, done: asked, action: () => enterAgent(a.id) });
  });
  list.push({ type: "header", label: "结案" });
  if (n >= 6) {
    list.push({ label: "提交结案", end: true, action: showAccuse1 });
  } else {
    list.push({ label: "提交结案（至少 6 条线索，当前 " + n + " 条）", locked: true });
  }
  // 逃生阀：时间所剩无几时，允许不计时直接结案——问得多不该被拖时间拖死
  if (STATE.secs <= 120 && !STATE.sealed && n >= 6) {
    list.push({ type: "header", label: "时间不多了" });
    list.push({ label: "立即结案 · 不计时（保留现有线索）", end: true, action: sealCase });
  }
  const hint = n >= 6
    ? "线索够拼出一个故事了。但你只有一次指认的机会。"
    : "你站在作战室中央。九名 Agent 都在等你的下一个问题。";
  showScene({
    bg: "room",
    portrait: null,
    instant: true,
    grid: true,
    lines: [{ text: hint }],
    choices: list
  });
}

/* ---------- 调查 ---------- */
function showInvestigation(inv) {
  SFX.investigate();
  inv.clues.forEach((n) => collectClue(n, true));
  showScene({
    bg: inv.bg,
    portrait: null,
    lines: inv.lines,
    choices: [{ label: "返回作战室", action: showHub }]
  });
}
function collectClue(n, silent) {
  if (STATE.clues.has(n)) return;
  STATE.clues.add(n);
  clueCountEl.textContent = STATE.clues.size + " / " + CLUES.length;
  SFX.clue();
  if (!silent) toast("线索 " + String(n).padStart(2, "0") + " 已归档");
}

/* ---------- 询问 ---------- */
function enterAgent(id) {
  STATE.asked.add(id);
  const d = DIALOGUE[id];
  SFX.enterAgentSfx(AGENT_MAP[id]);
  showScene({ bg: "room", portrait: id, lines: d.intro, choices: agentMenu(id) });
}
function agentMenu(id) {
  const d = DIALOGUE[id];
  const asked = STATE.topics[id] || (STATE.topics[id] = new Set());
  const list = d.topics.map((t) => ({
    label: t.label, cost: 12, done: asked.has(t.id),
    action: () => askTopic(id, t)
  }));
  list.push({ label: "出示线索", action: () => openPresent(id) });
  list.push({ label: "结束询问，返回作战室", action: showHub });
  return list;
}
function askTopic(id, t) {
  if (!STATE.topics[id]) STATE.topics[id] = new Set();
  STATE.topics[id].add(t.id);
  showScene({
    bg: "room", portrait: id, lines: t.lines,
    choices: [{ label: "继续提问", action: () => agentMenuScene(id) }]
  });
}
function agentMenuScene(id) {
  showScene({
    bg: "room", portrait: id, instant: true,
    lines: [{ text: "（你把刚才的答案记在本子上。）" }],
    choices: agentMenu(id)
  });
}

function openPresent(id) {
  if (STATE.clues.size === 0) { toast("你还没有任何线索"); return; }
  const cards = shuffle([...STATE.clues]).map((n) => CLUE_MAP[n]);
  panel.innerHTML =
    '<div class="panel-head"><h3>向 ' + id + " 出示线索</h3><button class=\"x\" id=\"pClose\">×</button></div>" +
    '<div class="panel-body"><div class="clue-grid">' +
    cards.map((c) =>
      '<button class="clue-card" data-n="' + c.no + '"><span class="no">C-' + String(c.no).padStart(2, "0") +
      '</span><div class="t">' + c.label + '</div><div class="w">' + c.keyword + "</div></button>"
    ).join("") + "</div></div>";
  overlay.classList.add("on");
  SFX.paper();
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelectorAll(".clue-card").forEach((el) => {
    el.onclick = () => {
      const n = Number(el.dataset.n);
      closeOverlay();
      resolvePresent(id, n);
    };
  });
}

function resolvePresent(id, n) {
  const d = DIALOGUE[id];
  const ok = d.present.accept.includes(n);
  if (ok) {
    STATE.broken.add(id);
    SFX.sting();
    portraitEl.classList.add("shake");
    setTimeout(() => portraitEl.classList.remove("shake"), 500);
    toast("破绽！");
    const extra = BREAK_LINE[id];
    showScene({
      bg: "room", portrait: id,
      lines: d.present.good.concat([{ text: extra }]),
      choices: [{ label: "继续提问", action: () => agentMenuScene(id) }]
    });
  } else {
    SFX.thud();
    showScene({
      bg: "room", portrait: id,
      lines: d.present.bad,
      choices: [{ label: "继续提问", action: () => agentMenuScene(id) }]
    });
  }
}

/* ---------- 逃生阀：停止计时，直接进入结案 ---------- */
function sealCase() {
  if (STATE.sealed || STATE.ended) return;
  STATE.sealed = true;
  clearInterval(STATE.timerId);
  STATE.timerId = null;
  renderTimer();
  SFX.tone(523, 0.12, "sine", 0.05);
  SFX.tone(784, 0.2, "sine", 0.05, 0.12);
  toast("计时已停止 · 从容结案");
  showAccuse1();
}

/* ---------- 结案 ---------- */
function showAccuse1() {
  SFX.accuse();
  showScene({
    bg: "red", portrait: null, instant: true,
    lines: [{ text: "十秒后，你要说出一个名字。说错，今晚就白熬了。" }],
    choices: shuffle(AGENTS).map((a) => {
      const broken = STATE.broken.has(a.id);
      const asked = STATE.asked.has(a.id);
      const badge = broken
        ? { t: "破绽 ×1", c: "b-broken" }
        : asked
          ? { t: "已询问 ✓", c: "b-asked" }
          : { t: "未询问", c: "b-none" };
      return {
        label: "指认 " + a.id + " · " + a.duty, badge,
        action: () => { STATE.accused = a.id; showAccuse2(); }
      };
    }).concat([{ label: "再想想，返回作战室", action: showHub }])
  });
}

function showAccuse2() {
  showScene({
    bg: "red", portrait: STATE.accused, instant: true,
    lines: [{ text: "你指认了 " + STATE.accused + "。现在，说出你的结案判断。" }],
    choices: STATE.order.statements.map((s) => ({
      label: s.text,
      action: () => { STATE.accusation = s.id; openSupport(); }
    })).concat([{ label: "重新选择嫌疑人", action: showAccuse1 }])
  });
}

function openSupport() {
  STATE.supports = [];
  const clues = shuffle([...STATE.clues]).map((n) => CLUE_MAP[n]);
  supportGrid.innerHTML = clues.map((c) =>
    '<button class="support-card' + (c.weight >= 2 ? " key" : "") + '" data-n="' + c.no + '"><span class="no">C-' + String(c.no).padStart(2, "0") +
    "</span>" + c.label + (c.weight >= 2 ? '<i class="key-dot"></i>' : "") + "</button>"
  ).join("");
  supportCount.textContent = "0";
  supportConfirm.disabled = true;
  supportGrid.querySelectorAll(".support-card").forEach((el) => {
    el.onclick = () => {
      const n = Number(el.dataset.n);
      const idx = STATE.supports.indexOf(n);
      if (idx >= 0) { STATE.supports.splice(idx, 1); el.classList.remove("sel"); }
      else {
        if (STATE.supports.length >= 3) { toast("最多选 3 条"); return; }
        STATE.supports.push(n); el.classList.add("sel");
        SFX.tone(660, 0.05, "sine", 0.03);
      }
      supportCount.textContent = STATE.supports.length;
      supportConfirm.disabled = STATE.supports.length !== 3;
    };
  });
  supportOverlay.classList.add("on");
  SFX.select();
}

/* ---------- 结局判定 ---------- */
function computeEnding() {
  const who = STATE.accused, acc = STATE.accusation;
  if (who !== KILLER) {
    if (who === "DeepSeek") return "C";
    if (who === "Claude") return "D";
    if (who === "Gemini") return "E";
    if (who === "Grok") return "F";
    if (who === "GPT") return "G";
    if (who === "GLM") return "L";
    return "H";
  }
  if (acc === "malice") return "B";
  if (acc === "order") return "K";
  if (acc === "system") return "I";
  const keyHits = STATE.supports.filter((n) => CLUE_MAP[n] && CLUE_MAP[n].weight >= 2).length;
  if (STATE.clues.size >= 10 && keyHits >= 2) return "S";
  return "A";
}

function ending(id) {
  if (STATE.ended) return;
  STATE.ended = true;
  STATE.ending = id;
  unlockEnding(id);
  clearInterval(STATE.timerId);
  clearInterval(STATE.typing);
  STATE.typing = null;
  SFX.stopTension();
  clearTimeout(STATE.autoTimer);
  setSpeaking(false);
  const e = ENDINGS[id];
  if (e.family === "good") SFX.endingGood();
  else if (e.family === "bad") SFX.endingBad();
  supportOverlay.classList.remove("on");
  closeOverlay();
  bgEl.dataset.bg = e.scene;
  if (e.portrait) setPortrait(e.portrait);
  topbar.classList.remove("on");
  dialogue.classList.remove("on");
  choicesEl.classList.remove("on");
  choicesEl.innerHTML = "";
  setTimeout(() => showReport(id), 260);
}

/* ---------- 报告 ---------- */
function reportTimeline() {
  const items = [...STATE.clues].map((n) => CLUE_MAP[n]).sort((a, b) => {
    const ka = CLUE_TIME[a.no].includes("-") ? "0" + CLUE_TIME[a.no] : "1" + CLUE_TIME[a.no];
    const kb = CLUE_TIME[b.no].includes("-") ? "0" + CLUE_TIME[b.no] : "1" + CLUE_TIME[b.no];
    return ka.localeCompare(kb);
  });
  return items.map((c) =>
    '<div class="tl-item"><div class="tm">' + CLUE_TIME[c.no] + "</div><div>[" + String(c.no).padStart(2, "0") + "] " + c.label + "</div></div>"
  ).join("") || '<div class="tl-item"><div class="tm">--:--</div><div>没有任何线索被归档。</div></div>';
}

const ROOT_CAUSE = {
  S: "门牌把 12 间档案室误贴成「练习室」；工单把「练习资料」写成清空档案库并自批自过；工作手册第 4 步三个月无人核对；复印件被停、钥匙被配给客服、风险被放行；换班规则专挑便宜的接手。五条错误链子叠加，最后由豆包按下清空键。",
  A: "同一条错误链路成立，但你的证据链不完整，无法证明豆包是被误导而非蓄意。",
  B: "你认定豆包故意清空。报告采用了你的判断，动机部分被写成了「恶意操作」。",
  K: "你认定有人指使她。但记录里没有第二个人的指纹。",
  I: "你把事故归因为系统故障，没有提交责任人。事故被挂起。",
  J: "超时。系统自动生成报告：直接原因——临时工（已离职），数据安全可控。"
};

function showReport(id) {
  SFX.reportOpen();
  const e = ENDINGS[id];
  setPortrait(null);
  const used = 1024 - STATE.secs;
  const rows = responsibility(e.culprit, true);
  const culprits = e.culprit ? e.culprit.split("|") : [];
  const truth = (id === "S" || id === "A")
    ? '<div class="truth-box"><div class="k">真相</div><p>豆包不是恶意的。她只是用户喊「订单不见了」时，照着工单、手册和门牌，做了一件她以为被授权的事。真正按下清空的，是她；真正把她推上去的，是整条链子。</p><p class="quote">' + AGENTS.length + ' 个 Agent 都有罪。但只有一个人按下了清空键。</p></div>'
    : "";
  panel.className = "panel report";
  panel.innerHTML =
    '<div class="report-top">' +
      '<div class="grade">' + e.grade + "</div>" +
      "<div><h2 class=\"report-title\">" + e.title + "</h2><div class=\"report-sub\">" + e.sub + "</div></div>" +
    "</div>" +
    '<div class="truth-cta">' +
      '<div><div class="k">TRUTH UNLOCKED</div><p>你已通关本局。完整真相档案已解锁，包含事故全时间线、' + AGENTS.length + ' 个人的真假话与关键证据链。</p></div>' +
      '<button class="btn primary" id="btnTruth">打开真相档案 →</button>' +
    "</div>" +
    '<div class="report-meta">' +
      "<span>结案等级 <b>" + e.grade + "</b></span>" +
      "<span>指认 <b>" + (e.culprit ? e.culprit.replace("|", " / ") : "无") + "</b></span>" +
      "<span>用时 <b>" + fmt(used) + "</b></span>" +
      "<span>支撑线索 <b>" + STATE.supports.length + " / 3</b></span>" +
      "<span>已归档 <b>" + STATE.clues.size + " / " + CLUES.length + "</b></span>" +
      "<span>破绽 <b>" + STATE.broken.size + " / " + AGENTS.length + "</b></span>" +
      "<span>作弊 <b>" + STATE.cheats + " 次</b></span>" +
      "<span>已解锁结局 <b>" + unlockedEndings().size + " / " + Object.keys(ENDINGS).length + "</b></span>" +
    "</div>" +
    '<div class="report-grid">' +
      '<div class="report-sec"><h4>事故时间线</h4><div class="timeline">' + reportTimeline() + "</div></div>" +
      '<div class="report-sec"><h4>根因判断</h4><p class="root-text">' + (ROOT_CAUSE[id] || e.sub) + "</p>" +
        '<h4 style="margin-top:22px">责任分布</h4><table class="resp-table">' +
        rows.map((r) => '<tr class="' + (culprits.includes(r[0]) ? "culprit" : "") + '"><td>' + r[0] + "</td><td>" + r[1] + "</td></tr>").join("") +
        "</table></div>" +
    "</div>" + truth +
    '<div class="report-actions">' +
      '<button class="btn primary" id="btnCard">保存结案卡</button>' +
      '<button class="btn" id="btnCopy">复制结案文案</button>' +
      '<button class="btn" id="btnTruth2">真相档案</button>' +
      '<button class="btn" id="btnAgain">重新开一夜</button>' +
    "</div>";
  overlay.classList.add("on");
  panel.scrollTop = 0;
  panel.querySelector("#btnCard").onclick = makeCard;
  panel.querySelector("#btnCopy").onclick = copyText;
  panel.querySelector("#btnTruth").onclick = () => openTruth();
  panel.querySelector("#btnTruth2").onclick = () => openTruth();
  panel.querySelector("#btnAgain").onclick = restartGame;
}

function copyText() {
  const e = ENDINGS[STATE.ending];
  const t = "【P0 事故剧本杀 · 谁动了档案库】\n" +
    "结案评级：" + e.grade + "\n" +
    "指认：" + (e.culprit ? e.culprit.replace("|", " / ") : "无") + "\n" +
    "用时：" + fmt(1024 - STATE.secs) + " / 线索 " + STATE.clues.size + "/" + CLUES.length + "\n" +
    "结论：" + e.sub + "\n" +
    "#1024Builder #TRAE";
  const box = document.createElement("div");
  box.className = "overlay on";
  box.innerHTML = '<div class="panel copy-panel"><div class="panel-head"><h3>结案文案</h3>' +
    '<button class="x" id="copyClose">×</button></div><div class="panel-body">' +
    '<p class="copy-hint">长按下方文本，选择需要的部分复制。</p>' +
    '<textarea class="copy-text" readonly></textarea></div></div>';
  document.getElementById("stage").appendChild(box);
  box.querySelector(".copy-text").value = t;
  const close = function () { if (box.parentNode) box.parentNode.removeChild(box); };
  box.querySelector("#copyClose").onclick = close;
  box.addEventListener("click", function (ev) { if (ev.target === box) close(); });
  SFX.uiClick();
  toast("已展开结案文案");
}

function saveCardImage(dataUrl) {
  var mt = window.xhs && window.xhs.miniTool;
  if (!mt || typeof mt.writeTempFile !== "function" || typeof mt.saveImageToPhotosAlbum !== "function") {
    toast("当前环境不支持保存，请截图保存");
    return;
  }
  try {
    var pending = mt.writeTempFile({ data: dataUrl });
    if (!pending || typeof pending.then !== "function") {
      toast("保存失败，请截图保存");
      return;
    }
    pending.then(function (res) {
      return mt.saveImageToPhotosAlbum({ filePath: res.filePath });
    }).then(function () {
      toast("结案卡已保存到相册");
    }, function (err) {
      console.warn("保存结案卡失败", err);
      toast("保存失败，请截图保存");
    });
  } catch (e) {
    console.warn("保存结案卡失败", e);
    toast("保存失败，请截图保存");
  }
}

/* ---------- Canvas 结案卡 ---------- */
function wrapText(ctx, text, x, y, maxW, lh) {
  let line = "", yy = y;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, yy);
      line = ch; yy += lh;
    } else line += ch;
  }
  if (line) { ctx.fillText(line, x, yy); yy += lh; }
  return yy;
}

function makeCard() {
  const e = ENDINGS[STATE.ending];
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  window.__lastCard = c;
  const x = c.getContext("2d");
  x.fillStyle = "#08090b"; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(255,255,255,.05)"; x.lineWidth = 1;
  for (let i = 0; i < W; i += 72) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i < H; i += 72) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  x.fillStyle = "#ff4b2f"; x.fillRect(0, 0, W, 8);
  x.fillStyle = "#7d828a"; x.font = '500 22px "Consolas", monospace';
  x.fillText("P0 事故剧本杀 / CASE P0-1024", 72, 86);
  x.fillStyle = "#ff4b2f"; x.font = '600 20px "Consolas", monospace';
  x.fillText("CLOSED  " + fmt(1024 - STATE.secs), 72, 124);

  // 评级
  x.strokeStyle = "#ff4b2f"; x.lineWidth = 3;
  x.beginPath(); x.arc(940, 118, 58, 0, Math.PI * 2); x.stroke();
  x.fillStyle = "#ff4b2f"; x.font = '400 58px "Microsoft YaHei"';
  x.textAlign = "center"; x.fillText(e.grade, 940, 138); x.textAlign = "left";

  // 标题
  x.fillStyle = "#f2eee6"; x.font = '600 58px "Microsoft YaHei"';
  const afterTitle = wrapText(x, e.title, 72, 250, 610, 78);
  x.fillStyle = "#a3a7ae"; x.font = '400 25px "Microsoft YaHei"';
  wrapText(x, e.sub, 72, afterTitle + 26, 610, 42);

  // 立绘
  const img = new Image();
  const paintRest = () => {
    const bottom = 1240;
    // 金句
    x.fillStyle = "#ff4b2f"; x.font = '500 22px "Consolas", monospace';
    x.fillText("VERDICT", 72, bottom - 150);
    x.fillStyle = "#e8e4dc"; x.font = '400 30px "Microsoft YaHei"';
    wrapText(x, AGENTS.length + " 个 Agent 都有罪。但只有一个人按下了清空键。", 72, bottom - 104, 936, 44);
    // 页脚
    x.fillStyle = "#5a5f67"; x.font = '400 20px "Consolas", monospace';
    x.fillText("1024 BUILDER · 谁动了档案库", 72, bottom);
    x.textAlign = "right";
    x.fillText("线索 " + STATE.clues.size + "/" + CLUES.length + "  ·  破绽 " + STATE.broken.size + "/" + AGENTS.length, 1008, bottom);
    x.textAlign = "left";
    saveCardImage(c.toDataURL("image/png"));
    SFX.cardDone();
  };
  if (e.portrait) {
    img.onload = () => {
      const isAvatar = e.portrait === "豆包";
      const maxH = isAvatar ? 520 : 760, maxW = isAvatar ? 520 : 420;
      let iw = img.width, ih = img.height;
      const sc = Math.min(maxW / iw, maxH / ih);
      iw *= sc; ih *= sc;
      const ix = 1008 - iw, iy = 1120 - ih;
      x.save();
      if (isAvatar) {
        x.beginPath();
        x.arc(ix + iw / 2, iy + ih / 2, iw / 2, 0, Math.PI * 2);
        x.clip();
        x.globalAlpha = 0.96;
        x.drawImage(img, ix, iy, iw, ih);
        x.globalAlpha = 1;
        x.restore();
        x.strokeStyle = "rgba(255,255,255,.16)"; x.lineWidth = 2;
        x.beginPath(); x.arc(ix + iw / 2, iy + ih / 2, iw / 2, 0, Math.PI * 2); x.stroke();
      } else {
        x.globalAlpha = 0.94;
        x.drawImage(img, ix, iy, iw, ih);
        x.globalAlpha = 1;
        x.restore();
        const g = x.createLinearGradient(0, iy + ih * 0.55, 0, iy + ih);
        g.addColorStop(0, "rgba(8,9,11,0)");
        g.addColorStop(1, "rgba(8,9,11,1)");
        x.fillStyle = g; x.fillRect(ix - 10, iy + ih * 0.55, iw + 20, ih * 0.45);
      }
      paintRest();
    };
    img.onerror = paintRest;
    img.src = AGENT_MAP[e.portrait].px;
  } else {
    paintRest();
  }
}

/* ---------- 结局解锁 / 真相档案 ---------- */
const UNLOCK_KEY = "p0_endings_v1";
function readUnlockList() {
  var raw = null;
  try { raw = localStorage.getItem(UNLOCK_KEY); } catch (e) {}
  var arr = [];
  try { arr = JSON.parse(raw || "[]"); } catch (e) { arr = []; }
  return Array.isArray(arr) ? arr : [];
}
function unlockedEndings() { return new Set(readUnlockList()); }
function writeUnlockList(arr) {
  var json = JSON.stringify(arr);
  try { localStorage.setItem(UNLOCK_KEY, json); } catch (e) {}
  var mt = window.xhs && window.xhs.miniTool;
  if (mt && typeof mt.setStorage === "function") {
    try {
      var pending = mt.setStorage({ key: UNLOCK_KEY, data: json });
      if (pending && typeof pending.then === "function") pending.then(function () {}, function () {});
    } catch (e) {}
  }
}
function unlockEnding(id) {
  var s = unlockedEndings();
  s.add(id);
  writeUnlockList(Array.from(s));
}
function hydrateEndings() {
  var mt = window.xhs && window.xhs.miniTool;
  if (!mt || typeof mt.getStorage !== "function") return;
  var pending;
  try { pending = mt.getStorage({ key: UNLOCK_KEY }); } catch (e) { return; }
  if (!pending || typeof pending.then !== "function") return;
  pending.then(function (res) {
    var arr = [];
    try { arr = JSON.parse((res && res.data) || "[]"); } catch (e) { return; }
    if (!Array.isArray(arr) || !arr.length) return;
    var merged = new Set(readUnlockList());
    var before = merged.size;
    for (var i = 0; i < arr.length; i++) merged.add(arr[i]);
    if (merged.size !== before) {
      writeUnlockList(Array.from(merged));
      renderTitleUnlock();
    }
  }, function () {});
}
function renderTitleUnlock() {
  const el = $("titleUnlock");
  if (!el) return;
  const s = unlockedEndings();
  const total = Object.keys(ENDINGS).length;
  if (!s.size) {
    el.innerHTML = '<span class="tu-hint">通关任意结局后，解锁完整真相档案</span>';
    return;
  }
  el.innerHTML = '<span class="tu-count">已解锁结局 <b>' + s.size + "</b> / " + total + "</span>" +
    '<button class="tu-btn" id="tuTruth">查看真相档案 →</button>';
  $("tuTruth").onclick = () => openTruth();
}

/* ---------- 作弊：看某个 Agent 的真相 ---------- */
function openCheat() {
  const cards = AGENTS.map((a) => {
    const asked = STATE.asked.has(a.id);
    const broken = STATE.broken.has(a.id);
    return '<button class="cheat-card" data-id="' + a.id + '">' +
      '<img class="cheat-face' + (a.id === "豆包" ? " round" : "") + '" src="' + a.px + '" alt="">' +
      "<div><div class=\"cheat-name\">" + a.id + "</div>" +
      '<div class="cheat-duty">' + a.duty + "</div>" +
      '<div class="cheat-state">' + (broken ? "已出破绽" : asked ? "已询问" : "尚未询问") + "</div></div>" +
      "</button>";
  }).join("");
  panel.className = "panel cheat-panel";
  panel.innerHTML =
    '<div class="panel-head"><h3>作弊模式 · 你希望获取谁的真相？</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="panel-body">' +
      '<div class="cheat-note">Agent 说的话有真有假。选一个人，我告诉你——他哪句是真的、哪句是假的、哪句没说出口。</div>' +
      '<div class="cheat-grid">' + cards + "</div>" +
      '<div class="cheat-foot">作弊不会改变结案评级，但会在复盘报告里留下次数记录。</div>' +
    "</div>";
  overlay.classList.add("on");
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelectorAll(".cheat-card").forEach((el) => {
    el.onclick = () => renderCheatAgent(el.dataset.id);
  });
}

function renderCheatAgent(id) {
  const a = AGENT_MAP[id];
  const t = AGENT_TRUTH[id];
  STATE.cheats++;
  SFX.sting();
  const block = (cls, title, arr) =>
    '<div class="tv-block ' + cls + '"><div class="tv-k">' + title + "</div>" +
    (arr.length ? "<ul>" + arr.map((x) => "<li>" + x + "</li>").join("") + "</ul>"
      : '<p class="tv-none">——（没有）</p>') + "</div>";
  panel.innerHTML =
    '<div class="panel-head"><h3>' + id + " · 真相</h3><button class=\"x\" id=\"pClose\">×</button></div>" +
    '<div class="panel-body cheat-detail">' +
      '<div class="tv-head">' +
        '<img class="cheat-face' + (id === "豆包" ? " round" : "") + '" src="' + a.px + '" alt="">' +
        '<div><div class="cheat-name">' + id + '</div><div class="cheat-duty">' + a.duty + "</div>" +
        '<div class="tv-verdict">' + t.verdict + "</div></div>" +
      "</div>" +
      block("ok", "他说的是真的", t.truth) +
      block("bad", "他说了假话", t.lie) +
      block("hidden", "他没说出口的", t.hidden) +
      '<div class="cheat-foot"><button class="btn" id="cheatBack">← 看其他人</button></div>' +
    "</div>";
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelector("#cheatBack").onclick = openCheat;
}

/* ---------- 真相档案 ---------- */
function openTruth() {
  const un = unlockedEndings();
  if (!un.size) { toast("通关任意结局后解锁真相档案"); return; }
  const total = Object.keys(ENDINGS).length;
  const timeline = TRUTH_TIMELINE.map(([t, d]) =>
    '<div class="tl-item"><div class="tm">' + t + "</div><div>" + d + "</div></div>").join("");
  const endings = Object.keys(ENDINGS).map((k) => {
    const e = ENDINGS[k];
    const got = un.has(k);
    return '<div class="en-row' + (got ? " got" : "") + '"><span class="en-g">' + (got ? e.grade : "?") +
      '</span><span class="en-t">' + (got ? e.title : "未解锁") + "</span></div>";
  }).join("");
  const agents = AGENTS.map((a) =>
    '<button class="truth-agent" data-id="' + a.id + '">' + a.id + "<span>" + AGENT_TRUTH[a.id].verdict.slice(0, 16) + "…</span></button>"
  ).join("");
  panel.className = "panel report";
  panel.innerHTML =
    '<div class="panel-head"><h3>真相档案 · P0-1024</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="report-top">' +
      '<div class="grade grade-truth">TRUTH</div>' +
      '<div><h2 class="report-title">' + AGENTS.length + '人共犯，一人清空</h2>' +
      '<div class="report-sub">这不是一个人的事故，是一条链子的塌方。下方还有' + AGENTS.length + '个人的真假话，可以直接点开。</div></div>' +
    "</div>" +
    '<div class="report-grid">' +
      '<div class="report-sec"><h4>完整时间线</h4><div class="timeline">' + timeline + "</div></div>" +
      '<div class="report-sec"><h4>根因</h4><p class="root-text">' + TRUTH_ROOT + "</p>" +
        '<h4 style="margin-top:22px">结局图鉴 ' + un.size + " / " + total + "</h4>" +
        '<div class="en-list">' + endings + "</div></div>" +
    "</div>" +
    '<div class="report-sec"><h4>' + AGENTS.length + '个人的真假话（点开看）</h4><div class="truth-agents">' + agents + "</div></div>" +
    '<div class="report-actions"><button class="btn" id="truthClose">返回</button></div>';
  overlay.classList.add("on");
  SFX.reveal();
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelector("#truthClose").onclick = closeOverlay;
  panel.querySelectorAll(".truth-agent").forEach((el) => {
    el.onclick = () => renderCheatAgent(el.dataset.id);
  });
}

/* ---------- 覆盖层 ---------- */
function closeOverlay() {
  SFX.closePanel();
  overlay.classList.remove("on");
  supportOverlay.classList.remove("on");
}
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1900);
}

/* ---------- 抽屉 ---------- */
function openClues() {
  const cards = CLUES.map((c) => {
    const has = STATE.clues.has(c.no);
    return '<button class="clue-card' + (has ? "" : " locked") + '" data-n="' + c.no + '">' +
      '<span class="no">C-' + String(c.no).padStart(2, "0") + "</span>" +
      '<div class="t">' + (has ? c.label : "未归档") + "</div>" +
      '<div class="w">' + (has ? (CLUE_TIME[c.no] + " · " + c.loc) : "???") + "</div></button>";
  }).join("");
  panel.className = "panel";
  panel.innerHTML =
    '<div class="panel-head"><h3>线索档案 · ' + STATE.clues.size + " / " + CLUES.length +
    '</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="panel-body"><div class="clue-grid">' + cards + "</div></div>";
  overlay.classList.add("on");
  SFX.archiveOpen();
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelectorAll(".clue-card:not(.locked)").forEach((el) => {
    el.onclick = () => showClueDetail(Number(el.dataset.n));
  });
}
function showClueDetail(n) {
  const c = CLUE_MAP[n];
  const body = c.a.replace(/一键清空[^\n]*/g, '<span class="hl">$&</span>');
  panel.innerHTML =
    '<div class="panel-head"><h3>线索 C-' + String(n).padStart(2, "0") + '</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="panel-body clue-detail"><h4>' + c.label + "</h4>" +
    '<div class="sub">' + CLUE_TIME[n] + " · " + c.loc + "</div>" +
    '<div class="artifact">' + body + "</div>" +
    '<div class="clue-note">' + c.note + "</div>" +
    '<div class="clue-note" style="border-color:#ff4b2f;color:#ffb3a4">关键词：' + c.keyword + "</div></div>";
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = openClues;
}

function openLog() {
  const items = STATE.history.map((h) =>
    '<div class="history-item' + (h.who ? "" : " narr") + '"><div class="who">' +
    (h.who || "记录") + '</div><div class="txt">' + h.text.replace(/\n/g, "<br>") + "</div></div>"
  ).join("");
  panel.className = "panel";
  panel.innerHTML =
    '<div class="panel-head"><h3>对话记录</h3><button class="x" id="pClose">×</button></div>' +
    '<div class="panel-body"><div class="history-list">' + (items || "暂无") + "</div></div>";
  overlay.classList.add("on");
  SFX.uiClick();
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelector(".panel-body").scrollTop = 99999;
}

/* ---------- 启动 / 事件 ---------- */
/* ---------- 无刷新重开：重置 STATE 回序章，保留 localStorage 结局图鉴 ---------- */
function restartGame() {
  // 清理所有定时器，防止旧局的计时/打字/自动推进泄漏到新局
  clearInterval(STATE.timerId);
  clearInterval(STATE.typing);
  clearTimeout(STATE.autoTimer);
  SFX.stopTension();
  // 重置状态（localStorage 由 unlockEndings 自行管理，此处不触碰）
  STATE.started = false; STATE.ended = false; STATE.ending = null;
  STATE.secs = 1024; STATE.scene = null; STATE.lineIndex = 0;
  STATE.typing = null; STATE.lineDone = false;
  STATE.clues = new Set(); STATE.asked = new Set(); STATE.broken = new Set(); STATE.topics = {};
  STATE.accused = null; STATE.accusation = null; STATE.supports = [];
  STATE.auto = false; STATE.cheats = 0;
  STATE.sealed = false; STATE.warned60 = false;
  STATE.history = [];
  STATE.order = { inv: [], agents: [], statements: [] };
  // UI 复位
  closeOverlay();
  supportOverlay.classList.remove("on");
  setSpeaking(false);
  portraitEl.classList.remove("in", "speaking", "avatar");
  portraitEl.removeAttribute("src");
  choicesEl.classList.remove("on");
  choicesEl.innerHTML = "";
  document.getElementById("stage").classList.remove("choosing");
  const sw = $("sysWarn"); if (sw) sw.classList.remove("on");
  timerEl.classList.remove("sealed", "critical", "danger");
  tbar.classList.remove("danger");
  $("btnAuto").textContent = "自动 OFF";
  $("btnAuto").classList.remove("active");
  $("hintAuto").classList.remove("on");
  clueCountEl.textContent = "0 / " + CLUES.length;
  // 重开不进标题页，直接回到序章第一幕
  startGame();
}

function startGame() {
  if (STATE.started) return;
  STATE.started = true;
  // 先渲染画面，再初始化音频：音频失败也不能让游戏空白
  STATE.order.inv = shuffle(INVESTIGATIONS);
  STATE.order.agents = shuffle(AGENTS);
  STATE.order.statements = shuffle(ACCUSATIONS);
  $("title").classList.add("gone");
  topbar.classList.add("on");
  dialogue.classList.add("on");
  clueCountEl.textContent = "0 / " + CLUES.length;
  startTimer();
  showPrologue(0);
  try {
    SFX.init();
    SFX.resume();
    SFX.noise(0.35, 0.05, 600, 0.8);
    SFX.tone(196, 0.5, "sine", 0.04, 98);
  } catch (e) {
    console.warn("音频初始化失败，游戏继续", e);
  }
}

$("btnStart").addEventListener("click", startGame);
$("btnTitleHelp").addEventListener("click", () => openBriefPanel(true));
dialogue.addEventListener("click", advance);
choicesEl.addEventListener("click", (e) => e.stopPropagation());

$("btnClues").onclick = openClues;
$("btnCheat").onclick = openCheat;
$("btnGlossary").onclick = openGlossary;
$("btnLog").onclick = openLog;
$("btnSound").onclick = () => {
  STATE.muted = !STATE.muted;
  SFX.setMuted(STATE.muted);
  $("btnSound").textContent = "声音 " + (STATE.muted ? "OFF" : "ON");
  $("btnSound").classList.toggle("off", STATE.muted);
  if (!STATE.muted) { SFX.init(); SFX.resume(); SFX.tone(880, 0.05, "sine", 0.04); }
};
$("btnAuto").onclick = () => {
  STATE.auto = !STATE.auto;
  $("btnAuto").textContent = "自动 " + (STATE.auto ? "ON" : "OFF");
  $("btnAuto").classList.toggle("active", STATE.auto);
  $("hintAuto").classList.toggle("on", STATE.auto);
  if (STATE.auto) SFX.tone(660, 0.05, "sine", 0.03);
};

/* ---------- 音频解锁：首个用户手势（点击/按键）即解锁 AudioContext ---------- */
/* 绕过浏览器自动播放策略——否则经 setTimeout/异步路径启动游戏时，
   音频上下文会一直停留在 suspended，整局没有任何声音。 */
function unlockAudio() {
  SFX.init();
  SFX.resume();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
supportOverlay.addEventListener("click", (e) => { if (e.target === supportOverlay) supportOverlay.classList.remove("on"); });
$("supportClose").onclick = () => supportOverlay.classList.remove("on");
supportConfirm.onclick = () => {
  if (STATE.supports.length !== 3) return;
  supportOverlay.classList.remove("on");
  ending(computeEnding());
};

document.addEventListener("keydown", (e) => {
  if (!STATE.started) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startGame(); }
    return;
  }
  if (e.key === "Escape") { closeOverlay(); supportOverlay.classList.remove("on"); return; }
  if (overlay.classList.contains("on") || supportOverlay.classList.contains("on")) return;
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); advance(); return; }
  const n = Number(e.key);
  if (n >= 1 && n <= 9) {
    const btns = choicesEl.querySelectorAll(".choice:not(.locked):not(.done)");
    if (btns[n - 1]) btns[n - 1].click();
  }
});

/* ---------- 封面右侧 Agent 轮播 ---------- */
const COVER = { i: 0, timer: null, paused: false };
function coverShow(i, user) {
  const img = $("coverPortrait");
  if (!img) return;
  COVER.i = i;
  const a = AGENTS[i];
  const isAvatar = a.id === "豆包";
  img.classList.remove("in");
  img.classList.toggle("round", isAvatar);
  img.src = a.px;
  void img.offsetWidth;      // 强制回流，确保过渡生效
  img.classList.add("in");
  $("coverName").textContent = a.id;
  $("coverDuty").textContent = a.duty;
  $("coverIdx").textContent = String(i + 1).padStart(2, "0") + " / " + String(AGENTS.length).padStart(2, "0");
  document.querySelectorAll(".cover-thumb").forEach((el, k) => el.classList.toggle("on", k === i));
  if (user) SFX.tone(760, 0.04, "sine", 0.02);
}
function initCover() {
  const thumbs = $("coverThumbs");
  if (!thumbs) return;
  thumbs.innerHTML = AGENTS.map((a, i) =>
    '<button class="cover-thumb" data-i="' + i + '" aria-label="' + a.id + '"><img src="' + a.px + '" alt=""></button>'
  ).join("");
  thumbs.querySelectorAll(".cover-thumb").forEach((el) => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      coverShow(Number(el.dataset.i), true);
    };
  });
  coverShow(0, false);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  COVER.timer = setInterval(() => {
    if (COVER.paused || document.hidden || STATE.started) return;
    coverShow((COVER.i + 1) % AGENTS.length, false);
  }, 2800);
  const box = $("coverAgent");
  if (box) {
    box.addEventListener("mouseenter", () => { COVER.paused = true; });
    box.addEventListener("mouseleave", () => { COVER.paused = false; });
  }
}

/* ---------- 右侧 Agent 轮播 ---------- */
const RAIL = { index: 0, timer: null, paused: false, built: false };
function buildRail() {
  const track = $("railTrack");
  const dots = $("railDots");
  if (!track) return;
  track.innerHTML = AGENTS.map((a, i) =>
    '<button class="rail-thumb" data-i="' + i + '" data-id="' + a.id + '">' +
    '<img src="' + a.px + '" alt="' + a.id + '">' +
    '<span class="rail-idx">' + String(i + 1).padStart(2, "0") + "</span></button>"
  ).join("");
  dots.innerHTML = AGENTS.map((a, i) => '<i data-i="' + i + '"></i>').join("");
  track.querySelectorAll(".rail-thumb").forEach((el) => {
    el.onclick = () => {
      railFocus(Number(el.dataset.i), true);
      restartRail(true);
    };
  });
  RAIL.built = true;
  railFocus(0, false);
}
function railFocus(i, fromUser) {
  if (!RAIL.built) return;
  const track = $("railTrack");
  const thumbs = track.querySelectorAll(".rail-thumb");
  RAIL.index = ((i % AGENTS.length) + AGENTS.length) % AGENTS.length;
  thumbs.forEach((el, k) => el.classList.toggle("on", k === RAIL.index));
  $("railDots").querySelectorAll("i").forEach((d, k) => d.classList.toggle("on", k === RAIL.index));
  const step = 84;      // 缩略图高度 + 间距
  const winH = $("railTrack").parentElement.clientHeight || 336;
  const max = Math.max(0, thumbs.length * step - winH);
  let y = RAIL.index * step - (winH - 74) / 2;
  y = Math.max(0, Math.min(max, y));
  track.style.transform = "translateY(" + (-y) + "px)";
  const a = AGENTS[RAIL.index];
  $("railName").textContent = a.id;
  $("railDuty").textContent = a.duty;
  if (fromUser) SFX.tone(760, 0.04, "sine", 0.025);
}
function restartRail(immediate) {
  clearInterval(RAIL.timer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  RAIL.timer = setInterval(() => {
    if (RAIL.paused || document.hidden) return;
    railFocus(RAIL.index + 1, false);
  }, immediate ? 2400 : 3400);
}
function initRail() {
  buildRail();
  restartRail(false);
  const rail = $("agentRail");
  if (!rail) return;
  rail.addEventListener("mouseenter", () => { RAIL.paused = true; });
  rail.addEventListener("mouseleave", () => { RAIL.paused = false; });
}

renderTimer();
renderTitleUnlock();
initCover();
initRail();
hydrateEndings();
