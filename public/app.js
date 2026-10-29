// OpenNotch landing page behaviour: scroll reveals, the live notch demo, voice typewriter,
// Puff instances and the live 3D companion stage.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Reveal on scroll ──
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.01, rootMargin: "100px 0px" });
$$(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 60}ms`; io.observe(el); });

// ── Card spotlight follows the cursor ──
$$(".card, .wcard").forEach((c) => c.addEventListener("pointermove", (e) => {
  const r = c.getBoundingClientRect();
  c.style.setProperty("--mx", `${e.clientX - r.left}px`); c.style.setProperty("--my", `${e.clientY - r.top}px`);
}));

// ── Clock in the fake menu bar ──


// ── Puffs ──
let notchMood = "idle";
Puff.mount($("#earPuff"), { scale: 0.9, moodFn: () => notchMood });
Puff.mount($("#panelPuff"), { scale: 0.9, moodFn: () => notchMood });
Puff.mount($("#finalPuff"), { scale: 0.75 });
$$(".mini-puff").forEach((c) => Puff.mount(c, { scale: 0.85, mood: c.dataset.mood }));
const say = $("#puffSay");
let sayT = 0;
const sayIt = (s) => { say.textContent = s; say.classList.add("on"); clearTimeout(sayT); sayT = setTimeout(() => say.classList.remove("on"), 1400); };
Puff.mount($("#bigPuff"), { scale: 0.62, onReact: (e) => sayIt({ annoyed: "hey!", dizzy: "whoa…", love: "♥ hehe", celebrate: "yay!" }[e] || "hi!") });
setTimeout(() => sayIt("hi! poke me"), 1200);

// ── The live notch: ear activities while closed, a working chat when opened ──
const notch = $("#notch"), earRight = $("#earRight"), pBody = $("#pBody"), pStatus = $("#pStatus");
const wave = '<span class="ear-wave">' + "<i></i>".repeat(6) + "</span>";
let timerLeft = 25 * 60;
const tnum = () => `${Math.floor(timerLeft / 60)}:${String(timerLeft % 60).padStart(2, "0")}`;
// Hero: cycle through the app's real live activities.
const DEMO = [
  { mood: "happy", html: () => `<span class="ear-art"></span>${wave}` },
  { mood: "idle", html: () => `<span class="ear-ring" style="--p:88%"></span><div><small style="color:#0a84ff">16X TURBO</small><span class="tnum">148 MB/s</span></div>` },
  { mood: "alert", cls: "approval", html: () => `<div><small style="color:var(--yellow)">LINK COPIED</small>YouTube 4K</div>` },
  { mood: "listening", cls: "listening", html: () => `<div><small style="color:var(--cyan)">STANDBY</small>Edit.or.lynx</div>` },
];
// Every other section: the notch shows what you're reading.
const SECTION_EARS = {
  film: { mood: "happy", html: () => `<div><small style="color:var(--g3)">NOW SHOWING</small>The film</div>` },
  tools: { mood: "idle", html: () => `<div><small style="color:var(--g1)">16X TURBO</small>one hover away</div>` },
  voice: { mood: "listening", cls: "listening", html: () => `<div><small style="color:var(--cyan)">MEDIA</small>YouTube & Spotify</div>` },
  mcp: { mood: "working", html: () => `<div><small style="color:var(--green)">LOSSLESS</small>Studio FLAC 24-bit</div>` },
  local: { mood: "idle", html: () => `<span class="ear-lock"></span><div><small style="color:var(--green)">LOCAL</small>on this Mac</div>` },
  work: { mood: "working", html: () => `<div><small style="color:var(--cyan)">SPEED</small>16 Threads</div>` },
  ai: { mood: "thinking", html: () => `<div><small style="color:var(--g2)">ENGINE</small>TurboLynx</div>` },
  puff: { mood: "happy", html: () => `<div><small style="color:var(--g3)">THAT'S ME</small>poke me ↓</div>` },
  buddies: { mood: "happy", html: () => `<span class="ear-art"></span>${wave}` },
  install: { mood: "idle", html: () => `<div><small style="color:var(--green)">STABLE</small>v2.4.0 DMG</div>` },
  final: { mood: "happy", html: () => `<div><small style="color:var(--g4)">READY</small>download now</div>` },
};
let earI = 0, open = false, hover = false, demoRun = 0, section = "demo";
function showEar() {
  const e = section === "demo" ? DEMO[earI % DEMO.length] : SECTION_EARS[section] || DEMO[0];
  notchMood = e.mood;
  earRight.innerHTML = e.html();
  notch.classList.toggle("approval", e.cls === "approval" && !open);
  notch.classList.toggle("listening", e.cls === "listening" && !open);
}
showEar();
setInterval(() => { if (!open && section === "demo") { earI++; showEar(); if (window.notchRipple) window.notchRipple(earI % 4); } }, 3400);
setInterval(() => { timerLeft = Math.max(0, timerLeft - 1); const n = $(".tnum", earRight); if (n) n.textContent = tnum(); }, 1000);
// Which section is on screen?
const secIO = new IntersectionObserver((es) => {
  es.forEach((e) => { if (e.isIntersecting && e.target.dataset.ear !== section) { section = e.target.dataset.ear; if (!open) showEar(); } });
}, { rootMargin: "-45% 0px -50% 0px" });
$$("[data-ear]").forEach((el) => secIO.observe(el));

