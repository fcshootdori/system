// 슛도리 앱 — 화면 틀·메뉴·라우팅
//  메뉴 구성은 WD_FUTSAL과 같음
//   · 일반 회원: 홈 · 일정 · ⚽경기모드 · 경기결과 · 내 정보
//   · 운영모드: 일정 · 경기 · 공지 · 회원 · 설정
//   · 주장: 오른쪽 위 👑 드래프트 버튼으로 입장
import { APP_NAME, APP_VERSION } from './config.js?v=0.1.75';
import { initStore, db } from './store.js?v=0.1.75';
import { initPullRefresh } from './ptr.js?v=0.1.75';
import { startUpdateCheck } from './update.js?v=0.1.75';
import { lockZoom } from './nozoom.js?v=0.1.75';
import { startSandbox, inSandbox, betaOn, renderPicker, sandboxRole } from './sandbox.js?v=0.1.75';
import { S, startSync, onChange, setOperator, opDevice, captainMatchday, go, today } from './state.js?v=0.1.75';
import { esc, toast } from './util.js?v=0.1.75';
import { modal, fitBoxes } from './ui.js?v=0.1.75';
import { icon } from './icons.js?v=0.1.75';

import * as home from './views/home.js?v=0.1.75';
import * as schedule from './views/schedule.js?v=0.1.75';
import * as matchmode from './views/matchmode.js?v=0.1.75';
import * as results from './views/results.js?v=0.1.75';
import * as myinfo from './views/me.js?v=0.1.75';
import * as apply from './views/apply.js?v=0.1.75';
import * as draft from './views/draft.js?v=0.1.75';
import * as games from './views/games.js?v=0.1.75';
import * as run from './views/run.js?v=0.1.75';
import * as notice from './views/notice.js?v=0.1.75';
import * as admin from './views/admin.js?v=0.1.75';
import * as membersView from './views/members.js?v=0.1.75';
import * as loginView from './views/login.js?v=0.1.75';
import { loadSession, saveSession, verify } from './auth.js?v=0.1.75';
import { startAutoSync } from './member-sync.js?v=0.1.75';
import { startRecordSync } from './record-sheet.js?v=0.1.75';
import { closePassed, closeTime, teamEvent } from './domain.js?v=0.1.75';
import { applyEmblemMarks } from './emblem-mark.js?v=0.1.75';
import { startSwipe, clearPageSwipe, slideIn } from './swipe.js?v=0.1.75';

const MEMBER_TABS = [['home', '홈', 'home'], ['sched', '일정', 'calendar'], ['mm', '경기', 'ball'], ['results', '기록', 'board'], ['me', '내 정보', 'user']];
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
  applyEmblemMarks(S.team.emblem);
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
  clearPageSwipe();   // 화면마다 좌우 넘기기를 새로 정함 (경기 · 기록 화면이 다시 등록)
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
window.addEventListener('hashchange', () => { renderShell(); render(); window.scrollTo(0, 0); if (swDir) { slideIn(document.getElementById('view'), swDir); swDir = 0; } });
// 좌우로 넘기기: 화면이 처리하지 않으면 하단 메뉴 옆 탭으로, 안쪽 화면에서 오른쪽으로 쓸면 뒤로
let swDir = 0;
function swipeNav(dir) {
  if (!S.auth && !S.operator) return;
  if (betaOn() && !inSandbox() && !S.operator) return;
  const { name } = parseHash(), route = ROUTES[name];
  if (route?.parent) { if (dir < 0) { swDir = dir; history.length > 1 ? history.back() : go(route.parent); } return; }
  const tabs = S.operator ? OP_TABS : MEMBER_TABS, i = tabs.findIndex(([k]) => k === name), n = i + dir;
  if (i < 0 || n < 0 || n >= tabs.length) return;
  swDir = dir; go(tabs[n][0]);
}
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

// ── 경기 시간에 열면 첫 화면을 경기로 ──
//  오늘 경기의 시작 1시간 전부터 경기 종료 시간까지 (끝 시간이 없으면 시작 + 2시간)
//  앱을 열 때(홈 화면으로 열릴 때)와, 5분 넘게 다른 앱에 있다가 돌아왔을 때 — 그 사이 홈을 누르면 홈 그대로
const JUMP_PRE = 60, JUMP_POST = 0, JUMP_AWAY = 5 * 60e3;
export function matchTimeNow(now = new Date()) {
  const t = today(), n = now.getHours() * 60 + now.getMinutes();
  return S.matchdays.find((m) => {
    if (m.date !== t || m.cancelled || m.source === 'sheet' || m.fromSheet) return false;
    const x = String(m.time || '').match(/(\d{1,2}):(\d{2})(?:\s*[~\-–]\s*(\d{1,2}):(\d{2}))?/);
    if (!x) return false;
    const st = +x[1] * 60 + +x[2], en = x[3] ? +x[3] * 60 + +x[4] : st + 120;
    return n >= st - JUMP_PRE && n <= en + JUMP_POST;
  }) || null;
}
function jumpToMatch() {
  if (!S.allMatchdays) return false;                      // 아직 경기 목록을 못 받음
  if (!S.auth && !S.operator) return false;               // 로그인 화면
  if (betaOn() && !inSandbox() && !S.operator) return false;
  const { name } = parseHash();
  const home = S.operator ? 'plan' : 'home', target = S.operator ? 'run' : 'mm';
  if (name !== home || !matchTimeNow()) return false;
  go(target);
  return true;
}
function startMatchJump() {
  const h0 = location.hash, t0 = Date.now();
  // 처음 열 때: 경기 목록이 들어오면 한 번 (6초 안에, 그사이 다른 화면으로 옮겼으면 하지 않음)
  const off = onChange(() => {
    if (!S.allMatchdays) return;
    off();
    if (Date.now() - t0 < 6000 && location.hash === h0) jumpToMatch();
  });
  // 다른 앱에 5분 넘게 있다가 돌아왔을 때
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > JUMP_AWAY) jumpToMatch();
    hiddenAt = 0;
  });
}

// ── 로딩 화면: 회원·경기 목록을 받으면 (최소 0.9초 보여 주고) 사라짐, 늦어도 7초 ──
const T0 = performance.now();
function hideSplash() {
  const sp = document.getElementById('splash');
  if (!sp || sp.dataset.hiding) return;
  sp.dataset.hiding = '1';
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 500); }, Math.max(0, 900 - (performance.now() - T0)));
}

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
  if (!inSandbox()) startAutoSync();   // 통합 시트 연결 키가 있는 운영진 기기: 회원 정보 자동 반영
  startRecordSync();                  // 경기 기록: 통합 시트 읽기 (+ 운영진 기기는 끝난 경기 보내기)
  startMatchJump();
  startSwipe(swipeNav);
  onChange(safeRender);
  onChange(autoClose); setInterval(autoClose, 60e3);   // 경기일 전 목요일 0시 신청 자동 마감
  renderShell(); render();
  const offSplash = onChange(() => { if (S.ready && S.allMatchdays) { offSplash(); hideSplash(); } });
  if (S.ready && S.allMatchdays) hideSplash();
  setTimeout(hideSplash, 7000);
  // 자동 로그인 정보 확인 (비밀번호가 바뀌었거나 운영진이 초기화했으면 다시 로그인)
  if (S.auth) verify(S.auth).then((ok) => {
    if (!ok) { S.auth = null; saveSession(null); toast('다시 로그인해 주세요'); renderShell(); render(); }
  }).catch(() => {});
})();
