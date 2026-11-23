// ============================================================
// advanced.js — 고급 모드: 책 창에서 pandas 코드를 직접 써서 실행한다 (PyLite)
// 진짜 파이썬이 아니라, 이 게임에서 배우는 pandas 문법을 브라우저에서 바로 계산하는 작은 해석기다.
// (인터넷 · 설치 불필요, 즉시 실행)
//
// 쓸 수 있는 것
//   표: df_entry, df_delivery          이름 붙이기: a = df_entry[...]      출력: print(x), len(x)
//   거르기: df[ df['열'] == 값 ]  (== != > >= < <=)   (조건1) & (조건2)   (조건1) | (조건2)   ~조건
//   열 고르기: df['열'], df[['열1', '열2']], df.열
//   열(Series): .isnull() .notnull() .isna() .notna() .isin([..]) .unique() .nunique() .value_counts()
//               .max() .min() .sum() .mean() .median() .count() .head(n) .tail(n) .sort_values() .tolist() .dropna()
//               .str.contains('..') .str.startswith('..') .str.endswith('..')
//   표(DataFrame): .head(n) .tail(n) .shape .columns .sort_values('열', ascending=False) .isnull() .notnull()
//                  .sum() .count() .nunique() .dropna() .groupby('열')
//   묶기: df.groupby('열').size()   df.groupby('열')['열2'].max() / .min() / .sum() / .mean() / .count() / .nunique()
// ============================================================

