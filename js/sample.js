// 베타 테스트용 샘플 경기 — 신청부터 경기 결과까지 원하는 단계로 바로 만들어 기능을 시험
//  · md.sample = true: 운영모드(또는 '이 기기에서 샘플 보기')에서만 보이고, 개인 기록·출석·회차에는 들어가지 않음
//  · 참가자는 실제 활동 회원 중에서 무작위로 (회원 목록을 늘리지 않음, 모자라면 게스트로)
//  · 한 번에 지우기: 샘플 경기와 그 경기 기록만 삭제
import { S, mdPath } from './state.js?v=0.1.68';
import { db, newId } from './store.js?v=0.1.68';
import { draftState, rosters, teamColor, eventTeamsToTeams, closeTime } from './domain.js?v=0.1.68';
import { shuffle, randomToken, todayISO } from './util.js?v=0.1.68';

export const SAMPLE_STAGES = [
  ['open', '신청 중', '회원이 참석·불참을 고르는 단계 (신청 마감 전 날짜)'],
  ['closed', '신청 마감', '참가자 26명 · 이제 주장을 정할 차례'],
  ['drafting', '드래프트 중', '주장·팀 색·우선순위가 정해지고 선수 절반쯤 뽑힌 상태'],
  ['teams', '팀 확정', '팀이 정해져 경기를 시작할 차례'],
  ['played', '경기 결과까지', '5라운드 점수·득점·MOM·지각까지 입력된 상태'],
];
export const SAMPLE_KINDS = [
  ['normal', '일반 경기'],
  ['captains', '이벤트 · 주장만 미리 정함'],
  ['teams', '이벤트 · 팀원까지 미리 정함'],
];

const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
// 신청 중 샘플: 신청 마감(경기 전 목요일 0시)이 아직 안 지난 가장 가까운 토요일
function openSaturday() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let k = 1; k < 30; k++) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 6) continue;
    const date = iso(d);
    if (closeTime({ date }) > Date.now() + 3600e3) return date;
  }
  return iso(d);
}
const rnd = (n) => Math.floor(Math.random() * n);

