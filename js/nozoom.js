// 화면 확대·축소 막기 (아이폰 사파리는 viewport의 user-scalable=no를 무시하므로 두 손가락 확대 동작을 직접 막음)
export function lockZoom() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });
  // 두 번 탭 확대는 CSS touch-action: manipulation 으로 막음 (빠르게 연속으로 누르는 골 기록 버튼은 그대로 동작)
}
