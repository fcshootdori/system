import { S, currentMatchday, mdPath, nameOf, me } from '../state.js';
import { db } from '../store.js';
import { TEAM_COLORS } from '../config.js';
import { confirmed, draftState, rosters, fmtOf, teamColor } from '../domain.js';
import { esc, fmtDate, toast, randomToken, shuffle, copyText } from '../util.js';
import { empty, colorChip, teamLabel, teamChip } from '../ui.js';

export function render(root) {
  const md = currentMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('진행 중인 경기일이 없어요.')}</section>`; return; }
  const caps = md.captains || [];
  const myCap = caps.findIndex((c) => S.captainToken && c.token === S.captainToken);
  const head = `<section class="card"><div class="eyebrow">${fmtDate(md.date)} ${esc(md.venue || '')}</div>
    <h1>${md.status === 'teams' || md.status === 'played' ? '팀 구성' : '주장 · 드래프트'}</h1>
    ${myCap >= 0 ? `<p class="mine">이 기기는 <b>${esc(nameOf(caps[myCap].id, md))}</b> 주장으로 참여 중이에요.</p>` : ''}</section>`;

  if (md.status === 'teams' || md.status === 'played') { root.innerHTML = head + teamsView(md); bindTeams(root, md); return; }
  if (!caps.length || md.status === 'captains' && !md.draftStarted) {
    root.innerHTML = head + (S.operator ? captainPicker(md) : `<section class="card">${empty('운영진이 주장을 정하고 있어요.')}</section>`);
    if (S.operator) bindCaptainPicker(root, md);
    return;
  }
  root.innerHTML = head + board(md, myCap);
  bindBoard(root, md, myCap);
}

// ── 1. 주장 선정 ──
let capSel = [];
function captainPicker(md) {
  const f = fmtOf(md), n = f.teams;
  const capName = (i) => f.teamMode === 'fixed' ? `${teamLabel(md, i)} 주장` : `${i + 1}번 주장`;
  const list = confirmed(md);
  const pre = (md.captains || []).map((c) => c.id);
  if (!capSel.length && pre.length) capSel = pre;
  capSel = capSel.filter((id) => list.some((a) => a.id === id));
  return `<section class="card op">
    <h2>주장 ${n}명 선택 <small>${capSel.length}/${n}</small></h2>
    <p class="muted small">누른 순서가 지명 순서예요${f.teamMode === 'fixed' ? ` (1번 주장 = ${teamLabel(md, 0)})` : ''}. 순서는 아래에서 바꾸거나 무작위로 섞을 수 있어요.</p>
    ${list.length ? `<div class="name-grid">${list.map((a) => {
      const k = capSel.indexOf(a.id);
      return `<button class="name-btn ${k >= 0 ? 'on' : ''}" data-cap="${a.id}">${k >= 0 ? `<b>${k + 1}</b> ` : ''}${esc(nameOf(a.id, md))}</button>`;
    }).join('')}</div>` : empty('확정된 참가자가 없어요.')}
    ${capSel.length ? `<ol class="order">${capSel.map((id, i) => `<li><span>${i + 1}. ${esc(nameOf(id, md))} <small class="muted">${capName(i)}</small></span>
      <button class="icon-btn" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button class="icon-btn" data-down="${i}" ${i < capSel.length - 1 ? '' : 'disabled'}>↓</button></li>`).join('')}</ol>` : ''}
    <div class="row wrap">
      <button class="btn ghost" data-shuffle ${capSel.length > 1 ? '' : 'disabled'}>순서 무작위</button>
      <button class="btn" data-start ${capSel.length === n ? '' : 'disabled'}>주장 확정 · 드래프트 시작</button>
    </div></section>`;
}
function bindCaptainPicker(root, md) {
  const n = fmtOf(md).teams;
  const rer = () => render(root);
  root.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.cap;
    capSel = capSel.includes(id) ? capSel.filter((x) => x !== id) : capSel.length < n ? [...capSel, id] : capSel;
    rer();
  }));
  root.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.up; [capSel[i - 1], capSel[i]] = [capSel[i], capSel[i - 1]]; rer(); }));
  root.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.down; [capSel[i + 1], capSel[i]] = [capSel[i], capSel[i + 1]]; rer(); }));
  root.querySelector('[data-shuffle]')?.addEventListener('click', () => { capSel = shuffle(capSel); rer(); });
  root.querySelector('[data-start]')?.addEventListener('click', async () => {
    await db.tx(mdPath(md.id), (cur) => {
      cur.captains = capSel.map((id) => ({ id, token: randomToken(), color: null }));
      cur.picks = []; cur.teams = []; cur.status = 'drafting'; cur.draftStarted = true;
      return cur;
    });
    capSel = []; toast('드래프트를 시작했어요 — 주장 링크를 보내 주세요');
  });
}

// ── 2. 드래프트 보드 ──
function board(md, myCap) {
  const ds = draftState(md);
  const ros = rosters(md);
  const canPick = (S.operator || myCap === ds.turn) && ds.turn != null;
  const caps = md.captains;
  const usedColors = new Set(caps.map((c) => c.color).filter(Boolean));
  const fixed = fmtOf(md).teamMode === 'fixed';
  const colorsReady = fixed || caps.every((c) => c.color);
  return `
    ${ds.turn != null ? `<section class="card turn ${myCap === ds.turn ? 'my' : ''}">
      <div class="eyebrow">${ds.picks.length + 1} / ${ds.pool.length} 지명</div>
      <h2>${esc(nameOf(caps[ds.turn].id, md))} 주장 차례${myCap === ds.turn ? ' — 선수를 골라 주세요' : ''}</h2>
      <p class="muted small">순서: ${ds.seq.map((t, k) => `<span class="${k === ds.picks.length ? 'now' : k < ds.picks.length ? 'past' : ''}">${t + 1}</span>`).join('-')}</p>
    </section>` : `<section class="card turn done"><h2>드래프트 완료</h2><p class="muted small">${fixed ? '운영진이 팀을 확정하면 팀 공지를 만들 수 있어요.' : '각 주장이 팀 색을 고른 뒤 운영진이 팀을 확정해요.'}</p></section>`}

    <section class="teams-grid n${caps.length}">${ros.map((ids, i) => `
      <div class="team-card ${myCap === i ? 'mine' : ''} ${ds.turn === i ? 'turn' : ''}">
        <header>${teamColor(md, i) ? teamChip(md, i) : `<span class="chip">${i + 1}번 주장</span>`}<small>${ids.length}명</small></header>
        <ol>${ids.map((id, k) => `<li>${k === 0 ? '<b class="cap">C</b>' : ''}${esc(nameOf(id, md))}</li>`).join('')}</ol>
        ${!fixed && ds.done && (S.operator || myCap === i) ? `<div class="color-pick">${TEAM_COLORS.map((c) =>
          `<button class="swatch ${caps[i].color === c.key ? 'on' : ''}" style="--c:${c.hex}" data-color="${i}:${c.key}" ${usedColors.has(c.key) && caps[i].color !== c.key ? 'disabled' : ''} title="${c.label}"></button>`).join('')}</div>` : ''}
      </div>`).join('')}</section>

    ${ds.remaining.length ? `<section class="card"><h2>남은 선수 ${ds.remaining.length}명</h2>
      <div class="name-grid">${ds.remaining.map((id) => `<button class="name-btn" data-pick="${id}" ${canPick ? '' : 'disabled'}>${esc(nameOf(id, md))}</button>`).join('')}</div>
    </section>` : ''}

    ${S.operator ? `<section class="card op"><h2>운영</h2>
      <div class="cap-links">${caps.map((c, i) => `<div><span>${i + 1}. ${esc(nameOf(c.id, md))}</span>
        <button class="btn ghost sm" data-link="${c.token}">주장 링크 복사</button></div>`).join('')}</div>
      <div class="row wrap">
        <button class="btn ghost" data-undo ${ds.picks.length ? '' : 'disabled'}>마지막 지명 취소</button>
        <button class="btn ghost danger" data-reset>주장 다시 정하기</button>
        <button class="btn" data-final ${ds.done && colorsReady ? '' : 'disabled'}>팀 확정</button>
      </div>
      ${ds.done && !colorsReady ? '<p class="muted small">모든 팀 색이 정해지면 확정할 수 있어요.</p>' : ''}
    </section>` : ''}`;
}
function bindBoard(root, md, myCap) {
  root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.pick;
    const res = await db.tx(mdPath(md.id), (cur) => {
      const ds = draftState(cur);
      if (ds.turn == null || !ds.remaining.includes(id)) return null;
      if (!S.operator && myCap !== ds.turn) return null;
      cur.picks = [...(cur.picks || []), { id, team: ds.turn, at: Date.now() }];
      return cur;
    });
    if (!res) toast('지명할 수 없어요 — 화면을 새로 확인해 주세요');
  }));
  root.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', async () => {
    const [i, key] = b.dataset.color.split(':');
    await db.tx(mdPath(md.id), (cur) => {
      if (cur.captains.some((c, k) => k !== +i && c.color === key)) return null;
      cur.captains[+i].color = key; return cur;
    });
  }));
  root.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () =>
    copyText(`${location.origin}${location.pathname}?c=${b.dataset.link}#/draft`)));
  root.querySelector('[data-undo]')?.addEventListener('click', () =>
    db.tx(mdPath(md.id), (cur) => { cur.picks = (cur.picks || []).slice(0, -1); return cur; }));
  root.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!confirm('주장과 지명 내역을 모두 지우고 다시 시작할까요?')) return;
    await db.tx(mdPath(md.id), (cur) => { cur.captains = []; cur.picks = []; cur.teams = []; cur.status = 'captains'; cur.draftStarted = false; return cur; });
  });
  root.querySelector('[data-final]')?.addEventListener('click', async () => {
    await db.tx(mdPath(md.id), (cur) => {
      cur.teams = rosters(cur).map((members, i) => ({ color: teamColor(cur, i), members }));
      cur.status = 'teams'; return cur;
    });
    toast('팀을 확정했어요 — 공지 이미지를 만들 수 있어요');
  });
}

