// 경기 운영 규칙 — 경기 방식, 신청 순서, 드래프트 순번, 대진, 결과, 개인 기록
//  승률계산기 시트와 같은 규칙: 승률 = 승 ÷ (승+패), 승점 = 승×3 + 무
import { S, memberById, matchdayById } from './state.js';
import { DEFAULT_FORMAT } from './config.js';

// ── 경기 방식: 팀 기본값 + 경기일별 변경값 ──
export function fmtOf(md) {
  const f = { ...DEFAULT_FORMAT, ...(S.team.format || {}), ...(md?.format || {}) };
  f.teams = Math.max(2, Number(f.teams) || 2);
  f.rounds = Math.max(1, Number(f.rounds) || 1);
  f.minPlayers = Number(f.minPlayers) || 0;
  f.capacity = Number(f.capacity) || 0;
  if (f.teams !== 2 && f.scoring === 'sum') f.scoring = 'each'; // 합산은 2팀일 때만
  return f;
}

// ── 신청 ──  md.apps = { [memberId]: { at, source } }
export function applicants(md) {
  const cap = fmtOf(md).capacity;
  return Object.entries(md?.apps || {})
    .map(([id, a]) => ({ id, ...a }))
    .filter((a) => !a.pending)                // 운영진 협의 대기는 승인 전까지 명단에서 제외
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .map((a, i) => ({ ...a, wait: cap > 0 && i >= cap, no: i + 1 }));
}
export const confirmed = (md) => applicants(md).filter((a) => !a.wait);
export const pendingApps = (md) => Object.entries(md?.apps || {}).map(([id, a]) => ({ id, ...a })).filter((a) => a.pending)
  .sort((a, b) => (a.at || 0) - (b.at || 0));
// 카페 댓글 구역(예: 준찬팀·지진희팀)별 참가자
export function appGroups(md) {
  const g = new Map();
  (md?.groupOrder || []).forEach((t) => g.set(t, []));
  confirmed(md).forEach((a) => { if (!a.group) return; if (!g.has(a.group)) g.set(a.group, []); g.get(a.group).push(a.id); });
  [...g].forEach(([k, v]) => { if (!v.length) g.delete(k); });
  return g;
}

// ── 드래프트 ──
export function pickSequence(nTeams, nPicks, mode = 'snake') {
  const seq = [];
  for (let k = 0; k < nPicks; k++) {
    const round = Math.floor(k / nTeams), pos = k % nTeams;
    seq.push(mode === 'snake' && round % 2 === 1 ? nTeams - 1 - pos : pos);
  }
  return seq;
}
export function draftPool(md) {
  const caps = new Set((md.captains || []).map((c) => c.id));
  return confirmed(md).map((a) => a.id).filter((id) => !caps.has(id));
}
export function draftState(md) {
  const n = (md.captains || []).length;
  const pool = draftPool(md);
  const picks = md.picks || [];
  const picked = new Set(picks.map((p) => p.id));
  const remaining = pool.filter((id) => !picked.has(id));
  const seq = pickSequence(n, pool.length, fmtOf(md).draft);
  const turn = remaining.length && n ? seq[picks.length] : null;
  return { n, pool, picks, remaining, seq, turn, done: n > 0 && remaining.length === 0 };
}
export function rosters(md) {
  if (md?.teams?.length) return md.teams.map((t) => t.members || []);
  return (md?.captains || []).map((c, i) => [c.id, ...(md.picks || []).filter((p) => p.team === i).map((p) => p.id)]);
}
export function teamColor(md, i) {
  if (md?.teams?.[i]?.color) return md.teams[i].color;
  const f = fmtOf(md);
  if (f.teamMode === 'fixed') return f.fixedColors?.[i] || null;
  return md?.captains?.[i]?.color || null;
}

// ── 대진 (원형 방식, 홀수 팀은 쉬는 팀 포함) ──
export function schedule(nTeams, rounds = 1) {
  const t = [...Array(nTeams).keys()];
  if (nTeams % 2) t.push(-1);
  const m = t.length, base = [];
  let arr = [...t];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i], b = arr[m - 1 - i];
      if (a >= 0 && b >= 0) base.push([Math.min(a, b), Math.max(a, b)]);
    }
    arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
  }
  const out = [];
  for (let r = 0; r < rounds; r++) base.forEach(([a, b]) => out.push({ round: r + 1, a, b }));
  return out;
}

const gamesOf = (mdId) => S.games.filter((g) => g.matchdayId === mdId);

// 결과 단위(경기) 목록: 합산 방식이면 경기일 전체가 1경기, 아니면 라운드마다 1경기
export function resultUnits(md, games = gamesOf(md.id)) {
  const done = games.filter((g) => g.done);
  if (fmtOf(md).scoring === 'sum') {
    if (!done.length) return [];
    const tot = [0, 0];
    done.forEach((g) => { tot[g.a] += g.sa; tot[g.b] += g.sb; });
    return [{ a: 0, b: 1, sa: tot[0], sb: tot[1] }];
  }
  return done.map((g) => ({ a: g.a, b: g.b, sa: g.sa, sb: g.sb }));
}
// 합산 방식 최종 스코어 (진행 중인 라운드 포함)
export function totals(md, games = gamesOf(md.id)) {
  const tot = Array(rosters(md).length).fill(0);
  games.forEach((g) => { tot[g.a] += g.sa || 0; tot[g.b] += g.sb || 0; });
  return tot;
}

