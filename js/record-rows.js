// 경기 기록 ↔ 통합 시트 행 — 앱(보내기·읽기)과 테스트가 함께 쓰는 순수 모듈 (화면·저장소 코드 없음)
//
//  통합 시트의 기록 탭 (자세한 칸은 apps-script/Code.gs)
//   경기     : 경기 하나(경기일)마다 한 줄 — 경기ID · 날짜 · 회차 · 구분 · 팀 이름 · 방식 (+ 자동 계산: 점수·결과·MOM·득점)
//   라운드   : 라운드마다 한 줄 — 경기ID · 라운드 · 핑크(A) · 블루(B) · 핑크 득점 · 블루 득점  ← 점수·득점은 여기서 고침
//   출전기록 : 선수마다 한 줄 — 경기ID · 이름 · 팀 · MOM · 지각 · 회원ID (+ 자동 계산: 결과·득점·자책골)
//  득점 칸 글씨: "홍길동×2, 김철수, 이영희(자책)" — 그 팀 점수가 된 골. 자책골은 상대 팀 선수 이름 뒤에 (자책)
//
//  앱 → 시트: toItem(경기일, 라운드 문서들, 도우미) → 보내는 한 경기
//  시트 → 앱: fromSheet(응답, 도우미) → 기록 화면이 쓰는 경기일·라운드 문서 (앱 문서와 같은 모양)

