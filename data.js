// ============================================================
// data.js  — 담당: B (콘텐츠 & 연출)
//
// ▶ 모든 스테이지가 "같은 데이터"를 본다. 표는 2개:
//     출입표(df_entry, 82행) + 배달표(df_delivery, 38행) = 120행
// ▶ 구성: RESIDENTS(주민 명부) + ENTRY_LOGS / DELIVERY_LOGS(기록) → 합쳐서 표 생성
// ▶ 각 행에는 그 주민의 정보(호수·동물종류·주민등록번호·나이·학생여부·입주날짜·운동시설)가 붙는다.
//    주민 이름 열은 없다. (RESIDENTS.key 는 이 파일 안에서만 쓰는 식별용)
// ▶ 열 이름은 pandas 에서 그대로 입력하므로 공백 없이 짧게 지었다.
//
// 판정 기준 (전 층 공통)
//   answer "next"   = 데이터가 영상 속 현상을 설명함 (정상)
//   answer "report" = 데이터가 영상 속 현상을 설명하지 못함 (진짜 이상)
//
// 행 추가/삭제는 ENTRY_LOGS / DELIVERY_LOGS 에서만. 층별 근거는 FLOORS.evidence(로그 id)로 연결.
// ============================================================

// ---------- 1) 열 이름 (pandas 열 이름 = 화면에 보이는 열 이름) ----------
const RESIDENT_COLUMNS = ["호수", "동물종류", "주민등록번호", "나이", "학생여부", "입주날짜", "운동"];
const ENTRY_COLUMNS    = ["출입시간", "출입시", "빛감지", "소리", ...RESIDENT_COLUMNS];   // 출입시: 출입시간의 시(0~23, 숫자), 빛감지: On/Off, 소리: 0~10
const DELIVERY_COLUMNS = ["배달도착시간", "배달제품", ...RESIDENT_COLUMNS];

// ---------- 2) 주민 명부 (22명) ----------
// 주민등록번호 뒷자리는 가렸다(******). 나이 = 2026 - 출생연도
const RESIDENTS = [
  // 1층
  { key: "밤톨", room: "101", animal: "햄스터",     rrn: "250614-3******", age: 1, student: "Y", moveIn: "2026-09-10", gym: "N" },
  { key: "콩이", room: "101", animal: "햄스터",     rrn: "250921-4******", age: 1, student: "Y", moveIn: "2026-09-10", gym: "N" },
  { key: "하양", room: "102", animal: "토끼",       rrn: "230305-4******", age: 3, student: "N", moveIn: "2024-03-15", gym: "Y" },
  { key: "도토", room: "103", animal: "다람쥐",     rrn: "240718-3******", age: 2, student: "Y", moveIn: "2025-02-01", gym: "Y" },
  // 2층
  { key: "꽥이", room: "201", animal: "오리",       rrn: "220211-3******", age: 4, student: "N", moveIn: "2023-05-20", gym: "N" },
  { key: "코코", room: "202", animal: "게코도마뱀", rrn: "230829-4******", age: 3, student: "Y", moveIn: "2024-10-01", gym: "Y" },
  { key: "구리", room: "203", animal: "너구리",     rrn: "200123-3******", age: 6, student: "N", moveIn: "2021-04-12", gym: "N" },
  // 3층
  { key: "여리", room: "301", animal: "여우",       rrn: "210930-4******", age: 5, student: "N", moveIn: "2022-06-18", gym: "Y" },
  { key: "나비", room: "302", animal: "고양이",     rrn: "220415-4******", age: 4, student: "N", moveIn: "2023-09-03", gym: "N" },
  { key: "둥이", room: "303", animal: "수달",       rrn: "240612-3******", age: 2, student: "Y", moveIn: "2025-08-25", gym: "Y" },
  // 4층
  { key: "뚝이", room: "401", animal: "오소리",     rrn: "190507-3******", age: 7, student: "N", moveIn: "2020-01-10", gym: "N" },
  { key: "달이", room: "402", animal: "토끼",       rrn: "230101-4******", age: 3, student: "Y", moveIn: "2024-07-07", gym: "N" },
  { key: "루돌", room: "403", animal: "사슴",       rrn: "220822-3******", age: 4, student: "N", moveIn: "2026-11-07", gym: "Y" },
  // 5층
  { key: "가시", room: "501", animal: "고슴도치",   rrn: "241105-3******", age: 2, student: "Y", moveIn: "2025-04-04", gym: "N" },
  { key: "뒤뚱", room: "502", animal: "펭귄",       rrn: "200318-3******", age: 6, student: "N", moveIn: "2021-12-01", gym: "Y" },
  { key: "복면", room: "503", animal: "라쿤",       rrn: "230710-4******", age: 3, student: "N", moveIn: "2024-05-30", gym: "N" },
  // 6층 (601~603만 입주. 604 이상은 빈 호실)
  { key: "메메", room: "601", animal: "염소",       rrn: "180214-3******", age: 8, student: "N", moveIn: "2019-03-03", gym: "N" },
  { key: "몽실", room: "602", animal: "양",         rrn: "210412-4******", age: 5, student: "N", moveIn: "2022-10-10", gym: "Y" },
  { key: "쪼르", room: "603", animal: "다람쥐",     rrn: "250830-3******", age: 1, student: "Y", moveIn: "2026-01-15", gym: "N" },
  // 7층
  { key: "깡총", room: "701", animal: "토끼",       rrn: "240220-4******", age: 2, student: "Y", moveIn: "2025-06-06", gym: "Y" },
  { key: "바라", room: "702", animal: "카피바라",   rrn: "200925-3******", age: 6, student: "N", moveIn: "2021-08-18", gym: "N" },
  { key: "파카", room: "703", animal: "알파카",     rrn: "220630-4******", age: 4, student: "N", moveIn: "2023-02-27", gym: "Y" },
];

