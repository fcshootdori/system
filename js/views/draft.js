import { S, nextMatchday, matchdayById, captainMatchday, mdPath, nameOf, me } from '../state.js';
import { db } from '../store.js';
import { TEAM_COLORS } from '../config.js';
import { confirmed, draftState, draftPhase, rosters, fmtOf, teamColor, appGroups, defaultSectionColors } from '../domain.js';
import { TEAM_COLORS as TC } from '../config.js';
import { modal } from '../ui.js';
import { esc, fmtDate, toast, randomToken, shuffle, copyText } from '../util.js';
import { empty, colorChip, teamLabel, teamChip } from '../ui.js';

let lastCtx = {};
export function render(root, ctx = {}) {
  lastCtx = ctx;
  const md = ctx.md || (ctx.params?.[0] && matchdayById(ctx.params[0])) || captainMatchday() || nextMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('진행 중인 경기일이 없어요.')}</section>`; return; }
  const caps = md.captains || [];
  const myCap = caps.findIndex((c) => (S.auth?.pid && c.id === S.auth.pid) || (S.captainToken && c.token === S.captainToken));
  const head = ctx.embedded ? '' : `<a class="back" href="#/home">‹ 홈</a><section class="card"><div class="eyebrow">${fmtDate(md.date)} ${esc(md.venue || '')}</div>
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
  const capName = (i) => (n === 2 ? ['왼쪽 팀 주장', '오른쪽 팀 주장'][i] : f.teamMode === 'fixed' ? `${teamLabel(md, i)} 주장` : `${i + 1}번 주장`);
  const list = confirmed(md);
  const pre = (md.captains || []).map((c) => c.id);
  if (!capSel.length && pre.length) capSel = pre;
  capSel = capSel.filter((id) => list.some((a) => a.id === id));
  const groups = appGroups(md);
  const groupCard = groups.size >= 2 ? `<section class="card op"><h2>카페 댓글 구역대로 팀 나누기</h2>
    <p class="muted small">${[...groups].map(([g, ids]) => `<b>${esc(g)}</b> ${ids.length}명`).join(' · ')} — 드래프트 없이 댓글 구역 그대로 팀을 만들고, 팀 확정 단계에서 선수를 옮겨 밸런스를 맞출 수 있어요.</p>
    <button class="btn" data-groupsplit>구역대로 팀 만들기</button></section>` : '';
  return groupCard + `<section class="card op">
    <h2>주장 ${n}명 선택 <small>${capSel.length}/${n}</small></h2>
    <p class="muted small">${n === 2 ? '1번 주장은 축구장 왼쪽, 2번 주장은 오른쪽 팀이에요.' : '누른 순서대로 1번·2번… 팀 주장이에요.'} 지명 순서는 드래프트에서 우선순위 추첨으로 정해요.</p>
    ${list.length ? `<div class="name-grid">${list.map((a) => {
      const k = capSel.indexOf(a.id);
      return `<button class="name-btn ${k >= 0 ? 'on' : ''}" data-cap="${a.id}">${k >= 0 ? `<b>${k + 1}</b> ` : ''}${esc(nameOf(a.id, md))}</button>`;
    }).join('')}</div>` : empty('확정된 참가자가 없어요.')}
    ${capSel.length ? `<ol class="order">${capSel.map((id, i) => `<li><span>${i + 1}. ${esc(nameOf(id, md))} <small class="muted">${capName(i)}</small></span>
      <button class="icon-btn" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button class="icon-btn" data-down="${i}" ${i < capSel.length - 1 ? '' : 'disabled'}>↓</button></li>`).join('')}</ol>` : ''}
    <div class="row wrap">
      <button class="btn ghost" data-shuffle ${capSel.length > 1 ? '' : 'disabled'}>좌우 바꾸기</button>
      <button class="btn" data-start ${capSel.length === n ? '' : 'disabled'}>주장 확정 · 드래프트 시작</button>
    </div></section>`;
}
function bindCaptainPicker(root, md) {
  root.querySelector('[data-groupsplit]')?.addEventListener('click', () => groupSplit(md));
  const n = fmtOf(md).teams;
  const rer = () => render(root, lastCtx);
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
      cur.teamNames = capSel.map((id) => `${nameOf(id, cur)}팀`);   // 기본 팀 이름: 주장 닉네임 + 팀 (운영진이 바꿀 수 있음)
      cur.picks = []; cur.teams = []; cur.order = null; cur.cards = null; cur.pending = null; cur.status = 'drafting'; cur.draftStarted = true;
      return cur;
    });
    capSel = []; toast('드래프트를 시작했어요 — 주장 링크를 보내 주세요');
  });
}

