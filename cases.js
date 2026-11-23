// ============================================================
// cases.js — 층별 "카드 조사" (pandas 를 몰라도 플레이할 수 있게)
// 코드 한 줄에 빈칸이 있고, 카드를 누르면 그 카드로 완성된 코드의 결과가 바로 나온다.
// 결과는 파이썬 없이 여기서 미리 계산한다 (즉시 반응, 오류 없음, 인터넷 불필요).
//
// 층마다 steps(조사 1~2개). 각 step:
//   concept  : 이 층에서 처음 보여 주는 pandas 개념 (강의 연결)
//   question : 쉬운 말로 된 수사 질문
//   code     : 빈칸이 ____ 인 코드 한 줄
//   cards    : { fill: 빈칸에 들어갈 코드, meaning: 뜻, key: 정답 단서인지, result(), note }
//              result() → { kind: "rows", table: "entry"|"delivery", rows } | { kind: "values", values }
//                          | { kind: "series", index: 묶은 열 이름, name: 값 이름, items: [[키, 값], ...] }  (groupby 결과)
//              note     → 결과 아래 한 줄 요약 (없으면 "N행" 처럼 자동)
// ============================================================

const CASES = (() => {
  const E = () => TABLES[0].rows;   // 출입표 df_entry
  const D = () => TABLES[1].rows;   // 배달표 df_delivery
  const rows = (table, pred) => () => ({ kind: "rows", table, rows: (table === "entry" ? E() : D()).filter(pred) });

  // groupby(by)[col].max() 와 같은 결과: 묶은 값마다 col 의 최댓값 (빈 값인 묶음은 pandas 처럼 뺀다)
  const groupMax = (by, col) => () => {
    const m = new Map();
    E().forEach((r) => {
      if (r[by] === null || r[by] === undefined || r[col] === null) return;
      if (!m.has(r[by]) || r[col] > m.get(r[by])) m.set(r[by], r[col]);
    });
    return { kind: "series", index: by, name: col, items: [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)) };
  };
  const dates = () => E().map((r) => r.입주날짜).filter((v) => v !== null);

  return {
    1: [{
      concept: "조건으로 고르기  df[ 조건 ]",
      question: "이 아파트에 등록된 햄스터의 출입 기록은 몇 건일까?",
      code: "df_entry[ df_entry['동물종류'] ____ '햄스터' ]",
      cards: [
        { fill: "==", meaning: "같은 것만", key: true, result: rows("entry", (r) => r.동물종류 === "햄스터"),
          note: "햄스터 기록은 딱 2건 (101호). 주민등록번호도 2개뿐 → 등록된 햄스터는 2마리" },
        { fill: "!=", meaning: "다른 것만", result: rows("entry", (r) => r.동물종류 !== "햄스터"),
          note: "햄스터가 아닌 기록이 나왔어요. 찾던 게 아니에요" },
      ],
    }],

    2: [{
      concept: "이중 조건  (조건1) & (조건2)",
      question: "게코도마뱀은 매일 운동하러 나가는 주민일까?",
      code: "df_entry[ (df_entry['동물종류']=='게코도마뱀') ____ (df_entry['운동']=='Y') ]",
      cards: [
        { fill: "&", meaning: "둘 다 맞는 것만", key: true,
          result: rows("entry", (r) => r.동물종류 === "게코도마뱀" && r.운동 === "Y"),
          note: "게코(202호)는 운동시설 이용 Y, 5일 내내 밤 10시에 나갔어요 → 매일 하는 습관" },
        { fill: "|", meaning: "둘 중 하나라도 맞으면",
          result: rows("entry", (r) => r.동물종류 === "게코도마뱀" || r.운동 === "Y"),
          note: "운동하는 다른 주민까지 섞여서 너무 많아요" },
      ],
    }],

    3: [{
      concept: "목록에 있는 것만  .isin([...])",
      question: "3층 집들에는 무엇이 배달됐을까? 호수를 골라 보자.",
      code: "df_delivery[ df_delivery['호수'].isin([ ____ ]) ]",
      cards: [
        { fill: "'301'", meaning: "301호 (여우)", result: rows("delivery", (r) => r.호수 === "301"),
          note: "여우네는 포도만 시켰어요" },
        { fill: "'302'", meaning: "302호 (고양이)", key: true, result: rows("delivery", (r) => r.호수 === "302"),
          note: "20:05 고양이네에 '정육면체 유리 상자' 도착 → 20:20 고양이 출입. 상자에 들어간 걸까?" },
        { fill: "'303'", meaning: "303호 (수달)", result: rows("delivery", (r) => r.호수 === "303"),
          note: "수달네는 간식과 무드등을 시켰어요" },
      ],
    }],

    4: [{
      concept: "겹치지 않게 종류만  .unique()",
      question: "이 아파트 주민 중에 곰이 있을까?",
      code: "df_entry['동물종류'].____()",
      cards: [
        { fill: "unique", meaning: "겹치지 않게 종류만", key: true,
          result: () => ({ kind: "values", values: [...new Set(E().map((r) => r.동물종류))] }),
          note: "동물 종류는 18가지 + 빈 값(NaN) 하나. '곰'은 어디에도 없어요!" },
        { fill: "head", meaning: "앞에서 5개만",
          result: () => ({ kind: "values", values: E().slice(0, 5).map((r) => r.동물종류) }),
          note: "앞의 5개만 봐서는 알 수 없어요" },
      ],
    }],

    5: [{
      concept: "조건 복습  df[ 조건 ]",
      question: "빛 센서가 켜진(On) 출입 기록은 누구 것일까?",
      code: "df_entry[ df_entry['빛감지'] == ____ ]",
      cards: [
        { fill: "'On'", meaning: "빛이 감지됨", key: true, result: rows("entry", (r) => r.빛감지 === "On"),
          note: "21:00 501호 고슴도치가 나갈 때 빛이 감지됐어요. 왜 빛났을까?" },
        { fill: "'Off'", meaning: "빛이 없음", result: rows("entry", (r) => r.빛감지 === "Off"),
          note: "대부분은 빛이 없어요" },
      ],
    }, {
      concept: "목록에 있는 것만  .isin([...])",
      question: "고슴도치네(501호)는 무엇을 시켰을까?",
      code: "df_delivery[ df_delivery['호수'].isin([ ____ ]) ]",
      cards: [
        { fill: "'501'", meaning: "501호 (고슴도치)", key: true, result: rows("delivery", (r) => r.호수 === "501"),
          note: "20:30 '야광 페인트(형광 초록)' 도착 → 21:00 빛나는 고슴도치. 페인트를 칠한 거였어요" },
        { fill: "'502'", meaning: "502호 (펭귄)", result: rows("delivery", (r) => r.호수 === "502"),
          note: "펭귄네는 얼음 틀과 도시락" },
      ],
    }],

    6: [{
      concept: "빈 값(결측치) 찾기  .isnull()",
      question: "주민 정보가 비어 있는(누군지 모르는) 출입 기록이 있을까?",
      code: "df_entry[ df_entry['동물종류'].____() ]",
      cards: [
        { fill: "isnull", meaning: "빈 값인 것만", key: true, result: rows("entry", (r) => r.동물종류 === null),
          note: "03:00 '607호' 출입! 그런데 6층 주민은 601~603호뿐 → 명단에 없는 호실" },
        { fill: "notnull", meaning: "값이 있는 것만", result: rows("entry", (r) => r.동물종류 !== null),
          note: "주민 정보가 다 있는 정상 기록들이에요" },
      ],
    }],

    7: [{
      concept: "크기 비교  >=  <",
      question: "새벽 1시 이후, 복도에 누가 지나갔을까?",
      code: "df_entry[ df_entry['출입시간'] ____ '11-09 01:00' ]",
      cards: [
        { fill: ">=", meaning: "그 시각 이후", key: true, result: rows("entry", (r) => r.출입시간 >= "11-09 01:00"),
          note: "01:30 702호 카피바라가 지나갔고 빛감지도 On. 그런데 CCTV엔 아무도 없어요" },
        { fill: "<", meaning: "그 시각 이전", result: rows("entry", (r) => r.출입시간 < "11-09 01:00"),
          note: "이건 영상 시각(01:30)보다 앞선 기록들이에요" },
      ],
    }],

    8: [{
      concept: "묶어서 보기  .groupby(열)[열].통계()",
      question: "동물별로 묶어서 보면, 가장 최근에 이사 온 건 누구일까?",
      code: "df_entry.groupby( ____ )['입주날짜'].max()",
      cards: [
        { fill: "'동물종류'", meaning: "동물별로 묶기", key: true, result: groupMax("동물종류", "입주날짜"),
          note: "사슴만 2026-11-07, 바로 어제 입주했어요. 다른 동물은 모두 9월 이전" },
        { fill: "'빛감지'", meaning: "빛 감지(On/Off)로 묶기", result: groupMax("빛감지", "입주날짜"),
          note: "On/Off 두 줄뿐이라 누가 새로 왔는지 알 수 없어요" },
      ],
    }, {
      concept: "통계 한 줄  .max()  .min()",
      question: "이 아파트에서 가장 최근 입주일은 언제일까?",
      code: "df_entry['입주날짜'].____()",
      cards: [
        { fill: "max", meaning: "가장 큰(최근) 값", key: true,
          result: () => ({ kind: "values", values: [dates().reduce((x, y) => (x > y ? x : y))] }),
          note: "가장 최근 입주일은 2026-11-07. 영상 바로 전날이에요" },
        { fill: "min", meaning: "가장 작은(오래된) 값",
          result: () => ({ kind: "values", values: [dates().reduce((x, y) => (x < y ? x : y))] }),
          note: "가장 오래된 입주일이에요 (염소네). 찾던 건 최근 입주예요" },
      ],
    }, {
      concept: "목록에 있는 것만  .isin([...])  (복습)",
      question: "사슴네(403호)에는 무엇이 배달됐을까?",
      code: "df_delivery[ df_delivery['호수'].isin([ ____ ]) ]",
      cards: [
        { fill: "'401'", meaning: "401호 (오소리)", result: rows("delivery", (r) => r.호수 === "401"),
          note: "오소리네는 간식과 꿀을 시켰어요" },
        { fill: "'403'", meaning: "403호 (사슴)", key: true, result: rows("delivery", (r) => r.호수 === "403"),
          note: "11-07 15:00 '이삿짐 상자 12개' 도착. 영상 속 상자가 바로 이삿짐!" },
      ],
    }],
  };
})();

