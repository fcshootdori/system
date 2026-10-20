// 슛도리 앱 — 화면 틀·메뉴·라우팅
//  메뉴 구성은 WD_FUTSAL과 같음
//   · 일반 회원: 홈 · 일정 · ⚽경기모드 · 경기결과 · 내 정보
//   · 운영모드: 일정 · 경기 · 공지 · 회원 · 설정
//   · 주장: 오른쪽 위 👑 드래프트 버튼으로 입장
import { APP_NAME, APP_VERSION } from './config.js';
import { initStore, db } from './store.js';
import { S, startSync, onChange, setOperator, opDevice, captainMatchday, go } from './state.js';
import { esc, toast } from './util.js';
import { modal } from './ui.js';

import * as home from './views/home.js';
import * as schedule from './views/schedule.js';
import * as matchmode from './views/matchmode.js';
import * as results from './views/results.js';
import * as myinfo from './views/me.js';
import * as apply from './views/apply.js';
import * as draft from './views/draft.js';
import * as games from './views/games.js';
import * as records from './views/records.js';
import * as run from './views/run.js';
import * as notice from './views/notice.js';
import * as admin from './views/admin.js';
import * as membersView from './views/members.js';
import * as loginView from './views/login.js';
import { loadSession, saveSession, verify } from './auth.js';
import { startAutoSync } from './member-sync.js';
import { closePassed } from './domain.js';

const MEMBER_TABS = [['home', '홈', '⌂'], ['sched', '일정', '▦'], ['mm', '경기모드', '⚽'], ['results', '경기결과', '▤'], ['me', '내 정보', '☺']];
const OP_TABS = [['plan', '일정', '▦'], ['run', '경기', '⚑'], ['notice', '공지', '✉'], ['members', '회원', '☺'], ['settings', '설정', '⚙']];

const ROUTES = {
  // 회원 메뉴
  home: { view: home }, sched: { view: schedule }, mm: { view: matchmode }, results: { view: results }, me: { view: myinfo },
  // 회원 메뉴 안쪽 화면 (하단 메뉴는 그대로)
  apply: { view: apply, parent: 'home' }, draft: { view: draft, parent: 'home' },
  games: { view: games, parent: 'results' }, records: { view: records, parent: 'results' },
  login: { view: loginView },
  // 운영 메뉴
  plan: { view: schedule, op: true, sub: 'op' }, run: { view: run, op: true }, notice: { view: notice, op: true },
  members: { view: membersView, op: true }, settings: { view: admin, op: true, sub: 'settings' },
};

function parseHash() {
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const fallback = S.operator ? 'plan' : 'home';
  return { name: ROUTES[name] ? name : fallback, params: rest };
}