const PyLite = (() => {
  class PyErr extends Error {}
  const fail = (msg) => { throw new PyErr(msg); };
  const isNull = (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));

  // ---------- 값의 종류 ----------
  const DF = (cols, rows) => ({ __t: "df", cols, rows });
  const SR = (vals, idx, name, indexName) => ({ __t: "series", vals, idx, name: name || "", indexName: indexName || "" });
  const kindOf = (v) => (v === null || v === undefined ? "none" : Array.isArray(v) ? "list" : v.__t || typeof v);
  const TYPE_NAME = { df: "표(DataFrame)", series: "열(Series)", groupby: "묶음(groupby)", gbcol: "묶음의 열", str: ".str", list: "목록", string: "글자", number: "숫자", boolean: "참/거짓", none: "None", method: "메서드", tuple: "튜플" };
  const tname = (v) => TYPE_NAME[kindOf(v)] || kindOf(v);

  function fromTable(t) {
    return DF(t.columns.slice(), t.rows.map((r, i) => { const o = { __i: i }; t.columns.forEach((c) => { o[c] = r[c]; }); return o; }));
  }

  // ---------- 글자를 낱말(토큰)로 ----------
  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (ch === "'" || ch === '"') {
        let j = i + 1, str = "";
        while (j < src.length && src[j] !== ch) {
          if (src[j] === "\\" && j + 1 < src.length) { str += src[j + 1]; j += 2; continue; }
          if (src[j] === "\n") break;
          str += src[j]; j++;
        }
        if (src[j] !== ch) fail("따옴표가 닫히지 않았어요. 글자는 '햄스터' 처럼 따옴표로 감싸요.");
        toks.push({ t: "str", v: str }); i = j + 1; continue;
      }
      const rest = src.slice(i);
      let m;
      if ((m = rest.match(/^\d+(\.\d+)?/))) { toks.push({ t: "num", v: Number(m[0]) }); i += m[0].length; continue; }
      if ((m = rest.match(/^[A-Za-z_가-힣][\w가-힣]*/))) { toks.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
      if ((m = rest.match(/^(==|!=|>=|<=|[<>&|~()\[\].,=:+\-*/])/))) { toks.push({ t: "op", v: m[0] }); i += m[0].length; continue; }
      fail(`이 글자는 쓸 수 없어요: ${ch}`);
    }
    toks.push({ t: "eof" });
    return toks;
  }

  // ---------- 비교 · 논리 ----------
  function cmpScalar(x, op, y) {
    if (isNull(x) || isNull(y)) return op === "!=";                // NaN 은 어떤 값과도 같지 않다
    if (typeof x === "boolean" || typeof y === "boolean") { x = Number(x); y = Number(y); }
    if (op === "==") return x === y;
    if (op === "!=") return x !== y;
    if (typeof x !== typeof y) fail(`숫자와 글자는 크기를 비교할 수 없어요 (TypeError). 숫자 열이면 따옴표 없이 23 처럼, 글자 열이면 '23:10' 처럼 써요.`);
    return { ">": x > y, ">=": x >= y, "<": x < y, "<=": x <= y }[op];
  }
  function compare(a, op, b) {
    const A = kindOf(a), B = kindOf(b);
    if (A === "df" || B === "df") fail("표 전체를 비교할 수는 없어요. df['열'] == 값 처럼 열 하나를 골라 비교해요.");
    if (A === "series" && B === "series") {
      if (a.vals.length !== b.vals.length) fail("길이가 다른 두 열은 비교할 수 없어요.");
      return SR(a.vals.map((x, i) => cmpScalar(x, op, b.vals[i])), a.idx, "", a.indexName);
    }
    if (A === "series") return SR(a.vals.map((x) => cmpScalar(x, op, b)), a.idx, a.name, a.indexName);
    if (B === "series") return SR(b.vals.map((y) => cmpScalar(a, op, y)), b.idx, b.name, b.indexName);
    if (A === "list" || B === "list") fail("목록과는 == 로 비교할 수 없어요. 목록 중 하나인지 보려면 .isin([..]) 을 써요.");
    return cmpScalar(a, op, b);
  }
  const isBoolSeries = (v) => kindOf(v) === "series" && v.vals.every((x) => typeof x === "boolean");
  function logic(a, b, op) {
    const hint = "& 와 | 는 조건(참/거짓 열)끼리 이어요. 조건마다 괄호로 묶어 주세요. 예) (df_entry['운동'] == 'Y') & (df_entry['소리'] >= 5)";
    if (typeof a === "boolean" && typeof b === "boolean") return op === "&" ? a && b : a || b;
    if (!isBoolSeries(a) || !isBoolSeries(b)) fail(hint);
    if (a.vals.length !== b.vals.length) fail("길이가 다른 두 조건은 이을 수 없어요. 같은 표의 조건끼리 이어요.");
    return SR(a.vals.map((x, i) => (op === "&" ? x && b.vals[i] : x || b.vals[i])), a.idx, "", a.indexName);
  }
  function invert(a) {
    if (typeof a === "boolean") return !a;
    if (!isBoolSeries(a)) fail("~ 는 조건(참/거짓 열) 앞에 붙여요. 예) ~df_entry['호수'].isnull()");
    return SR(a.vals.map((x) => !x), a.idx, a.name, a.indexName);
  }

  // ---------- 통계 ----------
  function agg(vals, fn) {
    const nn = vals.filter((v) => !isNull(v));
    if (fn === "count") return nn.length;
    if (fn === "nunique") return new Set(nn).size;
    if (fn === "size") return vals.length;
    if (!nn.length) return null;
    const allNum = nn.every((v) => typeof v === "number");
    if (fn === "max" || fn === "min") {
      return nn.reduce((a, b) => {
        const gt = allNum ? b > a : String(b) > String(a);
        return fn === "max" ? (gt ? b : a) : (gt || b === a ? a : b);
      });
    }
    if (!allNum && !nn.every((v) => typeof v === "boolean")) fail(`.${fn}() 는 숫자 열에서만 쓸 수 있어요. (출입시 · 소리 · 나이)`);
    const nums = nn.map(Number);
    if (fn === "sum") return nums.reduce((a, b) => a + b, 0);
    if (fn === "mean") return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (fn === "median") { const s = nums.slice().sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
    fail(`.${fn}() 는 아직 못 써요.`);
  }
  const sortKey = (a, b) => (isNull(a) ? 1 : isNull(b) ? -1 : typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ko", { numeric: true }));

  // ---------- 값 꺼내기 (대괄호 · 점) ----------
  function column(df, c) {
    if (!df.cols.includes(c)) fail(`KeyError: '${c}' — 이 표에 없는 열이에요. 열 이름: ${df.cols.join(", ")}`);
    return SR(df.rows.map((r) => r[c]), df.rows.map((r) => r.__i), c, "");
  }

  function getitem(obj, key) {
    const K = kindOf(obj), k = kindOf(key);
    if (K === "df") {
      if (k === "string") return column(obj, key);
      if (k === "list") { key.forEach((c) => column(obj, c)); return DF(key.slice(), obj.rows); }
      if (k === "series") {
        if (!isBoolSeries(key)) fail("대괄호 안에는 조건(참/거짓 열)을 넣어요. 예) df_entry[ df_entry['동물종류'] == '햄스터' ]");
        if (key.vals.length !== obj.rows.length) fail("다른 표의 조건으로는 거를 수 없어요. 같은 표의 열로 조건을 만들어요.");
        return DF(obj.cols, obj.rows.filter((_, i) => key.vals[i]));
      }
      if (k === "boolean") return key ? obj : DF(obj.cols, []);
      fail(`표[ ] 안에는 열 이름('열') 이나 조건을 넣어요. 지금 넣은 것: ${tname(key)}`);
    }
    if (K === "series") {
      if (k === "series") {
        if (!isBoolSeries(key) || key.vals.length !== obj.vals.length) fail("열[ ] 안에는 같은 길이의 조건을 넣어요.");
        const keep = obj.vals.map((_, i) => key.vals[i]);
        return SR(obj.vals.filter((_, i) => keep[i]), obj.idx.filter((_, i) => keep[i]), obj.name, obj.indexName);
      }
      const i = obj.idx.findIndex((x) => x === key || String(x) === String(key));
      if (i < 0) fail(`KeyError: ${repr(key)} — 이 열에 없는 이름표예요.`);
      return obj.vals[i];
    }
    if (K === "groupby") {
      if (k !== "string") fail("묶음['열'] 처럼 열 이름을 넣어요.");
      column(obj.df, key);
      return { __t: "gbcol", df: obj.df, by: obj.by, col: key };
    }
    if (K === "list") {
      if (k !== "number") fail("목록[ ] 안에는 숫자 위치를 넣어요.");
      const i = key < 0 ? obj.length + key : key;
      if (i < 0 || i >= obj.length) fail("IndexError: 목록 범위를 벗어났어요.");
      return obj[i];
    }
    if (K === "tuple") return getitem(obj.items, key);
    fail(`${tname(obj)} 에는 [ ] 를 쓸 수 없어요.`);
  }

  const method = (obj, name) => ({ __t: "method", obj, name });
  function getattr(obj, name) {
    const K = kindOf(obj);
    if (K === "df") {
      if (name === "shape") return { __t: "tuple", items: [obj.rows.length, obj.cols.length] };
      if (name === "columns") return obj.cols.slice();
      if (obj.cols.includes(name)) return column(obj, name);
      return method(obj, name);
    }
    if (K === "series") {
      if (name === "str") return { __t: "str", s: obj };
      if (name === "name") return obj.name;
      if (name === "shape") return { __t: "tuple", items: [obj.vals.length] };
      if (name === "values") return obj.vals.slice();
      return method(obj, name);
    }
    if (K === "str" || K === "groupby" || K === "gbcol") return method(obj, name);
    if (K === "method") fail(`.${obj.name} 뒤에 () 를 붙여 먼저 실행해요. 예) .${obj.name}().${name}`);
    fail(`${tname(obj)} 에는 .${name} 이 없어요.`);
  }

  // ---------- 함수 · 메서드 실행 ----------
  const arg = (args, kw, i, name, dflt) => (kw[name] !== undefined ? kw[name] : args[i] !== undefined ? args[i] : dflt);

  function dfMethod(df, name, args, kw) {
    switch (name) {
      case "head": case "tail": {
        const n = arg(args, kw, 0, "n", 5);
        return DF(df.cols, name === "head" ? df.rows.slice(0, n) : df.rows.slice(Math.max(0, df.rows.length - n)));
      }
      case "sort_values": {
        const by = arg(args, kw, 0, "by"), asc = arg(args, kw, 1, "ascending", true);
        if (typeof by !== "string") fail("sort_values('열') 처럼 열 이름을 넣어요.");
        column(df, by);
        const rows = df.rows.slice().sort((a, b) => { const c = sortKey(a[by], b[by]); return isNull(a[by]) || isNull(b[by]) ? c : asc ? c : -c; });
        return DF(df.cols, rows);
      }
      case "groupby": {
        const by = arg(args, kw, 0, "by");
        if (typeof by !== "string") fail("groupby('열') 처럼 열 이름 하나를 넣어요.");
        column(df, by);
        return { __t: "groupby", df, by };
      }
      case "isnull": case "isna": case "notnull": case "notna": {
        const want = name === "isnull" || name === "isna";
        return DF(df.cols, df.rows.map((r) => { const o = { __i: r.__i }; df.cols.forEach((c) => { o[c] = isNull(r[c]) === want; }); return o; }));
      }
      case "sum": case "count": case "nunique": case "max": case "min": case "mean": {
        const cols = df.cols.filter((c) => {
          if (name === "count" || name === "nunique" || name === "max" || name === "min") return true;
          return df.rows.every((r) => isNull(r[c]) || typeof r[c] === "number" || typeof r[c] === "boolean");
        });
        return SR(cols.map((c) => agg(df.rows.map((r) => r[c]), name)), cols, "", "");
      }
      case "dropna": return DF(df.cols, df.rows.filter((r) => df.cols.every((c) => !isNull(r[c]))));
      case "copy": return DF(df.cols.slice(), df.rows.slice());
    }
    fail(`표.${name}() 는 고급 모드에서 아직 못 써요. 쓸 수 있는 것: head, tail, sort_values, groupby, isnull, notnull, sum, count, nunique, dropna`);
  }

  function srMethod(s, name, args, kw) {
    switch (name) {
      case "isnull": case "isna": return SR(s.vals.map((v) => isNull(v)), s.idx, s.name, s.indexName);
      case "notnull": case "notna": return SR(s.vals.map((v) => !isNull(v)), s.idx, s.name, s.indexName);
      case "isin": {
        const list = arg(args, kw, 0, "values");
        if (kindOf(list) !== "list") fail(".isin([값1, 값2]) 처럼 대괄호 목록을 넣어요.");
        return SR(s.vals.map((v) => !isNull(v) && list.some((x) => x === v)), s.idx, s.name, s.indexName);
      }
      case "unique": { const out = []; s.vals.forEach((v) => { if (!out.some((x) => x === v || (isNull(x) && isNull(v)))) out.push(v); }); return out; }
      case "value_counts": {
        const m = new Map();
        s.vals.forEach((v) => { if (!isNull(v)) m.set(v, (m.get(v) || 0) + 1); });
        const items = [...m.entries()].sort((a, b) => b[1] - a[1] || sortKey(a[0], b[0]));
        return SR(items.map((x) => x[1]), items.map((x) => x[0]), "count", s.name);
      }
      case "max": case "min": case "sum": case "mean": case "median": case "count": case "nunique": return agg(s.vals, name);
      case "head": case "tail": {
        const n = arg(args, kw, 0, "n", 5), from = name === "head" ? 0 : Math.max(0, s.vals.length - n), to = name === "head" ? n : s.vals.length;
        return SR(s.vals.slice(from, to), s.idx.slice(from, to), s.name, s.indexName);
      }
      case "sort_values": {
        const asc = arg(args, kw, 0, "ascending", true);
        const order = s.vals.map((v, i) => i).sort((a, b) => { const c = sortKey(s.vals[a], s.vals[b]); return isNull(s.vals[a]) || isNull(s.vals[b]) ? c : asc ? c : -c; });
        return SR(order.map((i) => s.vals[i]), order.map((i) => s.idx[i]), s.name, s.indexName);
      }
      case "dropna": { const keep = s.vals.map((v) => !isNull(v)); return SR(s.vals.filter((_, i) => keep[i]), s.idx.filter((_, i) => keep[i]), s.name, s.indexName); }
      case "tolist": return s.vals.slice();
    }
    fail(`열.${name}() 는 고급 모드에서 아직 못 써요. 쓸 수 있는 것: isnull, notnull, isin, unique, nunique, value_counts, max, min, sum, mean, median, count, head, tail, sort_values, dropna, tolist, str.contains`);
  }

  function strMethod(acc, name, args) {
    const s = acc.s, p = args[0];
    if (typeof p !== "string") fail(`.str.${name}('글자') 처럼 따옴표 글자를 넣어요.`);
    const f = { contains: (v) => v.includes(p), startswith: (v) => v.startsWith(p), endswith: (v) => v.endsWith(p) }[name];
    if (!f) fail(`.str.${name}() 는 아직 못 써요. 쓸 수 있는 것: contains, startswith, endswith`);
    return SR(s.vals.map((v) => !isNull(v) && f(String(v))), s.idx, s.name, s.indexName);
  }

  function groups(df, by) {
    const m = new Map();
    df.rows.forEach((r) => { const k = r[by]; if (isNull(k)) return; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });   // pandas 처럼 빈 값 묶음은 뺀다
    return [...m.entries()].sort((a, b) => sortKey(a[0], b[0]));
  }
  function gbMethod(g, name) {
    if (name === "size") { const gs = groups(g.df, g.by); return SR(gs.map((x) => x[1].length), gs.map((x) => x[0]), "", g.by); }
    if (name === "count") return dfMethod(g.df, "count", [], {});
    fail(`묶음.${name}() 는 아직 못 써요. .size() 또는 ['열'].max() 처럼 열을 골라 써요.`);
  }
  function gbcolMethod(g, name) {
    if (!["max", "min", "sum", "mean", "median", "count", "nunique", "size"].includes(name)) fail(`묶음['열'].${name}() 는 아직 못 써요. 쓸 수 있는 것: max, min, sum, mean, median, count, nunique, size`);
    const gs = groups(g.df, g.by);
    return SR(gs.map(([, rows]) => agg(rows.map((r) => r[g.col]), name)), gs.map((x) => x[0]), g.col, g.by);
  }

  function call(fn, args, kw, printed) {
    const K = kindOf(fn);
    if (K === "func") {
      if (fn.name === "len") {
        const v = args[0], k = kindOf(v);
        if (k === "df") return v.rows.length;
        if (k === "series") return v.vals.length;
        if (k === "list") return v.length;
        if (k === "string") return v.length;
        fail(`len() 안에는 표, 열, 목록을 넣어요. 지금 넣은 것: ${tname(v)}`);
      }
      if (fn.name === "print") { args.forEach((a) => printed.push(a)); return null; }
      if (fn.name === "list") { const v = args[0]; return kindOf(v) === "series" ? v.vals.slice() : kindOf(v) === "list" ? v.slice() : fail("list() 안에는 열이나 목록을 넣어요."); }
      if (fn.name === "round") { const v = args[0], n = args[1] || 0; return typeof v === "number" ? Math.round(v * 10 ** n) / 10 ** n : fail("round() 안에는 숫자를 넣어요."); }
    }
    if (K !== "method") fail(`${tname(fn)} 은(는) 실행할 수 없어요. 괄호 () 를 지워 보세요.`);
    const o = fn.obj, k = kindOf(o);
    if (k === "df") return dfMethod(o, fn.name, args, kw);
    if (k === "series") return srMethod(o, fn.name, args, kw);
    if (k === "str") return strMethod(o, fn.name, args);
    if (k === "groupby") return gbMethod(o, fn.name);
    if (k === "gbcol") return gbcolMethod(o, fn.name);
    fail(`${tname(o)} 의 .${fn.name}() 는 쓸 수 없어요.`);
  }

  // ---------- 읽으면서 계산하기 ----------
  const FUNCS = ["len", "print", "list", "round"];
  function evaluate(src, env, printed) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (v) => peek().t === "op" && peek().v === v;
    const expect = (v) => { if (!isOp(v)) fail(`'${v}' 가 와야 해요. 괄호나 따옴표 짝을 확인해 보세요.`); next(); };

    function expr() {
      let a = bitor();
      while (peek().t === "op" && ["==", "!=", ">", ">=", "<", "<="].includes(peek().v)) { const op = next().v; a = compare(a, op, bitor()); }
      if (peek().t === "id" && (peek().v === "and" || peek().v === "or")) fail(`pandas 조건에서는 ${peek().v} 대신 ${peek().v === "and" ? "&" : "|"} 를 써요. 조건마다 괄호로 묶어 주세요.`);
      return a;
    }
    function bitor() { let a = bitand(); while (isOp("|")) { next(); a = logic(a, bitand(), "|"); } return a; }
    function bitand() { let a = unary(); while (isOp("&")) { next(); a = logic(a, unary(), "&"); } return a; }
    function unary() {
      if (isOp("~")) { next(); return invert(unary()); }
      if (isOp("-")) { next(); const v = unary(); return typeof v === "number" ? -v : fail("- 는 숫자 앞에만 붙여요."); }
      if (peek().t === "id" && peek().v === "not") fail("pandas 조건을 뒤집을 때는 not 대신 ~ 를 써요. 예) ~df_entry['호수'].isnull()");
      return postfix();
    }
    function postfix() {
      let v = atom();
      for (;;) {
        if (isOp("[")) { next(); const k = expr(); expect("]"); v = getitem(v, k); }
        else if (isOp(".")) { next(); const id = next(); if (id.t !== "id") fail("점(.) 뒤에는 이름이 와야 해요."); v = getattr(v, id.v); }
        else if (isOp("(")) {
          next();
          const args = [], kw = {};
          while (!isOp(")")) {
            if (peek().t === "id" && toks[p + 1].t === "op" && toks[p + 1].v === "=") { const name = next().v; next(); kw[name] = expr(); }
            else args.push(expr());
            if (isOp(",")) next(); else break;
          }
          expect(")");
          v = call(v, args, kw, printed);
        } else break;
      }
      return v;
    }
    function atom() {
      const t = next();
      if (t.t === "num") return t.v;
      if (t.t === "str") { let v = t.v; while (peek().t === "str") v += next().v; return v; }
      if (t.t === "id") {
        if (t.v === "True") return true;
        if (t.v === "False") return false;
        if (t.v === "None") return null;
        if (FUNCS.includes(t.v)) return { __t: "func", name: t.v };
        if (Object.prototype.hasOwnProperty.call(env, t.v)) return env[t.v];
        if (t.v === "pd" || t.v === "sns" || t.v === "np") fail(`${t.v}. 함수는 고급 모드에서 아직 못 써요. df_entry / df_delivery 로 시작해 보세요.`);
        fail(`NameError: '${t.v}' 라는 이름을 몰라요. 쓸 수 있는 표: df_entry, df_delivery` + (Object.keys(env).length > 2 ? ` · 내가 만든 이름: ${Object.keys(env).filter((k) => !k.startsWith("df_")).join(", ")}` : ""));
      }
      if (t.t === "op" && t.v === "(") { const v = expr(); expect(")"); return v; }
      if (t.t === "op" && t.v === "[") {
        const list = [];
        while (!isOp("]")) { list.push(expr()); if (isOp(",")) next(); else break; }
        expect("]");
        return list;
      }
      if (t.t === "eof") fail("코드가 중간에 끝났어요. 괄호나 따옴표가 닫혔는지 확인해 보세요.");
      fail(`여기에 '${t.v}' 가 올 수 없어요.`);
    }

    const v = expr();
    if (peek().t !== "eof") fail(`'${peek().v ?? ""}' 부분을 이해하지 못했어요. 괄호 짝이나 쉼표를 확인해 보세요.`);
    return v;
  }

  // 여러 줄 → 문장들 (괄호가 열려 있으면 다음 줄과 잇는다)
  function statements(code) {
    const out = [];
    let cur = "", depth = 0;
    code.split("\n").forEach((line) => {
      const clean = line.replace(/#.*$/, "");
      cur += (cur ? "\n" : "") + line;
      for (const ch of clean.replace(/'[^']*'|"[^"]*"/g, "")) { if ("([".includes(ch)) depth++; if (")]".includes(ch)) depth--; }
      if (depth <= 0) { if (cur.trim()) out.push(cur); cur = ""; depth = 0; }
    });
    if (cur.trim()) out.push(cur);
    return out;
  }

  function run(code, tables) {
    const env = {};
    Object.entries(tables).forEach(([name, t]) => { env[name] = fromTable(t); });
    const printed = [];
    let value;
    try {
      for (const st of statements(code || "")) {
        const s = st.trim();
        if (!s || s.startsWith("#")) continue;
        if (/^(import|from)\s/.test(s)) continue;                        // import pandas as pd 같은 줄은 그냥 넘어간다
        const asg = s.match(/^([A-Za-z_가-힣][\w가-힣]*)\s*=(?!=)([\s\S]*)$/);
        if (asg) {
          if (["df_entry", "df_delivery"].includes(asg[1])) fail(`${asg[1]} 은 원본 표라서 바꿀 수 없어요. 다른 이름을 붙여 주세요. 예) a = ...`);
          env[asg[1]] = evaluate(asg[2], env, printed);
          value = undefined;
        } else {
          value = evaluate(s, env, printed);
          if (value === null && /^print\s*\(/.test(s)) value = undefined;
        }
      }
      return { value, printed, error: null };
    } catch (e) {
      return { value: undefined, printed, error: e instanceof PyErr ? e.message : "알 수 없는 오류예요: " + e.message };
    }
  }

  // 화면에 글자로 보여 줄 때
  function repr(v) {
    const k = kindOf(v);
    if (k === "none") return "None";
    if (k === "boolean") return v ? "True" : "False";
    if (k === "number") return Number.isNaN(v) ? "NaN" : Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
    if (k === "string") return `'${v}'`;
    if (k === "list") return "[" + v.map(repr).join(", ") + "]";
    if (k === "tuple") return "(" + v.items.map(repr).join(", ") + (v.items.length === 1 ? "," : "") + ")";
    if (k === "method") return `<.${v.name} — 끝에 () 를 붙이면 실행돼요>`;
    if (k === "func") return `<${v.name}() 함수>`;
    if (k === "groupby") return `<'${v.by}' 로 묶었어요 — 이어서 .size() 나 ['열'].max() 처럼 써요>`;
    if (k === "gbcol") return `<'${v.by}' 로 묶은 '${v.col}' — 이어서 .max() .min() .mean() .count() 처럼 써요>`;
    if (k === "str") return "<.str — 이어서 .contains('..') .startswith('..') .endswith('..') 를 써요>";
    return String(v);
  }

  return { run, repr, kindOf };
})();
