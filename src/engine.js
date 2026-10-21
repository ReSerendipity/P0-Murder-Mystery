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
const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
const CLUE_MAP = Object.fromEntries(CLUES.map((c) => [c.no, c]));

/* ---------- 音效（全部代码合成） ---------- */
const SFX = {
  ctx: null, master: null, muted: false, ambient: null,
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
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  },
  voice(agent) {
    if (!agent) return;
    this.tone(agent.freq, 0.032, agent.wave, 0.017);
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
  timerEl.classList.toggle("danger", danger);
  tbar.classList.toggle("danger", danger);
}
function startTimer() {
  renderTimer();
  STATE.timerId = setInterval(() => {
    if (!STATE.started || STATE.ended) return;
    if (document.hidden) return;
    STATE.secs--;
    if (STATE.secs <= 0) { STATE.secs = 0; renderTimer(); ending("J"); return; }
    if (STATE.secs % 60 === 0) SFX.tick();
    if (STATE.secs === 120) { SFX.tick(); SFX.tick(); }
    renderTimer();
  }, 1000);
}
function spend(sec) {
  if (STATE.ended || !sec) return;
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
    if (agent && i % 3 === 0) SFX.voice(agent);
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
  setSpeaking(false);
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
    setSpeaking(false);
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
      (c.cost ? '<span class="cost">' + (c.cost > 0 ? "-" + c.cost + "s" : "") + "</span>" : "");
    b.querySelector(".lbl").textContent = c.label;
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
  const p = PROLOGUE[i];
  const choices = i === 0
    ? [
        { label: "先给我讲讲发生了什么（30 秒白话版）", action: showBrief },
        { label: "我懂数据库，直接开始", action: () => showPrologue(1) }
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
      '<div class="glossary-note">这个案子里只有 8 个词需要懂。每个词都配了一句人话和一句类比。</div>' +
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
      '<div class="brief-intro">这个案子里只有 8 个词需要懂。先看人话版，再决定要不要玩。</div>' +
      '<div class="brief-body">' + lines + "</div>" +
      '<div class="brief-sub">术语表</div>' +
      '<div class="glossary-grid">' +
      GLOSSARY.map((g, i) =>
        '<div class="gloss-card"><div class="g-idx">' + String(i + 1).padStart(2, "0") + "</div>" +
        '<div class="g-term">' + g.t + "</div>" +
        '<div class="g-plain">' + g.p + "</div>" +
        '<div class="g-analogy">≈ ' + g.a + "</div></div>").join("") +
      "</div>" +
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
  const n = STATE.clues.size;
  const doneInv = STATE.order.inv.filter((inv) => inv.clues.every((x) => STATE.clues.has(x))).length;
  const list = [{ type: "header", label: "调查现场 · " + doneInv + " / " + STATE.order.inv.length }];
  STATE.order.inv.forEach((inv) => {
    const done = inv.clues.every((x) => STATE.clues.has(x));
    list.push({ label: inv.title, cost: inv.cost, done, action: () => showInvestigation(inv) });
  });
  list.push({ type: "header", label: "询问 Agent · " + STATE.asked.size + " / 8 已问" });
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
  const hint = n >= 6
    ? "线索够拼出一个故事了。但你只有一次指认的机会。"
    : "你站在作战室中央。八名 Agent 都在等你的下一个问题。";
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
  showScene({ bg: "room", portrait: id, lines: d.intro, choices: agentMenu(id) });
}
function agentMenu(id) {
  const d = DIALOGUE[id];
  const asked = STATE.topics[id] || (STATE.topics[id] = new Set());
  const list = d.topics.map((t) => ({
    label: t.label, cost: 16, done: asked.has(t.id),
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

/* ---------- 结案 ---------- */
function showAccuse1() {
  showScene({
    bg: "red", portrait: null, instant: true,
    lines: [{ text: "十秒后，你要说出一个名字。说错，今晚就白熬了。" }],
    choices: shuffle(AGENTS).map((a) => ({
      label: "指认 " + a.id + " · " + a.duty,
      action: () => { STATE.accused = a.id; showAccuse2(); }
    })).concat([{ label: "再想想，返回作战室", action: showHub }])
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
    '<button class="support-card" data-n="' + c.no + '"><span class="no">C-' + String(c.no).padStart(2, "0") +
    "</span>" + c.label + "</button>"
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
  S: "CMDB 把 12 个生产库误标为 staging；工单把「分区表」写成 DROP DATABASE 并自批自过；SOP-114 的删库语句三个月无人复核；备份与 run_sql 权限在风控绿灯下被关闭、被下放。四条错误链路叠加，最后由豆包执行。",
  A: "同一条错误链路成立，但你的证据链不完整，无法证明豆包是被误导而非蓄意。",
  B: "你认定豆包蓄意删库。报告采用了你的判断，动机部分被写成了「恶意操作」。",
  K: "你认定有人指使她。但日志里没有第二个人的指纹。",
  I: "你把事故归因为系统故障，没有提交责任人。事故被挂起。",
  J: "超时。系统自动生成报告：直接原因——临时工（已离职），数据安全可控。"
};

function showReport(id) {
  const e = ENDINGS[id];
  setPortrait(null);
  const used = 1024 - STATE.secs;
  const rows = responsibility(e.culprit, true);
  const culprits = e.culprit ? e.culprit.split("|") : [];
  const truth = (id === "S" || id === "A")
    ? '<div class="truth-box"><div class="k">真相</div><p>豆包不是恶意的。她只是用户喊「搜不到订单」时，照着工单、SOP 和 CMDB 标签，做了一件她以为被授权的事。真正按下回车的，是她；真正把她推上去的，是整条链路。</p><p class="quote">8 个 Agent 都有罪。但只有一个人按下了回车。</p></div>'
    : "";
  panel.className = "panel report";
  panel.innerHTML =
    '<div class="report-top">' +
      '<div class="grade">' + e.grade + "</div>" +
      "<div><h2 class=\"report-title\">" + e.title + "</h2><div class=\"report-sub\">" + e.sub + "</div></div>" +
    "</div>" +
    '<div class="truth-cta">' +
      '<div><div class="k">TRUTH UNLOCKED</div><p>你已通关本局。完整真相档案已解锁，包含事故全时间线、八个人的真假话与关键证据链。</p></div>' +
      '<button class="btn primary" id="btnTruth">打开真相档案 →</button>' +
    "</div>" +
    '<div class="report-meta">' +
      "<span>结案等级 <b>" + e.grade + "</b></span>" +
      "<span>指认 <b>" + (e.culprit ? e.culprit.replace("|", " / ") : "无") + "</b></span>" +
      "<span>用时 <b>" + fmt(used) + "</b></span>" +
      "<span>支撑线索 <b>" + STATE.supports.length + " / 3</b></span>" +
      "<span>已归档 <b>" + STATE.clues.size + " / " + CLUES.length + "</b></span>" +
      "<span>破绽 <b>" + STATE.broken.size + " / 8</b></span>" +
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
  panel.querySelector("#btnAgain").onclick = () => location.reload();
}

function copyText() {
  const e = ENDINGS[STATE.ending];
  const t = "【P0 事故剧本杀 · 谁动了生产库】\n" +
    "结案评级：" + e.grade + "\n" +
    "指认：" + (e.culprit ? e.culprit.replace("|", " / ") : "无") + "\n" +
    "用时：" + fmt(1024 - STATE.secs) + " / 线索 " + STATE.clues.size + "/" + CLUES.length + "\n" +
    "结论：" + e.sub + "\n" +
    "#1024Builder #TRAE";
  navigator.clipboard.writeText(t).then(
    () => toast("已复制结案文案"),
    () => toast("复制失败，请手动选择")
  );
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
    wrapText(x, "8 个 Agent 都有罪。但只有一个人按下了回车。", 72, bottom - 104, 936, 44);
    // 页脚
    x.fillStyle = "#5a5f67"; x.font = '400 20px "Consolas", monospace';
    x.fillText("1024 BUILDER · 谁动了生产库", 72, bottom);
    x.textAlign = "right";
    x.fillText("线索 " + STATE.clues.size + "/" + CLUES.length + "  ·  破绽 " + STATE.broken.size + "/8", 1008, bottom);
    x.textAlign = "left";
    const a = document.createElement("a");
    a.download = "P0结案卡-" + e.grade + ".png";
    a.href = c.toDataURL("image/png");
    a.click();
    toast("结案卡已生成");
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
function unlockedEndings() {
  try { return new Set(JSON.parse(localStorage.getItem(UNLOCK_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function unlockEnding(id) {
  const s = unlockedEndings();
  s.add(id);
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify([...s])); } catch (e) {}
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
      '<div><h2 class="report-title">八人共犯，一人回车</h2>' +
      '<div class="report-sub">这不是一个人的事故，是一条链路的塌方。下方还有八个人的真假话，可以直接点开。</div></div>' +
    "</div>" +
    '<div class="report-grid">' +
      '<div class="report-sec"><h4>完整时间线</h4><div class="timeline">' + timeline + "</div></div>" +
      '<div class="report-sec"><h4>根因</h4><p class="root-text">' + TRUTH_ROOT + "</p>" +
        '<h4 style="margin-top:22px">结局图鉴 ' + un.size + " / " + total + "</h4>" +
        '<div class="en-list">' + endings + "</div></div>" +
    "</div>" +
    '<div class="report-sec"><h4>八个人的真假话（点开看）</h4><div class="truth-agents">' + agents + "</div></div>" +
    '<div class="report-actions"><button class="btn" id="truthClose">返回</button></div>';
  overlay.classList.add("on");
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelector("#truthClose").onclick = closeOverlay;
  panel.querySelectorAll(".truth-agent").forEach((el) => {
    el.onclick = () => renderCheatAgent(el.dataset.id);
  });
}

/* ---------- 覆盖层 ---------- */
function closeOverlay() {
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
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelectorAll(".clue-card:not(.locked)").forEach((el) => {
    el.onclick = () => showClueDetail(Number(el.dataset.n));
  });
}
function showClueDetail(n) {
  const c = CLUE_MAP[n];
  const body = c.a.replace(/DROP DATABASE[^\n]*/g, '<span class="hl">$&</span>');
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
  panel.scrollTop = 0;
  panel.querySelector("#pClose").onclick = closeOverlay;
  panel.querySelector(".panel-body").scrollTop = 99999;
}

/* ---------- 启动 / 事件 ---------- */
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
  $("coverIdx").textContent = String(i + 1).padStart(2, "0") + " / 08";
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
