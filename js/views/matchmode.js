// ⚽ 경기모드
//  · 회원: 주장이 정한 라운드별 포지션 · 실시간 스코어 · 득점자 · 라운드별 득점
//  · 운영진: 라운드별 스코어·득점자 기록 (운영모드 > 경기 운영 > 경기 단계에서도 같은 화면)
//  · 주장: 라운드별 우리 팀 포지션 지정 — 골대는 아래, 하프라인은 위. 아래 선수 유니폼을 끌어다 자리에 놓기 (누르고 자리 누르기도 가능)
import { S, me, mdPath, nameOf, today, playedDays } from '../state.js?v=0.1.56';
import { db, newId } from '../store.js?v=0.1.56';
import { rosters, fmtOf, totals, noLabel, teamColor, captainIds } from '../domain.js?v=0.1.56';
import { TEAM_COLORS } from '../config.js?v=0.1.56';
import { esc, fmtDate, toast } from '../util.js?v=0.1.56';
import { icon } from '../icons.js?v=0.1.56';
import { teamChip, teamLabel, empty } from '../ui.js?v=0.1.56';
import { figHTML } from './draft.js?v=0.1.56';

// 포메이션: [자리, 가로 %, 세로 %(0 = 하프라인, 100 = 골라인)]
const B4 = [['LB', 12, 70], ['LCB', 37, 75], ['RCB', 63, 75], ['RB', 88, 70]];
const B3 = [['LCB', 22, 73], ['CB', 50, 76], ['RCB', 78, 73]];
const GK = ['GK', 50, 91];
export const FORMS = {
  '4-4-2': [GK, ...B4, ['LM', 12, 43], ['LCM', 37, 48], ['RCM', 63, 48], ['RM', 88, 43], ['LS', 35, 16], ['RS', 65, 16]],
  '4-3-3': [GK, ...B4, ['LCM', 25, 48], ['CM', 50, 53], ['RCM', 75, 48], ['LW', 15, 19], ['ST', 50, 12], ['RW', 85, 19]],
  '4-2-3-1': [GK, ...B4, ['LDM', 34, 56], ['RDM', 66, 56], ['LAM', 15, 33], ['CAM', 50, 33], ['RAM', 85, 33], ['ST', 50, 11]],
  '3-5-2': [GK, ...B3, ['LWB', 9, 45], ['LCM', 30, 50], ['CM', 50, 55], ['RCM', 70, 50], ['RWB', 91, 45], ['LS', 35, 16], ['RS', 65, 16]],
  '3-4-3': [GK, ...B3, ['LM', 12, 45], ['LCM', 37, 50], ['RCM', 63, 50], ['RM', 88, 45], ['LW', 15, 18], ['ST', 50, 12], ['RW', 85, 18]],
};
const POS = { GK: 'GK', LB: 'LB', RB: 'RB', LCB: 'CB', RCB: 'CB', CB: 'CB', LM: 'LM', RM: 'RM', LCM: 'CM', RCM: 'CM', CM: 'CM', LDM: 'DM', RDM: 'DM',
  LAM: 'LW', RAM: 'RW', CAM: 'AM', LW: 'LW', RW: 'RW', ST: 'ST', LS: 'ST', RS: 'ST', LWB: 'LWB', RWB: 'RWB' };
const DEF_FORM = '4-4-2';

