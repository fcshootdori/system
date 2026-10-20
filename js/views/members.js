// 운영 > 회원 — [회원 관리 | 출석 관리]  (WD_FUTSAL 운영 회원 메뉴와 같은 구성)
//  회원 관리: 검색 · 유형 필터 · 표에서 바로 고치기 · 명단 붙여넣기 · CSV 저장 · 여러 명 선택 처리
//  출석 관리: 기간별 출석 횟수 · 출석률 · 최근 출석 · 연속 출석
import { S, playedDays } from '../state.js';
import { db, newId } from '../store.js';
import { APP_NAME } from '../config.js';
import { rosters } from '../domain.js';
import { esc, toast, fmtDate, todayISO, koSort } from '../util.js';
import { modal, empty } from '../ui.js';
import { norm } from '../cafe-parser.js';

export const MSTAT = { staff: '운영진', regular: '정회원', rest: '휴면' };
// 휴면 여부는 active(승률계산기 활성 Y/N과 같은 값)를 기준으로, 나머지는 status로 구분
export const statusOf = (m) => (m.active === false ? 'rest' : m.status && m.status !== 'rest' ? m.status : 'regular');

// 닉네임·별칭 중 하나라도 같으면 같은 사람으로 봄
const taken = (name, exceptId) => S.members.some((x) => x.id !== exceptId && [x.name, ...(x.aliases || [])].some((a) => norm(a) === norm(name)));
let tab = 'list', q = '', filt = 'all', sort = { k: 'name', d: 1 }, sel = new Set(), per = 'all';

// ── 회원별 출석 ──
function attendance(fromDate = '') {
  const days = playedDays().filter((m) => (m.date || '') >= fromDate);
  const rec = new Map();
  days.forEach((md) => rosters(md).flat().forEach((id) => {
    if (String(id).startsWith('g_')) return;
    const r = rec.get(id) || { att: 0, last: '', dates: [] };
    r.att++; r.dates.push(md.date); if (md.date > r.last) r.last = md.date;
    rec.set(id, r);
  }));
  // 연속 출석: 최근 경기부터 거꾸로 세기
  const ordered = [...days].sort((a, b) => b.date.localeCompare(a.date));
  rec.forEach((r, id) => {
    let s = 0;
    for (const md of ordered) { if (rosters(md).flat().includes(id)) s++; else break; }
    r.streak = s;
  });
  return { total: days.length, rec };
}