// ── 2. 드래프트 (WD_FUTSAL 드래프트 방과 같은 흐름, 2팀은 축구장 왼쪽·오른쪽) ──
//  ① 팀 색 선택 → ② 우선순위 추첨(카드) → ③ 선수 선택 1-2-2-1-1-2-2-1 … (고르고 '선택 완료') → ④ 팀 확정
const PH = [['color', '팀 색 선택'], ['order', '우선순위 추첨'], ['pick', '선수 선택'], ['done', '팀 확정']];
const colorOf = (key) => TEAM_COLORS.find((c) => c.key === key) || null;
const palette = (md) => {
  const keys = fmtOf(md).fixedColors?.length ? fmtOf(md).fixedColors : TEAM_COLORS.map((c) => c.key);
  return keys.map(colorOf).filter(Boolean);
};
const seen = new Set();      // 새로 들어온 선수 표시(한 번만 튀어오르게)
let wasMyTurn = false;

// 팀 반쪽(축구장 왼쪽/오른쪽): 주장 · 팀 이름 · 색 · 선수
function half(md, i, { ph, ds, myCap, final }) {
  const caps = md.captains || [];
  const ids = rosters(md)[i] || [];
  const col = colorOf(teamColor(md, i));
  const rank = (md.order || []).indexOf(i);
  const turn = ph === 'pick' && ds.turn === i;
  const mine = myCap === i;
  const canColor = ph === 'color' && (S.operator || mine);
  const used = new Set(caps.map((c) => c.color).filter(Boolean));
  const pend = !final && md.pending && md.pending.team === i ? md.pending.id : null;
  const last = (md.picks || []).slice(-1)[0];
  const hasCap = !!caps[i];
  const others = hasCap ? ids.slice(1) : ids;   // 이벤트·구역으로 만든 팀은 주장 없이 전원
  const player = (id) => {
    const key = md.id + ':' + id; const nw = !seen.has(key); seen.add(key);
    const undo = !final && S.operator && last && last.id === id && last.team === i;
    const move = final && S.operator && md.status !== 'played';
    return `<li class="pl ${nw ? 'new' : ''}"><span class="shirt" aria-hidden="true"></span><b>${esc(nameOf(id, md))}</b>
      ${undo ? `<button class="x" data-unpick title="마지막 지명 취소">✕</button>` : ''}
      ${move ? (rosters(md).length === 2 ? `<button class="mv" data-swap="${i}:${id}" title="${esc(teamLabel(md, 1 - i))}(으)로 옮기기">${i === 0 ? '→' : '←'}</button>`
        : `<select class="move" data-move="${i}:${id}"><option value="">이동</option>${rosters(md).map((_, j) => j !== i ? `<option value="${j}">${teamLabel(md, j)}</option>` : '').join('')}</select>`) : ''}</li>`;
  };
  return `<div class="half h${i} ${turn ? 'turn' : ''} ${mine ? 'mine' : ''} ${col ? '' : 'nocolor'}" style="${col ? `--tc:${col.hex};--ti:${col.text}` : ''}">
    <div class="h-hd">
      ${rank >= 0 && ph !== 'order' ? `<em class="rank">${rank + 1}순위</em>` : ''}
      ${hasCap ? `<span class="hcap">👑 ${esc(nameOf(caps[i].id, md))}</span>` : ''}
      <span class="tn">${esc(teamLabel(md, i))}${col && md.teamNames?.[i] ? ` · ${col.label}` : ''}</span>
      <span class="cnt"><b>${ids.length}</b>명</span>
      ${mine ? '<span class="meb">내 팀</span>' : ''}
    </div>
    ${canColor ? `<div class="h-sw">${palette(md).map((c) => { const by = caps.findIndex((x) => x.color === c.key);
      return `<button class="csw ${caps[i].color === c.key ? 'on' : ''}" style="--c:${c.hex};--ct:${c.text}" data-color="${i}:${c.key}" ${by >= 0 && by !== i ? 'disabled' : ''}>${c.label}${by >= 0 && by !== i ? '<small>선택됨</small>' : ''}</button>`; }).join('')}</div>` : ''}
    <ol class="h-list">${others.map(player).join('')}${pend ? `<li class="pl pend"><span class="shirt" aria-hidden="true"></span><b>${esc(nameOf(pend, md))}</b><small>선택 중</small></li>` : ''}</ol>
    ${turn ? `<div class="h-turn">${mine ? '내 차례예요!' : '지명 차례'}</div>` : ''}
  </div>`;
}

