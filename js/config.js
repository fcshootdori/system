// ─────────────────────────────────────────────────────────────
//  슛도리 (SHOOTDORI) 앱 기본 설정
//  - FIREBASE 값을 비워 두면 "데모 모드"(이 브라우저에만 저장)로 동작합니다.
//  - Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 받은 값을 붙여넣으면
//    모든 회원이 같은 데이터를 실시간으로 공유합니다.
//  - 팀 이름·엠블럼·경기 방식은 앱의 [설정] 화면에서 바꾸며, 여기 값은 처음 기본값입니다.
//    경기 방식은 경기일마다 따로 바꿀 수도 있습니다 (경기일 수정 화면).
// ─────────────────────────────────────────────────────────────
export const APP_NAME = 'SHOOTDORI';
export const APP_VERSION = '0.1.32';

// Firebase 프로젝트: fcshootdori (웹 앱 설정값 — 공개되어도 되는 값이며, 보안은 Firestore 규칙으로 지킴)
export const FIREBASE = {
  apiKey: 'AIzaSyCIqUafpA6VmPXEThUlqNh0Ha_Bt27uGaw',
  authDomain: 'fcshootdori.firebaseapp.com',
  projectId: 'fcshootdori',
  storageBucket: 'fcshootdori.firebasestorage.app',
  messagingSenderId: '829286691076',
  appId: '1:829286691076:web:2b4b9d7fa5f5089bb1a051',
  measurementId: 'G-EV052CP0TG',
};

export const DEFAULT_FORMAT = {
  teams: 2,                    // 경기일 팀 수 (= 주장 수)
  rounds: 5,                   // 라운드 수 (2팀이면 핑크 vs 블루 5번)
  scoring: 'sum',              // sum: 라운드 점수 합산 = 경기일 1경기 / each: 라운드마다 별도 경기
  teamMode: 'choose',          // choose: 드래프트 때 주장이 팀 색 선택 / fixed: 주장 순서대로 고정
  fixedColors: ['pink', 'blue'], // 팀 색: 핑크·블루 (choose: 드래프트에서 운영진이 배정 / fixed: 1번·2번 순서대로)
  minPlayers: 26,              // 최소 인원 (모자라면 홈·신청 화면에 표시)
  capacity: 0,                 // 최대 정원 (0 = 제한 없음, 넘으면 대기) — 최소 인원을 채워도 신청은 계속 받음
  closeRule: 'thu',            // 신청 마감: 'thu' = 경기일 전 목요일 0시 자동 마감, 'manual' = 운영진이 직접
  draft: 'snake',              // snake: 1-2-2-1… / round: 1-2-1-2…
};

export const DEFAULT_TEAM = {
  name: '슛도리',
  emblem: 'assets/emblem.png', // 슛도리 엠블럼 (설정 화면에서 다른 이미지로 바꿀 수 있음)
  primary: '#171c61',          // 엠블럼 네이비
  operatorPin: '0000',         // 운영모드 PIN — 설정 화면에서 반드시 변경
  format: DEFAULT_FORMAT,
  winRate: 'wl',               // wl: 승÷(승+패) [승률계산기와 동일] · win: 승÷경기 · point: (승+무×0.5)÷경기
  cafeUrl: '',
  cafeImport: true,            // 카페 댓글로 참석 받기 (정식 서비스 전 임시 기능 — 설정에서 끄면 앱 신청만 사용)
  legacySheet: { id: '1A6L2YeHQslEo9s5Pxg13xTupShrQodrysk8IZ1hckbQ' }, // 승률계산기
};

// 이벤트 경기 (팀이 미리 정해져 있고, 팀원이 그 팀 안에서 참석·불참을 고르는 경기)
//  운영진이 경기 수정 화면에서 바꾸면 그 값이 우선이고, 여기 값은 처음 기본값
//  회차와 날짜가 둘 다 맞을 때만 적용 (다른 경기가 그 회차를 받게 돼도 잘못 적용되지 않도록)
export const EVENT_SEEDS = {
  748: { date: '2026-10-10', teams: [{ name: '지진희팀', color: 'pink' }, { name: '준찬팀', color: 'blue' }] }, // 748회 댓글·시트 비교로 확인
  749: { date: '2026-10-17', teams: [{ name: '지진희팀', color: 'pink' }, { name: '준찬팀', color: 'blue' }] }, // 팀 이름이 다르면 경기 수정에서 고치기
};

// 카페 닉네임 ↔ 승률계산기 이름이 다른 회원 (748회 댓글과 시트 명단을 비교해 확인)
//  회원 화면에서 별칭을 따로 넣지 않아도 카페 댓글·시트 가져오기에서 같은 사람으로 알아봄
export const KNOWN_ALIASES = {
  '싸비': ['Xabi'],
  '자나': ['자나자나자나'],
  '골넣고잠': ['골잠'],
};

export const TEAM_COLORS = [
  { key: 'pink',   label: '핑크',   hex: '#e11d48', text: '#ffffff' },   // 레드에 가까운 핑크
  { key: 'blue',   label: '블루',   hex: '#2563eb', text: '#ffffff' },
  { key: 'black',  label: '블랙',   hex: '#111827', text: '#ffffff' },
  { key: 'red',    label: '레드',   hex: '#dc2626', text: '#ffffff' },
  { key: 'white',  label: '화이트', hex: '#f8fafc', text: '#111827' },
  { key: 'yellow', label: '옐로우', hex: '#facc15', text: '#111827' },
  { key: 'green',  label: '그린',   hex: '#16a34a', text: '#ffffff' },
];

export const STATUS = {
  open:     { label: '신청 중',     step: 1 },
  closed:   { label: '신청 마감',   step: 2 },
  captains: { label: '주장 선정',   step: 3 },
  drafting: { label: '드래프트',    step: 4 },
  teams:    { label: '팀 확정',     step: 5 },
  played:   { label: '경기 완료',   step: 6 },
};