const ui = { md: null, round: null, view: null, sel: null, ogMode: false, roundFor: null };
const inkOf = (md, i) => { const h = hexOf(md, i); return /^#?fff/i.test(h.text.replace('#', '')) ? h.hex : '#121633'; };
const hexOf = (md, i) => TEAM_COLORS.find((c) => c.key === teamColor(md, i)) || { hex: '#64748b', text: '#fff' };
const gamesOf = (md) => S.games.filter((g) => g.matchdayId === md.id).sort((a, b) => (a.round || 0) - (b.round || 0) || (a.order || 0) - (b.order || 0));
const nRounds = (md) => Math.max(fmtOf(md).rounds, ...gamesOf(md).map((g) => g.round || 0));
const lineupOf = (md, ti, r) => md.lineups?.[ti]?.[r] || null;

// 오늘(또는 다음) 경기 — 팀이 확정된 경기일
export function liveMatchday() {
  const t = today();
  const withTeams = S.matchdays.filter((m) => m.teams?.length && m.source !== 'sheet' && !m.cancelled);
  return withTeams.find((m) => m.date === t && m.status !== 'played' && !m.sample)
    || withTeams.filter((m) => m.status === 'teams').sort((a, b) => !!a.sample - !!b.sample || a.date.localeCompare(b.date))[0]
    || withTeams.find((m) => m.date === t)
    || null;
}

export function render(root, ctx = {}) {
  const md = ctx.md || liveMatchday();
  if (!md) {
    const last = playedDays()[0];
    root.innerHTML = `<section class="card center mm-empty"><div class="mm-ball">${icon('ball')}</div>
      <h2>진행 중인 경기가 없어요</h2><p class="muted small">팀이 확정되면 여기서 포지션과 실시간 점수를 볼 수 있어요.</p>
      ${last ? `<a class="btn ghost" href="#/games/${last.id}">지난 경기 결과 (${fmtDate(last.date)})</a>` : ''}</section>`;
    return;
  }
  if (ui.md !== md.id) { ui.md = md.id; ui.round = null; ui.view = null; ui.sel = null; ui.ogMode = false; }
  const games = gamesOf(md), R = nRounds(md);
  const liveG = games.find((g) => !g.done);
  if (ui.round == null || ui.round > R) ui.round = liveG?.round || games[games.length - 1]?.round || 1;
  const op = S.operator && md.status !== 'played';
  const capOf = [0, 1].filter((i) => captainIds(md, i).includes(me.id));
  const myTeam = rosters(md).findIndex((ids) => ids.includes(me.id));
  if (ui.view == null) ui.view = capOf[0] ?? (myTeam >= 0 ? myTeam : 0);
  const t = totals(md, games);
  const played = md.status === 'played' || (games.length && games.every((g) => g.done));
  const g = games.find((x) => x.round === ui.round);

  root.innerHTML = `
    <section class="mm-hero ${ctx.embedded ? 'emb' : ''}">
      ${ctx.embedded ? '' : `<div class="mm-hh"><span class="mm-tag ${played ? 'end' : ''}">${played ? '경기 종료' : '<i></i>LIVE'}</span>
        <h1>${noLabel(md) ? noLabel(md) + ' · ' : ''}${fmtDate(md.date)}</h1>${md.time || md.venue ? `<small>${esc([md.time, md.venue].filter(Boolean).join(' · '))}</small>` : ''}</div>`}
      <div class="mm-split">
        ${[0, 1].map((i) => `<div class="mm-t ${i ? 'b' : 'a'}" style="--tc:${hexOf(md, i).hex};--ti:${hexOf(md, i).text}"><span>${esc(teamLabel(md, i))}</span><b>${t[i] ?? 0}</b></div>`).join('')}
        <div class="mm-mid"><b>${played ? '종료' : liveG ? `${liveG.round}R` : '경기 전'}</b><small>${played ? '라운드 합산' : liveG ? '<i></i>LIVE' : '곧 시작'}</small></div>
      </div>
    </section>
    <nav class="mm-rounds" aria-label="라운드">${[...Array(R)].map((_, k) => { const r = k + 1, x = games.find((q) => q.round === r);
      return `<button type="button" data-round="${r}" class="${r === ui.round ? 'on' : ''} ${x?.done ? 'done' : x && x === liveG ? 'live' : ''}">
        <span>${r}R${x && x === liveG && !x.done ? ' 진행' : ''}</span><b>${x && (x.done || x.sa || x.sb) ? `<em style="--sc:${inkOf(md, x.a ?? 0)}">${x.sa}</em><i>:</i><em style="--sc:${inkOf(md, x.b ?? 1)}">${x.sb}</em>` : x === liveG && x ? '0<i>:</i>0' : '–'}</b></button>`; }).join('')}</nav>
    ${op ? recorder(md, games, g) : roundCard(md, g)}
    ${md.status !== 'played' || capOf.length ? lineupCard(md, capOf, op) : lineupCard(md, [], false)}
    ${!op && !played ? scorersCard(md, games) : ''}
    ${!ctx.embedded && !S.operator && localStorage.getItem('teamapp:opdev') === '1' ? '<p class="muted small center">운영진은 운영모드 › 경기 운영 › 경기 단계에서 점수를 기록해요.</p>' : ''}`;
  bind(root, md, ctx);
}

// ── 라운드 득점 (회원 보기) ──
function goalsOf(md, g) {
  const ros = rosters(md), out = [[], []];
  if (!g) return out;
  Object.entries(g.goals || {}).forEach(([id, n]) => { const ti = ros.findIndex((x) => x.includes(id)); if (ti >= 0) out[ti].push({ id, n }); });
  Object.entries(g.og || {}).forEach(([id, n]) => { const ti = ros.findIndex((x) => x.includes(id)); if (ti >= 0) out[1 - ti].push({ id, n, og: true }); });
  return out;
}
function roundCard(md, g) {
  const gl = goalsOf(md, g);
  return `<section class="card mm-round"><h2>${ui.round}라운드 ${g ? `<small>${g.done ? '종료' : '진행 중'}</small>` : '<small>시작 전</small>'}</h2>
    ${g ? `<div class="mm-rscore">${[0, 1].map((i) => `<div class="mm-side" style="--tc:${hexOf(md, i).hex}">
      <header>${teamChip(md, i)}<b class="n">${i ? g.sb : g.sa}</b></header>
      ${gl[i].length ? `<ul>${gl[i].map((x) => `<li>${icon('ball', 'sm')}${esc(nameOf(x.id, md))}${x.n > 1 ? ` <b>${x.n}</b>` : ''}${x.og ? ' <small class="muted">자책</small>' : ''}</li>`).join('')}</ul>` : '<p class="muted small">득점 없음</p>'}
    </div>`).join('')}</div>` : '<p class="muted small">운영진이 라운드를 시작하면 점수가 올라와요.</p>'}
  </section>`;
}
function scorersCard(md, games) {
  const goals = {};
  games.forEach((g) => Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; }));
  const list = Object.entries(goals).sort((a, b) => b[1] - a[1]);
  if (!list.length) return '';
  const ros = rosters(md);
  return `<section class="card"><h2>${icon('ball')} 득점자 <small>전체 라운드</small></h2><div class="pchips">${list.map(([id, n]) => { const ti = ros.findIndex((x) => x.includes(id));
    return `<span class="pchip">${ti >= 0 ? `<i style="background:${hexOf(md, ti).hex}"></i>` : ''}${esc(nameOf(id, md))}${n > 1 ? ` <b>${n}</b>` : ''}</span>`; }).join('')}</div></section>`;
}

