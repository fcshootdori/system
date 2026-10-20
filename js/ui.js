import { esc } from './util.js';
import { TEAM_COLORS, STATUS } from './config.js';
import { teamColor } from './domain.js';

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

export function confirmBox(msg) { return Promise.resolve(window.confirm(msg)); }

export function colorChip(key, label) {
  const c = TEAM_COLORS.find((x) => x.key === key);
  if (!c) return `<span class="chip">${esc(label || '')}</span>`;
  return `<span class="chip color" style="--c:${c.hex};--t:${c.text}">${esc(label ?? c.label)}</span>`;
}
export const teamLabel = (md, i) => {
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