// ---------- 3) 기록 ----------
// who: 주민 key (없으면 null = 미등록 출입). 미등록이어도 room 은 직접 적을 수 있음(예: 607).
// 출입 기록: entry / light / sound,  배달 기록: dTime / dItem
// id 는 화면에 안 보이고, 판정 후 근거 행을 노랗게 표시할 때만 쓴다.
const ENTRY_LOGS = [
  // ----- 각 층 판정 근거 + 방해용 행 (E01~E20) -----
  { id: "E01", who: "밤톨", entry: "11-08 23:10", light: "Off", sound: 2 },
  { id: "E02", who: "콩이", entry: "11-08 23:12", light: "Off", sound: 2 },
  { id: "E03", who: "코코", entry: "11-04 22:00", light: "Off", sound: 1 },
  { id: "E04", who: "코코", entry: "11-05 22:01", light: "Off", sound: 1 },
  { id: "E05", who: "코코", entry: "11-06 22:00", light: "Off", sound: 2 },
  { id: "E06", who: "코코", entry: "11-07 22:00", light: "Off", sound: 1 },
  { id: "E07", who: "코코", entry: "11-08 22:00", light: "Off", sound: 1 },
  { id: "E08", who: "나비", entry: "11-08 20:20", light: "Off", sound: 2 },
  { id: "E09", who: null, entry: "11-09 00:40", light: "Off", sound: 9 },
  { id: "E10", who: "가시", entry: "11-08 21:00", light: "On", sound: 2 },
  { id: "E11", who: null, room: "607", entry: "11-09 03:00", light: "Off", sound: 9 },   // ver8: 소리 3 → 9 (4층 00:40 과 같은 "소리 최대" 흔적)
  { id: "E12", who: "바라", entry: "11-09 01:30", light: "On", sound: 0 },    // ver8: 소리 2 → 0 (빛은 있는데 소리는 없음)
  { id: "E13", who: "구리", entry: "11-08 20:50", light: "On", sound: 2 },
  { id: "E14", who: "둥이", entry: "11-08 19:40", light: "On", sound: 3 },
  { id: "E15", who: "달이", entry: "11-07 21:30", light: "On", sound: 3 },
  { id: "E16", who: "깡총", entry: "11-06 20:30", light: "On", sound: 2 },
  { id: "E17", who: "복면", entry: "11-09 00:15", light: "Off", sound: 5 },
  { id: "E18", who: "쪼르", entry: "11-09 00:20", light: "Off", sound: 4 },
  { id: "E19", who: "하양", entry: "11-09 01:05", light: "Off", sound: 2 },
  { id: "E20", who: "도토", entry: "11-09 02:20", light: "Off", sound: 3 },
  // ----- 일반 기록 (정상 패턴) -----
  { id: "E44", who: "둥이", entry: "11-04 07:18", light: "Off", sound: 3 },
  { id: "E59", who: "뒤뚱", entry: "11-04 07:37", light: "Off", sound: 1 },
  { id: "E65", who: "메메", entry: "11-04 08:17", light: "Off", sound: 3 },
  { id: "E32", who: "꽥이", entry: "11-04 12:08", light: "Off", sound: 5 },
  { id: "E72", who: "쪼르", entry: "11-04 14:29", light: "Off", sound: 6 },
  { id: "E28", who: "도토", entry: "11-04 18:51", light: "Off", sound: 3 },
  { id: "E22", who: "하양", entry: "11-04 20:20", light: "Off", sound: 2 },
  { id: "E47", who: "뚝이", entry: "11-04 20:27", light: "Off", sound: 1 },
  { id: "E38", who: "여리", entry: "11-04 21:03", light: "Off", sound: 2 },
  { id: "E33", who: "구리", entry: "11-04 21:08", light: "Off", sound: 3 },
  { id: "E78", who: "바라", entry: "11-04 21:23", light: "Off", sound: 1 },
  { id: "E62", who: "복면", entry: "11-04 21:46", light: "Off", sound: 4 },
  { id: "E68", who: "몽실", entry: "11-04 22:31", light: "Off", sound: 3 },
  { id: "E50", who: "달이", entry: "11-04 22:43", light: "Off", sound: 5 },
  { id: "E80", who: "파카", entry: "11-04 23:33", light: "Off", sound: 2 },
  { id: "E73", who: "쪼르", entry: "11-05 14:10", light: "Off", sound: 6 },
  { id: "E23", who: "하양", entry: "11-05 18:05", light: "Off", sound: 2 },
  { id: "E42", who: "나비", entry: "11-05 18:58", light: "Off", sound: 2 },
  { id: "E27", who: "도토", entry: "11-05 19:31", light: "Off", sound: 2 },
  { id: "E61", who: "뒤뚱", entry: "11-05 20:02", light: "Off", sound: 2 },
  { id: "E58", who: "가시", entry: "11-05 20:12", light: "Off", sound: 3 },
  { id: "E30", who: "꽥이", entry: "11-05 20:13", light: "Off", sound: 4 },
  { id: "E36", who: "구리", entry: "11-05 21:15", light: "Off", sound: 2 },
  { id: "E48", who: "뚝이", entry: "11-05 21:24", light: "Off", sound: 2 },
  { id: "E63", who: "복면", entry: "11-05 22:06", light: "Off", sound: 3 },
  { id: "E81", who: "파카", entry: "11-05 22:12", light: "Off", sound: 4 },
  { id: "E40", who: "여리", entry: "11-05 22:28", light: "Off", sound: 3 },
  { id: "E69", who: "몽실", entry: "11-05 23:09", light: "Off", sound: 2 },
  { id: "E46", who: "둥이", entry: "11-05 23:20", light: "Off", sound: 2 },
  { id: "E34", who: "구리", entry: "11-06 08:41", light: "Off", sound: 1 },
  { id: "E41", who: "나비", entry: "11-06 19:45", light: "Off", sound: 3 },
  { id: "E29", who: "꽥이", entry: "11-06 19:52", light: "Off", sound: 3 },
  { id: "E39", who: "여리", entry: "11-06 21:02", light: "Off", sound: 4 },
  { id: "E76", who: "깡총", entry: "11-06 21:44", light: "Off", sound: 3 },
  { id: "E70", who: "몽실", entry: "11-06 22:08", light: "Off", sound: 2 },
  { id: "E26", who: "도토", entry: "11-06 22:25", light: "Off", sound: 2 },
  { id: "E66", who: "메메", entry: "11-06 22:42", light: "Off", sound: 1 },
  { id: "E45", who: "둥이", entry: "11-06 23:40", light: "Off", sound: 3 },
  { id: "E60", who: "뒤뚱", entry: "11-07 07:14", light: "Off", sound: 3 },
  { id: "E71", who: "쪼르", entry: "11-07 14:05", light: "Off", sound: 5 },
  { id: "E54", who: "루돌", entry: "11-07 18:17", light: "Off", sound: 3 },
  { id: "E77", who: "바라", entry: "11-07 19:04", light: "Off", sound: 1 },
  { id: "E25", who: "도토", entry: "11-07 19:46", light: "Off", sound: 1 },
  { id: "E21", who: "하양", entry: "11-07 20:57", light: "Off", sound: 3 },
  { id: "E75", who: "깡총", entry: "11-07 21:35", light: "Off", sound: 2 },
  { id: "E56", who: "가시", entry: "11-07 22:14", light: "Off", sound: 3 },
  { id: "E67", who: "메메", entry: "11-07 22:15", light: "Off", sound: 3 },
  { id: "E51", who: "달이", entry: "11-07 23:40", light: "Off", sound: 4 },
  { id: "E52", who: "달이", entry: "11-08 08:39", light: "Off", sound: 6 },
  { id: "E35", who: "구리", entry: "11-08 08:45", light: "Off", sound: 2 },
  { id: "E31", who: "꽥이", entry: "11-08 12:02", light: "Off", sound: 4 },
  { id: "E55", who: "루돌", entry: "11-08 17:12", light: "Off", sound: 3 },
  { id: "E53", who: "루돌", entry: "11-08 18:14", light: "Off", sound: 1 },
  { id: "E43", who: "나비", entry: "11-08 18:53", light: "Off", sound: 3 },
  { id: "E57", who: "가시", entry: "11-08 19:15", light: "Off", sound: 2 },
  { id: "E74", who: "깡총", entry: "11-08 20:39", light: "Off", sound: 3 },
  { id: "E24", who: "하양", entry: "11-08 20:45", light: "Off", sound: 2 },
  { id: "E64", who: "복면", entry: "11-08 21:14", light: "Off", sound: 5 },
  { id: "E49", who: "뚝이", entry: "11-08 21:19", light: "Off", sound: 3 },
  { id: "E37", who: "여리", entry: "11-08 21:26", light: "Off", sound: 4 },
  { id: "E79", who: "바라", entry: "11-08 22:42", light: "Off", sound: 3 },
  { id: "E82", who: "파카", entry: "11-08 23:37", light: "Off", sound: 4 },
];

