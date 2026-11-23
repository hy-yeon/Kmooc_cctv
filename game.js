// ============================================================
// game.js — 담당: A (게임 엔지니어)
// CCTV 좌우 둘러보기, 층 진행, 새 창(모달), 보고서 그래프(SVG), 책상 장식.
// 조사 흐름(책 · 렌즈 · REPORT 보드 · 도장 · 수칙 · 보고서 · 정산서)은 investigate.js (Inv) 가 맡는다.
// CCTV 연출은 scenes.js (CctvView), 소리는 sound.js (Sfx) 가 맡는다.
// ============================================================

// ---- 상태 -------------------------------------------------
const state = {
  idx: 0,         // 현재 층 인덱스 (0 ~ FLOORS.length - 1)
};

// ---- DOM --------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  floor: $("floor-label"),
  hearts: $("hearts"),
  cctv: $("cctv-screen"),
  cctvTime: $("cctv-time"),
  cctvCam: $("cctv-cam"),
  intro: $("intro"),
  btnMute: $("btn-mute"),
  caption: $("cctv-caption"),
  btnLeft: $("btn-left"),
  btnRight: $("btn-right"),
  btnReport: $("btn-report"),
  btnNext: $("btn-next"),
  btnContinue: $("btn-continue"),
  game: $("game"),
};

const currentFloor = () => FLOORS[state.idx];

function mk(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---- CCTV -------------------------------------------------
function renderCctv(f) {
  CctvView.show(f.cctvScene, f.floor);          // 3D 를 못 쓰는 환경이면 아무 일도 안 한다 (자막으로 진행)
  CctvView.fit();                               // 화면이 막 보이게 된 경우 크기와 좌우 끝을 다시 잰다
  el.cctvCam.textContent = `CAM ${f.floor}F · ${f.place || "복도"}`;
  el.cctvTime.textContent = f.cctvTime;
  // 3D 가 안 되면 볼 수 없으니 자막으로 장면을 알려 준다
  el.caption.textContent = CctvView.ok ? "◀ ▶ 로 복도를 둘러보세요" : f.cctvCaption;
  updatePanButtons();
}

// ---- 좌우 둘러보기 (◀ ▶ · ← → · 화면 끌기) -----------------
function updatePanButtons() {
  el.btnLeft.disabled = !CctvView.ok || CctvView.atLeft;
  el.btnRight.disabled = !CctvView.ok || CctvView.atRight;
}
function panStep(dir) {
  if (CctvView.pan(dir)) Sfx.click();
  updatePanButtons();
}

function setupPan() {
  const view = $("view");
  el.btnLeft.addEventListener("click", () => panStep(-1));
  el.btnRight.addEventListener("click", () => panStep(1));

  document.addEventListener("keydown", (e) => {
    if (el.game.classList.contains("hidden") || modal) return;      // 창이 열려 있으면 움직이지 않는다
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") panStep(-1);
    else if (k === "arrowright" || k === "d") panStep(1);
    else return;
    e.preventDefault();
  });

  // 화면을 옆으로 끌어도 움직인다
  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    drag.x = e.clientX;
    CctvView.drag((-dx / view.clientWidth) * 10);
    updatePanButtons();
  });
  const end = () => { drag = null; };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);
  window.addEventListener("resize", () => requestAnimationFrame(updatePanButtons));
}

// ---- 빈칸 문장 (보고서 창에서 쓴다) -------------------------
// "…을 ____ 로 그려서 보기" → 빈칸에 고른 낱말을 넣어 보여 준다
function sentenceLine(sentence, word) {
  const line = mk("p", "sentence");
  const [before, after] = sentence.split("____");
  line.append(document.createTextNode(before));
  line.appendChild(mk("span", "blank" + (word ? " filled" : ""), word || "  ?  "));
  line.append(document.createTextNode(after || ""));
  return line;
}

// ---- 경비 보고서 그래프 (파이썬 없이 SVG 로) ----------------
const hoursOfEntries = () => TABLES[0].rows.map((r) => r.출입시);

function svgEl(tag, attrs, text) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
  if (text !== undefined) n.textContent = text;
  return n;
}

