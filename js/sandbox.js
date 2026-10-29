// 🧪 베타 데모 (베타 테스트 기간)
//  · 운영모드 › 설정의 '베타 데모 기능'이 켜져 있으면, 앱을 열 때 [일반 회원 · 주장 · 운영진] 중 체험할 화면을 고름
//  · 고르면 지금 회원·경기·기록을 이 기기에 복사한 "체험판"으로 들어가 그 역할의 화면을 그대로 써 봄
//    체험판에서 한 일은 이 기기에만 남고 서버·실제 기록에는 전혀 반영되지 않음. 역할은 체험 중에도 바꿀 수 있음
//  · 데모에서 나가기(실제 앱으로)는 운영진 비밀번호를 넣어야만 가능 → 나가면 실제 운영모드로 접속
//    운영진이 실제 운영모드 › 설정에서 '베타 데모 기능'을 끄면, 회원 기기도 다음에 열 때 자동으로 실제 앱으로 돌아옴
import { S, me, onChange, setOperator } from './state.js?v=0.1.82';
import { db, SANDBOX_KEY, inSandbox } from './store.js?v=0.1.82';
import { FIREBASE } from './config.js?v=0.1.82';
import { createSample, clearSamples } from './sample.js?v=0.1.82';
import { hardReload } from './update.js?v=0.1.82';
import { saveSession, loadSession, isRemembered } from './auth.js?v=0.1.82';
import { modal, focusNow } from './ui.js?v=0.1.82';
import { esc, toast } from './util.js?v=0.1.82';

export { inSandbox };
export const DEMO_PIN = '0000';   // 체험판 안의 운영진 비밀번호 (체험용)
export const betaOn = () => S.team.betaDemo !== false;
export const ROLES = {
  member: { label: '일반 회원', icon: '👤', desc: '참석·불참 신청, 경기모드(우리 팀 포지션·실시간 점수), 경기결과·개인 기록' },
  captain: { label: '주장', icon: '👑', desc: '드래프트(팀 색 고르기·우선순위 추첨·선수 뽑기), 라운드별 우리 팀 포지션 정하기' },
  op: { label: '운영진', icon: '📣', desc: '경기 등록·신청 마감·주장 선정·드래프트 진행·골 기록·결과·공지·회원 관리' },
};
const K = { on: 'teamapp:sandbox', role: 'teamapp:sandbox:role', seed: 'teamapp:sandbox:seed', pin: 'teamapp:sandbox:pin', live: 'teamapp:auth:live', who: 'teamapp:sandbox:who' };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
export const sandboxRole = () => (inSandbox() ? ls.get(K.role) || 'member' : null);

const strip = ({ id, ...rest }) => rest;
// 체험판 만들기 → 다시 불러오면 체험판으로 시작
export function enterSandbox(role = 'member') {
  const data = {};
  data['meta/team'] = { ...strip(S.team), operatorPin: DEMO_PIN, betaDemo: true };
  S.members.forEach((m) => { data['members/' + m.id] = strip(m); });
  (S.allMatchdays || S.matchdays).filter((m) => !m.sample).forEach((m) => { data['matchdays/' + m.id] = strip(m); });
  S.fbGames.filter((g) => !String(g.matchdayId).startsWith('sample_')).forEach((g) => { data['games/' + g.id] = strip(g); });
  // 체험할 회원: 로그인한 회원 그대로, 아니면 활동 회원 중 한 명
  const live = loadSession();
  const pool = S.members.filter((m) => m.active !== false && m.inSheet !== false && !/탈퇴/.test(m.grade || ''));
  const pid = (live?.pid && S.members.some((m) => m.id === live.pid)) ? live.pid : pool[Math.floor(Math.random() * pool.length)]?.id;
  try {
    localStorage.setItem(SANDBOX_KEY, JSON.stringify(data));
    if (live) ls.set(K.live, JSON.stringify({ s: live, r: isRemembered() }));
    ls.set(K.pin, String(S.team.operatorPin || ''));
    ls.set(K.on, '1'); ls.set(K.role, role); ls.set(K.seed, '1'); ls.set(K.who, pid || '');
  } catch (e) { toast('이 기기 저장 공간이 부족해 체험판을 만들지 못했어요'); return; }
  saveSession(pid ? { pid, temp: true, demo: true } : null, false);   // 체험판 안에서만 쓰는 로그인
  if (role === 'op') sessionStorage.setItem('teamapp:op', '1'); else sessionStorage.removeItem('teamapp:op');
  location.hash = role === 'op' ? '#/plan' : '#/home';
  hardReload();
}

