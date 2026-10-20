import { APP_NAME, APP_VERSION } from './config.js';
import { initStore, db } from './store.js';
import { S, startSync, onChange, setOperator, memberById, me } from './state.js';
import { esc, toast } from './util.js';
import { modal } from './ui.js';

import * as home from './views/home.js';
import * as apply from './views/apply.js';
import * as draft from './views/draft.js';
import * as games from './views/games.js';
import * as records from './views/records.js';
import * as notice from './views/notice.js';
import * as admin from './views/admin.js';

const ROUTES = {
  home:     { view: home,    label: '홈',     icon: '⌂', tab: true },
  apply:    { view: apply,   label: '신청',   icon: '✎', tab: true },
  draft:    { view: draft,   label: '팀',     icon: '⚑', tab: true },
  games:    { view: games,   label: '경기',   icon: '⚽', tab: true },
  records:  { view: records, label: '기록',   icon: '▤', tab: true },
  notice:   { view: notice,  label: '공지',   op: true },
  members:  { view: admin,   label: '회원',   op: true, sub: 'members' },
  settings: { view: admin,   label: '설정',   op: true, sub: 'settings' },
};

function parseHash() {
  const [name = 'home', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : 'home', params: rest };
}

function renderShell() {
  document.documentElement.style.setProperty('--brand', S.team.primary || '#0f766e');
  document.title = S.team.name;
  const meName = memberById(me.id)?.name;
  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="#/home">
      ${S.team.emblem ? `<img src="${S.team.emblem}" alt="">` : `<span class="brand-dot"></span>`}
      <span>${esc(S.team.name)}</span>
    </a>
    <div class="top-actions">
      <button class="pill ghost" data-me>${meName ? esc(meName) : '내 이름 선택'}</button>
      <button class="pill ${S.operator ? 'on' : 'ghost'}" data-op>${S.operator ? '운영모드 ON' : '운영모드'}</button>
    </div>`;
  const { name } = parseHash();
  document.getElementById('tabbar').innerHTML = Object.entries(ROUTES).filter(([, r]) => r.tab)
    .map(([k, r]) => `<a href="#/${k}" class="${k === name || (ROUTES[name]?.op && k === 'home') ? 'on' : ''}"><i>${r.icon}</i><span>${r.label}</span></a>`).join('');
  document.getElementById('opbar').innerHTML = S.operator
    ? Object.entries(ROUTES).filter(([, r]) => r.op).map(([k, r]) => `<a href="#/${k}" class="${k === name ? 'on' : ''}">${r.label}</a>`).join('')
    : '';
  document.getElementById('opbar').hidden = !S.operator;
  const banner = document.getElementById('demo-banner');
  if (db.authError) banner.textContent = 'Firebase 익명 로그인이 꺼져 있어 저장이 안 돼요 — 콘솔 Authentication › 로그인 방법 › 익명을 켜 주세요.';
  banner.hidden = db.mode !== 'demo' && !db.authError;
}

let pending = false;
function render() {
  const { name, params } = parseHash();
  const route = ROUTES[name];
  const root = document.getElementById('view');
  if (route.op && !S.operator) {
    root.innerHTML = `<section class="card center"><p>운영진 전용 화면입니다.</p><button class="btn" data-op>운영모드 켜기</button></section>`;
    return;
  }
  route.view.render(root, { params, sub: route.sub });
}

function safeRender() {
  const a = document.activeElement;
  if (a && a.closest('#view') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { pending = true; return; }
  renderShell(); render();
}

function askPin() {
  const { el, close } = modal('운영모드', `
    <form class="stack" data-pin>
      <label>운영진 PIN<input type="password" inputmode="numeric" name="pin" autocomplete="off" autofocus></label>
      <button class="btn">켜기</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.pin.value === String(S.team.operatorPin)) { setOperator(true); close(); toast('운영모드를 켰어요'); }
    else toast('PIN이 맞지 않아요');
  });
}

function pickMe() {
  const list = S.members.filter((m) => m.active !== false);
  const { el, close } = modal('내 이름 선택', list.length ? `
    <p class="muted">이 기기에서 신청할 때 쓸 이름을 골라 주세요.</p>
    <div class="name-grid">${list.map((m) => `<button class="name-btn ${m.id === me.id ? 'on' : ''}" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div>
    ${me.id ? '<button class="btn ghost full" data-id="">선택 해제</button>' : ''}`
    : '<p class="muted">아직 등록된 회원이 없어요. 운영진이 회원을 먼저 등록해야 해요.</p>');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) { me.set(b.dataset.id); close(); }
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-op]')) { if (S.operator) { setOperator(false); toast('운영모드를 껐어요'); } else askPin(); }
  if (e.target.closest('[data-me]')) pickMe();
});
document.addEventListener('focusout', () => setTimeout(() => {
  if (pending && !(document.activeElement?.closest('#view') && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) {
    pending = false; renderShell(); render();
  }
}, 0));
window.addEventListener('hashchange', () => { renderShell(); render(); window.scrollTo(0, 0); });

(async function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('c')) sessionStorage.setItem('teamapp:captain', qs.get('c'));
  S.captainToken = sessionStorage.getItem('teamapp:captain');
  document.getElementById('ver').textContent = APP_NAME + ' Ver.' + APP_VERSION;
  await initStore();
  startSync();
  onChange(safeRender);
  renderShell(); render();
})();
