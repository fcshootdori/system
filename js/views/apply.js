// 경기 신청 — 참석 · 불참 · 운영진 협의
//  · 일반 경기: 신청 마감 전에는 참석·협의·불참 명단, 팀이 정해지면(주장·드래프트) 팀별로 좌우 칸
//  · 이벤트 경기: 처음부터 미리 정한 두 팀 칸 — 회원은 팀을 골라(또는 운영진이 넣어 둔 팀에서) 참석·불참
import { S, nextMatchday, matchdayById, memberById, me, mdPath, nameOf } from '../state.js?v=0.1.58';
import { db, newId } from '../store.js?v=0.1.58';
import { isOpen, closeLabel, closePassed, closeTime, applicants, pendingApps, fmtOf, defaultSectionColors, rosters, teamColor, eventTeams, signupView, eventTeamsToTeams, teamEvent } from '../domain.js?v=0.1.58';
import { TEAM_COLORS } from '../config.js?v=0.1.58';
import { parseCafeComments, norm } from '../cafe-parser.js?v=0.1.58';
import { esc, fmtDate, fmtTime, toast, byName } from '../util.js?v=0.1.58';
import { modal, empty, colorChip, teamLabel } from '../ui.js?v=0.1.58';

const SRC = { app: '앱', cafe: '카페', manual: '운영진', sheet: '시트' };
const colorHex = (k) => TEAM_COLORS.find((c) => c.key === k)?.hex || '#94a3b8';