// ---------- 경비 보고서 (8층 순찰 뒤, 엔딩 앞) ----------
// 시각화 카드: 그래프 종류를 고르면 출입시(0~23) 그래프가 바로 그려진다. 판정도 벌점도 없다.
const REPORT = {
  concept: "시각화  sns.그래프종류(data=표, x=열)",
  question: "오늘 밤 이상한 일들은 언제 몰려 있었을까? 그래프 하나로 보고하자.",
  code: "sns.____(data=df_entry, x='출입시')",
  cards: [
    { fill: "histplot", meaning: "시간대별 막대 (몇 건씩?)", key: true,
      note: "출입은 20~22시에 몰려 있는데, 진짜 이상현상(빨간 점선)은 출입이 드문 밤 11시~새벽 3시에만 일어났어요 → 새벽 순찰 강화!" },
    { fill: "boxplot", meaning: "분포 상자 (보통 범위와 튀는 값)",
      note: "상자가 보통 출입 시간(저녁)이에요. 이상현상(빨간 점선)은 상자 밖, 튀는 값(점) 쪽에 몰려 있어요" },
    { fill: "scatterplot", meaning: "점 찍기",
      note: "기록마다 점을 찍었어요. 몰린 곳은 보이지만 몇 건인지 세기는 어려워요" },
  ],
};

