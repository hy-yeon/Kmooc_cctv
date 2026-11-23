// ============================================================
// data.js  — 담당: B (콘텐츠 & 연출)
//
// ▶ 모든 스테이지가 "같은 데이터"를 본다. 표는 2개:
//     출입표(df_entry, 30행) + 택배장부(df_delivery, 20행)
// ▶ 구성: RESIDENTS(주민 10마리) + ENTRY_LOGS / DELIVERY_LOGS(기록) → 합쳐서 표 생성
// ▶ 출입표 열: 출입시간 · 빛감지 · 소리 · 호수 · 동물 · 주민등록번호
//   택배장부 열: 배달도착날짜 · 배달주문날짜 · 제품 · 호수 · 동물
// ▶ 열 이름은 고급 모드에서 그대로 입력하므로 공백 없이 지었다.
//
// 판정 기준 (전 층 공통)
//   answer "next"   = 데이터가 영상 속 현상을 설명함 (정상)
//   answer "report" = 데이터가 영상 속 현상을 설명하지 못함 (진짜 이상)
//
// 행 추가/삭제는 ENTRY_LOGS / DELIVERY_LOGS 에서만. 층별 근거는 FLOORS.evidence(로그 id)로 연결.
// ============================================================

// ---------- 1) 열 이름 (pandas 열 이름 = 화면에 보이는 열 이름) ----------
// 출입표: 빛감지 On/Off, 소리 0~10
const ENTRY_COLUMNS    = ["출입시간", "빛감지", "소리", "호수", "동물", "주민등록번호"];
const DELIVERY_COLUMNS = ["배달도착날짜", "배달주문날짜", "제품", "호수", "동물"];

// ---------- 2) 주민 명부 (10마리) ----------
// 주민등록번호 뒷자리는 가렸다(******). 101호 햄스터 두 마리는 번호가 달라서 서로 다른 주민이다.
const RESIDENTS = [
  { key: "밤톨", room: "101", animal: "햄스터",     rrn: "250614-3******" },
  { key: "콩이", room: "101", animal: "햄스터",     rrn: "250921-4******" },
  { key: "하양", room: "102", animal: "토끼",       rrn: "230305-4******" },
  { key: "코코", room: "202", animal: "게코도마뱀", rrn: "230829-4******" },
  { key: "나비", room: "302", animal: "고양이",     rrn: "220415-4******" },
  { key: "뚝이", room: "401", animal: "오소리",     rrn: "190507-3******" },
  { key: "루돌", room: "403", animal: "사슴",       rrn: "220822-3******" },   // 11-07 에 이사 왔다 (8층)
  { key: "가시", room: "501", animal: "고슴도치",   rrn: "241105-3******" },
  { key: "메메", room: "601", animal: "염소",       rrn: "180214-3******" },   // 6층은 601~603호뿐
  { key: "바라", room: "702", animal: "카피바라",   rrn: "200925-3******" },
];