function setOpen(v) {
  if (v === open) return;
  open = v;
  notch.classList.toggle("open", v);
  notch.classList.remove("approval", "listening");
  $("#panel").setAttribute("aria-hidden", String(!v));
  if (v) runDemo(); else { demoRun++; showEar(); }
}
const row = (html, cls = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; pBody.appendChild(d); return d; };
async function runDemo() {
  const id = ++demoRun;
  const alive = () => id === demoRun;
  pBody.innerHTML = ""; notchMood = "idle"; pStatus.textContent = "Ready";
  await sleep(450); if (!alive()) return;
  row("Download 4K & Lossless FLAC", "bubble");
  notchMood = "thinking"; pStatus.textContent = "Analyzing link…";
  await sleep(700); if (!alive()) return;
  const tools = [["#0a84ff", "Sniffed YouTube 4K stream", "youtube_4k_hdr"], ["#38bdf8", "Extracted 24-bit Lossless FLAC", "flac_audio_rip"], ["#32d74b", "Turbo 16x multi-thread engine", "turbo_download"]];
  notchMood = "working";
  for (let i = 0; i < tools.length; i++) {
    pStatus.textContent = `Step ${i + 1}/3`;
    const [c, v, code] = tools[i];
    const r = row(`<i style="--c:${c}"></i>${v}<code>${code}</code><span class="ok" style="opacity:0;transition:opacity .2s"></span>`, "trow");
    await sleep(420); if (!alive()) return;
    $(".ok", r).style.opacity = 1;
  }
  pStatus.textContent = "Saved to Downloads…";
  const p = row("", "ans");
  const answer = "Download complete: 4K 60fps Video & 24-bit Studio FLAC saved to ~/Downloads in 3.2s. Now Playing & Quick Notes ready in notch.";
  for (let i = 0; i <= answer.length; i += 2) { if (!alive()) return; p.textContent = answer.slice(0, i); await sleep(16); }
  notchMood = "happy"; pStatus.textContent = "Done · 16x Turbo · 3.2 s";
}
notch.addEventListener("pointerenter", () => { hover = true; setOpen(true); });
notch.addEventListener("pointerleave", () => { hover = false; setTimeout(() => { if (!hover) setOpen(false); }, 500); });
notch.addEventListener("focus", () => setOpen(true));
notch.addEventListener("blur", () => setOpen(false));
notch.addEventListener("click", (e) => { if (!e.target.closest("a")) setOpen(true); });
$$(".p-nav a").forEach((a) => a.addEventListener("click", () => { hover = false; setOpen(false); notch.blur(); }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); notch.blur(); } });

// ── Voice section: words light up as they're "spoken" ──
const PHRASES = ["“Download this YouTube video in 4K.”", "“Extract audio as Lossless FLAC.”", "“Play my chill playlist on Spotify.”", "“Jot a quick note on the notch.”", "“Resume turbo download.”", "“Enter silent standby.”"];
const sayText = $("#sayText");
(async () => {
  let k = 0;
  for (;;) {
    const words = PHRASES[k++ % PHRASES.length].split(" ");
    sayText.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(" ");
    const ws = $$(".w", sayText);
    for (const w of ws) { await sleep(reduce ? 0 : 230); w.classList.add("on"); }
    await sleep(1600);
  }
})();

// ── Stats count up ──
$$("[data-count]").forEach((el) => {
  const to = +el.dataset.count, suf = el.dataset.suffix || "";
  if (!to || reduce) return;
  const ob = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return; ob.disconnect();
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 1200); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suf; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  ob.observe(el);
});

// ── Copy buttons ──
$$(".copy").forEach((b) => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); } catch { /* clipboard blocked */ }
}));

// ── Film: start playing (muted) when it scrolls into view ──
const film = $("#filmVideo");
if (film && !reduce) new IntersectionObserver(([e]) => {
  if (e.isIntersecting && film.paused && !film.dataset.touched) { film.preload = "auto"; film.muted = true; film.play().catch(() => {}); }
}, { threshold: 0.5 }).observe(film);
film?.addEventListener("volumechange", () => (film.dataset.touched = "1"));