// ── 운영진 기록 ──
//  골 하나하나를 g.log에 순서대로 남김 { id, k: 'g'(골)|'og'(자책)|'u'(득점자 모름), s: 점수가 오른 쪽 'sa'|'sb', at }
//  예전 기록(순서 없이 골 수만 있는 경우)도 목록에 함께 보여 주고 취소할 수 있음
function entries(md, g) {
  const ros = rosters(md), log = Array.isArray(g.log) ? g.log : [];
  const sideOf = (id) => (ros[g.b]?.includes(id) ? 'sb' : 'sa'), opp = (k) => (k === 'sa' ? 'sb' : 'sa');
  const cnt = (id, k) => log.filter((e) => e.id === id && e.k === k).length;
  const old = [];
  Object.entries(g.goals || {}).forEach(([id, n]) => { for (let j = cnt(id, 'g'); j < n; j++) old.push({ id, k: 'g', s: sideOf(id) }); });
  Object.entries(g.og || {}).forEach(([id, n]) => { for (let j = cnt(id, 'og'); j < n; j++) old.push({ id, k: 'og', s: opp(sideOf(id)) }); });
  const all = [...old, ...log];
  ['sa', 'sb'].forEach((k) => { for (let j = all.filter((e) => e.s === k).length; j < (g[k] || 0); j++) all.splice(old.length, 0, { id: null, k: 'u', s: k }); });
  return all;
}
function recorder(md, games, g) {
  const ros = rosters(md), f = fmtOf(md);
  if (!games.length) return `<section class="card op"><h2>경기 기록</h2><p class="small">라운드를 만들면 라운드별 점수와 득점자를 기록할 수 있어요.</p>
    <button class="btn" data-mkrounds>${f.rounds}라운드 만들기</button></section>`;
  if (!g) return `<section class="card op"><p class="small">${ui.round}라운드가 아직 없어요.</p><button class="btn ghost" data-addround>라운드 추가</button></section>`;
  const side = (i) => { const key = i ? 'sb' : 'sa', hx = hexOf(md, i);
    return `<div class="rec-side" style="--tc:${hx.hex};--ti:${hx.text}">
      <header>${teamChip(md, i)}<b class="rec-score n">${g[key] || 0}</b></header>
      <div class="rec-names">${(ros[i] || []).map((id) => `<button type="button" class="rec-p ${g.goals?.[id] ? 'has' : ''}" data-goal="${id}:${key}">${esc(nameOf(id, md))}${g.goals?.[id] ? `<em>${g.goals[id]}</em>` : ''}${g.og?.[id] ? '<em class="o">자책</em>' : ''}</button>`).join('')}</div>
      <button type="button" class="rec-unk" data-unk="${key}">＋ 득점자 모름</button>
    </div>`; };
  const list = entries(md, g);
  return `<section class="card op mm-rec">
    <h2>${ui.round}라운드 기록 ${g.done ? '<small class="ok-t">종료</small>' : ''}</h2>
    <div class="seg rec-mode"><button type="button" data-ogm="0" class="${ui.ogMode ? '' : 'on'}">${icon('ball', 'sm')} 골</button><button type="button" data-ogm="1" class="${ui.ogMode ? 'on og' : ''}">자책골</button></div>
    <p class="tiny muted">${ui.ogMode ? '<b class="warn-t">자책골</b>: 자책골을 넣은 선수를 누르면 상대 팀 점수가 1점 올라가요. 한 번 기록하면 다시 골 기록으로 돌아와요.' : '골을 넣은 선수를 누르면 그 팀 점수가 1점 올라가요.'}</p>
    <div class="rec-grid ${ui.ogMode ? 'og' : ''}">${side(0)}${side(1)}</div>
    <div class="rec-log"><b>득점자 <small class="muted">${list.length ? '· 잘못 넣었으면 눌러서 취소' : ''}</small></b>
      ${list.length ? list.map((e, n) => { const ti = e.s === 'sb' ? 1 : 0;
        return `<button type="button" class="rec-ev ${e.k}" style="--tc:${hexOf(md, ti).hex}" data-un="${n}" title="눌러서 취소">
          <span class="no">${n + 1}</span>${e.k === 'og' ? '<b>자책</b>' : icon('ball', 'sm')}<span>${e.id ? esc(nameOf(e.id, md)) : '득점자 모름'}</span>${icon('x', 'sm')}</button>`; }).join('')
      : '<p class="muted small">아직 득점이 없어요.</p>'}
    </div>
    <div class="row wrap rec-act">
      <button class="btn ${g.done ? 'ghost' : ''}" data-rdone>${g.done ? '라운드 종료 취소' : `${ui.round}라운드 종료`}</button>
      ${ui.round === games[games.length - 1].round ? '<button class="btn ghost" data-addround>라운드 추가</button>' : ''}
      ${games.every((x) => x.done) ? '<button class="btn" data-finish>경기 종료 · 기록 반영</button>' : ''}
    </div>
  </section>`;
}