// ---------- 3) 기록 ----------
// who: 주민 key (없으면 null = 미등록 출입). 미등록이어도 room 은 직접 적을 수 있음(예: 607).
// 출입 기록: entry / light / sound,  배달 기록: arrive(도착 날짜·시각) / order(주문 날짜) / item
// id 는 화면에 안 보인다. 층별 근거(FLOORS.evidence)를 가리킬 때 쓴다.
const ENTRY_LOGS = [
  // ----- 층별 판정 근거 -----
  { id: "E01", who: "밤톨", entry: "11-08 23:10", light: "Off", sound: 2 },   // 1층: 햄스터 출입은 이 2줄뿐
  { id: "E02", who: "콩이", entry: "11-08 23:12", light: "Off", sound: 2 },
  { id: "E03", who: "코코", entry: "11-06 22:00", light: "Off", sound: 1 },   // 2층: 매일 밤 10시, 늘 소리 1 (조용한 문워크 연습)
  { id: "E04", who: "코코", entry: "11-07 22:00", light: "Off", sound: 1 },
  { id: "E05", who: "코코", entry: "11-08 22:00", light: "Off", sound: 1 },
  { id: "E08", who: "나비", entry: "11-08 20:20", light: "Off", sound: 2 },   // 3층: 상자 도착 15분 뒤
  { id: "E09", who: null,   entry: "11-09 00:40", light: "Off", sound: 9 },   // 4층: 주민 정보 없음 + 소리 최대
  { id: "E10", who: "가시", entry: "11-08 21:00", light: "On",  sound: 2 },   // 5층: 야광 페인트
  { id: "E11", who: null, room: "607", entry: "11-09 03:00", light: "Off", sound: 9 },   // 6층: 없는 호실
  { id: "E12", who: "바라", entry: "11-09 01:30", light: "On",  sound: 0 },   // 7층: 빛은 있는데 소리는 없음
  { id: "E54", who: "루돌", entry: "11-07 18:17", light: "Off", sound: 3 },   // 8층: 사슴의 첫 출입 (이삿짐 도착 날)
  { id: "E55", who: "루돌", entry: "11-08 17:12", light: "Off", sound: 3 },
  { id: "E53", who: "루돌", entry: "11-08 18:14", light: "Off", sound: 1 },
  // ----- 방해용 · 일반 기록 -----
  { id: "E13", who: "뚝이", entry: "11-08 20:50", light: "On",  sound: 2 },   // 손전등 세트 (빛감지 On 이 다른 이유)
  { id: "E16", who: "하양", entry: "11-06 20:30", light: "On",  sound: 2 },   // 크리스마스 전구
  { id: "E18", who: "메메", entry: "11-09 00:20", light: "Off", sound: 4 },   // 늦은 밤이지만 주민
  { id: "E19", who: "하양", entry: "11-09 01:05", light: "Off", sound: 2 },
  { id: "E65", who: "메메", entry: "11-04 08:17", light: "Off", sound: 3 },
  { id: "E22", who: "하양", entry: "11-04 20:20", light: "Off", sound: 2 },
  { id: "E47", who: "뚝이", entry: "11-04 20:27", light: "Off", sound: 1 },
  { id: "E78", who: "바라", entry: "11-04 21:23", light: "Off", sound: 1 },
  { id: "E42", who: "나비", entry: "11-05 18:58", light: "Off", sound: 2 },
  { id: "E58", who: "가시", entry: "11-05 20:12", light: "Off", sound: 3 },
  { id: "E48", who: "뚝이", entry: "11-05 21:24", light: "Off", sound: 2 },
  { id: "E41", who: "나비", entry: "11-06 19:45", light: "Off", sound: 3 },
  { id: "E43", who: "나비", entry: "11-07 19:10", light: "Off", sound: 3 },
  { id: "E56", who: "가시", entry: "11-07 22:14", light: "Off", sound: 3 },
  { id: "E67", who: "메메", entry: "11-07 22:15", light: "Off", sound: 3 },
  { id: "E24", who: "하양", entry: "11-08 20:45", light: "Off", sound: 2 },
  { id: "E79", who: "바라", entry: "11-08 22:42", light: "Off", sound: 3 },
];

const DELIVERY_LOGS = [
  // ----- 층별 판정 근거 · 방해용 -----
  { id: "D01", who: "나비", arrive: "11-08 20:05", order: "11-06", item: "정육면체 유리 상자 (택배)" },   // 3층
  { id: "D02", who: "뚝이", arrive: "11-08 18:00", order: "11-07", item: "꿀 5kg" },                     // 4층: 꿀은 설명돼도 곰은 아니다
  { id: "D03", who: "가시", arrive: "11-08 20:30", order: "11-07", item: "야광 페인트 (형광 초록) 3통" }, // 5층
  { id: "D04", who: "뚝이", arrive: "11-08 20:40", order: "11-06", item: "손전등 세트" },
  { id: "D07", who: "하양", arrive: "11-06 20:10", order: "11-04", item: "크리스마스 전구" },
  { id: "D08", who: "루돌", arrive: "11-07 15:00", order: "11-05", item: "이삿짐 상자 12개" },           // 8층
  { id: "D09", who: "코코", arrive: "11-08 15:30", order: "11-06", item: "귀뚜라미 간식" },
  { id: "D10", who: "밤톨", arrive: "11-08 12:30", order: "11-07", item: "해바라기씨 한 봉지" },
  // ----- 일반 배달 -----
  { id: "D11", who: "밤톨", arrive: "11-04 13:00", order: "11-02", item: "톱밥 깔개" },
  { id: "D20", who: "가시", arrive: "11-05 09:51", order: "11-03", item: "벌레 간식" },
  { id: "D12", who: "코코", arrive: "11-05 11:00", order: "11-03", item: "귀뚜라미 간식" },
  { id: "D16", who: "나비", arrive: "11-05 14:28", order: "11-03", item: "스크래처 패드" },
  { id: "D37", who: "가시", arrive: "11-05 18:41", order: "11-04", item: "사과 말랭이" },
  { id: "D18", who: "뚝이", arrive: "11-06 09:37", order: "11-04", item: "지렁이 간식" },
  { id: "D23", who: "메메", arrive: "11-06 11:38", order: "11-04", item: "건초 한 포대" },
  { id: "D13", who: "바라", arrive: "11-07 12:00", order: "11-05", item: "수박 한 통" },
  { id: "D21", who: "하양", arrive: "11-07 16:15", order: "11-05", item: "상추 박스" },
  { id: "D24", who: "메메", arrive: "11-08 09:30", order: "11-06", item: "건초 한 포대" },
  { id: "D35", who: "뚝이", arrive: "11-08 15:10", order: "11-06", item: "도토리 묵" },
  // 존재하지 않는 607호로 온 배달 (주민 정보도, 주문 날짜도 없다). 큰 미스터리의 단서
  { id: "D99", who: null, room: "607", arrive: "11-08 23:30", order: null, item: "전신 거울" },
];

