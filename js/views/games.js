import { S, currentMatchday, matchdayById, mdPath, nameOf, me } from '../state.js?v=0.1.42';
import { db } from '../store.js?v=0.1.42';
import { rosters, dayStandings, fmtOf, totals, noLabel, teamColor } from '../domain.js?v=0.1.42';
import { TEAM_COLORS } from '../config.js?v=0.1.42';
import { esc, fmtDate, toast } from '../util.js?v=0.1.42';
import { empty, teamChip } from '../ui.js?v=0.1.42';
import { fmtSummary } from './home.js?v=0.1.42';

export function render(root, ctx = {}) {
  const md = ctx.md || (ctx.params?.[0] && matchdayById(ctx.params[0])) || currentMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('경기일이 없어요.')}</section>`; return; }
  const f = fmtOf(md);
  const ros = rosters(md);
  const games = S.games.filter((g) => g.matchdayId === md.id);
  const head = ctx.embedded ? '' : `${ctx.live ? '' : '<a class="back" href="#/results">‹ 경기결과</a>'}<section class="card"><div class="eyebrow">${esc(md.venue || '')}${md.source === 'sheet' ? ' 승률계산기 기록' : ''}</div>
    <h1>${noLabel(md) ? noLabel(md) + ' · ' : ''}${fmtDate(md.date)} 경기</h1><p class="muted small">${esc(fmtSummary(md))}</p></section>`;
  if (!md.teams?.length) {
    root.innerHTML = head + `<section class="card">${empty('팀이 확정되면 경기 결과를 기록할 수 있어요.')}</section>`; return;
  }
  const editable = S.operator && md.status !== 'played';
  const sum = f.scoring === 'sum';

  root.innerHTML = head + `
    ${sum ? scoreboard(md, games) : standingsCard(md, games)}
    <section class="card">
      ${md.source === 'sheet' ? '<p class="muted small">승률계산기에서 가져온 기록이에요. 라운드별 점수 없이 최종 스코어·득점·MOM·지각·자책골이 들어 있어요.</p>' : ''}
      <h2>${md.source === 'sheet' ? '스코어' : sum ? '라운드' : '경기'} ${games.length ? `<small>${games.filter((g) => g.done).length}/${games.length} 완료</small>` : ''}</h2>
      ${games.length ? `<ol class="games">${games.map((g, i) => `
        <li class="${g.done ? 'done' : ''}">
          <span class="gno">${md.source === 'sheet' ? '최종' : sum ? `${g.round}R` : i + 1}${sum ? '' : `<small>R${g.round}</small>`}</span>
          <span class="ta">${teamChip(md, g.a)}</span>
          <span class="sc">${g.done || g.sa || g.sb ? `${g.sa} : ${g.sb}` : 'vs'}</span>
          <span class="tb">${teamChip(md, g.b)}</span>
        </li>`).join('')}</ol>` : empty('아직 라운드가 없어요.')}
      ${scorersHtml(md, games)}
    </section>
    ${rosterCard(md, ros, games)}
    ${extrasCard(md, ros, editable)}
    ${editable ? `<section class="card op"><h2>운영</h2><p class="muted small">라운드 점수·득점자는 '경기' 단계(경기모드 기록 화면)에서 기록해요.</p>
      <div class="row wrap"><button class="btn" data-finish ${games.length && games.every((g) => g.done) ? '' : 'disabled'}>경기 종료 · 기록 반영</button></div>
      ${games.length && !games.every((g) => g.done) ? '<p class="muted small">모든 라운드를 종료하면 경기를 마칠 수 있어요.</p>' : ''}</section>` : ''}
    ${S.operator && md.status === 'played' ? `<section class="card op"><button class="btn ghost" data-unfinish>결과 다시 수정하기</button></section>` : ''}`;

  root.querySelector('[data-finish]')?.addEventListener('click', async () => {
    await db.set(mdPath(md.id), { status: 'played' }, { merge: true }); toast('기록에 반영했어요');
  });
  root.querySelector('[data-unfinish]')?.addEventListener('click', () => db.set(mdPath(md.id), { status: 'teams' }, { merge: true }));
  bindExtras(root, md);
}

function scoreboard(md, games) {
  const t = totals(md, games);
  const done = games.length && games.every((g) => g.done);
  const res = (i) => (!done ? '' : t[i] > t[1 - i] ? '<em class="res w">승</em>' : t[i] < t[1 - i] ? '<em class="res l">패</em>' : '<em class="res d">무</em>');
  return `<section class="card board">
    <div class="sb-team">${teamChip(md, 0)}${res(0)}</div>
    <div class="sb-score"><b>${t[0] ?? 0}</b><span>:</span><b>${t[1] ?? 0}</b></div>
    <div class="sb-team">${teamChip(md, 1)}${res(1)}</div>
    ${done ? '' : '<p class="muted small sb-note">진행 중 · 라운드 점수 합산</p>'}
  </section>`;
}

function standingsCard(md, games) {
  const st = dayStandings(md, games);
  return `<section class="card"><h2>순위</h2>
    <table class="tbl standings"><thead><tr><th></th><th>팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>
    ${st.map((r, i) => `<tr><td>${i + 1}</td><td>${teamChip(md, r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}
    </tbody></table></section>`;
}

function scorersHtml(md, games) {
  const goals = {}, og = {};
  games.forEach((g) => {
    Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; });
    Object.entries(g.og || {}).forEach(([id, n]) => { og[id] = (og[id] || 0) + n; });
  });
  const list = Object.entries(goals).sort((a, b) => b[1] - a[1]);
  const ogl = Object.entries(og);
  if (!list.length && !ogl.length) return '';
  return `<div class="scorers">${list.length ? `<span>⚽ ${list.map(([id, n]) => `${esc(nameOf(id, md))}${n > 1 ? ` ${n}` : ''}`).join(', ')}</span>` : ''}
    ${ogl.length ? `<span class="muted">자책 ${ogl.map(([id, n]) => `${esc(nameOf(id, md))}${n > 1 ? ` ${n}` : ''}`).join(', ')}</span>` : ''}</div>`;
}

