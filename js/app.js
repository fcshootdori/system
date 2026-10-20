// 슛도리 앱 — 화면 틀·메뉴·라우팅
//  메뉴 구성은 WD_FUTSAL과 같음
//   · 일반 회원: 홈 · 일정 · ⚽경기모드 · 경기결과 · 내 정보
//   · 운영모드: 일정 · 경기 · 공지 · 회원 · 설정
//   · 주장: 오른쪽 위 👑 드래프트 버튼으로 입장
import { APP_NAME, APP_VERSION } from './config.js?v=0.1.45';
import { initStore, db } from './store.js?v=0.1.45';
import { initPullRefresh } from './ptr.js?v=0.1.45';
import { startUpdateCheck } from './update.js?v=0.1.45';
import { lockZoom } from './nozoom.js?v=0.1.45';
import { startSandbox, inSandbox, betaOn, renderPicker, sandboxRole } from './sandbox.js?v=0.1.45';
import { S, startSync, onChange, setOperator, opDevice, captainMatchday, go } from './state.js?v=0.1.45';
import { esc, toast } from './util.js?v=0.1.45';
import { modal, fitBoxes } from './ui.js?v=0.1.45';
import { icon } from './icons.js?v=0.1.45';

import * as home from './views/home.js?v=0.1.45';
import * as schedule from './views/schedule.js?v=0.1.45';
import * as matchmode from './views/matchmode.js?v=0.1.45';
import * as results from './views/results.js?v=0.1.45';
import * as myinfo from './views/me.js?v=0.1.45';
import * as apply from './views/apply.js?v=0.1.45';
import * as draft from './views/draft.js?v=0.1.45';
import * as games from './views/games.js?v=0.1.45';
import * as run from './views/run.js?v=0.1.45';
import * as notice from './views/notice.js?v=0.1.45';
import * as admin from './views/admin.js?v=0.1.45';
import * as membersView from './views/members.js?v=0.1.45';
import * as loginView from './views/login.js?v=0.1.45';
import { loadSession, saveSession, verify } from './auth.js?v=0.1.45';
import { startAutoSync } from './member-sync.js?v=0.1.45';
import { closePassed, closeTime, teamEvent } from './domain.js?v=0.1.45';

const MEMBER_TABS = [['home', '홈', 'home'], ['sched', '일정', 'calendar'], ['mm', '경기모드', 'ball'], ['results', '경기결과', 'board'], ['me', '내 정보', 'user']];
const OP_TABS = [['plan', '일정', 'calendar'], ['run', '경기 운영', 'whistle'], ['notice', '공지', 'megaphone'], ['members', '회원', 'users'], ['settings', '설정', 'gear']];