// ---------- 4) 로그 + 주민 정보를 합쳐서 표 만들기 ----------
// 화면에 안 보이는 칸: id, who(주민 key, 책 페이지를 나눌 때 쓴다), 출입시(그래프용 숫자)
function residentOf(l) { return RESIDENTS.find((x) => x.key === l.who) || null; }

const ENTRY_ROWS = ENTRY_LOGS.map((l) => {
  const r = residentOf(l);
  return {
    id: l.id, who: l.who,
    출입시간: l.entry, 빛감지: l.light, 소리: l.sound,
    호수: r ? r.room : l.room ?? null, 동물: r ? r.animal : null, 주민등록번호: r ? r.rrn : null,
    출입시: Number(l.entry.slice(6, 8)),
  };
}).sort((a, b) => (a.출입시간 < b.출입시간 ? -1 : a.출입시간 > b.출입시간 ? 1 : a.id < b.id ? -1 : 1));

const DELIVERY_ROWS = DELIVERY_LOGS.map((l) => {
  const r = residentOf(l);
  return {
    id: l.id, who: l.who,
    배달도착날짜: l.arrive, 배달주문날짜: l.order ?? null, 제품: l.item,
    호수: r ? r.room : l.room ?? null, 동물: r ? r.animal : null,
  };
}).sort((a, b) => (a.배달도착날짜 < b.배달도착날짜 ? -1 : a.배달도착날짜 > b.배달도착날짜 ? 1 : a.id < b.id ? -1 : 1));

// 게임/고급 모드가 읽는 표 목록. varName = 고급 모드에서 쓰는 변수 이름
const TABLES = [
  { key: "entry",    title: "출입표",   varName: "df_entry",    columns: ENTRY_COLUMNS,    rows: ENTRY_ROWS },
  { key: "delivery", title: "택배장부", varName: "df_delivery", columns: DELIVERY_COLUMNS, rows: DELIVERY_ROWS },
];