// ── 포지션 ──
function slotsOf(lu) { const f = FORMS[lu?.f] ? lu.f : DEF_FORM; return { f, list: FORMS[f], s: lu?.s || {} }; }
function pitchHTML(md, ti, lu, editable) {
  const { list, s } = slotsOf(lu), hx = hexOf(md, ti), ros = rosters(md)[ti] || [];
  return `<div class="lp-pitch ${editable ? 'edit' : ''}" style="--tc:${hx.hex};--ti:${hx.text}">
    <svg class="lp-lines" viewBox="0 0 68 60" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="66" height="54" /><path d="M1 1H67" class="half"/>
      <path d="M25.85 1A9.15 9.15 0 0 0 42.15 1"/><circle cx="34" cy="1" r=".7" class="dot"/>
      <rect x="13.85" y="38.5" width="40.3" height="16.5"/><rect x="24.85" y="49.5" width="18.3" height="5.5"/>
      <circle cx="34" cy="44" r=".7" class="dot"/><path d="M26.7 38.5A9.15 9.15 0 0 1 41.3 38.5"/>
      <rect x="30.34" y="55" width="7.32" height="3" class="goal"/>
    </svg>
    ${list.map(([k, x, y]) => { const id = s[k] && ros.includes(s[k]) ? s[k] : null;
      return `<div class="lp-slot ${id ? 'full' : ''} ${editable && ui.sel?.id === id && id ? 'sel' : ''}" style="left:${x}%;top:${(1.7 + y * 0.9).toFixed(1)}%" ${editable ? `data-slot="${k}"` : ''}>
        ${id ? `<span class="jf vest lp-j pos ${k === 'GK' ? 'gk' : ''}" ${k === 'GK' ? 'style="--tc:#facc15;--ti:#5c4300"' : ''} ${editable ? `data-drag="${id}" data-from="${k}"` : ''}>${figHTML(POS[k] || k, '', 9)}<em class="lp-nm">${esc(nameOf(id, md))}</em></span>` : `<span class="lp-empty">${POS[k] || k}</span>`}
      </div>`; }).join('')}
  </div>`;
}
function lineupCard(md, capOf, op) {
  const R = ui.round, ros = rosters(md);
  const canEdit = (i) => md.status !== 'played' && capOf.includes(i);   // 포지션은 그 팀 주장만 정함 (운영진은 두 팀 보기만)
  // 포지션은 그 팀 선수(주장 포함)만 볼 수 있음 — 상대 팀 포지션은 숨김. 운영진은 두 팀 모두
  const mine = [0, 1].filter((i) => capOf.includes(i) || (ros[i] || []).includes(me.id));
  const vis = op ? [0, 1] : mine;
  if (!vis.length) return `<section class="card mm-lineup"><h2>${icon('field')} 포지션</h2>
    <p class="muted small lp-none">포지션은 그 팀 선수만 볼 수 있어요.</p></section>`;
  if (!vis.includes(ui.view)) ui.view = vis[0];
  const ti = ui.view;
  const lu = lineupOf(md, ti, R), edit = canEdit(ti);
  const placed = new Set(Object.values(lu?.s || {}));
  const bench = (ros[ti] || []).filter((id) => !placed.has(id));
  const { f } = slotsOf(lu);
  return `<section class="card mm-lineup">
    <h2>${icon('field')} 포지션 <small>${R}라운드</small></h2>
    ${vis.length > 1 ? `<div class="seg lp-teams">${vis.map((i) => `<button type="button" data-view="${i}" class="${i === ti ? 'on' : ''}" style="--tc:${hexOf(md, i).hex}"><i></i>${esc(teamLabel(md, i))}${mine.includes(i) ? ' · 우리 팀' : ''}</button>`).join('')}</div>` : `<p class="lp-myteam" style="--tc:${hexOf(md, ti).hex}"><i></i>${esc(teamLabel(md, ti))} · 우리 팀 <small class="muted">상대 팀 포지션은 보이지 않아요</small></p>`}
    ${edit ? `<div class="lp-tools">
        <div class="lp-forms">${Object.keys(FORMS).map((k) => `<button type="button" data-form="${k}" class="${k === f ? 'on' : ''}">${k}</button>`).join('')}</div>
        <p class="tiny muted">${capOf.includes(ti) ? '주장 화면 · ' : '운영진 · '}아래 선수 유니폼을 끌어다 자리에 놓아요 (선수를 누르고 자리를 눌러도 돼요). 자리에 있는 선수를 아래 명단으로 끌면 빠져요.</p>
      </div>` : ''}
    ${!lu && !edit ? `<p class="muted small lp-none">${esc(teamLabel(md, ti))} 주장이 아직 ${R}라운드 포지션을 정하지 않았어요.</p>` : ''}
    ${lu || edit ? pitchHTML(md, ti, lu, edit) : ''}
    <div class="lp-bench ${edit ? 'edit' : ''}" ${edit ? 'data-bench' : ''}>
      <div class="lp-bh"><b>${lu || edit ? '대기 · 교체' : '팀 명단'}</b><small>${bench.length}명</small></div>
      <div class="lp-bl">${bench.map((id) => `<span class="jf vest lp-j ${edit && ui.sel?.id === id ? 'sel' : ''}" style="--tc:${hexOf(md, ti).hex};--ti:${hexOf(md, ti).text}" ${edit ? `data-drag="${id}" data-from="bench"` : ''}>${figHTML(nameOf(id, md), '', 4)}</span>`).join('') || '<span class="muted small">모두 자리에 있어요</span>'}</div>
    </div>
    ${edit ? `<div class="row wrap lp-act">
      ${R > 1 ? `<button type="button" class="btn ghost sm" data-copyprev>${icon('copy', 'sm')} ${R - 1}라운드 그대로</button>` : ''}
      <button type="button" class="btn ghost sm" data-copyall>${icon('copy', 'sm')} 모든 라운드에 적용</button>
      ${lu ? '<button type="button" class="btn ghost sm danger" data-clear>비우기</button>' : ''}
    </div>` : ''}
  </section>`;
}

