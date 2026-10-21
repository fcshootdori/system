import { S, nextMatchday, matchdayById, captainMatchday, mdPath, nameOf, me } from '../state.js?v=0.1.48';
import { db } from '../store.js?v=0.1.48';
import { TEAM_COLORS } from '../config.js?v=0.1.48';
import { confirmed, draftState, draftPhase, rosters, fmtOf, teamColor, appGroups, defaultSectionColors, capEvent, teamEvent, captainOf, captainIds, evCaps, closeTime, closePassed, closeLabel } from '../domain.js?v=0.1.48';
import { TEAM_COLORS as TC } from '../config.js?v=0.1.48';
import { modal } from '../ui.js?v=0.1.48';
import { esc, fmtDate, toast, randomToken, shuffle, copyText } from '../util.js?v=0.1.48';
import { empty, colorChip, teamLabel, teamChip } from '../ui.js?v=0.1.48';

let lastCtx = {};
export function render(root, ctx = {}) {
  lastCtx = ctx;
  const md = ctx.md || (ctx.params?.[0] && matchdayById(ctx.params[0])) || captainMatchday() || nextMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('진행 중인 경기일이 없어요.')}</section>`; return; }
  const caps = md.captains || [];
  const myCap = caps.findIndex((c) => (S.auth?.pid && (c.id === S.auth.pid || (c.co || []).includes(S.auth.pid))) || (S.captainToken && c.token === S.captainToken));
  const head = ctx.embedded ? '' : `<a class="back" href="#/home">‹ 홈</a><section class="card"><div class="eyebrow">${fmtDate(md.date)} ${esc(md.venue || '')}</div>
    <h1>${md.status === 'teams' || md.status === 'played' ? '팀 구성' : '주장 · 드래프트'}</h1>
    ${myCap >= 0 ? `<p class="mine">이 기기는 <b>${esc(nameOf(caps[myCap].id, md))}</b> 주장으로 참여 중이에요.</p>` : ''}</section>`;

  if (md.status === 'teams' || md.status === 'played') { ballPrev = null; root.innerHTML = head + teamsView(md); bindTeams(root, md); return; }
  if (capEvent(md) && !caps.length) { root.innerHTML = head + presetCaptains(md); bindPreset(root, md); return; }
  if (!caps.length || md.status === 'captains' && !md.draftStarted) {
    root.innerHTML = head + (S.operator ? captainPicker(md) : `<section class="card">${empty('운영진이 주장을 정하고 있어요.')}</section>`);
    if (S.operator) bindCaptainPicker(root, md);
    return;
  }
  if (Date.now() - snapAt > 300) draftSnap(root);
  root.innerHTML = board(md, myCap);   // 드래프트 중에는 꼭 필요한 것만 — 한 화면에 (스크롤 없이)
  bindBoard(root, md, myCap);
  fitDraft(root);
  requestAnimationFrame(() => { draftFly(root, md); placeBall(root); });
}

// ── 1. 주장 선정 ──
//  위: A팀 · B팀 박스(좌우로 크게) → 팀 박스를 누른 뒤 아래 신청자 명단에서 주장을 고름
//  팀마다 기본 1명, 여러 명(공동 주장)도 가능. 첫 주장은 팀 이름("닉네임+팀")과 드래프트 대표가 됨
let capTeams = null, capFor = null, activeTeam = 0;
const LETTER = (i) => String.fromCharCode(65 + i);   // A, B, C …
function captainPicker(md) {
  const n = fmtOf(md).teams;
  const list = confirmed(md);
  if (capFor !== md.id || !capTeams || capTeams.length !== n) {
    capFor = md.id; activeTeam = 0;
    capTeams = Array.from({ length: n }, (_, i) => { const c = md.captains?.[i]; return c ? [c.id, ...(c.co || [])] : []; });
  }
  capTeams = capTeams.map((ids) => ids.filter((id) => list.some((a) => a.id === id)));
  const teamOf = (id) => capTeams.findIndex((ids) => ids.includes(id));
  const groups = appGroups(md);
  const groupCard = groups.size >= 2 ? `<section class="card op"><h2>카페 댓글 구역대로 팀 나누기</h2>
    <p class="muted small">${[...groups].map(([g, ids]) => `<b>${esc(g)}</b> ${ids.length}명`).join(' · ')} — 드래프트 없이 댓글 구역 그대로 팀을 만들고, 팀 확정 단계에서 선수를 옮겨 밸런스를 맞출 수 있어요.</p>
    <button class="btn" data-groupsplit>구역대로 팀 만들기</button></section>` : '';
  const ready = capTeams.every((ids) => ids.length);
  return groupCard + `<section class="card op cappick">
    <h2>주장 선정</h2>
    <div class="ctbar n${n}">${capTeams.map((ids, i) => `<button class="ct ${activeTeam === i ? 'on' : ''} ${ids.length ? 'set' : ''}" data-ct="${i}">
      <span class="ct-l">${LETTER(i)}팀 <small>${n === 2 ? (i ? '오른쪽' : '왼쪽') : ''}</small></span>
      ${ids.length ? `<b class="ct-n">${ids.map((id, k) => `<span>${k ? '' : '👑 '}${esc(nameOf(id, md))}</span>`).join('')}</b>` : '<b class="ct-n empty">주장을 고르세요</b>'}
      <small class="ct-s">${activeTeam === i ? '▼ 아래 명단에서 고르는 중' : ids.length ? `${ids.length}명 · 눌러서 고치기` : '눌러서 고르기'}</small>
    </button>`).join('')}</div>
    <p class="muted small">팀 박스를 누른 뒤 아래 명단에서 주장을 눌러요. 기본 1명이고, 여러 명 고르면 공동 주장(첫 번째가 대표·팀 이름)이 돼요. 다시 누르면 빠져요.</p>
    ${list.length ? `<div class="name-grid cap-grid">${list.map((a) => { const t = teamOf(a.id);
      return `<button class="name-btn ${t >= 0 ? `on t${t}` : ''}" data-cap="${a.id}">${t >= 0 ? `<b class="ctag">${LETTER(t)}</b> ` : ''}${esc(nameOf(a.id, md))}</button>`; }).join('')}</div>` : empty('확정된 참가자가 없어요.')}
    <button class="btn full" data-start ${ready ? '' : 'disabled'}>${ready ? '주장 확정 · 드래프트 시작' : `${capTeams.map((ids, i) => (ids.length ? '' : LETTER(i) + '팀')).filter(Boolean).join('·')} 주장을 골라 주세요`}</button>
  </section>`;
}
function bindCaptainPicker(root, md) {
  root.querySelector('[data-groupsplit]')?.addEventListener('click', () => groupSplit(md));
  const rer = () => render(root, lastCtx);
  root.querySelectorAll('[data-ct]').forEach((b) => b.addEventListener('click', () => { activeTeam = +b.dataset.ct; rer(); }));
  root.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.cap;
    const cur = capTeams.findIndex((ids) => ids.includes(id));
    capTeams = capTeams.map((ids) => ids.filter((x) => x !== id));
    if (cur !== activeTeam) {
      capTeams[activeTeam].push(id);
      // 이 팀 첫 주장을 고르면, 주장이 없는 다음 팀으로 자동으로 넘어감
      if (capTeams[activeTeam].length === 1) { const nx = capTeams.findIndex((ids) => !ids.length); if (nx >= 0) activeTeam = nx; }
    }
    rer();
  }));
  root.querySelector('[data-start]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const early = !!closeTime(md) && !closePassed(md);
    const sel = capTeams.map((ids) => [...ids]);
    const ok = await db.tx(mdPath(md.id), (cur) => {
      if (!cur || sel.some((ids) => !ids.length)) return null;
      if (early) cur.earlyTeams = true;   // 운영진이 마감 전에 일부러 시작
      cur.captains = sel.map((ids) => ({ id: ids[0], co: ids.slice(1), token: randomToken(), color: null }));
      cur.teamNames = sel.map((ids) => `${nameOf(ids[0], cur)}팀`);   // 기본 팀 이름: 대표 주장 닉네임 + 팀 (주장 카드에서 고칠 수 있음)
      cur.picks = []; cur.teams = []; cur.order = null; cur.cards = null; cur.pending = null; cur.status = 'drafting'; cur.draftStarted = true;
      return cur;
    }).catch((e) => { btn.disabled = false; throw e; });
    if (!ok) { btn.disabled = false; return toast('경기를 찾지 못했어요 — 화면을 새로 고쳐 주세요'); }
    capTeams = null; toast('드래프트를 시작했어요 — 주장들이 팀 색을 고를 차례예요');
  });
}

// ── 2. 드래프트 (WD_FUTSAL 드래프트 방과 같은 흐름, 2팀은 축구장 왼쪽·오른쪽) ──
//  ① 팀 색 선택 → ② 우선순위 추첨(카드) → ③ 선수 선택 1-2-2-1-1-2-2-1 … (고르고 '선택 완료') → ④ 팀 확정
const PH = [['color', '팀 색 선택'], ['order', '우선순위 추첨'], ['pick', '선수 선택'], ['done', '팀 확정']];
const colorOf = (key) => TEAM_COLORS.find((c) => c.key === key) || null;
const COLORS2 = ['pink', 'blue'];   // 팀 색은 핑크·블루만 (운영진이 배정)
const palette = () => COLORS2.map(colorOf);
const seen = new Set();      // 새로 들어온 선수 표시(한 번만 튀어오르게)
let wasMyTurn = false;

// ── 선수 유니폼 아이콘 (WD_FUTSAL과 같은 반팔 유니폼 + 가슴에 이름) ──
const FIG_SVG = '<svg class="pfs" viewBox="0 0 80 72" aria-hidden="true"><path class="pf-body" d="M27 4Q40 11 53 4L66 7Q73 9 76 17L79 33L65 35L64 67Q40 71 16 67L15 35L1 33L4 17Q7 9 14 7Z"/><path class="pf-cuff" d="M1.9 28.6L15 30.6V35L1 33ZM78.1 28.6L65 30.6V35L79 33Z"/><path class="pf-seam" d="M15 31V21M65 31V21"/><path class="pf-colw" d="M27 4Q40 12.5 53 4"/><path class="pf-coll" d="M27 4Q40 11 53 4M25.5 5.4Q40 15.5 54.5 5.4"/></svg>';
// 닉네임이 길면(5글자 이상) 두 줄로 — 어절(띄어쓰기) 단위로 줄을 바꿈. 괄호 부분은 따로 한 어절로 봄 (스테이(stay) → 스테이 / (stay))
//  띄어쓰기가 없는 한 낱말 닉네임은 읽기 좋게 가운데에서 (앞줄을 한 글자 길게: 그림자호수 → 그림자 / 호수)
export function nameLines(name, min = 5) {   // min 글자부터 두 줄 (팀 칸의 작은 유니폼은 4글자부터)
  const n = String(name || '').trim();
  const wid = [...n].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 0.6 : 1), 0);   // 영문·숫자는 한글보다 좁게
  if (wid < min) return [n];
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 1) {   // 어절 단위: 두 줄 길이가 가장 비슷해지는 곳에서
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const score = Math.max([...a].length, [...b].length);
      if (!best || score < best.score) best = { a, b, score };
    }
    return [best.a, best.b];
  }
  const m = n.match(/^(.+?)(\(.+\))$/) || n.match(/^(.+?_)(.+)$/);
  if (m) return [m[1], m[2]];
  const cs = [...n], cut = Math.ceil(cs.length / 2);
  return [cs.slice(0, cut).join(''), cs.slice(cut).join('')];
}
export const figHTML = (n, tail = '', min = 5) => {
  const ls = nameLines(n, min);
  if (tail) ls[ls.length - 1] += tail;
  const nl = Math.max(2, ...ls.map((l) => [...l].length));
  return `${FIG_SVG}<b class="pfn ${ls.length > 1 ? 'two' : ''}" style="--nl:${nl}">${ls.map((l) => `<span>${esc(l)}</span>`).join('')}</b>`;
};
// 차례 축구공 (WD_FUTSAL과 같은 공 — 차례인 팀 위에서 통통 튀고, 차례가 넘어가면 다음 팀으로 패스)
const BALL_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" fill="#fff" stroke="#131C2B" stroke-width="2"/><path d="M20 12.5l7 5.1-2.7 8.2h-8.6L13 17.6z" fill="#131C2B"/><path d="M20 12.5V3.2M27 17.6l8.6-2.9M24.3 25.8l5.4 7.4M15.7 25.8l-5.4 7.4M13 17.6l-8.6-2.9" stroke="#131C2B" stroke-width="2" fill="none"/><path d="M14.5 2.6L20 3.2l5.5-.6M35.6 14.7l2 5.3-.9 5.6M29.7 33.2l-4.7 3-5.4.9M10.3 33.2l4.7 3M4.4 14.7l-2 5.3.9 5.6" stroke="#131C2B" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 지명 애니메이션 (WD_FUTSAL과 같음): 다시 그리기 전 남은 선수 위치를 기억해 두었다가,
//  새로 팀에 들어온 선수가 그 자리에서 포물선을 그리며 팀 칸으로 날아가고 날아가는 도중 팀 조끼 색이 입혀짐
let flySnap = null, snapAt = 0;
// 운영 > 경기 화면은 다시 그릴 때 먼저 화면을 비우므로, 비우기 전에 위치를 기억해 둠
export function snap(scope) { draftSnap(scope); snapAt = Date.now(); }
function draftSnap(root) {
  const pool = root.querySelectorAll('.namegrid [data-pick]');
  const had = new Set([...root.querySelectorAll('.half [data-pid]')].map((e) => e.dataset.pid));
  if (!pool.length && !had.size) { flySnap = null; return; }
  const r = {};
  pool.forEach((b) => { const q = b.getBoundingClientRect(); if (q.width) r[b.dataset.pick] = { x: q.left, y: q.top, w: q.width, h: q.height }; });
  flySnap = { pool: r, had };
}
function draftFly(root, md) {
  const snap = flySnap; flySnap = null;
  if (!snap || reduced()) return;
  root.querySelectorAll('.half [data-pid]').forEach((el) => {
    const pid = el.dataset.pid, from = snap.pool[pid];
    if (snap.had.has(pid) || !from) return;
    const to = el.getBoundingClientRect(); if (!to.width) return;
    const f = document.createElement('div'); f.className = 'flytag jf'; f.innerHTML = figHTML(nameOf(pid, md));
    Object.assign(f.style, { left: from.x + 'px', top: from.y + 'px', width: from.w + 'px', height: from.h + 'px' });
    f.style.setProperty('--fw', from.w + 'px');
    const half = el.closest('.half'); const cs = half ? getComputedStyle(half) : null; const tc = cs ? cs.getPropertyValue('--tc').trim() : '';
    if (tc) { f.style.setProperty('--tc', tc); f.style.setProperty('--ti', cs.getPropertyValue('--ti').trim() || '#fff'); }
    document.body.appendChild(f); setTimeout(() => f.classList.add('vest'), 280); el.style.visibility = 'hidden';
    const dx = to.left + to.width / 2 - (from.x + from.w / 2), dy = to.top + to.height / 2 - (from.y + from.h / 2);
    const sc = Math.max(.45, Math.min(1.2, to.width / from.w)), lift = -Math.min(140, 60 + Math.abs(dx) * .15);
    const an = f.animate([{ transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
      { transform: `translate(${dx * .5}px,${dy * .5 + lift}px) scale(1.18) rotate(${dx > 0 ? 8 : -8}deg)`, offset: .45 },
      { transform: `translate(${dx}px,${dy}px) scale(${sc}) rotate(0deg)`, offset: 1 }], { duration: 720, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    const done = () => { f.remove(); el.style.visibility = ''; el.animate?.([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); };
    an.onfinish = done; setTimeout(() => { if (f.isConnected) done(); }, 1200);
  });
}
// 차례 공: 차례인 팀 이름표 위에서 튀고, 차례가 바뀌면 포물선으로 다음 팀에 패스
let ballPrev = null;
function placeBall(root) {
  const pitchEl = root.querySelector('.dboard');
  const el = pitchEl?.querySelector('.tball');
  if (!el) return;
  const tgt = pitchEl.querySelector('.capcard.turn .h-hd');
  if (!tgt) { el.style.display = 'none'; ballPrev = null; return; }
  const P = pitchEl.getBoundingClientRect(), r = tgt.getBoundingClientRect(), sz = 30;
  const x = r.left - P.left + r.width / 2 - sz / 2, y = r.top - P.top - sz + 10, k = tgt.closest('.capcard').dataset.k;
  Object.assign(el.style, { display: 'block', width: sz + 'px', height: sz + 'px', left: x + 'px', top: y + 'px' });
  if (ballPrev && ballPrev.k !== k && !reduced()) {
    const dx = ballPrev.x - x, dy = ballPrev.y - y, lift = -Math.min(150, 70 + Math.abs(dx) * .3), N = 18, D = 760, kf = [];
    for (let i = 0; i <= N; i++) { const t = i / N; kf.push({ transform: `translate(${dx * (1 - t)}px,${dy * (1 - t) + lift * 4 * t * (1 - t)}px)` }); }
    el.classList.add('passing');
    el.animate(kf, { duration: D, easing: 'linear' }).onfinish = () => el.classList.remove('passing');
    el.querySelector('.tb-b').animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${dx > 0 ? -360 : 360}deg)` }], { duration: D, easing: 'linear' });
  }
  ballPrev = { k, x, y };
}


