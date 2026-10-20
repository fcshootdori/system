// 앱 전역 상태 — 저장소를 구독해 화면이 항상 최신 데이터를 보도록 함
import { db } from './store.js';
import { DEFAULT_TEAM, DEFAULT_FORMAT } from './config.js';
import { byName } from './util.js';

export const S = {
  team: { ...DEFAULT_TEAM },
  members: [],
  matchdays: [],
  games: [],
  ready: false,
  operator: sessionStorage.getItem('teamapp:op') === '1',
  captainToken: null,
  sel: null,      // 운영 > 경기 메뉴에서 고른 경기일
  step: null,     // 운영 > 경기 메뉴에서 고른 단계
};
// 이 기기에서 운영모드 PIN을 한 번이라도 맞혔으면 오른쪽 위에 운영모드 버튼을 보여 줌 (WD_FUTSAL과 같은 방식)
export const opDevice = () => localStorage.getItem('teamapp:opdev') === '1';

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let raf = 0;
const emit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => listeners.forEach((f) => f())); };

export function startSync() {
  db.watchDoc('meta/team', (d) => {
    S.team = { ...DEFAULT_TEAM, ...(d || {}), format: { ...DEFAULT_FORMAT, ...(d?.format || {}) },
      legacySheet: { ...DEFAULT_TEAM.legacySheet, ...(d?.legacySheet || {}) } };
    emit();
  });
  db.watchCol('members', (list) => { S.members = list.sort(byName); S.ready = true; emit(); });
  db.watchCol('matchdays', (list) => {
    S.matchdays = list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    emit();
  });
  db.watchCol('games', (list) => { S.games = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); emit(); });
}

export function setOperator(on) {
  S.operator = on;
  if (on) { sessionStorage.setItem('teamapp:op', '1'); localStorage.setItem('teamapp:opdev', '1'); }
  else sessionStorage.removeItem('teamapp:op');
  emit();
}
export const refresh = emit;

// 이 기기의 "내 이름" (로그인 없이 이름 선택 방식)
export const me = {
  get id() { return localStorage.getItem('teamapp:me') || ''; },
  set(id) { if (id) localStorage.setItem('teamapp:me', id); else localStorage.removeItem('teamapp:me'); emit(); },
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
  const live = S.matchdays.filter((m) => m.status !== 'played').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return live[0] || S.matchdays[0] || null;
}
export const matchdayById = (id) => S.matchdays.find((m) => m.id === id);

const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
// 끝난 경기일 (기록이 있는 것), 최근 순
export const playedDays = () => S.matchdays.filter((m) => S.games.some((g) => g.matchdayId === m.id && g.done))
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
// 다음 경기: 오늘 이후의 끝나지 않은 경기일 중 가장 빠른 것
export function nextMatchday() {
  const t = todayStr();
  const up = S.matchdays.filter((m) => m.status !== 'played' && (m.date || '') >= t).sort((a, b) => a.date.localeCompare(b.date));
  return up[0] || S.matchdays.filter((m) => m.status !== 'played').sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
}
// 이 기기가 주장 링크로 들어온 진행 중 드래프트
export function captainMatchday() {
  if (!S.captainToken) return null;
  return S.matchdays.find((m) => (m.captains || []).some((c) => c.token === S.captainToken) && ['captains', 'drafting'].includes(m.status)) || null;
}
export const today = todayStr;