// ── Manifesto: words light up as you scroll through it ──
const mf = $("#manifesto");
if (mf) {
  const EM = new Set(["plan", "keep", "play", "guard", "wave", "hello."]);
  mf.innerHTML = mf.textContent.trim().split(/\s+/).map((w) => `<span class="w${EM.has(w.replace(/[,.—]/g, "").toLowerCase()) || w === "hello." ? " em" : ""}">${w}</span>`).join(" ");
  const ws = $$(".w", mf);
  const onScroll = () => {
    const r = mf.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
    const n = Math.round(p * ws.length);
    ws.forEach((w, i) => w.classList.toggle("on", i < n));
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
}

// ── Pinned showcase: scroll drives the notch through the tools ──
const sc = $(".showcase");
if (sc) {
  const panes = $$(".bn-pane", sc), items = $$("#scList li"), tabs = $$(".bn-tabs i", sc), bar = $("#scBar"), big = $("#bigNotch");
  let cur = -1;
  const set = (i, p) => {
    if (i !== cur) {
      panes.forEach((el, k) => { el.classList.toggle("on", k === i); el.classList.toggle("gone", k < i); });
      items.forEach((el, k) => el.classList.toggle("on", k === i));
      tabs.forEach((el, k) => el.classList.toggle("on", k === i));
      cur = i;
      if (window.notchRipple) window.notchRipple(i % 4);
    }
    items[i] && items[i].style.setProperty("--p", `${Math.round(p * 100)}%`);
  };
  const onScroll = () => {
    const r = sc.getBoundingClientRect(), total = sc.offsetHeight - innerHeight;
    const p = Math.min(0.9999, Math.max(0, -r.top / total));
    const i = Math.floor(p * panes.length);
    set(i, (p * panes.length) % 1);
    bar.style.width = `${p * 100}%`;
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  // 3D tilt toward the cursor
  if (!reduce) $("#scStage").addEventListener("pointermove", (e) => {
    const r = big.getBoundingClientRect();
    big.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`);
    big.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 10}deg`);
  });
  $("#scStage").addEventListener("pointerleave", () => { big.style.removeProperty("--rx"); big.style.removeProperty("--ry"); });
  // focus timer counts down while visible
  let left = 1500;
  setInterval(() => { if (cur === 4) { left = Math.max(0, left - 1); $("#bnClock").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; } }, 1000);
  const dropW = () => { const d = $(".drop", sc); if (d) d.style.setProperty("--w", d.clientWidth / 2 + "px"); };
  dropW(); addEventListener("resize", dropW);
}

// ── Film: grows from a card to full-bleed as you scroll ──
const filmSec = $("#film");
if (filmSec) {
  const upd = () => {
    const r = filmSec.getBoundingClientRect(), total = filmSec.offsetHeight - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / (total * 0.75)));
    filmSec.style.setProperty("--fp", p.toFixed(4));
  };
  addEventListener("scroll", upd, { passive: true }); upd();
}

// ── Dock of tools with macOS-style magnification ──
const DOCK = [
  ["Files", "#6aa8ff,#2e6be6", '<path d="M3 7h6l2 2h10v10H3z" fill="#fff"/>'],
  ["Shell", "#2b2b30,#0d0d10", '<path d="M5 8l4 4-4 4M12 17h7" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>'],
  ["Web", "#58c7ff,#1a7bea", '<circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2" fill="none"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" stroke="#fff" stroke-width="1.6" fill="none"/>'],
  ["Mail", "#5fb8ff,#1d6ff2", '<rect x="3.5" y="6" width="17" height="12" rx="2" fill="#fff"/><path d="M4 7l8 6 8-6" stroke="#1d6ff2" stroke-width="1.8" fill="none"/>'],
  ["Notes", "#ffe27a,#f5c518", '<rect x="5" y="4" width="14" height="16" rx="2" fill="#fff"/><path d="M8 9h8M8 12.5h8M8 16h5" stroke="#c9a400" stroke-width="1.6"/>'],
  ["Calendar", "#ffffff,#e9e9ec", '<text x="12" y="9" font-size="5" text-anchor="middle" fill="#ff3b30" font-family="system-ui" font-weight="700">THU</text><text x="12" y="19.5" font-size="11" text-anchor="middle" fill="#111" font-family="system-ui" font-weight="600">2</text>'],
  ["Reminders", "#ffffff,#eeeeef", '<circle cx="7" cy="8" r="2" fill="#ff9500"/><circle cx="7" cy="12.5" r="2" fill="#007aff"/><circle cx="7" cy="17" r="2" fill="#ff3b30"/><path d="M11 8h8M11 12.5h8M11 17h8" stroke="#bbb" stroke-width="1.4"/>'],
  ["Contacts", "#c6a27a,#8f6a46", '<circle cx="12" cy="9.5" r="3.5" fill="#fff"/><path d="M5.5 19c1-4 12-4 13 0" fill="#fff"/>'],
  ["Weather", "#57b5ff,#2a6fd6", '<circle cx="9" cy="9" r="3.4" fill="#ffd60a"/><path d="M8 18h9a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6 1.4A2.4 2.4 0 0 0 8 18z" fill="#fff"/>'],
  ["Screen", "#3a3a40,#16161a", '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="2.5" fill="#fff"/>'],
  ["Clipboard", "#9b8cff,#5b45e6", '<rect x="6" y="5" width="12" height="15" rx="2" fill="#fff"/><rect x="9" y="3.5" width="6" height="3" rx="1" fill="#d8d0ff"/>'],
  ["Timer", "#ffb15c,#ff7a1a", '<circle cx="12" cy="13" r="7" stroke="#fff" stroke-width="2" fill="none"/><path d="M12 13l3-3M10 3.5h4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'],
  ["Music", "#ff6b8b,#f72a59", '<path d="M10 17V7l9-2v10" stroke="#fff" stroke-width="2" fill="none"/><circle cx="8" cy="17" r="2.4" fill="#fff"/><circle cx="17" cy="15" r="2.4" fill="#fff"/>'],
  ["Memory", "#c58bff,#8a3cf0", '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="#fff"/>'],
  ["Schedules", "#5ee0c0,#14a88a", '<circle cx="12" cy="12" r="8" fill="#fff"/><path d="M12 7v5l3.5 2" stroke="#14a88a" stroke-width="2" fill="none" stroke-linecap="round"/>'],
  ["MCP", "#2c2c33,#0f0f12", '<path d="M8 4v5M16 4v5M6 9h12v3a6 6 0 0 1-12 0zM12 18v3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>'],
];
const dock = $("#dock");
if (dock) {
  dock.innerHTML = DOCK.map(([l, g, svg], i) => `<div class="dk${i % 5 === 0 ? " dk-on" : ""}" data-label="${l}" style="--bg-i:linear-gradient(160deg,${g})"><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg></div>`).join("");
  const icons = $$(".dk", dock);
  dock.addEventListener("pointermove", (e) => {
    icons.forEach((el) => {
      const r = el.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
      el.style.setProperty("--s", (1 + 0.75 * Math.max(0, 1 - d / 170) ** 2).toFixed(3));
    });
  });
  dock.addEventListener("pointerleave", () => icons.forEach((el) => el.style.setProperty("--s", 1)));
}

