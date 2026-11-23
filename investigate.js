// ============================================================
// investigate.js — 조사 흐름 (설계: design/flow-investigator.md)
//   ① 조사: 책(출입표 · 택배장부)을 열고, 드롭다운으로 렌즈 문장을 골라 표를 거른다
//           아래 고급 모드에서는 pandas 코드를 직접 써서 실행할 수 있다 (advanced.js)
//   ② 잇기: REPORT 보드의 빈칸을 드롭다운으로 채우고 확인한다 (확인 3회, "2개 이하 틀림" 피드백)
//   ③ 판정: ✓ 정상 / ✗ 신고 도장. 맞았는지는 바로 알려 주지 않는다 → 두 층 뒤 결과(경고장), 정산서에서 공개
//   ④ 풀이: 내가 쓴 렌즈가 pandas 코드로 나온다
//   마지막: 경비 보고서(그래프 + 내 ✗ 도장) → 큰 미스터리 보드 → 정산서
// game.js 의 mk / $ / el / openModal / closeModal / currentFloor / proceed / restart / chartSvg / sentenceLine 을 쓴다.
// ============================================================

const Inv = (() => {
  const MAX_CHECKS = 3;          // 보드마다 확인 횟수
  const FIRE_AT = 3;             // 경고장 3장이면 해고
  const RESULT_DELAY = 2;        // 오판의 결과는 두 층 뒤에 돌아온다
  const NUMERIC = ["출입시", "소리", "나이"];
  const NULL = "비어 있음";      // 드롭다운에서 빈 값(NaN)을 뜻하는 보기
  const VERDICTS = ["설명된다", "설명되지 않는다"];

  let s = null;                  // 이 층(또는 미스터리)의 조사 상태
  let night = null;              // 밤 전체 상태

  const freshNight = () => ({ log: [], warnings: 0, pending: [], fired: false, mystery: null, chart: null });
  const freshBoard = () => ({ board: {}, checksLeft: MAX_CHECKS, checksUsed: 0, feedback: "", solved: false, firstTry: null });
  const freshFloor = (floor) => Object.assign(freshBoard(), { floor, lenses: [], stamp: null, lensDraft: {} });

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
        const vals = rows.map((r) => r[L.col]).filter((v) => !isNull(v));
        if ((L.fn === "mean" || L.fn === "sum") && !isNum(L.col)) return { kind: "msg", text: "평균과 합은 숫자 열(출입시 · 소리 · 나이)에서만 구할 수 있어요." };
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
        return `${T}에서 ${parts.join(L.join === "or" ? " 이거나 " : " 이고 ")} 줄만 보기`;
      }
      case "unique": return `${T}의 ${L.col}에 어떤 값들이 있는지 모아 보기`;
      case "null": return `${T}에서 ${L.col}${josa(L.col, "(이)가")} ${L.mode === "null" ? "비어 있는" : "채워진"} 줄만 보기`;
      case "isin": return `${T}에서 ${L.col}${josa(L.col, "(이)가")} ${L.vals.join(", ")} 중 하나인 줄만 보기`;
      case "group": return `${T}${josa(T, "(을)를")} ${L.col}별로 묶어서 세기`;
      case "stat": return `${T}의 ${L.col}에서 ${FN_WORD[L.fn]} 값 찾기`;
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
      case "stat": return L.col ? `${df}['${L.col}'].${L.fn}()` : df;
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
    stat: [[".max() / .min()", "가장 큰 값 / 가장 작은 값이에요. 날짜에서는 가장 최근 / 가장 오래된 날이에요."], [".mean() / .sum()", "평균 / 합이에요. 숫자 열에서 써요."]],
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

  function openBook(tableKey) {
    if (!s || s.mysteryMode) return;
    const table = TABLES.find((t) => t.key === tableKey);
    const floor = s.floor;
    const types = LENS_TYPES.filter((t) => t.unlock <= floor);
    const L = s.lensDraft[tableKey] || (s.lensDraft[tableKey] = {
      type: "cmp", conds: [{ col: null, op: "eq", val: null }], join: "and", col: null, mode: "null", vals: [null, null, null], fn: "max",
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
    const clear = mk("button", "", "렌즈 지우기"); clear.type = "button";
    bar.append(count, clear);
    const box = mk("div", "table-scroll book-scroll");
    wrap.append(lensBox, bar, box, advancedPanel(table, () => lensCode(table, L)));
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
      const ops = floor >= 7 && c.col && isNum(c.col) ? ["eq", "ne", "ge", "le"] : ["eq", "ne"];
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
        line.append(txt("줄만 보기"));
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
          txt("줄만 보기"));
      } else if (L.type === "isin") {
        line.append(txt(`${T}에서`), pickCol(L.col, (v) => { L.col = v; L.vals = [null, null, null]; render(true); }), txt(L.col ? josa(L.col, "(이)가") : "이(가)"));
        const items = L.col ? columnValues(table, L.col).filter((it) => it.value !== NULL) : [];
        L.vals.forEach((v, i) => {
          if (i > 0) line.append(txt(","));
          line.append(dropdown(items, v, i === 0 ? "값 고르기" : "(더 고르기)", (nv) => { L.vals[i] = nv; render(true); }, "val"));
        });
        line.append(txt("중 하나인 줄만 보기"));
      } else if (L.type === "group") {
        line.append(txt(`${T}${josa(T, "(을)를")}`), pickCol(L.col, (v) => { L.col = v; render(true); }), txt("별로 묶어서 세기"));
      } else if (L.type === "stat") {
        line.append(txt(`${T}의`), pickCol(L.col, (v) => { L.col = v; render(true); }), txt("에서"),
          dropdown(["max", "min", "mean", "sum"].map((f) => ({ value: f, label: FN_WORD[f] })), L.fn, "", (v) => { L.fn = v || "max"; render(true); }, "op"),
          txt("값 찾기"));
      }
      const res = runLens(table, L);
      drawResult(res);
      clear.disabled = res.idle && !L.col && !L.conds.some((c) => c.col) && !L.vals.some((v) => v !== null);
      if (flash) { box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); }
    };

    const drawResult = (res) => {
      box.innerHTML = "";
      if (res.kind === "rows") {
        count.textContent = res.idle ? `전체 ${res.rows.length}줄` : `${table.rows.length}줄 → ${res.rows.length}줄`;
        box.appendChild(rowsTable(table.columns, res.rows));
      } else if (res.kind === "values") {
        count.textContent = `${res.col}: ${res.values.length}가지`;
        box.appendChild(chips(res.values));
      } else if (res.kind === "series") {
        count.textContent = `${res.items.length}묶음`;
        box.appendChild(pairTable([res.col, "줄 수"], res.items.map(([k, n]) => [k, `${n}건`])));
      } else if (res.kind === "stat") {
        count.textContent = `${res.col}의 ${FN_WORD[res.fn]} 값`;
        const list = mk("div", "value-list big"); list.appendChild(mk("span", "chip stat", String(res.value))); box.appendChild(list);
      } else {
        count.textContent = "결과 없음";
        box.appendChild(mk("p", "hint", res.text));
      }
      box.scrollTop = 0;
    };

    clear.addEventListener("click", () => {
      logNow();
      Object.assign(L, { conds: [{ col: null, op: "eq", val: null }], join: "and", col: null, mode: "null", vals: [null, null, null], fn: "max" });
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
    const snap = JSON.parse(JSON.stringify({ type: L.type, conds: L.conds.filter(condReady), join: L.join, col: L.col, mode: L.mode, vals: L.vals.filter((v) => v !== null), fn: L.fn }));
    snap.table = table.key;
    const key = lensCode(table, snap);
    if (s.lenses.some((l) => l.key === key)) return;
    snap.key = key;
    snap.result = res.kind === "rows" ? `${res.rows.length}줄` : res.kind === "values" ? `${res.values.length}가지` : res.kind === "series" ? `${res.items.length}묶음` : res.kind === "stat" ? String(res.value) : "";
    s.lenses.push(snap);
  }

  // ---------- REPORT 보드 (층 보드 · 큰 미스터리 공용) ----------
  // opts: { options: 빈칸 id → 보기 목록, stamps: 신고/정상 버튼을 둘지, onSolvedClose: 미스터리용 }
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
      if (opts.stamps) {
        const rep = mk("button", "stamp-btn bad", "신고"); rep.type = "button";
        const ok = mk("button", "stamp-btn ok", "정상"); ok.type = "button";
        rep.disabled = ok.disabled = !!st.stamp;
        rep.addEventListener("click", () => stamp("report"));
        ok.addEventListener("click", () => stamp("next"));
        right.append(rep, ok);
        if (st.stamp) right.appendChild(mk("span", "stamped", st.stamp === "report" ? "✗ 신고함" : "✓ 정상 처리함"));
      } else if (opts.onSolvedClose && (st.solved || st.checksLeft === 0)) {
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
        st.feedback = opts.stamps ? "모두 맞음. 이제 신고할지, 정상으로 볼지 정하세요." : "모두 맞음.";
        Sfx.correct();
      } else {
        if (st.firstTry === null) st.firstTry = false;
        st.feedback = wrong <= 2 ? "2개 이하 틀림. (어느 칸인지는 알려 주지 않아요)" : "아직 맞지 않다.";
        if (st.checksLeft === 0) st.feedback += opts.stamps ? " 확인을 다 썼어요. 이제 신고 / 정상으로 판단하세요." : " 확인을 다 썼어요.";
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
    const bd = BOARDS[s.floor];
    openBoardModal(bd, s, `REPORT 보드 · ${bd.title}`, { options: BOARD_OPTIONS[s.floor] || {}, stamps: true });
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
    ["책을 열어 기록을 걸러 보세요.", tool ? `새 도구: ${tool.name}` : null, "REPORT 보드를 채우고 ✓ / ✗ 를 누르세요."]
      .filter(Boolean).forEach((t) => ul.appendChild(mk("li", "", t)));
    box.appendChild(ul);
  }

  function openRules(notice, onClose) {
    const f = currentFloor();
    const m = openModal({ title: notice ? `관리소 공지 · ${f.floor}층${f.place ? " " + f.place : ""} 근무` : "아파트 수칙", cls: "paper", onClose });
    if (notice) m.body.appendChild(mk("p", "paper-note", f.floor === 1
      ? "오늘 밤 이 층의 수칙과 조사 도구예요. 게임은 질문하지 않아요. 무엇을 볼지는 당신이 정해요."
      : "새 수칙과 새 조사 도구가 생겼어요. 앞에서 쓴 도구도 계속 쓸 수 있어요."));
    const ol = mk("ol", "rule-list");
    rulesFor(f.floor).forEach((r) => ol.appendChild(mk("li", r.floor === f.floor ? "new" : "", r.text)));
    m.body.appendChild(ol);
    const tool = FLOOR_TOOL[f.floor];
    if (notice && tool) {
      const u = mk("div", "unlock");
      u.appendChild(mk("b", "", `새 렌즈: ${tool.name}`));
      u.appendChild(mk("p", "", tool.sentence));
      m.body.appendChild(u);
    }
    if (notice && f.floor === 1) {
      const how = mk("ol", "howto");
      ["◀ ▶ 로 CCTV 복도를 좌우로 둘러보며 이상한 것을 찾아요.",
       "책(출입표 · 택배장부)을 열고, 문장의 빈칸을 드롭다운으로 골라 표를 걸러 봐요.",
       "REPORT 보드의 빈칸을 드롭다운으로 채우고 확인해요. (확인은 층마다 3번)",
       "✓ 정상 / ✗ 신고 를 눌러요. 맞았는지는 바로 알려 주지 않아요. 틀린 판단은 나중에 돌아와요."].forEach((t) => how.appendChild(mk("li", "", t)));
      m.body.appendChild(how);
    }
    const a = mk("div", "check-actions");
    const ok = mk("button", "primary", notice ? "근무 시작" : "닫기"); ok.type = "button";
    ok.addEventListener("click", () => closeModal());
    a.appendChild(ok);
    m.body.appendChild(a);
  }

  // ---------- 판정 도장 ----------
  function stamp(choice) {
    if (!s || s.stamp || s.mysteryMode) return;
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

  // ---------- 오판의 결과 · 경고장 ----------
  function renderWarnings() {
    const h = el.hearts;
    if (!h || !night) return;
    h.innerHTML = "";
    h.classList.toggle("hidden", night.warnings === 0);
    h.classList.add("warnings");
    h.appendChild(mk("span", "warn-label", "경고장"));
    for (let i = 0; i < night.warnings; i++) h.appendChild(mk("span", "warn-slip"));
    h.setAttribute("aria-label", `경고장 ${night.warnings}장 (3장이면 해고)`);
  }

  // due 가 된 결과를 차례로 보여 준다. 다 보여 주면 next()
  function runEvents(due, next) {
    const list = night.pending.filter((p) => p.due === due || (due === "report" && typeof p.due === "number" && p.due > FLOORS.length));
    night.pending = night.pending.filter((p) => !list.includes(p));
    const step = () => {
      const p = list.shift();
      if (!p) return next();
      const ev = EVENTS[p.floor];
      night.warnings += 1;
      renderWarnings();
      Sfx.wrong();
      const m = openModal({ title: `${ev.from} · ${p.floor}층 판정 관련`, cls: "paper event", onClose: () => setTimeout(() => (night.warnings >= FIRE_AT ? fire() : step()), 0) });
      m.body.appendChild(mk("p", "event-from", ev.kind === "민원" ? "📞 주민 민원" : "📻 순찰 무전"));
      m.body.appendChild(mk("p", "event-text", ev.text));
      m.body.appendChild(mk("p", "paper-note", `관리소 경고장 1장. (${night.warnings} / ${FIRE_AT}장) ${p.floor}층에서 찍은 도장이 틀렸다는 뜻이에요.`));
      const a = mk("div", "check-actions");
      const ok = mk("button", "primary", "확인"); ok.type = "button";
      ok.addEventListener("click", () => closeModal());
      a.appendChild(ok);
      m.body.appendChild(a);
    };
    step();
  }

  function fire() {
    night.fired = true;
    showSummary("해고");
  }

  // ---------- 층 마치기: 풀이 → 다음 층 | 보고서 ----------
  function finishFloor() {
    const f = currentFloor();
    night.log.push({ floor: f.floor, anomaly: f.anomaly, stamp: s.stamp, answer: f.answer, firstTry: s.firstTry, solved: s.solved, lenses: s.lenses.length, hour: Number(f.cctvTime.slice(6, 8)) });
    if (s.stamp !== f.answer) night.pending.push({ floor: f.floor, due: f.floor + RESULT_DELAY });
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
  function startReport() {
    runEvents("report", () => {
      if (night.fired) return;
      openReport();
    });
  }

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
    const head = { 진실: "결말: 진실 — 607호의 정체를 밝혔다", "반쪽 진실": "결말: 반쪽 진실 — 이상은 막았지만 정체는 모른다", 해고: "결말: 해고 — 경고장 3장" }[grade];
    m.body.appendChild(mk("p", "choice-banner " + (grade === "진실" ? "ok" : "bad"), head));
    const t = mk("table", "summary-table");
    const trh = mk("tr");
    ["층", "이상현상", "내 판정", "실제", "보드 첫 확인", "쓴 렌즈", "결과"].forEach((h) => trh.appendChild(mk("th", "", h)));
    t.appendChild(trh);
    const lab = (v) => (v === "report" ? "✗ 신고" : v === "next" ? "✓ 정상" : "-");
    night.log.forEach((r) => {
      const right = r.stamp === r.answer;
      const tr = mk("tr", right ? "" : "wrong");
      [`${r.floor}층`, r.anomaly, lab(r.stamp), lab(r.answer), r.firstTry ? "모두 맞음" : r.solved ? "고쳐서 맞음" : "못 맞힘", `${r.lenses}개`,
        right ? "없음" : r.answer === "report" ? "괴현상 번짐" : "주민 민원"].forEach((v) => tr.appendChild(mk("td", "", v)));
      t.appendChild(tr);
    });
    m.body.appendChild(t);
    const right = night.log.filter((r) => r.stamp === r.answer).length;
    const firsts = night.log.filter((r) => r.firstTry).length;
    m.body.appendChild(mk("p", "paper-note", `판정 정답 ${right} / ${night.log.length} · 보드 첫 확인 모두 맞음 ${firsts}층 · 경고장 ${night.warnings}장 · 큰 미스터리 ${night.mystery && night.mystery.solved ? "해결" : "미해결"}`));
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
        : s.solved ? "모두 맞음" : `확인 ${s.checksLeft} / ${MAX_CHECKS}`;
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
    renderWarnings();
    updateDesk();
    runEvents(f.floor, () => { if (!night.fired) openRules(true); });
  }

  return { startFloor, openBook, openBoard, stamp, finishFloor, get state() { return s; }, get night() { return night; } };
})();