// 포지션 저장 (주장·운영진)
function saveLineup(md, ti, rounds, fn) {
  return db.tx(mdPath(md.id), (cur) => {
    cur.lineups = cur.lineups || {};
    const t = (cur.lineups[ti] = cur.lineups[ti] || {});
    rounds.forEach((r) => { const prev = t[r] ? { f: t[r].f || DEF_FORM, s: { ...(t[r].s || {}) } } : { f: DEF_FORM, s: {} }; const nx = fn(prev, r); if (nx) t[r] = nx; else delete t[r]; });
    return cur;
  }).catch((e) => toast('저장하지 못했어요: ' + (e.message || e)));
}
function place(md, id, from, to) {
  const ti = ui.view, R = ui.round;
  ui.sel = null;
  if (to === from) { rerender(); return; }
  saveLineup(md, ti, [R], (lu) => {
    const s = lu.s;
    if (to === 'bench') { if (from !== 'bench') delete s[from]; return lu; }
    const occ = s[to];
    Object.keys(s).forEach((k) => { if (s[k] === id) delete s[k]; });
    s[to] = id;
    if (occ && occ !== id && from !== 'bench') s[from] = occ;   // 자리끼리 맞바꿈 (대기 선수가 들어오면 원래 선수는 대기로)
    return lu;
  });
}

