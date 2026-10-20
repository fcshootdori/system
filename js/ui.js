import { esc } from './util.js?v=0.1.44';
import { TEAM_COLORS, STATUS } from './config.js?v=0.1.44';
import { teamColor, teamName } from './domain.js?v=0.1.44';

export function modal(title, bodyHtml, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="닫기">✕</button></header>
    <div class="modal-body">${bodyHtml}</div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  return { el: wrap.querySelector('.modal'), close };
}


export function colorChip(key, label) {
  const c = TEAM_COLORS.find((x) => x.key === key);
  if (!c) return `<span class="chip">${esc(label || '')}</span>`;
  return `<span class="chip color" style="--c:${c.hex};--t:${c.text}">${esc(label ?? c.label)}</span>`;
}
// 팀 이름: 운영진이 정한 이름(주장명 등)·이벤트 팀 이름 → 없으면 팀 색 이름
export const teamLabel = (md, i) => {
  const nm = teamName(md, i);
  if (nm) return nm;
  const c = TEAM_COLORS.find((x) => x.key === teamColor(md, i));
  return c ? c.label : `${i + 1}팀`;
};
export const teamChip = (md, i) => colorChip(teamColor(md, i), teamLabel(md, i));

export function stepper(status) {
  const cur = STATUS[status]?.step || 0;
  return `<ol class="stepper">${Object.entries(STATUS).map(([k, v]) =>
    `<li class="${v.step < cur ? 'done' : v.step === cur ? 'now' : ''}"><span>${v.step}</span>${esc(v.label)}</li>`).join('')}</ol>`;
}

export const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;

// ── 표 상자: 화면 아래 끝까지 채운 상자 안에서만 위아래·옆으로 스크롤 (모든 화면 공통) ──
//  .vfit 상자 → 페이지는 스크롤되지 않고, 가로 스크롤 막대는 늘 화면 아래에 보임. 제목줄은 상자 위에 고정
//  화면이 낮아 상자가 너무 작아지면, 페이지를 조금 내렸을 때 상자가 화면 높이에 딱 맞게
//  다시 그려도 상자 안 스크롤 위치는 그대로 유지
const boxPos = {};
export function fitBoxes(root = document.getElementById('view')) {
  if (!root) return;
  const boxes = [...root.querySelectorAll('.vfit')].filter((w) => !w.closest('.modal'));
  const ver = document.getElementById('ver');
  if (ver) ver.style.display = boxes.length ? 'none' : '';
  if (!boxes.length) return;
  const top = document.getElementById('topbar')?.getBoundingClientRect().height || 0;
  boxes.forEach((w, i) => {
    const key = location.hash + '|' + (w.dataset.key || i);
    w.style.height = w.style.maxHeight = '';
    const r = w.getBoundingClientRect();
    const below = Math.max(0, document.documentElement.scrollHeight - (r.bottom + window.scrollY));
    const fill = Math.floor(window.innerHeight - (r.top + window.scrollY) - below - 2);
    const fit = Math.floor(window.innerHeight - top - below - 6);
    const h = Math.max(200, fill >= 200 ? fill : fit);
    if (w.scrollHeight > h) w.style.height = w.style.maxHeight = h + 'px';   // 내용이 짧으면 그대로
    else w.style.maxHeight = h + 'px';
    if (boxPos[key] && w.dataset.fitted !== '1') { w.scrollTop = boxPos[key][0]; w.scrollLeft = boxPos[key][1]; }
    w.dataset.fitted = '1';
    w.onscroll = () => {
      boxPos[key] = [w.scrollTop, w.scrollLeft];
      document.querySelectorAll('.abs-pop').forEach((x) => { if (Date.now() - (+x.dataset.t || 0) > 400) x.remove(); });
    };
  });
}
