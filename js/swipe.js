// 좌우로 넘기기 — 화면 어디서든 손가락으로 왼쪽/오른쪽으로 쓸면
//  1) 그 화면이 먼저 처리 (경기: 라운드 이동, 기록: 경기 결과 · 전체 순위 · 개인 기록)
//  2) 아니면 하단 메뉴 옆 탭으로 이동 (왼쪽으로 쓸면 다음 메뉴, 오른쪽으로 쓸면 이전 메뉴)
//     안쪽 화면(경기 상세 · 신청 명단 등)에서는 오른쪽으로 쓸면 뒤로
//  표·가로 스크롤 상자·포지션 끌기·드래프트판·입력칸·팝업 위에서는 동작하지 않음
let handler = null;   // 지금 화면의 넘기기 처리: (dir: +1 다음 | -1 이전) => 처리했으면 true
export const onPageSwipe = (fn) => { handler = fn; };
export const clearPageSwipe = () => { handler = null; };

const SKIP = 'input, textarea, select, [contenteditable], .modal-wrap, .vfit, .sheetwrap, .tbl-wrap, .lps-wrap, .track, .mm-rounds, .lp-forms, .lp-pitch.edit, .lp-bench.edit, .dboard, .pitch, .dpool, [data-noswipe], #tabbar, .r-tabs, .subnav, .seg';
function scrollsX(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 2) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; }
  }
  return false;
}

export function startSwipe(fallback) {
  let s = null;
  document.addEventListener('touchstart', (e) => {
    s = null;
    if (e.touches.length !== 1 || document.querySelector('.modal-wrap, #splash')) return;
    const t = e.touches[0], el = e.target;
    if (t.clientX < 24 || t.clientX > innerWidth - 24) return;   // 화면 가장자리: 브라우저 뒤로 가기 몸짓과 겹치지 않게
    if (el.closest?.(SKIP) || scrollsX(el)) return;
    s = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (s && e.touches.length !== 1) s = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t;
    s = null;
    if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    if (window.getSelection?.().toString()) return;
    const dir = dx < 0 ? 1 : -1;
    if (handler && handler(dir)) return;
    fallback(dir);
  }, { passive: true });
}

// 화면이 바뀔 때 살짝 밀려 들어오는 움직임
export function slideIn(el, dir) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('sw-l', 'sw-r'); void el.offsetWidth;
  el.classList.add(dir > 0 ? 'sw-l' : 'sw-r');
  setTimeout(() => el.classList.remove('sw-l', 'sw-r'), 320);
}
