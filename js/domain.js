// 경기 운영 규칙 — 경기 방식, 신청 순서, 드래프트 순번, 대진, 결과, 개인 기록
//  승률계산기 시트와 같은 규칙: 승률 = 승 ÷ (승+패), 승점 = 승×3 + 무
import { S, memberById, matchdayById } from './state.js?v=0.1.74';
import { DEFAULT_FORMAT, TEAM_COLORS, EVENT_SEEDS } from './config.js?v=0.1.74';

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

// ── 신청 마감 ──  경기일 전 목요일 0시(한국 시간)에 자동 마감 (최소 인원을 채워도 그때까지 계속 받음)
//  운영진이 마감 시각 뒤에 다시 열면 md.reopened = true → 자동 마감하지 않음
export function closeDate(md) {
  if (!md?.date || fmtOf(md).closeRule === 'manual') return '';
  const d = new Date(md.date + 'T00:00:00Z');
  if (isNaN(d)) return '';
  const back = ((d.getUTCDay() - 4 + 7) % 7) || 7;   // 경기일 직전 목요일 (경기일이 목요일이면 한 주 전)
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
export const closeTime = (md) => { const c = closeDate(md); return c ? Date.parse(c + 'T00:00:00+09:00') : 0; };
export const closePassed = (md, now = Date.now()) => { const t = closeTime(md); return !!t && now >= t; };
// 지금 신청을 받는 중인지
export const isOpen = (md) => !!md && md.status === 'open' && !md.cancelled && !(closePassed(md) && !md.reopened);
// 마감 안내 문구: "10월 22일 (목) 0시 마감"
export function closeLabel(md) {
  const c = closeDate(md);
  if (!c) return '';
  const d = new Date(c + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (목) 0시 마감`;
}

// ── 신청 ──  md.apps = { [memberId]: { at, source } }
export function applicants(md) {
  const cap = fmtOf(md).capacity;
  if (md?.source === 'sheet') // 시트 기록: 신청 내역이 없으니 출전 선수로 대신
    return rosters(md).flat().map((id, i) => ({ id, at: i, source: 'sheet', wait: false, no: i + 1 }));
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
  const caps = new Set((md.captains || []).flatMap((c) => [c.id, ...(c.co || [])]));   // 공동 주장도 제외
  return confirmed(md).map((a) => a.id).filter((id) => !caps.has(id));
}
// 지명 순서: 우선순위 추첨 결과(md.order = [1순위 팀, 2순위 팀])로 1-2-2-1-1-2-2-1 … (스네이크)
export function draftState(md) {
  const n = (md.captains || []).length;
  const pool = draftPool(md);
  const picks = md.picks || [];
  const picked = new Set(picks.map((p) => p.id));
  const remaining = pool.filter((id) => !picked.has(id));
  const order = md.order?.length === n ? md.order : [...Array(n).keys()];
  const seq = pickSequence(n, pool.length, fmtOf(md).draft).map((p) => order[p]);
  const turn = remaining.length && n ? seq[picks.length] : null;
  return { n, pool, picks, remaining, seq, order, turn, done: n > 0 && remaining.length === 0 };
}
// 드래프트 단계: 주장 → 팀 색 선택 → 우선순위 추첨 → 선수 선택 → (모두 배치) → 팀 확정
export function draftPhase(md) {
  if (!md) return 'captains';
  if (['teams', 'played'].includes(md.status)) return 'done';
  const caps = md.captains || [];
  if (!caps.length || (md.status === 'captains' && !md.draftStarted)) return 'captains';
  if (fmtOf(md).teamMode !== 'fixed' && caps.some((c) => !c.color)) return 'color';
  if (!(md.order?.length === caps.length) && !(md.picks || []).length) return 'order';
  return draftState(md).remaining.length ? 'pick' : 'allin';
}
export function rosters(md) {
  if (md?.teams?.length) return md.teams.map((t) => t.members || []);
  return (md?.captains || []).map((c, i) => [c.id, ...(c.co || []), ...(md.picks || []).filter((p) => p.team === i).map((p) => p.id)]);
}
export function teamColor(md, i) {
  if (md?.teams?.[i]?.color) return md.teams[i].color;
  const ev = eventTeams(md);
  if (ev?.[i]?.color) return ev[i].color;
  if (md?.teamColors?.[i]) return md.teamColors[i];
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

// ── MOM: 경기가 끝나면 승리 팀 주장이 자기 팀에서 1명, 무승부면 두 팀 주장이 각자 자기 팀에서 1명 ──
//  md.momPick = { [팀 번호]: { id, by, at } }  ·  md.mom = 뽑힌 선수들 (기록·시트가 쓰는 값)
//  2팀은 라운드 점수 합계로 승패(기록 계산과 같음), 3팀 이상은 승점 1위(동률이면 모두)
export function momTeams(md, games = gamesOf(md.id)) {
  const n = rosters(md).length;
  const done = games.filter((g) => g.done);
  if (n < 2 || !done.length) return [];
  if (n === 2) { const t = totals(md, done); return t[0] > t[1] ? [0] : t[0] < t[1] ? [1] : [0, 1]; }
  const st = dayStandings(md, done), top = st[0];
  return st.filter((r) => r.pts === top.pts && (r.gf - r.ga) === (top.gf - top.ga)).map((r) => r.team).sort();
}
// 그 팀 MOM이 정해졌는지 (예전처럼 운영진이 md.mom에 넣은 경우도 정해진 걸로)
export const momPicked = (md, ti) => md.momPick?.[ti]?.id || (md.mom || []).find((id) => (rosters(md)[ti] || []).includes(id)) || null;
export const momPending = (md, games) => md.status === 'played' && !md.cancelled && momTeams(md, games).some((ti) => !momPicked(md, ti));
// 이 사람이 MOM을 뽑을 수 있는 팀: 그 팀 주장(공동 주장 포함), 운영진은 모든 팀
export function momTeamsFor(md, pid, operator = false, games) {
  if (md.status !== 'played' || md.fromSheet) return [];
  return momTeams(md, games).filter((ti) => operator || (pid && captainIds(md, ti).includes(pid)));
}
// 저장할 값 (db.tx 안에서): 팀 ti의 MOM을 id로 → md.mom은 MOM 팀 순서대로 다시 만듦
export function applyMomPick(cur, ti, id, by, teams, ros) {
  const pick = { ...(cur.momPick || {}) };
  if (id) pick[ti] = { id, by: by || '', at: Date.now() }; else delete pick[ti];
  const keep = (cur.mom || []).filter((x) => !teams.some((t) => (ros[t] || []).includes(x)));   // MOM 팀이 아닌 예전 값은 그대로
  cur.momPick = pick;
  cur.mom = [...new Set([...teams.map((t) => pick[t]?.id).filter(Boolean), ...keep])];
  return cur;
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
    if (!md || md.cancelled || md.sample) return;   // 샘플 경기는 기록에 넣지 않음
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
export const countsForNo = (m) => !m.cancelled && !m.noExclude && !m.sample && !(m.source === 'sheet' && sheetNo(m) == null && m.no == null);

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
  // 취소된 경기: 회차에서 빠지되, 그 회차 번호는 다음 경기가 이어받으므로 같은 번호로 표시 (예: 750회 취소 → 다음 경기도 750회)
  const all = [...S.matchdays, ...(extra ? [extra] : [])].filter((m) => m.date).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  all.forEach((m, i) => {
    if (!m.cancelled || m.noExclude) return;
    const nxt = all.slice(i + 1).find((x) => out.has(x.id));
    if (nxt) { out.set(m.id, { no: out.get(nxt.id).no, auto: true, cancelled: true }); return; }
    const prv = all.slice(0, i).reverse().find((x) => out.has(x.id) && !out.get(x.id).cancelled);
    if (prv) out.set(m.id, { no: out.get(prv.id).no + 1, auto: true, cancelled: true });
  });
  return out;
}
export const matchNo = (md) => (md ? matchNumbers().get(md.id)?.no ?? null : null);
export const noLabel = (md) => { if (md?.sample) return '샘플'; const n = matchNo(md); return n != null ? `${n}회` : ''; };

// 구역 이름별 팀 색: 예전에 정한 색 → 없으면 머리 댓글 순서(첫 구역 = 1번 팀 색)
export function defaultSectionColors(titles, md) {
  const fixed = fmtOf(md).fixedColors || ['pink', 'blue'];
  const memo = S.team.sectionColors || {};
  const used = new Set();
  return titles.map((t, i) => {
    const ev = eventTeams(md), k = ev ? ev.findIndex((x) => x.name === t) : -1;
    const byLabel = (k >= 0 ? ev[k].color : null) || TEAM_COLORS.find((x) => x.label === t)?.key;
    let c = byLabel && !used.has(byLabel) ? byLabel : memo[t] && !used.has(memo[t]) ? memo[t] : fixed.find((x) => !used.has(x)) || fixed[i % fixed.length];
    used.add(c); return c;
  });
}

// ── 이벤트 경기 · 팀 이름 ──
//  이벤트 경기: 경기 등록 때 두 팀(이름·색)을 미리 정하고, 회원은 팀을 골라(또는 운영진이 미리 넣어 둔 팀에서) 참석·불참
//  일반 경기: 신청 마감 → 주장 → 운영진이 팀 이름 입력(기본 "주장닉네임팀") → 드래프트에서 색 결정
export function eventTeams(md) {
  if (!md || md.event === false) return null;
  if (md.event && md.eventTeams?.length) return md.eventTeams;
  if (md.event === undefined) { const n = matchNo(md), sd = n != null ? EVENT_SEEDS[n] : null; if (sd && sd.date === md.date) return sd.teams; }
  return null;
}
// 이벤트 방식: 'teams' = 팀원까지 미리 정함(주장·드래프트 없음) / 'captains' = 주장만 미리 정함(신청은 일반, 주장 단계 없이 드래프트)
export const eventMode = (md) => (eventTeams(md) ? (md.eventMode === 'captains' ? 'captains' : 'teams') : null);
export const teamEvent = (md) => (eventMode(md) === 'teams' ? eventTeams(md) : null);
export const capEvent = (md) => (eventMode(md) === 'captains' ? eventTeams(md) : null);
// 이벤트 팀에 미리 정한 주장들 (여러 명 가능 — 첫 번째가 대표)
export const evCaps = (t) => (t?.captains?.length ? t.captains : t?.captain ? [t.captain] : []);
// 팀 i의 주장: 드래프트 주장 → 이벤트 경기에 미리 정한 주장
export const captainOf = (md, i) => (md?.teams?.length ? captainIds(md, i)[0] : null) || md?.captains?.[i]?.id || evCaps(eventTeams(md)?.[i])[0] || null;
// 팀 i의 주장 전원 (대표 + 공동 주장)
//  팀이 정해지기 전(주장·드래프트 단계): 주장 목록 순서 = 팀 순서
//  팀이 정해진 뒤: 순서와 상관없이 '그 팀 명단에 들어 있는 주장' — 구역대로 팀 만들기·밸런스 조정·자리 바꾸기로
//   주장 목록 순서와 팀 순서가 어긋나도 주장 권한(포지션·MOM)이 따라감
//  주장이 따로 없으면(카페 구역대로 만든 팀) 팀 이름 "○○팀"의 ○○ 회원
const capGroups = (md) => [...(md?.captains || []).filter((c) => c?.id).map((c) => [c.id, ...(c.co || [])]), ...(eventTeams(md) || []).map(evCaps).filter((a) => a.length)];
const nk = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
export const captainIds = (md, i) => {
  if (!md?.teams?.length) { const c = md?.captains?.[i]; return c ? [c.id, ...(c.co || [])] : evCaps(eventTeams(md)?.[i]); }
  const ros = md.teams[i]?.members || [];
  const ids = [...new Set(capGroups(md).flatMap((g) => (g.some((id) => ros.includes(id)) ? g.filter((id) => ros.includes(id)) : [])))];
  if (ids.length) return ids;
  const m = String(teamName(md, i) || '').match(/^(.+?)\s*팀$/);
  if (m && nk(m[1])) {
    const hit = ros.find((id) => { const mem = memberById(id); return mem && [mem.name, ...(mem.aliases || [])].some((a) => nk(a) === nk(m[1])); });
    if (hit) return [hit];
  }
  return [];
};
export const teamName = (md, i) => md?.teamNames?.[i] || eventTeams(md)?.[i]?.name || null;

// 참석·불참·협의 정리 (+ 이벤트 경기면 팀별로)
export function signupView(md) {
  const ins = confirmed(md), wait = applicants(md).filter((a) => a.wait), pend = pendingApps(md);
  const outs = Object.entries(md?.declines || {}).map(([id, d]) => ({ id, ...d }));
  const ev = teamEvent(md);   // 팀원까지 미리 정하는 이벤트 경기만 팀별로
  if (!ev) return { ev: null, ins, wait, pend, outs };
  const answered = new Set([...ins, ...wait, ...pend, ...outs].map((x) => x.id));
  const sides = ev.map((t, i) => ({
    i, name: t.name, color: t.color,
    ins: ins.filter((a) => a.team === i), outs: outs.filter((d) => d.team === i),
    noAnswer: (t.members || []).filter((id) => !answered.has(id)),
  }));
  const assigned = (id) => ev.findIndex((t) => (t.members || []).includes(id));
  // 팀을 고르지 않고 참석·불참한 사람은 미리 지정된 팀이 있으면 그 팀으로
  ins.filter((a) => a.team == null).forEach((a) => { const k = assigned(a.id); if (k >= 0) sides[k].ins.push(a); });
  outs.filter((d) => d.team == null).forEach((d) => { const k = assigned(d.id); if (k >= 0) sides[k].outs.push(d); });
  const placed = new Set(sides.flatMap((s) => s.ins.map((a) => a.id)));
  return { ev, sides, ins, wait, pend, outs: outs.filter((d) => d.team == null && assigned(d.id) < 0), noTeam: ins.filter((a) => !placed.has(a.id)) };
}
// 이벤트 경기: 참석자로 팀 확정 (팀 없는 참석자는 인원이 적은 팀으로)
export function eventTeamsToTeams(md) {
  const v = signupView(md);
  const teams = v.sides.map((s) => ({ color: s.color, members: s.ins.map((a) => a.id) }));
  v.noTeam.forEach((a) => teams.reduce((x, y) => (y.members.length < x.members.length ? y : x)).members.push(a.id));
  // 미리 정한 주장은 팀 맨 앞에
  teams.forEach((t, i) => { const cs = evCaps(eventTeams(md)?.[i]).filter((c) => t.members.includes(c)); if (cs.length) t.members = [...cs, ...t.members.filter((x) => !cs.includes(x))]; });
  return teams;
}
