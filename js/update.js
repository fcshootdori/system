// 새 버전 확인 · 확실한 새로고침
//  홈 화면에 추가한 앱(특히 아이폰)은 예전 화면을 오래 붙잡고 있어서, 배포 후에도 새 버전이 늦게 뜰 수 있음
//  → version.json을 캐시 없이 읽어 버전이 바뀌었으면 앱으로 돌아올 때 자동으로 새로 불러오고, 쓰는 중이면 위에 안내를 띄움
import { APP_VERSION } from './config.js?v=0.1.64';

// 주소에 시각을 붙여 index.html까지 캐시 없이 다시 받음 (화면 위치 #/… 는 그대로)
export function hardReload() {
  const u = new URL(location.href);
  u.searchParams.set('r', Date.now().toString(36));
  location.replace(u.pathname + u.search + u.hash);
}

const typing = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };
let shown = false;
async function check(resumed) {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();
    if (!v || v === APP_VERSION) return;
    if (resumed && !typing() && !document.querySelector('.modal-wrap')) { hardReload(); return; }
    if (shown) return;
    shown = true;
    const bar = document.createElement('button');
    bar.className = 'upd-bar'; bar.type = 'button';
    bar.innerHTML = `새 버전(${v})이 나왔어요 · <b>눌러서 업데이트</b>`;
    bar.addEventListener('click', hardReload);
    document.body.appendChild(bar);
  } catch { /* 오프라인 등 — 다음에 다시 */ }
}
export function startUpdateCheck() {
  if (location.protocol === 'file:') return;
  setTimeout(() => check(false), 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(true); });
  setInterval(() => check(false), 15 * 60e3);
}