export async function createSample({ stage = 'open', kind = 'normal', players = 26, me = null, meAs = 'captain' } = {}) {
  const now = Date.now();
  const id = 'sample_' + newId();
  const real = shuffle(S.members.filter((m) => m.active !== false && m.status !== 'left' && m.inSheet !== false));
  let ids = real.slice(0, players + 4).map((m) => m.id);
  if (me && S.members.some((m) => m.id === me)) {   // 체험판: 체험하는 회원을 1팀 주장(captain) 또는 일반 참가자(player)로
    const rest = ids.filter((x) => x !== me);
    ids = (meAs === 'captain' ? [me, ...rest] : [rest[0], rest[1], me, ...rest.slice(2)]).slice(0, players + 4);
  }
  const guests = {};
  while (ids.length < players + 4) { const g = 'g_s' + ids.length; guests[g] = { name: `게스트${ids.length + 1}`, host: '' }; ids.push(g); }
  const goIn = ids.slice(0, players), goOut = ids.slice(players, players + 2), goPend = ids.slice(players + 2, players + 3);
  const md = {
    sample: true, date: stage === 'played' ? todayISO() : openSaturday(), time: '07:00~09:00', venue: '샘플 구장', note: '베타 테스트용 샘플 경기예요',
    status: 'open', format: null, apps: {}, declines: {}, guests, captains: [], picks: [], teams: [], mom: [], late: {}, createdAt: now,
  };
  goIn.forEach((x, i) => { md.apps[x] = { at: now - (players - i) * 240000, source: i % 3 ? 'cafe' : 'app' }; });
  goPend.forEach((x) => { md.apps[x] = { at: now - 60000, source: 'app', pending: true }; });
  goOut.forEach((x) => { md.declines[x] = { at: now - 90000 }; });

  // 이벤트 경기
  if (kind !== 'normal') {
    md.event = true; md.eventMode = kind;
    md.eventTeams = [{ name: '샘플A팀', color: 'pink', captain: goIn[0], members: [] }, { name: '샘플B팀', color: 'blue', captain: goIn[1], members: [] }];
    md.teamNames = md.eventTeams.map((t) => t.name);
    if (kind === 'teams') {   // 팀원까지 미리 정한 경기: 두 팀 명단을 넣어 두고 회원은 참석·불참만
      md.eventTeams.forEach((t, k) => { t.members = ids.filter((_, i) => i % 2 === k); });
      goIn.forEach((x, i) => { md.apps[x].team = i % 2; });
    }
  }
  if (stage !== 'open') md.status = 'closed';
  if (stage !== 'open' && stage !== 'closed') md.earlyTeams = true;

  const teamsOnly = kind === 'teams';
  if (['drafting', 'teams', 'played'].includes(stage) && !teamsOnly) {
    // 주장 2명 · 팀 색 · 우선순위 → 선수 선택
    const caps = kind === 'captains' ? [goIn[0], goIn[1]] : [goIn[0], goIn[1]];
    md.captains = caps.map((c, i) => ({ id: c, token: randomToken(), color: ['pink', 'blue'][i] }));
    md.teamNames = kind === 'captains' ? md.teamNames : caps.map((c) => `${S.members.find((m) => m.id === c)?.name || '주장'}팀`);
    const first = rnd(2);
    md.cards = { deck: first ? [2, 1] : [1, 2], picks: { 0: 0, 1: 1 }, at: now, doneAt: now, auto: true };
    md.order = [first, 1 - first];
    md.status = 'drafting'; md.draftStarted = true;
    const ds = draftState(md);
    const pool = shuffle(ds.remaining);
    const upto = stage === 'drafting' ? Math.floor(pool.length / 2) : pool.length;
    for (let k = 0; k < upto; k++) md.picks.push({ id: pool[k], team: ds.seq[k], at: now + k });
  }
  if (['teams', 'played'].includes(stage)) {
    md.teams = teamsOnly ? eventTeamsToTeams(md) : rosters(md).map((members, i) => ({ color: teamColor(md, i), members }));
    md.status = 'teams';
  }
  const games = [];
  if (stage === 'played') {
    // 5라운드 합산 — 라운드마다 점수와 득점자
    const ros = md.teams.map((t) => t.members);
    const real2 = (arr) => arr.filter((x) => !String(x).startsWith('g_'));
    for (let r = 0; r < 5; r++) {
      const sa = rnd(4), sb = rnd(4), goals = {};
      [[0, sa], [1, sb]].forEach(([t, n]) => { for (let k = 0; k < n; k++) { const who = real2(ros[t])[rnd(real2(ros[t]).length)]; if (who) goals[who] = (goals[who] || 0) + 1; } });
      games.push({ matchdayId: id, date: md.date, order: r, round: r + 1, a: 0, b: 1, sa, sb, goals, og: {}, done: true });
    }
    let tot = games.reduce((a, g) => [a[0] + g.sa, a[1] + g.sb], [0, 0]);
    // 주장 체험: 내 팀이 이기게 하고 MOM은 비워 둠 → 승리 팀 주장으로 MOM 뽑기를 해 볼 수 있음
    const myT = meAs === 'captain' && me ? ros.findIndex((x) => x.includes(me)) : -1;
    if (myT >= 0 && tot[myT] <= tot[1 - myT]) {
      const g = games[games.length - 1], add = tot[1 - myT] - tot[myT] + 1, who = real2(ros[myT])[0];
      if (myT === 0) g.sa += add; else g.sb += add;
      if (who) g.goals[who] = (g.goals[who] || 0) + add;
      tot = games.reduce((a, x) => [a[0] + x.sa, a[1] + x.sb], [0, 0]);
    }
    const win = tot[0] >= tot[1] ? 0 : 1;
    const scorers = Object.entries(games.reduce((m, g) => { Object.entries(g.goals).forEach(([k, v]) => { m[k] = (m[k] || 0) + v; }); return m; }, {})).sort((a, b) => b[1] - a[1]);
    md.mom = myT >= 0 ? [] : [scorers.find(([k]) => ros[win].includes(k))?.[0] || real2(ros[win])[0]].filter(Boolean);
    const lateOne = real2(ros[1 - win])[rnd(real2(ros[1 - win]).length)];
    if (lateOne) md.late = { [lateOne]: true };
    md.status = 'played';
  }
  await db.set(mdPath(id), md);
  await Promise.all(games.map((g, i) => db.set('games/' + id + '_r' + i, g)));
  return id;
}

export const sampleList = () => (S.allMatchdays || S.matchdays).filter((m) => m.sample);

export async function clearSamples() {
  const mds = sampleList();
  const ids = new Set(mds.map((m) => m.id));
  const gs = S.games.filter((g) => ids.has(g.matchdayId));
  await Promise.all([...gs.map((g) => db.del('games/' + g.id)), ...mds.map((m) => db.del(mdPath(m.id)))]);
  return mds.length;
}
