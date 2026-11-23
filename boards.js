// ============================================================
// boards.js — ver8 조사 데이터 (콘텐츠 담당이 고치는 파일)
// 설계: design/flow-investigator.md
//   CATS        : 빈칸 범주(색). 빈칸의 테두리 색과 이름표에 쓴다
//   RULES       : 경비 수칙. floor 층에서 새로 붙는다 (Papers, Please 처럼 늘어남)
//   LENS_TYPES  : 렌즈 틀. unlock 층부터 쓸 수 있다
//   FLOOR_TOOL  : 층마다 새로 배우는 도구 (공지와 코드 풀이에 쓴다)
//   BOARDS      : 층별 REPORT 보드 제목 + 코드 풀이에 나오는 정석 필터링(canonical)
//   CLUES       : 증거 잇기 — 층마다 "영상 단서" 카드와 정답(이을 기록 · 실 색)
//   MYSTERY     : 마지막 큰 미스터리 보드 (문장 안의 {id} 가 빈칸, blanks[id] = { cat, answer })
//                 빈칸 뒤 (이)가 (을)를 (은)는 (과)와 (으)로 는 고른 낱말의 받침에 맞게 바뀐다
//   BOARD_OPTIONS : 미스터리 빈칸 드롭다운 보기 (정답 + 오답)
//   REPORT      : 경비 보고서의 그래프 고르기 (8층 뒤, 미스터리 앞)
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
  { floor: 7, text: "수칙 7. 같은 동물이라도 증명사진 · 주민등록번호가 다르면 다른 존재다." },
  { floor: 8, text: "수칙 8. 새로 이사 온 주민은 아직 낯설 수 있다. 그 주민의 첫 출입 날짜를 확인하라." },
];

// 렌즈 틀 (화면에는 말로만 보인다. 코드는 층이 끝난 뒤 풀이 창에서)
const LENS_TYPES = [
  { id: "cmp",    unlock: 1, tab: "같은/다른 내용 보기" },
  { id: "unique", unlock: 3, tab: "어떤 값들이 있나" },
  { id: "null",   unlock: 4, tab: "빈 칸 찾기" },
  { id: "isin",   unlock: 5, tab: "목록 중 하나" },
  { id: "group",  unlock: 6, tab: "묶어서 세기" },
  { id: "stat",   unlock: 8, tab: "가장 큰/작은 값" },
];

const FLOOR_TOOL = {
  1: { name: "같은/다른 내용만 보기", sentence: "[표]에서 [열]이 [값]과 [같은/다른] 내용만 보기", concept: "조건 필터 (==, !=)" },
  2: { name: "조건 두 개 잇기 (이고)", sentence: "… 내용 중에서 [이고] [열]이 [값]과 같은 내용만 보기", concept: "이중 조건 (&)" },
  3: { name: "어떤 값들이 있나 모아 보기", sentence: "[표]의 [열]에 어떤 값들이 있는지 모아 보기", concept: "unique" },
  4: { name: "빈 칸 찾기", sentence: "[표]에서 [열]이 [비어 있는/채워진] 내용만 보기", concept: "결측치 (isnull, notnull)" },
  5: { name: "목록 중 하나인 내용 보기", sentence: "[표]에서 [열]이 [값, 값, 값] 중 하나인 내용만 보기", concept: "isin" },
  6: { name: "묶어서 세기", sentence: "[표]를 [열]별로 묶어서 세기", concept: "groupby + size" },
  7: { name: "이거나 · 크거나 같은/작거나 같은", sentence: "[열]이 [값]보다 크거나 같은 [이거나] … 내용만 보기 (시각 · 소리처럼 순서가 있는 열)", concept: "크기 비교 (>=, <=), 이중 조건 (|)" },
  8: { name: "가장 큰/작은 값 찾기", sentence: "[표]에서 [열]이 [값]인 내용의 [열]에서 [가장 큰/가장 작은/평균/합] 값 찾기", concept: "조건 + 통계 (max, min, mean, sum)" },
};