// ── Live agent run: thinking streams, plan checks itself off (loops while visible) ──
const runThink = $("#runThink"), runPlan = $$("#runPlan li"), runHead = $("#runHead"), runCount = $("#runCount");
if (runThink) {
  const THOUGHTS = [
    "They want a plan for today. I'll read the calendar first, then reminders, then the weather for their city…",
    "Three events: standup 9:30, design review 11:00, coffee at 3. Two reminders are due today.",
    "Rain after 4 pm. The coffee is at 3, so they'll beat it — suggest an umbrella for the walk back.",
    "Order: invoice before standup, review prep after. Keep it to four lines.",
  ];
  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(runThink);
  (async () => {
    for (;;) {
      if (!visible) { await sleep(400); continue; }
      runPlan.forEach((li) => (li.className = "")); runCount.textContent = "0/4";
      for (let step = 0; step < 4; step++) {
        runPlan[step].className = "doing"; runHead.textContent = step === 3 ? "Writing…" : "Thinking…"; runHead.classList.add("shim");
        const t = THOUGHTS[step]; runThink.textContent = "";
        for (let i = 0; i <= t.length; i += 2) { runThink.textContent = t.slice(0, i); await sleep(reduce ? 0 : 18); }
        await sleep(500);
        runPlan[step].className = "done"; runCount.textContent = `${step + 1}/4`;
      }
      runHead.classList.remove("shim"); runHead.textContent = "Thought for 6s";
      await sleep(2600);
    }
  })();
}

// ── Approval card: cursor comes in, presses Approve, it runs ──
const okCard = $("#okCard");
if (okCard) {
  const cur = $(".okcur");
  (async () => {
    for (;;) {
      okCard.classList.remove("approved", "press"); cur.style.left = "78%"; cur.style.top = "92%";
      await sleep(1600);
      const ap = $(".ap", okCard), box = okCard.parentElement.getBoundingClientRect(), r = ap.getBoundingClientRect();
      cur.style.left = `${((r.left + r.width / 2 - box.left) / box.width) * 100}%`; cur.style.top = `${((r.top + r.height / 2 - box.top) / box.height) * 100}%`;
      await sleep(900); okCard.classList.add("press"); await sleep(160); okCard.classList.remove("press"); okCard.classList.add("approved");
      await sleep(2800);
    }
  })();
}

// ── Schedule dial ticks ──
const ticks = $(".dial .ticks");
if (ticks) ticks.innerHTML = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2, hr = i % 5 === 0, r1 = hr ? 70 : 75;
  return `<line class="tick${hr ? " hr" : ""}" x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * 80}" y2="${100 - Math.cos(a) * 80}"/>`;
}).join("");

