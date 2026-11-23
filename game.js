// ============================================================
// game.js — 담당: A (게임 엔지니어)  · ver2: PS1 레트로 CCTV 연출 / 사운드 / 강좌 안내 연결
// ver8: 조사자 흐름(investigate.js · boards.js). 책·보드·도장·수칙은 Inv 가 맡고, 여기는 CCTV·걷기·층 진행·보고서·엔딩.
// ver7: 코드 대신 "빈칸이 있는 말 + 낱말 카드"로 고르고, 카드를 누르면 표가 바뀐다. 정확한 코드는 층이 끝난 뒤 풀이 창에서 보여 준다.
// ver6: 경비실 책상 화면. 책(출입표·배달표)을 눌러 기록 창을 열고, ✓/✗ 를 누르면 체크리스트(checklists.js)를 써야 다음 층으로 간다.
// data.js 의 TABLES / FLOORS, cases.js 의 CASES(카드 조사), pyrunner.js 의 PyRunner(고급 모드) 를 읽어서 동작한다.
// ver3: 기본 조사는 "빈칸 코드 + 함수 카드". 결과는 미리 계산해 바로 보여 준다. 직접 코딩은 고급 모드에서만.
// 모든 층이 같은 표(출입표/배달표)를 본다. 층마다 달라지는 건 CCTV 장면과 정답뿐.
// ============================================================

const MAX_FAILS = 3;

// CCTV 연출은 scenes.js (CctvView), 소리는 sound.js (Sfx) 가 맡는다.
// 키 = data.js 의 cctvScene.

// ---- 상태 -------------------------------------------------
const state = {
  idx: 0,          // 현재 층 인덱스 (0~6)
  fails: 0,        // 누적 실패 수
  results: [],     // { floor, anomaly, correct, choice, answer }
  booksOpened: 0,  // 이 층에서 책을 연 횟수
  check: null,     // 체크리스트 작성 상태 (newCheck())
  found: false,   // 이 층에서 이상한 것을 직접 눌러 찾았는지
  picks: [],
  reportPick: null,   // 경비 보고서에서 고른 그래프 카드 번호       // 이 층의 조사(step)마다 고른 카드 번호 (없으면 null)
  answered: false,
};

// 데이터 표 보기 상태 (층이 바뀔 때마다 초기화)
const view = { sortKey: null, sortDir: 1, evidenceOnly: false, reveal: false };
let ui = null;       // 데이터 패널 안의 요소 모음 (패널을 만들 때마다 새로 채움)

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
  status: $("desk-status"),
  btnReport: $("btn-report"),
  btnNext: $("btn-next"),
  btnContinue: $("btn-continue"),
  game: $("game"),
  ending: $("ending"),
};

const currentFloor = () => FLOORS[state.idx];

function mk(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---- 렌더링: 상단(CCTV) -----------------------------------
function renderHearts() {
  el.hearts.innerHTML = "";
  for (let i = 0; i < MAX_FAILS; i++) el.hearts.appendChild(mk("span", "heart" + (i < MAX_FAILS - state.fails ? "" : " lost")));
  el.hearts.setAttribute("aria-label", `남은 기회 ${MAX_FAILS - state.fails} / ${MAX_FAILS}`);
}

function renderCctv(f) {
  CctvView.show(f.cctvScene, f.floor);          // 3D 를 못 쓰는 환경이면 아무 일도 안 한다 (자막으로 진행)
  el.cctvCam.textContent = `${f.floor}F ${f.place || "복도"}`;
  el.cctvTime.textContent = f.cctvTime;
  state.found = false;
  $("found-badge").classList.add("hidden");
  document.querySelectorAll(".book").forEach((b) => b.classList.remove("glow"));
  // 3D 가 안 되면 걸을 수 없으니 바로 자막을 보여 준다
  el.caption.textContent = CctvView.ok ? "복도를 걸으며 둘러보세요. 이상한 것이 보이면 눌러 보세요." : f.cctvCaption;
}

// ---- 걷기 / 둘러보기 / 이상한 것 누르기 ---------------------
function markFound() {
  if (state.found || state.answered) return;
  state.found = true;
  $("found-badge").classList.remove("hidden");
  el.caption.textContent = currentFloor().cctvCaption + "  → 낱말 수첩에 모였어요. 책을 열어 기록과 맞춰 보세요.";
  document.querySelectorAll(".book").forEach((b) => b.classList.add("glow"));
  Sfx.open();
}

function walkStep(dir) {
  if (!CctvView.step(dir)) return;
  Sfx.click();
  // 아무도 없는 층: 복도 끝까지 가 보면 "아무도 없다"는 것 자체가 발견이다
  if (!CctvView.hasActors && CctvView.node === CctvView.lastNode) { markFound(); Inv.onSceneTag("empty-end"); }
}

function setupWalk() {
  const view = $("view");
  $("btn-fwd").addEventListener("click", () => walkStep(1));
  $("btn-back").addEventListener("click", () => walkStep(-1));
  $("btn-left").addEventListener("click", () => CctvView.look(0.5, 0));
  $("btn-right").addEventListener("click", () => CctvView.look(-0.5, 0));

  document.addEventListener("keydown", (e) => {
    if (el.game.classList.contains("hidden") || modal) return;      // 창이 열려 있으면 걷지 않는다
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;      // 고급 모드 입력 중엔 무시
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") walkStep(1);
    else if (k === "arrowdown" || k === "s") walkStep(-1);
    else if (k === "arrowleft" || k === "a") CctvView.look(0.35, 0);
    else if (k === "arrowright" || k === "d") CctvView.look(-0.35, 0);
    else return;
    e.preventDefault();
  });

  // 끌면 둘러보기, 짧게 누르면 그 자리의 것을 조사
  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    CctvView.look(dx * 0.006, dy * 0.004);
  });
  const end = (e) => {
    if (!drag) return;
    const tap = drag.moved < 8;
    drag = null;
    if (!tap) return;
    const r = view.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const tag = CctvView.pick(x, y);
    if (!tag) { if (!CctvView.hasActors) Inv.onSceneTag("empty-end"); return; }   // 7층: 아무도 없는 복도를 누르면 "아무도 없음"
    if (!tag.startsWith("door-")) markFound();
    Inv.onSceneTag(tag);
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", () => { drag = null; });
}

