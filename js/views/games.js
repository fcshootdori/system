import { S, currentMatchday, matchdayById, mdPath, nameOf, me } from '../state.js?v=0.1.29';
import { db, newId } from '../store.js?v=0.1.29';
import { rosters, schedule, dayStandings, fmtOf, totals, noLabel, teamColor } from '../domain.js?v=0.1.29';
import { TEAM_COLORS } from '../config.js?v=0.1.29';
import { esc, fmtDate, toast } from '../util.js?v=0.1.29';
import { modal, empty, teamChip, teamLabel } from '../ui.js?v=0.1.29';
import { fmtSummary } from './home.js?v=0.1.29';

let openGame = null; // 편집 중인 경기 id

let lastCtx = {};
export function render(root, ctx = {}) {
  lastCtx = ctx;
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
        <li class="${g.done ? 'done' : ''}" ${S.operator ? `data-game="${g.id}"` : ''}>
          <span class="gno">${md.source === 'sheet' ? '최종' : sum ? `${g.round}R` : i + 1}${sum ? '' : `<small>R${g.round}</small>`}</span>
          <span class="ta">${teamChip(md, g.a)}</span>
          <span class="sc">${g.done || g.sa || g.sb ? `${g.sa} : ${g.sb}` : 'vs'}</span>
          <span class="tb">${teamChip(md, g.b)}</span>
        </li>`).join('')}</ol>` : empty('아직 라운드가 없어요.')}
      ${scorersHtml(md, games)}
    </section>
    ${rosterCard(md, ros, games)}
    ${extrasCard(md, ros, editable)}
    ${editable ? `<section class="card op"><h2>운영</h2><div class="row wrap">
      ${games.length ? '' : `<button class="btn" data-sched>${sum ? `${f.rounds}라운드 만들기` : `대진 만들기 (${ros.length}팀 × ${f.rounds}라운드)`}</button>`}
      <button class="btn ghost" data-addgame>${sum ? '라운드' : '경기'} 추가</button>
      <button class="btn" data-finish ${games.length && games.every((g) => g.done) ? '' : 'disabled'}>경기일 종료 · 기록 반영</button>
    </div>${games.length && !games.every((g) => g.done) ? '<p class="muted small">모든 라운드를 "종료"로 표시하면 경기일을 마칠 수 있어요.</p>' : ''}</section>` : ''}
    ${S.operator && md.status === 'played' ? `<section class="card op"><button class="btn ghost" data-unfinish>결과 다시 수정하기</button></section>` : ''}`;

  root.querySelectorAll('[data-game]').forEach((li) => li.addEventListener('click', () => {
    if (md.status === 'played') return toast('"결과 다시 수정하기"를 누르면 고칠 수 있어요');
    openGame = li.dataset.game; editGame(md);
  }));
  root.querySelector('[data-sched]')?.addEventListener('click', async () => {
    const plan = schedule(ros.length, f.rounds);
    await Promise.all(plan.map((p, i) => db.set('games/' + newId() + i, { matchdayId: md.id, date: md.date, order: i, round: sum ? i + 1 : p.round, a: p.a, b: p.b, sa: 0, sb: 0, goals: {}, og: {}, done: false })));
    toast(`${plan.length}${sum ? '라운드' : '경기'}를 만들었어요`);
  });
  root.querySelector('[data-addgame]')?.addEventListener('click', () => addGame(md, games, sum));
  root.querySelector('[data-finish]')?.addEventListener('click', async () => {
    await db.set(mdPath(md.id), { status: 'played' }, { merge: true }); toast('기록에 반영했어요');
  });
  root.querySelector('[data-unfinish]')?.addEventListener('click', () => db.set(mdPath(md.id), { status: 'teams' }, { merge: true }));
  bindExtras(root, md);
  if (openGame && document.querySelector('.modal-wrap[data-game-modal]')) editGame(md);
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

function addGame(md, games, sum) {
  const ros = rosters(md);
  const last = games[games.length - 1];
  const add = (a, b) => db.set('games/' + newId(), { matchdayId: md.id, date: md.date, order: (last?.order ?? -1) + 1,
    round: sum ? (last?.round || 0) + 1 : last?.round || 1, a, b, sa: 0, sb: 0, goals: {}, og: {}, done: false });
  if (sum && ros.length === 2) { add(0, 1); toast('라운드를 추가했어요'); return; }
  const opt = ros.map((_, i) => `<option value="${i}">${teamLabel(md, i)}</option>`).join('');
  const { el, close } = modal('경기 추가', `<form class="stack">
    <label>팀 A<select name="a">${opt}</select></label><label>팀 B<select name="b">${opt}</select></label>
    <button class="btn">추가</button></form>`);
  el.querySelector('[name=b]').value = '1';
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); const a = +e.target.a.value, b = +e.target.b.value;
    if (a === b) return toast('서로 다른 팀을 골라 주세요');
    await add(a, b); close();
  });
}

function editGame(md) {
  const g = S.games.find((x) => x.id === openGame);
  let wrap = document.querySelector('.modal-wrap[data-game-modal]');
  if (!g) { openGame = null; wrap?.remove(); return; }
  const ros = rosters(md);
  const sum = fmtOf(md).scoring === 'sum';
  const side = (ti, key) => `<div class="gside">
    <header>${teamChip(md, ti)}</header>
    <div class="score"><button class="icon-btn" data-sc="${key}:-1">−</button><b>${g[key]}</b><button class="icon-btn" data-sc="${key}:1">＋</button></div>
    <ul>${(ros[ti] || []).map((id) => `<li><span class="pn">${esc(nameOf(id, md))}${g.og?.[id] ? ` <small class="ogc">자책${g.og[id] > 1 ? g.og[id] : ''}</small>` : ''}</span>
      <span class="goal"><button class="icon-btn sm" data-goal="${id}:-1:${key}">−</button><b>${g.goals?.[id] || 0}</b><button class="icon-btn sm" data-goal="${id}:1:${key}">⚽</button><button class="icon-btn sm og ${g.og?.[id] ? 'on' : ''}" data-og="${id}:${key}" title="자책골">OG</button></span></li>`).join('')}</ul></div>`;
  const title = sum ? `${g.round}라운드` : `${S.games.filter((x) => x.matchdayId === md.id).indexOf(g) + 1}경기`;
  const body = `
    <p class="muted small">⚽ 선수 골과 팀 점수가 함께 올라가요 · OG는 자책골(상대 점수 +1, 다시 누르면 취소) · 득점자를 모르면 점수 ＋만 누르세요.</p>
    <div class="gedit">${side(g.a, 'sa')}${side(g.b, 'sb')}</div>
    <div class="row wrap"><label class="inline"><input type="checkbox" data-done ${g.done ? 'checked' : ''}> 이 ${sum ? '라운드' : '경기'} 종료</label>
      <button class="btn ghost danger sm" data-delgame>삭제</button></div>`;
  if (wrap) { wrap.querySelector('.modal-body').innerHTML = body; return; } // 열려 있으면 내용만 갱신

  const { el, close } = modal(title, body, { wide: true });
  wrap = el.parentElement;
  wrap.setAttribute('data-game-modal', '');
  const path = 'games/' + g.id;
  const upd = (fn) => db.tx(path, (cur) => { if (!cur) return null; cur.goals = cur.goals || {}; cur.og = cur.og || {}; fn(cur); return cur; });
  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) { openGame = null; return; }
    const sc = e.target.closest('[data-sc]'), gl = e.target.closest('[data-goal]'), og = e.target.closest('[data-og]');
    if (sc) { const [k, d] = sc.dataset.sc.split(':'); upd((c) => { c[k] = Math.max(0, (c[k] || 0) + +d); }); }
    if (gl) {
      const [id, d, k] = gl.dataset.goal.split(':');
      upd((c) => {
        const before = c.goals[id] || 0, after = Math.max(0, before + +d);
        if (after) c.goals[id] = after; else delete c.goals[id];
        c[k] = Math.max(0, (c[k] || 0) + (after - before));
      });
    }
    if (og) {
      const [id, k] = og.dataset.og.split(':'); const opp = k === 'sa' ? 'sb' : 'sa';
      upd((c) => {
        if (c.og[id]) { c.og[id]--; if (!c.og[id]) delete c.og[id]; c[opp] = Math.max(0, (c[opp] || 0) - 1); }
        else { c.og[id] = 1; c[opp] = (c[opp] || 0) + 1; }
      });
    }
    if (e.target.closest('[data-delgame]')) {
      if (!confirm('삭제할까요?')) return;
      await db.del(path); openGame = null; close();
    }
  });
  wrap.addEventListener('change', (e) => { if (e.target.matches('[data-done]')) upd((c) => { c.done = e.target.checked; }); });
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
