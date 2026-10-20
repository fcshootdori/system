// 일정 — 회원: 달력 보기 / 운영: 달력·목록에서 경기 추가·수정  (WD_FUTSAL 일정 메뉴와 같은 구성)
import { S, go, mdPath, today, statusLabel } from '../state.js?v=0.1.44';
import { db } from '../store.js?v=0.1.44';
import { STATUS } from '../config.js?v=0.1.44';
import { applicants, fmtOf, noLabel, isOpen, closeLabel } from '../domain.js?v=0.1.44';
import { esc, fmtDate, toast } from '../util.js?v=0.1.44';
import { empty } from '../ui.js?v=0.1.44';
import { editMatchday, fmtSummary, reviewCard, cancelMatchday } from './home.js?v=0.1.44';

let ym = null, sel = null, view = 'cal';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = (n) => String(n).padStart(2, '0');
// 달력 색: 초록 신청 중 · 파랑 경기 예정 · 회색 종료
const kindOf = (md) => (md.cancelled ? 'cancel' : md.status === 'played' ? 'done' : ['open', 'closed'].includes(md.status) ? 'apply' : 'game');

export function render(root, { sub }) {
  const op = sub === 'op' && S.operator;
  const byDate = new Map();
  S.matchdays.forEach((m) => { if (!byDate.has(m.date)) byDate.set(m.date, m); });
  if (!sel) {
    const up = S.matchdays.filter((m) => m.status !== 'played' && !m.cancelled && m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
    sel = up?.date || today();
  }
  if (!ym) ym = sel.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), days = new Date(y, mo, 0).getDate(), pad = first.getDay();

  let cells = DOW.map((d, i) => `<span class="dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('');
  for (let i = 0; i < pad; i++) cells += '<span class="scd blank"></span>';
  for (let d = 1; d <= days; d++) {
    const id = `${y}-${p2(mo)}-${p2(d)}`, md = byDate.get(id), wd = (pad + d - 1) % 7;
    cells += `<button class="scd ${md ? 'has k-' + kindOf(md) : ''} ${id === today() ? 'today' : ''} ${id === sel ? 'sel' : ''} ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}" data-day="${id}">
      <span class="dn">${d}</span>${md ? `<em>${md.cancelled ? '취소' : esc((md.time || '').slice(0, 5) || '경기')}</em>` : ''}</button>`;
  }

  const head = op ? `<nav class="subnav">${[['cal', '달력'], ['list', '목록']].map(([k, l]) => `<button data-view="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <div class="subact"><button class="btn sm" data-add>＋ 경기 추가</button></div>` : '';

  if (op && view === 'list') {
    const all = [...S.matchdays].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    root.innerHTML = head + `<section class="card"><p class="muted small">줄을 누르면 수정할 수 있어요.</p><div class="tbl-wrap vfit" data-key="plan"><table class="tbl plan"><thead><tr><th>회차</th><th>날짜</th><th>시간</th><th>장소</th><th>상태</th><th>참가</th></tr></thead><tbody>
      ${all.map((m) => `<tr data-edit="${m.id}"><td>${noLabel(m) || '-'}</td><td class="nm">${fmtDate(m.date)}</td><td>${esc(m.time || '')}</td><td>${esc(m.venue || '')}</td>
        <td><span class="st st-${kindOf(m)}">${statusLabel(m, STATUS)}</span></td><td>${m.source === 'sheet' ? '-' : applicants(m).filter((a) => !a.wait).length}</td></tr>`).join('')}
      </tbody></table></div></section>`;
    bindCommon(root);
    root.querySelectorAll('[data-edit]').forEach((tr) => tr.addEventListener('click', () => editMatchday(S.matchdays.find((m) => m.id === tr.dataset.edit))));
    return;
  }

  const md = byDate.get(sel);
  root.innerHTML = head + `
    <section class="card cal">
      <div class="cal-head"><button class="icon-btn" data-mon="-1" aria-label="이전 달">‹</button><b>${y}년 ${mo}월</b><button class="icon-btn" data-mon="1" aria-label="다음 달">›</button></div>
      <div class="cal-grid">${cells}</div>
      <div class="legend"><span class="k-apply">신청 중</span><span class="k-game">경기 예정</span><span class="k-done">종료</span><span class="k-cancel">취소</span></div>
    </section>
    <section class="card">${md ? detail(md, op) : `<p class="muted">${fmtDate(sel)} — 경기가 없어요.</p>${op ? `<button class="btn" data-addday>이 날 경기 추가</button>` : ''}`}</section>`;

  bindCommon(root);
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { sel = b.dataset.day; render(root, { sub }); }));
  root.querySelectorAll('[data-mon]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(y, mo - 1 + +b.dataset.mon, 1); ym = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; render(root, { sub });
  }));
  root.querySelector('[data-addday]')?.addEventListener('click', () => editMatchday(null, sel));
  root.querySelector('[data-editmd]')?.addEventListener('click', () => editMatchday(md));
  root.querySelector('[data-cancel]')?.addEventListener('click', () => cancelMatchday(md));
  root.querySelector('[data-run]')?.addEventListener('click', () => { S.sel = md.id; S.step = null; go('run'); });
  root.querySelector('[data-delmd]')?.addEventListener('click', async () => {
    if (!confirm(`${fmtDate(md.date)} 경기를 삭제할까요? 신청자와 경기 기록도 함께 지워지고 되돌릴 수 없어요.`)) return;
    await Promise.all(S.games.filter((g) => g.matchdayId === md.id).map((g) => db.del('games/' + g.id)));
    await db.del(mdPath(md.id)); toast('삭제했어요');
  });
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}