const DELIVERY_LOGS = [
  // ----- 각 층 판정 근거 + 방해용 행 (D01~D10) -----
  { id: "D01", who: "나비", dTime: "11-08 20:05", dItem: "정육면체 유리 상자 (택배)" },
  { id: "D02", who: "뚝이", dTime: "11-08 18:00", dItem: "꿀 5kg" },
  { id: "D03", who: "가시", dTime: "11-08 20:30", dItem: "야광 페인트 (형광 초록) 3통" },
  { id: "D04", who: "구리", dTime: "11-08 20:40", dItem: "손전등 세트" },
  { id: "D05", who: "둥이", dTime: "11-08 19:20", dItem: "LED 무드등" },
  { id: "D06", who: "달이", dTime: "11-07 21:10", dItem: "캠핑 랜턴" },
  { id: "D07", who: "깡총", dTime: "11-06 20:10", dItem: "크리스마스 전구" },
  { id: "D08", who: "루돌", dTime: "11-07 15:00", dItem: "이삿짐 상자 12개" },
  { id: "D09", who: "코코", dTime: "11-08 15:30", dItem: "귀뚜라미 간식" },
  { id: "D10", who: "밤톨", dTime: "11-08 12:30", dItem: "해바라기씨 한 봉지" },
  // ----- 일반 배달 -----
  { id: "D13", who: "꽥이", dTime: "11-04 11:20", dItem: "개구리밥 한 포대" },
  { id: "D20", who: "가시", dTime: "11-05 09:51", dItem: "벌레 간식" },
  { id: "D26", who: "깡총", dTime: "11-05 10:04", dItem: "상추 박스" },
  { id: "D33", who: "나비", dTime: "11-05 13:57", dItem: "스크래처 패드" },
  { id: "D16", who: "나비", dTime: "11-05 14:28", dItem: "스크래처 패드" },
  { id: "D36", who: "달이", dTime: "11-05 15:01", dItem: "건초 한 포대" },
  { id: "D14", who: "구리", dTime: "11-05 17:53", dItem: "생선 통조림" },
  { id: "D37", who: "가시", dTime: "11-05 18:41", dItem: "사과 말랭이" },
  { id: "D18", who: "뚝이", dTime: "11-06 09:37", dItem: "지렁이 간식" },
  { id: "D38", who: "뒤뚱", dTime: "11-06 10:55", dItem: "얼음 틀" },
  { id: "D23", who: "메메", dTime: "11-06 11:38", dItem: "건초 한 포대" },
  { id: "D34", who: "둥이", dTime: "11-06 14:11", dItem: "물고기 간식" },
  { id: "D32", who: "여리", dTime: "11-06 19:24", dItem: "포도 한 송이" },
  { id: "D28", who: "하양", dTime: "11-07 09:28", dItem: "건초 한 포대" },
  { id: "D22", who: "복면", dTime: "11-07 12:01", dItem: "세척용 대야" },
  { id: "D12", who: "도토", dTime: "11-07 14:30", dItem: "도토리 한 봉지" },
  { id: "D25", who: "쪼르", dTime: "11-07 14:42", dItem: "호두 한 봉지" },
  { id: "D15", who: "여리", dTime: "11-07 15:00", dItem: "포도 한 송이" },
  { id: "D11", who: "하양", dTime: "11-07 16:15", dItem: "상추 박스" },
  { id: "D17", who: "둥이", dTime: "11-07 16:35", dItem: "조개 한 봉지" },
  { id: "D30", who: "꽥이", dTime: "11-08 10:39", dItem: "개구리밥 한 포대" },
  { id: "D21", who: "뒤뚱", dTime: "11-08 12:26", dItem: "생선 도시락" },
  { id: "D19", who: "달이", dTime: "11-08 13:47", dItem: "상추 박스" },
  { id: "D31", who: "구리", dTime: "11-08 14:10", dItem: "사과 박스" },
  { id: "D24", who: "몽실", dTime: "11-08 14:19", dItem: "양모 브러시" },
  { id: "D35", who: "뚝이", dTime: "11-08 15:10", dItem: "도토리 묵" },
  { id: "D29", who: "도토", dTime: "11-08 16:48", dItem: "땅콩 쿠키" },
  { id: "D27", who: "파카", dTime: "11-08 18:53", dItem: "건초 한 포대" },
  // ver8: 존재하지 않는 607호로 온 배달 (주민 정보 없음). 큰 미스터리의 보상 단서
  { id: "D99", who: null, room: "607", dTime: "11-08 23:30", dItem: "전신 거울" },
];