export function render(root) {
  const nav = `<nav class="subnav">${[['list', '회원 관리'], ['att', '출석 관리']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  root.innerHTML = nav + '<div data-body></div>';
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(root); }));
  const body = root.querySelector('[data-body]');
  if (tab === 'att') attView(body, root); else listView(body, root);
}

// ───────────── 회원 관리 ─────────────
function rowsOf() {
  const { total, rec } = attendance();
  return S.members.map((m) => {
    const a = rec.get(m.id) || { att: 0, last: '' };
    return { id: m.id, name: m.name, status: statusOf(m), aliases: (m.aliases || []).join(', '), att: a.att,
      rate: total ? Math.round((a.att / total) * 100) : 0, last: a.last, createdAt: m.createdAt || 0, source: m.source };
  });
}

function listView(body, root) {
  const all = rowsOf();
  const cnt = (k) => all.filter((r) => r.status === k).length;
  let rows = filt === 'all' ? all : all.filter((r) => r.status === filt);
  const k = q.trim().toLowerCase();
  if (k) rows = rows.filter((r) => r.name.toLowerCase().includes(k) || r.aliases.toLowerCase().includes(k) || norm(r.name).includes(norm(k)));
  rows.sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    const c = typeof x === 'number' ? x - y : koSort(x || '', y || '');
    return c * sort.d || koSort(a.name, b.name);
  });
  sel = new Set([...sel].filter((id) => all.some((r) => r.id === id)));
  const dups = dupGroups();
  const th = (key, label, cls = '') => `<th data-sort="${key}" class="${cls} ${sort.k === key ? 'on' : ''}">${label}${sort.k === key ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  body.innerHTML = `
    <div class="mg-top"><h2>회원 ${all.length}명</h2>
      <div class="row nowrap"><button class="btn ghost sm" data-bulk>명단 붙여넣기</button><button class="btn ghost sm" data-csv>CSV 저장</button><button class="btn sm" data-add>＋ 회원 추가</button></div></div>
    <div class="mtools">
      <input class="search" type="search" placeholder="닉네임·별칭 검색" value="${esc(q)}" data-q>
      <div class="seg mseg">${[['all', `전체 ${all.length}`], ...Object.entries(MSTAT).map(([s, l]) => [s, `${l} ${cnt(s)}`])].map(([s, l]) =>
        `<button data-f="${s}" class="${filt === s ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    ${dups.length ? `<div class="card warnbar"><b>⚠️ 같은 이름으로 보이는 회원 ${dups.length}쌍</b>
      <p class="small muted">${dups.map((g) => g.map((m) => esc(m.name)).join(' · ')).join(' / ')} — 이름을 고치거나 한 명을 휴면·삭제해 주세요.</p></div>` : ''}
    ${sel.size ? `<div class="bulkbar"><b>${sel.size}명 선택</b>
      <select data-bulkstat><option value="">유형 바꾸기</option>${Object.entries(MSTAT).map(([s, l]) => `<option value="${s}">${l}로</option>`).join('')}</select>
      <button class="btn ghost sm" data-selclear>선택 해제</button><button class="btn ghost danger sm" data-seldel>선택 삭제</button></div>` : ''}
    ${rows.length ? `<div class="card sheetwrap"><table class="grid"><thead><tr>
      <th class="ck"><input type="checkbox" data-selall ${rows.length && rows.every((r) => sel.has(r.id)) ? 'checked' : ''} aria-label="모두 선택"></th>
      ${th('name', '닉네임', 'stick')}${th('status', '유형')}${th('aliases', '별칭')}${th('att', '출석')}${th('rate', '출석률')}${th('last', '최근 출석')}<th>관리</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${sel.has(r.id) ? 'msel' : ''} st-row-${r.status}">
        <td class="ck"><input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? 'checked' : ''} aria-label="${esc(r.name)} 선택"></td>
        <td class="stick"><input class="cell w-name" value="${esc(r.name)}" data-cell="name" data-id="${r.id}"></td>
        <td><select class="cell st st-${r.status}" data-cell="status" data-id="${r.id}">${Object.entries(MSTAT).map(([s, l]) => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input class="cell w-alias" value="${esc(r.aliases)}" placeholder="-" data-cell="aliases" data-id="${r.id}"></td>
        <td class="num"><button class="attcell" data-att="${r.id}"><b>${r.att}</b>회</button></td>
        <td class="num"><div class="att-rate"><div class="att-bar"><i style="width:${r.rate}%"></i></div><span>${r.rate}%</span></div></td>
        <td class="num">${r.last ? r.last.slice(2).replace(/-/g, '.') : '-'}</td>
        <td><button class="btn ghost danger sm" data-del="${r.id}">삭제</button></td></tr>`).join('')}
      </tbody></table></div>` : `<section class="card">${empty(q || filt !== 'all' ? '조건에 맞는 회원이 없어요.' : '회원이 없어요. 회원 추가나 명단 붙여넣기, 설정 → 승률계산기에서 가져오기로 등록하세요.')}</section>`}
    <p class="note small muted">칸을 눌러 바로 고치면 저장돼요. 닉네임은 카페 닉네임 그대로 쓰고, 오타·다른 표기는 별칭에 쉼표로 넣으세요(카페 댓글·시트 가져오기에서 자동으로 알아봐요).
      회원 유형: 운영진 · 정회원 · 휴면(쉬는 회원 — 신청·이름 선택에서 빠지고 지난 기록은 그대로 남아요). 출석률은 기록이 있는 전체 경기 기준이에요.</p>`;

  const rer = () => render(root);
  body.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; const pos = e.target.selectionStart; rer(); const i = root.querySelector('[data-q]'); i.focus(); i.setSelectionRange(pos, pos); });
  body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filt = b.dataset.f; rer(); }));
  body.querySelectorAll('[data-sort]').forEach((t) => t.addEventListener('click', () => {
    const key = t.dataset.sort; sort = sort.k === key ? { k: key, d: -sort.d } : { k: key, d: ['att', 'rate', 'last'].includes(key) ? -1 : 1 }; rer();
  }));
  body.querySelector('[data-selall]')?.addEventListener('change', (e) => { rows.forEach((r) => (e.target.checked ? sel.add(r.id) : sel.delete(r.id))); rer(); });
  body.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); rer(); }));
  body.querySelector('[data-selclear]')?.addEventListener('click', () => { sel.clear(); rer(); });
  body.querySelector('[data-bulkstat]')?.addEventListener('change', async (e) => {
    const s = e.target.value; if (!s) return;
    await Promise.all([...sel].map((id) => db.set('members/' + id, { status: s, active: s !== 'rest' }, { merge: true })));
    toast(`${sel.size}명을 ${MSTAT[s]}(으)로 바꿨어요`); sel.clear();
  });
  body.querySelector('[data-seldel]')?.addEventListener('click', async () => {
    if (!confirm(`${sel.size}명을 삭제할까요? 지난 경기 기록에는 '(알 수 없음)'으로 남아요. 쉬는 회원이면 삭제 대신 '휴면'을 권해요.`)) return;
    await Promise.all([...sel].map((id) => db.del('members/' + id))); toast(`${sel.size}명을 삭제했어요`); sel.clear();
  });
  body.querySelectorAll('[data-cell]').forEach((el) => el.addEventListener('change', () => saveCell(el)));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const m = S.members.find((x) => x.id === b.dataset.del);
    if (!confirm(`${m.name} 님을 삭제할까요? 지난 경기 기록에는 '(알 수 없음)'으로 남아요. 쉬는 회원이면 삭제 대신 '휴면'을 권해요.`)) return;
    await db.del('members/' + m.id); toast('삭제했어요');
  }));
  body.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => showDates(b.dataset.att)));
  body.querySelector('[data-add]').addEventListener('click', addMember);
  body.querySelector('[data-bulk]').addEventListener('click', bulkPaste);
  body.querySelector('[data-csv]').addEventListener('click', () => exportCSV(all));
}

async function saveCell(el) {
  const id = el.dataset.id, f = el.dataset.cell;
  const m = S.members.find((x) => x.id === id);
  if (!m) return;
  if (f === 'name') {
    const v = el.value.trim();
    if (!v) { el.value = m.name; return toast('닉네임을 비울 수 없어요'); }
    if (taken(v, id)) { el.value = m.name; return toast('같은 닉네임(또는 별칭)의 회원이 이미 있어요'); }
    // 예전 닉네임은 별칭으로 남겨 카페 댓글·시트에서 계속 알아보게 함
    const aliases = [...new Set([...(m.aliases || []), m.name])].filter((a) => a !== v);
    await db.set('members/' + id, { name: v, aliases }, { merge: true }); toast('닉네임을 바꿨어요 (예전 닉네임은 별칭으로 남겨요)');
  } else if (f === 'status') {
    await db.set('members/' + id, { status: el.value, active: el.value !== 'rest' }, { merge: true }); toast(`${m.name} · ${MSTAT[el.value]}`);
  } else if (f === 'aliases') {
    const aliases = [...new Set(el.value.split(',').map((s) => s.trim()).filter(Boolean))];
    await db.set('members/' + id, { aliases }, { merge: true }); toast('별칭을 저장했어요');
  }
}

function addMember() {
  const { el, close } = modal('회원 추가', `<form class="stack">
    <label>닉네임 (카페 닉네임)<input name="name" required autofocus></label>
    <label>별칭 <span class="muted small">(쉼표로 구분 · 선택)</span><input name="aliases"></label>
    <label>유형<select name="status">${Object.entries(MSTAT).map(([s, l]) => `<option value="${s}" ${s === 'regular' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn">추가</button></form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const name = f.name.value.trim();
    if (taken(name)) return toast('같은 닉네임(또는 별칭)의 회원이 이미 있어요');
    await db.set('members/' + newId(), { name, aliases: f.aliases.value.split(',').map((s) => s.trim()).filter(Boolean),
      status: f.status.value, active: f.status.value !== 'rest', createdAt: Date.now() });
    toast(`${name} 님을 추가했어요`); close();
  });
}

function bulkPaste() {
  const { el, close } = modal('명단 붙여넣기', `
    <p class="muted small">한 줄에 한 명씩 붙여넣으세요. 번호(1. 2.)나 기호는 자동으로 지워요. 이미 있는 닉네임은 건너뛰어요.</p>
    <textarea rows="8" data-src placeholder="1. 진이&#10;2. 라미란&#10;3. 타잔"></textarea>
    <div data-prev class="small"></div>
    <button class="btn full" data-ok disabled>추가</button>`);
  let names = [];
  const src = el.querySelector('[data-src]'), prev = el.querySelector('[data-prev]'), ok = el.querySelector('[data-ok]');
  src.addEventListener('input', () => {
    const seen = new Set(S.members.flatMap((m) => [m.name, ...(m.aliases || [])]).map(norm));
    names = [];
    src.value.split(/\r?\n|,/).forEach((l) => {
      const n = l.replace(/^\s*[-*•·]?\s*\d*[.)]?\s*/, '').replace(/\(\s*게\s*\)/g, '').trim();
      if (n && !seen.has(norm(n))) { seen.add(norm(n)); names.push(n.slice(0, 20)); }
    });
    prev.innerHTML = names.length ? `새 회원 ${names.length}명: ${names.map(esc).join(', ')}` : '<span class="muted">추가할 새 회원이 없어요.</span>';
    ok.disabled = !names.length;
  });
  ok.addEventListener('click', async () => {
    const now = Date.now();
    await Promise.all(names.map((name, i) => db.set('members/' + newId() + i, { name, aliases: [], status: 'regular', active: true, createdAt: now })));
    toast(`${names.length}명을 추가했어요`); close();
  });
}

function exportCSV(rows) {
  const qv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const list = [...rows].sort((a, b) => koSort(a.name, b.name));
  const csv = '﻿' + [['닉네임', '유형', '별칭', '출석', '출석률(%)', '최근 출석'], ...list.map((r) => [r.name, MSTAT[r.status], r.aliases, r.att, r.rate, r.last])]
    .map((r) => r.map(qv).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${APP_NAME}_회원명단_${todayISO().replace(/-/g, '')}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('회원 명단을 저장했어요');
}

function showDates(id) {
  const m = S.members.find((x) => x.id === id);
  const r = attendance().rec.get(id);
  const dates = (r?.dates || []).sort().reverse();
  modal(`${m?.name || ''} 출석 ${dates.length}회`, dates.length
    ? `<ul class="list dates">${dates.map((d) => `<li>${fmtDate(d)}</li>`).join('')}</ul>` : empty('출석 기록이 없어요.'));
}

function dupGroups() {
  const map = new Map();
  S.members.forEach((m) => { const k = norm(m.name); if (!k) return; map.set(k, [...(map.get(k) || []), m]); });
  return [...map.values()].filter((g) => g.length > 1);
}

// ───────────── 출석 관리 ─────────────
function attView(body, root) {
  const t = todayISO();
  const from = per === 'year' ? t.slice(0, 4) + '-01-01' : per === '3m' ? (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); })() : '';
  const { total, rec } = attendance(from);
  const rows = S.members.filter((m) => statusOf(m) !== 'rest' || rec.has(m.id))
    .map((m) => ({ m, a: rec.get(m.id) || { att: 0, last: '', streak: 0 } }))
    .sort((x, y) => y.a.att - x.a.att || koSort(x.m.name, y.m.name));
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.a.att, 0) / rows.length * 10) / 10 : 0;
  body.innerHTML = `
    <section class="card">
      <div class="att-hd"><div><b>출석 현황</b><small class="muted"> 끝난 경기 ${total}회 기준</small></div>
        <div class="seg">${[['all', '전체'], ['year', '올해'], ['3m', '최근 3개월']].map(([k, l]) => `<button data-per="${k}" class="${per === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="stats3"><div><b>${total}</b><span>경기</span></div><div><b>${avg}</b><span>1인 평균 출석</span></div><div><b>${rows.filter((r) => r.a.att).length}</b><span>출석한 회원</span></div></div>
    </section>
    <section class="card"><ol class="att-list">${rows.map(({ m, a }, i) => {
      const rate = total ? Math.round(a.att / total * 100) : 0;
      return `<li class="${statusOf(m) === 'rest' ? 'rest' : ''}"><span class="rk">${i + 1}</span>
        <div class="am"><b>${esc(m.name)}</b><small class="muted">${a.last ? `최근 ${fmtDate(a.last, false)}` : '출석 기록 없음'}${a.streak > 1 ? ` · 🔥 ${a.streak}경기 연속` : ''}${statusOf(m) === 'rest' ? ' · 휴면' : ''}</small></div>
        <div class="att-rate"><div class="att-bar"><i style="width:${rate}%"></i></div><span>${a.att}회 · ${rate}%</span></div></li>`;
    }).join('')}</ol></section>`;
  body.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => { per = b.dataset.per; render(root); }));
}