// 축구장: 2팀이면 왼쪽·오른쪽, 그 밖에는 나란히
function pitch(md, opt) {
  const n = rosters(md).length;
  const ds = opt.ds;
  const ball = opt.ph === 'pick' && ds.turn != null ? (ds.turn === 0 ? 'l' : 'r') : '';
  return `<section class="pitch n${n}">
    <div class="lines" aria-hidden="true"><i class="mid"></i><i class="circ"></i><i class="box l"></i><i class="box r"></i></div>
    ${n === 2 ? `<div class="ball ${ball}" aria-hidden="true">⚽</div>` : ''}
    ${Array.from({ length: n }, (_, i) => half(md, i, opt)).join('')}
  </section>`;
}

// 위쪽 진행판: 단계 표시 + 지금 할 일
function stepper2(ph) {
  const cur = ph === 'allin' ? 2 : PH.findIndex(([k]) => k === ph);
  return `<ol class="dsteps">${PH.map(([k, l], n) => `<li class="${n < cur ? 'done' : n === cur ? 'now' : ''}"><i>${n + 1}</i>${l}</li>`).join('')}</ol>`;
}
function panel(md, ph, ds, myCap) {
  const caps = md.captains || [];
  const nm = (i) => esc(teamLabel(md, i));
  if (ph === 'color') {
    const left = caps.map((c, i) => (c.color ? null : i)).filter((x) => x != null);
    return `<div class="dp-t">STEP 1 · 팀 색 선택</div>
      <b>${myCap >= 0 && !caps[myCap].color ? '우리 팀 색을 골라 주세요!' : left.length ? `${left.map(nm).join(' · ')} 색을 고르는 중` : ''}</b>
      <p>각 팀 칸에서 색을 골라요. 먼저 고른 팀이 그 색을 가져가요.${S.operator ? ' 운영진은 두 팀 모두 대신 고를 수 있어요.' : ''}</p>`;
  }
  if (ph === 'order') {
    const g = md.cards;
    const canDraw = (i) => g && g.picks?.[i] == null && (S.operator || myCap === i);
    return `<div class="dp-t">STEP 2 · 우선순위 추첨</div>
      ${!g ? `<b>${S.operator ? '추첨을 시작해 주세요' : '운영진이 추첨을 시작하면 카드를 뽑아요'}</b>
        <p>카드 두 장 중 한 장씩 뽑아 숫자가 작은 팀이 1순위로 먼저 뽑아요.</p>
        ${S.operator ? '<div class="row center"><button class="btn" data-cards>🃏 카드 뽑기 시작</button><button class="btn ghost" data-autoorder>🎲 바로 추첨</button></div>' : ''}`
      : `<b>${myCap >= 0 && g.picks?.[myCap] == null ? '카드를 한 장 골라 뒤집어 주세요!' : '주장들이 카드를 뽑는 중이에요'}</b>
        <div class="ocards">${[0, 1].map((ci) => { const by = Object.keys(g.picks || {}).find((t) => g.picks[t] === ci);
          if (by != null) { const c = colorOf(teamColor(md, +by)); return `<div class="ocard up" style="${c ? `--tc:${c.hex};--ti:${c.text}` : ''}"><em>${g.deck[ci]}</em><small>${nm(+by)}</small></div>`; }
          const mine = myCap >= 0 && canDraw(myCap);
          return `<button class="ocard back" data-draw="${ci}" ${mine || S.operator ? '' : 'disabled'} aria-label="${ci + 1}번째 카드"><span>SD</span></button>`; }).join('')}</div>
        ${S.operator ? `<div class="row center small">${caps.map((_, i) => g.picks?.[i] == null ? `<button class="btn ghost sm" data-drawfor="${i}">${nm(i)} 대신 뽑기</button>` : '').join('')}</div>` : ''}`}`;
  }
  if (ph === 'pick') {
    const i = ds.picks.length, tot = ds.pool.length, k = ds.turn;
    const from = Math.max(0, i - 3), to = Math.min(tot, from + 12);
    const flow = `<div class="flow">${from > 0 ? '<em>…</em>' : ''}${ds.seq.slice(from, to).map((t, x) => { const j = from + x; const c = colorOf(teamColor(md, t));
      return `<i class="${j < i ? 'past' : j === i ? 'cur' : ''}" style="${c ? `--tc:${c.hex}` : ''}" title="${j + 1}번째 · ${nm(t)}">${ds.order.indexOf(t) + 1}</i>`; }).join('')}${to < tot ? '<em>…</em>' : ''}<small>${i + 1}/${tot}</small></div>`;
    const pend = md.pending && md.pending.team === k ? md.pending.id : null;
    const can = S.operator || myCap === k;
    return `<div class="dp-t">STEP 3 · 선수 선택 <small>${ds.order.map((t, n) => `${n + 1}순위 ${nm(t)}`).join(' · ')}</small></div>
      ${flow}
      <b>${nm(k)} 차례${myCap === k ? ' — 아래에서 선수를 골라 주세요' : ''}</b>
      ${can ? `<div class="row center"><button class="btn cta" data-confirm ${pend ? '' : 'disabled'}>${pend ? `${esc(nameOf(pend, md))} 선택 완료 ▶` : '선수를 고르세요'}</button></div>` : ''}`;
  }
  if (ph === 'allin') return `<div class="dp-t">🏁 모든 선수 배치 완료</div>
    <b>${S.operator ? '배치를 확인하고 팀을 확정해 주세요' : '운영진이 팀을 확정하면 드래프트가 끝나요'}</b>
    ${S.operator ? '<div class="row center"><button class="btn cta" data-final>✅ 팀 확정</button></div>' : '<p>잠시만 기다려 주세요…</p>'}`;
  return '';
}