export function render(root, ctx = {}) {
  const md = ctx.md || (ctx.params?.[0] && matchdayById(ctx.params[0])) || nextMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('진행 중인 경기가 없어요.')}</section>`; return; }
  const v = signupView(md);
  const f = fmtOf(md), cap = f.capacity;
  const nIn = v.ins.length;
  const short = f.minPlayers && nIn < f.minPlayers ? f.minPlayers - nIn : 0;
  const open = isOpen(md);
  const op = S.operator && !md.cancelled;
  const teamsSet = md.teams?.length > 0;

  root.innerHTML = `
    ${ctx.embedded ? '' : '<a class="back" href="#/home">‹ 홈</a>'}
    <section class="card">
      ${ctx.embedded ? '' : `<div class="eyebrow">${fmtDate(md.date)} ${esc(md.venue || '')}</div>`}
      <h1>${v.ev ? '이벤트 경기 신청' : '참가 신청'} <small>참석 ${nIn}${cap ? ` / ${cap}` : ''}명</small></h1>
      ${v.ev ? `<p class="small">${v.ev.map((t) => colorChip(t.color, t.name)).join(' vs ')} <span class="muted">· 팀이 미리 정해진 경기</span></p>` : ''}
      ${f.minPlayers ? `<div class="meter ${short ? '' : 'ok'}"><i style="width:${Math.min(100, nIn / f.minPlayers * 100)}%"></i></div>
        <p class="small ${short ? 'warn-t' : 'ok-t'}">${short ? `최소 ${f.minPlayers}명까지 ${short}명 더 필요해요` : `최소 인원 ${f.minPlayers}명 충족`}</p>` : ''}
      ${md.status === 'open' && !md.cancelled && md.source !== 'sheet' ? `<p class="small deadline">⏰ ${open ? (md.reopened && closePassed(md) ? '운영진이 신청을 다시 열었어요' : closeLabel(md) ? `신청 ${closeLabel(md)}` : '운영진이 마감할 때까지 신청을 받아요') : '신청이 마감됐어요'}</p>` : ''}
      ${myBox(md, v, open)}
    </section>
    ${op ? `<section class="card op"><h2>운영</h2><div class="row wrap">
      ${S.team.cafeImport !== false && md.source !== 'sheet' ? '<button class="btn" data-cafe>카페 댓글로 명단 가져오기</button>' : ''}
      <button class="btn ghost" data-add>＋ 인원 추가</button>
      ${md.source !== 'sheet' ? `<button class="btn ghost" data-close>${open ? '신청 마감' : '신청 다시 열기'}</button>` : ''}
    </div></section>` : ''}
    ${v.ev || teamsSet ? teamColumns(md, v) : categoryLists(md, v)}
    ${v.wait.length ? `<section class="card"><h2>대기 ${v.wait.length}명</h2>${listHtml(v.wait, md, op)}</section>` : ''}
    ${v.pend.length ? `<section class="card"><h2>운영진 협의 ${v.pend.length}명 <small>승인하면 참석 명단에 들어가요</small></h2>
      <ol class="apps">${v.pend.map((a) => `<li><span class="no">·</span><span class="nm">${esc(nameOf(a.id, md))}</span>
        ${op ? `<button class="btn sm" data-approve="${a.id}">승인</button><button class="btn ghost sm" data-toout="${a.id}">불참으로</button><button class="icon-btn" data-rm="${a.id}" aria-label="빼기">✕</button>` : '<span class="tag">협의 중</span>'}</li>`).join('')}</ol></section>` : ''}
    ${(v.ev || teamsSet) && (v.outs.length || op) ? `<section class="card"><details ${op ? 'open' : ''}><summary>불참 ${v.outs.length}명</summary>
      ${op ? `<div class="ap-hd"><span></span><button class="btn ghost sm" data-addcat="out">＋ 불참 추가</button></div>${outList(v.outs, md, op)}`
        : `<p class="small muted">${v.outs.map((d) => esc(memberById(d.id)?.name || d.name || nameOf(d.id, md))).join(', ')}</p>`}</details></section>` : ''}`;

  bind(root, md, v);
}

// 내 신청: 일반 → [참석][불참] / 이벤트 → 팀 고르고 참석 또는 불참 (미리 지정된 팀이면 그 팀 안에서)
export function myBox(md, v, open) {
  if (md.cancelled) return `<p class="cancel-box">취소된 경기예요${md.cancelReason ? ` — ${esc(md.cancelReason)}` : ''}.</p>`;
  if (!open) return `<p class="muted">신청이 마감됐어요.</p>`;
  if (!me.id) return `<button class="btn full" data-me>내 이름 선택 후 신청하기</button>`;
  const nm = esc(memberById(me.id)?.name || '');
  const inA = (md.apps || {})[me.id], outA = (md.declines || {})[me.id];
  const state = inA ? (inA.pending ? '협의 중' : '참석') : outA ? '불참' : '미응답';
  if (v.ev) {
    const assigned = v.ev.findIndex((t) => (t.members || []).includes(me.id));
    // 팀원까지 미리 정한 경기: 팀은 운영진이 정해 두었으니 회원은 참석·불참만
    if (v.ev.some((t) => t.members?.length)) {
      const t = assigned >= 0 ? assigned : null, tAttr = t != null ? `data-team="${t}"` : '';
      return `<p class="mine">${nm} · <b>${state}</b>${t != null ? ` · ${colorChip(v.ev[t].color, v.ev[t].name)}` : ''}</p>
        <div class="row my-btns"><button class="btn ${inA ? '' : 'ghost'}" data-my="in" ${tAttr}>참석하기</button><button class="btn ${outA ? 'danger-fill' : 'ghost'}" data-my="out" ${tAttr}>불참하기</button></div>`;
    }
    const myTeam = inA?.team ?? outA?.team ?? (assigned >= 0 ? assigned : null);
    const teamBtns = assigned >= 0
      ? `<button class="btn ${inA ? '' : 'ghost'}" data-my="in" data-team="${assigned}">${esc(v.ev[assigned].name)} 참석</button>`
      : v.ev.map((t, i) => `<button class="btn ${inA && inA.team === i ? '' : 'ghost'} tbtn" style="--tc:${colorHex(t.color)}" data-my="in" data-team="${i}">${esc(t.name)} 참석</button>`).join('');
    return `<p class="mine">${nm} · <b>${state}</b>${myTeam != null && v.ev[myTeam] ? ` · ${colorChip(v.ev[myTeam].color, v.ev[myTeam].name)}` : ''}${assigned >= 0 ? ' <small class="muted">(운영진이 지정한 팀)</small>' : ''}</p>
      <div class="row wrap my-btns">${teamBtns}<button class="btn ${outA ? 'danger-fill' : 'ghost'}" data-my="out" ${assigned >= 0 ? `data-team="${assigned}"` : ''}>불참</button></div>`;
  }
  return `<p class="mine">${nm} · <b>${state}</b></p>
    <div class="row my-btns"><button class="btn ${inA ? '' : 'ghost'}" data-my="in">참석</button><button class="btn ${outA ? 'danger-fill' : 'ghost'}" data-my="out">불참</button></div>`;
}

// 일반 경기(팀 정해지기 전): 참석 · 불참 명단 (협의는 아래 따로)
function categoryLists(md, v) {
  const op = S.operator && !md.cancelled;
  return `<section class="card"><div class="ap-hd"><h2>참석 ${v.ins.length}명</h2>${op ? '<button class="btn ghost sm" data-addcat="in">＋ 참석 추가</button>' : ''}</div>${v.ins.length ? listHtml(v.ins, md, op) : empty('아직 참석자가 없어요.')}</section>
    <section class="card"><div class="ap-hd"><h2>불참 ${v.outs.length}명</h2>${op ? '<button class="btn ghost sm" data-addcat="out">＋ 불참 추가</button>' : ''}</div>${outList(v.outs, md, op)}</section>`;
}
function outList(outs, md, op) {
  return outs.length ? `<ol class="apps tight">${outs.map((d, k) => `<li><span class="no">${k + 1}</span>
      <span class="nm">${esc(memberById(d.id)?.name || d.name || nameOf(d.id, md))}</span>${op ? `<button class="btn ghost sm" data-toin="${d.id}">참석으로</button><button class="icon-btn sm" data-rmout="${d.id}" aria-label="빼기">✕</button>` : ''}</li>`).join('')}</ol>` : empty('불참 표시한 사람이 없어요.');
}

function listHtml(list, md, op) {
  return `<ol class="apps">${list.map((a, k) => `<li class="${a.id === me.id ? 'me' : ''}">
    <span class="no">${a.no ?? k + 1}</span><span class="nm">${esc(nameOf(a.id, md))}</span>
    ${a.tentative ? '<span class="tag">미정</span>' : ''}
    <span class="src src-${a.source}">${SRC[a.source] || ''}</span>
    <span class="tm">${a.at > 1e12 ? fmtTime(a.at) : ''}</span>
    ${op ? `<button class="btn ghost sm" data-toout="${a.id}">불참으로</button><button class="icon-btn" data-rm="${a.id}" aria-label="빼기">✕</button>` : ''}</li>`).join('')}</ol>`;
}

// 팀별 좌우 칸 — 팀이 확정됐으면 확정된 팀, 이벤트 경기면 미리 정한 팀
function teamCols(md, v) {
  if (md.teams?.length) {
    const ros = rosters(md), inTeam = new Set(ros.flat());
    const outs = Object.entries(md.declines || {}).map(([id, d]) => ({ id, ...d }));
    return { mode: 'team', cols: ros.map((ids, i) => ({ key: i, label: teamLabel(md, i), color: teamColor(md, i), ids,
      outs: outs.filter((d) => d.team === i).map((d) => d.id), noAnswer: [] })),
      rest: md.source === 'sheet' ? [] : v.ins.map((a) => a.id).filter((id) => !inTeam.has(id)) };
  }
  return { mode: 'event', cols: v.sides.map((s) => ({ key: s.i, label: s.name, color: s.color, ids: s.ins.map((a) => a.id),
    outs: s.outs.map((d) => d.id), noAnswer: s.noAnswer })), rest: v.noTeam.map((a) => a.id) };
}
function teamColumns(md, v) {
  const tc = teamCols(md, v);
  const op = S.operator && !md.cancelled;
  const info = new Map(applicants(md).map((a) => [a.id, a]));
  const total = tc.cols.reduce((n, c) => n + c.ids.length, 0) + tc.rest.length;
  const row = (id, k, from) => { const a = info.get(id) || {};
    return `<li class="${id === me.id ? 'me' : ''}"><span class="no">${k + 1}</span><span class="nm">${esc(nameOf(id, md))}</span>${a.tentative ? '<span class="tag">미정</span>' : ''}
      ${op ? actSel(id, from) : ''}</li>`; };
  // 운영진 줄 메뉴 (⋯): 다른 팀으로 · 불참으로 · 명단에서 빼기 — 좁은 팀 칸에서도 이름이 잘리지 않게 한 칸으로
  const actSel = (id, from) => `<select class="row-act" data-act="${id}" aria-label="${esc(nameOf(id, md))} 바꾸기"><option value="">⋯</option>
    ${tc.cols.filter((c) => c.key !== from).map((c) => `<option value="mv:${c.key}">${esc(c.label)}(으)로 이동</option>`).join('')}
    <option value="out">불참으로</option><option value="rm">명단에서 빼기</option></select>`;
  const nm = (id) => esc(memberById(id)?.name || md.declines?.[id]?.name || nameOf(id, md));
  const small = (label, ids, cls) => !ids.length ? '' : op && cls === 'out'
    ? `<p class="col-sub ${cls}"><b>${label} ${ids.length}</b> ${ids.map((id) => `<button type="button" class="out-chip" data-toin="${id}" title="눌러서 참석으로">${nm(id)} <i>↩</i></button>`).join('')}</p>`
    : `<p class="col-sub ${cls}"><b>${label} ${ids.length}</b> ${ids.map(nm).join(', ')}</p>`;
  return `<section class="card">
    <h2>참석 ${total}명 <small>${tc.mode === 'team' ? '확정된 팀' : '이벤트 팀별 신청'}</small></h2>
    <div class="tcols n${tc.cols.length}">${tc.cols.map((c) => `
      <div class="tcol" style="--tc:${colorHex(c.color)}">
        <header>${colorChip(c.color, c.label)}<b>${c.ids.length}명</b></header>
        ${c.ids.length ? `<ol class="apps tight">${c.ids.map((id, k) => row(id, k, c.key)).join('')}</ol>` : '<p class="muted small center">아직 없어요</p>'}
        ${small('미응답', c.noAnswer, 'muted')}${small('불참', c.outs, 'out')}
        ${op ? `<button class="btn ghost sm full" data-addto="${c.key}">＋ ${esc(c.label)} 추가</button>` : ''}
      </div>`).join('')}</div>
    ${tc.rest.length ? `<h3 class="sec">팀 미정 ${tc.rest.length}명</h3><ol class="apps tight">${tc.rest.map((id, k) => row(id, k, -1)).join('')}</ol>` : ''}
  </section>`;
}

function bind(root, md, v) {
  const path = mdPath(md.id);
  root.querySelector('[data-me]')?.addEventListener('click', () => { location.hash = '#/login'; });
  // 내 참석·불참
  bindMy(root, md);
  root.querySelector('[data-cafe]')?.addEventListener('click', () => cafeImport(md));
  root.querySelector('[data-add]')?.addEventListener('click', () => addPeople(md, null));
  root.querySelectorAll('[data-addto]').forEach((b) => b.addEventListener('click', () => addPeople(md, +b.dataset.addto)));
  root.querySelector('[data-close]')?.addEventListener('click', async () => {
    const open = isOpen(md);
    // 마감 시각이 지난 뒤 다시 열면 자동 마감하지 않음
    await db.set(path, open ? { status: 'closed', reopened: false } : { status: 'open', reopened: closePassed(md) }, { merge: true });
    toast(open ? '신청을 마감했어요' : '신청을 다시 열었어요');
  });
  root.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.approve; let into = null;
    await db.tx(path, (cur) => {
      if (cur.apps?.[id]) cur.apps[id].pending = false;
      const pickSmaller = (arr) => arr.reduce((a, x) => (x.n < a.n ? x : a));
      if (cur.teams?.length && !cur.teams.some((t) => t.members.includes(id))) {
        const t = cur.teams.reduce((a, x) => (x.members.length < a.members.length ? x : a)); t.members.push(id); into = TEAM_COLORS.find((c) => c.key === t.color)?.label;
      } else if (teamEvent(cur) && cur.apps?.[id] && cur.apps[id].team == null) {
        const sv = signupView(cur); const s = pickSmaller(sv.sides.map((x) => ({ i: x.i, n: x.ins.length, name: x.name })));
        cur.apps[id].team = s.i; into = s.name;
      }
      return cur;
    });
    toast(`${nameOf(id, md)} 님을 참석 명단에 넣었어요${into ? ` (${into})` : ''}`);
  }));
  const rmOne = async (id) => {
    if (!confirm(`${nameOf(id, md)} 님을 명단에서 뺄까요?`)) return;
    await db.tx(path, (cur) => {
      if (cur.apps) delete cur.apps[id];
      (cur.teams || []).forEach((t) => { t.members = t.members.filter((x) => x !== id); });
      (cur.eventTeams || []).forEach((t) => { t.members = (t.members || []).filter((x) => x !== id); });
      return cur;
    });
    toast(`${nameOf(id, md)} 님을 뺐어요`);
  };
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => rmOne(b.dataset.rm)));
  root.querySelectorAll('[data-rmout]').forEach((b) => b.addEventListener('click', () => db.tx(path, (cur) => { delete cur.declines[b.dataset.rmout]; return cur; })));
  root.querySelectorAll('[data-toin]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.toin;
    await db.tx(path, (cur) => {
      const d = cur.declines?.[id]; if (cur.declines) delete cur.declines[id];
      cur.apps = cur.apps || {}; cur.apps[id] = { at: Date.now(), source: 'manual', ...(d?.team != null ? { team: d.team } : {}) };
      if (cur.teams?.length && d?.team != null && cur.teams[d.team] && !cur.teams.some((t) => t.members.includes(id))) cur.teams[d.team].members.push(id);
      return cur;
    });
    toast(`${nameOf(id, md)} 님 → 참석`);
  }));
  // 참석·협의 → 불참 (팀이 정해져 있으면 그 팀의 불참으로)
  const toOut = async (id) => {
    await db.tx(path, (cur) => {
      const a = cur.apps?.[id];
      const ti = (cur.teams || []).findIndex((t) => t.members.includes(id));
      const team = ti >= 0 ? ti : a?.team ?? null;
      if (cur.apps) delete cur.apps[id];
      (cur.teams || []).forEach((t) => { t.members = t.members.filter((x) => x !== id); });
      cur.declines = cur.declines || {};
      cur.declines[id] = { at: Date.now(), name: memberById(id)?.name || cur.guests?.[id]?.name || '', source: 'manual', ...(team != null ? { team } : {}) };
      return cur;
    });
    toast(`${nameOf(id, md)} 님 → 불참`);
  };
  root.querySelectorAll('[data-toout]').forEach((b) => b.addEventListener('click', () => toOut(b.dataset.toout)));
  root.querySelectorAll('[data-addcat]').forEach((b) => b.addEventListener('click', () => addPeople(md, null, b.dataset.addcat)));
  // 팀 사이 이동
  const moveTo = async (id, to) => {
    await db.tx(path, (cur) => {
      if (cur.teams?.length) { cur.teams.forEach((t) => { t.members = t.members.filter((x) => x !== id); }); cur.teams[to].members.push(id); }
      else if (cur.apps?.[id]) {
        cur.apps[id].team = to;
        (cur.eventTeams || []).forEach((t, i) => { if (i !== to && (t.members || []).includes(id)) t.members = t.members.filter((x) => x !== id); });
      }
      return cur;
    });
    toast(`${nameOf(id, md)} → ${teamLabel(md, to)}`);
  };
  root.querySelectorAll('[data-mv]').forEach((x) => x.addEventListener('change', () => x.value !== '' && moveTo(x.dataset.mv, +x.value)));
  root.querySelectorAll('[data-sw]').forEach((x) => x.addEventListener('click', () => moveTo(x.dataset.sw, +x.dataset.to)));
  root.querySelectorAll('[data-act]').forEach((x) => x.addEventListener('change', () => {
    const id = x.dataset.act, v = x.value; x.value = '';
    if (v.startsWith('mv:')) moveTo(id, +v.slice(3));
    else if (v === 'out') toOut(id);
    else if (v === 'rm') rmOne(id);
  }));
}

// 인원 추가 (운영진): 참석 · 불참 · 협의 · (이벤트 경기) 팀 지정만
function addPeople(md, teamIdx, cat0 = 'in') {
  const ev = teamEvent(md), teamsSet = md.teams?.length > 0;
  const teamList = teamsSet ? md.teams.map((t, i) => ({ i, name: teamLabel(md, i) })) : ev ? ev.map((t, i) => ({ i, name: t.name })) : [];
  // 지금 상태 (이미 명단에 있는 사람도 골라서 참석↔불참↔협의로 바꿀 수 있음)
  const now0 = (id) => md.declines?.[id] ? '불참' : md.apps?.[id] ? (md.apps[id].pending ? '협의' : '참석') : rosters(md).flat().includes(id) ? '참석' : '';
  const list = S.members.filter((m) => m.active !== false || now0(m.id)).sort((a, b) => !!now0(a.id) - !!now0(b.id) || byName(a, b));
  const cats = [['in', '참석'], ['out', '불참'], ['pending', '운영진 협의'], ...(ev && !teamsSet ? [['assign', '팀만 지정 (본인이 참석·불참)']] : [])];
  if (!cats.some((c) => c[0] === cat0)) cat0 = 'in';
  const { el, close } = modal(teamIdx != null && teamList[teamIdx] ? `${teamList[teamIdx].name}에 추가` : cat0 === 'out' ? '불참 추가·변경' : '인원 추가·변경', `
    <div class="seg cat-seg">${cats.map(([k, l]) => `<button type="button" data-cat="${k}" class="${k === cat0 ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="tiny muted">이미 명단에 있는 사람(이름 옆 표시)을 고르면 위에서 고른 상태로 바뀌어요.</p>
    ${teamList.length ? `<label>팀<select name="team">${teamList.map((t) => `<option value="${t.i}" ${t.i === teamIdx ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}${teamsSet ? '' : `<option value="" ${teamIdx == null ? 'selected' : ''}>팀 없음</option>`}</select></label>` : ''}
    <input class="search" placeholder="닉네임 검색" data-q autocomplete="off">
    <div class="name-grid" data-list></div>
    <label>게스트 <span class="muted small">(회원 목록에 없는 사람)</span><input name="guest" placeholder="게스트 이름"></label>
    <button class="btn full" data-ok>추가</button>`);
  let cat = cat0;
  el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; el.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); }));
  const box = el.querySelector('[data-list]'), picked = new Set();
  const draw = (q = '') => {
    const k = q.trim().toLowerCase();
    const hit = list.filter((m) => !k || m.name.toLowerCase().includes(k) || (m.aliases || []).some((a) => a.toLowerCase().includes(k)) || (m.realName || '').includes(k));
    box.innerHTML = hit.length ? hit.map((m) => { const st = now0(m.id);
      return `<button type="button" class="name-btn ${picked.has(m.id) ? 'on' : ''} ${st ? 'has-st' : ''}" data-id="${m.id}">${esc(m.name)}${st ? `<small class="st st-${st}">${st}</small>` : ''}</button>`; }).join('') : empty('추가할 회원이 없어요.');
  };
  draw();
  el.querySelector('[data-q]').addEventListener('input', (e) => draw(e.target.value));
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; picked.has(b.dataset.id) ? picked.delete(b.dataset.id) : picked.add(b.dataset.id); b.classList.toggle('on'); });
  el.querySelector('[data-ok]').addEventListener('click', async () => {
    const ids = [...picked]; const gname = el.querySelector('[name=guest]').value.trim();
    if (gname) ids.push('g_m_' + (norm(gname) || newId()));
    if (!ids.length) return toast('추가할 사람을 골라 주세요');
    const tsel = el.querySelector('[name=team]'); const team = tsel && tsel.value !== '' ? +tsel.value : null;
    const now = Date.now();
    await db.tx(mdPath(md.id), (cur) => {
      cur.apps = cur.apps || {}; cur.guests = cur.guests || {}; cur.declines = cur.declines || {};
      ids.forEach((id, i) => {
        if (id.startsWith('g_')) cur.guests[id] = { name: gname };
        if (cat === 'assign') { const t = cur.eventTeams?.[team ?? 0] ? cur.eventTeams : null;
          if (!t) { cur.event = true; cur.eventTeams = eventTeams(cur).map((x) => ({ ...x, members: [...(x.members || [])] })); cur.teamNames = cur.eventTeams.map((x) => x.name); }
          cur.eventTeams.forEach((x, k) => { x.members = (x.members || []).filter((y) => y !== id); if (k === (team ?? 0)) x.members.push(id); });
          return; }
        if (cat === 'out') {
          const ti = (cur.teams || []).findIndex((t) => t.members.includes(id));
          const tm = ti >= 0 ? ti : cur.apps[id]?.team ?? cur.declines[id]?.team ?? team;
          delete cur.apps[id]; (cur.teams || []).forEach((t) => { t.members = t.members.filter((x) => x !== id); });
          cur.declines[id] = { at: now, name: memberById(id)?.name || gname, source: 'manual', ...(tm != null ? { team: tm } : {}) }; return;
        }
        const prev = cur.apps[id];
        if (md.source !== 'sheet') cur.apps[id] = { ...(prev || {}), at: prev?.at ?? now + i, source: prev?.source || 'manual', pending: cat === 'pending', ...(team != null ? { team } : {}) };
        delete cur.declines[id];
        if (cur.teams?.length && cat === 'in' && team != null) { cur.teams.forEach((t) => { t.members = t.members.filter((x) => x !== id); }); cur.teams[team].members.push(id); }
      });
      return cur;
    });
    toast(`${ids.length}명 → ${cats.find((c) => c[0] === cat)[1]}`); close();
  });
}

// ── 카페 댓글로 참석자 가져오기 (임시 기능 · 설정에서 끌 수 있음) ──
//  1) 붙여넣기 → 2) 머리 댓글 구역별로 회원 일치 확인 → 3) 최종 확인 → 참가 명단 반영
//  회원 목록과 일치하지 않는 닉네임은 게스트로 참석 (원하면 회원을 골라 별칭으로 저장)
const KIND_OPTS = [['in', '참석'], ['tentative', '참석(미정)'], ['pending', '협의 대기'], ['out', '불참'], ['skip', '제외']];
function cafeImport(md) {
  const { el, close } = modal('카페 댓글로 명단 가져오기', `
    <ol class="howto small">
      <li>카페 신청 글에서 댓글 전체를 선택해 복사 (PC·모바일 어느 쪽에서 복사해도 돼요)</li>
      <li>아래에 붙여넣고 <b>분석하기</b> (댓글이 여러 페이지면 이어서 붙여넣기)</li>
      <li>회원 일치 여부를 확인하고 <b>참석자 확정</b></li>
    </ol>
    ${Object.keys(md.apps || {}).length + Object.keys(md.declines || {}).length ? `<p class="cafe-warn">⚠️ 확정하면 지금 명단(참석·협의 ${Object.keys(md.apps || {}).length}명 · 불참 ${Object.keys(md.declines || {}).length}명)을 <b>모두 지우고</b> 붙여넣은 댓글로 새로 만들어요. 앱에서 직접 신청한 사람·운영진이 추가한 사람도 지워져요.</p>` : ''}
    <textarea rows="7" data-src placeholder="여기에 댓글 붙여넣기"></textarea>
    <button class="btn full" data-parse>분석하기</button>
    <div data-out></div>`, { wide: true });
  const members = [...S.members].sort(byName);
  const memOpts = (sel) => `<option value="">게스트로 참석</option>${members.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.active === false ? ' (휴면)' : ''}</option>`).join('')}`;

  el.querySelector('[data-parse]').addEventListener('click', () => {
    const out = el.querySelector('[data-out]');
    const { rows, sections, closed } = parseCafeComments(el.querySelector('[data-src]').value, S.members);
    const early = !!closeTime(md) && !closePassed(md);   // 신청 마감 시각 전
    const teamSecs = sections.filter((x) => x.kind === 'in').map((x) => x.title);
    const secColors = defaultSectionColors(teamSecs, md);
    const evNow = teamEvent(md);
    // 댓글 구역 이름 → 이벤트 팀 번호 (이름이 같거나 포함되면 그 팀, 아니면 순서대로)
    const secTeam = (t, i) => { const k = evNow.findIndex((x) => norm(x.name) === norm(t) || norm(t).includes(norm(x.name)) || norm(x.name).includes(norm(t))); return k >= 0 ? k : i < evNow.length ? i : -1; };
    if (!rows.length) { out.innerHTML = `<p class="err">댓글을 찾지 못했어요. 닉네임과 작성 시간(예: 26.10.18 10:36)이 함께 복사됐는지 확인해 주세요.</p>`; return; }
    const groups = [...new Set(rows.map((r) => r.section))];
    out.innerHTML = `
      <div class="sum" data-sum></div>
      ${sections.length ? `<p class="muted small">머리 댓글 ${sections.length}개: ${sections.map((s) => `<b>${esc(s.title)}</b>`).join(' · ')}</p>` : ''}
      ${groups.map((g) => `<h3 class="sec">${esc(g || '구역 없음')}</h3>
        <div class="tbl-wrap"><table class="tbl parse"><thead><tr><th>카페 닉네임</th><th>회원 일치</th><th>참석</th></tr></thead><tbody>
        ${rows.map((r, i) => r.section !== g ? '' : `<tr data-i="${i}" class="${r.memberId ? '' : 'guest'}">
          <td><b>${esc(r.nick)}</b><div class="tiny muted">${esc(r.body)}</div></td>
          <td><select data-mem>${memOpts(r.memberId)}</select>
            <div class="tiny" data-badge></div>
            ${!r.memberId && r.suggestion ? `<button class="link tiny" data-sug="${r.suggestion}">혹시 ${esc(memberById(r.suggestion)?.name || '')}?</button>` : ''}</td>
          <td><select data-kind>${KIND_OPTS.map(([k, l]) => `<option value="${k}" ${k === (r.tentative ? 'tentative' : r.kind) ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        </tr>`).join('')}</tbody></table></div>`).join('')}
      ${evNow || teamSecs.length >= 2 ? `<div class="teamopt">
        ${evNow ? `<p class="small"><b>이벤트 경기</b> · 댓글 구역을 팀으로 연결해요</p>`
          : `<label class="inline"><input type="checkbox" data-mkevent checked> <b>이벤트 경기로 등록 (댓글 구역 = 팀)</b></label>`}
        <div class="row wrap">${teamSecs.map((t, i) => `<label>${esc(t)}<select data-secc="${esc(t)}">${
          evNow ? evNow.map((x, k) => `<option value="${k}" ${k === secTeam(t, i) ? 'selected' : ''}>${esc(x.name)}</option>`).join('') + '<option value="">팀 없음</option>'
            : TEAM_COLORS.map((c) => `<option value="${c.key}" ${c.key === secColors[i] ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>`).join('')}</div>
        <label class="inline"><input type="checkbox" data-mkteams ${closed && !early ? 'checked' : ''}> 참석자로 팀까지 확정 <small class="muted">${early ? `(신청 ${esc(closeLabel(md))} 전이라 꺼 뒀어요)` : closed ? '("마감" 댓글이 있어 켜 뒀어요)' : ''}</small></label>
        <p class="tiny muted">협의 인원은 승인할 때 인원이 적은 팀에 들어가요.</p>
      </div>` : ''}
      <p class="muted small">게스트로 참석하는 사람은 개인 기록에 남지 않아요. 회원을 고르면 그 닉네임이 별칭으로 저장돼서 다음부터 자동으로 일치해요.</p>
      <button class="btn full" data-apply>참석자 확정</button>`;

    const sync = () => {
      const c = { in: 0, tentative: 0, pending: 0, out: 0, guest: 0 };
      out.querySelectorAll('tr[data-i]').forEach((tr) => {
        const r = rows[+tr.dataset.i], mem = tr.querySelector('[data-mem]').value, k = tr.querySelector('[data-kind]').value;
        const badge = tr.querySelector('[data-badge]');
        badge.textContent = mem ? (mem === r.memberId ? '✓ 회원 일치' : '회원으로 연결 (별칭 저장)') : '게스트';
        badge.className = 'tiny ' + (mem ? 'ok-t' : 'warn-t');
        tr.classList.toggle('guest', !mem);
        if (k in c) c[k]++;
        if (!mem && k !== 'out' && k !== 'skip') c.guest++;
      });
      out.querySelector('[data-sum]').innerHTML = `<span><b>${c.in + c.tentative}</b>참석${c.tentative ? ` (미정 ${c.tentative})` : ''}</span><span><b>${c.guest}</b>게스트</span><span><b>${c.pending}</b>협의</span><span><b>${c.out}</b>불참</span>`;
    };
    out.addEventListener('change', sync);
    out.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => { b.closest('tr').querySelector('[data-mem]').value = b.dataset.sug; b.remove(); sync(); }));
    sync();

    out.querySelector('[data-apply]').addEventListener('click', async (ev) => {
      // 기존 명단을 모두 지우고 댓글로 다시 만들기 — 확정 전에 한 번 더 확인
      const cur0 = S.matchdays.find((m) => m.id === md.id) || md;
      const nA = Object.keys(cur0.apps || {}).length, nD = Object.keys(cur0.declines || {}).length;
      if (nA + nD && !confirm(`기존 신청 명단을 모두 지우고 카페 댓글로 다시 가져올까요?\n\n지금 명단: 참석·협의 ${nA}명 · 불참 ${nD}명\n앱에서 직접 신청한 사람과 운영진이 추가한 사람도 지워지고, 붙여넣은 댓글에 있는 사람만 남아요.${cur0.teams?.length ? '\n(이미 정해진 팀 구성은 그대로예요)' : ''}`)) return;
      ev.target.disabled = true;
      const picked = [...out.querySelectorAll('tr[data-i]')].map((tr) => ({
        r: rows[+tr.dataset.i], mem: tr.querySelector('[data-mem]').value, kind: tr.querySelector('[data-kind]').value,
      }));
      // 회원으로 직접 연결한 닉네임 → 별칭 저장
      const aliasAdds = new Map();
      picked.forEach(({ r, mem }) => { if (mem && mem !== r.memberId) aliasAdds.set(mem, [...(aliasAdds.get(mem) || []), r.nick]); });
      await Promise.all([...aliasAdds].map(([mid, nicks]) =>
        db.set('members/' + mid, { aliases: [...new Set([...(memberById(mid)?.aliases || []), ...nicks])] }, { merge: true })));
      const now = Date.now();
      const n = { in: 0, out: 0, pending: 0, guest: 0 };
      // 이벤트 경기로 등록 / 구역 → 팀 번호
      const secSel = [...out.querySelectorAll('[data-secc]')].map((x) => ({ sec: x.dataset.secc, v: x.value }));
      let secIdx = {}, newEvent = null;
      if (evNow) secSel.forEach(({ sec, v }) => { if (v !== '') secIdx[sec] = +v; });
      else if (out.querySelector('[data-mkevent]')?.checked) {
        if (new Set(secSel.map((x) => x.v)).size !== secSel.length) { ev.target.disabled = false; return toast('팀마다 다른 색을 골라 주세요'); }
        newEvent = secSel.map(({ sec, v }) => ({ name: sec, color: v, members: [] }));
        secSel.forEach(({ sec }, k) => { secIdx[sec] = k; });
      }
      await db.tx(mdPath(md.id), (cur) => {
        const prevApps = cur.apps || {};   // 승인해 둔 협의 인원은 다시 가져와도 승인 상태 유지
        cur.apps = {}; cur.declines = {}; cur.guests = cur.guests || {};
        if (newEvent) { cur.event = true; cur.eventTeams = newEvent; cur.teamNames = newEvent.map((t) => t.name); }
        // 머리 댓글 순서 기억 (구역대로 팀 나눌 때 이 순서 = 1번·2번 팀)
        const order = sections.filter((x) => x.kind === 'in').map((x) => x.title);
        if (order.length) cur.groupOrder = [...new Set([...order, ...(cur.groupOrder || [])])];
        picked.forEach(({ r, mem, kind }) => {
          if (kind === 'skip') return;
          const id = mem || 'g_c_' + (norm(r.nick) || 'x');
          if (kind === 'out') {
            if (cur.apps[id]) delete cur.apps[id];
            cur.declines[id] = { name: r.nick, at: r.at || now, ...(secIdx[r.section] != null ? { team: secIdx[r.section] } : {}) };
            n.out++; return;
          }
          if (!mem) { cur.guests[id] = { name: r.nick, cafe: true }; n.guest++; }
          const prev = prevApps[id];
          const t = r.firstAt ?? r.at ?? now;
          const approved = prev && !prev.pending;            // 이미 승인·참가 중이면 다시 붙여넣어도 협의 대기로 돌리지 않음
          cur.apps[id] = { at: t, source: 'cafe', cafeName: r.nick,
            group: kind === 'pending' ? (prev?.group || null) : (r.section || null),
            tentative: kind === 'tentative', pending: kind === 'pending' && !approved,
            ...(secIdx[r.section] != null ? { team: secIdx[r.section] } : {}) };
          delete cur.declines[id];
          if (kind === 'pending') n.pending++; else n.in++;
        });
        return cur;
      });
      // 참석자로 팀까지 확정 (이벤트 경기)
      let mk = out.querySelector('[data-mkteams]')?.checked && (evNow || newEvent);
      if (mk && early && !confirm(`아직 신청 마감 시각(${closeLabel(md).replace(' 마감', '')}) 전이에요. 지금 팀을 확정하면 신청이 닫혀요. 확정할까요?`)) mk = false;
      if (mk) {
        await db.tx(mdPath(md.id), (cur) => {
          cur.teams = eventTeamsToTeams(cur); cur.captains = []; cur.picks = []; cur.draftStarted = false; cur.status = 'teams';
          if (early) cur.earlyTeams = true;   // 운영진이 마감 전에 일부러 확정
          return cur;
        });
      }
      if (newEvent) await db.set('meta/team', { sectionColors: { ...(S.team.sectionColors || {}), ...Object.fromEntries(newEvent.map((t) => [t.name, t.color])) } }, { merge: true });
      toast(`참석 ${n.in}명(게스트 ${n.guest}) · 협의 ${n.pending}명 · 불참 ${n.out}명 반영${mk ? ' · 팀 확정' : ''}`);
      close();
    });
  });
}


// 내 참석·불참 버튼 (신청 화면·홈 티켓 공용) — 다시 누르면 취소
export function bindMy(root, md) {
  const path = mdPath(md.id);
  root.querySelectorAll('[data-my]').forEach((b) => b.addEventListener('click', async () => {
    const team = b.dataset.team != null ? +b.dataset.team : null;
    const isIn = b.dataset.my === 'in';
    await db.tx(path, (cur) => {
      cur.apps = cur.apps || {}; cur.declines = cur.declines || {};
      if (isIn) {
        const prev = cur.apps[me.id];
        if (prev && !prev.pending && (team == null || prev.team === team)) { delete cur.apps[me.id]; return cur; } // 다시 누르면 취소
        cur.apps[me.id] = { ...(prev || {}), at: prev?.at ?? Date.now(), source: prev?.source || 'app', pending: false, ...(team != null ? { team } : {}) };
        delete cur.declines[me.id];
      } else {
        if (cur.declines[me.id]) { delete cur.declines[me.id]; return cur; }
        delete cur.apps[me.id];
        cur.declines[me.id] = { at: Date.now(), name: memberById(me.id)?.name || '', ...(team != null ? { team } : {}) };
      }
      (cur.teams || []).forEach((t) => { if (!isIn) t.members = t.members.filter((x) => x !== me.id); });
      return cur;
    });
  }));
}