// ============================================================
// 자연어 문장 · 낱말 카드 · 코드 풀이 (ver7)
// 플레이 중에는 코드를 보여 주지 않는다. 대신 "빈칸이 있는 말" 한 문장과 낱말 카드로 고른다.
// 정확한 코드(code)는 각 층이 끝난 뒤 "오늘의 코드 풀이" 창에서 설명과 함께 보여 준다.
//   sentence : 빈칸(____)이 있는 쉬운 말 한 문장
//   cards    : [낱말, 한 줄 뜻] — CASES 의 cards 와 같은 순서
//   explain  : [[코드 조각, 뜻], ...] 풀이 창에 나오는 설명
// ============================================================
const NL = {
  1: [{
    concept: "조건으로 골라 보기",
    sentence: "출입표에서 동물의 종류가 햄스터와 ____ 줄만 보기",
    cards: [["같은", "같은 것만 남겨요"], ["다른", "다른 것만 남겨요"]],
    explain: [
      ["df_entry", "출입표 전체예요."],
      ["df_entry['동물종류']", "출입표에서 '동물종류' 칸만 꺼내요."],
      ["== '햄스터'", "그 칸이 햄스터와 같은지 줄마다 검사해요. (같지 않은지는 != 로 검사해요)"],
      ["df_entry[ 검사 ]", "검사를 통과한(참인) 줄만 남겨요."],
    ],
  }],
  2: [{
    concept: "조건 두 개를 함께 쓰기",
    sentence: "동물의 종류 = 게코도마뱀  ____  운동 = 했음(Y)  인 줄만 보기",
    cards: [["이고", "두 조건을 모두 만족해야 해요"], ["이거나", "둘 중 하나만 맞아도 돼요"]],
    explain: [
      ["(조건1) & (조건2)", "& 는 '이고'예요. 두 조건을 모두 만족하는 줄만 남겨요."],
      ["(조건1) | (조건2)", "| 는 '이거나'예요. 하나라도 맞으면 남겨요."],
      ["괄호 ( )", "조건 하나하나를 꼭 괄호로 묶어요."],
      ["df_entry['운동'] == 'Y'", "운동시설을 이용한(Y) 줄이에요."],
    ],
  }],
  3: [{
    concept: "목록 안에 있는 것만 보기",
    sentence: "배달표에서 호수가 ____ 인 집의 배달만 보기",
    cards: [["301호", "여우네"], ["302호", "고양이네"], ["303호", "수달네"]],
    explain: [
      ["df_delivery", "배달표 전체예요."],
      [".isin([ ... ])", "괄호 안 목록에 들어 있는 값이면 참이에요. 여러 호수를 한꺼번에 넣을 수도 있어요. 예: ['301', '302']"],
      ["df_delivery[ 검사 ]", "참인 줄만 남겨요."],
    ],
  }],
  4: [{
    concept: "종류만 한 번씩 보기",
    sentence: "출입표의 동물 종류를 ____ 보기",
    cards: [["종류별로 한 번씩만", "같은 값은 한 번만 보여요"], ["앞의 5개만", "맨 위 5줄만 봐요"]],
    explain: [
      [".unique()", "같은 값은 한 번만 세고, 어떤 종류가 있는지 목록으로 보여 줘요."],
      ["왜 필요할까요?", "목록에 '곰'이 없다면, 이 아파트 주민 중에 곰은 없다는 뜻이에요."],
      [".head()", "맨 위 5줄만 보여 줘요. 전체를 알 수는 없어요."],
    ],
  }],
  5: [{
    concept: "조건으로 골라 보기 (복습)",
    sentence: "출입표에서 빛 센서가 ____ 줄만 보기",
    cards: [["켜진(On)", "빛이 감지됐어요"], ["꺼진(Off)", "빛이 없었어요"]],
    explain: [
      ["df_entry['빛감지'] == 'On'", "빛감지 칸이 On인지 줄마다 검사해요."],
      ["df_entry[ 검사 ]", "참인 줄만 남겨요."],
    ],
  }, {
    concept: "목록 안에 있는 것만 보기 (복습)",
    sentence: "배달표에서 호수가 ____ 인 집의 배달만 보기",
    cards: [["501호", "고슴도치네"], ["502호", "펭귄네"]],
    explain: [
      [".isin([ '501' ])", "호수가 목록 안에 있는 줄만 참이에요."],
      ["df_delivery[ 검사 ]", "참인 줄만 남겨요."],
    ],
  }],
  6: [{
    concept: "빈 칸 찾기",
    sentence: "출입표에서 동물의 종류가 ____ 줄만 보기",
    cards: [["비어 있는", "값이 없는(NaN) 줄"], ["채워진", "값이 있는 줄"]],
    explain: [
      [".isnull()", "칸이 비어 있으면(NaN) 참이에요."],
      [".notnull()", "반대로 값이 들어 있으면 참이에요."],
      ["df_entry[ 검사 ]", "참인 줄만 남겨요."],
    ],
  }],
  7: [{
    concept: "크기·순서 비교하기",
    sentence: "출입표에서 출입시간이 11-09 01:00 ____ 줄만 보기",
    cards: [["이후인", "그 시각 이후"], ["이전인", "그 시각 이전"]],
    explain: [
      [">=", "'크거나 같다'예요. 시각은 글자 순서대로 비교돼서 '이후'를 고를 수 있어요."],
      ["<", "'작다'예요. 그 시각 '이전'을 골라요."],
      ["df_entry[ 검사 ]", "참인 줄만 남겨요."],
    ],
  }],
  8: [{
    concept: "묶어서 보기",
    sentence: "출입표를 ____ 별로 묶어서, 입주날짜가 가장 늦은(최근) 값을 보기",
    cards: [["동물 종류", "같은 동물끼리 묶어요"], ["빛 감지", "On/Off로 묶어요"]],
    explain: [
      [".groupby('동물종류')", "같은 동물끼리 묶어요."],
      ["['입주날짜']", "묶음마다 입주날짜 칸을 봐요."],
      [".max()", "묶음마다 가장 큰(늦은=최근) 값을 구해요. 평균은 .mean(), 합계는 .sum(), 가운데 값은 .median(), 가장 작은 값은 .min()이에요."],
    ],
  }, {
    concept: "가장 큰·작은 값 보기",
    sentence: "출입표의 입주날짜 중 ____ 날짜 보기",
    cards: [["가장 늦은(최근)", "가장 큰 값"], ["가장 이른(오래된)", "가장 작은 값"]],
    explain: [
      [".max()", "가장 큰 값이에요. 날짜에서는 가장 최근이에요."],
      [".min()", "가장 작은 값이에요. 날짜에서는 가장 오래된 날이에요."],
    ],
  }, {
    concept: "목록 안에 있는 것만 보기 (복습)",
    sentence: "배달표에서 호수가 ____ 인 집의 배달만 보기",
    cards: [["401호", "오소리네"], ["403호", "사슴네"]],
    explain: [
      [".isin([ '403' ])", "호수가 목록 안에 있는 줄만 참이에요."],
      ["df_delivery[ 검사 ]", "참인 줄만 남겨요."],
    ],
  }],
};