export const SIDE_NAME = { A: '핑크', B: '블루' };
export const SCORING_NAME = { sum: '합산', each: '라운드별' };
const T = (v) => String(v ?? '').trim();
const num = (v) => { const n = Number(T(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
export const yes = (v) => /^(o|◯|○|●|v|y|yes|true|1|✓|✔|mom|지각)$/i.test(T(v));
export const sideOf = (v) => (/블루|^b$|blue/i.test(T(v)) ? 'B' : 'A');
// 2026-10-17 · 2026.10.17 · 2026. 10. 17 · 20261017 → 2026-10-17
export function isoDay(v) {
  const s = T(v);
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// 짧은 지문 (FNV-1a) — 앱 기록이 시트에 보낸 뒤로 바뀌었는지 알아보는 용도
export function hashOf(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

// ── 득점 칸 글씨 ──
export function goalText(list) {
  return list.map(([name, n, og]) => `${name}${og ? '(자책)' : ''}${n > 1 ? '×' + n : ''}`).join(', ');
}
// "홍길동×2, 김철수, 이영희(자책)" → [[이름, 골, 자책?]] — 이름 끝 숫자와 헷갈리지 않게 명단에 있는 이름을 먼저 맞춰 봄
export function parseGoals(text, known = () => false) {
  const out = [];
  T(text).split(/[,，、\n]+/).map(T).filter(Boolean).forEach((tok) => {
    let og = false, s = tok;
    if (/\((자책|og)\)|자책골?$/i.test(s)) { og = true; s = T(s.replace(/\((자책|og)\)|자책골?$/i, '')); }
    let name = s, n = 1;
    if (!known(s)) {
      const m = s.match(/^(.*?)\s*(?:[×xX*]\s*(\d+)|\((\d+)\)|\s(\d+)\s*골?)$/);
      if (m && T(m[1])) { name = T(m[1]); n = +(m[2] || m[3] || m[4]) || 1; }
      if (/\((자책|og)\)$/i.test(name)) { og = true; name = T(name.replace(/\((자책|og)\)$/i, '')); }
    }
    if (name) out.push([name, n, og]);
  });
  return out;
}

// ── 앱 경기일 → 시트로 보내는 한 경기 ──
//  h: { rosters(md), sides(md) → ['A','B'], teamName(md, i), plainName(id, md), matchNo(md), scoring(md) }
export function toItem(md, games, h) {
  const sd = h.sides(md), ros = h.rosters(md).slice(0, 2);
  const sideOfId = new Map();
  ros.forEach((ids, ti) => ids.forEach((id) => { if (!sideOfId.has(id)) sideOfId.set(id, sd[ti]); }));
  const nm = (id) => h.plainName(id, md) || String(id).replace(/^g_/, '');
  const done = games.filter((g) => g.done && g.a <= 1 && g.b <= 1 && g.a !== g.b)
    .sort((x, y) => (x.round || 0) - (y.round || 0) || (x.order || 0) - (y.order || 0));
  const rounds = [], rkey = [];
  done.forEach((g, i) => {
    const r = { r: g.round || i + 1, a: 0, b: 0, ga: [], gb: [] };
    r[sd[g.a] === 'A' ? 'a' : 'b'] = g.sa || 0; r[sd[g.b] === 'A' ? 'a' : 'b'] = g.sb || 0;
    const key = { A: [], B: [] };
    Object.entries(g.goals || {}).forEach(([id, n]) => { const s = sideOfId.get(id); if (!s || !n) return; (s === 'A' ? r.ga : r.gb).push([nm(id), n]); key[s].push(id + ':' + n); });
    Object.entries(g.og || {}).forEach(([id, n]) => { const s = sideOfId.get(id); if (!s || !n) return; const to = s === 'A' ? 'B' : 'A'; (to === 'A' ? r.ga : r.gb).push([nm(id), n, true]); key[to].push(id + ':og' + n); });
    rounds.push({ r: r.r, a: r.a, b: r.b, ga: goalText(r.ga), gb: goalText(r.gb) });
    rkey.push([r.r, r.a, r.b, key.A.sort().join(','), key.B.sort().join(',')]);
  });
  const moms = new Set(md.mom || []), late = md.late || {};
  const players = [];
  [...sideOfId.entries()].forEach(([id, s]) => players.push({ mid: id, name: nm(id), team: SIDE_NAME[s], mom: moms.has(id) ? 1 : 0, late: late[id] ? 1 : 0 }));
  const ti = { A: sd.indexOf('A'), B: sd.indexOf('B') };
  const names = [h.teamName(md, ti.A) || '', h.teamName(md, ti.B) || ''];
  const no = h.matchNo(md);
  const item = {
    id: md.id, date: md.date || '', no: no == null ? '' : no, kind: md.event ? '이벤트' : '정기', names,
    scoring: SCORING_NAME[h.scoring(md)] || '합산', src: md.source === 'sheet' ? '승률계산기' : '앱',
    rounds, players,
  };
  // 지문: 회원 이름은 빼고(닉네임만 바뀐 걸로 다시 보내지 않게) 회원ID로
  item.hash = hashOf(JSON.stringify([item.date, item.no, item.kind, names, item.scoring, rkey,
    players.map((p) => [p.mid, p.team, p.mom, p.late]).sort((x, y) => (x[0] < y[0] ? -1 : 1))]));
  return item;
}

// ── 시트 응답 → 앱 경기일·라운드 문서 ──
//  data: { games: [[경기ID, 날짜, 회차, 구분, 핑크팀, 블루팀, 방식, 출처, 지문]], rounds: [[경기ID, 라운드, A, B, A득점, B득점]], players: [[경기ID, 회원ID, 이름, 팀, MOM, 지각]] }
//  h: { memberById(id), idByName(name) → 회원ID | null }
export function fromSheet(data, h) {
  const rBy = new Map(), pBy = new Map();
  (data.rounds || []).forEach((r) => { const id = T(r[0]); if (id) (rBy.get(id) || rBy.set(id, []).get(id)).push(r); });
  (data.players || []).forEach((p) => { const id = T(p[0]); if (id) (pBy.get(id) || pBy.set(id, []).get(id)).push(p); });
  const mds = [], games = [], hash = new Map();
  (data.games || []).forEach((row, gi) => {
    const id = T(row[0]), date = isoDay(row[1]);
    if (!id || !date) return;
    const teams = [[], []], guests = {}, mom = [], late = {}, byName = new Map();
    (pBy.get(id) || []).forEach((p) => {
      const name = T(p[2]);
      let mid = T(p[1]);
      if (!mid && !name) return;
      if (!mid) mid = h.idByName(name) || 'g_' + (name.replace(/[^0-9a-zA-Z가-힣]/g, '') || 'x');
      if (!h.memberById(mid)) guests[mid] = { name: name || mid.replace(/^g_/, '') };
      const ti = sideOf(p[3]) === 'B' ? 1 : 0;
      if (teams[0].includes(mid) || teams[1].includes(mid)) return;
      teams[ti].push(mid);
      if (yes(p[4])) mom.push(mid);
      if (yes(p[5])) late[mid] = true;
      if (name) byName.set(name, mid);
      const cur = h.memberById(mid)?.name; if (cur && !byName.has(cur)) byName.set(cur, mid);
    });
    const known = (n) => byName.has(n);
    const scoring = /라운드|each/i.test(T(row[6])) ? 'each' : 'sum';
    const rs = (rBy.get(id) || []).slice().sort((x, y) => num(x[1]) - num(y[1]));
    rs.forEach((r, i) => {
      const goals = {}, og = {};
      // 어느 팀 점수인지는 선수 팀으로 정해짐 (자책골은 상대 팀 점수)
      [r[4], r[5]].forEach((txt) => parseGoals(txt, known).forEach(([name, n, isOg]) => {
        const pid = byName.get(name) || h.idByName(name);
        if (!pid) return;
        const bag = isOg ? og : goals;
        bag[pid] = (bag[pid] || 0) + n;
      }));
      games.push({ id: `${id}~r${i}`, matchdayId: id, date, order: i, round: num(r[1]) || i + 1, a: 0, b: 1, sa: num(r[2]), sb: num(r[3]), goals, og, done: true, fromSheet: true });
    });
    const no = T(row[2]);
    mds.push({
      id, date, status: 'played', event: false, fromSheet: true, recNo: /^\d+$/.test(no) ? +no : null,
      source: /승률/.test(T(row[7])) ? 'sheet' : T(row[7]) === '앱' ? 'app' : 'manual',
      format: { teams: 2, scoring, rounds: Math.max(1, rs.length) },
      teams: [{ color: 'pink', members: teams[0] }, { color: 'blue', members: teams[1] }],
      teamNames: [T(row[4]) || null, T(row[5]) || null], mom, late, guests,
      createdAt: Date.parse(date) + gi,
    });
    if (T(row[8])) hash.set(id, T(row[8]));
  });
  return { mds, games, hash };
}