function board(md, myCap) {
  const ds = draftState(md);
  const ph = draftPhase(md);
  const caps = md.captains || [];
  // 내 차례 알림
  const mine = ph === 'pick' && myCap >= 0 && ds.turn === myCap;
  if (mine && !wasMyTurn) { try { navigator.vibrate?.([120, 80, 120]); } catch {} toast('내 차례예요! 선수를 골라 주세요'); }
  wasMyTurn = mine;
  const canPick = ph === 'pick' && (S.operator || myCap === ds.turn);
  return `
    <section class="card dpanel">${stepper2(ph)}<div class="dp-body">${panel(md, ph, ds, myCap)}</div></section>
    ${pitch(md, { ph, ds, myCap, final: false })}
    ${ph === 'pick' ? `<section class="card dpool"><h2>남은 선수 ${ds.remaining.length}명 <small>${canPick ? '눌러서 고른 뒤 \'선택 완료\'' : '주장 차례에만 고를 수 있어요'}</small></h2>
      <div class="name-grid">${ds.remaining.map((id) => `<button class="name-btn ${md.pending?.id === id ? 'on' : ''}" data-pick="${id}" ${canPick ? '' : 'disabled'}>${esc(nameOf(id, md))}</button>`).join('')}</div>
    </section>` : ''}
    ${S.operator ? `<section class="card op"><h2>운영</h2>
      <div class="cap-links">${caps.map((c, i) => `<div><span>${i === 0 ? '왼쪽' : i === 1 ? '오른쪽' : i + 1 + '번'} · ${esc(nameOf(c.id, md))}</span>
        <input class="tname" data-tname="${i}" value="${esc(md.teamNames?.[i] || '')}" placeholder="팀 이름">
        <button class="btn ghost sm" data-link="${c.token}">주장 링크</button></div>`).join('')}</div>
      <p class="tiny muted">주장은 카페 닉네임으로 로그인하면 오른쪽 위 👑 드래프트로 바로 들어와요(주장 링크로도 가능). 팀 이름은 기본으로 "주장 닉네임 + 팀"이에요.</p>
      <div class="row wrap">
        ${ds.picks.length ? '<button class="btn ghost" data-undo>↶ 마지막 지명 취소</button>' : ''}
        ${!ds.picks.length && (md.order || md.cards) ? '<button class="btn ghost" data-reorder>우선순위 다시 추첨</button>' : ''}
        ${fmtOf(md).teamMode !== 'fixed' && caps.some((c) => c.color) && !ds.picks.length ? '<button class="btn ghost" data-recolor>팀 색 다시 고르기</button>' : ''}
        <button class="btn ghost danger" data-reset>주장 다시 정하기</button>
      </div></section>` : ''}`;
}
function bindTeamNames(root, md) {
  root.querySelectorAll('[data-tname]').forEach((x) => x.addEventListener('change', async () => {
    const i = +x.dataset.tname;
    await db.tx(mdPath(md.id), (cur) => { const n = [...(cur.teamNames || [])]; while (n.length <= i) n.push(''); n[i] = x.value.trim(); cur.teamNames = n; return cur; });
    toast('팀 이름을 저장했어요');
  }));
}
function bindBoard(root, md, myCap) {
  bindTeamNames(root, md);
  const P = mdPath(md.id);
  // ① 팀 색: 먼저 고른 팀이 가져감
  root.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', async () => {
    const [i, key] = b.dataset.color.split(':');
    const ok = await db.tx(P, (cur) => {
      if (!S.operator && myCap !== +i) return null;
      if (cur.captains.some((c, k) => k !== +i && c.color === key)) return null;
      cur.captains[+i].color = key; return cur;
    });
    if (!ok) toast('다른 팀이 먼저 고른 색이에요');
  }));
  // ② 우선순위 추첨: 카드 두 장(1·2)을 섞어 한 장씩 → 숫자가 작은 팀이 1순위
  const settle = (cur) => {
    const g = cur.cards; const n = cur.captains.length;
    if (Object.keys(g.picks || {}).length === n) { cur.order = [...Array(n).keys()].sort((a, b) => g.deck[g.picks[a]] - g.deck[g.picks[b]]); g.doneAt = Date.now(); cur.picks = []; cur.pending = null; }
    return cur;
  };
  root.querySelector('[data-cards]')?.addEventListener('click', () => db.tx(P, (cur) => { cur.cards = { deck: shuffle([1, 2]), picks: {}, at: Date.now() }; cur.order = null; return cur; }));
  root.querySelector('[data-autoorder]')?.addEventListener('click', () => db.tx(P, (cur) => {
    const deck = shuffle([1, 2]); cur.cards = { deck, picks: { 0: 0, 1: 1 }, at: Date.now(), auto: true }; return settle(cur);
  }));
  const draw = (team, ci) => db.tx(P, (cur) => {
    const g = cur.cards; if (!g || cur.order?.length) return null;
    g.picks = g.picks || {};
    if (g.picks[team] != null || Object.values(g.picks).includes(ci)) return null;
    g.picks[team] = ci; return settle(cur);
  });
  root.querySelectorAll('[data-draw]').forEach((b) => b.addEventListener('click', async () => {
    const ci = +b.dataset.draw;
    const team = myCap >= 0 && md.cards?.picks?.[myCap] == null ? myCap : S.operator ? (md.captains || []).findIndex((_, i) => md.cards?.picks?.[i] == null) : -1;
    if (team < 0) return;
    if (!(await draw(team, ci))) toast('이미 뽑힌 카드예요');
  }));
  root.querySelectorAll('[data-drawfor]').forEach((b) => b.addEventListener('click', () => {
    const free = [0, 1].filter((ci) => !Object.values(md.cards?.picks || {}).includes(ci));
    draw(+b.dataset.drawfor, free[Math.floor(Math.random() * free.length)]);
  }));
  // ③ 선수 선택: 고르기(선택 중) → 선택 완료
  root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.pick;
    const ok = await db.tx(P, (cur) => {
      const ds = draftState(cur);
      if (ds.turn == null || !ds.remaining.includes(id)) return null;
      if (!S.operator && myCap !== ds.turn) return null;
      cur.pending = cur.pending?.id === id ? null : { team: ds.turn, id, at: Date.now() };
      return cur;
    });
    if (!ok) toast('지금은 고를 수 없어요');
  }));
  root.querySelector('[data-confirm]')?.addEventListener('click', async () => {
    const ok = await db.tx(P, (cur) => {
      const ds = draftState(cur);
      if (!cur.pending || cur.pending.team !== ds.turn || !ds.remaining.includes(cur.pending.id)) return null;
      cur.picks = [...(cur.picks || []), { id: cur.pending.id, team: ds.turn, at: Date.now() }];
      cur.pending = null; return cur;
    });
    if (!ok) toast('지명하지 못했어요 — 화면을 다시 확인해 주세요');
  });
  root.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () =>
    copyText(`${location.origin}${location.pathname}?c=${b.dataset.link}#/draft`)));
  const undo = () => db.tx(P, (cur) => { cur.picks = (cur.picks || []).slice(0, -1); cur.pending = null; return cur; });
  root.querySelector('[data-undo]')?.addEventListener('click', undo);
  root.querySelector('[data-unpick]')?.addEventListener('click', undo);
  root.querySelector('[data-reorder]')?.addEventListener('click', () => db.tx(P, (cur) => { if ((cur.picks || []).length) return null; cur.order = null; cur.cards = null; return cur; }));
  root.querySelector('[data-recolor]')?.addEventListener('click', () => {
    if (!confirm('두 팀 색을 지우고 다시 고를까요? (우선순위 추첨도 다시 해요)')) return;
    db.tx(P, (cur) => { if ((cur.picks || []).length) return null; cur.captains = cur.captains.map((c) => ({ ...c, color: null })); cur.order = null; cur.cards = null; return cur; });
  });
  root.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!confirm('주장과 지명 내역을 모두 지우고 다시 시작할까요?')) return;
    await db.tx(P, (cur) => { cur.captains = []; cur.picks = []; cur.teams = []; cur.teamNames = null; cur.order = null; cur.cards = null; cur.pending = null; cur.status = 'captains'; cur.draftStarted = false; return cur; });
  });
  // ④ 팀 확정
  root.querySelector('[data-final]')?.addEventListener('click', async () => {
    if (!confirm('이 팀 구성으로 확정할까요? 확정 뒤에도 선수를 옮겨 밸런스를 맞출 수 있어요.')) return;
    await db.tx(P, (cur) => {
      if (draftState(cur).remaining.length) return null;
      cur.teams = rosters(cur).map((members, i) => ({ color: teamColor(cur, i), members }));
      cur.pending = null; cur.status = 'teams'; return cur;
    });
    toast('팀을 확정했어요 — 공지 이미지를 만들 수 있어요');
  });
}