// ── MCP beams: connectors → notch → your AI ──
const beam = $("#beam"), bsvg = $("#beamSvg");
if (beam && bsvg) {
  const draw = () => {
    const B = beam.getBoundingClientRect(), C = $("#bCenter .b-notch").getBoundingClientRect();
    const cx = C.left + C.width / 2 - B.left, cy = C.top + C.height / 2 - B.top;
    let html = '<defs><linearGradient id="bg1" x1="0" x2="1"><stop offset="0" stop-color="#9eedff" stop-opacity="0"/><stop offset=".5" stop-color="#9eedff"/><stop offset="1" stop-color="#b066ff"/></linearGradient></defs>';
    $$(".b-left .b-node", beam).forEach((n, i) => {
      const r = n.getBoundingClientRect(), x = r.right - B.left, y = r.top + r.height / 2 - B.top;
      const d = `M${x},${y} C${(x + cx) / 2},${y} ${(x + cx) / 2},${cy} ${C.left - B.left},${cy}`;
      html += `<path class="base" d="${d}"/><path class="pulse" d="${d}" pathLength="1000" stroke="url(#bg1)" style="animation-delay:${-i * 0.55}s"/>`;
    });
    const A = $("#bAI").getBoundingClientRect(), ax = A.left - B.left, ay = A.top + A.height / 2 - B.top, sx = C.right - B.left;
    const d2 = `M${sx},${cy} C${(sx + ax) / 2},${cy} ${(sx + ax) / 2},${ay} ${ax},${ay}`;
    html += `<path class="base" d="${d2}"/><path class="pulse" d="${d2}" pathLength="1000" stroke="url(#bg1)" style="animation-duration:1.6s"/><path class="pulse" d="${d2}" pathLength="1000" stroke="url(#bg1)" style="animation-duration:1.6s;animation-delay:-.8s"/>`;
    bsvg.innerHTML = html;
  };
  draw(); addEventListener("resize", draw); new ResizeObserver(draw).observe(beam);
  const AIS = [["Claude", "claude"], ["GPT", "openai"], ["Gemini", "googlegemini"], ["Llama", "meta"], ["on-device", "chip"]];
  let k = 0; const nm = $("#aiName"), lg = $("#aiLogo");
  const showAI = () => {
    nm.textContent = AIS[k][0]; lg.innerHTML = window.logoSVG(AIS[k][1], 34);
    [nm, lg].forEach((el) => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
  };
  showAI();
  setInterval(() => { k = (k + 1) % AIS.length; showAI(); }, 2200);
  Puff.mount($("#beamPuff"), { scale: 0.85, mood: "working" });
}
const orbitPuff = $("#orbitPuff");
if (orbitPuff) Puff.mount(orbitPuff, { scale: 0.6, mood: "happy" });

// ── Install terminal types itself when it scrolls into view ──
const term = $("#termBody");
if (term) {
  const LINES = [
    ["cmd", "curl -O https://edit-orlynk.sivasoft.workers.dev/Edit.or.lynx.dmg"],
    ["dim", "Downloading Edit.or.lynx.dmg… 100% 16.2 MB"],
    ["cmd", "hdiutil attach Edit.or.lynx.dmg"],
    ["ok", "✓ mounted volume 'Edit.or.lynx'"],
    ["cmd", "cp -R '/Volumes/Edit.or.lynx/Edit.or.lynx.app' /Applications/"],
    ["dim", "Installing to /Applications… "],
    ["ok", "✓ installed · opening Edit.or.lynx"],
    ["cmd", "open -a Edit.or.lynx"],
    ["dim", "↑ 16x Turbo Downloader & Edit.or.lynx Notch ready"],
  ];
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let started = false;
  new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || started) return; started = true;
    let html = "";
    for (const [k, t] of LINES) {
      if (k === "cmd") {
        for (let i = 0; i <= t.length; i += 2) { term.innerHTML = html + `<span class="pr">❯</span> ${esc(t.slice(0, i))}<span class="caret"></span>`; await sleep(reduce ? 0 : 22); }
        html += `<span class="pr">❯</span> ${esc(t)}\n`; await sleep(250);
      } else { html += `<span class="${k}">${esc(t)}</span>\n`; term.innerHTML = html; await sleep(380); }
    }
    term.innerHTML = html + `<span class="pr">❯</span> <span class="caret"></span>`;
  }, { threshold: 0.4 }).observe(term);
}

// ── Provider logos in the orbit and the "ways to connect" list ──
const GLOWC = { claude: "rgba(217,119,87,.9)", openai: "rgba(255,255,255,.7)", googlegemini: "rgba(145,104,240,.9)", ollama: "rgba(255,255,255,.6)", meta: "rgba(45,136,255,.9)", openrouter: "rgba(139,140,246,.9)", lmstudio: "rgba(167,139,250,.9)", chip: "rgba(255,255,255,.6)" };
$$(".lchip[data-k]").forEach((el) => {
  const k = el.dataset.k;
  el.innerHTML = window.logoSVG(k) + `<em>${window.LOGOS[k].name}</em>`;
  el.style.setProperty("--glowc", GLOWC[k]);
  el.title = window.LOGOS[k].name;
});
$$(".wl").forEach((el) => {
  el.innerHTML = el.dataset.l.split(" ").map((k) => k === "groq" ? '<span><b class="t">groq</b></span>' : `<span>${window.logoSVG(k)}</span>`).join("");
});