const ROUTES = {
  // 회원 메뉴
  home: { view: home }, sched: { view: schedule }, mm: { view: matchmode }, results: { view: results }, me: { view: myinfo },
  // 회원 메뉴 안쪽 화면 (하단 메뉴는 그대로)
  apply: { view: apply, parent: 'home' }, draft: { view: draft, parent: 'home' },
  games: { view: games, parent: 'results' }, records: { view: { render: (root, { params }) => { results.open(params[0] ? { player: params[0] } : { tab: 'rank' }); location.replace('#/results'); } }, parent: 'results' },
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
      ${capMd ? `<a class="pill cap" href="#/draft">${icon('crown')}<span>드래프트</span></a>` : ''}
      ${(inSandbox() ? sandboxRole() === 'op' : S.operator || opDevice()) ? `<button class="pill ${S.operator ? 'on' : 'ghost'}" data-op>${icon('whistle')}<span>${S.operator ? '운영 끄기' : '운영'}</span></button>` : ''}
    </div>`;
  const tabs = S.operator ? OP_TABS : MEMBER_TABS;
  const active = ROUTES[name]?.parent || name;
  document.getElementById('tabbar').innerHTML = `<div class="nav-brand">${S.team.emblem ? `<img src="${S.team.emblem}" alt="">` : ''}<span>${esc(S.team.name)}</span></div>` + tabs.map(([k, label, ic]) =>
    `<a href="#/${k}" class="${k === active ? 'on' : ''} ${k === 'mm' ? 'mm' : ''}" ${k === active ? 'aria-current="page"' : ''}><i>${icon(ic)}</i><span>${label}</span></a>`).join('');
  document.body.classList.toggle('op', S.operator);
  document.body.dataset.route = name;   // 화면별 배경(홈 경기장 사진 등)
  const banner = document.getElementById('demo-banner');
  if (db.authError) banner.textContent = 'Firebase 익명 로그인이 꺼져 있어 저장이 안 돼요 — 콘솔 Authentication › 로그인 방법 › 익명을 켜 주세요.';
  banner.hidden = db.mode !== 'demo' && !db.authError;
}

let pending = false;
function render() {
  const { name, params } = parseHash();
  let route = ROUTES[name];
  const root = document.getElementById('view');
  // 베타 데모 기간: 실제 앱은 운영진만. 회원은 역할(일반 회원·주장·운영진)을 골라 체험판으로
  if (betaOn() && !inSandbox() && !S.operator) {
    document.body.classList.add('gate'); renderPicker(root, askPin); return;
  }
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
const typing = () => { const a = document.activeElement; return a && a.closest('#view') && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !/checkbox|radio/.test(a.type); };
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
// 표 상자(.vfit) 높이 맞춤: 화면이 다시 그려지거나 크기가 바뀔 때마다 (모든 화면 공통)
let fitRaf = 0;
const refit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => fitBoxes()); };
new MutationObserver(refit).observe(document.getElementById('view'), { childList: true, subtree: true });
window.addEventListener('resize', refit);
document.addEventListener('toggle', refit, true);

// 신청 자동 마감: 마감 시각이 지난 신청 중 경기 → '신청 마감' (운영진이 다시 연 경기는 제외)
const closing = new Set();
function autoClose() {
  S.matchdays.forEach((md) => {
    if (md.status !== 'open' || md.cancelled || md.reopened || md.source === 'sheet' || closing.has(md.id) || !closePassed(md)) return;
    closing.add(md.id);
    db.set('matchdays/' + md.id, { status: 'closed', autoClosedAt: Date.now() }, { merge: true }).catch(() => closing.delete(md.id));
  });
  // 이벤트 경기가 신청 마감 전에 '팀 확정'으로 넘어가 있으면(카페 댓글 가져오기 등) 신청 중으로 되돌림
  //  — 운영진이 확인 후 일부러 확정한 경우(earlyTeams)와 경기 기록이 있는 경우는 그대로
  S.matchdays.forEach((md) => {
    if (md.status !== 'teams' || md.cancelled || md.earlyTeams || md.source === 'sheet' || closing.has('r' + md.id)) return;
    if (!closeTime(md) || closePassed(md) || !teamEvent(md) || S.games.some((g) => g.matchdayId === md.id)) return;
    closing.add('r' + md.id);
    db.tx('matchdays/' + md.id, (cur) => (cur && cur.status === 'teams' ? { ...cur, status: 'open', reopened: false, teams: [], reopenedAt: Date.now() } : null))
      .catch(() => closing.delete('r' + md.id));
  });
}

// 저장·처리 중 오류가 나면 조용히 넘어가지 않고 알려 줌 (서버 거절·권한 문제 등)
const errMsg = (e) => {
  const m = String(e?.code || e?.message || e || '');
  if (/permission/i.test(m)) return '권한이 없어 저장하지 못했어요 (Firestore 규칙 확인)';
  if (/resource-exhausted|quota/i.test(m)) return 'Firebase 무료 사용량(하루 한도)을 다 써서 저장하지 못했어요. 한국 시간 오후 4시(11월~3월은 5시)에 다시 채워져요 — 운영진은 Firebase 요금제를 확인해 주세요';
  if (/unavailable|network|offline|Failed to fetch/i.test(m)) return '인터넷 연결이 불안정해 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요';
  return '처리하지 못했어요: ' + m.slice(0, 120);
};
window.addEventListener('unhandledrejection', (ev) => { console.error(ev.reason); toast(errMsg(ev.reason)); });
window.addEventListener('error', (ev) => { if (ev?.error) { console.error(ev.error); toast(errMsg(ev.error)); } });

(async function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('c')) localStorage.setItem('teamapp:captain', qs.get('c'));
  S.captainToken = localStorage.getItem('teamapp:captain');
  S.auth = loadSession();   // 자동 로그인
  document.getElementById('ver').textContent = `${APP_NAME} Ver.${APP_VERSION}`;
  await initStore();
  startSync();
  initPullRefresh();
  lockZoom();
  startUpdateCheck();
  startSandbox();
  if (!inSandbox()) startAutoSync();   // 회원 시트 주소가 저장된 운영진 기기: 회원 정보 자동 반영
  onChange(safeRender);
  onChange(autoClose); setInterval(autoClose, 60e3);   // 경기일 전 목요일 0시 신청 자동 마감
  renderShell(); render();
  // 자동 로그인 정보 확인 (비밀번호가 바뀌었거나 운영진이 초기화했으면 다시 로그인)
  if (S.auth) verify(S.auth).then((ok) => {
    if (!ok) { S.auth = null; saveSession(null); toast('다시 로그인해 주세요'); renderShell(); render(); }
  }).catch(() => {});
})();