// 실제 앱으로 나가기 (운영진 비밀번호 확인 뒤) → 실제 운영모드로 접속
function leaveSandbox() {
  [K.on, K.role, K.seed, K.pin, K.who, SANDBOX_KEY].forEach(ls.del);
  const live = ls.get(K.live); ls.del(K.live);
  try { const o = live && JSON.parse(live); saveSession(o?.s || null, !!o?.r); } catch { saveSession(null); }
}
export function askExit() {
  const { el, close } = modal('데모에서 나가기', `<form class="stack">
    <p class="small">데모에서 나가 실제 앱으로 돌아가려면 <b>운영진 비밀번호</b>가 필요해요. 나가면 실제 운영모드로 접속돼요. 체험판에서 한 일은 지워져요.</p>
    <label>운영진 비밀번호 (실제)<input type="password" inputmode="numeric" name="pin" autocomplete="off" enterkeyhint="go"></label>
    <button class="btn">나가기 · 운영모드 접속</button></form>`);
  focusNow(el.querySelector('[name=pin]'));
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = e.target.pin.value.trim();
    const real = (await liveTeam())?.operatorPin ?? ls.get(K.pin);
    if (!pin || pin !== String(real ?? '')) return toast('운영진 비밀번호가 맞지 않아요');
    leaveSandbox(); sessionStorage.setItem('teamapp:op', '1'); localStorage.setItem('teamapp:opdev', '1');
    close(); location.hash = '#/settings'; hardReload();
  });
}