// ── 48-Second Interactive Product Tour Showcase Controller ──
function init48SecShowcase() {
  const player = document.getElementById("showcasePlayer");
  if (!player) return;

  const island = document.getElementById("scNotchIsland");
  const timeDisplay = document.getElementById("scTimeDisplay");
  const chapterTitle = document.getElementById("scChapterTitle");
  const timeBar = document.getElementById("scTimeBar");
  const playBtn = document.getElementById("scPlayBtn");
  const playSvg = document.getElementById("scPlaySvg");
  const timeline = document.getElementById("scTimeline");
  const ambientGlow = document.getElementById("scAmbientGlow");
  const subtext = document.getElementById("scSubtext");

  const scenes = [
    {
      id: "scScene1",
      title: "01 · Edit.or.lynx Notch Standby",
      start: 0,
      end: 8,
      expanded: false,
      subtext: "Compact Notch standby with silent notifications & quick hover peek.",
      glow: "rgba(10, 132, 255, 0.25)"
    },
    {
      id: "scScene2",
      title: "02 · 16x Multi-threaded Turbo Downloader",
      start: 8,
      end: 16,
      expanded: true,
      subtext: "16 concurrent socket streams tearing through 4K video at 48+ MB/s.",
      glow: "rgba(129, 140, 248, 0.35)"
    },
    {
      id: "scScene3",
      title: "03 · BitTorrent Swarm Engine",
      start: 16,
      end: 24,
      expanded: true,
      subtext: "Direct peer-to-peer swarm transfers with zero cloud intermediaries.",
      glow: "rgba(16, 185, 129, 0.35)"
    },
    {
      id: "scScene4",
      title: "04 · Lossless 24-bit FLAC Studio Audio",
      start: 24,
      end: 32,
      expanded: true,
      subtext: "Bit-perfect studio audio rip directly from Spotify & Apple Music.",
      glow: "rgba(168, 85, 247, 0.35)"
    },
    {
      id: "scScene5",
      title: "05 · macOS System HUDs & Live AirDrop",
      start: 32,
      end: 40,
      expanded: true,
      subtext: "Hardware volume slider and live AirDrop transfer notifications directly in your notch.",
      glow: "rgba(56, 189, 248, 0.35)"
    },
    {
      id: "scScene6",
      title: "06 · Instant Lifetime Pro Activation",
      start: 40,
      end: 48,
      expanded: true,
      subtext: "Crockford base32 cryptographic license generated & Keychain saved.",
      glow: "rgba(250, 204, 21, 0.35)"
    }
  ];

  let currentTime = 0;
  const totalDuration = 48;
  let isPlaying = true;
  let animTimer = null;
  let lastTimestamp = performance.now();

  function formatTime(s) {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `00:${secs < 10 ? '0' : ''}${secs}`;
  }

  function updateActiveScene(t) {
    let activeScene = scenes[0];
    for (const sc of scenes) {
      if (t >= sc.start && t < sc.end) {
        activeScene = sc;
        break;
      }
    }
    if (t >= 48) activeScene = scenes[scenes.length - 1];

    // Toggle scenes visibility
    scenes.forEach(sc => {
      const el = document.getElementById(sc.id);
      if (el) el.classList.toggle("active", sc.id === activeScene.id);
    });

    // Expand / compact notch
    if (island) {
      island.classList.toggle("expanded", activeScene.expanded);
    }

    // Update HUD
    if (chapterTitle) chapterTitle.textContent = activeScene.title;
    if (timeDisplay) timeDisplay.textContent = `${formatTime(t)} / 00:48`;
    if (timeBar) timeBar.style.width = `${(t / totalDuration) * 100}%`;
    if (subtext) subtext.textContent = activeScene.subtext;
    if (ambientGlow) ambientGlow.style.background = `radial-gradient(ellipse at center, ${activeScene.glow}, transparent 70%)`;

    // Update chapter chips
    document.querySelectorAll(".sc-ch-btn").forEach(btn => {
      const start = parseFloat(btn.getAttribute("data-start") || 0);
      btn.classList.toggle("active", t >= start && t < start + 8);
    });

    // Dynamic animations inside scenes
    if (activeScene.id === "scScene2") {
      const relTime = t - 8;
      const pct = Math.min(100, Math.floor((relTime / 8) * 100));
      const turboProg = document.getElementById("scTurboProgress");
      const turboSpeed = document.getElementById("scTurboSpeed");
      const turboPct = document.getElementById("scTurboPct");
      if (turboProg) turboProg.style.width = `${pct}%`;
      if (turboPct) turboPct.textContent = `${pct}%`;
      if (turboSpeed) turboSpeed.textContent = `${(38 + (relTime * 1.6)).toFixed(1)} MB/s · 16 Threads`;
    }

    if (activeScene.id === "scScene3") {
      const relTime = t - 16;
      const pct = Math.min(100, Math.floor((relTime / 8) * 100));
      const torrentProg = document.getElementById("scTorrentProgress");
      const torrentSpeed = document.getElementById("scTorrentSpeed");
      if (torrentProg) torrentProg.style.width = `${pct}%`;
      if (torrentSpeed) torrentSpeed.textContent = `${(18 + (relTime * 0.9)).toFixed(1)} MB/s`;
    }
  }

  function loop(now) {
    if (isPlaying) {
      const delta = (now - lastTimestamp) / 1000;
      currentTime += delta;
      if (currentTime >= totalDuration) {
        currentTime = 0;
      }
      updateActiveScene(currentTime);
    }
    lastTimestamp = now;
    animTimer = requestAnimationFrame(loop);
  }

  animTimer = requestAnimationFrame(loop);

  // Play / Pause
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      isPlaying = !isPlaying;
      if (playSvg) {
        playSvg.innerHTML = isPlaying
          ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
          : '<path d="M8 5v14l11-7z"/>';
      }
    });
  }

  // Chapter buttons
  document.querySelectorAll(".sc-ch-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const start = parseFloat(btn.getAttribute("data-start") || 0);
      currentTime = start;
      lastTimestamp = performance.now();
      updateActiveScene(currentTime);
    });
  });

  // Timeline scrubber click
  if (timeline) {
    timeline.addEventListener("click", (e) => {
      const rect = timeline.getBoundingClientRect();
      const clickPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      currentTime = clickPos * totalDuration;
      lastTimestamp = performance.now();
      updateActiveScene(currentTime);
    });
  }
}

