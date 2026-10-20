// 당겨서 새로고침 — 화면 맨 위에서 아래로 당겼다 놓으면 앱을 새로 불러옴 (최신 기록·새 버전)
//  · 휴대폰(터치)에서만. 브라우저 기본 당겨서 새로고침과 겹치지 않게 기본 동작은 끔(CSS overscroll-behavior)
//  · 창(모달)이 열려 있거나, 안쪽 스크롤 상자가 내려가 있거나, 입력 중이거나, 포지션 유니폼을 끄는 중이면 동작하지 않음
const BALL = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" fill="#fff" stroke="#131C2B" stroke-width="2"/><path d="M20 12.5l7 5.1-2.7 8.2h-8.6L13 17.6z" fill="#131C2B"/><path d="M20 12.5V3.2M27 17.6l8.6-2.9M24.3 25.8l5.4 7.4M15.7 25.8l-5.4 7.4M13 17.6l-8.6-2.9" stroke="#131C2B" stroke-width="2" fill="none"/></svg>';
const TH = 72, MAX = 120;

export function initPullRefresh() {
  if (!('ontouchstart' in window)) return;
  const el = document.createElement('div');
  el.className = 'ptr'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="ptr-ball">${BALL}</div><span class="ptr-t"></span>`;
  document.body.appendChild(el);
  const ball = el.firstElementChild, txt = el.lastElementChild;
  let y0 = null, x0 = 0, dy = 0, on = false, busy = false;

  const paint = () => {
    const k = Math.min(1, dy / TH);
    el.style.transform = `translate(-50%, ${dy - 44}px)`;
    el.style.opacity = String(Math.min(1, dy / 30));
    ball.style.transform = `rotate(${dy * 4}deg) scale(${0.6 + 0.4 * k})`;
    el.classList.toggle('ready', dy >= TH);
    txt.textContent = dy >= TH ? '놓으면 새로고침' : '당겨서 새로고침';
  };
  const reset = () => { y0 = null; on = false; dy = 0; el.classList.add('back'); paint(); setTimeout(() => el.classList.remove('back'), 250); };
  const blocked = (t) => {
    if (busy || window.scrollY > 0 || document.querySelector('.modal-wrap')) return true;
    if (t.closest?.('input, textarea, select, [data-drag], .lp-pitch, .lp-bench.edit')) return true;
    for (let n = t; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return true;   // 안쪽 상자가 내려가 있으면 그 상자 스크롤
    return false;
  };

  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || blocked(e.target)) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; on = false;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (!on) {
      if (d < 0 || dx > Math.abs(d)) { y0 = null; return; }   // 위로 밀거나 옆으로 밀면 평소 스크롤
      if (d < 10) return;
      if (window.scrollY > 0) { y0 = null; return; }
      on = true; el.classList.remove('back');
    }
    dy = Math.min(MAX, (d - 10) * 0.55);
    if (e.cancelable) e.preventDefault();
    paint();
  }, { passive: false });
  const end = () => {
    if (y0 == null && !on) return;
    if (on && dy >= TH) {
      busy = true; dy = TH; paint(); el.classList.add('spin'); txt.textContent = '새로고침 중…';
      setTimeout(() => location.reload(), 350);
      return;
    }
    reset();
  };
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', reset, { passive: true });
}