// ---- 표 그리기 ---------------------------------------------
function sortedRows(rows) {
  if (!view.sortKey) return rows;
  const k = view.sortKey, d = view.sortDir;
  return rows.slice().sort((a, b) => {
    const va = a[k], vb = b[k];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;          // 빈 값은 항상 맨 아래
    if (vb === null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * d;
    return String(va).localeCompare(String(vb), "ko") * d;
  });
}

// 기록 표 하나를 그린다. onSort 가 있으면 열 머리를 눌러 정렬할 수 있다.
function tableEl(table, rows, onSort) {
  const ev = currentFloor().evidence;
  const t = mk("table", "data-table");
  const thead = mk("thead"), trh = mk("tr");
  table.columns.forEach((key) => {
    const arrow = view.sortKey === key ? (view.sortDir === 1 ? " ▲" : " ▼") : "";
    const th = mk("th", onSort ? "sortable" : "", key + arrow);
    if (onSort) {
      th.title = "누르면 정렬돼요";
      th.addEventListener("click", () => {
        if (view.sortKey === key) view.sortDir = -view.sortDir;
        else { view.sortKey = key; view.sortDir = 1; }
        onSort();
      });
    }
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  t.appendChild(thead);
  const tbody = mk("tbody");
  sortedRows(rows).forEach((row) => {
    const tr = mk("tr");
    if (view.reveal && ev.includes(row.id)) tr.className = "evidence";
    table.columns.forEach((key) => {
      const v = row[key];
      const td = mk("td");
      if (v === null || v === undefined) { td.textContent = "NaN"; td.className = "na"; }
      else {
        td.textContent = v;
        if (key === "빛감지") td.className = v === "On" ? "light-on" : "light-off";
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  return t;
}

// ---- 카드 조사 ---------------------------------------------
// 빈칸이 있는 쉬운 말 한 문장 + 낱말 카드. 카드를 누르면 표가 그 말대로 바뀐다. (정확한 코드는 풀이 창에서)
const casesFor = () => (typeof CASES === "object" && CASES[currentFloor().floor]) || [];

// "…햄스터와 ____ 줄만 보기" → 빈칸에 고른 낱말을 넣어 보여 준다
function sentenceLine(sentence, word) {
  const line = mk("p", "sentence");
  const [before, after] = sentence.split("____");
  line.append(document.createTextNode(before));
  line.appendChild(mk("span", "blank" + (word ? " filled" : ""), word || "  ?  "));
  line.append(document.createTextNode(after || ""));
  return line;
}

// 풀이 창의 코드 줄: 빈칸 자리에 쓴 부분을 강조한다
function codeBlock(code, fill) {
  const pre = mk("pre", "code-block");
  const [before, after] = code.split("____");
  pre.append(document.createTextNode(before));
  pre.appendChild(mk("mark", "", fill));
  pre.append(document.createTextNode(after || ""));
  return pre;
}

// groupby 결과: 묶은 값 → 통계 값. 가장 큰 값의 줄을 표시해 눈에 띄게 한다.
function seriesTable(res) {
  const top = res.items.reduce((m, it) => (m === null || it[1] > m ? it[1] : m), null);
  const t = mk("table", "data-table series");
  const trh = mk("tr");
  [res.index, res.name].forEach((c) => trh.appendChild(mk("th", "", c)));
  const thead = mk("thead"); thead.appendChild(trh); t.appendChild(thead);
  const tbody = mk("tbody");
  res.items.forEach(([k, v]) => {
    const tr = mk("tr");
    if (v === top && res.items.length > 2) tr.className = "top";
    tr.append(mk("td", "", String(k)), mk("td", "", String(v)));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  const wrap = mk("div", "table-scroll small narrow");
  wrap.appendChild(t);
  return wrap;
}

// ---- 경비 보고서: 그래프 그리기 (파이썬 없이 SVG 로) --------
const hoursOfEntries = () => TABLES[0].rows.map((r) => r.출입시);

function svgEl(tag, attrs, text) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function chartSvg(kind, marksIn) {     // marksIn: 그래프에 겹칠 표시 (없으면 정답 기준 reportMarks)
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

  // 진짜 이상(빨강)과 오신고(주황)가 있었던 시각을 세로 점선과 층 번호로 표시
  let prev = null, row = 0;
  (marksIn || reportMarks()).slice().sort((p, q) => p.hour - q.hour).forEach((a) => {
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

// 보고서에 실을 기록 (영상 시각 = cctvTime)
//   real  : 진짜 이상이었던 층 (answer: report)
//   false : 오신고 — 정상인데 플레이어가 REPORT 를 누른 층
function reportMarks() {
  const info = (f, kind) => ({ kind, floor: f.floor, anomaly: f.anomaly, time: f.cctvTime.slice(6), hour: Number(f.cctvTime.slice(6, 8)) });
  const real = FLOORS.filter((f) => f.answer === "report").map((f) => info(f, "real"));
  const wrong = FLOORS.filter((f) => f.answer === "next" &&
    state.results.some((r) => r.floor === f.floor && r.choice === "report")).map((f) => info(f, "false"));
  return real.concat(wrong);
}
const nightOrder = (a, b) => ((a.hour + 12) % 24) - ((b.hour + 12) % 24);   // 낮 12시부터 다음 날 오전까지 시간 순

// 보고서용 표: 구분 · 층 · 이상현상 · 시각 · 내 판단
function anomalyTable() {
  const marks = reportMarks().sort(nightOrder);
  const real = marks.filter((m) => m.kind === "real"), wrong = marks.filter((m) => m.kind === "false");
  const wrap = mk("div", "anomaly-log");
  wrap.appendChild(mk("h3", "", "오늘 밤 이상 기록"));
  const t = mk("table", "data-table");
  const trh = mk("tr");
  ["구분", "층", "이상현상", "시각", "내 판단"].forEach((c) => trh.appendChild(mk("th", "", c)));
  const thead = mk("thead"); thead.appendChild(trh); t.appendChild(thead);
  const tbody = mk("tbody");
  marks.forEach((a) => {
    const r = state.results.find((x) => x.floor === a.floor);
    const tr = mk("tr", a.kind === "false" ? "false-report" : "");
    tr.append(
      mk("td", "kind " + a.kind, a.kind === "real" ? "진짜 이상" : "오신고"),
      mk("td", "", `${a.floor}층`), mk("td", "", a.anomaly), mk("td", "time", a.time));
    tr.appendChild(mk("td", r && r.correct ? "ok" : "ng", r ? (r.choice === "report" ? "REPORT" : "이상 없음") + (r.correct ? " (O)" : " (X)") : "-"));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  wrap.appendChild(t);
  let text = `진짜 이상 ${real.length}건은 모두 ${real[0].time} ~ ${real[real.length - 1].time} 사이에 일어났어요. 그래프의 빨간 점선이 그 시각이에요.`;
  if (wrong.length) text += ` 오신고 ${wrong.length}건(주황 점선)은 데이터로 설명되는 정상 상황이었어요.`;
  wrap.appendChild(mk("p", "hint", text));
  return wrap;
}

function renderReport() {
  const panel = $("report-panel");
  panel.innerHTML = "";
  panel.appendChild(anomalyTable());
  const box = mk("div", "inv-step");
  box.appendChild(mk("p", "inv-concept", `오늘의 개념 · ${REPORT.concept}`));
  box.appendChild(mk("p", "inv-question", REPORT.question));
  const pick = state.reportPick;
  box.appendChild(sentenceLine(REPORT.sentence, pick === null ? null : REPORT.cards[pick].word));
  const cardRow = mk("div", "cards");
  REPORT.cards.forEach((c, j) => {
    const b = mk("button", "card" + (j === pick ? " picked" : ""));
    b.type = "button";
    b.appendChild(mk("b", "card-word", c.word));
    b.appendChild(mk("span", "", c.meaning));
    b.addEventListener("click", () => {
      state.reportPick = j;
      if (c.key) Sfx.correct(); else Sfx.click();
      renderReport();
    });
    cardRow.appendChild(b);
  });
  box.appendChild(cardRow);
  if (pick !== null) {
    const card = REPORT.cards[pick];
    const note = mk("p", "inv-note" + (card.key ? " key" : ""), card.note);
    const fig = mk("div", "figure");
    fig.appendChild(chartSvg(card.fill));
    box.append(note, fig);
  }
  panel.appendChild(box);
  $("btn-submit").disabled = pick === null;
}

function showReport() {
  el.game.classList.add("hidden");
  $("report").classList.remove("hidden");
  CctvView.stop();
  state.reportPick = null;
  renderReport();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  ui = null;
  if (m.onClose) m.onClose();
  if (m.opener && document.contains(m.opener) && !m.opener.disabled) m.opener.focus();
}

// ---- 책(기록) 창 ------------------------------------------
const stepsFor = (tableKey) => {
  const v = TABLES.find((t) => t.key === tableKey).varName;
  return casesFor().map((s, i) => [s, i]).filter(([s]) => s.code.includes(v)).map(([, i]) => i);
};

const isKey = (i) => state.picks[i] !== null && state.picks[i] !== undefined && casesFor()[i].cards[state.picks[i]].key;

function updateBadges() {
  TABLES.forEach((t) => {
    const idx = stepsFor(t.key), badge = $("badge-" + t.key);
    if (!badge) return;
    const found = idx.filter(isKey).length;
    badge.textContent = idx.length ? `단서 ${found}/${idx.length}` : "";
    badge.classList.toggle("done", idx.length > 0 && found === idx.length);
  });
}

function renderStepState() {
  ui.indexes.forEach((i) => {
    const step = casesFor()[i], pick = state.picks[i], s = ui.steps[i];
    s.line.replaceWith(s.line = sentenceLine(step.sentence, pick === null ? null : step.cards[pick].word));
    s.cards.forEach((b, j) => b.classList.toggle("picked", ui.view === i && j === pick));
    s.box.classList.toggle("active", ui.view === i);
  });
}

function pickCard(i, j) {
  state.picks[i] = j;
  ui.view = i;                                 // 표가 이 카드대로 바뀐다
  if (casesFor()[i].cards[j].key) Sfx.correct(); else Sfx.click();
  renderStepState();
  renderBookView(true);
  renderClueCount();
}

function renderClueCount() {
  const found = ui.indexes.filter(isKey).length;
  ui.clues.textContent = `찾은 단서 ${found} / ${ui.indexes.length}`;
  ui.clues.classList.toggle("done", found === ui.indexes.length);
  updateBadges();
}

// 오른쪽 표: 처음엔 전체가 다 열려 있고, 카드를 누르면 그 말대로 바뀐다
function renderBookView(flash) {
  const t = ui.table;
  ui.tableBox.innerHTML = "";
  ui.note.innerHTML = "";
  const full = ui.view === null;
  ui.reset.disabled = full;
  ui.evToggle.classList.toggle("hidden", !(view.reveal && full));

  if (full) {
    let rows = t.rows;
    if (view.evidenceOnly) rows = rows.filter((r) => currentFloor().evidence.includes(r.id));
    ui.caption.textContent = `${t.title} 전체 · ${rows.length}행` + (view.evidenceOnly ? " (근거 행만)" : "");
    ui.tableBox.appendChild(tableEl(t, rows, () => renderBookView()));
  } else {
    const step = casesFor()[ui.view], card = step.cards[state.picks[ui.view]], res = card.result();
    if (res.kind === "rows") {
      ui.caption.textContent = `${filledSentence(step, card)} → ${t.rows.length}행 중 ${res.rows.length}행`;
      ui.tableBox.appendChild(tableEl(t, res.rows, () => renderBookView()));
    } else if (res.kind === "series") {
      ui.caption.textContent = `${filledSentence(step, card)} → ${res.items.length}묶음`;
      ui.tableBox.appendChild(seriesTable(res));
    } else {
      ui.caption.textContent = `${filledSentence(step, card)} → ${res.values.length}개`;
      const list = mk("div", "value-list big");
      res.values.forEach((v) => list.appendChild(mk("span", "chip" + (v === null ? " na" : ""), v === null ? "NaN" : String(v))));
      ui.tableBox.appendChild(list);
    }
    ui.note.appendChild(mk("p", "inv-note" + (card.key ? " key" : ""), (card.key ? "단서 발견! " : "") + (card.note || "")));
  }
  ui.tableBox.scrollTop = 0;
  if (flash) { ui.tableBox.classList.remove("flash"); void ui.tableBox.offsetWidth; ui.tableBox.classList.add("flash"); }
}

const filledSentence = (step, card) => step.sentence.replace("____", card.word);

function buildSteps(indexes) {
  const wrap = mk("div", "book-steps");
  const head = mk("div", "inv-head");
  head.appendChild(mk("h3", "", "기록 조사"));
  ui.clues = mk("span", "clue-count");
  head.appendChild(ui.clues);
  wrap.appendChild(head);
  wrap.appendChild(mk("p", "hint", "빈칸에 들어갈 낱말 카드를 눌러 보세요. 오른쪽 표가 그 말대로 바뀌어요. 틀린 카드를 눌러도 괜찮아요."));

  ui.steps = [];
  indexes.forEach((i) => {
    const step = casesFor()[i];
    const box = mk("div", "inv-step");
    box.appendChild(mk("p", "inv-concept", `오늘의 개념 · ${step.concept}`));
    box.appendChild(mk("p", "inv-question", step.question));
    const line = sentenceLine(step.sentence, null);
    box.appendChild(line);
    const cardRow = mk("div", "cards");
    const cards = step.cards.map((c, j) => {
      const b = mk("button", "card");
      b.type = "button";
      b.appendChild(mk("b", "card-word", c.word));
      b.appendChild(mk("span", "", c.meaning));
      b.addEventListener("click", () => pickCard(i, j));
      cardRow.appendChild(b);
      return b;
    });
    box.appendChild(cardRow);
    wrap.appendChild(box);
    ui.steps[i] = { box, line, cards };
  });
  return wrap;
}

function openBook(tableKey) {
  const t = TABLES.find((x) => x.key === tableKey);
  view.sortKey = null; view.sortDir = 1; view.evidenceOnly = false;
  const idx = stepsFor(tableKey);
  const m = openModal({ title: `${t.title} (${t.rows.length}행)`, cls: `book-window book-${tableKey}-win` + (idx.length ? "" : " single") });
  ui = { key: tableKey, table: t, view: null, indexes: idx, steps: [] };
  state.booksOpened += 1;
  Sfx.open();

  const layout = mk("div", "book-layout");
  if (idx.length) layout.appendChild(buildSteps(idx));

  const pane = mk("div", "book-table");
  const bar = mk("div", "book-bar");
  ui.caption = mk("span", "book-caption");
  ui.reset = mk("button", "", "전체 표로 돌아가기"); ui.reset.type = "button";
  ui.reset.addEventListener("click", () => { ui.view = null; if (ui.steps.length) renderStepState(); renderBookView(true); });
  ui.evToggle = mk("label", "ev-toggle hidden");
  const cb = mk("input"); cb.type = "checkbox";
  cb.addEventListener("change", () => { view.evidenceOnly = cb.checked; renderBookView(); });
  ui.evToggle.append(cb, document.createTextNode(" 근거 행만 보기"));
  bar.append(ui.caption, ui.evToggle, ui.reset);
  ui.note = mk("div", "book-note");
  ui.tableBox = mk("div", "table-scroll book-scroll");
  pane.append(bar, ui.note, ui.tableBox);
  layout.appendChild(pane);
  m.body.appendChild(layout);

  if (idx.length) { renderStepState(); renderClueCount(); }
  renderBookView();
}

// ---- 오늘의 코드 풀이 (다음 층으로 넘어가기 전에) -----------
// 플레이 중에는 숨겨 둔 정확한 코드를, 방금 한 일과 짝지어 설명해 준다.
function openLesson({ title, steps, doneLabel, onDone }) {
  const m = openModal({ title, cls: "lesson" });
  ui = null;
  m.body.appendChild(mk("p", "lesson-intro", "방금 카드로 한 일을, 컴퓨터는 이런 코드로 말해요. 외울 필요는 없어요. 말과 코드를 한 줄씩 짝지어 읽어 보세요."));
  steps.forEach((step) => {
    const card = step.chosen !== undefined && step.chosen !== null ? step.cards[step.chosen] : (step.cards.find((c) => c.key) || step.cards[0]);
    const box = mk("section", "lesson-step");
    box.appendChild(mk("h3", "", step.term || step.concept));
    box.appendChild(mk("p", "lesson-q", step.question));
    const r1 = mk("div", "lesson-row"); r1.append(mk("span", "lesson-tag", "말로 풀면"), sentenceLine(step.sentence, card.word));
    const r2 = mk("div", "lesson-row"); r2.append(mk("span", "lesson-tag", "코드로는"), codeBlock(step.code, card.fill));
    box.append(r1, r2);
    const ul = mk("ul", "lesson-explain");
    step.explain.forEach(([code, meaning]) => {
      const li = mk("li");
      li.append(mk("code", "", code), document.createTextNode(" — " + meaning));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    m.body.appendChild(box);
  });
  const actions = mk("div", "check-actions");
  const go = mk("button", "primary", doneLabel); go.type = "button";
  go.addEventListener("click", () => { closeModal(); onDone(); });
  actions.appendChild(go);
  m.body.appendChild(actions);
  go.focus();
}

// 층을 마치고 「다음 층으로」를 누르면: 코드 풀이 창 → 다음 층
function openLessonThenProceed() {
  const f = currentFloor();
  openLesson({ title: `오늘의 코드 풀이 · ${f.floor}층`, steps: casesFor(), doneLabel: continueLabel(), onDone: proceed });
}

// ---- 체크리스트 (✓/✗ 를 누르면 쓴다) -----------------------
const newCheck = () => ({ answers: {}, status: {}, attempts: 0, locked: null, verdictCorrect: null, firstCorrect: null, revealed: false, done: false });

function renderPinned() {
  const box = $("pinned");
  box.innerHTML = "";
  box.appendChild(mk("h4", "", "순찰 체크리스트"));
  const ol = mk("ol");
  CHECK_ITEMS.forEach((it) => ol.appendChild(mk("li", "", it.label)));
  box.appendChild(ol);
  box.setAttribute("aria-label", "벽에 붙은 순찰 체크리스트 그림: " + CHECK_ITEMS.map((it) => it.label).join(" / "));
}

function openChecklist(choice) {
  if (state.answered && !(state.check && state.check.done === false)) return;
  const c = state.check;
  if (c.locked) choice = c.locked;                         // 판정이 확정된 뒤에는 처음 고른 답으로 이어 쓴다
  const f = currentFloor(), cl = CHECKLISTS[f.floor];
  const m = openModal({ title: `순찰 일지 · ${f.floor}층${f.place ? " " + f.place : ""}`, cls: "paper" });
  ui = null;
  Sfx.open();

  const render = () => {
    m.body.innerHTML = "";
    m.body.appendChild(mk("p", "choice-banner " + (choice === "report" ? "bad" : "ok"),
      choice === "report" ? "✗ REPORT — 이상으로 신고합니다" : "✓ 이상 없음 — 다음 층으로 갑니다"));

    if (c.attempts > 0) {
      m.body.appendChild(mk("p", "result-box " + (c.verdictCorrect ? "ok" : "ng"),
        c.verdictCorrect ? "판정 결과: 정답! 이상 여부를 제대로 가려냈어요." : "판정 결과: 오답... 실패 +1 (하트가 줄었어요)"));
    }
    if (!c.done) {
      m.body.appendChild(mk("p", "paper-note",
        c.attempts === 0
          ? "5가지를 모두 고르고 제출하면 판정이 확정돼요. 근거가 헷갈리면 「닫기」를 누르고 책을 다시 확인하세요. (고른 답은 남아 있어요)"
          : "틀린 문항(✗)만 다시 골라 보세요. 책에서 근거를 다시 찾아보면 돼요. 한 번 더 틀리면 정답을 알려 드려요."));
    }

    const form = mk("div", "check-form");
    CHECK_ITEMS.forEach((it, n) => {
      const spec = cl[it.key], st = c.status[it.key];
      const fs = mk("fieldset", "check-item" + (st === "right" ? " right" : st === "wrong" ? " wrong" : ""));
      const lg = mk("legend", "", `${n + 1}. ${it.label}`);
      if (st === "right") lg.appendChild(mk("span", "check-mark", "✓ 맞아요"));
      if (st === "wrong") lg.appendChild(mk("span", "check-mark", "✗ 다시 확인해 보세요"));
      fs.appendChild(lg);
      if (spec.q) fs.appendChild(mk("p", "q", spec.q));
      const opts = mk("div", "opts");
      spec.options.forEach((txt, j) => {
        const lab = mk("label", "opt" + (c.revealed && j === spec.answer ? " answer" : ""));
        const inp = mk("input"); inp.type = "radio"; inp.name = "chk-" + it.key; inp.value = String(j);
        inp.checked = c.answers[it.key] === j;
        inp.disabled = c.done || st === "right";
        inp.addEventListener("change", () => { c.answers[it.key] = j; updateSubmit(); });
        lab.append(inp, mk("span", "", txt + (c.revealed && j === spec.answer ? "  ← 정답" : "")));
        opts.appendChild(lab);
      });
      fs.appendChild(opts);
      form.appendChild(fs);
    });
    m.body.appendChild(form);

    const actions = mk("div", "check-actions");
    if (!c.done) {
      const submit = mk("button", "primary", c.attempts === 0 ? "제출 (판정 확정)" : "다시 제출");
      submit.type = "button";
      submit.addEventListener("click", () => submitChecklist(choice, render));
      m.submit = submit;
      actions.appendChild(submit);
      const cancel = mk("button", "", "닫기 (아직 제출 안 함)"); cancel.type = "button";
      cancel.addEventListener("click", () => closeModal());
      actions.appendChild(cancel);
    } else {
      m.body.appendChild(mk("p", "result-box " + (c.verdictCorrect ? "ok" : "ng"),
        (c.verdictCorrect ? "정답! 스테이지 클리어.\n" : "오답... 실패 +1\n") + f.explanation +
        (c.revealed ? "\n(체크리스트 정답은 위에 표시했어요.)" : "") + "\n(책을 열면 노랗게 표시된 행이 이번 층의 판단 근거예요.)"));
      const go = mk("button", "primary", continueLabel()); go.type = "button";
      go.addEventListener("click", () => openLessonThenProceed());
      actions.appendChild(go);
      const close = mk("button", "", "닫기"); close.type = "button";
      close.addEventListener("click", () => closeModal());
      actions.appendChild(close);
    }
    m.body.appendChild(actions);
    updateSubmit();
  };
  const updateSubmit = () => {
    if (m.submit) m.submit.disabled = !CHECK_ITEMS.every((it) => c.answers[it.key] !== undefined);
  };
  render();
}

const continueLabel = () => {
  const isLast = state.idx === FLOORS.length - 1;
  const gameOver = state.fails >= MAX_FAILS && !isLast;     // 마지막 층 도달 전 실패 3회 → 탈락
  return gameOver ? "결과 보기" : isLast ? "보고서 쓰러 가기 ▶" : "다음 층으로 ▶";
};

function submitChecklist(choice, rerender) {
  const c = state.check, f = currentFloor(), cl = CHECKLISTS[f.floor];
  if (c.attempts === 0) {                                   // 첫 제출에서 판정이 확정된다 (하트는 판정만 깎는다)
    c.locked = choice;
    c.verdictCorrect = choice === f.answer;
    if (!c.verdictCorrect) state.fails += 1;
    state.results.push({
      floor: f.floor, anomaly: f.anomaly, correct: c.verdictCorrect, choice, answer: f.answer,
      openedBooks: state.booksOpened, found: state.found, checkFirst: 0, checkTotal: CHECK_ITEMS.length,
    });
    renderHearts();
    if (c.verdictCorrect) Sfx.correct(); else Sfx.wrong();
  }
  CHECK_ITEMS.forEach((it) => { c.status[it.key] = c.answers[it.key] === cl[it.key].answer ? "right" : "wrong"; });
  const right = CHECK_ITEMS.filter((it) => c.status[it.key] === "right").length;
  if (c.attempts === 0) {
    c.firstCorrect = right;
    state.results[state.results.length - 1].checkFirst = right;
  }
  c.attempts += 1;
  const all = right === CHECK_ITEMS.length;
  if (!all) Sfx.click();
  if (all || c.attempts >= 2) {                             // 전부 맞았거나, 두 번째도 틀렸으면 정답을 보여 주고 통과
    c.revealed = !all;
    finishFloor();
  }
  rerender();
}

function finishFloor() {
  state.answered = true;
  state.check.done = true;
  view.reveal = true;
  el.btnReport.disabled = true;
  el.btnNext.disabled = true;
  el.btnContinue.textContent = continueLabel();
  el.btnContinue.classList.remove("hidden");
  el.status.textContent = `${currentFloor().floor}층 순찰 일지를 제출했어요.`;
}

// ---- 흐름 -------------------------------------------------
function startFloor() {
  const f = currentFloor();
  closeModal();
  ui = null;
  state.answered = false;
  Object.assign(view, { sortKey: null, sortDir: 1, evidenceOnly: false, reveal: false });
  el.floor.textContent = `${f.floor}층${f.place ? " " + f.place : ""} / ${FLOORS.length}층`;
  renderCctv(f);
  el.status.textContent = "";
  ["entry", "delivery"].forEach((k) => { const b = $("badge-" + k); if (b) b.textContent = ""; });
  Inv.startFloor(f);
}

function proceed() {
  const isLast = state.idx === FLOORS.length - 1;
  if (state.fails >= MAX_FAILS && !isLast) return showEnding(false);
  if (isLast) return showReport();           // 마지막 층 뒤에는 경비 보고서(그래프) → 엔딩
  Sfx.click();
  state.idx += 1;
  rideLift(currentFloor().floor);
  startFloor();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showEnding(success) {
  el.game.classList.add("hidden");
  $("report").classList.add("hidden");
  el.ending.classList.remove("hidden");
  CctvView.stop();

  // 보고서에 붙인 그래프를 엔딩에 싣는다 (실패 엔딩에는 없음)
  const rep = $("ending-report");
  rep.classList.toggle("hidden", !(success && state.reportPick !== null));
  if (success && state.reportPick !== null) {
    const card = REPORT.cards[state.reportPick];
    $("ending-chart").innerHTML = "";
    $("ending-chart").appendChild(chartSvg(card.fill));
    $("ending-chart").appendChild(anomalyTable());
    $("ending-chart-note").textContent = `${card.word} · ${card.note}`;
  }
  Sfx.stopAmbience();
  if (success) Sfx.win(); else Sfx.lose();
  renderCourse();

  $("ending-title").textContent = success ? "근무 완료! 보고서 제출" : "근무 실패...";
  $("ending-msg").textContent = success
    ? "오늘 밤도 무사히 넘겼어요. 수고하셨습니다, 경비원 아저씨!"
    : "오신고가 3번 쌓여서 해고됐어요. 다시 도전해 보세요!";

  const correctCount = state.results.filter((r) => r.correct).length;
  const docRight = state.results.reduce((n, r) => n + r.checkFirst, 0), docAll = state.results.reduce((n, r) => n + r.checkTotal, 0);
  $("ending-score").textContent = `판정 정답 ${correctCount} / ${state.results.length}  (실패 ${state.fails}) · 서류 정확도 ${docRight} / ${docAll}`;

  const tbody = $("result-body");
  tbody.innerHTML = "";
  const label = (v) => (v === "report" ? "REPORT" : "NEXT");
  state.results.forEach((r) => {
    const tr = mk("tr");
    [`${r.floor}층`, r.anomaly, label(r.choice), label(r.answer), r.correct ? "O" : "X", `${r.checkFirst}/${r.checkTotal}`].forEach((txt) => tr.appendChild(mk("td", "", txt)));
    tbody.appendChild(tr);
  });
}

// 층 사이 이동 연출 (엘리베이터)
function rideLift(floorNo) {
  const lift = $("lift");
  $("lift-text").textContent = `▲ ${floorNo}층`;
  lift.classList.remove("hidden");
  Sfx.open();
  setTimeout(() => lift.classList.add("hidden"), 1100);
}

// 엔딩의 강좌 안내. 강좌명·링크는 data.js 의 COURSE 에서 읽는다 (비어 있으면 일반 문구).
function renderCourse() {
  const c = typeof COURSE === "object" && COURSE ? COURSE : {};
  const where = c.name ? `중앙대학교 K-MOOC 「${c.name}」` : "중앙대학교 K-MOOC 강좌";
  $("course-text").textContent =
    "눈으로 본 것(영상)을 그대로 믿지 않고, 조건 필터 · groupby · 결측치 확인 · 시각화로 데이터에서 근거를 찾았어요. " +
    `이게 탐색적 데이터 분석(EDA)이에요. ${where}에서 제대로 배워 보세요.` + (c.blurb ? " " + c.blurb : "");
  const link = $("course-link");
  link.href = c.url || "https://www.kmooc.kr";
  link.textContent = c.name ? `「${c.name}」 강좌 보러 가기 ↗` : "K-MOOC 에서 강좌 찾아보기 ↗";
}

function restart() {
  state.idx = 0;
  state.fails = 0;
  state.results = [];
  el.ending.classList.add("hidden");
  $("report").classList.add("hidden");
  state.reportPick = null;
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
$("pinned").addEventListener("click", () => Inv.openRules());
$("cctv-time").addEventListener("click", () => Inv.onClock());
$("btn-restart").addEventListener("click", restart);

$("btn-start").addEventListener("click", begin);
setupWalk();
$("btn-submit").addEventListener("click", () => openLesson({
  title: "오늘의 코드 풀이 · 경비 보고서", steps: [Object.assign({}, REPORT, { chosen: state.reportPick })],
  doneLabel: "근무 마치기 ▶", onDone: () => showEnding(true),
}));
el.btnMute.addEventListener("click", toggleMute);

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

