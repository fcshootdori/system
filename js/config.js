// ─────────────────────────────────────────────────────────────
//  슛도리 (SHOOTDORI) 앱 기본 설정
//  - FIREBASE 값을 비워 두면 "데모 모드"(이 브라우저에만 저장)로 동작합니다.
//  - Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 받은 값을 붙여넣으면
//    모든 회원이 같은 데이터를 실시간으로 공유합니다.
//  - 팀 이름·엠블럼·경기 방식은 앱의 [설정] 화면에서 바꾸며, 여기 값은 처음 기본값입니다.
//    경기 방식은 경기일마다 따로 바꿀 수도 있습니다 (경기일 수정 화면).
// ─────────────────────────────────────────────────────────────
export const APP_NAME = 'SHOOTDORI';
export const APP_VERSION = '0.1.5';

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
  teamMode: 'fixed',           // fixed: 팀 색 고정 / choose: 드래프트 후 주장이 색 선택
  fixedColors: ['pink', 'blue', 'yellow', 'green'], // fixed일 때 1번·2번… 주장 팀 색
  minPlayers: 26,              // 최소 인원 (모자라면 홈·신청 화면에 표시)
  capacity: 0,                 // 최대 정원 (0 = 제한 없음, 넘으면 대기)
  draft: 'snake',              // snake: 1-2-2-1… / round: 1-2-1-2…
};

export const DEFAULT_TEAM = {
  name: '슛도리',
  emblem: '',                  // 설정 화면에서 업로드 (dataURL, 256px로 축소 저장)
  primary: '#1e3a8a',
  operatorPin: '0000',         // 운영모드 PIN — 설정 화면에서 반드시 변경
  format: DEFAULT_FORMAT,
  winRate: 'wl',               // wl: 승÷(승+패) [승률계산기와 동일] · win: 승÷경기 · point: (승+무×0.5)÷경기
  cafeUrl: '',
  cafeImport: true,            // 카페 댓글로 참석 받기 (정식 서비스 전 임시 기능 — 설정에서 끄면 앱 신청만 사용)
  legacySheet: { id: '1A6L2YeHQslEo9s5Pxg13xTupShrQodrysk8IZ1hckbQ' }, // 승률계산기
};

export const TEAM_COLORS = [
  { key: 'pink',   label: '핑크',   hex: '#ec4899', text: '#ffffff' },
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