// ---------- 4) 로그 + 주민 정보를 합쳐서 표 만들기 ----------
function residentCells(l) {
  const r = RESIDENTS.find((x) => x.key === l.who) || null;
  return {
    호수: r ? r.room : l.room ?? null,
    동물종류: r ? r.animal : null,
    주민등록번호: r ? r.rrn : null,
    나이: r ? r.age : null,
    학생여부: r ? r.student : null,
    입주날짜: r ? r.moveIn : null,
    운동: r ? r.gym : null,          // 열 이름(RESIDENT_COLUMNS 의 "운동")과 같아야 표에 값이 나온다
  };
}

const ENTRY_ROWS = ENTRY_LOGS.map((l) => ({
  id: l.id,
  출입시간: l.entry,
  출입시: Number(l.entry.slice(6, 8)),      // "11-08 23:10" → 23 (그래프용 숫자 열)
  빛감지: l.light,
  소리: l.sound,
  ...residentCells(l),
})).sort((a, b) => (a.출입시간 < b.출입시간 ? -1 : a.출입시간 > b.출입시간 ? 1 : a.id < b.id ? -1 : 1));

const DELIVERY_ROWS = DELIVERY_LOGS.map((l) => ({
  id: l.id,
  배달도착시간: l.dTime,
  배달제품: l.dItem,
  ...residentCells(l),
})).sort((a, b) => (a.배달도착시간 < b.배달도착시간 ? -1 : a.배달도착시간 > b.배달도착시간 ? 1 : a.id < b.id ? -1 : 1));

