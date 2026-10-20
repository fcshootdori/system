// 경기결과 — [경기 결과 | 개인 기록]  (WD_FUTSAL 경기결과 메뉴와 같은 구성)
//  경기 결과는 가장 최근 경기부터, 좌우 버튼이나 스와이프로 이전·이후 경기로 넘김
import { S, playedDays } from '../state.js';
import { esc, fmtDate } from '../util.js';
import { empty } from '../ui.js';
import * as games from './games.js';
import * as records from './records.js';
import { fmtSummary } from './home.js';

let tab = 'res', cur = null;

export function render(root) {
  const nav = `<nav class="subnav">${[['res', '경기 결과'], ['rec', '개인 기록']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  if (tab === 'rec') {
    root.innerHTML = nav + '<div data-body></div>';
    records.render(root.querySelector('[data-body]'), { params: [] });
  } else {
    const ids = playedDays().map((m) => m.id);
    if (!ids.length) { root.innerHTML = nav + `<section class="card">${empty('아직 끝난 경기가 없어요.')}</section>`; }
    else {
      if (!cur || !ids.includes(cur)) cur = ids[0];
      const i = ids.indexOf(cur), md = S.matchdays.find((m) => m.id === cur);
      const older = ids[i + 1], newer = ids[i - 1];
      root.innerHTML = nav + `
        <section class="card rdnav">
          <button class="navb" data-to="${older || ''}" ${older ? '' : 'disabled'} aria-label="이전 경기">‹<small>이전</small></button>
          <div class="rdt"><b>${fmtDate(md.date)}</b><small>${esc([md.time, md.venue].filter(Boolean).join(' · ') || fmtSummary(md))}</small></div>
          <button class="navb" data-to="${newer || ''}" ${newer ? '' : 'disabled'} aria-label="이후 경기"><small>이후</small>›</button>
        </section>
        <p class="muted small center">${i + 1} / ${ids.length}번째 최근 경기 · 좌우로 밀어서 넘겨요</p>
        <div data-body></div>`;
      games.render(root.querySelector('[data-body]'), { md, embedded: true });
      root.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.to) { cur = b.dataset.to; render(root); } }));
      // 스와이프
      let x0 = null;
      root.ontouchstart = (e) => { x0 = e.touches[0].clientX; };
      root.ontouchend = (e) => {
        if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) < 60) return;
        const to = dx > 0 ? older : newer; if (to) { cur = to; render(root); }
      };
    }
  }
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(root); }));
}