// kind: histplot | boxplot | scatterplot
// marks: 그래프에 겹칠 세로 점선 [{ kind: "real" | "false", floor, hour }]
function chartSvg(kind, marks = []) {
  const W = 640, H = 300, L = 46, R = 16, T = 16, B = 44;
  const hours = hoursOfEntries();
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${kind} 그래프: 출입시(0~23시)` });
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));
  const x = (h) => L + ((h + 0.5) / 24) * (W - L - R);
  const axis = (yLabel) => {
    svg.appendChild(svgEl("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: "#333" }));
    for (let h = 0; h < 24; h += 2) svg.appendChild(svgEl("text", { x: x(h), y: H - B + 16, "text-anchor": "middle", "font-size": 11, fill: "#333" }, String(h)));
    svg.appendChild(svgEl("text", { x: (L + W - R) / 2, y: H - 8, "text-anchor": "middle", "font-size": 12, fill: "#333" }, "출입시 (0~23시)"));
    if (yLabel) svg.appendChild(svgEl("text", { x: 12, y: (T + H - B) / 2, "text-anchor": "middle", "font-size": 12, fill: "#333", transform: `rotate(-90 12 ${(T + H - B) / 2})` }, yLabel));
  };
  const night = (h) => h <= 3;                       // 새벽 0~3시는 붉게

  if (kind === "histplot") {
    const counts = Array(24).fill(0);
    hours.forEach((h) => { counts[h] += 1; });
    const max = Math.max(...counts), bw = (W - L - R) / 24;
    counts.forEach((c, h) => {
      if (!c) return;
      const bh = (c / max) * (H - T - B - 14);
      svg.appendChild(svgEl("rect", { x: x(h) - bw / 2 + 1, y: H - B - bh, width: bw - 2, height: bh, fill: night(h) ? "#e5484d" : "#4c72b0" }));
      svg.appendChild(svgEl("text", { x: x(h), y: H - B - bh - 3, "text-anchor": "middle", "font-size": 10, fill: "#333" }, String(c)));
    });
    axis("출입 건수");
  } else if (kind === "boxplot") {
    const s = hours.slice().sort((a, b) => a - b);
    const q = (p) => { const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
    const q1 = q(0.25), med = q(0.5), q3 = q(0.75), iqr = q3 - q1;
    const lo = s.find((v) => v >= q1 - 1.5 * iqr), hi = s.slice().reverse().find((v) => v <= q3 + 1.5 * iqr);
    const y = (T + H - B) / 2, hgt = 70;
    svg.appendChild(svgEl("line", { x1: x(lo), y1: y, x2: x(hi), y2: y, stroke: "#333" }));
    [lo, hi].forEach((v) => svg.appendChild(svgEl("line", { x1: x(v), y1: y - 18, x2: x(v), y2: y + 18, stroke: "#333" })));
    svg.appendChild(svgEl("rect", { x: x(q1), y: y - hgt / 2, width: x(q3) - x(q1), height: hgt, fill: "#4c72b0", stroke: "#333" }));
    svg.appendChild(svgEl("line", { x1: x(med), y1: y - hgt / 2, x2: x(med), y2: y + hgt / 2, stroke: "#fff", "stroke-width": 3 }));
    s.filter((v) => v < lo || v > hi).forEach((v) => svg.appendChild(svgEl("circle", { cx: x(v), cy: y, r: 5, fill: night(v) ? "#e5484d" : "#333" })));
    axis("");
  } else {
    const n = hours.length;
    hours.forEach((h, i) => svg.appendChild(svgEl("circle", { cx: x(h), cy: T + 8 + (i / (n - 1)) * (H - T - B - 16), r: 3.5, fill: night(h) ? "#e5484d" : "#4c72b0" })));
    axis("기록 순서");
  }

  // 표시할 시각을 세로 점선과 층 번호로 겹친다 (real: 빨강, false: 주황)
  let prev = null, row = 0;
  marks.slice().sort((p, q) => p.hour - q.hour).forEach((a) => {
    row = prev !== null && a.hour - prev <= 1 ? 1 - row : 0;      // 붙어 있는 시각은 이름표를 위아래로 엇갈리게
    prev = a.hour;
    const color = a.kind === "real" ? "#e5484d" : "#e08a00";
    const top = T - 2 + row * 17;
    const g = svgEl("g", { class: "anomaly-mark " + a.kind });
    g.appendChild(svgEl("line", { x1: x(a.hour), y1: top + 16, x2: x(a.hour), y2: H - B, stroke: color, "stroke-width": 1.5, "stroke-dasharray": a.kind === "real" ? "4 3" : "2 3" }));
    g.appendChild(svgEl("rect", { x: x(a.hour) - 13, y: top, width: 26, height: 16, rx: 3, fill: a.kind === "real" ? color : "#fff", stroke: color }));
    g.appendChild(svgEl("text", { x: x(a.hour), y: top + 12, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: a.kind === "real" ? "#fff" : color }, `${a.floor}F`));
    svg.appendChild(g);
  });
  return svg;
}

// ---- 새 창(모달) ------------------------------------------
let modal = null;

function openModal({ title, cls, onClose }) {
  closeModal();
  const opener = document.activeElement;
  const back = mk("div", "modal-backdrop");
  const box = mk("div", "modal " + (cls || ""));
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "modal-title");
  const head = mk("div", "modal-head");
  const h = mk("h2", "", title); h.id = "modal-title";
  const x = mk("button", "modal-close", "닫기 ✕"); x.type = "button";
  x.addEventListener("click", () => closeModal());
  head.append(h, x);
  const body = mk("div", "modal-body");
  box.append(head, body);
  back.appendChild(box);
  document.body.appendChild(back);
  back.addEventListener("mousedown", (e) => { if (e.target === back) closeModal(); });

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
    if (e.key !== "Tab") return;
    const f = [...box.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea, summary, [tabindex]:not([tabindex='-1'])")].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey, true);
  modal = { back, box, body, opener, onClose, onKey };
  x.focus();
  return modal;
}

function closeModal() {
  if (!modal) return;
  const m = modal;
  modal = null;
  document.removeEventListener("keydown", m.onKey, true);
  m.back.remove();
  if (m.onClose) m.onClose();
  if (m.opener && document.contains(m.opener) && !m.opener.disabled) m.opener.focus();
}

// ---- 흐름 -------------------------------------------------
function startFloor() {
  const f = currentFloor();
  closeModal();
  el.floor.textContent = `${f.floor}층${f.place ? " " + f.place : ""} / ${FLOORS.length}층`;
  renderCctv(f);
  Inv.startFloor(f);
}

// 다음 층으로 (마지막 층 뒤의 보고서 · 정산서는 Inv 가 맡는다)
function proceed() {
  Sfx.click();
  state.idx += 1;
  rideLift(currentFloor().floor);
  startFloor();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 층 사이 이동 연출 (엘리베이터)
function rideLift(floorNo) {
  const lift = $("lift");
  $("lift-text").textContent = `▲ ${floorNo}층`;
  lift.classList.remove("hidden");
  Sfx.open();
  setTimeout(() => lift.classList.add("hidden"), 1100);
}

// 정산서의 「처음부터 다시」
function restart() {
  state.idx = 0;
  el.game.classList.remove("hidden");
  Sfx.unlock();
  startFloor();
}

// 시작 화면 → 1층. 첫 클릭이라 여기서 소리도 켠다.
function begin() {
  el.intro.classList.add("hidden");
  el.game.classList.remove("hidden");
  Sfx.unlock();
  Sfx.click();
  startFloor();
}

function toggleMute() {
  const muted = Sfx.toggleMute();
  el.btnMute.textContent = muted ? "소리 꺼짐" : "소리 켜짐";
  el.btnMute.setAttribute("aria-pressed", String(muted));
}

// ---- 이벤트 / 시작 ----------------------------------------
$("book-entry").addEventListener("click", () => Inv.openBook("entry"));
$("book-delivery").addEventListener("click", () => Inv.openBook("delivery"));
el.btnReport.addEventListener("click", () => Inv.stamp("report"));
el.btnNext.addEventListener("click", () => Inv.stamp("next"));
el.btnContinue.addEventListener("click", () => Inv.finishFloor());
$("board-btn").addEventListener("click", () => Inv.openBoard());
$("btn-start").addEventListener("click", begin);
el.btnMute.addEventListener("click", toggleMute);
setupPan();

// 책상 위 장비(장식): 기계식 키보드와 유선 마우스. 어둡고 녹슨 금속 느낌으로 직접 그린다.
(function drawGear() {
  const NS = "http://www.w3.org/2000/svg";
  const el_ = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (parent) parent.appendChild(n); return n; };
  let seed = 20261118;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  // ----- 키보드 -----
  const kb = document.getElementById("kb");
  if (kb) {
    const U = 31, KH = 22, PAD = 12;
    const defs = el_("defs", {}, kb);
    const grad = el_("linearGradient", { id: "kb-case", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el_("stop", { offset: "0", "stop-color": "#2b2520" }, grad); el_("stop", { offset: "1", "stop-color": "#15120f" }, grad);
    el_("rect", { x: 2, y: 2, width: 486, height: 172, rx: 11, fill: "url(#kb-case)", stroke: "#5a3a22", "stroke-width": 3 }, kb);
    el_("rect", { x: 8, y: 8, width: 474, height: 160, rx: 8, fill: "#1b1713", stroke: "#0d0b09", "stroke-width": 2 }, kb);   // 스위치 플레이트
    [[10, 10], [480, 10], [10, 166], [480, 166]].forEach(([x, y]) => { el_("circle", { cx: x, cy: y, r: 2.4, fill: "#7a4a2a" }, kb); });   // 나사
    const rows = [
      [[1], [1, "gap"], [1, 1, 1, 1], [0.5, "gap"], [1, 1, 1, 1], [0.5, "gap"], [1, 1, 1, 1]],
      [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2]],
      [[1.5], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1.5]],
      [[1.75], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2.25]],
      [[2.25], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2.75]],
      [[1.25, 1.25, 1.25], [6.25], [1.25, 1.25, 1.25, 1.25]],
    ];
    // 위 배열을 단순한 폭 목록으로 펴 준다 (gap 표시는 빈칸)
    const flat = rows.map((r) => {
      const out = [];
      r.flat().forEach((v) => { out.push(v); });
      return out.filter((v) => v !== "gap");
    });
    const gapAfter = { 0: [0, 0, 0, 0, 0, 0] };   // (함수키 줄은 아래에서 따로 간격을 준다)
    const accent = new Set(["0:0", "1:13", "3:12", "4:11", "5:3"]);   // 녹이 많이 슨 포인트 키 (Esc · Backspace · Enter · 오른쪽 Shift · 스페이스)
    const keyLayout = [];
    // 함수키 줄
    let x = PAD;
    keyLayout.push([[x, 1]]); x += U * 2;
    for (let g = 0; g < 3; g++) { for (let i = 0; i < 4; i++) { keyLayout[0].push([x, 1]); x += U; } x += U * 0.5; }
    // 나머지 줄
    for (let r = 1; r < 6; r++) {
      x = PAD; keyLayout.push([]);
      flat[r].forEach((w) => { keyLayout[r].push([x, w]); x += U * w; });
    }
    const caps = el_("g", {}, kb);
    keyLayout.forEach((row, r) => {
      const y = 15 + r * 25 + (r > 0 ? 5 : 0);
      row.forEach(([kx, w], c) => {
        const wk = w * U - 3, hot = accent.has(`${r}:${c}`);
        el_("rect", { x: kx, y, width: wk, height: KH, rx: 3.5, fill: hot ? "#2a140a" : "#120f0c" }, caps);                    // 키캡 옆면
        el_("rect", { x: kx + 1.5, y: y + 0.5, width: wk - 3, height: KH - 5, rx: 3, fill: hot ? "#5a2f17" : "#2f2923", stroke: hot ? "#7a4120" : "#443a30", "stroke-width": 1 }, caps);   // 윗면
        el_("rect", { x: kx + 4, y: y + 3, width: wk - 8, height: 3, rx: 1.5, fill: "#fff", opacity: 0.06 }, caps);            // 윗면 반사
        // 녹 얼룩
        if (hot || rnd() < 0.34) {
          const rx = 2 + rnd() * (wk / 3.2), ry = 1.5 + rnd() * 4;
          el_("ellipse", { cx: kx + 4 + rnd() * (wk - 8), cy: y + 4 + rnd() * 8, rx, ry, fill: rnd() < 0.7 ? "#a0582a" : "#7a3a1a", opacity: (hot ? 0.5 : 0.18 + rnd() * 0.22).toFixed(2) }, caps);
        }
        if (rnd() < 0.08) el_("line", { x1: kx + 5, y1: y + 12, x2: kx + 5 + wk * 0.45, y2: y + 6, stroke: "#8a8070", "stroke-width": 0.8, opacity: 0.35 }, caps);   // 긁힌 자국
      });
    });
    // 케이스 모서리의 녹물 자국
    el_("path", { d: "M2 90 C14 96 12 120 4 150", fill: "none", stroke: "#8a4b22", "stroke-width": 5, opacity: 0.35, "stroke-linecap": "round" }, kb);
    el_("path", { d: "M488 20 C476 30 480 60 486 78", fill: "none", stroke: "#8a4b22", "stroke-width": 4, opacity: 0.3, "stroke-linecap": "round" }, kb);
  }

  // ----- 마우스 (유선) -----
  const ms = document.getElementById("ms");
  if (ms) {
    const defs = el_("defs", {}, ms);
    const g = el_("linearGradient", { id: "ms-body", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    el_("stop", { offset: "0", "stop-color": "#352d26" }, g); el_("stop", { offset: "1", "stop-color": "#171310" }, g);
    el_("path", { d: "M50 42 C50 22 70 24 70 4", fill: "none", stroke: "#15120f", "stroke-width": 4.5, "stroke-linecap": "round" }, ms);          // 케이블
    el_("path", { d: "M50 42 C50 22 70 24 70 4", fill: "none", stroke: "#4a4036", "stroke-width": 4.5, "stroke-dasharray": "2.5 3.5", "stroke-linecap": "round" }, ms);   // 꼬아 짠 겉감
    const body = "M16 86 C16 54 32 44 50 44 C68 44 84 54 84 86 L84 130 C84 154 68 166 50 166 C32 166 16 154 16 130 Z";
    el_("path", { d: body, fill: "url(#ms-body)", stroke: "#5a3a22", "stroke-width": 3 }, ms);
    el_("path", { d: "M50 44 L50 100", stroke: "#0d0b09", "stroke-width": 2.5 }, ms);                         // 좌우 버튼 틈
    el_("path", { d: "M17 100 C34 106 66 106 83 100", fill: "none", stroke: "#0d0b09", "stroke-width": 2.5 }, ms);
    el_("rect", { x: 44, y: 58, width: 12, height: 26, rx: 5, fill: "#241d17", stroke: "#6b4a2a", "stroke-width": 1.5 }, ms);   // 휠
    for (let i = 0; i < 5; i++) el_("line", { x1: 45, y1: 62 + i * 5, x2: 55, y2: 62 + i * 5, stroke: "#8a4b22", "stroke-width": 1 }, ms);
    el_("rect", { x: 12, y: 112, width: 6, height: 18, rx: 2.5, fill: "#241d17", stroke: "#5a3a22", "stroke-width": 1.5 }, ms);   // 옆 버튼
    [[30, 120, 9, 5, 0.42], [68, 140, 8, 6, 0.36], [38, 70, 7, 4, 0.3], [62, 92, 6, 4, 0.34]].forEach(([cx, cy, rx, ry, o]) => el_("ellipse", { cx, cy, rx, ry, fill: "#a0582a", opacity: o }, ms));   // 녹
    el_("path", { d: "M28 150 C40 158 60 158 72 150", fill: "none", stroke: "#8a4b22", "stroke-width": 3, opacity: 0.4, "stroke-linecap": "round" }, ms);
    el_("path", { d: "M22 66 L38 50", stroke: "#fff", "stroke-width": 2, opacity: 0.07, "stroke-linecap": "round" }, ms);          // 윗면 반사
  }
})();

CctvView.init(el.cctv);