// CASES 에 합친다: 쉬운 말은 concept/sentence/word 로, 원래 개념 이름은 term 으로 남긴다.
Object.keys(NL).forEach((floor) => {
  NL[floor].forEach((n, i) => {
    const step = CASES[floor][i];
    step.term = step.concept;
    step.concept = n.concept;
    step.sentence = n.sentence;
    step.explain = n.explain;
    step.cards.forEach((c, j) => { c.word = n.cards[j][0]; c.meaning = n.cards[j][1]; });
  });
});

Object.assign(REPORT, {
  term: REPORT.concept,
  concept: "그래프로 그려 보기",
  sentence: "출입 시각(출입시)을 ____ 로 그려서 보기",
  explain: [
    ["sns.histplot", "시간대별 막대그래프를 그려요. 상자 그림은 sns.boxplot, 점 그래프는 sns.scatterplot이에요."],
    ["data=df_entry", "어느 표의 기록으로 그릴지 정해요."],
    ["x='출입시'", "가로축에 놓을 칸이에요."],
  ],
});
[["시간대별 막대그래프", "몇 건씩 있는지 막대로 봐요"], ["상자 그림", "보통 범위와 튀는 값을 봐요"], ["점 그래프", "기록마다 점 하나씩 찍어요"]]
  .forEach(([word, meaning], j) => { REPORT.cards[j].word = word; REPORT.cards[j].meaning = meaning; });