// 팀 반쪽(축구장 왼쪽/오른쪽): 주장 · 팀 이름 · 색 · 선수
// 주장 카드: 축구장 그림 위쪽 (주장 · 순위 · 팀 이름 · 인원 · 팀 색 고르기)
function capCard(md, i, { ph, ds, myCap }) {
  const caps = md.captains || [];
  const ids = rosters(md)[i] || [];
  const col = colorOf(teamColor(md, i));
  const rank = (md.order || []).indexOf(i);
  const turn = ph === 'pick' && ds.turn === i;
  const mine = myCap === i;
  const canColor = ph === 'color' && (S.operator || mine);   // 팀 색: 드래프트 시작 때 주장이 고름 (운영진도 대신 가능)
  const capId = captainOf(md, i);
  const editName = S.operator && md.status !== 'played';
  return `<div class="capcard h${i} ${turn ? 'turn' : ''} ${mine ? 'mine' : ''} ${col ? '' : 'nocolor'}" data-k="${i}" style="${col ? `--tc:${col.hex};--ti:${col.text}` : ''}">
    <div class="h-hd">
      ${rank >= 0 && ph !== 'order' && ph !== 'color' ? `<em class="rank">${rank + 1}순위</em>` : ''}
      ${capId ? `<span class="hcap">👑 ${captainIds(md, i).map((x) => esc(nameOf(x, md))).join(' · ')}</span>` : ''}
      ${editName ? `<input class="tn tn-edit" data-tname="${i}" value="${esc(md.teamNames?.[i] || teamLabel(md, i))}" aria-label="팀 이름" title="팀 이름 (눌러서 고치기)">`
        : `<span class="tn">${esc(teamLabel(md, i))}${col && md.teamNames?.[i] ? ` · ${col.label}` : ''}</span>`}
      <span class="cnt"><b>${ids.length}</b>명</span>
      ${mine ? '<span class="meb">내 팀</span>' : ''}
    </div>
    ${canColor ? `<div class="h-sw">${palette(md).map((c) => `<button class="csw ${caps[i]?.color === c.key ? 'on' : ''}" style="--c:${c.hex};--ct:${c.text}" data-color="${i}:${c.key}">${c.label}</button>`).join('')}</div>` : ''}
  </div>`;
}
// 축구장 반쪽: 그 팀 선수 유니폼
function half(md, i, { ph, ds, myCap, final }) {
  const ids = rosters(md)[i] || [];
  const col = colorOf(teamColor(md, i));
  const turn = ph === 'pick' && ds.turn === i;
  const mine = myCap === i;
  const pend = !final && md.pending && md.pending.team === i ? md.pending.id : null;
  const last = (md.picks || []).slice(-1)[0];
  const capIds = captainIds(md, i);
  const others = ids.filter((x) => !capIds.includes(x));   // 주장(공동 주장 포함)은 위 카드에, 나머지 선수만
  const nTeams = rosters(md).length;
  const player = (id) => {
    const key = md.id + ':' + id; const nw = !seen.has(key); seen.add(key);
    const undo = !final && S.operator && last && last.id === id && last.team === i;
    const move = final && S.operator && md.status !== 'played';
    const nm = nameOf(id, md);
    if (undo) return `<button class="jf mini vest undo ${nw ? 'new' : ''}" data-unpick data-pid="${id}" title="눌러서 선택 취소">${figHTML(nm, ' ✕', 4)}</button>`;
    if (move) return `<button class="jf mini vest ${nw ? 'new' : ''}" data-swap="${i}:${id}" data-pid="${id}" title="눌러서 ${esc(teamLabel(md, (i + 1) % nTeams))}(으)로 옮기기">${figHTML(nm, '', 4)}</button>`;
    return `<div class="jf mini vest ${nw ? 'new' : ''}" data-pid="${id}">${figHTML(nm, '', 4)}</div>`;
  };
  return `<div class="half h${i} ${turn ? 'turn' : ''} ${mine ? 'mine' : ''} ${col ? '' : 'nocolor'}" data-k="${i}" style="${col ? `--tc:${col.hex};--ti:${col.text}` : ''}">
    <div class="stk pfs-row">${others.map(player).join('')}${pend ? `<div class="jf mini vest pendstk" title="선택 중">${figHTML(nameOf(pend, md), '', 4)}</div>` : ''}</div>
    ${turn ? `<div class="h-turn">${mine ? '내 차례예요!' : '지명 차례'}</div>` : ''}
  </div>`;
}
// 위: 주장 카드(운영진은 가운데 ⇄로 좌우 자리 바꾸기) · 아래: 축구장(왼쪽·오른쪽 팀 선수)
function pitch(md, opt) {
  const n = rosters(md).length;
  const canSwap = S.operator && n === 2 && md.status !== 'played' && !S.games.some((g) => g.matchdayId === md.id);
  return `<div class="dboard">
    <div class="tball" aria-hidden="true"><i class="tb-sh"></i><b class="tb-b">${BALL_SVG}</b></div>
    <section class="capbar n${n}">${Array.from({ length: n }, (_, i) => capCard(md, i, opt) + (i === 0 && n === 2 ? (canSwap ? '<button class="swapside" data-swapside title="왼쪽·오른쪽 자리 바꾸기" aria-label="자리 바꾸기">⇄</button>' : '<span class="vs">VS</span>') : '')).join('')}</section>
    <section class="pitch n${n}">
      <div class="lines" aria-hidden="true"><i class="mid"></i><i class="circ"></i><i class="box l"></i><i class="box r"></i></div>
      ${Array.from({ length: n }, (_, i) => half(md, i, opt)).join('')}
    </section></div>`;
}