const BOARDS = {
  1: {
    title: "1층 · 늘어나는 햄스터",
    canonical: [{type: "cmp", table: "entry", conds: [{col: "동물", op: "eq", val: "햄스터"}], join: "and"}],
  },
  2: {
    title: "2층 · 뒤로 걷는 게코도마뱀",
    canonical: [{type: "cmp", table: "entry", conds: [{col: "동물", op: "eq", val: "게코도마뱀"}, {col: "소리", op: "eq", val: "1"}], join: "and"}],
  },
  3: {
    title: "3층 · 네모가 된 고양이",
    canonical: [{type: "unique", table: "delivery", col: "제품"}, {type: "cmp", table: "delivery", conds: [{col: "제품", op: "eq", val: "정육면체 유리 상자 (택배)"}], join: "and"}],
  },
  4: {
    title: "4층 · 꿀 먹는 곰",
    canonical: [{type: "cmp", table: "entry", conds: [{col: "동물", op: "eq", val: "곰"}], join: "and"}, {type: "null", table: "entry", col: "동물", mode: "null"}],
  },
  5: {
    title: "5층 · 빛나는 고슴도치",
    canonical: [{type: "isin", table: "delivery", col: "호수", vals: ["501", "502", "503"]}],
  },
  6: {
    title: "6층 · 작은 문으로 들어간 코알라",
    canonical: [{type: "group", table: "entry", col: "호수"}],
  },
  7: {
    title: "7층 · 증명사진과 다른 카피바라",
    canonical: [{type: "cmp", table: "entry", conds: [{col: "동물", op: "eq", val: "카피바라"}], join: "and"}],
  },
  8: {
    title: "8층 · 상자를 쌓는 낯선 사슴",
    canonical: [{type: "stat", table: "entry", col: "출입시간", fn: "min", where: {col: "동물", val: "사슴"}}, {type: "cmp", table: "delivery", conds: [{col: "호수", op: "eq", val: "403"}], join: "and"}],
  },
};

// 증거 잇기: 층마다 왼쪽에 붙는 "영상 단서" 카드. 플레이어는 장부에서 📌 꽂아 온 포스트잇과 실로 잇는다.
//   tag : 카드 이름표 (영상 · 사진)        where: 어느 장부에서 찾으면 되는지 (카드 아래 작은 힌트)
//   ev  : 이 카드에 이어야 하는 기록 id (data.js 의 E.. / D..). 이 중 하나면 정답
//   rel : "eq" = 기록이 영상을 설명한다 (초록 실 =)   "ne" = 기록과 영상이 어긋난다 (빨간 실 ≠)
const CLUES = {
  1: [
    { tag: "영상", text: "23:10 · 101호 앞 · 햄스터가 9마리로 늘어난다", where: "출입표", ev: ["E01", "E02"], rel: "ne" },
    { tag: "영상", text: "햄스터 무리 옆의 해바라기씨 봉지", where: "택배장부", ev: ["D10"], rel: "eq" },
  ],
  2: [
    { tag: "영상", text: "22:00 · 202호 앞 · 게코도마뱀이 뒤로 미끄러진다", where: "출입표", ev: ["E03", "E04", "E05"], rel: "eq" },
    { tag: "영상", text: "발소리가 거의 들리지 않는다", where: "출입표", ev: ["E03", "E04", "E05"], rel: "eq" },
  ],
  3: [
    { tag: "영상", text: "20:20 · 302호 앞 · 고양이가 완벽한 네모 모양", where: "택배장부", ev: ["D01"], rel: "eq" },
    { tag: "영상", text: "20:20 · 고양이가 302호로 들어온다", where: "출입표", ev: ["E08"], rel: "eq" },
  ],
  4: [
    { tag: "영상", text: "00:40 · 4층 복도 · 곰이 꿀을 퍼먹는다", where: "출입표", ev: ["E09"], rel: "ne" },
    { tag: "영상", text: "곰 앞의 커다란 꿀단지", where: "택배장부", ev: ["D02"], rel: "eq" },
  ],
  5: [
    { tag: "영상", text: "21:00 · 501호 앞 · 고슴도치가 형광 초록으로 빛난다", where: "택배장부", ev: ["D03"], rel: "eq" },
    { tag: "영상", text: "고슴도치가 지나가자 복도가 번쩍인다", where: "출입표", ev: ["E10"], rel: "eq" },
  ],
  6: [
    { tag: "영상", text: "03:00 · 코알라가 벽의 작은 문으로 들어간다", where: "출입표", ev: ["E11"], rel: "ne" },
    { tag: "영상", text: "작은 문 너머에 있는 방 (6층은 601~603호뿐)", where: "택배장부", ev: ["D99", "E11"], rel: "ne" },
  ],
  7: [
    { tag: "영상", text: "01:30 · 702호로 들어가는 카피바라 (귀가 뾰족, 눈이 하얗다)", where: "출입표", ev: ["E12"], rel: "ne" },
    { tag: "사진", text: "증명사진 속 702호 카피바라 (귀가 둥글다)", where: "출입표", ev: ["E78", "E79"], rel: "eq" },
  ],
  8: [
    { tag: "영상", text: "18:14 · 택배 보관실 · 처음 보는 사슴", where: "출입표", ev: ["E53", "E54", "E55"], rel: "eq" },
    { tag: "영상", text: "사슴이 쌓는 상자 더미", where: "택배장부", ev: ["D08"], rel: "eq" },
  ],
};

