import { esc } from './util.js?v=0.1.91';
import { TEAM_COLORS, STATUS } from './config.js?v=0.1.91';
import { teamColor, teamName } from './domain.js?v=0.1.91';
import { memoOf, hostOf } from './state.js?v=0.1.91';

// 입력칸에 바로 커서 — 버튼을 누른 그 순간에 맞춰야 휴대폰 키패드도 같이 올라옴
export function focusNow(inp) {
  if (!inp) return;
  try { inp.focus({ preventScroll: true }); } catch { inp.focus(); }
  requestAnimationFrame(() => { if (document.activeElement !== inp && inp.isConnected) inp.focus(); });
}

// 이름 옆 ⓘ — 누르면 메모(실력·늦참 등)가 말풍선으로 보임. 버튼 안에도 넣을 수 있게 span
export function memoI(id, md) {
  const t = memoOf(id, md), h = hostOf(id, md);
  if (!t && !h) return '';
  return `<span class="memo-i" role="button" tabindex="0" data-memo="${esc(t)}" data-host="${esc(h)}" aria-label="메모 보기: ${esc([t, h && h + ' 님이 데려온 게스트'].filter(Boolean).join(' · '))}">i</span>`;
}
let tip = null;
const hideTip = () => { tip?.remove(); tip = null; };
function showTip(ic) {
  hideTip();
  const t = ic.dataset.memo, h = ic.dataset.host;
  tip = document.createElement('div'); tip.className = 'memo-tip'; tip.setAttribute('role', 'tooltip');
  tip.innerHTML = `${t ? `<b>${esc(t)}</b>` : ''}${h ? `<small>${esc(h)} 님이 데려온 게스트</small>` : ''}`;
  document.body.appendChild(tip);
  const r = ic.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const above = r.top - hh - 8 > 8;
  tip.style.left = x + 'px'; tip.style.top = (above ? r.top - hh - 8 : r.bottom + 8) + 'px';
  tip.style.setProperty('--ax', (r.left + r.width / 2 - x) + 'px'); tip.classList.add(above ? 'up' : 'down');
}
// 캡처 단계에서 먼저 받아서, 드래프트 선수 버튼 안의 ⓘ를 눌러도 선수가 골라지지 않게
//  (잠긴 선수 버튼 안에서는 click이 안 올 수 있어서 pointerup으로 열고, click은 막기만)
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.memo-i')) hideTip(); }, true);
document.addEventListener('pointerup', (e) => {
  const ic = e.target.closest?.('.memo-i');
  if (!ic) return;
  if (tip && tip._for === ic) hideTip(); else { showTip(ic); tip._for = ic; }
}, true);
document.addEventListener('click', (e) => { if (e.target.closest?.('.memo-i')) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('keydown', (e) => {
  const ic = e.target.closest?.('.memo-i');
  if (ic && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showTip(ic); tip._for = ic; }
  else if (e.key === 'Escape') hideTip();
});
addEventListener('scroll', hideTip, true); addEventListener('hashchange', hideTip);

// 화면을 다시 그리되, 지금 입력 중인 검색칸([data-q])은 그대로 두기
//  입력칸을 새로 만들면 한글 조합 중인 글자가 자음·모음으로 떨어져서, 검색칸과 그 위 부모만 남기고 나머지만 바꿈
export function setHTMLKeep(el, html, sel = '[data-q]') {
  const a = document.activeElement;
  if (!a || !el.contains(a) || !a.matches?.(sel)) { el.innerHTML = html; return; }
  const t = document.createElement(el.tagName); t.innerHTML = html;
  const nk = t.querySelector(sel);
  const chain = (root, leaf) => { const c = []; for (let x = leaf; x && x !== root; x = x.parentElement) c.unshift(x); return [root, ...c]; };
  const oc = chain(el, a), nc = nk ? chain(t, nk) : [];
  if (!nk || oc.length !== nc.length) { el.innerHTML = html; return; }
  for (let i = 0; i < oc.length - 1; i++) {
    const o = oc[i], n = nc[i], oKid = oc[i + 1], nKid = nc[i + 1];
    if (i > 0) { [...o.attributes].forEach((x) => { if (!n.hasAttribute(x.name)) o.removeAttribute(x.name); }); [...n.attributes].forEach((x) => o.setAttribute(x.name, x.value)); }
    [...o.childNodes].forEach((c) => { if (c !== oKid) c.remove(); });
    const kids = [...n.childNodes], at = kids.indexOf(nKid);
    oKid.before(...kids.slice(0, at)); oKid.after(...kids.slice(at + 1));
  }
}

export function modal(title, bodyHtml, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="닫기">✕</button></header>
    <div class="modal-body">${bodyHtml}</div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  // 바깥(어두운 곳)을 눌렀다 뗐을 때만 닫음 — 창 안에서 글자를 드래그해 선택하다 바깥에서 손을 떼도 닫히지 않게
  let downOut = false;
  wrap.addEventListener('pointerdown', (e) => { downOut = e.target === wrap; });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target === wrap && downOut) close();
    downOut = false;
  });
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