// ── Interactive Sequential Pro Key Claim Flow ──
function initProKeyHandlers() {
  const instaLink = document.getElementById("pro-insta-link");
  const instaText = document.getElementById("instaFollowText");
  const step1Card = document.getElementById("step1Card");
  const step2Card = document.getElementById("step2Card");
  const step3Card = document.getElementById("step3Card");
  const proNameInput = document.getElementById("proNameInput");
  const btnClaimPro = document.getElementById("btnClaimPro");
  const btnVerifyExisting = document.getElementById("btnVerifyExisting");
  const proResultBox = document.getElementById("proResultBox");
  const proErrorBox = document.getElementById("proErrorBox");
  const proKeyText = document.getElementById("proKeyText");
  const proTokenText = document.getElementById("proTokenText");
  const proStatusBadge = document.getElementById("proStatusBadge");
  const proClaimantName = document.getElementById("proClaimantName");
  const btnCopyKey = document.getElementById("btnCopyKey");

  let hasFollowed = false;

  // Step 1: Follow @edit.or.siva on Instagram
  if (instaLink) {
    instaLink.addEventListener("click", () => {
      hasFollowed = true;
      instaLink.classList.add("followed");
      if (instaText) {
        instaText.innerHTML = "✓ Followed @edit.or.siva (Step 1 Complete)";
      }
      if (step1Card) step1Card.classList.add("completed");
      if (step2Card) {
        step2Card.classList.remove("disabled");
        step2Card.classList.add("active");
      }
      if (proNameInput) {
        proNameInput.disabled = false;
        proNameInput.focus();
      }
      checkCanClaim();
    });
  }

  // Step 2: Name input
  if (proNameInput) {
    proNameInput.addEventListener("input", checkCanClaim);
    proNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !btnClaimPro.disabled) {
        e.preventDefault();
        btnClaimPro.click();
      }
    });
  }

  function checkCanClaim() {
    const name = (proNameInput?.value || "").trim();
    const canClaim = hasFollowed && name.length >= 2;

    if (step3Card) {
      if (canClaim) {
        step3Card.classList.remove("disabled");
        step3Card.classList.add("active");
      } else {
        step3Card.classList.add("disabled");
        step3Card.classList.remove("active");
      }
    }
    if (btnClaimPro) {
      btnClaimPro.disabled = !canClaim;
    }
  }

  // Step 3: Claim Lifetime Pro Key
  if (btnClaimPro) {
    btnClaimPro.addEventListener("click", async () => {
      if (proErrorBox) proErrorBox.style.display = "none";
      if (proResultBox) proResultBox.style.display = "none";

      if (!hasFollowed) {
        if (proErrorBox) {
          proErrorBox.textContent = "Please complete Step 1: Click 'Follow @edit.or.siva on Instagram' first.";
          proErrorBox.style.display = "block";
        }
        return;
      }

      const name = (proNameInput?.value || "").trim();
      if (!name || name.length < 2) {
        if (proErrorBox) {
          proErrorBox.textContent = "Please complete Step 2: Enter your name or Instagram username.";
          proErrorBox.style.display = "block";
        }
        return;
      }

      btnClaimPro.disabled = true;
      btnClaimPro.textContent = "Generating Lifetime Pro License…";

      try {
        const resp = await fetch("/api/claim-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, followConfirmed: true })
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || "Failed to generate Pro key");
        }

        if (proKeyText) proKeyText.textContent = data.key;
        if (proTokenText) proTokenText.textContent = data.keyId || "elnk_pro_verified";
        if (proClaimantName) proClaimantName.textContent = name;
        if (proStatusBadge) {
          proStatusBadge.textContent = "Lifetime Pro Verified ✓";
          proStatusBadge.style.color = "#32d74b";
        }
        if (step3Card) step3Card.classList.add("completed");
        if (proResultBox) proResultBox.style.display = "block";
      } catch (err) {
        if (proErrorBox) {
          proErrorBox.textContent = err.message;
          proErrorBox.style.display = "block";
        }
      } finally {
        btnClaimPro.disabled = false;
        btnClaimPro.textContent = "⚡ Claim Lifetime Pro Key";
      }
    });
  }

  if (btnVerifyExisting) {
    btnVerifyExisting.addEventListener("click", async () => {
      if (proErrorBox) proErrorBox.style.display = "none";
      if (proResultBox) proResultBox.style.display = "none";
      const inputVal = (proNameInput?.value || "").trim();
      if (!inputVal) {
        if (proErrorBox) {
          proErrorBox.textContent = "Please enter your Pro key in the box to validate.";
          proErrorBox.style.display = "block";
        }
        return;
      }

      btnVerifyExisting.disabled = true;
      btnVerifyExisting.textContent = "Validating…";

      try {
        const resp = await fetch("/api/license/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: inputVal, checkOnly: true })
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || `Key verification failed (${data.reason || "invalid"})`);
        }

        if (proKeyText) proKeyText.textContent = inputVal.toUpperCase();
        if (proTokenText) proTokenText.textContent = data.token || "elnk_pro_verified";
        if (proStatusBadge) {
          proStatusBadge.textContent = "Valid Lifetime Pro Key ✓";
          proStatusBadge.style.color = "#38bdf8";
        }
        if (proResultBox) proResultBox.style.display = "block";
      } catch (err) {
        if (proErrorBox) {
          proErrorBox.textContent = err.message;
          proErrorBox.style.display = "block";
        }
      } finally {
        btnVerifyExisting.disabled = false;
        btnVerifyExisting.textContent = "Validate Key";
      }
    });
  }

  if (btnCopyKey) {
    btnCopyKey.addEventListener("click", () => {
      if (!proKeyText) return;
      const key = proKeyText.textContent;
      navigator.clipboard.writeText(key).then(() => {
        const old = btnCopyKey.textContent;
        btnCopyKey.textContent = "✓ Copied License Key!";
        setTimeout(() => { btnCopyKey.textContent = old; }, 2000);
      });
    });
  }
}

