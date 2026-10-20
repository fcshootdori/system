// 승률계산기 구글 시트 → 앱 데이터 가져오기
//  읽는 탭: Members(Memver_id, 활성), Games(Game_id, 날짜, 핑크(A), 블루(B)), Match_Player(Game_id, Member_id, 팀, 득점, MOM, LATE, 결과, 자책골)
//  시트는 읽기만 하며, 같은 경기는 다시 가져와도 덮어쓰기만 하므로 여러 번 실행해도 안전함
const GVIZ = (id, sheet) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheet)}`;

function cellStr(c) {
  if (c == null) return '';
  const v = c.v ?? c.f ?? '';
  if (typeof v === 'string') {
    const d = v.match(/^Date\((\d+),(\d+),(\d+)/); // 날짜 서식 셀
    if (d) return `${d[1]}${String(+d[2] + 1).padStart(2, '0')}${String(d[3]).padStart(2, '0')}`;
    return v.trim();
  }
  return String(v).trim();
}

export async function fetchTab(id, sheet) {
  const res = await fetch(GVIZ(id, sheet));
  const txt = await res.text();
  const start = txt.indexOf('('), end = txt.lastIndexOf(')');
  if (start < 0) throw new Error(`'${sheet}' 탭을 읽지 못했어요 (공유 설정 확인)`);
  const json = JSON.parse(txt.slice(start + 1, end));
  if (json.status === 'error') throw new Error(`'${sheet}' 탭: ${json.errors?.[0]?.detailed_message || json.errors?.[0]?.message || '읽기 실패'}`);
  let header = json.table.cols.map((c) => (c.label || '').trim());
  let rows = json.table.rows.map((r) => (r.c || []).map(cellStr));
  if (header.every((h) => !h) && rows.length) { header = rows[0]; rows = rows.slice(1); }
  return { header, rows };
}

const col = (header, ...res) => { for (const re of res) { const i = header.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
const num = (s) => { const n = Number(String(s ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const normId = (s) => { const t = String(s ?? '').trim(); return /^\d+(\.0+)?$/.test(t) ? String(parseInt(t, 10)) : t; };
const isoDate = (s) => { const d = String(s).replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : ''; };

// 세 탭의 표 → { members, matches, problems }
export function parseSheet({ members, games, players }) {
  const problems = [];
  // Members
  const mh = members.header;
  const mName = col(mh, /mem.*id/i, /이름|닉네임|name/i), mAct = col(mh, /활성|active/i);
  const memberRows = members.rows.map((r) => ({ name: r[mName < 0 ? 0 : mName] || '', active: mAct < 0 ? true : !/^n/i.test(r[mAct] || 'Y') }))
    .filter((m) => m.name);

  // Games — Game_id가 숫자가 아닌 행(예: 설날)은 구글 시트 읽기에서 비어 올 수 있어 날짜로 대신 식별
  const gh = games.header;
  const gId = col(gh, /game/i, /경기/), gDate = col(gh, /날짜|date/i), gA = col(gh, /핑크|\(A\)/i), gB = col(gh, /블루|\(B\)/i);
  const matches = [], byId = new Map(), blankIdGames = [];
  games.rows.forEach((r) => {
    const date = isoDate(r[gDate]);
    if (!date || r[gA] === '' || r[gB] === '') return; // 아직 결과 없는 행
    let id = normId(r[gId]);
    const m = { gid: id || `d${date.replace(/-/g, '')}`, date, sa: num(r[gA]), sb: num(r[gB]), players: [] };
    if (!id) blankIdGames.push(m);
    matches.push(m); byId.set(m.gid, m);
  });

  // Match_Player
  const ph = players.header;
  const pId = col(ph, /game/i), pName = col(ph, /mem/i, /이름|닉/), pTeam = col(ph, /팀|team/i),
    pGoal = col(ph, /득점|goal/i), pMom = col(ph, /mom/i), pLate = col(ph, /late|지각/i), pOg = col(ph, /자책|own/i);
  let prevBlank = false, blankIdx = -1, skipped = 0;
  players.rows.forEach((r) => {
    const name = (r[pName] || '').trim();
    let id = normId(r[pId]);
    if (!id) {
      if (!name) { prevBlank = false; return; }
      if (!prevBlank) blankIdx++;
      prevBlank = true;
      const m = blankIdGames[blankIdx];
      if (!m) { skipped++; return; }
      id = m.gid;
    } else prevBlank = false;
    if (!name) return;
    const m = byId.get(id);
    if (!m) { skipped++; return; }
    const t = String(r[pTeam] || '').toUpperCase();
    const team = /B|블루/.test(t) ? 1 : 0;
    if (m.players.some((p) => p.name === name)) return; // 같은 경기 중복 행
    m.players.push({ name, team, goals: num(r[pGoal]), mom: /mom/i.test(r[pMom] || ''), late: num(r[pLate]) > 0, og: num(r[pOg]) });
  });
  if (skipped) problems.push(`경기를 찾지 못한 선수 기록 ${skipped}행은 제외했어요`);
  return { members: memberRows, matches: matches.filter((m) => m.players.length || m.sa || m.sb), problems };
}

// 오타·줄임말 추천: 회원 이름에 포함되거나(필봉→양필봉) 글자 순서가 맞으면(폭기→폭주기관차)
export function suggestMember(name, members) {
  const sub = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return i === a.length; };
  const n = name.toLowerCase();
  if (n.length < 2) return null;
  const inc = members.filter((m) => m.name.toLowerCase().includes(n));
  if (inc.length === 1) return { id: inc[0].id, strong: true };
  const seq = members.filter((m) => sub(n, m.name.toLowerCase()));
  if (seq.length === 1) return { id: seq[0].id, strong: true };
  const rev = members.filter((m) => m.name.length >= 2 && n.includes(m.name.toLowerCase()));
  if (rev.length === 1) return { id: rev[0].id, strong: false };
  return null;
}

export const SHEET_FORMAT = {
  teams: 2, rounds: 1, scoring: 'sum', teamMode: 'fixed', fixedColors: ['pink', 'blue', 'yellow', 'green'],
  minPlayers: 0, capacity: 0, draft: 'snake',
};

// 가져오기용 문서 만들기 — resolve(name) → memberId | null(게스트)
export function buildDocs(matches, resolve, skipDates = new Set()) {
  const out = [], skipped = [];
  matches.forEach((m) => {
    if (skipDates.has(m.date)) { skipped.push(m.date); return; }
    const mdId = 's_' + m.gid;
    const guests = {}, teams = [[], []], goals = {}, og = {}, mom = [], late = {};
    m.players.forEach((p) => {
      let id = resolve(p.name);
      if (!id) { id = 'g_' + (p.name.replace(/[^0-9a-zA-Z가-힣]/g, '') || 'x'); guests[id] = { name: p.name }; }
      if (teams[0].includes(id) || teams[1].includes(id)) return;
      teams[p.team].push(id);
      if (p.goals) goals[id] = p.goals;
      if (p.og) og[id] = p.og;
      if (p.mom) mom.push(id);
      if (p.late) late[id] = true;
    });
    out.push({
      md: { path: 'matchdays/' + mdId, data: {
        date: m.date, time: '', venue: '', note: '', status: 'played', format: SHEET_FORMAT,
        apps: {}, guests, captains: [], picks: [], teams: [{ color: 'pink', members: teams[0] }, { color: 'blue', members: teams[1] }],
        mom, late, source: 'sheet', sheetGameId: m.gid, createdAt: Date.parse(m.date) || 0 } },
      game: { path: 'games/' + mdId, data: {
        matchdayId: mdId, date: m.date, order: 0, round: 1, a: 0, b: 1, sa: m.sa, sb: m.sb, goals, og, done: true, source: 'sheet' } },
    });
  });
  return { docs: out, skipped };
}