// ── 경기일 순위 ──
export function dayStandings(md, games = gamesOf(md.id)) {
  const n = rosters(md).length;
  const rows = [...Array(n)].map((_, i) => ({ team: i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  resultUnits(md, games).forEach((g) => {
    const A = rows[g.a], B = rows[g.b];
    if (!A || !B) return;
    A.p++; B.p++; A.gf += g.sa; A.ga += g.sb; B.gf += g.sb; B.ga += g.sa;
    if (g.sa > g.sb) { A.w++; B.l++; A.pts += 3; }
    else if (g.sa < g.sb) { B.w++; A.l++; B.pts += 3; }
    else { A.d++; B.d++; A.pts++; B.pts++; }
  });
  return rows.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}

// ── 개인 기록 ──
export function winRate(r) {
  const mode = S.team.winRate || 'wl';
  if (mode === 'wl') return r.w + r.l ? r.w / (r.w + r.l) : null;
  const tot = r.w + r.d + r.l;
  if (!tot) return null;
  return mode === 'point' ? (r.w + r.d * 0.5) / tot : r.w / tot;
}
export const pct = (v) => (v == null ? '-' : (v * 100).toFixed(2) + '%'); // 승률계산기와 같은 소수 둘째 자리
export const RATE_TEXT = {
  wl: '승률 = 승 ÷ (승+패), 무승부 제외', win: '승률 = 승 ÷ 경기', point: '승률 = (승 + 무×0.5) ÷ 경기',
};

export function allStats() {
  const map = new Map();
  const row = (id) => {
    if (!map.has(id)) map.set(id, { id, days: 0, w: 0, d: 0, l: 0, goals: 0, og: 0, mom: 0, late: 0, history: [] });
    return map.get(id);
  };
  S.members.forEach((m) => row(m.id));
  const isMember = (id) => !String(id).startsWith('g_') && memberById(id);

  const byDay = new Map();
  S.games.filter((g) => g.done).forEach((g) => {
    if (!byDay.has(g.matchdayId)) byDay.set(g.matchdayId, []);
    byDay.get(g.matchdayId).push(g);
  });
  byDay.forEach((games, mdId) => {
    const md = matchdayById(mdId);
    if (!md || md.cancelled) return;
    const ros = rosters(md);
    const day = new Map(); // 이 경기일 개인 기록
    const rec = (id) => { if (!day.has(id)) day.set(id, { w: 0, d: 0, l: 0, goals: 0, og: 0 }); return day.get(id); };
    ros.forEach((ids, ti) => ids.forEach((id) => { if (isMember(id)) rec(id).team = ti; }));
    resultUnits(md, games).forEach((u) => {
      [[u.a, u.sa, u.sb], [u.b, u.sb, u.sa]].forEach(([ti, mine, theirs]) => {
        (ros[ti] || []).forEach((id) => {
          if (!isMember(id)) return;
          rec(id)[mine > theirs ? 'w' : mine < theirs ? 'l' : 'd']++;
        });
      });
    });
    games.forEach((g) => {
      Object.entries(g.goals || {}).forEach(([id, n]) => { if (isMember(id)) rec(id).goals += n; });
      Object.entries(g.og || {}).forEach(([id, n]) => { if (isMember(id)) rec(id).og += n; });
    });
    const moms = new Set(md.mom || []), late = md.late || {};
    day.forEach((d, id) => {
      const r = row(id);
      r.days++; r.w += d.w; r.d += d.d; r.l += d.l; r.goals += d.goals; r.og += d.og;
      if (moms.has(id)) r.mom++;
      if (late[id]) r.late++;
      r.history.push({ mdId, date: md.date, ...d, mom: moms.has(id), late: !!late[id] });
    });
  });

  return [...map.values()]
    .filter((r) => memberById(r.id))
    .map((r) => ({ ...r, name: memberById(r.id).name, games: r.w + r.d + r.l, rate: winRate(r), pts: r.w * 3 + r.d,
      history: r.history.sort((a, b) => (b.date || '').localeCompare(a.date || '')) }));
}

// ── 회차 ──
//  · 경기 하나에 회차를 넣으면(기준 회차) 그 앞뒤 경기는 날짜 순서대로 자동으로 매겨짐
//  · 취소된 경기와 "회차 제외" 경기(설날 같은 이벤트 경기)는 회차에 들어가지 않음
//  · 승률계산기에서 가져온 경기는 시트의 Game_id(718, 719 …)를 기준 회차로 씀 (숫자가 아니면 제외)
const sheetNo = (m) => (m.sheetGameId != null && /^\d+$/.test(String(m.sheetGameId)) ? +m.sheetGameId : null);
export const explicitNo = (m) => (m.no != null && m.no !== '' && Number.isFinite(+m.no) ? +m.no : sheetNo(m));
export const countsForNo = (m) => !m.cancelled && !m.noExclude && !(m.source === 'sheet' && sheetNo(m) == null && m.no == null);

export function matchNumbers(extra) {
  const list = [...S.matchdays, ...(extra ? [extra] : [])]
    .filter((m) => m.date && countsForNo(m))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const out = new Map();
  let last = null;
  list.forEach((m, i) => {
    const e = explicitNo(m);
    if (e != null) { last = { no: e, i }; out.set(m.id, { no: e, auto: false }); }
    else if (last) out.set(m.id, { no: last.no + (i - last.i), auto: true });
  });
  let next = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i], e = explicitNo(m);
    if (e != null) next = { no: e, i };
    else if (!out.has(m.id) && next) out.set(m.id, { no: next.no - (next.i - i), auto: true });
  }
  return out;
}
export const matchNo = (md) => (md ? matchNumbers().get(md.id)?.no ?? null : null);
export const noLabel = (md) => { const n = matchNo(md); return n != null ? `${n}회` : ''; };
