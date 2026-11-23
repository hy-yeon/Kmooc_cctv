// ============================================================
// checklists.js — 순찰 일지(체크리스트). 판정 버튼(✓/✗)을 누르면 이 5문항을 써야 다음 층으로 간다.
// CHECK_ITEMS : 벽에 붙은 체크리스트 그림과 작성 창의 문항 이름 (모든 층 공통)
// CHECKLISTS  : 층별 보기와 정답.  { q?: 이 층만의 질문, options: [...], answer: 정답 번호(0부터) }
// ============================================================

const CHECK_ITEMS = [
  { key: "kind",   label: "영상에서 무엇이 이상했나?" },
  { key: "source", label: "근거를 찾은 기록은?" },
  { key: "room",   label: "관련 호수는?" },
  { key: "fact",   label: "데이터가 알려 준 핵심 사실은?" },
  { key: "time",   label: "영상 속 시각은?" },
];

const KIND_OPTIONS = ["개체 수가 이상함", "움직임·행동이 이상함", "모습·색·빛이 이상함", "있어야 할 것이 없음", "처음 보는 대상이 나타남"];
const SOURCE_OPTIONS = ["출입표", "배달표", "둘 다", "찾지 못함"];

const CHECKLISTS = {
  1: {
    kind:   { options: KIND_OPTIONS, answer: 0 },
    source: { options: SOURCE_OPTIONS, answer: 0 },
    room:   { options: ["102호 (토끼)", "101호 (햄스터)", "103호 (다람쥐)", "201호 (오리)"], answer: 1 },
    fact:   { q: "101호에 등록된 햄스터는 몇 마리인가?", options: ["수십 마리", "2마리", "1마리", "5마리"], answer: 1 },
    time:   { options: ["20:20", "23:10", "03:00", "21:00"], answer: 1 },
  },
  2: {
    kind:   { options: KIND_OPTIONS, answer: 1 },
    source: { options: SOURCE_OPTIONS, answer: 0 },
    room:   { options: ["201호 (오리)", "203호 (너구리)", "202호 (게코도마뱀)", "302호 (고양이)"], answer: 2 },
    fact:   { q: "게코는 언제 출입했나?", options: ["새벽 0~3시", "매일 같은 밤 10시쯤", "낮 12시쯤", "불규칙하게"], answer: 1 },
    time:   { options: ["22:00", "00:40", "20:20", "03:00"], answer: 0 },
  },
  3: {
    kind:   { options: KIND_OPTIONS, answer: 2 },
    source: { options: SOURCE_OPTIONS, answer: 2 },
    room:   { options: ["302호 (고양이)", "301호 (여우)", "303호 (수달)", "202호 (게코도마뱀)"], answer: 0 },
    fact:   { q: "302호에 20:05에 배달된 물건은?", options: ["스크래처 패드", "생선 도시락", "정육면체 유리 상자", "물고기 간식"], answer: 2 },
    time:   { options: ["21:00", "01:30", "20:20", "23:10"], answer: 2 },
  },
  4: {
    kind:   { options: KIND_OPTIONS, answer: 4 },
    source: { q: "'주민 중에 곰이 없다'는 것을 확인한 기록은?", options: SOURCE_OPTIONS, answer: 0 },
    room:   { options: ["401호 (오소리)", "402호 (토끼)", "403호 (사슴)", "호수 정보가 비어 있음"], answer: 3 },
    fact:   { q: "출입표의 동물 종류에 곰은 몇 번 나오나?", options: ["2번", "1번", "3번", "한 번도 없음"], answer: 3 },
    time:   { options: ["20:20", "01:30", "22:00", "00:40"], answer: 3 },
  },
  5: {
    kind:   { options: KIND_OPTIONS, answer: 2 },
    source: { options: SOURCE_OPTIONS, answer: 2 },
    room:   { options: ["502호 (펭귄)", "503호 (라쿤)", "501호 (고슴도치)", "203호 (너구리)"], answer: 2 },
    fact:   { q: "501호에 20:30에 배달된 물건은?", options: ["야광 페인트", "손전등 세트", "벌레 간식", "LED 무드등"], answer: 0 },
    time:   { options: ["20:30", "21:00", "01:30", "03:00"], answer: 1 },
  },
  6: {
    kind:   { options: KIND_OPTIONS, answer: 4 },
    source: { options: SOURCE_OPTIONS, answer: 0 },
    room:   { options: ["601호 (염소)", "602호 (양)", "603호 (다람쥐)", "607호 (명단에 없음)"], answer: 3 },
    fact:   { q: "6층에 입주한 호수는?", options: ["601~607호", "601~603호", "601~610호", "603호만"], answer: 1 },
    time:   { options: ["23:10", "00:40", "03:00", "21:00"], answer: 2 },
  },
  7: {
    kind:   { options: KIND_OPTIONS, answer: 3 },
    source: { options: SOURCE_OPTIONS, answer: 0 },
    room:   { options: ["701호 (토끼)", "703호 (알파카)", "702호 (카피바라)", "102호 (토끼)"], answer: 2 },
    fact:   { q: "새벽 1시 30분 출입 때 빛 센서는?", options: ["Off", "기록 없음", "On", "고장"], answer: 2 },
    time:   { options: ["00:40", "01:30", "03:00", "21:00"], answer: 1 },
  },
  8: {
    kind:   { options: KIND_OPTIONS, answer: 4 },
    source: { options: SOURCE_OPTIONS, answer: 2 },
    room:   { options: ["403호 (사슴)", "401호 (오소리)", "603호 (다람쥐)", "101호 (햄스터)"], answer: 0 },
    fact:   { q: "가장 최근에 입주한 주민의 입주일은?", options: ["2019-03-03", "2026-09-10", "2026-01-15", "2026-11-07"], answer: 3 },
    time:   { options: ["22:00", "23:10", "03:00", "18:14"], answer: 3 },
  },
};