// MOM · 지각 — 결과 화면에서 따로 나눠 보여 줌
function extrasCard(md, ros, canEdit) {
  const mom = new Set(md.mom || []), late = md.late || {};
  const lateIds = Object.keys(late).filter((k) => late[k]);
  const teamOf = (id) => ros.findIndex((ids) => ids.includes(id));
  const people = (ids) => ids.map((id) => { const t = teamOf(id); return `<span class="pchip">${t >= 0 ? `<i style="background:${TEAM_COLORS.find((c) => c.key === teamColor(md, t))?.hex || '#94a3b8'}"></i>` : ''}${esc(nameOf(id, md))}</span>`; }).join('');
  if (!canEdit) {
    return `${mom.size ? `<section class="card mom-card"><h2>🏆 MOM</h2><div class="pchips">${people([...mom])}</div></section>` : ''}
      ${lateIds.length ? `<section class="card late-card"><h2>⏰ 지각 <small>${lateIds.length}명</small></h2><div class="pchips">${people(lateIds)}</div></section>` : ''}`;
  }
  const chips = (cls, on) => ros.map((ids, ti) => `<div class="ex-team">${teamChip(md, ti)}<div class="ex-names">${ids.map((id) =>
    `<button class="xchip ${cls} ${on(id) ? 'on' : ''}" data-${cls}="${id}">${esc(nameOf(id, md))}</button>`).join('')}</div></div>`).join('');
  return `<section class="card op mom-card"><h2>🏆 MOM <small>${mom.size ? [...mom].map((id) => esc(nameOf(id, md))).join(', ') : '선택 안 함'}</small></h2>
      <details><summary>MOM 고르기</summary>${chips('mom', (id) => mom.has(id))}</details></section>
    <section class="card op late-card"><h2>⏰ 지각 <small>${lateIds.length ? lateIds.map((id) => esc(nameOf(id, md))).join(', ') : '없음'}</small></h2>
      <details><summary>지각 고르기</summary>${chips('late', (id) => late[id])}</details></section>`;
}
function bindExtras(root, md) {
  root.querySelectorAll('[data-mom]').forEach((b) => b.addEventListener('click', () => db.tx(mdPath(md.id), (cur) => {
    const s = new Set(cur.mom || []); const id = b.dataset.mom;
    if (s.has(id)) s.delete(id); else s.add(id);
    cur.mom = [...s]; return cur;
  })));
  root.querySelectorAll('[data-late]').forEach((b) => b.addEventListener('click', () => db.tx(mdPath(md.id), (cur) => {
    cur.late = cur.late || {}; const id = b.dataset.late;
    if (cur.late[id]) delete cur.late[id]; else cur.late[id] = true;
    return cur;
  })));
  // 다시 그려져도 펼침 상태 유지
  root.querySelectorAll('.op details').forEach((d, i) => {
    const k = 'teamapp:ex' + i;
    if (sessionStorage.getItem(k) != null) d.open = sessionStorage.getItem(k) === '1';
    d.addEventListener('toggle', () => sessionStorage.setItem(k, d.open ? '1' : '0'));
  });
}

// 팀 명단 (득점·MOM 표시)
function rosterCard(md, ros, games) {
  const goals = {};
  games.forEach((g) => Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; }));
  const mom = new Set(md.mom || []);
  return `<section class="card"><h2>팀 명단</h2><div class="teams-grid n${ros.length}">${ros.map((ids, ti) => `
    <div class="team-card ${ids.includes(me.id) ? 'mine' : ''}"><header>${teamChip(md, ti)}<small>${ids.length}명</small></header>
      <ol>${ids.map((id) => `<li>${esc(nameOf(id, md))}${goals[id] ? ` <span class="g">⚽${goals[id] > 1 ? goals[id] : ''}</span>` : ''}${mom.has(id) ? ' <b class="mom">MOM</b>' : ''}</li>`).join('')}</ol></div>`).join('')}</div></section>`;
}