let lastRoot = null, lastCtx = null;
const rerender = () => { if (lastRoot?.isConnected) render(lastRoot, lastCtx); };
function bind(root, md, ctx) {
  lastRoot = root; lastCtx = ctx;
  const q = (s) => root.querySelector(s);
  root.querySelectorAll('[data-round]').forEach((b) => b.addEventListener('click', () => { ui.round = +b.dataset.round; ui.sel = null; rerender(); }));
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { ui.view = +b.dataset.view; ui.sel = null; rerender(); }));
  // 기록
  const games = gamesOf(md), g = games.find((x) => x.round === ui.round);
  const upd = (fn) => db.tx('games/' + g.id, (cur) => { if (!cur) return null; cur.goals = cur.goals || {}; cur.og = cur.og || {}; fn(cur); return cur; });
  q('[data-mkrounds]')?.addEventListener('click', async () => {
    const f = fmtOf(md);
    await Promise.all([...Array(f.rounds)].map((_, i) => db.set('games/' + newId() + i, { matchdayId: md.id, date: md.date, order: i, round: i + 1, a: 0, b: 1, sa: 0, sb: 0, goals: {}, og: {}, done: false })));
    ui.round = 1; toast(`${f.rounds}라운드를 만들었어요`);
  });
  q('[data-addround]')?.addEventListener('click', async () => {
    const last = games[games.length - 1];
    const r = (last?.round || 0) + 1;
    await db.set('games/' + newId(), { matchdayId: md.id, date: md.date, order: (last?.order ?? -1) + 1, round: r, a: 0, b: 1, sa: 0, sb: 0, goals: {}, og: {}, done: false });
    ui.round = r; toast(`${r}라운드를 추가했어요`);
  });
  root.querySelectorAll('[data-ogm]').forEach((b) => b.addEventListener('click', () => { ui.ogMode = b.dataset.ogm === '1'; rerender(); }));
  root.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
    const [id, k] = b.dataset.goal.split(':'), opp = k === 'sa' ? 'sb' : 'sa';
    const og = ui.ogMode;
    upd((c) => {
      c.log = Array.isArray(c.log) ? c.log : [];
      if (og) { c.og[id] = (c.og[id] || 0) + 1; c[opp] = (c[opp] || 0) + 1; c.log.push({ id, k: 'og', s: opp, at: Date.now() }); }
      else { c.goals[id] = (c.goals[id] || 0) + 1; c[k] = (c[k] || 0) + 1; c.log.push({ id, k: 'g', s: k, at: Date.now() }); }
    });
    if (og) { ui.ogMode = false; toast(`${nameOf(id, md)} 자책골 — 상대 팀 +1`); }
    b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 300);
  }));
  root.querySelectorAll('[data-unk]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.unk;
    upd((c) => { c.log = Array.isArray(c.log) ? c.log : []; c[k] = (c[k] || 0) + 1; c.log.push({ id: null, k: 'u', s: k, at: Date.now() }); });
  }));
  // 득점자 목록의 버튼을 누르면 그 골 취소
  root.querySelectorAll('[data-un]').forEach((b) => b.addEventListener('click', () => {
    const e = entries(md, g)[+b.dataset.un]; if (!e) return;
    upd((c) => {
      c.log = Array.isArray(c.log) ? c.log : [];
      if (e.at) { const i = c.log.findIndex((x) => x.at === e.at && x.id === e.id && x.k === e.k); if (i >= 0) c.log.splice(i, 1); }
      if (e.k === 'g' && c.goals[e.id]) { c.goals[e.id]--; if (!c.goals[e.id]) delete c.goals[e.id]; }
      if (e.k === 'og' && c.og[e.id]) { c.og[e.id]--; if (!c.og[e.id]) delete c.og[e.id]; }
      c[e.s] = Math.max(0, (c[e.s] || 0) - 1);
    });
    toast(`${e.id ? nameOf(e.id, md) : '득점자 모름'} ${e.k === 'og' ? '자책골' : '골'}을 취소했어요`);
  }));
  q('[data-rdone]')?.addEventListener('click', async () => {
    const was = g.done; await upd((c) => { c.done = !c.done; });
    if (!was) { const nx = games.find((x) => x.round > g.round && !x.done); if (nx) ui.round = nx.round; toast(`${g.round}라운드를 마쳤어요`); }
  });
  q('[data-finish]')?.addEventListener('click', async () => { await db.set(mdPath(md.id), { status: 'played' }, { merge: true }); toast('경기를 마쳤어요 — 이제 승리 팀 주장이 MOM을 뽑아요'); });
  // 포지션
  const ti = ui.view;
  root.querySelectorAll('[data-form]').forEach((b) => b.addEventListener('click', () => {
    const nf = b.dataset.form;
    saveLineup(md, ti, [ui.round], (lu) => {
      const old = FORMS[lu.f] || FORMS[DEF_FORM], nw = FORMS[nf], s = {};
      old.forEach(([k], i) => { if (lu.s[k] && nw[i]) s[nw[i][0]] = lu.s[k]; });   // 같은 순서(골키퍼 → 수비 → 미드 → 공격) 자리로 옮김
      return { f: nf, s };
    });
  }));
  q('[data-copyprev]')?.addEventListener('click', () => { const prev = lineupOf(md, ti, ui.round - 1); if (!prev) return toast(`${ui.round - 1}라운드 포지션이 없어요`);
    saveLineup(md, ti, [ui.round], () => ({ f: prev.f, s: { ...prev.s } })).then(() => toast(`${ui.round - 1}라운드 포지션을 가져왔어요`)); });
  q('[data-copyall]')?.addEventListener('click', () => { const cur = lineupOf(md, ti, ui.round); if (!cur) return toast('먼저 이 라운드 포지션을 정해 주세요');
    if (!confirm(`${ui.round}라운드 포지션을 모든 라운드에 똑같이 넣을까요?`)) return;
    saveLineup(md, ti, [...Array(nRounds(md))].map((_, k) => k + 1), () => ({ f: cur.f, s: { ...cur.s } })).then(() => toast('모든 라운드에 적용했어요')); });
  q('[data-clear]')?.addEventListener('click', () => saveLineup(md, ti, [ui.round], () => null));
  dnd(root, md);
}