// 게임/파이썬이 읽는 표 목록. varName = 플레이어가 입력창에 쓰는 변수 이름
const TABLES = [
  { key: "entry",    title: "출입표", varName: "df_entry",    columns: ENTRY_COLUMNS,    rows: ENTRY_ROWS },
  { key: "delivery", title: "배달표", varName: "df_delivery", columns: DELIVERY_COLUMNS, rows: DELIVERY_ROWS },
];

// ---------- 5) 스테이지(층) 정의 ----------
// evidence: 판정 후 하이라이트할 근거 행(로그 id, 출입표 E.. / 배달표 D..)
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
    evidence: ["E03", "E04", "E05", "E06", "E07"],
    explanation:
      "202호 게코는 운동시설 사용 Y이고, 5일 연속 밤 10시에 출입했어요. 소리도 늘 1~2로 조용해요. 매일 하는 습관(문워크 연습)이니 정상! → TO NEXT FLOOR",
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
      "배달표에 302호 정육면체 유리 상자가 20:05에 도착했고, 15분 뒤 출입표에 고양이가 출입했어요. 네모가 된 게 아니라 상자에 쏙 들어간 것! → TO NEXT FLOOR",
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
      "동물종류에 '곰'은 두 표 어디에도 없어요. 00:40 출입 행은 호수·동물종류·주민등록번호가 전부 NaN(빈 값)이고, 소리 9는 전체 최댓값이에요. 꿀은 401호(오소리) 배달분일 수 있어도 곰은 설명되지 않아요 → REPORT",
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
      "배달표에 501호 야광 페인트가 20:30에 도착했고, 21:00 고슴도치 출입과 함께 빛감지가 On이에요. 페인트를 칠한 고슴도치였을 뿐! → TO NEXT FLOOR",
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
      "6층 주민은 601~603호뿐인데, 03:00에 '607호' 출입 기록이 있고 동물종류 등 주민 정보가 전부 비어 있어요. 명단에 없는 호실이니 데이터가 설명하지 못해요 → REPORT",
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
      "01:30에 702호 카피바라의 출입 기록이 있고 빛감지도 On인데, 영상에는 아무도 없어요. 배달표엔 702호 기록이 없어서 빛을 설명해 줄 것도 없어요. 데이터는 '누군가 있었다'고 하는데 영상은 '없다'고 하니 불일치 → REPORT",
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
      "동물별 입주날짜를 보면 사슴(403호)만 2026-11-07로 가장 최근이에요. 같은 날 15:00에 '이삿짐 상자 12개'가 배달됐고 그 뒤로 사슴이 출입했어요. 낯선 건 이상해서가 아니라 어제 이사 온 새 이웃이라서! → TO NEXT FLOOR",
  },
];

// ---------- 6) 강좌 안내 (엔딩 화면) ----------
// name: K-MOOC 강좌명, url: 강좌 페이지 주소, blurb: 한 줄 소개(선택).
// 비워 두면 엔딩에 일반 문구와 K-MOOC 홈페이지 링크가 나온다.
const COURSE = { name: "데이터 과학의 EDA와 시각화", url: "https://www.kmooc.kr/view/course/detail/19993", blurb: "빈칸 카드로 맛본 이 분석을, 이제 직접 코드로 써 보세요. 파이썬을 처음 접해도 괜찮아요." };
