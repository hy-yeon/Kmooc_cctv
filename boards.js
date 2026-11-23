// ============================================================
// boards.js — ver8 조사 데이터 (콘텐츠 담당이 고치는 파일)
// 설계: design/flow-investigator.md
//   CATS        : 낱말 범주(색). 추리 보드 빈칸도 같은 범주만 받는다
//   RULES       : 경비 수칙. floor 층에서 새로 붙는다 (Papers, Please 처럼 늘어남)
//   LENS_TYPES  : 렌즈 틀. unlock 층부터 쓸 수 있다
//   FLOOR_TOOL  : 층마다 새로 배우는 도구 (공지와 코드 풀이에 쓴다)
//   SCENE_WORDS : CCTV 장면에서 누르면 얻는 낱말. 키 = scenes.js 의 이름표(tag), clock = 화면 시각
//   BOARDS      : 층별 추리 보드. 문장 안의 {id} 가 빈칸, blanks[id] = { cat, answer }
//                 cat "verdict" 는 [설명된다 / 설명되지 않는다] 중 고르는 칸
//                 빈칸 뒤 (이)가 (을)를 (은)는 (과)와 (으)로 는 넣은 낱말의 받침에 맞게 바뀐다
//   EVENTS      : 오판의 결과 (두 층 뒤에 무전·인터폰으로 돌아온다 → 경고장)
//   MYSTERY     : 마지막 큰 미스터리 보드
// ============================================================

const CATS = {
  who:     { label: "누구", color: "#e0a85a" },
  where:   { label: "어디", color: "#5aa9e0" },
  when:    { label: "언제", color: "#b48ae0" },
  what:    { label: "무엇", color: "#7fd18b" },
  howmany: { label: "얼마", color: "#e07a7a" },
  state:   { label: "상태", color: "#c9c9c9" },
};

const RULES = [
  { floor: 1, text: "수칙 1. 영상 속 주민은 기록과 맞아야 한다. 기록으로 설명되지 않으면 REPORT." },
  { floor: 2, text: "수칙 2. 같은 시각에 같은 일이 여러 날 되풀이되면 습관으로 본다." },
  { floor: 3, text: "수칙 3. 영상 속 이상한 모양은 배달된 물건 때문일 수 있다." },
  { floor: 4, text: "수칙 4. 주민 정보가 빈 출입은 등록되지 않은 자의 출입이다." },
  { floor: 5, text: "수칙 5. 빛감지 On은 빛을 내거나 가린 무언가가 지나갔다는 뜻이다." },
  { floor: 6, text: "수칙 6. 층마다 방은 3개(6층은 601~603호)뿐이다." },
  { floor: 7, text: "수칙 7. 출입 기록이 있으면 영상에 누군가 보여야 한다." },
  { floor: 8, text: "수칙 8. 새로 이사 온 주민은 아직 낯설 수 있다. 입주 날짜를 확인하라." },
];

// 렌즈 틀 (화면에는 말로만 보인다. 코드는 층이 끝난 뒤 풀이 창에서)
const LENS_TYPES = [
  { id: "cmp",    unlock: 1, tab: "같은/다른 줄 보기" },
  { id: "unique", unlock: 3, tab: "어떤 값들이 있나" },
  { id: "null",   unlock: 4, tab: "빈 칸 찾기" },
  { id: "isin",   unlock: 5, tab: "목록 중 하나" },
  { id: "group",  unlock: 6, tab: "묶어서 세기" },
  { id: "stat",   unlock: 8, tab: "가장 큰/작은 값" },
];

