// ============================================================
// investigate.js — 조사 흐름 (설계: design/flow-investigator.md)
//   ① 조사: 책(출입표 · 택배장부)을 열고, 드롭다운으로 렌즈 문장을 골라 기록을 필터링한다
//           아래 고급 모드에서는 pandas 코드를 직접 써서 실행할 수 있다 (advanced.js)
//   ② 잇기: 장부 포스트잇을 📌 꽂아 와서, REPORT 보드의 "영상 단서" 카드와 실로 잇는다 (= 설명됨 / ≠ 어긋남, 확인 3회)
//   ③ 판정: ✓ 정상 / ✗ 신고 도장. 맞았는지는 바로 알려 주지 않는다 → 정산서에서 공개
//   ④ 풀이: 내가 쓴 렌즈가 pandas 코드로 나온다
//   마지막: 경비 보고서(그래프 + 내 ✗ 도장) → 큰 미스터리 보드 → 정산서
// game.js 의 mk / $ / el / openModal / closeModal / currentFloor / proceed / restart / chartSvg / sentenceLine 을 쓴다.
// ============================================================

const Inv = (() => {
  const MAX_CHECKS = 3;          // 보드마다 확인 횟수
  const NUMERIC = ["소리"];                       // 숫자 열
  const ORDERED = ["출입시간", "배달도착날짜", "배달주문날짜"];   // 순서가 있는 글자 열 (크기 비교 가능)
  const NULL = "비어 있음";      // 드롭다운에서 빈 값(NaN)을 뜻하는 보기
  const VERDICTS = ["설명된다", "설명되지 않는다"];

  let s = null;                  // 이 층(또는 미스터리)의 조사 상태
  let night = null;              // 밤 전체 상태

  const freshNight = () => ({ log: [], mystery: null, chart: null });
  const freshBoard = () => ({ board: {}, checksLeft: MAX_CHECKS, checksUsed: 0, feedback: "", solved: false, firstTry: null });
  const freshFloor = (floor) => Object.assign(freshBoard(), { floor, lenses: [], stamp: null, lensDraft: {}, found: false, pins: [], links: {} });

  // ---------- 받침에 맞는 조사 ----------
  function hasBatchim(word) {
    const m = String(word).match(/[가-힣0-9A-Za-z](?=[^가-힣0-9A-Za-z]*$)/);
    if (!m) return true;
    const ch = m[0];
    if (/[0-9]/.test(ch)) return "013678".includes(ch);
    if (/[A-Za-z]/.test(ch)) return /[lmnrLMNR]/.test(ch);
    return (ch.charCodeAt(0) - 0xac00) % 28 !== 0;
  }
  const isRieul = (word) => { const m = String(word).match(/[가-힣](?=[^가-힣]*$)/); return m && (m[0].charCodeAt(0) - 0xac00) % 28 === 8; };
  function josa(word, marker) {
    const b = hasBatchim(word);
    return { "(이)가": b ? "이" : "가", "(을)를": b ? "을" : "를", "(은)는": b ? "은" : "는", "(과)와": b ? "과" : "와",
      "(으)로": b && !isRieul(word) ? "으로" : "로" }[marker];
  }
  const JOSA_RE = /^(\(이\)가|\(을\)를|\(은\)는|\(과\)와|\(으\)로)/;

  // ---------- 드롭다운 ----------
  // items: [{ value, label }] (value 는 아무 값이나), current: 지금 고른 value
  function dropdown(items, current, placeholder, onPick, cls) {
    const sel = mk("select", "dd " + (cls || ""));
    const ph = mk("option", "", placeholder); ph.value = "";
    sel.appendChild(ph);
    let found = false;
    items.forEach((it, i) => {
      const o = mk("option", "", it.label); o.value = String(i);
      if (current !== undefined && current !== null && it.value === current) { o.selected = true; found = true; }
      sel.appendChild(o);
    });
    if (!found) ph.selected = true;
    sel.classList.toggle("empty", !found);
    sel.addEventListener("change", () => onPick(sel.value === "" ? null : items[Number(sel.value)].value));
    return sel;
  }
  const asItems = (list) => list.map((v) => ({ value: v, label: String(v) }));

  // ---------- 렌즈: 계산 ----------
  const isNum = (col) => NUMERIC.includes(col);
  const condReady = (c) => c.col && c.val !== null && c.val !== undefined;
  const isNull = (v) => v === null || v === undefined;

  function testCond(r, c) {
    const a = r[c.col];
    if (c.val === NULL) return isNull(a) === (c.op === "eq");
    if (isNull(a)) return c.op === "ne";                           // pandas: NaN 은 어떤 값과도 같지 않다
    const x = isNum(c.col) ? Number(a) : String(a), y = isNum(c.col) ? Number(c.val) : String(c.val);
    return { eq: x === y, ne: x !== y, ge: x >= y, le: x <= y }[c.op];
  }

  function runLens(table, L) {
    const rows = table.rows;
    switch (L.type) {
      case "cmp": {
        const conds = L.conds.filter(condReady);
        if (!conds.length) return { kind: "rows", rows, idle: true };
        return { kind: "rows", rows: rows.filter((r) => (L.join === "or" ? conds.some((c) => testCond(r, c)) : conds.every((c) => testCond(r, c)))) };
      }
      case "unique":
        if (!L.col) return { kind: "rows", rows, idle: true };
        return { kind: "values", col: L.col, values: [...new Set(rows.map((r) => r[L.col]))] };
      case "null":
        if (!L.col) return { kind: "rows", rows, idle: true };
        return { kind: "rows", rows: rows.filter((r) => isNull(r[L.col]) === (L.mode === "null")) };
      case "isin": {
        const vals = L.vals.filter((v) => v !== null && v !== undefined);
        if (!L.col || !vals.length) return { kind: "rows", rows, idle: true };
        const set = new Set(vals.map(String));
        return { kind: "rows", rows: rows.filter((r) => !isNull(r[L.col]) && set.has(String(r[L.col]))) };
      }
      case "group": {
        if (!L.col) return { kind: "rows", rows, idle: true };
        const m = new Map();
        rows.forEach((r) => { const k = isNull(r[L.col]) ? "NaN" : r[L.col]; m.set(k, (m.get(k) || 0) + 1); });
        return { kind: "series", col: L.col, items: [...m.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]), "ko", { numeric: true })) };
      }
      case "stat": {
        if (!L.col) return { kind: "rows", rows, idle: true };
        const w = L.where || {};
        const picked = w.col && w.val !== null && w.val !== undefined ? rows.filter((r) => testCond(r, { col: w.col, op: "eq", val: w.val })) : rows;
        const vals = picked.map((r) => r[L.col]).filter((v) => !isNull(v));
        if ((L.fn === "mean" || L.fn === "sum") && !isNum(L.col)) return { kind: "msg", text: "평균과 합은 숫자 열(소리)에서만 구할 수 있어요." };
        if (!vals.length) return { kind: "msg", text: "조건에 맞는 값이 없어요." };
        let v;
        if (L.fn === "max") v = vals.reduce((a, b) => (isNum(L.col) ? (Number(b) > Number(a) ? b : a) : (b > a ? b : a)));
        if (L.fn === "min") v = vals.reduce((a, b) => (isNum(L.col) ? (Number(b) < Number(a) ? b : a) : (b < a ? b : a)));
        if (L.fn === "sum") v = vals.reduce((a, b) => a + Number(b), 0);
        if (L.fn === "mean") v = Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 10) / 10;
        return { kind: "stat", col: L.col, fn: L.fn, value: v };
      }
    }
    return { kind: "rows", rows, idle: true };
  }

  // ---------- 렌즈: 말과 코드 ----------
  const OP_WORD = { eq: "같은", ne: "다른", ge: "보다 크거나 같은", le: "보다 작거나 같은" };
  const OP_CODE = { eq: "==", ne: "!=", ge: ">=", le: "<=" };
  const FN_WORD = { max: "가장 큰", min: "가장 작은", mean: "평균", sum: "합" };

  function condText(c) {
    const col = c.col || "[열]", val = c.val === null || c.val === undefined ? "[값]" : String(c.val);
    const cj = c.col ? josa(col, "(이)가") : "이(가)";
    if (c.val === NULL) return `${col}${cj} ${c.op === "eq" ? "비어 있는" : "채워진"}`;
    if (c.op === "ge" || c.op === "le") return `${col}${cj} ${val} ${OP_WORD[c.op]}`;
    return `${col}${cj} ${val}${condReady(c) ? josa(val, "(과)와") : "와(과)"} ${OP_WORD[c.op]}`;
  }

  function lensSentence(table, L) {
    const T = table.title;
    switch (L.type) {
      case "cmp": {
        const conds = L.conds.filter(condReady);
        const parts = (conds.length ? conds : L.conds).map(condText);
        return `${T}에서 ${parts.join(L.join === "or" ? " 이거나 " : " 이고 ")} 내용만 보기`;
      }
      case "unique": return `${T}의 ${L.col}에 어떤 값들이 있는지 모아 보기`;
      case "null": return `${T}에서 ${L.col}${josa(L.col, "(이)가")} ${L.mode === "null" ? "비어 있는" : "채워진"} 내용만 보기`;
      case "isin": return `${T}에서 ${L.col}${josa(L.col, "(이)가")} ${L.vals.join(", ")} 중 하나인 내용만 보기`;
      case "group": return `${T}${josa(T, "(을)를")} ${L.col}별로 묶어서 세기`;
      case "stat": {
        const w = L.where || {};
        return w.col && w.val !== null && w.val !== undefined
          ? `${T}에서 ${w.col}${josa(w.col, "(이)가")} ${w.val}인 내용의 ${L.col}에서 ${FN_WORD[L.fn]} 값 찾기`
          : `${T}의 ${L.col}에서 ${FN_WORD[L.fn]} 값 찾기`;
      }
    }
    return "";
  }

  const lit = (col, v) => (isNum(col) ? String(Number(v)) : `'${v}'`);
  function condCode(df, c) {
    if (c.val === NULL) return `${df}['${c.col}'].${c.op === "eq" ? "isnull" : "notnull"}()`;
    return `${df}['${c.col}'] ${OP_CODE[c.op]} ${lit(c.col, c.val)}`;
  }

  function lensCode(table, L) {
    const df = table.varName;
    switch (L.type) {
      case "cmp": {
        const conds = L.conds.filter(condReady);
        if (!conds.length) return df;
        if (conds.length === 1) return `${df}[ ${condCode(df, conds[0])} ]`;
        return `${df}[ ${conds.map((c) => `(${condCode(df, c)})`).join(L.join === "or" ? " | " : " & ")} ]`;
      }
      case "unique": return L.col ? `${df}['${L.col}'].unique()` : df;
      case "null": return L.col ? `${df}[ ${df}['${L.col}'].${L.mode === "null" ? "isnull" : "notnull"}() ]` : df;
      case "isin": {
        const vals = L.vals.filter((v) => v !== null && v !== undefined);
        return L.col && vals.length ? `${df}[ ${df}['${L.col}'].isin([${vals.map((v) => lit(L.col, v)).join(", ")}]) ]` : df;
      }
      case "group": return L.col ? `${df}.groupby('${L.col}').size()` : df;
      case "stat": {
        if (!L.col) return df;
        const w = L.where || {};
        const base = w.col && w.val !== null && w.val !== undefined ? `${df}[ ${condCode(df, { col: w.col, op: "eq", val: w.val })} ]` : df;
        return `${base}['${L.col}'].${L.fn}()`;
      }
    }
    return df;
  }

  const TYPE_EXPLAIN = {
    cmp: [["df['열'] == 값", "열의 값이 같은지 줄마다 검사해요. 다르면 !=, 크거나 같으면 >=, 작거나 같으면 <= 예요."],
          ["(조건1) & (조건2)", "& 는 '이고', | 는 '이거나'예요. 조건마다 괄호로 묶어요."],
          ["df[ 검사 ]", "검사를 통과한 줄만 남겨요. 이게 렌즈예요."]],
    unique: [[".unique()", "같은 값은 한 번만, 어떤 값들이 있는지 목록으로 보여 줘요."]],
    null: [[".isnull() / .notnull()", "칸이 비어 있으면(NaN) 참 / 값이 있으면 참이에요. 빈 줄을 지우는 .dropna()도 있지만, 지우면 단서도 사라져요."]],
    isin: [[".isin([값, 값])", "목록 안에 들어 있는 값이면 참이에요."]],
    group: [[".groupby('열')", "같은 값끼리 묶어요."], [".size()", "묶음마다 줄 수를 세요."]],
    stat: [["df[ 조건 ]['열'].min()", "조건에 맞는 줄만 남긴 뒤, 그 열에서 가장 작은 값을 구해요."],
           [".max() / .min()", "가장 큰 값 / 가장 작은 값이에요. 시각에서는 가장 늦은 / 가장 이른 때예요."], [".mean() / .sum()", "평균 / 합이에요. 숫자 열(소리)에서 써요."]],
  };

  // ---------- 표 그리기 (렌즈 결과 · 고급 모드 공용) ----------
  const fmt = (v) => (isNull(v) ? "NaN" : typeof v === "boolean" ? (v ? "True" : "False")
    : typeof v === "number" && !Number.isInteger(v) ? String(Math.round(v * 10000) / 10000) : String(v));
  function rowsTable(columns, rows, withIndex) {
    const t = mk("table", "data-table");
    const trh = mk("tr");
    if (withIndex) trh.appendChild(mk("th", "idx", ""));
    columns.forEach((c) => trh.appendChild(mk("th", "", c)));
    const thead = mk("thead"); thead.appendChild(trh); t.appendChild(thead);
    const tb = mk("tbody");
    rows.forEach((r) => {
      const tr = mk("tr");
      if (withIndex) tr.appendChild(mk("td", "idx", String(r.__i ?? "")));
      columns.forEach((c) => {
        const v = r[c];
        tr.appendChild(mk("td", isNull(v) ? "na" : c === "빛감지" && v === "On" ? "light-on" : "", fmt(v)));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  function pairTable(head, items) {
    const t = mk("table", "data-table pair");
    const trh = mk("tr"); head.forEach((h) => trh.appendChild(mk("th", "", h)));
    const thead = mk("thead"); thead.appendChild(trh); t.appendChild(thead);
    const tb = mk("tbody");
    items.forEach(([k, v]) => { const tr = mk("tr"); tr.append(mk("td", k === "NaN" ? "na" : "", fmt(k)), mk("td", v === "NaN" ? "na" : "", fmt(v))); tb.appendChild(tr); });
    t.appendChild(tb);
    return t;
  }
  function chips(values) {
    const list = mk("div", "value-list big");
    values.forEach((v) => list.appendChild(mk("span", "chip" + (isNull(v) ? " na" : ""), fmt(v))));
    return list;
  }

  // ---------- 책 창: 렌즈 문장(드롭다운) + 표 + 고급 모드 ----------
  function columnValues(table, col) {
    const vals = [...new Set(table.rows.map((r) => r[col]).filter((v) => !isNull(v)))];
    vals.sort(isNum(col) ? (a, b) => a - b : (a, b) => String(a).localeCompare(String(b), "ko", { numeric: true }));
    const items = asItems(vals);
    if (table.rows.some((r) => isNull(r[col]))) items.push({ value: NULL, label: "비어 있음 (NaN)" });
    return items;
  }

  // ---------- 책 페이지: 동물 증명사진 1장 + 기록 한 줄 = 포스트잇 한 장 ----------
  const POSTIT = {
    entry: { main: "출입시간", rest: ["빛감지", "소리"] },
    delivery: { main: "제품", rest: ["배달도착날짜", "배달주문날짜"] },
  };
  // 같은 주민(who)의 줄끼리 한 페이지로. 미등록은 호수별로 한 페이지. 순서는 주민 명부 순, 미등록은 맨 뒤
  function pagesOf(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const key = r.who || "?" + (r.호수 ?? "");
      if (!map.has(key)) map.set(key, { who: r.who, first: r, rows: [] });
      map.get(key).rows.push(r);
    });
    const order = (p) => (p.who ? RESIDENTS.findIndex((x) => x.key === p.who) : 999);
    return [...map.values()].sort((a, b) => order(a) - order(b));
  }

  // taken: 코르크 보드로 떼어 간 줄(id). 그 자리에는 점선 자국만 남는다
  function pageEl(table, pg, no, taken) {
    const spec = POSTIT[table.key];
    const page = mk("article", "book-page" + (pg.who ? "" : " unknown"));
    const head = mk("div", "page-head");
    const photo = mk("div", "id-photo");
    photo.innerHTML = portraitSvg(pg.first.동물);
    const info = mk("dl", "page-info");
    table.columns.filter((c) => c !== spec.main && !spec.rest.includes(c)).forEach((c) => {
      const v = pg.first[c];
      info.append(mk("dt", "", c), mk("dd", isNull(v) ? "na" : "", fmt(v)));
    });
    head.append(photo, info);
    const board = mk("div", "postits");
    pg.rows.forEach((r) => {
      if (taken && taken.has(r.id)) { board.appendChild(mk("div", "postit taken", "보드로 떼어 감 →")); return; }
      board.appendChild(postitEl(table, r));
    });
    page.append(head, board, mk("span", "page-no", `- ${no} -`));
    return page;
  }

  // 기록 한 줄 = 포스트잇 한 장 (책 페이지 · 코르크 보드 공용)
  function postitEl(table, r) {
    const spec = POSTIT[table.key];
    const note = mk("div", "postit");
    if (s && !s.mysteryMode) {
      const pin = mk("button", "pin-btn"); pin.type = "button";
      pin.dataset.pin = r.id;
      paintPin(pin);
      pin.addEventListener("click", (e) => { e.stopPropagation(); togglePin(table, r); });
      note.appendChild(pin);
    }
    note.appendChild(mk("b", "pi-main" + (isNull(r[spec.main]) ? " na" : ""), fmt(r[spec.main])));
    spec.rest.forEach((c) => {
      const v = r[c];
      const line = mk("p", "pi-line");
      line.append(mk("span", "pi-k", c), mk("span", "pi-v" + (isNull(v) ? " na" : c === "빛감지" && v === "On" ? " on" : ""), fmt(v)));
      note.appendChild(line);
    });
    return note;
  }

  // 코르크 보드에 붙는 포스트잇: 압정 + 누구 기록인지 작은 증명사진 스티커
  function corkNote(table, r, i) {
    const note = postitEl(table, r);
    note.classList.add("cork-note");
    note.style.setProperty("--d", `${Math.min(i, 12) * 0.05}s`);
    const who = mk("div", "cn-who");
    const sticker = mk("span", "cn-photo");
    sticker.innerHTML = portraitSvg(r.동물);
    const name = mk("span", "cn-name" + (isNull(r.동물) ? " na" : ""), `${isNull(r.동물) ? "미등록" : r.동물} · ${isNull(r.호수) ? "호수 없음" : r.호수 + "호"}`);
    if (table.key === "entry") name.appendChild(mk("small", "cn-rrn" + (isNull(r.주민등록번호) ? " na" : ""), fmt(r.주민등록번호)));
    who.append(sticker, name);
    note.prepend(mk("span", "pin"), who);
    return note;
  }

  // 코르크 보드에 붙는 결과 메모 (값 모아 보기 · 묶어서 세기 · 가장 큰/작은 값)
  function corkMemo(title, content) {
    const memo = mk("div", "postit cork-note memo");
    memo.append(mk("span", "pin"), mk("b", "pi-main", title), content);
    return memo;
  }

  function openBook(tableKey) {
    if (!s || s.mysteryMode) return;
    if (!s.found) return needFind();             // CCTV 에서 이상현상을 먼저 찾아야 한다
    const table = TABLES.find((t) => t.key === tableKey);
    const floor = s.floor;
    const types = LENS_TYPES.filter((t) => t.unlock <= floor);
    const L = s.lensDraft[tableKey] || (s.lensDraft[tableKey] = {
      type: "cmp", conds: [{ col: null, op: "eq", val: null }], join: "and", col: null, mode: "null", vals: [null, null, null], fn: "max", where: { col: null, val: null },
    });
    if (!types.some((t) => t.id === L.type)) L.type = "cmp";
    const logNow = () => { const r = runLens(table, L); if (!r.idle && r.kind !== "msg") logLens(table, L, r); };
    const m = openModal({ title: `${table.title} (${table.rows.length}행)`, cls: `book-window book-${tableKey}-win`, onClose: () => logNow() });
    Sfx.open();

    const wrap = mk("div", "book-wrap");
    const tabs = mk("div", "lens-tabs");
    const line = mk("div", "lens-line");
    const lensBox = mk("div", "lens-box");
    lensBox.append(tabs, line);
    const bar = mk("div", "book-bar");
    const count = mk("span", "count-chip");
    const clear = mk("button", "", "필터링 지우기"); clear.type = "button";
    const pager = mk("div", "pager");
    const prev = mk("button", "pg-btn", "◀"); prev.type = "button"; prev.setAttribute("aria-label", "앞 페이지");
    const pageNo = mk("span", "pg-no");
    const next = mk("button", "pg-btn", "▶"); next.type = "button"; next.setAttribute("aria-label", "다음 페이지");
    pager.append(prev, pageNo, next);
    bar.append(count, pager, clear);
    const box = mk("div", "book-spread");
    const cork = mk("aside", "cork");
    const corkHead = mk("p", "cork-title", "떼어 붙인 포스트잇");
    const corkList = mk("div", "cork-list");
    cork.append(corkHead, corkList);
    const main = mk("div", "book-main");
    main.append(box, cork);
    const pages = pagesOf(table.rows);          // 책은 늘 전체 기록. 필터에 맞는 포스트잇만 보드로 떼어 간다
    let spread = 0, taken = new Set();
    wrap.append(lensBox, bar, main, advancedPanel(table, () => lensCode(table, L)));
    m.body.appendChild(wrap);

    const txt = (t) => mk("span", "lfix", t);
    const colItems = asItems(table.columns);
    const pickCol = (current, onPick) => dropdown(colItems, current, "열 고르기", onPick, "col");

    const condUI = (c) => {
      const out = [pickCol(c.col, (v) => { c.col = v; c.val = null; c.op = "eq"; render(true); })];
      out.push(txt(c.col ? josa(c.col, "(이)가") : "이(가)"));
      out.push(c.col ? dropdown(columnValues(table, c.col), c.val, "값 고르기", (v) => { c.val = v; render(true); }, "val")
                     : dropdown([], null, "값 고르기", () => {}, "val"));
      if (!(c.col && isNum(c.col)) && c.val !== NULL) out.push(txt(condReady(c) ? josa(String(c.val), "(과)와") : "와(과)"));
      const ops = floor >= 7 && c.col && (isNum(c.col) || ORDERED.includes(c.col)) ? ["eq", "ne", "ge", "le"] : ["eq", "ne"];
      if (!ops.includes(c.op)) c.op = "eq";
      if (c.val === NULL) out.push(dropdown([{ value: "eq", label: "비어 있는" }, { value: "ne", label: "채워진" }], c.op, "", (v) => { c.op = v || "eq"; render(true); }, "op"));
      else out.push(dropdown(ops.map((o) => ({ value: o, label: OP_WORD[o] })), c.op, "", (v) => { c.op = v || "eq"; render(true); }, "op"));
      return out;
    };

    const render = (flash) => {
      tabs.innerHTML = "";
      types.forEach((t) => {
        const b = mk("button", "lens-tab" + (L.type === t.id ? " on" : "") + (t.unlock === floor ? " new" : ""), t.tab); b.type = "button";
        b.addEventListener("click", () => { if (L.type !== t.id) { logNow(); L.type = t.id; L.col = null; L.vals = [null, null, null]; } render(true); });
        tabs.appendChild(b);
      });
      line.innerHTML = "";
      const T = table.title;
      if (L.type === "cmp") {
        line.append(txt(`${T}에서`), ...condUI(L.conds[0]));
        if (L.conds[1]) {
          const joins = floor >= 7 ? ["and", "or"] : ["and"];
          line.append(dropdown(joins.map((j) => ({ value: j, label: j === "or" ? "이거나" : "이고" })), L.join, "", (v) => { L.join = v || "and"; render(true); }, "op join"));
          line.append(...condUI(L.conds[1]));
        }
        line.append(txt("내용만 보기"));
        if (floor >= 2) {
          const b = mk("button", "lens-add", L.conds[1] ? "✕ 조건 빼기" : floor >= 7 ? "+ 조건 잇기 (이고/이거나)" : "+ 조건 잇기 (이고)"); b.type = "button";
          b.addEventListener("click", () => { if (L.conds[1]) L.conds.pop(); else L.conds.push({ col: null, op: "eq", val: null }); render(true); });
          line.appendChild(b);
        }
      } else if (L.type === "unique") {
        line.append(txt(`${T}의`), pickCol(L.col, (v) => { L.col = v; render(true); }), txt("에 어떤 값들이 있는지 모아 보기"));
      } else if (L.type === "null") {
        line.append(txt(`${T}에서`), pickCol(L.col, (v) => { L.col = v; render(true); }), txt(L.col ? josa(L.col, "(이)가") : "이(가)"),
          dropdown([{ value: "null", label: "비어 있는" }, { value: "notnull", label: "채워진" }], L.mode, "", (v) => { L.mode = v || "null"; render(true); }, "op"),
          txt("내용만 보기"));
      } else if (L.type === "isin") {
        line.append(txt(`${T}에서`), pickCol(L.col, (v) => { L.col = v; L.vals = [null, null, null]; render(true); }), txt(L.col ? josa(L.col, "(이)가") : "이(가)"));
        const items = L.col ? columnValues(table, L.col).filter((it) => it.value !== NULL) : [];
        L.vals.forEach((v, i) => {
          if (i > 0) line.append(txt(","));
          line.append(dropdown(items, v, i === 0 ? "값 고르기" : "(더 고르기)", (nv) => { L.vals[i] = nv; render(true); }, "val"));
        });
        line.append(txt("중 하나인 내용만 보기"));
      } else if (L.type === "group") {
        line.append(txt(`${T}${josa(T, "(을)를")}`), pickCol(L.col, (v) => { L.col = v; render(true); }), txt("별로 묶어서 세기"));
      } else if (L.type === "stat") {
        const w = L.where || (L.where = { col: null, val: null });
        line.append(txt(`${T}에서`),
          dropdown(colItems, w.col, "(조건 없이 전체)", (v) => { w.col = v; w.val = null; render(true); }, "col"),
          txt(w.col ? josa(w.col, "(이)가") : "이(가)"),
          w.col ? dropdown(columnValues(table, w.col).filter((it) => it.value !== NULL), w.val, "값 고르기", (v) => { w.val = v; render(true); }, "val")
                : dropdown([], null, "값", () => {}, "val"),
          txt("인 내용의"), pickCol(L.col, (v) => { L.col = v; render(true); }), txt("에서"),
          dropdown(["max", "min", "mean", "sum"].map((f) => ({ value: f, label: FN_WORD[f] })), L.fn, "", (v) => { L.fn = v || "max"; render(true); }, "op"),
          txt("값 찾기"));
      }
      const res = runLens(table, L);
      drawResult(res);
      clear.disabled = res.idle && !L.col && !L.conds.some((c) => c.col) && !L.vals.some((v) => v !== null);
      if (flash) { cork.classList.remove("flash"); void cork.offsetWidth; cork.classList.add("flash"); }
    };

    // 왼쪽 책: 전체 기록을 펼친 책 2쪽씩 (떼어 간 포스트잇 자리는 점선)
    const showSpread = () => {
      box.innerHTML = "";
      const last = Math.max(0, Math.ceil(pages.length / 2) - 1);
      spread = Math.min(spread, last);
      pages.slice(spread * 2, spread * 2 + 2).forEach((pg, i) => box.appendChild(pageEl(table, pg, spread * 2 + i + 1, taken)));
      pageNo.textContent = `${spread * 2 + 1}–${Math.min(pages.length, spread * 2 + 2)} / ${pages.length}쪽`;
      prev.disabled = spread === 0;
      next.disabled = spread >= last;
      box.scrollTop = 0;
    };
    prev.addEventListener("click", () => { spread -= 1; Sfx.click(); showSpread(); });
    next.addEventListener("click", () => { spread += 1; Sfx.click(); showSpread(); });

    // 오른쪽 코르크 보드: 필터에 맞는 포스트잇(또는 결과 메모)만 한눈에
    const drawResult = (res) => {
      corkList.innerHTML = "";
      taken = new Set();
      if (res.kind === "rows" && res.idle) {
        count.textContent = `전체 ${res.rows.length}줄 · ${pages.length}쪽`;
        corkHead.textContent = "떼어 붙인 포스트잇";
        corkList.appendChild(mk("p", "cork-empty", "위 문장의 빈칸을 채우면, 조건에 맞는 포스트잇만 책에서 떼어 여기에 붙어요."));
      } else if (res.kind === "rows") {
        res.rows.forEach((r) => taken.add(r.id));
        count.textContent = `${table.rows.length}줄 → ${res.rows.length}줄`;
        corkHead.textContent = `떼어 붙인 포스트잇 · ${res.rows.length}장`;
        if (!res.rows.length) corkList.appendChild(mk("p", "cork-empty zero", "붙일 포스트잇이 없어요 (0줄).\n없다는 것도 단서예요."));
        res.rows.forEach((r, i) => corkList.appendChild(corkNote(table, r, i)));
        const at = pages.findIndex((pg) => pg.rows.some((r) => taken.has(r.id)));
        if (at >= 0) spread = Math.floor(at / 2);           // 책은 첫 포스트잇을 떼어 낸 페이지로 넘어간다
      } else if (res.kind === "values") {
        count.textContent = `${res.col}: ${res.values.length}가지`;
        corkHead.textContent = "결과 메모";
        corkList.appendChild(corkMemo(`${res.col}에 들어 있는 값 · ${res.values.length}가지`, chips(res.values)));
      } else if (res.kind === "series") {
        count.textContent = `${res.items.length}묶음`;
        corkHead.textContent = "결과 메모";
        corkList.appendChild(corkMemo(`${res.col}별 줄 수`, pairTable([res.col, "줄 수"], res.items.map(([k, n]) => [k, `${n}건`]))));
      } else if (res.kind === "stat") {
        count.textContent = `${res.col}의 ${FN_WORD[res.fn]} 값`;
        corkHead.textContent = "결과 메모";
        const list = mk("div", "value-list big"); list.appendChild(mk("span", "chip stat", String(res.value)));
        corkList.appendChild(corkMemo(lensSentence(table, L), list));
      } else {
        count.textContent = "결과 없음";
        corkHead.textContent = "결과 메모";
        corkList.appendChild(corkMemo("결과 없음", mk("p", "memo-text", res.text)));
      }
      corkList.scrollTop = 0;
      showSpread();
    };

    clear.addEventListener("click", () => {
      logNow();
      Object.assign(L, { conds: [{ col: null, op: "eq", val: null }], join: "and", col: null, mode: "null", vals: [null, null, null], fn: "max", where: { col: null, val: null } });
      render(true);
    });
    render();
  }

  // 고급 모드: 실제 pandas 코드를 써서 실행한다 (advanced.js 의 PyLite). 책 창 맨 아래.
  function advancedPanel(table, currentCode) {
    const d = mk("details", "adv");
    d.appendChild(mk("summary", "", "고급 모드 · 코드로 직접 써 보기"));
    const area = mk("textarea", "cmd");
    area.spellcheck = false;
    area.rows = 3;
    area.placeholder = `예) ${table.varName}[ ${table.varName}['${table.columns[0]}'] == '...' ]`;
    const btns = mk("div", "cmd-buttons");
    const run = mk("button", "primary", "실행 (Ctrl+Enter)"); run.type = "button";
    const fill = mk("button", "", "지금 렌즈를 코드로"); fill.type = "button";
    btns.append(run, fill);
    const out = mk("div", "adv-out");
    d.append(mk("p", "hint", "쓸 수 있는 표: df_entry (출입표), df_delivery (택배장부). 여러 줄도 되고, a = ... 처럼 이름을 붙일 수도 있어요."), area, btns, out);
    const exec = () => {
      out.innerHTML = "";
      const r = PyLite.run(area.value, { df_entry: TABLES[0], df_delivery: TABLES[1] });
      r.printed.forEach((v) => out.appendChild(renderPy(v)));
      if (r.error) out.appendChild(mk("pre", "error", r.error));
      else if (r.value !== undefined) out.appendChild(renderPy(r.value));
      if (!out.childNodes.length) out.appendChild(mk("p", "hint", "실행했어요. (보여 줄 결과가 없어요)"));
    };
    run.addEventListener("click", exec);
    fill.addEventListener("click", () => { area.value = currentCode(); area.focus(); });
    area.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec(); } });
    d.addEventListener("toggle", () => { if (d.open && !area.value) area.value = currentCode(); });
    return d;
  }

  // PyLite 결과 → 화면
  function renderPy(v) {
    const kind = PyLite.kindOf(v);
    const wrap = mk("div", "py-result");
    if (kind === "df") {
      wrap.appendChild(mk("p", "py-cap", `표 · ${v.rows.length}행 × ${v.cols.length}열` + (v.rows.length > 200 ? " (앞 200행만 보여요)" : "")));
      const sc = mk("div", "table-scroll"); sc.appendChild(rowsTable(v.cols, v.rows.slice(0, 200), true)); wrap.appendChild(sc);
    } else if (kind === "series") {
      wrap.appendChild(mk("p", "py-cap", `열(Series) · ${v.name || ""} · 길이 ${v.vals.length}` + (v.vals.length > 200 ? " (앞 200개만 보여요)" : "")));
      const sc = mk("div", "table-scroll"); sc.appendChild(pairTable([v.indexName || "", v.name || "값"], v.vals.slice(0, 200).map((x, i) => [v.idx[i], isNull(x) ? "NaN" : x]))); wrap.appendChild(sc);
    } else if (kind === "list") {
      wrap.appendChild(mk("p", "py-cap", `목록 · ${v.length}개`));
      wrap.appendChild(chips(v));
    } else {
      wrap.appendChild(mk("pre", "out", PyLite.repr(v)));
    }
    return wrap;
  }

  function logLens(table, L, res) {
    const snap = JSON.parse(JSON.stringify({ type: L.type, conds: L.conds.filter(condReady), join: L.join, col: L.col, mode: L.mode, vals: L.vals.filter((v) => v !== null), fn: L.fn, where: L.where }));
    snap.table = table.key;
    const key = lensCode(table, snap);
    if (s.lenses.some((l) => l.key === key)) return;
    snap.key = key;
    snap.result = res.kind === "rows" ? `${res.rows.length}줄` : res.kind === "values" ? `${res.values.length}가지` : res.kind === "series" ? `${res.items.length}묶음` : res.kind === "stat" ? String(res.value) : "";
    s.lenses.push(snap);
  }

  // ---------- REPORT 보드 (층 보드 · 큰 미스터리 공용) ----------
  // ---------- 큰 미스터리 보드 (빈칸 드롭다운) ----------
  // opts: { options: 빈칸 id → 보기 목록, onSolvedClose: 다 맞히거나 확인을 다 쓰면 나오는 다음 버튼 }
  function openBoardModal(bd, st, title, opts) {
    const m = openModal({ title, cls: "inv-board" });
    Sfx.open();
    const wrap = mk("div", "board-wrap");
    wrap.appendChild(mk("p", "board-tip", "빈칸을 눌러 알맞은 말을 고르세요. 다 고르면 확인할 수 있어요."));
    const sentences = mk("div", "board-sentences");
    const fb = mk("p", "board-fb");
    const actions = mk("div", "board-actions");
    const checkCol = mk("div", "check-col");
    const check = mk("button", "primary", "확인"); check.type = "button";
    const left = mk("span", "check-left");
    checkCol.append(check, left);
    const right = mk("div", "board-right");
    actions.append(checkCol, right);
    wrap.append(sentences, fb, actions);
    m.body.appendChild(wrap);
    let focusId = null;

    const render = () => {
      sentences.innerHTML = "";
      bd.sentences.forEach((sen) => {
        const p = mk("p", "bsent");
        p.appendChild(mk("span", "btag", sen.tag));
        let prevWord = null;
        sen.text.split(/(\{\w+\})/).forEach((part) => {
          const mm = part.match(/^\{(\w+)\}$/);
          if (!mm) {
            let t = part;
            const jm = t.match(JOSA_RE);
            if (jm) t = (prevWord ? josa(prevWord, jm[1]) : jm[1]) + t.slice(jm[1].length);
            if (t) p.appendChild(document.createTextNode(t));
            prevWord = null;
            return;
          }
          const id = mm[1], spec = bd.blanks[id];
          const verdict = spec.cat === "verdict";
          const list = verdict ? VERDICTS : (opts.options[id] || [spec.answer]);
          const sel = dropdown(asItems(list), st.board[id], verdict ? "판단" : CATS[spec.cat].label,
            (v) => { if (v === null) delete st.board[id]; else st.board[id] = v; st.feedback = ""; focusId = id; render(); }, "bsel" + (verdict ? " verdict" : ""));
          sel.dataset.id = id;
          if (!verdict) sel.style.setProperty("--cat", CATS[spec.cat].color);
          sel.disabled = st.solved;
          p.appendChild(sel);
          prevWord = st.board[id] || null;
        });
        sentences.appendChild(p);
      });
      const all = Object.keys(bd.blanks).every((id) => st.board[id]);
      check.disabled = st.solved || !all || st.checksLeft === 0;
      check.textContent = st.solved ? "모두 맞음 ✓" : "확인";
      left.textContent = `${st.checksLeft} / ${MAX_CHECKS}`;
      left.title = "남은 확인 횟수";
      fb.textContent = st.feedback;
      fb.className = "board-fb" + (st.solved ? " ok" : st.feedback ? " ng" : "");
      wrap.classList.toggle("solved", st.solved);

      right.innerHTML = "";
      if (opts.onSolvedClose && (st.solved || st.checksLeft === 0)) {
        const go = mk("button", "primary", st.solved ? "진실을 확인하기 ▶" : "결론 없이 보고서 제출 ▶"); go.type = "button";
        go.addEventListener("click", () => { closeModal(); opts.onSolvedClose(st.solved); });
        right.appendChild(go);
      }
      if (focusId) { const f = sentences.querySelector(`select[data-id="${focusId}"]`); if (f) f.focus(); focusId = null; }
    };

    check.addEventListener("click", () => {
      const wrong = Object.entries(bd.blanks).filter(([id, spec]) => st.board[id] !== spec.answer).length;
      st.checksLeft -= 1; st.checksUsed += 1;
      if (wrong === 0) {
        st.solved = true;
        if (st.firstTry === null) st.firstTry = true;
        st.feedback = "모두 맞음.";
        Sfx.correct();
      } else {
        if (st.firstTry === null) st.firstTry = false;
        st.feedback = wrong <= 2 ? "2개 이하 틀림. (어느 칸인지는 알려 주지 않아요)" : "아직 맞지 않다.";
        if (st.checksLeft === 0) st.feedback += " 확인을 다 썼어요.";
        Sfx.click();
      }
      updateDesk();
      render();
    });
    render();
  }

  function openBoard() {
    if (!s) return;
    if (s.mysteryMode) return openMysteryBoard();     // 미스터리 보드를 닫았다가 다시 열 때
    if (!s.found) return needFind();
    openLinkBoard();
  }

  // ---------- 증거 꽂기: 장부 포스트잇의 📌 ----------
  const MAX_PINS = 8;
  let linkRender = null;                        // REPORT 보드가 열려 있으면 다시 그리는 함수
  const isPinned = (id) => !!s && Array.isArray(s.pins) && s.pins.some((p) => p.id === id);
  const rowOf = (tableKey, id) => TABLES.find((t) => t.key === tableKey).rows.find((r) => r.id === id);

  function toast(msg) {
    const t = mk("div", "toast", msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function togglePin(table, r) {
    if (!s || s.mysteryMode || s.stamp) return;
    if (isPinned(r.id)) {
      s.pins = s.pins.filter((p) => p.id !== r.id);
      Object.keys(s.links).forEach((k) => { if (s.links[k].id === r.id) delete s.links[k]; });   // 그 포스트잇에 이은 실도 끊긴다
    } else {
      if (s.pins.length >= MAX_PINS) return toast(`증거는 ${MAX_PINS}장까지 꽂을 수 있어요. 필요 없는 것을 빼 주세요.`);
      s.pins.push({ id: r.id, table: table.key });
      toast("REPORT 보드에 꽂았어요 📌");
    }
    Sfx.click();
    document.querySelectorAll(".pin-btn[data-pin]").forEach((b) => paintPin(b));
    updateDesk();
    if (linkRender) linkRender();
  }
  function paintPin(b) {
    const on = isPinned(b.dataset.pin);
    b.classList.toggle("on", on);
    b.textContent = on ? "📌 꽂음" : "📌 꽂기";
    b.title = on ? "누르면 REPORT 보드에서 빼요" : "누르면 REPORT 보드에 증거로 꽂아요";
  }

  // ---------- REPORT 보드: 증거 잇기 ----------
  // 왼쪽 "영상 단서" 카드(CLUES)와 오른쪽 꽂아 온 포스트잇을 실로 잇는다. 초록 = 설명된다 / 빨강 = 어긋난다
  const allLinked = () => (CLUES[s.floor] || []).every((_, i) => s.links[i]);

  function openLinkBoard() {
    const bd = BOARDS[s.floor], clues = CLUES[s.floor] || [];
    const m = openModal({ title: `REPORT 보드 · ${bd.title}`, cls: "inv-board link-board", onClose: () => { linkRender = null; window.removeEventListener("resize", redraw); } });
    Sfx.open();
    const wrap = mk("div", "board-wrap");
    wrap.appendChild(mk("p", "board-tip", "① 왼쪽 단서 카드를 누르고 ② 실 색을 고른 뒤 ③ 오른쪽 포스트잇을 누르면 실로 이어져요."));
    const tools = mk("div", "string-tools");
    const area = mk("div", "link-area");
    const cardsCol = mk("div", "clue-col");
    const wall = mk("div", "pin-wall");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "strings");
    area.append(cardsCol, wall, svg);
    const fb = mk("p", "board-fb");
    const actions = mk("div", "board-actions");
    const checkCol = mk("div", "check-col");
    const check = mk("button", "primary", "확인"); check.type = "button";
    const left = mk("span", "check-left");
    checkCol.append(check, left);
    const right = mk("div", "board-right");
    actions.append(checkCol, right);
    wrap.append(tools, area, fb, actions);
    m.body.appendChild(wrap);
    let sel = null, mode = "eq";
    const locked = () => s.solved || !!s.stamp;

    const render = () => {
      // 실 색 고르기
      tools.innerHTML = "";
      tools.appendChild(mk("span", "st-label", "실 색"));
      [["eq", "= 기록이 영상을 설명해요"], ["ne", "≠ 기록과 영상이 어긋나요"]].forEach(([k, label]) => {
        const b = mk("button", "string-mode " + k + (mode === k ? " on" : ""), label); b.type = "button";
        b.addEventListener("click", () => { mode = k; render(); });
        tools.appendChild(b);
      });
      // 단서 카드
      cardsCol.innerHTML = "";
      clues.forEach((c, i) => {
        const card = mk("div", "clue-card" + (sel === i ? " sel" : "") + (s.links[i] ? " linked " + s.links[i].rel : ""));
        card.dataset.ci = String(i);
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.append(mk("span", "clue-tag", c.tag), mk("p", "clue-text", c.text), mk("span", "clue-where", `찾아볼 곳: ${c.where}`), mk("span", "clue-knot"));
        if (s.links[i] && !locked()) {
          const cut = mk("button", "cut", "실 끊기 ✕"); cut.type = "button";
          cut.addEventListener("click", (e) => { e.stopPropagation(); delete s.links[i]; s.feedback = ""; render(); });
          card.appendChild(cut);
        }
        const pick = () => { if (locked()) return; sel = sel === i ? null : i; Sfx.click(); render(); };
        card.addEventListener("click", pick);
        card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        cardsCol.appendChild(card);
      });
      // 꽂아 온 포스트잇
      wall.innerHTML = "";
      if (!s.pins.length) wall.appendChild(mk("p", "cork-empty", "아직 꽂은 증거가 없어요.\n장부(출입표 · 택배장부)를 열고, 증거가 될 포스트잇의 📌 꽂기를 눌러 오세요."));
      s.pins.forEach((p, i) => {
        const t = TABLES.find((x) => x.key === p.table), r = rowOf(p.table, p.id);
        const note = corkNote(t, r, i);
        note.classList.add("wall-note");
        note.dataset.id = p.id;
        note.prepend(mk("span", "note-knot"));
        note.addEventListener("click", () => {
          if (locked()) return;
          if (sel === null) { s.feedback = "왼쪽 단서 카드를 먼저 골라요."; return render(); }
          s.links[sel] = { id: p.id, rel: mode };
          sel = null; s.feedback = "";
          Sfx.click();
          render();
        });
        wall.appendChild(note);
      });
      // 확인 · 판정
      const all = allLinked();
      check.disabled = s.solved || !all || s.checksLeft === 0;
      check.textContent = s.solved ? "모두 맞음 ✓" : "확인";
      left.textContent = `${s.checksLeft} / ${MAX_CHECKS}`;
      left.title = "남은 확인 횟수";
      fb.textContent = s.feedback;
      fb.className = "board-fb" + (s.solved ? " ok" : s.feedback ? " ng" : "");
      wrap.classList.toggle("solved", s.solved);
      right.innerHTML = "";
      const rep = mk("button", "stamp-btn bad", "신고"); rep.type = "button";
      const ok = mk("button", "stamp-btn ok", "정상"); ok.type = "button";
      rep.disabled = ok.disabled = !!s.stamp || !all;          // 단서 카드를 모두 이어야 판정할 수 있다
      rep.addEventListener("click", () => stamp("report"));
      ok.addEventListener("click", () => stamp("next"));
      if (s.stamp) right.appendChild(mk("span", "stamped", s.stamp === "report" ? "✗ 신고함" : "✓ 정상 처리함"));
      else if (!all) right.appendChild(mk("span", "stamp-wait", "단서 카드를 모두 실로 이으면 누를 수 있어요"));
      right.append(rep, ok);
      requestAnimationFrame(redraw);
    };

    // 실 그리기: 카드 오른쪽 매듭 → 포스트잇 왼쪽 매듭, 살짝 처지는 곡선
    function redraw() {
      if (!area.isConnected) return;
      const box = area.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      svg.setAttribute("width", box.width); svg.setAttribute("height", box.height);
      svg.innerHTML = "";
      Object.entries(s.links).forEach(([ci, link]) => {
        const card = cardsCol.querySelector(`[data-ci="${ci}"] .clue-knot`), note = wall.querySelector(`[data-id="${link.id}"] .note-knot`);
        if (!card || !note) return;
        const a = card.getBoundingClientRect(), b = note.getBoundingClientRect();
        const x1 = a.left + a.width / 2 - box.left, y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left + b.width / 2 - box.left, y2 = b.top + b.height / 2 - box.top;
        const color = link.rel === "eq" ? "#2f9e5f" : "#d63b3b";
        const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + 28;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`);
        path.setAttribute("stroke", color);
        path.setAttribute("class", "string");
        svg.appendChild(path);
        const lx = 0.25 * x1 + 0.5 * mx + 0.25 * x2, ly = 0.25 * y1 + 0.5 * my + 0.25 * y2;
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", lx); c.setAttribute("cy", ly); c.setAttribute("r", 12); c.setAttribute("fill", color);
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", lx); t.setAttribute("y", ly + 5); t.setAttribute("text-anchor", "middle");
        t.textContent = link.rel === "eq" ? "=" : "≠";
        svg.append(c, t);
      });
    }

    check.addEventListener("click", () => {
      const wrong = clues.filter((c, i) => !s.links[i] || !c.ev.includes(s.links[i].id) || s.links[i].rel !== c.rel).length;
      s.checksLeft -= 1; s.checksUsed += 1;
      if (wrong === 0) {
        s.solved = true;
        if (s.firstTry === null) s.firstTry = true;
        s.feedback = "모두 맞음. 이제 신고할지, 정상으로 볼지 정하세요.";
        Sfx.correct();
      } else {
        if (s.firstTry === null) s.firstTry = false;
        s.feedback = "아직 맞지 않은 실이 있어요. (어느 실인지는 알려 주지 않아요) 이은 포스트잇이나 실 색을 다시 보세요.";
        if (s.checksLeft === 0) s.feedback = "확인을 다 썼어요. 이제 신고 / 정상으로 판단하세요.";
        Sfx.click();
      }
      updateDesk();
      render();
    });
    linkRender = render;
    window.addEventListener("resize", redraw);
    render();
  }


  // ---------- 아파트 수칙 · TIP (책상 위 종이) ----------
  const rulesFor = (floor) => RULES.filter((r) => r.floor <= floor);

  function renderRules() {
    const box = $("rules");
    if (!box || !s) return;
    box.innerHTML = "";
    box.appendChild(mk("h4", "", "아파트 수칙"));
    const all = rulesFor(s.floor);
    const ol = mk("ol");
    ol.start = Math.max(1, all.length - 2);
    all.slice(-3).forEach((r) => ol.appendChild(mk("li", r.floor === s.floor ? "new" : "", r.text.replace(/^수칙 \d+\.\s*/, ""))));
    box.appendChild(ol);
  }

  function renderTip() {
    const box = $("tip");
    if (!box || !s) return;
    const tool = FLOOR_TOOL[s.floor];
    box.innerHTML = "";
    box.appendChild(mk("h4", "", "TIP"));
    const ul = mk("ul");
    ["CCTV를 둘러보고 이상한 것을 눌러요.", "책을 열어 기록을 필터링하고, 증거 포스트잇의 📌를 눌러 꽂아요.", tool ? `새 도구: ${tool.name}` : null, "REPORT 보드에서 단서와 증거를 실로 잇고 정상 / 신고를 골라요."]
      .filter(Boolean).forEach((t) => ul.appendChild(mk("li", "", t)));
    box.appendChild(ul);
  }

  // ---------- 근무 안내 (1층 시작 전 한 번만): 그림 5장으로 설명 ----------
  const GUIDE = [
    { title: "CCTV를 본다", sub: "◀ ▶ 로 둘러보고 숨은 이상한 것을 눌러요", svg: `
      <rect x="22" y="8" width="116" height="74" rx="6" fill="#2b2f38" stroke="#14161b" stroke-width="3"/>
      <rect x="30" y="15" width="100" height="58" fill="#3d4740"/>
      <rect x="30" y="52" width="100" height="21" fill="#26302e"/>
      <rect x="72" y="27" width="16" height="27" fill="#6b4a36" stroke="#14161b" stroke-width="1.5"/>
      <rect x="40" y="30" width="16" height="11" fill="#0b1622"/><rect x="104" y="30" width="16" height="11" fill="#0b1622"/>
      <ellipse cx="50" cy="60" rx="7" ry="5" fill="#d9a066"/><ellipse cx="62" cy="64" rx="7" ry="5" fill="#e6c79a"/><ellipse cx="100" cy="62" rx="7" ry="5" fill="#c68642"/>
      <circle cx="36" cy="20" r="2.5" fill="#f55"/>
      <rect x="44" y="88" width="26" height="18" rx="3" fill="#2b2f38" stroke="#14161b" stroke-width="2"/><path d="M61 92 L53 97 L61 102 Z" fill="#fff"/>
      <rect x="90" y="88" width="26" height="18" rx="3" fill="#2b2f38" stroke="#14161b" stroke-width="2"/><path d="M99 92 L107 97 L99 102 Z" fill="#fff"/>` },
    { title: "장부를 확인한다", sub: "출입표 · 택배장부를 열어요", svg: `
      <rect x="18" y="22" width="22" height="72" rx="2" fill="#2f7f86" stroke="#14161b" stroke-width="2.5"/>
      <text x="29" y="44" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">출</text><text x="29" y="56" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">입</text><text x="29" y="68" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">표</text>
      <rect x="43" y="16" width="22" height="78" rx="2" fill="#a8452f" stroke="#14161b" stroke-width="2.5"/>
      <text x="54" y="38" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">택</text><text x="54" y="50" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">배</text><text x="54" y="62" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">장</text><text x="54" y="74" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">부</text>
      <rect x="10" y="94" width="64" height="6" fill="#8a6a46"/>
      <path d="M84 30 L116 24 L148 30 L148 92 L116 86 L84 92 Z" fill="#efe6c8" stroke="#14161b" stroke-width="2.5"/><path d="M116 24 L116 86" stroke="#14161b" stroke-width="2"/>
      <path d="M90 42 H110 M90 52 H110 M90 62 H110 M90 72 H106 M122 42 H142 M122 52 H142 M122 62 H142 M122 72 H138" stroke="#8a7a55" stroke-width="3"/>
      <path d="M70 56 H80" stroke="#fd6" stroke-width="3"/><path d="M78 50 L84 56 L78 62" fill="none" stroke="#fd6" stroke-width="3"/>` },
    { title: "빈칸을 채워 필터링한다", sub: "드롭다운으로 골라 표를 줄여요", svg: `
      <rect x="8" y="8" width="144" height="22" rx="4" fill="#15171f"/>
      <rect x="14" y="12" width="56" height="14" rx="3" fill="#fd6"/><text x="38" y="23" text-anchor="middle" font-size="8.5" font-weight="800" fill="#15171f">동물</text><path d="M62 17 L66 17 L64 20 Z" fill="#15171f"/>
      <rect x="76" y="12" width="48" height="14" rx="3" fill="#fd6"/><text x="96" y="23" text-anchor="middle" font-size="8.5" font-weight="800" fill="#15171f">햄스터</text><path d="M116 17 L120 17 L118 20 Z" fill="#15171f"/>
      <text x="138" y="23" text-anchor="middle" font-size="8" fill="#cfd">보기</text>
      <path d="M58 36 L102 36 L86 54 L86 66 L74 72 L74 54 Z" fill="#8fd" stroke="#14161b" stroke-width="2"/>
      <rect x="24" y="76" width="112" height="28" fill="#1e2230" stroke="#3a3e50" stroke-width="1.5"/>
      <rect x="24" y="76" width="112" height="9" fill="#2d3142"/>
      <rect x="26" y="87" width="108" height="7" fill="#4a4420"/><rect x="26" y="96" width="108" height="7" fill="#4a4420"/>` },
    { title: "장부와 CCTV를 비교한다", sub: "기록과 영상이 맞나요?", svg: `
      <rect x="6" y="20" width="62" height="46" rx="4" fill="#2b2f38" stroke="#14161b" stroke-width="2.5"/>
      <rect x="11" y="25" width="52" height="36" fill="#3d4740"/><rect x="11" y="49" width="52" height="12" fill="#26302e"/>
      <ellipse cx="20" cy="54" rx="5" ry="3.5" fill="#d9a066"/><ellipse cx="31" cy="57" rx="5" ry="3.5" fill="#e6c79a"/><ellipse cx="42" cy="53" rx="5" ry="3.5" fill="#c68642"/><ellipse cx="53" cy="57" rx="5" ry="3.5" fill="#d9a066"/>
      <text x="37" y="80" text-anchor="middle" font-size="9" font-weight="800" fill="#cfd">햄스터 9마리</text>
      <rect x="92" y="20" width="62" height="46" rx="2" fill="#efe6c8" stroke="#14161b" stroke-width="2.5"/>
      <path d="M98 30 H148" stroke="#8a7a55" stroke-width="2"/>
      <rect x="98" y="35" width="50" height="7" fill="#f6d36b"/><rect x="98" y="45" width="50" height="7" fill="#f6d36b"/>
      <path d="M98 57 H148" stroke="#c9bd99" stroke-width="2"/>
      <text x="123" y="80" text-anchor="middle" font-size="9" font-weight="800" fill="#cfd">기록 2줄</text>
      <circle cx="80" cy="43" r="11" fill="#e5484d" stroke="#14161b" stroke-width="2"/><text x="80" y="48" text-anchor="middle" font-size="15" font-weight="900" fill="#fff">≠</text>
      <text x="80" y="102" text-anchor="middle" font-size="9" fill="#d8c9a0">영상 = 기록 ?</text>` },
    { title: "정답을 맞춘다", sub: "증거를 실로 잇고 정상 / 신고", svg: `
      <rect x="30" y="6" width="100" height="98" rx="6" fill="#3a3f48" stroke="#14161b" stroke-width="3"/>
      <rect x="38" y="13" width="84" height="44" rx="2" fill="#102a1e" stroke="#14161b" stroke-width="2"/>
      <text x="80" y="31" text-anchor="middle" font-size="10" font-weight="800" fill="#8fe3a8" font-family="monospace">REPORT</text>
      <rect x="46" y="38" width="30" height="9" rx="2" fill="#e07a7a"/><rect x="80" y="38" width="34" height="9" rx="2" fill="#b48ae0"/>
      <circle cx="58" cy="78" r="13" fill="#2f9e5f" stroke="#14161b" stroke-width="3"/><path d="M52 78 L57 83 L65 72" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="102" cy="78" r="13" fill="#cf3d3d" stroke="#14161b" stroke-width="3"/><path d="M97 73 L107 83 M107 73 L97 83" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="122" cy="12" r="12" fill="#fd6" stroke="#14161b" stroke-width="2"/><text x="122" y="17" text-anchor="middle" font-size="13" font-weight="900" fill="#14161b">!</text>` },
  ];

  function openGuide(onClose) {
    const m = openModal({ title: "근무 안내 · 이렇게 순찰해요", cls: "guide", onClose });
    const row = mk("ol", "guide-steps");
    GUIDE.forEach((g, i) => {
      const li = mk("li", "guide-step");
      const fig = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      fig.setAttribute("viewBox", "0 0 160 110");
      fig.setAttribute("role", "img");
      fig.setAttribute("aria-label", g.title);
      fig.innerHTML = g.svg;
      li.append(mk("span", "guide-num", String(i + 1)), fig, mk("b", "", g.title), mk("span", "guide-sub", g.sub));
      row.appendChild(li);
    });
    m.body.appendChild(row);
    m.body.appendChild(mk("p", "guide-note", "맞았는지는 바로 알려 주지 않아요. 근무가 끝나면 정산서에서 한꺼번에 알려 줘요."));
    const a = mk("div", "check-actions");
    const ok = mk("button", "primary big", "근무 시작 ▶"); ok.type = "button";
    ok.addEventListener("click", () => closeModal());
    a.appendChild(ok);
    m.body.appendChild(a);
    ok.focus();
  }

  // ---------- 판정 도장 ----------
  // 책상의 ✓ / ✗ : 먼저 REPORT 보드를 연다 (판정은 보드를 다 채운 뒤 보드 안의 버튼으로)
  function verdict() {
    if (!s || s.stamp || s.mysteryMode) return;
    if (!s.found) return needFind();
    openBoard();
  }

  function stamp(choice) {
    if (!s || s.stamp || s.mysteryMode) return;
    if (!allLinked()) return openBoard();
    const m = openModal({ title: "판정 도장", cls: "paper" });
    m.body.appendChild(mk("p", "choice-banner " + (choice === "report" ? "bad" : "ok"),
      choice === "report" ? "✗ 신고 — 기록으로 설명되지 않는다" : "✓ 정상 — 기록으로 설명된다"));
    m.body.appendChild(mk("p", "paper-note", s.solved
      ? "REPORT 보드: 모두 맞음. 찍은 도장은 되돌릴 수 없어요. 맞았는지는 바로 알려 주지 않아요."
      : "REPORT 보드를 아직 맞히지 못했어요. 그래도 찍을 수 있지만 위험해요. 찍은 도장은 되돌릴 수 없어요."));
    const a = mk("div", "check-actions");
    const go = mk("button", "primary", "도장 찍기"); go.type = "button";
    go.addEventListener("click", () => {
      s.stamp = choice;
      closeModal();
      Sfx.click();
      showStampOnDesk(choice);
      updateDesk();
    });
    const back = mk("button", "", "다시 생각하기"); back.type = "button";
    back.addEventListener("click", () => closeModal());
    a.append(go, back);
    m.body.appendChild(a);
  }

  function showStampOnDesk(choice) {
    const st = mk("div", "desk-stamp " + choice, choice === "report" ? "신고" : "정상");
    $("desk").appendChild(st);
    setTimeout(() => st.classList.add("set"), 20);
  }

  // ---------- 층 마치기: 풀이 → 다음 층 | 보고서 ----------
  function finishFloor() {
    const f = currentFloor();
    night.log.push({ floor: f.floor, anomaly: f.anomaly, stamp: s.stamp, answer: f.answer, firstTry: s.firstTry, solved: s.solved, lenses: s.lenses.length, hour: Number(f.cctvTime.slice(6, 8)) });
    const last = f.floor >= FLOORS.length;
    openLesson(f, () => (last ? startReport() : proceed()), last ? "경비 보고서 쓰러 가기 ▶" : "다음 층으로 ▶");
  }

  function lessonStep(table, l, title) {
    const box = mk("section", "lesson-step");
    box.appendChild(mk("h3", "", title));
    const r1 = mk("div", "lesson-row"); r1.append(mk("span", "lesson-tag", "말로"), mk("p", "sentence", lensSentence(table, l)));
    const r2 = mk("div", "lesson-row"); r2.append(mk("span", "lesson-tag", "코드로"), mk("pre", "code-block", lensCode(table, l)));
    box.append(r1, r2);
    return box;
  }

  function openLesson(f, next, label) {
    const m = openModal({ title: `오늘의 코드 풀이 · ${f.floor}층`, cls: "lesson" });
    m.body.appendChild(mk("p", "lesson-intro", "당신이 고른 렌즈 문장은 사실 pandas 코드였어요. 말과 코드를 한 줄씩 짝지어 읽어 보세요. 책의 고급 모드에 그대로 써서 실행해 볼 수도 있어요."));
    const tbl = (k) => TABLES.find((t) => t.key === k);
    if (s.lenses.length) {
      s.lenses.slice(-6).forEach((l) => m.body.appendChild(lessonStep(tbl(l.table), l, `내가 쓴 렌즈 · 결과 ${l.result}`)));
      if (s.lenses.length > 6) m.body.appendChild(mk("p", "hint", `(앞의 렌즈 ${s.lenses.length - 6}개는 생략했어요)`));
    } else {
      m.body.appendChild(mk("p", "hint", "이번 층에서는 렌즈를 쓰지 않았어요. 정석 렌즈를 보여 드릴게요."));
    }
    const canon = BOARDS[f.floor].canonical || [];
    const used = new Set(s.lenses.map((l) => l.key));
    canon.filter((c) => !used.has(lensCode(tbl(c.table), c))).forEach((c) => m.body.appendChild(lessonStep(tbl(c.table), c, "정석 렌즈 (이렇게도 볼 수 있어요)")));
    const tool = FLOOR_TOOL[f.floor];
    const typeOf = { 1: "cmp", 2: "cmp", 3: "unique", 4: "null", 5: "isin", 6: "group", 7: "cmp", 8: "stat" }[f.floor];
    const ex = mk("section", "lesson-step");
    ex.appendChild(mk("h3", "", `오늘 배운 도구 · ${tool.concept}`));
    const ul = mk("ul", "lesson-explain");
    (TYPE_EXPLAIN[typeOf] || []).forEach(([c, d]) => { const li = mk("li"); li.append(mk("code", "", c), document.createTextNode(" — " + d)); ul.appendChild(li); });
    ex.appendChild(ul);
    m.body.appendChild(ex);
    const a = mk("div", "check-actions");
    const go = mk("button", "primary", label); go.type = "button";
    go.addEventListener("click", () => { closeModal(); next(); });
    a.appendChild(go);
    m.body.appendChild(a);
  }

  // ---------- 경비 보고서 → 큰 미스터리 ----------
  function startReport() { openReport(); }

  function openReport() {
    const m = openModal({ title: "경비 보고서", cls: "lesson report-win" });
    const myX = night.log.filter((r) => r.stamp === "report").map((r) => ({ kind: "real", floor: r.floor, hour: r.hour }));
    m.body.appendChild(mk("p", "lesson-intro", "순찰이 끝났어요. 오늘 밤 출입 기록을 그래프 하나로 그려 보고서에 붙입시다. 빨간 표시는 당신이 ✗ 신고한 층의 시각이에요."));
    const box = mk("div", "inv-step");
    box.appendChild(mk("p", "inv-concept", `새 도구 · ${REPORT.concept}`));
    box.appendChild(mk("p", "inv-question", REPORT.question));
    const sent = mk("div");
    const cards = mk("div", "cards");
    const note = mk("div");
    const fig = mk("div", "figure");
    box.append(sent, cards, note, fig);
    m.body.appendChild(box);
    const a = mk("div", "check-actions");
    const go = mk("button", "primary", "보고서 붙이고 큰 미스터리 풀기 ▶"); go.type = "button"; go.disabled = true;
    a.appendChild(go);
    m.body.appendChild(a);
    const render = () => {
      const pick = night.chart;
      sent.innerHTML = "";
      sent.appendChild(sentenceLine(REPORT.sentence, pick === null ? null : REPORT.cards[pick].word));
      cards.innerHTML = "";
      REPORT.cards.forEach((c, j) => {
        const b = mk("button", "card" + (j === pick ? " picked" : "")); b.type = "button";
        b.appendChild(mk("b", "card-word", c.word));
        b.appendChild(mk("span", "", c.meaning));
        b.addEventListener("click", () => { night.chart = j; Sfx.click(); render(); });
        cards.appendChild(b);
      });
      note.innerHTML = ""; fig.innerHTML = "";
      if (pick !== null) {
        note.appendChild(mk("p", "inv-note", `${REPORT.cards[pick].word}: 출입이 가장 많은 때와 드문 때를 비교해 보세요. 내 ✗ 신고는 어디에 몰려 있나요?`));
        fig.appendChild(chartSvg(REPORT.cards[pick].fill, myX));
      }
      go.disabled = pick === null;
    };
    go.addEventListener("click", () => { closeModal(); startMystery(); });
    night.chart = null;
    render();
  }

  function startMystery() {
    s = Object.assign(freshBoard(), { floor: "mystery", mysteryMode: true, lenses: [] });
    night.mystery = s;
    updateDesk();
    openMysteryBoard();
  }
  function openMysteryBoard() {
    openBoardModal(MYSTERY, s, MYSTERY.title, { options: BOARD_OPTIONS.mystery || {}, onSolvedClose: (solved) => (solved ? finale() : showSummary("반쪽 진실")) });
  }

  function finale() {
    const m = openModal({ title: "6층 CCTV", cls: "finale" });
    const screen = mk("div", "finale-screen");
    screen.appendChild(mk("p", "finale-plate", "607"));
    screen.appendChild(mk("p", "finale-text", "복도 끝, 없던 작은 문의 문패가 607로 바뀌었다. 문이 천천히 열리고…"));
    m.body.appendChild(screen);
    Sfx.wrong();
    setTimeout(() => { screen.classList.add("cut"); screen.appendChild(mk("p", "finale-cut", "— 신호 없음 —")); }, 1600);
    m.body.appendChild(mk("p", "lesson-intro", "영상은 속여도, 분포는 못 속인다. 오늘 밤 당신은 그래프와 빈 칸(NaN)으로 존재하지 않는 방을 찾아냈어요."));
    const a = mk("div", "check-actions");
    const go = mk("button", "primary", "근무 종료 정산서 ▶"); go.type = "button";
    go.addEventListener("click", () => { closeModal(); showSummary("진실"); });
    a.appendChild(go);
    m.body.appendChild(a);
  }

  // ---------- 근무 종료 정산서 ----------
  function showSummary(grade) {
    closeModal();
    CctvView.stop();
    Sfx.stopAmbience();
    if (grade === "진실") Sfx.win(); else Sfx.lose();
    const m = openModal({ title: "근무 종료 정산서", cls: "paper summary" });
    const head = { 진실: "결말: 진실 — 607호의 정체를 밝혔다", "반쪽 진실": "결말: 반쪽 진실 — 이상은 막았지만 정체는 모른다" }[grade];
    m.body.appendChild(mk("p", "choice-banner " + (grade === "진실" ? "ok" : "bad"), head));
    const t = mk("table", "summary-table");
    const trh = mk("tr");
    ["층", "이상현상", "내 판정", "실제"].forEach((h) => trh.appendChild(mk("th", "", h)));
    t.appendChild(trh);
    const lab = (v) => (v === "report" ? "✗ 신고" : v === "next" ? "✓ 정상" : "-");
    night.log.forEach((r) => {
      const right = r.stamp === r.answer;
      const tr = mk("tr", right ? "" : "wrong");
      [`${r.floor}층`, r.anomaly, lab(r.stamp), lab(r.answer)].forEach((v) => tr.appendChild(mk("td", "", v)));
      t.appendChild(tr);
    });
    m.body.appendChild(t);
    const right = night.log.filter((r) => r.stamp === r.answer).length;
    m.body.appendChild(mk("p", "paper-note", `판정 정답 ${right} / ${night.log.length} · 큰 미스터리 ${night.mystery && night.mystery.solved ? "해결" : "미해결"}`));
    const c = typeof COURSE === "object" && COURSE ? COURSE : {};
    const course = mk("div", "course");
    course.appendChild(mk("h2", "", "오늘 밤 당신이 한 일이 바로 EDA예요"));
    course.appendChild(mk("p", "", `값 모아 보기(unique), 거르기(조건 · isin), 빈 칸 찾기(결측치), 묶어서 세기(groupby), 가장 큰 값(통계), 그리고 그래프까지. 렌즈 문장은 모두 진짜 pandas 코드였어요. ${c.name ? `중앙대학교 K-MOOC 「${c.name}」` : "중앙대학교 K-MOOC 강좌"}에서 직접 써 보세요.` + (c.blurb ? " " + c.blurb : "")));
    const link = mk("a", "course-link", c.name ? `「${c.name}」 강좌 보러 가기 ↗` : "K-MOOC 에서 강좌 찾아보기 ↗");
    link.href = c.url || "https://www.kmooc.kr"; link.target = "_blank"; link.rel = "noopener";
    course.appendChild(link);
    m.body.appendChild(course);
    const a = mk("div", "check-actions");
    const again = mk("button", "primary", "처음부터 다시"); again.type = "button";
    again.addEventListener("click", () => { closeModal(); restart(); });
    a.appendChild(again);
    m.body.appendChild(a);
  }

  // ---------- 책상 표시 ----------
  function updateDesk() {
    if (!s) return;
    const bb = $("board-btn");
    if (bb) {
      bb.classList.toggle("solved", s.solved);
      $("board-status").textContent = s.mysteryMode ? "큰 미스터리"
        : s.stamp ? (s.stamp === "report" ? "✗ 신고함" : "✓ 정상 처리함")
        : s.solved ? "모두 맞음" : `증거 ${s.pins.length}장 · 확인 ${s.checksLeft} / ${MAX_CHECKS}`;
    }
    const stamped = !!s.stamp || !!s.mysteryMode;
    el.btnReport.disabled = stamped;
    el.btnNext.disabled = stamped;
    el.btnContinue.classList.toggle("hidden", !s.stamp);
  }

  function startFloor(f) {
    if (f.floor === 1 || !night) night = freshNight();
    document.querySelectorAll(".desk-stamp").forEach((x) => x.remove());
    s = freshFloor(f.floor);
    renderRules();
    renderTip();
    updateDesk();
    if (f.floor === 1) openGuide();               // 안내는 1층 시작 전에 한 번만
  }

  function setFound() { if (s && !s.mysteryMode) s.found = true; }

  return { startFloor, setFound, openBook, openBoard, verdict, stamp, finishFloor, get state() { return s; }, get night() { return night; } };
})();