// 보고서에서 그래프를 고른 뒤 푸는 마지막 보드 (이것만 빈칸 드롭다운)
const MYSTERY = {
  title: "큰 미스터리 · 존재하지 않는 방",
  sentences: [
    { tag: "시간", text: "진짜 이상은 모두 {a}부터 {b} 사이, 출입이 {c} 시간에 일어났다." },
    { tag: "그림", text: "그 시간을 한눈에 보여 준 그림은 {g}이다." },
    { tag: "흔적", text: "주민 정보가 {e} 출입은 {t1}(과)와 {t2}이고, 그중 나중 출입의 호수는 {r}이다." },
    { tag: "방",   text: "6층에는 {rr}뿐이므로 {r2}(은)는 {x}이다." },
    { tag: "정체", text: "늘어난 햄스터, 곰, 코알라, 가짜 카피바라는 모두 {who}의 짓이다." },
  ],
  blanks: {
    a: { cat: "when", answer: "23시" }, b: { cat: "when", answer: "3시" }, c: { cat: "state", answer: "드문" },
    g: { cat: "what", answer: "시간대별 막대그래프" }, e: { cat: "state", answer: "비어 있음" },
    t1: { cat: "when", answer: "00:40" }, t2: { cat: "when", answer: "03:00" }, r: { cat: "where", answer: "607호" },
    rr: { cat: "where", answer: "601~603호" }, r2: { cat: "where", answer: "607호" }, x: { cat: "what", answer: "존재하지 않는 방" },
    who: { cat: "who", answer: "주민을 흉내 내는 미등록 존재" },
  },
};

// 경비 보고서: 그래프 종류를 고르면 출입시(0~23) 그래프가 바로 그려진다. 판정도 벌점도 없다.
//   fill = seaborn 함수 이름 (game.js 의 chartSvg 가 이 이름으로 그래프 모양을 고른다)
const REPORT = {
  concept: "그래프로 그려 보기",
  question: "오늘 밤 이상한 일들은 언제 몰려 있었을까? 그래프 하나로 보고하자.",
  sentence: "출입 시각을 ____ 로 그려서 보기",
  cards: [
    { fill: "histplot",    word: "시간대별 막대그래프", meaning: "몇 건씩 있는지 막대로 봐요" },
    { fill: "boxplot",     word: "상자 그림",           meaning: "보통 범위와 튀는 값을 봐요" },
    { fill: "scatterplot", word: "점 그래프",           meaning: "기록마다 점 하나씩 찍어요" },
  ],
};

// 큰 미스터리 보드의 빈칸 드롭다운 보기. 빈칸 id → 보기 목록. 정답이 반드시 들어 있어야 한다.
// 결론 칸(verdict)은 [설명된다 / 설명되지 않는다] 로 고정이라 여기 없다.
const BOARD_OPTIONS = {
  mystery: {
    a: ["18시", "20시", "23시", "3시"],         b: ["18시", "20시", "23시", "3시"],   c: ["드문", "붐비는", "보통인"],
    g: ["상자 그림", "시간대별 막대그래프", "점 그래프"],   e: ["비어 있음", "채워져 있음"],
    t1: ["00:40", "01:30", "03:00"],           t2: ["00:40", "01:30", "03:00"],
    r: ["601호", "603호", "607호", "702호"],   rr: ["601~603호", "601~607호", "601~610호"],   r2: ["601호", "603호", "607호", "702호"],
    x: ["빈 창고", "존재하지 않는 방", "새로 생긴 방"],
    who: ["새로 이사 온 주민", "배달 기사", "주민을 흉내 내는 미등록 존재"],
  },
};