// ── 끌어다 놓기 (마우스·터치 공통) + 누르고 자리 누르기 ──
function dnd(root, md) {
  const box = root.querySelector('.mm-lineup');
  if (!box || !box.querySelector('[data-drag]')) return;
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    const src = e.target.closest('[data-drag]'); if (!src || e.button > 0) return;
    if (e.pointerType === 'mouse') e.preventDefault();   // 글자 선택·이미지 끌기 막기
    drag = { src, id: src.dataset.drag, from: src.dataset.from, x: e.clientX, y: e.clientY, ghost: null, pid: e.pointerId };
    try { src.setPointerCapture(e.pointerId); } catch {}
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.ghost) {
      if (Math.hypot(dx, dy) < 6) return;
      const r = drag.src.getBoundingClientRect();
      const gh = drag.src.cloneNode(true); gh.classList.add('lp-ghost'); gh.removeAttribute('data-drag');
      Object.assign(gh.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
      drag.ox = e.clientX - r.left; drag.oy = e.clientY - r.top;
      document.body.appendChild(gh); drag.ghost = gh; drag.src.classList.add('lp-lift');
    }
    drag.ghost.style.left = e.clientX - drag.ox + 'px'; drag.ghost.style.top = e.clientY - drag.oy + 'px';
    // 화면 끝으로 끌면 자동으로 스크롤 (명단에서 위쪽 공격수 자리까지)
    const edge = e.clientY < 90 ? -14 : e.clientY > innerHeight - 110 ? 14 : 0;
    if (edge) window.scrollBy(0, edge);
    const tgt = targetAt(e.clientX, e.clientY);
    box.querySelectorAll('.lp-over').forEach((x) => x !== tgt && x.classList.remove('lp-over'));
    tgt?.classList.add('lp-over');
    e.preventDefault();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    box.querySelectorAll('.lp-over').forEach((x) => x.classList.remove('lp-over'));
    if (d.ghost) {
      d.ghost.remove(); d.src.classList.remove('lp-lift');
      if (e.type === 'pointercancel') return;
      const tgt = targetAt(e.clientX, e.clientY);
      if (tgt) place(md, d.id, d.from, tgt.dataset.slot || 'bench');
      return;
    }
    // 눌렀다 뗌: 선수 고르기 → 자리 누르기
    const s = ui.sel;
    if (s && s.id === d.id) { ui.sel = null; rerender(); return; }
    if (s && d.from !== 'bench') { place(md, s.id, s.from, d.from); return; }          // 고른 선수 → 누른 자리 (자리끼리는 맞바꿈)
    if (s && s.from !== 'bench') { place(md, d.id, 'bench', s.from); return; }         // 고른 자리 ← 누른 대기 선수
    ui.sel = { id: d.id, from: d.from }; rerender();
  };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('click', (e) => {
    if (!ui.sel || e.target.closest('[data-drag]')) return;
    const slot = e.target.closest('[data-slot]'), bench = e.target.closest('[data-bench]');
    if (slot) place(md, ui.sel.id, ui.sel.from, slot.dataset.slot);
    else if (bench && ui.sel.from !== 'bench') place(md, ui.sel.id, ui.sel.from, 'bench');
  });
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el?.closest('.mm-lineup [data-slot], .mm-lineup [data-bench]') || null;
  }
}