const FLOOR_TOOL = {
  1: { name: "같은/다른 줄만 보기", sentence: "[표]에서 [열]이 [값]과 [같은/다른] 줄만 보기", concept: "조건 필터 (==, !=)" },
  2: { name: "조건 두 개 잇기 (이고)", sentence: "… 줄 중에서 [이고] [열]이 [값]과 같은 줄만 보기", concept: "이중 조건 (&)" },
  3: { name: "어떤 값들이 있나 모아 보기", sentence: "[표]의 [열]에 어떤 값들이 있는지 모아 보기", concept: "unique" },
  4: { name: "빈 칸 찾기", sentence: "[표]에서 [열]이 [비어 있는/채워진] 줄만 보기", concept: "결측치 (isnull, notnull)" },
  5: { name: "목록 중 하나인 줄 보기", sentence: "[표]에서 [열]이 [값, 값, 값] 중 하나인 줄만 보기", concept: "isin" },
  6: { name: "묶어서 세기", sentence: "[표]를 [열]별로 묶어서 세기", concept: "groupby + size" },
  7: { name: "이거나 · 크거나 같은/작거나 같은", sentence: "[열]이 [값]보다 크거나 같은 [이거나] [열]이 [값]보다 작거나 같은 줄", concept: "이중 조건 (|), 크기 비교 (>=, <=)" },
  8: { name: "가장 큰/작은 값 찾기", sentence: "[표]의 [열]에서 [가장 큰/가장 작은/평균/합] 값 찾기", concept: "통계 (max, min, mean, sum)" },
};

// 장면 낱말. door-0/1/2 는 그 층 01·02·03호 문 (호수는 게임이 층 번호로 만든다)
const SCENE_WORDS = {
  1: { hamster: [{ text: "햄스터", cat: "who" }, { text: "6마리 이상", cat: "howmany" }], seeds: [{ text: "해바라기씨", cat: "what" }], clock: [{ text: "23:10", cat: "when" }] },
  2: { gecko: [{ text: "게코도마뱀", cat: "who" }, { text: "뒤로 걸음", cat: "state" }], clock: [{ text: "22:00", cat: "when" }] },
  3: { cat: [{ text: "고양이", cat: "who" }, { text: "정육면체", cat: "what" }], clock: [{ text: "20:20", cat: "when" }] },
  4: { bear: [{ text: "곰", cat: "who" }], honey: [{ text: "꿀", cat: "what" }], clock: [{ text: "00:40", cat: "when" }] },
  5: { hedgehog: [{ text: "고슴도치", cat: "who" }, { text: "초록빛", cat: "state" }], clock: [{ text: "21:00", cat: "when" }] },
  6: { koala: [{ text: "코알라", cat: "who" }], tinydoor: [{ text: "작은 문", cat: "what" }], clock: [{ text: "03:00", cat: "when" }] },
  7: { "empty-end": [{ text: "아무도 없음", cat: "state" }], clock: [{ text: "01:30", cat: "when" }] },
  8: { deer: [{ text: "사슴", cat: "who" }], boxes: [{ text: "상자 더미", cat: "what" }], clock: [{ text: "18:14", cat: "when" }] },
};