function bindCommon(root) {
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; b.closest('#view') && render(root, { sub: 'op' }); }));
  root.querySelector('[data-add]')?.addEventListener('click', () => editMatchday(null, sel));
}

function detail(md, op) {
  const f = fmtOf(md);
  const n = applicants(md).filter((a) => !a.wait).length;
  const played = md.status === 'played';
  if (md.cancelled) return `<div class="eyebrow cancel-t">${noLabel(md) ? noLabel(md) + ' · ' : ''}경기 취소</div>
    <h2 class="dt struck">${fmtDate(md.date)}${md.no ? ` <small>(${md.no}회 지정)</small>` : ''} ${md.time ? `<small>${esc(md.time)}</small>` : ''}</h2>
    <p class="muted small">${[md.venue, fmtSummary(md)].filter(Boolean).map(esc).join(' · ')}</p>
    <p class="cancel-box">이 경기는 취소됐어요${md.cancelReason ? ` — ${esc(md.cancelReason)}` : ''}.</p>
    ${op ? `<div class="row wrap"><button class="btn ghost" data-cancel>취소 철회</button><button class="btn ghost" data-editmd>수정</button><button class="btn ghost danger" data-delmd>삭제</button></div>` : ''}`;
  return `<div class="eyebrow">${[noLabel(md), STATUS[md.status]?.label].filter(Boolean).join(' · ')}</div>
    <h2 class="dt">${fmtDate(md.date)} ${md.time ? `<small>${esc(md.time)}</small>` : ''}</h2>
    <p class="muted small">${[md.venue, fmtSummary(md)].filter(Boolean).map(esc).join(' · ')}</p>
    ${md.note ? `<p class="note">${esc(md.note)}</p>` : ''}
    ${played ? reviewCard(md) : `<p class="small">참가 ${n}명${f.minPlayers ? ` / 최소 ${f.minPlayers}명` : ''}${f.capacity ? ` · 정원 ${f.capacity}명` : ''}${isOpen(md) && closeLabel(md) && !md.reopened ? ` · ⏰ ${closeLabel(md)}` : ''}</p>`}
    <div class="row wrap">
      ${op ? `<button class="btn" data-run>경기 메뉴로</button><button class="btn ghost" data-editmd>수정</button>${played ? '' : '<button class="btn ghost danger" data-cancel>경기 취소</button>'}<button class="btn ghost danger" data-delmd>삭제</button>`
        : played ? `<a class="btn" href="#/games/${md.id}">결과 보기</a>`
        : isOpen(md) ? `<button class="btn" data-go="apply/${md.id}">참가 신청</button>` : `<button class="btn ghost" data-go="apply/${md.id}">신청 명단</button>`}
    </div>`;
}