function renderShell() {
  document.documentElement.style.setProperty('--brand', S.team.primary || '#1e3a8a');
  document.title = S.team.name;
  const { name } = parseHash();
  const capMd = !S.operator && captainMatchday();
  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="#/${S.operator ? 'plan' : 'home'}">
      ${S.team.emblem ? `<img src="${S.team.emblem}" alt="">` : `<span class="brand-dot"></span>`}
      <span>${esc(S.team.name)}</span>${S.operator ? '<em class="op-tag">운영</em>' : ''}
    </a>
    <div class="top-actions">
      ${capMd ? `<a class="pill cap" href="#/draft">👑 드래프트</a>` : ''}
      ${S.operator || opDevice() ? `<button class="pill ${S.operator ? 'on' : 'ghost'}" data-op>${S.operator ? '운영모드 끄기' : '운영모드'}</button>` : ''}
    </div>`;
  const tabs = S.operator ? OP_TABS : MEMBER_TABS;
  const active = ROUTES[name]?.parent || name;
  document.getElementById('tabbar').innerHTML = `<div class="nav-brand">${S.team.emblem ? `<img src="${S.team.emblem}" alt="">` : ''}<span>${esc(S.team.name)}</span></div>` + tabs.map(([k, label, icon]) =>
    `<a href="#/${k}" class="${k === active ? 'on' : ''} ${k === 'mm' ? 'mm' : ''}" ${k === active ? 'aria-current="page"' : ''}><i>${icon}</i><span>${label}</span></a>`).join('');
  document.body.classList.toggle('op', S.operator);
  const banner = document.getElementById('demo-banner');
  if (db.authError) banner.textContent = 'Firebase 익명 로그인이 꺼져 있어 저장이 안 돼요 — 콘솔 Authentication › 로그인 방법 › 익명을 켜 주세요.';
  banner.hidden = db.mode !== 'demo' && !db.authError;
}

let pending = false;
function render() {
  const { name, params } = parseHash();
  let route = ROUTES[name];
  const root = document.getElementById('view');
  // 로그인 전에는 로그인 화면만 (운영모드는 운영진 비밀번호로 따로 들어감)
  const gated = !S.auth && !S.operator;
  document.body.classList.toggle('gate', gated || name === 'login');
  if (gated || name === 'login') {
    if (S.auth && name === 'login') { location.hash = '#/home'; return; }
    loginView.render(root, {}); return;
  }
  if (route.op && !S.operator) { go('home'); return; }
  route.view.render(root, { params, sub: route.sub });
}
const typing = () => { const a = document.activeElement; return a && a.closest('#view') && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };
function safeRender() {
  if (typing()) { pending = true; return; }
  renderShell(); render();
}

export function askPin() {
  const { el, close } = modal('운영모드', `
    <form class="stack">
      <label>운영진 비밀번호<input type="password" inputmode="numeric" name="pin" autocomplete="off" autofocus></label>
      <button class="btn">운영모드 켜기</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.pin.value === String(S.team.operatorPin)) { setOperator(true); close(); toast('운영모드를 켰어요'); go('plan'); }
    else toast('비밀번호가 맞지 않아요');
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-op]')) {
    if (S.operator) { setOperator(false); toast('운영모드를 껐어요'); go('home'); } else askPin();
  }
});
document.addEventListener('focusout', () => setTimeout(() => {
  if (pending && !typing()) { pending = false; renderShell(); render(); }
}, 0));
window.addEventListener('hashchange', () => { renderShell(); render(); window.scrollTo(0, 0); });

// 신청 자동 마감: 마감 시각이 지난 신청 중 경기 → '신청 마감' (운영진이 다시 연 경기는 제외)
const closing = new Set();
function autoClose() {
  S.matchdays.forEach((md) => {
    if (md.status !== 'open' || md.cancelled || md.reopened || md.source === 'sheet' || closing.has(md.id) || !closePassed(md)) return;
    closing.add(md.id);
    db.set('matchdays/' + md.id, { status: 'closed', autoClosedAt: Date.now() }, { merge: true }).catch(() => closing.delete(md.id));
  });
}

(async function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('c')) localStorage.setItem('teamapp:captain', qs.get('c'));
  S.captainToken = localStorage.getItem('teamapp:captain');
  S.auth = loadSession();   // 자동 로그인
  document.getElementById('ver').textContent = `${APP_NAME} Ver.${APP_VERSION}`;
  await initStore();
  startSync();
  startAutoSync();   // 회원 시트 주소가 저장된 운영진 기기: 회원 정보 자동 반영
  onChange(safeRender);
  onChange(autoClose); setInterval(autoClose, 60e3);   // 경기일 전 목요일 0시 신청 자동 마감
  renderShell(); render();
  // 자동 로그인 정보 확인 (비밀번호가 바뀌었거나 운영진이 초기화했으면 다시 로그인)
  if (S.auth) verify(S.auth).then((ok) => {
    if (!ok) { S.auth = null; saveSession(null); toast('다시 로그인해 주세요'); renderShell(); render(); }
  }).catch(() => {});
})();