// 실제(서버) 팀 설정 읽기 — 체험판은 서버에 연결하지 않으므로 REST로 한 번만 가볍게
async function liveTeam() {
  try {
    if (FIREBASE.apiKey && FIREBASE.projectId) {
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/meta/team?key=${FIREBASE.apiKey}`, { cache: 'no-store' });
      if (r.ok) { const f = (await r.json()).fields || {}; return { betaDemo: f.betaDemo ? f.betaDemo.booleanValue : undefined, operatorPin: f.operatorPin?.stringValue ?? f.operatorPin?.integerValue }; }
    }
  } catch { /* 연결 안 됨 */ }
  try { const d = JSON.parse(localStorage.getItem('teamapp:db:v1') || 'null'); if (d) return d['meta/team'] || {}; } catch {}
  return null;
}

// 역할 바꾸기 (체험판 안에서) — 그 역할에 맞는 체험 경기로 새로 만듦
export function switchRole(role) {
  ls.set(K.role, role); ls.set(K.seed, '1');
  if (role === 'op') setOperator(true); else setOperator(false);
  seed(true);
  location.hash = role === 'op' ? '#/plan' : '#/home';
}
let seeding = false;
async function seed(force) {
  if (seeding || (!force && ls.get(K.seed) !== '1') || !S.members.length) return;
  seeding = true; ls.del(K.seed);
  const role = sandboxRole(), pid = me.id || ls.get(K.who) || null;
  try {
    await clearSamples();
    const meAs = role === 'captain' ? 'captain' : 'player';
    const plan = role === 'captain' ? [['drafting', 'normal'], ['closed', 'normal'], ['teams', 'normal'], ['played', 'normal'], ['open', 'captains']]
      : role === 'op' ? [['open', 'normal'], ['closed', 'normal'], ['drafting', 'normal'], ['teams', 'normal'], ['played', 'normal'], ['open', 'teams']]
      : [['open', 'normal'], ['teams', 'normal'], ['played', 'normal'], ['open', 'teams']];
    for (const [stage, kind] of plan) await createSample({ stage, kind, me: pid, meAs });
    toast(`${ROLES[role].label} 체험 경기를 만들었어요`);
  } catch (e) { console.warn(e); }
  seeding = false;
}

// 체험판 시작: 위쪽 띠 · 체험 경기 만들기 · 데모가 꺼졌으면 실제 앱으로
export function startSandbox() {
  if (!inSandbox()) return;
  document.body.classList.add('sandbox');
  const bar = document.createElement('div');
  bar.className = 'sbx-bar';
  document.body.prepend(bar);
  const paint = () => {
    const r = ROLES[sandboxRole()] || ROLES.member, nm = S.members.find((m) => m.id === me.id)?.name;
    bar.innerHTML = `<span>🧪 <b>데모 체험</b> · ${r.icon} ${r.label}${nm && sandboxRole() !== 'op' ? ` (${esc(nm)})` : ''} <small>실제 기록에 반영 안 됨</small></span>
      <span class="sbx-btns"><button type="button" data-sbxrole>역할 바꾸기</button><button type="button" data-sbxexit>나가기</button></span>`;
  };
  paint();
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-sbxrole]')) pickRole(true);
    if (e.target.closest('[data-sbxexit]')) askExit();
  });
  onChange(() => { paint(); seed(false); });
  // 운영진이 데모를 껐으면 실제 앱으로 돌아감
  const check = async () => { const t = await liveTeam(); if (t && t.betaDemo === false) { leaveSandbox(); toast('베타 데모가 끝났어요 — 실제 앱으로 돌아가요'); setTimeout(hardReload, 800); } };
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}

// 역할 고르기 화면 (데모 시작 전 · 체험 중 역할 바꾸기)
export function roleCards(cur) {
  return `<div class="role-list">${Object.entries(ROLES).map(([k, r]) => `<button type="button" class="role-card ${k === cur ? 'on' : ''}" data-role="${k}">
    <span class="ri">${r.icon}</span><span><b>${r.label}</b><small>${r.desc}</small></span></button>`).join('')}</div>`;
}
export function pickRole(inside) {
  const { el, close } = modal('어떤 화면을 체험할까요?', `<div class="stack">${roleCards(sandboxRole())}
    <p class="tiny muted">역할을 바꾸면 그 역할에 맞는 체험 경기로 새로 만들어요.</p></div>`);
  el.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => { close(); if (inside) switchRole(b.dataset.role); else enterSandbox(b.dataset.role); }));
}
// 앱을 열었을 때(데모가 켜진 기간) 보여 주는 첫 화면
export function renderPicker(root, askPin) {
  document.body.classList.add('gate');
  const ready = S.members.length > 0;
  root.innerHTML = `<section class="lg demo-pick">
    ${S.team.emblem ? `<img class="lg-emb" src="${S.team.emblem}" alt="">` : ''}
    <h1>${esc(S.team.name)} 베타 체험</h1>
    <p class="muted">지금은 베타 테스트 기간이에요. 체험할 화면을 고르면 실제 회원·경기 기록으로 만든 체험판에서 모든 기능을 써 볼 수 있어요. <b>실제 기록에는 반영되지 않아요.</b></p>
    <div class="card lg-card">${ready ? roleCards() : '<p class="muted small center">불러오는 중…</p>'}</div>
    <button class="link lg-op" data-realop>운영진 실제 접속 (운영진 비밀번호) ›</button>
  </section>`;
  root.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => enterSandbox(b.dataset.role)));
  root.querySelector('[data-realop]').addEventListener('click', askPin);
}
