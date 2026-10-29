// 경기 기록 데이터 — 경기기록시스템(승률계산기 웹앱)과 같은 규칙으로 시즌 기록을 만듦
//  · 경기 = 경기일 하나 (5라운드 합산 1경기). 핑크(A) vs 블루(B)
//  · 승점 = 승×3 + 무, 승률 = 승 ÷ (승+패) (무승부 제외)
//  · 승률·득점·MOM 순위는 RANK_MIN 경기 이상 출전한 회원끼리, 승점·출전 순위는 출전한 회원 전체
import { S, memberById, nameOf } from './state.js?v=0.1.85';
import { rosters, resultUnits, totals, teamColor, teamName, fmtOf } from './domain.js?v=0.1.85';
import { mergedRecords } from './record-sheet.js?v=0.1.85';

export const RANK_MIN = 15;
export const TEAM = { A: '핑크', B: '블루' };
export const RES = { W: '승', D: '무', L: '패' };
const pct = (w, l) => (w + l ? w / (w + l) : 0);
export const pctTxt = (v) => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
export const ko = (a, b) => String(a).localeCompare(String(b), 'ko');

export const METRIC = {
  pts: { t: '승점', unit: '점', icon: 'trophy', fmt: (p) => p.pts, tb: ['pts', 'wr', 'gp'], award: '승점 1위', all: true },
  wr: { t: '승률', unit: '', icon: 'pct', fmt: (p) => pctTxt(p.wr), tb: ['wr', 'pts', 'gp'], award: '승률 1위' },
  g: { t: '득점', unit: '골', icon: 'ball', fmt: (p) => p.g, tb: ['g', 'gp', 'pts'], award: '득점왕' },
  mom: { t: 'MOM', unit: '회', icon: 'star', fmt: (p) => p.mom, tb: ['mom', 'pts', 'g'], award: 'MOM 최다' },
  gp: { t: '출전', unit: '경기', icon: 'calendar', fmt: (p) => p.gp, tb: ['gp', 'pts', 'g'], award: '최다 출전', all: true },
};

// 팀 칸 → A(핑크)/B(블루): 색으로, 색이 없으면 순서로
function sides(md) {
  const c = [0, 1].map((i) => teamColor(md, i));
  if (c[0] === 'blue' || c[1] === 'pink') return ['B', 'A'];
  return ['A', 'B'];
}