// ---------- 5) 스테이지(층) 정의 ----------
// evidence: 판정 후 하이라이트할 근거 행(로그 id, 출입표 E.. / 택배장부 D..)
const FLOORS = [
  {
    floor: 1,
    anomaly: "무한증식 햄스터",
    cctvScene: "hamster_clone",
    cctvTime: "11-08 23:10",
    cctvCaption: "복도에 햄스터가 끝없이 늘어나고 있다...!",
    answer: "report",
    evidence: ["E01", "E02"],
    explanation:
      "101호 햄스터는 주민등록번호가 서로 다른 2마리고, 출입표의 햄스터 출입도 23:10·23:12 두 건뿐이에요. 그런데 영상엔 수십 마리가 보여요. 데이터와 영상이 맞지 않으니 → REPORT",
  },
  {
    floor: 2,
    anomaly: "문워크 게코도마뱀",
    cctvScene: "gecko_moonwalk",
    cctvTime: "11-08 22:00",
    cctvCaption: "게코도마뱀이 뒤로 미끄러지듯 걷고 있다.",
    answer: "next",
    evidence: ["E03", "E04", "E05"],
    explanation:
      "202호 게코는 3일 연속 밤 10시에 출입했고, 소리는 늘 1로 아주 조용해요. 미끄러지듯 조용히 걷는 문워크 연습 습관이니 정상! → TO NEXT FLOOR",
  },
  {
    floor: 3,
    anomaly: "네모가 된 고양이",
    cctvScene: "square_cat",
    cctvTime: "11-08 20:20",
    cctvCaption: "고양이가 완벽한 네모 모양으로 앉아 있다.",
    answer: "next",
    evidence: ["D01", "E08"],
    explanation:
      "택배장부에 302호 정육면체 유리 상자가 20:05에 도착했고, 15분 뒤 출입표에 고양이가 출입했어요. 네모가 된 게 아니라 상자에 쏙 들어간 것! → TO NEXT FLOOR",
  },
  {
    floor: 4,
    anomaly: "꿀 퍼먹는 곰",
    cctvScene: "honey_bear",
    cctvTime: "11-09 00:40",
    cctvCaption: "복도 한가운데서 곰이 꿀단지를 퍼먹고 있다.",
    answer: "report",
    evidence: ["E09", "D02"],
    explanation:
      "동물에 '곰'은 두 표 어디에도 없어요. 00:40 출입 행은 호수·동물·주민등록번호가 전부 NaN(빈 값)이고, 소리 9는 전체 최댓값이에요. 꿀은 401호(오소리) 배달분일 수 있어도 곰은 설명되지 않아요 → REPORT",
  },
  {
    floor: 5,
    anomaly: "네온색으로 발광하는 고슴도치",
    cctvScene: "neon_hedgehog",
    cctvTime: "11-08 21:00",
    cctvCaption: "고슴도치가 형광 초록빛으로 번쩍이고 있다.",
    answer: "next",
    evidence: ["D03", "E10"],
    explanation:
      "택배장부에 501호 야광 페인트가 20:30에 도착했고, 21:00 고슴도치 출입과 함께 빛감지가 On이에요. 페인트를 칠한 고슴도치였을 뿐! → TO NEXT FLOOR",
  },
  {
    floor: 6,
    anomaly: "작은 문으로 들어가는 코알라",
    cctvScene: "koala_small_door",
    cctvTime: "11-09 03:00",
    cctvCaption: "복도 구석의 아주 작은 문으로 코알라가 들어간다.",
    answer: "report",
    evidence: ["E11"],
    explanation:
      "6층 주민은 601~603호뿐인데, 03:00에 '607호' 출입 기록이 있고 동물 등 주민 정보가 전부 비어 있어요. 명단에 없는 호실이니 데이터가 설명하지 못해요 → REPORT",
  },
  {
    floor: 7,
    anomaly: "텅 빈 복도",
    cctvScene: "empty_hall",
    cctvTime: "11-09 01:30",
    cctvCaption: "아무도 없다. ...정말로?",
    answer: "report",
    evidence: ["E12"],
    explanation:
      "01:30에 702호 카피바라의 출입 기록이 있고 빛감지도 On인데, 영상에는 아무도 없어요. 택배장부엔 702호 기록이 없어서 빛을 설명해 줄 것도 없어요. 데이터는 '누군가 있었다'고 하는데 영상은 '없다'고 하니 불일치 → REPORT",
  },
  {
    floor: 8,
    place: "택배 보관실",              // 모든 층 주민의 택배가 모이는 층
    anomaly: "상자를 끝없이 쌓는 낯선 사슴",
    cctvScene: "deer_boxes",
    cctvTime: "11-08 18:14",
    cctvCaption: "처음 보는 사슴이 상자를 끝없이 쌓아 올리고 있다.",
    answer: "next",
    evidence: ["D08", "E54", "E55", "E53"],
    explanation:
      "사슴(403호)의 가장 이른 출입은 11-07 18:17이고, 같은 날 15:00에 '이삿짐 상자 12개'가 도착했어요. 그 전에는 사슴의 기록이 없어요. 낯선 건 이상해서가 아니라 11-07에 이사 온 새 이웃이라서! → TO NEXT FLOOR",
  },
];

// ---------- 6) 강좌 안내 (엔딩 화면) ----------
// name: K-MOOC 강좌명, url: 강좌 페이지 주소, blurb: 한 줄 소개(선택).
// 비워 두면 엔딩에 일반 문구와 K-MOOC 홈페이지 링크가 나온다.
const COURSE = { name: "데이터 과학의 EDA와 시각화", url: "https://www.kmooc.kr/view/course/detail/19993", blurb: "빈칸 카드로 맛본 이 분석을, 이제 직접 코드로 써 보세요. 파이썬을 처음 접해도 괜찮아요." };