// ── 3. 확정된 팀 (운영진은 선수 이동으로 밸런스 조정) ──
function teamsView(md) {
  const ros = rosters(md);
  return `<section class="teams-grid n${ros.length}">${ros.map((ids, i) => `
    <div class="team-card ${ids.includes(me.id) ? 'mine' : ''}">
      <header>${teamChip(md, i)}<small>${ids.length}명</small></header>
      <ol>${ids.map((id, k) => `<li>${k === 0 ? '<b class="cap">C</b>' : ''}${esc(nameOf(id, md))}
        ${S.operator && k > 0 && md.status !== 'played' ? `<select class="move" data-move="${i}:${id}"><option value="">이동</option>${ros.map((_, j) => j !== i ? `<option value="${j}">${teamLabel(md, j)}</option>` : '').join('')}</select>` : ''}</li>`).join('')}</ol>
    </div>`).join('')}</section>
    ${S.operator && md.status === 'teams' ? `<section class="card op"><div class="row wrap">
      <a class="btn" href="#/notice">팀 공지 이미지 만들기</a>
      <button class="btn ghost danger" data-reopen>드래프트로 되돌리기</button></div></section>` : ''}`;
}
function bindTeams(root, md) {
  root.querySelectorAll('[data-move]').forEach((s) => s.addEventListener('change', async () => {
    if (s.value === '') return;
    const [from, id] = s.dataset.move.split(':'); const to = +s.value;
    await db.tx(mdPath(md.id), (cur) => {
      cur.teams[+from].members = cur.teams[+from].members.filter((x) => x !== id);
      cur.teams[to].members.push(id); return cur;
    });
    toast('선수를 옮겼어요');
  }));
  root.querySelector('[data-reopen]')?.addEventListener('click', async () => {
    if (!confirm('확정을 풀고 드래프트 화면으로 돌아갈까요? (선수 이동 내역은 지워져요)')) return;
    await db.tx(mdPath(md.id), (cur) => { cur.teams = []; cur.status = 'drafting'; return cur; });
  });
}
