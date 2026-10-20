// 앱 전역 상태 — 저장소를 구독해 화면이 항상 최신 데이터를 보도록 함
import { db } from './store.js?v=0.1.45';
import { DEFAULT_TEAM, DEFAULT_FORMAT, KNOWN_ALIASES } from './config.js?v=0.1.45';
import { byName } from './util.js?v=0.1.45';

export const S = {
  team: { ...DEFAULT_TEAM },
  members: [],
  matchdays: [],
  games: [],
  ready: false,
  operator: sessionStorage.getItem('teamapp:op') === '1',
  captainToken: null,
  auth: null,     // 로그인한 회원 { pid, key, ver }
  authset: {},    // 회원별 비밀번호 등록 여부 (운영 회원 관리용)
  msync: null,    // 회원 시트 마지막 반영 정보 (meta/memberSheet)
  sel: null,      // 운영 > 경기 메뉴에서 고른 경기일
  step: null,     // 운영 > 경기 메뉴에서 고른 단계
};
// 이 기기에서 운영모드 PIN을 한 번이라도 맞혔으면 오른쪽 위에 운영모드 버튼을 보여 줌 (WD_FUTSAL과 같은 방식)
export const opDevice = () => localStorage.getItem('teamapp:opdev') === '1';

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let raf = 0;
const emit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => listeners.forEach((f) => f())); };

// 운영진에게만 필요한 구독 (비밀번호 등록 현황 · 회원 시트 반영 기록) — 회원 기기는 읽지 않아 사용량을 줄임
let opSubs = null;
function syncOps(on) {
  if (on && !opSubs) {
    opSubs = [
      db.watchCol('authset', (list) => { S.authset = Object.fromEntries(list.map((d) => [d.id, d])); emit(); }),
      db.watchDoc('meta/memberSheet', (d) => { S.msync = d; emit(); }),
    ];
  } else if (!on && opSubs) { opSubs.forEach((u) => typeof u === 'function' && u()); opSubs = null; S.authset = {}; }
}
export function startSync() {
  syncOps(S.operator);
  db.watchDoc('meta/team', (d) => {
    S.team = { ...DEFAULT_TEAM, ...(d || {}), format: { ...DEFAULT_FORMAT, ...(d?.format || {}) },
      legacySheet: { ...DEFAULT_TEAM.legacySheet, ...(d?.legacySheet || {}) } };
    applySampleFilter(); emit();
  });
  db.watchCol('members', (list) => {
    S.members = list.map((m) => (KNOWN_ALIASES[m.name] ? { ...m, aliases: [...new Set([...(m.aliases || []), ...KNOWN_ALIASES[m.name]])] } : m)).sort(byName);
    S.ready = true; emit();
  });
  db.watchCol('matchdays', (list) => {
    S.allMatchdays = list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    applySampleFilter(); emit();
  });
  db.watchCol('games', (list) => { S.games = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); emit(); });
}

// 베타 테스트 샘플 경기(md.sample): 운영모드이거나 '이 기기에서 샘플 보기'를 켠 기기에서만 보임. 기록·출석·회차에는 들어가지 않음
export const samplesOnDevice = () => { try { return localStorage.getItem('teamapp:samples') === '1'; } catch { return false; } };
export const samplesVisible = () => S.operator || localStorage.getItem('teamapp:sandbox') === '1' || samplesOnDevice();
export function applySampleFilter() {
  const all = S.allMatchdays || [];
  S.matchdays = samplesVisible() ? all : all.filter((m) => !m.sample);
}
export function setSamplesOnDevice(on) { try { on ? localStorage.setItem('teamapp:samples', '1') : localStorage.removeItem('teamapp:samples'); } catch {} applySampleFilter(); emit(); }

export function setOperator(on) {
  S.operator = on; applySampleFilter(); syncOps(on);
  if (on) { sessionStorage.setItem('teamapp:op', '1'); localStorage.setItem('teamapp:opdev', '1'); }
  else sessionStorage.removeItem('teamapp:op');
  emit();
}
export const refresh = emit;

// 이 기기의 "내 이름" (로그인 없이 이름 선택 방식)
// 이 기기의 "나" = 로그인한 회원 (카페 닉네임 + 비밀번호)
export const me = {
  get id() { return S.auth?.pid || ''; },
  set() { location.hash = '#/login'; },
};
export const go = (path) => { location.hash = '#/' + path; };
export const mdPath = (id) => 'matchdays/' + id;

// ── 조회 도우미 ──
export const memberById = (id) => S.members.find((m) => m.id === id);
export function nameOf(id, md) {
  const m = memberById(id);
  if (m) return m.name;
  const g = md?.guests?.[id];
  return g ? `${g.name}(게)` : '(알 수 없음)';
}
// 진행 중인 경기일: 완료되지 않은 것 중 가장 이른 날짜, 없으면 가장 최근
export function currentMatchday() {
  const live = S.matchdays.filter((m) => m.status !== 'played' && !m.cancelled).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return live[0] || S.matchdays[0] || null;
}
export const matchdayById = (id) => S.matchdays.find((m) => m.id === id);

const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
// 끝난 경기일 (기록이 있는 것), 최근 순
export const playedDays = () => S.matchdays.filter((m) => !m.cancelled && S.games.some((g) => g.matchdayId === m.id && g.done))
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
// 다음 경기: 오늘 이후의 끝나지 않은 경기일 중 가장 빠른 것
export function nextMatchday() {
  const t = todayStr();
  const up = S.matchdays.filter((m) => m.status !== 'played' && !m.cancelled && (m.date || '') >= t).sort((a, b) => !!a.sample - !!b.sample || a.date.localeCompare(b.date));
  return up[0] || S.matchdays.filter((m) => m.status !== 'played' && !m.cancelled).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
}
// 이 기기가 주장 링크로 들어온 진행 중 드래프트
export function captainMatchday() {
  // 로그인한 회원이 주장이거나, 주장 링크로 들어온 기기
  const pid = S.auth?.pid;
  if (!pid && !S.captainToken) return null;
  return S.matchdays.find((m) => !m.cancelled && (m.captains || []).some((c) => (pid && (c.id === pid || (c.co || []).includes(pid))) || (S.captainToken && c.token === S.captainToken)) && ['captains', 'drafting'].includes(m.status)) || null;
}
export const today = todayStr;

// 경기 취소 — 일정에는 남기고 "취소"로 표시
export const statusLabel = (md, STATUS) => (md?.cancelled ? '경기 취소' : STATUS[md?.status]?.label || '');
// 앞으로 있을 경기 중 취소된 것 (홈 안내용)
export const upcomingCancelled = () => S.matchdays.filter((m) => m.cancelled && (m.date || '') >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