// 위쪽 진행판: 단계 표시 + 지금 할 일
function stepper2(ph) {
  const cur = ph === 'allin' ? 3 : PH.findIndex(([k]) => k === ph);
  const SHORT = { color: '팀 색', order: '순서 추첨', pick: '선수 선택', done: '팀 확정' };
  return `<ol class="dmini">${PH.map(([k], n, _, l = SHORT[k]) => `<li class="${n < cur ? 'done' : n === cur ? 'now' : ''}"><i>${n + 1}</i><span>${l}</span></li>`).join('')}</ol>`;
}
function panel(md, ph, ds, myCap) {
  const caps = md.captains || [];
  const nm = (i) => esc(teamLabel(md, i));
  if (ph === 'color') {
    const left = caps.map((c, i) => (c.color ? null : i)).filter((x) => x != null);
    return `<b>${myCap >= 0 ? '우리 팀 색을 골라 주세요 — 아래 팀 칸에서' : '주장들이 팀 색을 고르는 중이에요'}</b>
      <p>먼저 고른 팀이 그 색, 다른 팀은 남은 색${S.operator ? ' · 운영진도 대신 고를 수 있어요' : ''}</p>`;
  }
  if (ph === 'order') {
    const g = md.cards;
    const canDraw = (i) => g && g.picks?.[i] == null && (S.operator || myCap === i);
    return `${!g ? `<b>${S.operator ? '우선순위 추첨을 시작해 주세요' : '운영진이 추첨을 시작하면 카드를 뽑아요'}</b>
        <p>카드 숫자가 작은 팀이 1순위</p>
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
    const kc = colorOf(teamColor(md, k));
    return `<b class="dturn" style="${kc ? `--tc:${kc.hex}` : ''}">${myCap === k ? '내 차례 — 아래에서 선수를 고르세요' : `${nm(k)} 차례`}</b>${flow}`;
  }
  if (ph === 'allin') return `<b>🏁 모든 선수 배치 완료 · ${S.operator ? '팀을 확정해 주세요' : '운영진이 팀을 확정해요'}</b>
    ${S.operator ? '<button class="btn cta sm" data-final>✅ 팀 확정</button>' : ''}`;
  return '';
}

