// ============================================================
// investigate.js — ver8 조사자 흐름 (설계: design/flow-investigator.md)
//   ① 관찰: CCTV 장면·표의 칸을 눌러 낱말을 모은다 (낱말 수첩)
//   ② 조사: 책을 열고 렌즈 문장을 직접 조립해 표를 거른다 (게임은 질문하지 않는다)
//   ③ 잇기: 추리 보드의 빈칸에 낱말을 넣고 확인한다 (확인 3회, "2개 이하 틀림" 피드백)
//   ④ 판정: ✓/✗ 도장. 맞았는지는 바로 알려 주지 않는다 → 두 층 뒤 결과(경고장), 정산서에서 공개
//   ⑤ 풀이: 내가 쓴 렌즈가 pandas 코드로 나온다
//   마지막: 경비 보고서(그래프 + 내 ✗ 도장) → 큰 미스터리 보드 → 정산서
// game.js 의 mk / $ / el / openModal / closeModal / currentFloor / proceed / restart / chartSvg / Sfx 를 쓴다.
// ============================================================

const Inv = (() => {
  const MAX_CHECKS = 3;          // 보드마다 확인 횟수 (무전기 배터리)
  const FIRE_AT = 3;             // 경고장 3장이면 해고
  const RESULT_DELAY = 2;        // 오판의 결과는 두 층 뒤에 돌아온다
  const NUMERIC = ["출입시", "소리", "나이"];

  let s = null;                  // 이 층(또는 미스터리)의 조사 상태
  let night = null;              // 밤 전체 상태

  const freshNight = () => ({ log: [], warnings: 0, pending: [], allWords: [], fired: false, mystery: null, chart: null });
  const freshBoard = () => ({ board: {}, checksLeft: MAX_CHECKS, checksUsed: 0, feedback: "", solved: false, firstTry: null });
  const freshFloor = (floor) => Object.assign(freshBoard(), {
    floor, words: [], selected: null, lenses: [], stamp: null,
  });

  // ---------- 낱말 ----------
  const catOf = (col) => ({
    동물종류: "who", 호수: "where", 출입시간: "when", 배달도착시간: "when", 입주날짜: "when", 출입시: "when",
    배달제품: "what", 주민등록번호: "what", 빛감지: "state", 학생여부: "state", 운동: "state",
    소리: "howmany", 나이: "howmany",
  }[col] || "what");

  // 표의 값 → 낱말
  function cellWord(col, v) {
    if (v === null || v === undefined || v === "NaN") return { text: "비어 있음", cat: "state" };
    if (col === "호수") return { text: `${v}호`, cat: "where" };
    if (col === "출입시간" || col === "배달도착시간") return { text: String(v).slice(-5), cat: "when" };
    if (col === "나이") return { text: `${v}살`, cat: "howmany" };
    if (col === "출입시") return { text: `${v}시`, cat: "when" };
    if (col === "소리") return { text: `소리 ${v}`, cat: "howmany" };
    return { text: String(v), cat: catOf(col) };
  }

  function addWord(text, cat, src, quiet) {
    if (!s) return;
    const had = s.words.find((w) => w.text === text);
    if (had) { s.selected = text; renderBanks(text); return; }
    s.words.push({ text, cat, src });
    if (night && !night.allWords.some((w) => w.text === text)) night.allWords.push({ text, cat });
    s.selected = text;
    if (!quiet) { Sfx.open(); toast(`낱말 +  ${text}`, cat); }
    renderBanks(text);
  }

  function toast(msg, cat) {
    const t = mk("div", "inv-toast", msg);
    if (cat && CATS[cat]) t.style.borderColor = CATS[cat].color;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  // 낱말 수첩: 책상 왼쪽 + 열린 창 아래쪽 모두 같은 내용을 보여 준다
  function renderBanks(flashText) {
    document.querySelectorAll(".word-bank").forEach((bank) => {
      bank.innerHTML = "";
      if (!s || !s.words.length) {
        bank.appendChild(mk("p", "bank-empty", "아직 모은 낱말이 없어요. CCTV에서 수상한 것(동물, 문, 물건, 화면의 시각)을 누르거나, 표의 칸을 눌러 보세요."));
        return;
      }
      s.words.forEach((w) => {
        const c = mk("button", "wchip" + (s.selected === w.text ? " selected" : "") + (flashText === w.text ? " flash" : ""), w.text);
        c.type = "button";
        c.dataset.text = w.text;
        c.style.setProperty("--cat", CATS[w.cat].color);
        c.title = `${CATS[w.cat].label} 낱말`;
        c.setAttribute("aria-pressed", String(s.selected === w.text));
        c.addEventListener("click", () => { s.selected = s.selected === w.text ? null : w.text; renderBanks(); });
        bank.appendChild(c);
      });
    });
  }

  const wordByText = (t) => s.words.find((w) => w.text === t);

  function bankDrawer() {
    const d = mk("div", "bank-drawer");
    d.appendChild(mk("span", "bank-label", "낱말 수첩 · 고른 낱말을 빈칸에 넣어요"));
    d.appendChild(mk("div", "word-bank"));
    return d;
  }

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
      "(으)로": b && !isRieul(word) ? "으로" : "로", "(이)": b ? "이" : "" }[marker];
  }
  const JOSA_RE = /^(\(이\)가|\(을\)를|\(은\)는|\(과\)와|\(으\)로)/;

  // ---------- 장면에서 낱말 줍기 ----------
  function onSceneTag(tag) {
    if (!s || s.mysteryMode) return;
    const f = currentFloor();
    if (tag.startsWith("door-")) {
      addWord(`${f.floor * 100 + Number(tag.slice(5)) + 1}호`, "where", "CCTV 문");
      return;
    }
    const words = (SCENE_WORDS[f.floor] || {})[tag];
    if (words) words.forEach((w, i) => addWord(w.text, w.cat, "CCTV", i > 0));
  }
  function onClock() { onSceneTag("clock"); }

  // ---------- 렌즈: 계산 ----------
  const norm = (col, v) => {
    if (v === null || v === undefined) return "비어 있음";
    let t = String(v);
    if (col === "호수") t = t.replace(/호$/, "");
    if (col === "출입시간" || col === "배달도착시간") t = t.slice(-5);
    if (col === "나이") t = t.replace(/살$/, "");
    if (col === "출입시") t = t.replace(/시$/, "");
    if (col === "소리") t = t.replace(/^소리 /, "");
    return t;
  };
  const isNum = (col) => NUMERIC.includes(col);
  const condReady = (c) => c.col && c.val !== null && c.val !== undefined && c.val !== "";

  function testCond(r, c) {
    const a = r[c.col];
    if (c.val === "비어 있음") return (a === null || a === undefined) === (c.op === "eq");
    if (isNum(c.col)) {
      if (a === null || a === undefined) return false;
      const x = Number(a), y = Number(norm(c.col, c.val));
      return { eq: x === y, ne: x !== y, ge: x >= y, le: x <= y }[c.op];
    }
    const x = norm(c.col, a), y = norm(c.col, c.val);
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
        return { kind: "rows", rows: rows.filter((r) => (r[L.col] === null || r[L.col] === undefined) === (L.mode === "null")) };
      case "isin": {
        if (!L.col || !L.vals.length) return { kind: "rows", rows, idle: true };
        const set = new Set(L.vals.map((v) => norm(L.col, v)));
        return { kind: "rows", rows: rows.filter((r) => set.has(norm(L.col, r[L.col]))) };
      }
      case "group": {
        if (!L.col) return { kind: "rows", rows, idle: true };
        const m = new Map();
        rows.forEach((r) => { const k = r[L.col] === null || r[L.col] === undefined ? "NaN" : r[L.col]; m.set(k, (m.get(k) || 0) + 1); });
        return { kind: "series", col: L.col, items: [...m.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]), "ko", { numeric: true })) };
      }
      case "stat": {
        if (!L.col) return { kind: "rows", rows, idle: true };
        const vals = rows.map((r) => r[L.col]).filter((v) => v !== null && v !== undefined);
        if ((L.fn === "mean" || L.fn === "sum") && !isNum(L.col)) return { kind: "msg", text: "평균과 합은 숫자 열(출입시·소리·나이)에서만 구할 수 있어요." };
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
    const col = c.col || "[열]", val = c.val || "[값]";
    const cj = c.col ? josa(col, "(이)가") : "이(가)";
    if (c.val === "비어 있음") return `${col}${cj} ${c.op === "eq" ? "비어 있는" : "채워진"}`;
    if (c.op === "ge" || c.op === "le") return `${col}${cj} ${val} ${OP_WORD[c.op]}`;
    return `${col}${cj} ${val}${c.val ? josa(val, "(과)와") : "와(과)"} ${OP_WORD[c.op]}`;
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
      case "group": return `${T}를 ${L.col}별로 묶어서 세기`;
      case "stat": return `${T}의 ${L.col}에서 ${FN_WORD[L.fn]} 값 찾기`;
    }
    return "";
  }

  const lit = (col, v) => (isNum(col) ? norm(col, v) : `'${norm(col, v)}'`);
  function condCode(df, c) {
    if (c.val === "비어 있음") return `${df}['${c.col}'].${c.op === "eq" ? "isnull" : "notnull"}()`;
    if ((c.col === "출입시간" || c.col === "배달도착시간") && !isNum(c.col)) {
      const e = `${df}['${c.col}'].str.endswith(${lit(c.col, c.val)})`;
      return c.op === "ne" ? `~${e}` : e;
    }
    return `${df}['${c.col}'] ${OP_CODE[c.op]} ${lit(c.col, c.val)}`;
  }

  function lensCode(table, L) {
    const df = table.varName;
    switch (L.type) {
      case "cmp": {
        const conds = L.conds.filter(condReady);
        if (conds.length === 1) return `${df}[ ${condCode(df, conds[0])} ]`;
        return `${df}[ ${conds.map((c) => `(${condCode(df, c)})`).join(L.join === "or" ? " | " : " & ")} ]`;
      }
      case "unique": return `${df}['${L.col}'].unique()`;
      case "null": return `${df}[ ${df}['${L.col}'].${L.mode === "null" ? "isnull" : "notnull"}() ]`;
      case "isin": return `${df}[ ${df}['${L.col}'].isin([${L.vals.map((v) => lit(L.col, v)).join(", ")}]) ]`;
      case "group": return `${df}.groupby('${L.col}').size()`;
      case "stat": return `${df}['${L.col}'].${L.fn}()`;
    }
    return "";
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

  // ---------- 렌즈: 책 창 ----------
  function openBook(tableKey) {
    if (!s || s.mysteryMode) return;
    const table = TABLES.find((t) => t.key === tableKey);
    const floor = s.floor;
    const types = LENS_TYPES.filter((t) => t.unlock <= floor);
    let L;
    const logNow = () => { const r = runLens(table, L); if (!r.idle && r.kind !== "msg") logLens(table, L, r); };
    const m = openModal({ title: `${table.title} (${table.rows.length}행)`, cls: `book-window inv-book book-${tableKey}-win`, onClose: () => logNow() });
    Sfx.open();
    s.lensDraft = s.lensDraft || {};
    L = s.lensDraft[tableKey] || (s.lensDraft[tableKey] = {
      type: "cmp", conds: [{ col: null, op: "eq", val: null }], join: "and",
      col: null, mode: "null", vals: [], fn: "max", focus: 0,
    });
    if (!types.some((t) => t.id === L.type)) L.type = "cmp";

    const wrap = mk("div", "inv-book-wrap");
    const lensBox = mk("div", "lens-box");
    const tabs = mk("div", "lens-tabs");
    const line = mk("div", "lens-line");
    const tip = mk("p", "lens-tip");
    lensBox.append(tabs, line, tip);
    wrap.appendChild(lensBox);
    const bar = mk("div", "book-bar");
    const count = mk("button", "count-chip"); count.type = "button";
    count.title = "누르면 이 수가 낱말이 돼요";
    const clear = mk("button", "", "렌즈 지우기"); clear.type = "button";
    bar.append(count, clear);
    wrap.appendChild(bar);
    const box = mk("div", "table-scroll book-scroll");
    wrap.appendChild(box);
    wrap.appendChild(bankDrawer());
    m.body.appendChild(wrap);

    const slot = (text, cls, filled, onClick, focused) => {
      const b = mk("button", "lslot " + cls + (filled ? " filled" : "") + (focused ? " focus" : ""), text); b.type = "button";
      b.addEventListener("click", onClick);
      return b;
    };
    const txt = (t) => mk("span", "lfix", t);
    const needWord = () => { toast("먼저 낱말 수첩에서 낱말을 고르세요"); };

    // 숫자 열: 값은 −/+ 로 고른다
    const stepper = (c) => {
      const w = mk("span", "stepper");
      const minus = mk("button", "", "−"), plus = mk("button", "", "+"); minus.type = plus.type = "button";
      const v = mk("b", "", c.val === null ? "?" : c.val);
      const max = c.col === "출입시" ? 23 : c.col === "소리" ? 10 : 20;
      const set = (d) => { c.val = String(Math.max(0, Math.min(max, (c.val === null ? (d > 0 ? -1 : max + 1) : Number(c.val)) + d))); render(true); };
      minus.addEventListener("click", () => set(-1)); plus.addEventListener("click", () => set(1));
      w.append(minus, v, plus);
      return w;
    };

    const condUI = (c, i) => {
      const out = [];
      out.push(slot(c.col || "[열]", "col", !!c.col, () => { L.focus = i; render(); toast("표 맨 윗줄의 열 이름을 누르세요"); }, L.focus === i));
      out.push(txt(c.col ? josa(c.col, "(이)가") : "이(가)"));
      if (c.col && isNum(c.col)) out.push(stepper(c));
      else out.push(slot(c.val || "[값]", "val", !!c.val, () => { if (!s.selected) return needWord(); c.val = s.selected; render(true); }));
      const ops = floor >= 7 && c.col && isNum(c.col) ? ["eq", "ne", "ge", "le"] : ["eq", "ne"];
      if (!ops.includes(c.op)) c.op = "eq";
      if (!(c.col && isNum(c.col))) out.push(txt(c.val ? josa(c.val, "(과)와") : "와(과)"));
      out.push(slot(OP_WORD[c.op], "op filled", true, () => { c.op = ops[(ops.indexOf(c.op) + 1) % ops.length]; render(true); }));
      return out;
    };

    const render = (flash) => {
      tabs.innerHTML = "";
      types.forEach((t) => {
        const b = mk("button", "lens-tab" + (L.type === t.id ? " on" : "") + (t.unlock === floor ? " new" : ""), t.tab); b.type = "button";
        b.addEventListener("click", () => { if (L.type !== t.id) { logNow(); L.type = t.id; L.col = null; L.vals = []; } render(true); });
        tabs.appendChild(b);
      });
      line.innerHTML = "";
      const T = table.title;
      if (L.type === "cmp") {
        line.append(txt(`${T}에서 `), ...condUI(L.conds[0], 0));
        if (L.conds[1]) {
          const joins = floor >= 7 ? ["and", "or"] : ["and"];
          line.append(slot(L.join === "or" ? "이거나" : "이고", "op filled join", true, () => { L.join = joins[(joins.indexOf(L.join) + 1) % joins.length]; render(true); }));
          line.append(...condUI(L.conds[1], 1));
          line.append(slot("✕", "op del", true, () => { L.conds.pop(); L.focus = 0; render(true); }));
        }
        line.append(txt(" 줄만 보기"));
        if (floor >= 2 && !L.conds[1]) line.append(slot(floor >= 7 ? "+ 조건 잇기 (이고/이거나)" : "+ 조건 잇기 (이고)", "add", false, () => { L.conds.push({ col: null, op: "eq", val: null }); L.focus = 1; render(); }));
        tip.textContent = "열 이름은 표 맨 윗줄을, 값은 낱말 수첩의 낱말을 골라 넣어요. 회색 칸을 누르면 같은/다른 등이 바뀌어요.";
      } else if (L.type === "unique") {
        line.append(txt(`${T}의 `), slot(L.col || "[열]", "col", !!L.col, () => toast("표 맨 윗줄의 열 이름을 누르세요"), true), txt("에 어떤 값들이 있는지 모아 보기"));
        tip.textContent = "열 이름을 누르면 그 열에 들어 있는 값이 한 번씩 모여요. 모인 값도 눌러서 낱말로 모을 수 있어요.";
      } else if (L.type === "null") {
        line.append(txt(`${T}에서 `), slot(L.col || "[열]", "col", !!L.col, () => toast("표 맨 윗줄의 열 이름을 누르세요"), true),
          txt(L.col ? josa(L.col, "(이)가") : "이(가)"),
          slot(L.mode === "null" ? "비어 있는" : "채워진", "op filled", true, () => { L.mode = L.mode === "null" ? "notnull" : "null"; render(true); }), txt(" 줄만 보기"));
        tip.textContent = "NaN(비어 있음)은 기록이 없다는 뜻이에요.";
      } else if (L.type === "isin") {
        line.append(txt(`${T}에서 `), slot(L.col || "[열]", "col", !!L.col, () => toast("표 맨 윗줄의 열 이름을 누르세요"), true), txt(L.col ? josa(L.col, "(이)가") + " " : "이(가) "));
        L.vals.forEach((v, i) => line.append(slot(v + " ✕", "val filled", true, () => { L.vals.splice(i, 1); render(true); })));
        if (L.vals.length < 3) line.append(slot("[값 더하기]", "val", false, () => { if (!s.selected) return needWord(); if (!L.vals.includes(s.selected)) L.vals.push(s.selected); render(true); }));
        line.append(txt(" 중 하나인 줄만 보기"));
        tip.textContent = "값을 3개까지 넣을 수 있어요. 그중 하나라도 맞는 줄이 남아요.";
      } else if (L.type === "group") {
        line.append(txt(`${T}를 `), slot(L.col || "[열]", "col", !!L.col, () => toast("표 맨 윗줄의 열 이름을 누르세요"), true), txt("별로 묶어서 세기"));
        tip.textContent = "같은 값끼리 묶어서 몇 줄씩인지 세요. 묶음 이름과 수도 눌러서 낱말로 모을 수 있어요.";
      } else if (L.type === "stat") {
        const fns = ["max", "min", "mean", "sum"];
        line.append(txt(`${T}의 `), slot(L.col || "[열]", "col", !!L.col, () => toast("표 맨 윗줄의 열 이름을 누르세요"), true), txt("에서 "),
          slot(FN_WORD[L.fn], "op filled", true, () => { L.fn = fns[(fns.indexOf(L.fn) + 1) % fns.length]; render(true); }), txt(" 값 찾기"));
        tip.textContent = "날짜·시각은 클수록 늦은(최근) 값이에요. 평균과 합은 숫자 열에서만 돼요.";
      }
      const res = runLens(table, L);
      drawResult(res);
      clear.disabled = res.idle && !L.col && !L.conds.some((c) => c.col || c.val) && !L.vals.length;
      if (flash) { box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); }
    };

    const setCol = (c) => {
      if (L.type === "cmp") { const cond = L.conds[L.focus] || L.conds[0]; cond.col = c; cond.val = null; cond.op = "eq"; if (L.conds[1] && L.focus === 0 && !L.conds[1].col) L.focus = 1; }
      else { L.col = c; L.vals = []; }
      render(true);
    };

    const head = (cols, onHead) => {
      const trh = mk("tr");
      cols.forEach((c) => {
        const th = mk("th", onHead ? "pickable" : "", c);
        if (onHead) { th.title = "누르면 렌즈의 [열]이 돼요"; th.addEventListener("click", () => onHead(c)); }
        trh.appendChild(th);
      });
      const thead = mk("thead"); thead.appendChild(trh); return thead;
    };
    const take = (w, src) => { logNow(); addWord(w.text, w.cat, src); };   // 결과에서 낱말을 주우면 그 렌즈를 "쓴 렌즈"로 남긴다
    const wordCell = (td, w, src) => { td.title = "누르면 낱말로 모아요"; td.addEventListener("click", () => take(w, src)); };

    const drawResult = (res) => {
      box.innerHTML = "";
      const t = mk("table", "data-table inv-table");
      if (res.kind === "rows") {
        count.textContent = res.idle ? `전체 ${res.rows.length}줄` : `${table.rows.length}줄 → ${res.rows.length}줄`;
        count.dataset.word = `${res.rows.length}줄`;
        t.appendChild(head(table.columns, setCol));
        const tb = mk("tbody");
        res.rows.forEach((r) => {
          const tr = mk("tr");
          table.columns.forEach((c) => {
            const v = r[c], td = mk("td", v === null || v === undefined ? "na" : "", v === null || v === undefined ? "NaN" : String(v));
            wordCell(td, cellWord(c, v), `${table.title} ${c}`);
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        box.appendChild(t);
      } else if (res.kind === "values") {
        count.textContent = `${res.values.length}가지`; count.dataset.word = `${res.values.length}가지`;
        const list = mk("div", "value-list big");
        res.values.forEach((v) => {
          const w = cellWord(res.col, v);
          const c = mk("button", "chip pick", v === null || v === undefined ? "NaN" : String(v)); c.type = "button";
          c.addEventListener("click", () => take(w, `${table.title} ${res.col}`));
          list.appendChild(c);
        });
        box.appendChild(head([`${res.col} (모은 값)`]));
        box.appendChild(list);
      } else if (res.kind === "series") {
        count.textContent = `${res.items.length}묶음`; count.dataset.word = `${res.items.length}묶음`;
        t.appendChild(head([res.col, "줄 수"]));
        const tb = mk("tbody");
        res.items.forEach(([k, n]) => {
          const tr = mk("tr");
          const a = mk("td", k === "NaN" ? "na" : "", String(k)), b = mk("td", "", String(n));
          wordCell(a, cellWord(res.col, k === "NaN" ? null : k), `${table.title} ${res.col}`);
          wordCell(b, { text: `${n}건`, cat: "howmany" }, `${table.title} 묶어서 세기`);
          tr.append(a, b); tb.appendChild(tr);
        });
        t.appendChild(tb);
        box.appendChild(t);
      } else if (res.kind === "stat") {
        count.textContent = `${FN_WORD[res.fn]} 값`; count.dataset.word = "";
        const w = (res.fn === "max" || res.fn === "min") ? cellWord(res.col, res.value) : { text: String(res.value), cat: "howmany" };
        const c = mk("button", "chip pick stat", String(res.value)); c.type = "button";
        c.addEventListener("click", () => take(w, `${table.title} ${res.col}`));
        box.appendChild(head([`${res.col}의 ${FN_WORD[res.fn]} 값`]));
        const list = mk("div", "value-list big"); list.appendChild(c); box.appendChild(list);
      } else {
        count.textContent = "결과 없음"; count.dataset.word = "";
        box.appendChild(mk("p", "hint", res.text));
      }
      box.scrollTop = 0;
    };

    count.addEventListener("click", () => { if (count.dataset.word) take({ text: count.dataset.word, cat: "howmany" }, `${table.title} 수`); });
    clear.addEventListener("click", () => {
      logNow();
      Object.assign(L, { conds: [{ col: null, op: "eq", val: null }], join: "and", col: null, mode: "null", vals: [], fn: "max", focus: 0 });
      render(true);
    });
    render();
    renderBanks();
  }

  function logLens(table, L, res) {
    const snap = JSON.parse(JSON.stringify({ type: L.type, conds: L.conds.filter(condReady), join: L.join, col: L.col, mode: L.mode, vals: L.vals, fn: L.fn }));
    snap.table = table.key;
    const key = lensCode(table, snap);
    if (s.lenses.some((l) => l.key === key)) return;
    snap.key = key;
    snap.result = res.kind === "rows" ? `${res.rows.length}줄` : res.kind === "values" ? `${res.values.length}가지` : res.kind === "series" ? `${res.items.length}묶음` : res.kind === "stat" ? String(res.value) : "";
    s.lenses.push(snap);
  }

  // ---------- 추리 보드 (층 보드 · 큰 미스터리 공용) ----------
  function openBoardModal(bd, st, title, onSolvedClose) {
    const m = openModal({ title, cls: "inv-board" });
    Sfx.open();
    const wrap = mk("div", "board-wrap");
    const head = mk("div", "board-head");
    const battery = mk("span", "battery");
    const legend = mk("div", "cat-legend");
    Object.values(CATS).forEach((c) => { const l = mk("span", "", c.label); l.style.setProperty("--cat", c.color); legend.appendChild(l); });
    head.append(legend, battery);
    wrap.appendChild(head);
    wrap.appendChild(mk("p", "board-tip", "낱말 수첩에서 낱말을 고른 뒤 같은 색 빈칸을 누르세요. 채운 칸을 다시 누르면 비워져요."));
    const sentences = mk("div", "board-sentences");
    const fb = mk("p", "board-fb");
    const actions = mk("div", "check-actions");
    const check = mk("button", "primary", "확인"); check.type = "button";
    actions.appendChild(check);
    const after = mk("span", "after-actions");          // 미스터리: 확인 옆에 "진실을 확인하기"
    actions.appendChild(after);
    wrap.append(sentences, fb, actions, bankDrawer());
    m.body.appendChild(wrap);

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
          if (spec.cat === "verdict") {
            ["설명된다", "설명되지 않는다"].forEach((opt) => {
              const b = mk("button", "vopt" + (st.board[id] === opt ? " on" : ""), opt); b.type = "button";
              b.disabled = st.solved;
              b.addEventListener("click", () => { st.board[id] = opt; st.feedback = ""; render(); });
              p.appendChild(b);
            });
            return;
          }
          const val = st.board[id];
          prevWord = val || null;
          const b = mk("button", "blank-slot" + (val ? " filled" : ""), val || CATS[spec.cat].label); b.type = "button";
          b.style.setProperty("--cat", CATS[spec.cat].color);
          b.disabled = st.solved;
          b.addEventListener("click", () => {
            if (val && (!s.selected || s.selected === val)) { delete st.board[id]; st.feedback = ""; render(); return; }
            if (!s.selected) { toast("먼저 낱말 수첩에서 낱말을 고르세요"); return; }
            const w = wordByText(s.selected);
            if (!w || w.cat !== spec.cat) {
              b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
              toast(`이 칸에는 [${CATS[spec.cat].label}] 낱말이 들어가요`, spec.cat);
              return;
            }
            st.board[id] = s.selected; st.feedback = ""; render();
          });
          p.appendChild(b);
        });
        sentences.appendChild(p);
      });
      battery.innerHTML = "";
      battery.appendChild(mk("span", "battery-label", "무전 확인"));
      for (let i = 0; i < MAX_CHECKS; i++) battery.appendChild(mk("span", "cell" + (i < st.checksLeft ? " full" : "")));
      battery.setAttribute("aria-label", `확인 ${st.checksLeft}번 남음`);
      const all = Object.keys(bd.blanks).every((id) => st.board[id]);
      check.disabled = st.solved || !all || st.checksLeft === 0;
      check.textContent = st.solved ? "모두 맞음 ✓" : st.checksLeft === 0 ? "확인을 다 썼어요" : `확인 (${st.checksLeft}번 남음)`;
      fb.textContent = st.feedback;
      fb.className = "board-fb" + (st.solved ? " ok" : st.feedback ? " ng" : "");
      wrap.classList.toggle("solved", st.solved);
      after.innerHTML = "";
      if (onSolvedClose && (st.solved || st.checksLeft === 0)) {
        const go = mk("button", "primary", st.solved ? "진실을 확인하기 ▶" : "결론 없이 보고서 제출 ▶"); go.type = "button";
        go.addEventListener("click", () => { closeModal(); onSolvedClose(st.solved); });
        after.appendChild(go);
      }
    };

    check.addEventListener("click", () => {
      const wrong = Object.entries(bd.blanks).filter(([id, spec]) => st.board[id] !== spec.answer).length;
      st.checksLeft -= 1; st.checksUsed += 1;
      if (wrong === 0) {
        st.solved = true;
        if (st.firstTry === null) st.firstTry = true;
        st.feedback = onSolvedClose ? "모두 맞음." : "모두 맞음. 이제 판단은 도장으로 하세요.";
        Sfx.correct();
      } else {
        if (st.firstTry === null) st.firstTry = false;
        st.feedback = wrong <= 2 ? "2개 이하 틀림. (어느 칸인지는 알려 주지 않아요)" : "아직 맞지 않다.";
        if (st.checksLeft === 0) st.feedback += onSolvedClose ? " 확인을 다 썼어요." : " 확인을 다 썼어요. 이제 도장으로 판단하세요.";
        Sfx.click();
      }
      updateDesk();
      render();
    });
    render();
    renderBanks();
  }

  function openBoard() {
    if (!s || s.mysteryMode) return;
    const bd = BOARDS[s.floor];
    openBoardModal(bd, s, `추리 보드 · ${bd.title}`, null);
  }

  // ---------- 경비 수칙 ----------
  const rulesFor = (floor) => RULES.filter((r) => r.floor <= floor);

  function renderRules() {
    const box = $("pinned");
    if (!box || !s) return;
    box.innerHTML = "";
    box.appendChild(mk("h4", "", "경비 수칙"));
    const ol = mk("ol");
    rulesFor(s.floor).slice(-3).forEach((r) => ol.appendChild(mk("li", r.floor === s.floor ? "new" : "", r.text)));
    box.appendChild(ol);
    if (s.floor > 3) box.appendChild(mk("p", "rules-more", `(수칙 ${rulesFor(s.floor).length}개 · 눌러서 전체 보기)`));
    box.setAttribute("aria-label", "경비 수칙 판 열기");
  }

  function openRules(notice, onClose) {
    const f = currentFloor();
    const m = openModal({ title: notice ? `관리소 공지 · ${f.floor}층${f.place ? " " + f.place : ""} 근무` : "경비 수칙", cls: "paper", onClose });
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
      ["CCTV 복도를 걸으며 수상한 것(동물, 문, 물건, 화면의 시각)을 눌러 낱말을 모아요.",
       "책을 열어 렌즈를 직접 만들어 표를 걸러 보고, 표의 칸도 눌러 낱말로 모아요.",
       "오른쪽 위 추리 보드의 빈칸을 낱말로 채워 확인해요. (확인은 층마다 3번)",
       "✓ 이상 없음 / ✗ REPORT 도장을 찍어요. 맞았는지는 바로 알려 주지 않아요. 틀린 판단은 나중에 돌아와요."].forEach((t) => how.appendChild(mk("li", "", t)));
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
      choice === "report" ? "✗ REPORT — 기록으로 설명되지 않는다" : "✓ 이상 없음 — 기록으로 설명된다"));
    m.body.appendChild(mk("p", "paper-note", s.solved
      ? "추리 보드: 모두 맞음. 찍은 도장은 되돌릴 수 없어요. 맞았는지는 바로 알려 주지 않아요."
      : "추리 보드를 아직 맞히지 못했어요. 그래도 찍을 수 있지만 위험해요. 찍은 도장은 되돌릴 수 없어요."));
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
    const st = mk("div", "desk-stamp " + choice, choice === "report" ? "REPORT" : "이상 없음");
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
    m.body.appendChild(mk("p", "lesson-intro", "당신이 만든 렌즈 문장은 사실 pandas 코드였어요. 말과 코드를 한 줄씩 짝지어 읽어 보세요."));
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
    m.body.appendChild(mk("p", "lesson-intro", "순찰이 끝났어요. 오늘 밤 출입 기록을 그래프 하나로 그려 보고서에 붙입시다. 빨간 표시는 당신이 ✗ REPORT 도장을 찍은 층의 시각이에요."));
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
        note.appendChild(mk("p", "inv-note", `${REPORT.cards[pick].word}: 출입이 가장 많은 때와 드문 때를 비교해 보세요. 내 ✗ 도장은 어디에 몰려 있나요?`));
        fig.appendChild(chartSvg(REPORT.cards[pick].fill, myX));
      }
      go.disabled = pick === null;
    };
    go.addEventListener("click", () => { closeModal(); startMystery(); });
    night.chart = null;
    render();
  }

  function startMystery() {
    // 미스터리 보드는 밤 동안 모은 모든 낱말 + 보고서 낱말로 푼다
    s = Object.assign(freshBoard(), { floor: "mystery", mysteryMode: true, words: [], selected: null, lenses: [] });
    night.allWords.concat(MYSTERY.extraWords).forEach((w) => { if (!s.words.some((x) => x.text === w.text)) s.words.push({ text: w.text, cat: w.cat }); });
    night.mystery = s;
    renderBanks();
    openBoardModal(MYSTERY, s, MYSTERY.title, (solved) => (solved ? finale() : showSummary("반쪽 진실")));
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
    ["층", "이상현상", "내 도장", "실제", "보드 첫 확인", "쓴 렌즈", "결과"].forEach((h) => trh.appendChild(mk("th", "", h)));
    t.appendChild(trh);
    const lab = (v) => (v === "report" ? "✗ REPORT" : v === "next" ? "✓ 이상 없음" : "-");
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
    // 강좌 안내
    const c = typeof COURSE === "object" && COURSE ? COURSE : {};
    const course = mk("div", "course");
    course.appendChild(mk("h2", "", "오늘 밤 당신이 한 일이 바로 EDA예요"));
    course.appendChild(mk("p", "", `값 모아 보기(unique), 거르기(조건·isin), 빈 칸 찾기(결측치), 묶어서 세기(groupby), 가장 큰 값(통계), 그리고 그래프까지. 렌즈 문장은 모두 진짜 pandas 코드였어요. ${c.name ? `중앙대학교 K-MOOC 「${c.name}」` : "중앙대학교 K-MOOC 강좌"}에서 직접 써 보세요.` + (c.blurb ? " " + c.blurb : "")));
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
    if (!s || s.mysteryMode) return;
    const bb = $("board-btn");
    if (bb) {
      bb.classList.toggle("solved", s.solved);
      $("board-status").textContent = s.solved ? "모두 맞음" : s.checksLeft === 0 ? "확인을 다 썼어요" : `확인 ${s.checksLeft}번 남음`;
    }
    el.btnReport.disabled = !!s.stamp;
    el.btnNext.disabled = !!s.stamp;
    el.btnContinue.classList.toggle("hidden", !s.stamp);
    if (s.stamp) el.btnContinue.textContent = "근무 기록 넘기기 ▶";
  }

  function startFloor(f) {
    if (f.floor === 1 || !night) night = freshNight();
    document.querySelectorAll(".desk-stamp").forEach((x) => x.remove());
    s = freshFloor(f.floor);
    renderRules();
    renderBanks();
    renderWarnings();
    updateDesk();
    runEvents(f.floor, () => { if (!night.fired) openRules(true); });
  }

  return { startFloor, onSceneTag, onClock, openBook, openBoard, openRules: () => openRules(false), stamp, finishFloor, get state() { return s; }, get night() { return night; } };
})();