// ── 3. 확정된 팀 — 같은 축구장 화면, 운영진은 선수를 옆 팀으로 옮겨 밸런스 조정 ──
function teamsView(md) {
  const ds = draftState(md);
  return `<section class="card dpanel">${stepper2('done')}<div class="dp-body"><div class="dp-t">팀 확정</div>
      <b>${rosters(md).map((ids, i) => `${esc(teamLabel(md, i))} ${ids.length}명`).join(' vs ')}</b>
      ${S.operator && md.status !== 'played' ? '<p>선수 옆 화살표를 누르면 상대 팀으로 옮겨요.</p>' : ''}</div></section>
    ${pitch(md, { ph: 'done', ds, myCap: -1, final: true })}
    ${S.operator && md.status !== 'played' ? `<section class="card op"><h2>운영</h2>
      <div class="cap-links">${rosters(md).map((ids, i) => `<div><span>${i === 0 ? '왼쪽' : i === 1 ? '오른쪽' : i + 1 + '번'} · ${esc(nameOf(ids[0], md))}</span>
        <input class="tname" data-tname="${i}" value="${esc(md.teamNames?.[i] || '')}" placeholder="팀 이름"></div>`).join('')}</div>
      <div class="row wrap"><a class="btn" href="#/notice">팀 공지 이미지 만들기</a>
      ${md.status === 'teams' && (md.captains || []).length ? '<button class="btn ghost danger" data-reopen>드래프트로 되돌리기</button>' : ''}</div></section>` : ''}`;
}
function bindTeams(root, md) {
  bindTeamNames(root, md);
  const moveTo = async (from, id, to) => {
    await db.tx(mdPath(md.id), (cur) => {
      cur.teams[from].members = cur.teams[from].members.filter((x) => x !== id);
      cur.teams[to].members.push(id); return cur;
    });
    toast(`${nameOf(id, md)} → ${teamLabel(md, to)}`);
  };
  root.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => { const [f, id] = b.dataset.swap.split(':'); moveTo(+f, id, 1 - +f); }));
  root.querySelectorAll('[data-move]').forEach((s) => s.addEventListener('change', () => { if (s.value === '') return; const [f, id] = s.dataset.move.split(':'); moveTo(+f, id, +s.value); }));
  root.querySelector('[data-reopen]')?.addEventListener('click', async () => {
    if (!confirm('확정을 풀고 드래프트 화면으로 돌아갈까요? (선수 이동 내역은 지워져요)')) return;
    await db.tx(mdPath(md.id), (cur) => { cur.teams = []; cur.status = 'drafting'; return cur; });
  });
}