function board(md, myCap) {
  const ds = draftState(md);
  const ph = draftPhase(md);
  // 내 차례 알림
  const mine = ph === 'pick' && myCap >= 0 && ds.turn === myCap;
  if (mine && !wasMyTurn) { try { navigator.vibrate?.([120, 80, 120]); } catch {} toast('내 차례예요! 선수를 골라 주세요'); }
  wasMyTurn = mine;
  const canPick = ph === 'pick' && (S.operator || myCap === ds.turn);
  const pend = ph === 'pick' && md.pending && md.pending.team === ds.turn && ds.remaining.includes(md.pending.id) ? md.pending : null;
  const pc = pend ? colorOf(teamColor(md, pend.team)) : null;
  return `<div class="dwrap" data-dwrap>
    <section class="dhead">${stepper2(ph)}${S.operator ? '<button class="dh-op" data-opmenu aria-label="운영 메뉴">⚙ 운영</button>' : ''}
      <div class="dh-body">${panel(md, ph, ds, myCap)}</div></section>
    ${pitch(md, { ph, ds, myCap, final: false })}
    ${ph === 'pick' ? `<section class="dpool"><div class="pool-hd">남은 선수 ${ds.remaining.length}명${canPick ? ' · 눌러서 고르기' : ''}</div>
      <div class="namegrid">${ds.remaining.map((id) => { const p = pend?.id === id;
        return `<button class="jf pfb ${p ? 'pend vest' : ''}" ${p && pc ? `style="--tc:${pc.hex};--ti:${pc.text}"` : ''} data-pick="${id}" ${canPick ? '' : 'disabled'}>${figHTML(nameOf(id, md))}</button>`; }).join('')}</div>
    </section>` : ''}
  </div>
  ${pend && canPick ? `<div class="dpop-wrap"><div class="dpop" role="dialog" aria-modal="true" style="${pc ? `--tc:${pc.hex};--ti:${pc.text}` : ''}">
    <small>${esc(teamLabel(md, pend.team))} · ${ds.picks.length + 1}번째 지명</small>
    <span class="jf pfb vest dpop-j">${figHTML(nameOf(pend.id, md))}</span>
    <b>${esc(nameOf(pend.id, md))}</b>
    <div class="dpop-btns"><button class="btn ghost" data-repick>다시 선택</button><button class="btn cta" data-confirm>선택 완료</button></div>
  </div></div>` : ''}`;
}
// 운영 메뉴 (드래프트 화면을 한 화면에 두려고 창으로)
function opMenu(md) {
  const ds = draftState(md), caps = md.captains || [], P = mdPath(md.id);
  const { el, close } = modal('드래프트 운영', `<div class="stack">
    <p class="tiny muted">주장은 카페 닉네임으로 로그인하면 오른쪽 위 👑 드래프트로 바로 들어와요. 팀 이름은 팀 칸의 이름을 눌러 고칠 수 있어요.</p>
    ${ds.picks.length ? '<button class="btn ghost" data-m="undo">↶ 마지막 지명 취소</button>' : ''}
    ${!ds.picks.length && (md.order || md.cards) ? '<button class="btn ghost" data-m="reorder">우선순위 다시 추첨</button>' : ''}
    ${caps.length === 2 && caps.every((c) => c.color) ? '<button class="btn ghost" data-m="swapcolor">팀 색 서로 바꾸기</button>' : ''}
    ${caps.length === 2 && !S.games.some((g) => g.matchdayId === md.id) ? '<button class="btn ghost" data-m="swapside">⇄ 왼쪽·오른쪽 자리 바꾸기</button>' : ''}
    <button class="btn ghost danger" data-m="reset">주장 다시 정하기</button></div>`);
  const act = {
    undo: () => db.tx(P, (cur) => { cur.picks = (cur.picks || []).slice(0, -1); cur.pending = null; return cur; }),
    reorder: () => db.tx(P, (cur) => { if ((cur.picks || []).length) return null; cur.order = null; cur.cards = null; return cur; }),
    swapcolor: () => db.tx(P, (cur) => { const [a, b] = cur.captains; if (!a?.color || !b?.color) return null; [a.color, b.color] = [b.color, a.color]; return cur; }),
    swapside: () => { ballPrev = null; return swapSides(md); },
    reset: async () => { if (!confirm('주장과 지명 내역을 모두 지우고 다시 시작할까요?')) return;
      await db.tx(P, (cur) => { cur.captains = []; cur.picks = []; cur.teams = []; cur.teamNames = null; cur.order = null; cur.cards = null; cur.pending = null; cur.status = 'captains'; cur.draftStarted = false; return cur; }); },
  };
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', async () => { close(); await act[b.dataset.m](); }));
}
// 한 화면에 맞추기: 드래프트 영역을 화면 높이에 맞추고, 축구장·남은 선수 유니폼 크기를 칸에 맞게 줄임
function fitDraft(root) {
  const w = root.querySelector('[data-dwrap]'); if (!w) return;
  const tab = document.getElementById('tabbar'), tr = tab?.getBoundingClientRect();
  const bottomBar = tr && tr.top > innerHeight / 2 ? innerHeight - tr.top : 0;
  const top = w.getBoundingClientRect().top + window.scrollY;
  const head0 = w.querySelector('.dhead')?.offsetHeight || 0, cap0 = w.querySelector('.capbar')?.offsetHeight || 0;
  const minH = head0 + cap0 + 130 + (w.querySelector('.dpool') ? 120 : 0) + 30;   // 이보다 작으면 (아주 작은 화면) 조금 스크롤
  let H = Math.max(minH, Math.floor(innerHeight - top - bottomBar - 8));
  w.style.height = H + 'px';
  const over = document.documentElement.scrollHeight - innerHeight;   // 아래 여백 때문에 넘치면 그만큼 줄임
  if (over > 0 && H - over >= minH) { H -= over; w.style.height = H + 'px'; }
  const head = w.querySelector('.dhead'), capbar = w.querySelector('.capbar'), pitchEl = w.querySelector('.pitch'), pool = w.querySelector('.dpool');
  let room = H - (head?.offsetHeight || 0) - (capbar?.offsetHeight || 0) - 22;
  if (pool) {
    const n = pool.querySelectorAll('[data-pick]').length, W = pool.clientWidth - 16;
    let fw = 60, need = 0;
    for (; fw >= 38; fw -= 2) { const cols = Math.max(1, Math.floor((W + 6) / (fw + 6))); need = Math.ceil(n / cols) * (fw * 0.9 + 6) + 30; if (need <= room * 0.5) break; }
    pool.style.setProperty('--pfw', fw + 'px');
    const ph = Math.max(80, Math.min(need, Math.round(room * 0.58)));
    pool.style.height = ph + 'px'; room -= ph + 6;
  }
  if (pitchEl) {
    const halves = [...pitchEl.querySelectorAll('.half')];
    const maxN = Math.max(1, ...halves.map((h) => h.querySelectorAll('.jf').length));
    const Wh = pitchEl.clientWidth / Math.max(1, halves.length) - 26, Hp = Math.max(110, room);
    let fw = 54;
    for (; fw >= 28; fw -= 2) { const cols = Math.max(1, Math.floor((Wh + 3) / (fw + 3))); if (Math.ceil(maxN / cols) * (fw * 0.9 + 5) + 26 <= Hp) break; }
    pitchEl.style.setProperty('--mfw', fw + 'px');
  }
}
let fitBound = false;
function bindFit() { if (fitBound) return; fitBound = true; addEventListener('resize', () => { const r = document.querySelector('[data-dwrap]')?.parentElement; if (r) fitDraft(r); }); }
// 왼쪽·오른쪽 자리 바꾸기 (운영진) — 팀 번호가 바뀌므로 지명·순위·팀·이벤트 팀 정보를 모두 함께 뒤집음
export function swapSides(md) {
  return db.tx(mdPath(md.id), (cur) => {
    const n = (cur.captains || []).length || (cur.teams || []).length;
    if (n !== 2) return null;
    const f = (t) => (t === 0 ? 1 : t === 1 ? 0 : t);
    if (cur.captains?.length === 2) cur.captains = [cur.captains[1], cur.captains[0]];
    if (cur.teamNames?.length === 2) cur.teamNames = [cur.teamNames[1], cur.teamNames[0]];
    if (cur.teams?.length === 2) cur.teams = [cur.teams[1], cur.teams[0]];
    if (cur.eventTeams?.length === 2) cur.eventTeams = [cur.eventTeams[1], cur.eventTeams[0]];
    if (cur.teamColors?.length === 2) cur.teamColors = [cur.teamColors[1], cur.teamColors[0]];
    cur.picks = (cur.picks || []).map((p) => ({ ...p, team: f(p.team) }));
    if (cur.order?.length === 2) cur.order = cur.order.map(f);
    if (cur.cards?.picks) { const o = cur.cards.picks, np = {}; if (o[1] != null) np[0] = o[1]; if (o[0] != null) np[1] = o[0]; cur.cards.picks = np; }
    if (cur.pending) cur.pending.team = f(cur.pending.team);
    Object.values(cur.apps || {}).forEach((a) => { if (a.team != null) a.team = f(a.team); });
    Object.values(cur.declines || {}).forEach((a) => { if (a.team != null) a.team = f(a.team); });
    if (cur.groupOrder?.length === 2) cur.groupOrder = [cur.groupOrder[1], cur.groupOrder[0]];
    return cur;
  });
}
function bindTeamNames(root, md) {
  root.querySelectorAll('[data-tname]').forEach((x) => x.addEventListener('change', async () => {
    const i = +x.dataset.tname;
    await db.tx(mdPath(md.id), (cur) => { const n = [...(cur.teamNames || [])]; while (n.length <= i) n.push(''); n[i] = x.value.trim(); cur.teamNames = n; return cur; });
    toast('팀 이름을 저장했어요');
  }));
}
function bindBoard(root, md, myCap) {
  bindTeamNames(root, md); bindFit();
  root.querySelector('[data-opmenu]')?.addEventListener('click', () => opMenu(md));
  root.querySelector('[data-repick]')?.addEventListener('click', () => db.tx(mdPath(md.id), (cur) => { cur.pending = null; return cur; }));
  root.querySelector('[data-swapside]')?.addEventListener('click', () => { ballPrev = null; swapSides(md); });
  const P = mdPath(md.id);
  // ① 팀 색: 먼저 고른 팀이 가져감
  // ① 팀 색: 드래프트 시작 때 주장이 고름 — 먼저 고른 주장이 가져가고 다른 팀은 남은 색 (운영진도 대신 가능)
  const assign = (i, key) => db.tx(P, (cur) => {
    if (!S.operator && myCap !== i) return null;
    if (cur.captains.every((c) => c.color)) return null;   // 이미 정해짐 (먼저 고른 주장이 가져감)
    cur.captains[i].color = key;
    if (cur.captains.length === 2) cur.captains[1 - i].color = COLORS2.find((c) => c !== key);
    return cur;
  });
  root.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { const [i, key] = b.dataset.color.split(':'); assign(+i, key); }));
  root.querySelector('[data-swapcolor]')?.addEventListener('click', () => db.tx(P, (cur) => {
    const [a, b2] = cur.captains; if (!a?.color || !b2?.color) return null; [a.color, b2.color] = [b2.color, a.color]; return cur;
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

// ── 이벤트 경기(주장만 미리 정함): 주장 단계 없이 바로 드래프트 ──
function presetCaptains(md) {
  const ev = capEvent(md);
  const early = !!closeTime(md) && !closePassed(md) && ['open', 'closed'].includes(md.status);
  const missing = ev.some((t) => !evCaps(t).length);
  return `<section class="card ${S.operator ? 'op' : ''}"><h2>이벤트 경기 — 주장이 미리 정해져 있어요</h2>
    <div class="cap-links">${ev.map((t, i) => `<div><span>${i === 0 ? '왼쪽' : '오른쪽'} · ${colorChip(t.color, t.name)}</span><b>👑 ${evCaps(t).length ? evCaps(t).map((c) => esc(nameOf(c, md))).join(' · ') : '<span class="warn-t">주장 미정</span>'}</b></div>`).join('')}</div>
    <p class="muted small">주장 선정 단계 없이 이 주장들로 드래프트를 해요. 팀 색도 미리 정해져 있어 바로 우선순위 추첨부터 시작해요.</p>
    ${S.operator ? (missing ? '<p class="small warn-t">경기일 수정에서 두 팀 주장을 모두 정해 주세요.</p>'
      : `${early ? `<p class="small deadline">⏰ 신청 ${esc(closeLabel(md))} — 마감 뒤에 시작하세요.</p>` : ''}<button class="btn" data-presetstart>${['open', 'closed'].includes(md.status) ? '신청 마감 · ' : ''}드래프트 시작</button>`)
      : '<p class="small">운영진이 드래프트를 시작하면 이 화면에서 볼 수 있어요.</p>'}</section>`;
}
function bindPreset(root, md) {
  root.querySelector('[data-presetstart]')?.addEventListener('click', async () => {
    const early = !!closeTime(md) && !closePassed(md) && ['open', 'closed'].includes(md.status);
    if (early && !confirm(`아직 신청 마감 시각(${closeLabel(md).replace(' 마감', '')}) 전이에요. 지금 드래프트를 시작하면 신청이 닫혀요. 시작할까요?`)) return;
    await db.tx(mdPath(md.id), (cur) => {
      const ev = capEvent(cur); if (!ev || ev.some((t) => !evCaps(t).length)) return null;
      cur.captains = ev.map((t) => { const cs = evCaps(t); return { id: cs[0], co: cs.slice(1), token: randomToken(), color: t.color || null }; });
      cur.teamNames = ev.map((t) => t.name);
      // 주장은 참석으로
      cur.apps = cur.apps || {}; cur.declines = cur.declines || {};
      ev.forEach((t) => evCaps(t).forEach((c) => { if (!cur.apps[c]) cur.apps[c] = { at: Date.now(), source: 'captain' }; delete cur.apps[c].pending; delete cur.declines[c]; }));
      cur.picks = []; cur.teams = []; cur.order = null; cur.cards = null; cur.pending = null;
      cur.status = 'drafting'; cur.draftStarted = true; if (early) cur.earlyTeams = true;
      return cur;
    });
    toast('드래프트를 시작했어요 — 우선순위 추첨부터 해요');
  });
}

// ── 3. 확정된 팀 — 같은 축구장 화면, 운영진은 선수를 옆 팀으로 옮겨 밸런스 조정 ──
function teamsView(md) {
  const ds = draftState(md);
  return `<section class="card dpanel">${stepper2('done')}<div class="dp-body"><div class="dp-t">팀 확정</div>
      <b>${rosters(md).map((ids, i) => `${esc(teamLabel(md, i))} ${ids.length}명`).join(' vs ')}</b>
      ${S.operator && md.status !== 'played' ? '<p>선수 유니폼을 누르면 상대 팀으로 옮겨요.</p>' : ''}</div></section>
    ${pitch(md, { ph: 'done', ds, myCap: -1, final: true })}
    ${S.operator && md.status !== 'played' ? `<section class="card op"><h2>운영</h2>
      <div class="row wrap"><a class="btn" href="#/notice">팀 공지 이미지 만들기</a>
      ${md.status === 'teams' && (md.captains || []).length && !teamEvent(md) ? '<button class="btn ghost danger" data-reopen>드래프트로 되돌리기</button>' : ''}</div></section>` : ''}`;
}
function bindTeams(root, md) {
  bindTeamNames(root, md);
  root.querySelector('[data-swapside]')?.addEventListener('click', () => swapSides(md));
  const moveTo = async (from, id, to) => {
    await db.tx(mdPath(md.id), (cur) => {
      cur.teams[from].members = cur.teams[from].members.filter((x) => x !== id);
      cur.teams[to].members.push(id); return cur;
    });
    toast(`${nameOf(id, md)} → ${teamLabel(md, to)}`);
  };
  root.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => { const [f, id] = b.dataset.swap.split(':'); moveTo(+f, id, (+f + 1) % rosters(md).length); }));
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