const BOARDS = {
  1: {
    title: "1층 · 늘어나는 햄스터",
    sentences: [
      { tag: "영상", text: "{t}에 {r} 앞 복도에서 {w}(이)가 {n} 보였다." },
      { tag: "가설", text: "모두 주민이라면, 출입표의 햄스터 줄은 {n2} 있어야 한다." },
      { tag: "증거", text: "출입표에서 햄스터인 줄은 {c}뿐이고, 마지막 출입은 {t2}이다." },
      { tag: "결론", text: "그러므로 늘어난 햄스터는 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "23:10" }, r: { cat: "where", answer: "101호" }, w: { cat: "who", answer: "햄스터" },
      n: { cat: "howmany", answer: "6마리 이상" }, n2: { cat: "howmany", answer: "6마리 이상" },
      c: { cat: "howmany", answer: "2줄" }, t2: { cat: "when", answer: "23:12" }, v: { cat: "verdict", answer: "설명되지 않는다" },
    },
    canonical: [{ type: "cmp", table: "entry", conds: [{ col: "동물종류", op: "eq", val: "햄스터" }], join: "and" }],
  },
  2: {
    title: "2층 · 뒤로 걷는 게코도마뱀",
    sentences: [
      { tag: "영상", text: "{t}에 {r} 앞에서 {w}(이)가 {s}." },
      { tag: "가설", text: "매일 하는 운동 습관이라면, 같은 시각의 출입이 여러 날 {n} 있어야 한다." },
      { tag: "증거", text: "게코도마뱀의 출입은 모두 {h}쯤이고, 운동 칸은 {y}이다." },
      { tag: "결론", text: "그러므로 뒤로 걷는 게코도마뱀은 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "22:00" }, r: { cat: "where", answer: "202호" }, w: { cat: "who", answer: "게코도마뱀" },
      s: { cat: "state", answer: "뒤로 걸음" }, n: { cat: "howmany", answer: "5줄" }, h: { cat: "when", answer: "22시" },
      y: { cat: "state", answer: "Y" }, v: { cat: "verdict", answer: "설명된다" },
    },
    canonical: [{ type: "cmp", table: "entry", conds: [{ col: "동물종류", op: "eq", val: "게코도마뱀" }, { col: "운동", op: "eq", val: "Y" }], join: "and" }],
  },
  3: {
    title: "3층 · 네모가 된 고양이",
    sentences: [
      { tag: "영상", text: "{t}에 {r} 앞에서 {w}(이)가 {o} 모양으로 보였다." },
      { tag: "가설", text: "모양을 바꾼 물건이 있다면, 배달표에 {r2}(으)로 온 {x}(이)가 있어야 한다." },
      { tag: "증거", text: "그 물건은 {d}에 도착했고, 고양이는 {t2}에 들어왔다." },
      { tag: "결론", text: "그러므로 상자 안의 고양이는 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "20:20" }, r: { cat: "where", answer: "302호" }, w: { cat: "who", answer: "고양이" },
      o: { cat: "what", answer: "정육면체" }, r2: { cat: "where", answer: "302호" }, x: { cat: "what", answer: "정육면체 유리 상자 (택배)" },
      d: { cat: "when", answer: "20:05" }, t2: { cat: "when", answer: "20:20" }, v: { cat: "verdict", answer: "설명된다" },
    },
    canonical: [{ type: "unique", table: "delivery", col: "배달제품" }, { type: "cmp", table: "delivery", conds: [{ col: "배달제품", op: "eq", val: "정육면체 유리 상자 (택배)" }], join: "and" }],
  },
  4: {
    title: "4층 · 꿀 먹는 곰",
    sentences: [
      { tag: "영상", text: "{t}에 4층 복도에서 {w}(이)가 {x}(을)를 먹고 있었다." },
      { tag: "가설", text: "곰이 주민이라면, 출입표에 동물종류가 {w2}인 줄이 있어야 한다." },
      { tag: "증거", text: "동물종류가 곰인 줄은 {c}이고, 주민 정보가 {e} 출입이 {t2}에 있었다. 그때 소리는 {s}였다." },
      { tag: "결론", text: "그러므로 곰은 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "00:40" }, w: { cat: "who", answer: "곰" }, x: { cat: "what", answer: "꿀" },
      w2: { cat: "who", answer: "곰" }, c: { cat: "howmany", answer: "0줄" }, e: { cat: "state", answer: "비어 있음" },
      t2: { cat: "when", answer: "00:40" }, s: { cat: "howmany", answer: "소리 9" }, v: { cat: "verdict", answer: "설명되지 않는다" },
    },
    canonical: [{ type: "cmp", table: "entry", conds: [{ col: "동물종류", op: "eq", val: "곰" }], join: "and" }, { type: "null", table: "entry", col: "동물종류", mode: "null" }],
  },
  5: {
    title: "5층 · 빛나는 고슴도치",
    sentences: [
      { tag: "영상", text: "{t}에 {r} 앞에서 {w}(이)가 {g}(으)로 빛났다." },
      { tag: "가설", text: "빛나는 물건이 배달됐다면, 배달표에 {r2}(으)로 온 물건이 있어야 한다." },
      { tag: "증거", text: "{d}에 {x}(이)가 도착했고, {t2} 출입 때 빛감지는 {on}이었다." },
      { tag: "결론", text: "그러므로 빛나는 고슴도치는 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "21:00" }, r: { cat: "where", answer: "501호" }, w: { cat: "who", answer: "고슴도치" },
      g: { cat: "state", answer: "초록빛" }, r2: { cat: "where", answer: "501호" }, d: { cat: "when", answer: "20:30" },
      x: { cat: "what", answer: "야광 페인트 (형광 초록) 3통" }, t2: { cat: "when", answer: "21:00" }, on: { cat: "state", answer: "On" },
      v: { cat: "verdict", answer: "설명된다" },
    },
    canonical: [{ type: "isin", table: "delivery", col: "호수", vals: ["501호", "502호", "503호"] }],
  },
  6: {
    title: "6층 · 작은 문으로 들어간 코알라",
    sentences: [
      { tag: "영상", text: "{t}에 6층 복도에서 {w}(이)가 {x}(으)로 들어갔다." },
      { tag: "가설", text: "주민이라면, {t2} 출입의 호수는 601~603호 중 하나여야 한다." },
      { tag: "증거", text: "출입표를 호수별로 묶어 세면 {r}(이)가 {c} 있고, 그 출입의 주민 정보는 {e}이다." },
      { tag: "결론", text: "그러므로 코알라는 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "03:00" }, w: { cat: "who", answer: "코알라" }, x: { cat: "what", answer: "작은 문" },
      t2: { cat: "when", answer: "03:00" }, r: { cat: "where", answer: "607호" }, c: { cat: "howmany", answer: "1건" },
      e: { cat: "state", answer: "비어 있음" }, v: { cat: "verdict", answer: "설명되지 않는다" },
    },
    canonical: [{ type: "group", table: "entry", col: "호수" }],
  },
  7: {
    title: "7층 · 텅 빈 복도",
    sentences: [
      { tag: "영상", text: "{t}에 7층 복도 영상에는 {n}." },
      { tag: "가설", text: "그 시각에 출입 기록이 있다면, 영상에 {w}(이)가 보여야 한다." },
      { tag: "증거", text: "늦은 밤 출입 중 {t2}에 {r} {w2}(이)가 들어왔고, 빛감지는 {on}이다." },
      { tag: "결론", text: "그러므로 텅 빈 복도는 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "01:30" }, n: { cat: "state", answer: "아무도 없음" }, w: { cat: "who", answer: "카피바라" },
      t2: { cat: "when", answer: "01:30" }, r: { cat: "where", answer: "702호" }, w2: { cat: "who", answer: "카피바라" },
      on: { cat: "state", answer: "On" }, v: { cat: "verdict", answer: "설명되지 않는다" },
    },
    canonical: [{ type: "cmp", table: "entry", conds: [{ col: "출입시", op: "ge", val: "23" }, { col: "출입시", op: "le", val: "3" }], join: "or" }],
  },
  8: {
    title: "8층 · 상자를 쌓는 낯선 사슴",
    sentences: [
      { tag: "영상", text: "{t}에 택배 보관실에서 처음 보는 {w}(이)가 {x}(을)를 쌓고 있었다." },
      { tag: "가설", text: "새로 이사 온 주민이라면, 가장 최근 입주날짜 {d}의 주인이어야 한다." },
      { tag: "증거", text: "{d2}에 입주한 주민은 {r}의 사슴이고, 같은 날 {t2}에 {item}(이)가 배달됐다." },
      { tag: "결론", text: "그러므로 낯선 사슴은 기록으로 {v}." },
    ],
    blanks: {
      t: { cat: "when", answer: "18:14" }, w: { cat: "who", answer: "사슴" }, x: { cat: "what", answer: "상자 더미" },
      d: { cat: "when", answer: "2026-11-07" }, d2: { cat: "when", answer: "2026-11-07" }, r: { cat: "where", answer: "403호" },
      t2: { cat: "when", answer: "15:00" }, item: { cat: "what", answer: "이삿짐 상자 12개" }, v: { cat: "verdict", answer: "설명된다" },
    },
    canonical: [{ type: "stat", table: "entry", col: "입주날짜", fn: "max" }],
  },
};

// 오판의 결과: 그 층 도장이 틀렸으면 두 층 뒤(8층 이후 오판은 보고서 직전)에 돌아온다
const EVENTS = {
  1: { kind: "번짐", from: "무전", text: "1층 주민 민원: 햄스터가 계속 늘어나요. 지난번에 이상 없다고 하셨잖아요?" },
  2: { kind: "민원", from: "인터폰", text: "202호인데요, 운동 다녀온 걸로 신고하셨어요? 매일 같은 시간에 나가는 건데요." },
  3: { kind: "민원", from: "인터폰", text: "302호입니다. 우리 고양이가 상자에 들어간 걸 신고하셨다고요?" },
  4: { kind: "번짐", from: "무전", text: "6층 복도 바닥에 꿀 자국이 이어져 있다. 4층의 곰은 어디로 간 걸까." },
  5: { kind: "민원", from: "인터폰", text: "501호예요. 야광 페인트 칠한 게 그렇게 이상했나요?" },
  6: { kind: "번짐", from: "무전", text: "택배 보관실 구석에 처음 보는 작은 문이 생겼다." },
  7: { kind: "번짐", from: "무전", text: "7층 CCTV가 1초 동안 심하게 흔들렸다. 아무도 없는데." },
  8: { kind: "민원", from: "인터폰", text: "403호예요. 어제 막 이사 왔는데 신고를 당했네요." },
};

// 보고서에서 그래프를 고른 뒤 푸는 마지막 보드. extraWords 는 보고서 단계에서 수첩에 더해진다
const MYSTERY = {
  title: "큰 미스터리 · 존재하지 않는 방",
  sentences: [
    { tag: "시간", text: "진짜 이상은 모두 {a}부터 {b} 사이, 출입이 {c} 시간에 일어났다." },
    { tag: "그림", text: "그 시간을 한눈에 보여 준 그림은 {g}이다." },
    { tag: "흔적", text: "주민 정보가 {e} 출입은 {t1}(과)와 {t2}이고, 그중 나중 출입의 호수는 {r}이다." },
    { tag: "방",   text: "6층에는 {rr}뿐이므로 {r2}(은)는 {x}이다." },
    { tag: "정체", text: "늘어난 햄스터, 곰, 코알라, 빈 복도의 카피바라 기록은 모두 {who}의 짓이다." },
  ],
  blanks: {
    a: { cat: "when", answer: "23시" }, b: { cat: "when", answer: "3시" }, c: { cat: "state", answer: "드문" },
    g: { cat: "what", answer: "시간대별 막대그래프" }, e: { cat: "state", answer: "비어 있음" },
    t1: { cat: "when", answer: "00:40" }, t2: { cat: "when", answer: "03:00" }, r: { cat: "where", answer: "607호" },
    rr: { cat: "where", answer: "601~603호" }, r2: { cat: "where", answer: "607호" }, x: { cat: "what", answer: "존재하지 않는 방" },
    who: { cat: "who", answer: "주민을 흉내 내는 미등록 존재" },
  },
  extraWords: [
    { text: "23시", cat: "when" }, { text: "3시", cat: "when" }, { text: "20시", cat: "when" },
    { text: "드문", cat: "state" }, { text: "붐비는", cat: "state" }, { text: "비어 있음", cat: "state" },
    { text: "시간대별 막대그래프", cat: "what" }, { text: "상자 그림", cat: "what" }, { text: "점 그래프", cat: "what" },
    { text: "00:40", cat: "when" }, { text: "03:00", cat: "when" }, { text: "01:30", cat: "when" },
    { text: "607호", cat: "where" }, { text: "601~603호", cat: "where" }, { text: "702호", cat: "where" },
    { text: "존재하지 않는 방", cat: "what" }, { text: "빈 창고", cat: "what" },
    { text: "주민을 흉내 내는 미등록 존재", cat: "who" }, { text: "새로 이사 온 주민", cat: "who" }, { text: "배달 기사", cat: "who" },
  ],
};