// 카페 댓글 구역(예: [준찬팀]·[지진희팀]) → 팀 색 지정 → 팀 확정
function groupSplit(md) {
  const groups = [...appGroups(md)];
  const f = fmtOf(md);
  const colors = f.fixedColors?.length ? f.fixedColors : TC.map((c) => c.key);
  const rest = confirmed(md).map((a) => a.id).filter((id) => !groups.some(([, ids]) => ids.includes(id)));
  const pre = defaultSectionColors(groups.map(([g]) => g), md);
  const { el, close } = modal('구역대로 팀 만들기', `<form class="stack">
    ${groups.map(([g, ids], i) => `<label>${esc(g)} <small class="muted">${ids.length}명</small><select name="g${i}">${TC.map((c) =>
      `<option value="${c.key}" ${c.key === pre[i] ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>`).join('')}
    ${rest.length ? `<p class="small muted">구역 없이 신청한 ${rest.length}명(${rest.map((id) => esc(nameOf(id, md))).join(', ')})은 인원이 적은 팀부터 넣어요.</p>` : ''}
    <button class="btn">팀 확정</button></form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const picks = groups.map((_, i) => e.target['g' + i].value);
    if (new Set(picks).size !== picks.length) return toast('구역마다 다른 팀 색을 골라 주세요');
    const teams = groups.map(([, ids], i) => ({ color: picks[i], members: [...ids] }));
    rest.forEach((id) => teams.reduce((a, b) => (b.members.length < a.members.length ? b : a)).members.push(id));
    await db.tx(mdPath(md.id), (cur) => {
      cur.captains = []; cur.picks = []; cur.teams = teams; cur.status = 'teams'; cur.draftStarted = false;
      cur.format = { ...fmtOf(cur), teams: teams.length, teamMode: 'fixed', fixedColors: [...picks, ...colors.filter((c) => !picks.includes(c))] };
      return cur;
    });
    await db.set('meta/team', { sectionColors: { ...(S.team.sectionColors || {}), ...Object.fromEntries(groups.map(([g], i) => [g, picks[i]])) } }, { merge: true });
    close(); toast('구역대로 팀을 만들었어요 — 팀 확정 단계에서 선수를 옮길 수 있어요');
  });
}