// MARK: - Site Configuration CMS Loader
async function initSiteConfig() {
  try {
    const res = await fetch("/api/site-config");
    if (!res.ok) return;
    const config = await res.json();
    if (!config) return;

    // Apply text content & links
    if (config.heroHeadline) {
      const el = document.getElementById("hero-headline");
      if (el) el.innerHTML = config.heroHeadline;
    }
    if (config.heroSubtitle) {
      const el = document.getElementById("hero-subtitle");
      if (el) el.textContent = config.heroSubtitle;
    }
    if (config.heroKicker) {
      const el = document.getElementById("hero-kicker");
      if (el) el.textContent = config.heroKicker;
    }
    if (config.downloadButtonText) {
      const el = document.getElementById("hero-download-btn");
      if (el) {
        // preserve svg icon if present
        const svg = el.querySelector("svg");
        el.innerHTML = "";
        if (svg) el.appendChild(svg);
        el.appendChild(document.createTextNode(" " + config.downloadButtonText));
      }
    }
    if (config.downloadUrl) {
      const btn = document.getElementById("hero-download-btn");
      if (btn) btn.href = config.downloadUrl;
    }
    if (config.instagramHandle || config.instagramUrl) {
      const link = document.getElementById("pro-insta-link");
      if (link) {
        if (config.instagramUrl) link.href = config.instagramUrl;
        if (config.instagramHandle) {
          link.innerHTML = `<span>📸 Step 1: Follow <b style="color: #fff;">${config.instagramHandle}</b> on Instagram ↗</span>`;
        }
      }
    }

    // Apply section visibility toggles
    const sectionMap = {
      "sec-hero": config.showHero !== false,
      "sec-stats": config.showStats !== false,
      "sec-superpowers": config.showSuperpowers !== false,
      "sec-prokey": config.showProKey !== false,
      "sec-quickstart": config.showQuickStart !== false,
      "sec-faq": config.showFaq !== false,
      "sec-cta": config.showFinalCta !== false
    };

    for (const [id, isVisible] of Object.entries(sectionMap)) {
      const sec = document.getElementById(id);
      if (sec) {
        sec.style.display = isVisible ? "" : "none";
      }
    }
  } catch (e) {
    console.debug("[SiteConfig] Loaded with defaults", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init48SecShowcase();
    initProKeyHandlers();
    initSiteConfig();
  });
} else {
  init48SecShowcase();
  initProKeyHandlers();
  initSiteConfig();
}