// 기록에 들어가는 경기일 (샘플·취소 제외, 끝난 라운드가 있는 2팀 경기)
//  끝난 경기 기록은 통합 시트에서, 아직 시트에 없는 경기(진행 중·방금 끝남)는 Firebase에서 (record-sheet.js)
function appDays() {
  const sbx = localStorage.getItem('teamapp:sandbox') === '1';   // 데모 체험판에서는 체험 경기 결과도 기록에 넣어 확인
  const done = new Set(S.fbGames.filter((g) => g.done).map((g) => g.matchdayId));
  return (S.allMatchdays || S.matchdays).filter((m) => (!m.sample || sbx) && !m.cancelled && rosters(m).length >= 2 && done.has(m.id));
}
const recs = () => mergedRecords(appDays);
export function recordDays() {
  const { days, gamesOf } = recs();
  return days.filter((m) => gamesOf(m.id).some((g) => g.done))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
}
export const fromSheet = () => recs().sheet;
export const seasons = () => [...new Set(recordDays().map((m) => (m.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();

let cache = { key: '', db: null };
export function buildDB(season) {
  const { gamesOf } = recs();
  const days = recordDays().filter((m) => !season || (m.date || '').startsWith(season));
  const key = season + '|' + days.map((m) => m.id + (m.mom || []).join('') + Object.keys(m.late || {}).join('') + rosters(m).flat().join('')
    + gamesOf(m.id).reduce((s, g) => s + '/' + (g.sa || 0) + ':' + (g.sb || 0) + (g.done ? 'd' : '') + Object.entries(g.goals || {}).join() + Object.entries(g.og || {}).join(), '')).join(',') + '|' + S.members.length;
  if (cache.key === key) return cache.db;

  const games = [], mp = [];
  const byGame = new Map();
  days.forEach((md, idx) => {
    const gs = gamesOf(md.id);
    const done = gs.filter((g) => g.done);
    const sd = sides(md), ros = rosters(md);
    const t = totals(md, done);
    const sc = { A: 0, B: 0 }; sc[sd[0]] = t[0] || 0; sc[sd[1]] = t[1] || 0;
    const win = sc.A > sc.B ? 'A' : sc.A < sc.B ? 'B' : 'D';
    const rounds = done.slice().sort((x, y) => (x.round || 0) - (y.round || 0) || (x.order || 0) - (y.order || 0)).map((g) => {
      const r = { round: g.round, A: 0, B: 0, goals: { A: [], B: [] } };
      r[sd[g.a]] = g.sa || 0; r[sd[g.b]] = g.sb || 0;
      Object.entries(g.goals || {}).forEach(([id, n]) => { const ti = ros.findIndex((x) => x.includes(id)); if (ti >= 0) r.goals[sd[ti]].push([id, n]); });
      Object.entries(g.og || {}).forEach(([id, n]) => { const ti = ros.findIndex((x) => x.includes(id)); if (ti >= 0) r.goals[sd[1 - ti]].push([id, n, 'og']); });
      return r;
    });
    const g = { id: md.id, md, date: md.date, a: sc.A, b: sc.B, win, idx, rounds, sheet: md.source === 'sheet', names: { [sd[0]]: teamName(md, 0), [sd[1]]: teamName(md, 1) } };
    games.push(g);
    // 선수별: 라운드 합산 단위(units)로 승·무·패 — 라운드마다 별도 경기 방식이면 라운드마다 셈
    const units = resultUnits(md, done);
    const goals = {}, og = {};
    done.forEach((x) => { Object.entries(x.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; }); Object.entries(x.og || {}).forEach(([id, n]) => { og[id] = (og[id] || 0) + n; }); });
    const moms = new Set(md.mom || []), late = md.late || {};
    const list = [];
    ros.forEach((ids, ti) => ids.forEach((id) => {
      if (list.some((x) => x.id === id)) return;
      const team = sd[ti] || (ti ? 'B' : 'A');
      const u = { w: 0, d: 0, l: 0 };
      units.forEach((x) => { const mine = x.a === ti ? x.sa : x.b === ti ? x.sb : null; if (mine == null) return; const th = x.a === ti ? x.sb : x.sa; u[mine > th ? 'w' : mine < th ? 'l' : 'd']++; });
      const res = win === 'D' ? 'D' : win === team ? 'W' : 'L';
      const e = { gid: md.id, id, name: nameOf(id, md), guest: !memberById(id), team, goals: goals[id] || 0, og: og[id] || 0, mom: moms.has(id), late: late[id] ? 1 : 0, res, u, g };
      list.push(e); mp.push(e);
    }));
    byGame.set(md.id, list);
  });
  const gById = new Map(games.map((g) => [g.id, g]));

  const m = new Map();
  mp.filter((e) => !e.guest).forEach((e) => {
    const s = m.get(e.id) || { id: e.id, name: memberById(e.id)?.name || e.name, gp: 0, g: 0, og: 0, mom: 0, late: 0, w: 0, d: 0, l: 0 };
    s.gp += e.u.w + e.u.d + e.u.l; s.w += e.u.w; s.d += e.u.d; s.l += e.u.l;
    s.g += e.goals; s.og += e.og; s.mom += e.mom ? 1 : 0; s.late += e.late;
    m.set(e.id, s);
  });
  const stats = [...m.values()].map((s) => ({ ...s, pts: s.w * 3 + s.d, wr: pct(s.w, s.l) }));
  const players = stats.filter((s) => s.gp > 0);
  const ranked = players.filter((s) => s.gp >= RANK_MIN);
  const byId = new Map(stats.map((s) => [s.id, s]));
  const ranks = {};
  for (const k of Object.keys(METRIC)) {
    const sorted = [...(METRIC[k].all ? players : ranked)].sort((x, y) => y[k] - x[k]);
    const r = new Map(); let prev = null, rank = 0;
    sorted.forEach((p, i) => { if (p[k] !== prev) { rank = i + 1; prev = p[k]; } r.set(p.id, rank); });
    ranks[k] = r;
  }
  const avg = (k, L = players) => (L.length ? L.reduce((s, p) => s + p[k], 0) / L.length : 0);
  const max = (k) => Math.max(1, ...players.map((p) => p[k]));
  const agg = {
    avg: { gp: avg('gp'), g: avg('g'), mom: avg('mom'), pts: avg('pts'), wr: avg('wr', ranked) },
    max: { gp: max('gp'), g: max('g'), mom: max('mom'), pts: max('pts'), wr: 1 },
  };
  const db = { games, gById, byGame, mp, stats, players, ranked, byId, ranks, agg, season };
  cache = { key, db };
  return db;
}

export function sortedBy(key, list) {
  const tb = METRIC[key].tb;
  return [...list].sort((x, y) => { for (const k of tb) { if (y[k] !== x[k]) return y[k] - x[k]; } return ko(x.name, y.name); });
}
export const scoring = (md) => fmtOf(md).scoring;
