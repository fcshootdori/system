// 운영 > 회원 — [회원 관리 | 출석 관리]  (WD_FUTSAL 운영 회원 메뉴와 같은 구성)
//  회원 관리: 검색 · 유형 필터 · 표에서 바로 고치기 · 명단 붙여넣기 · CSV 저장 · 여러 명 선택 처리
//  출석 관리: 기간별 출석 횟수 · 출석률 · 최근 출석 · 연속 출석
import { S, playedDays } from '../state.js?v=0.1.64';
import { db, newId } from '../store.js?v=0.1.64';
import { APP_NAME } from '../config.js?v=0.1.64';
import { rosters } from '../domain.js?v=0.1.64';
import { esc, toast, fmtDate, todayISO, koSort } from '../util.js?v=0.1.64';
import { modal, empty, fitBoxes } from '../ui.js?v=0.1.64';
import { norm } from '../cafe-parser.js?v=0.1.64';
import { resetPin } from '../auth.js?v=0.1.64';
import { sheetLink, setSheetLink, sheetUrl, preview, apply, needsReview, startAutoSync, autoSync, holdAuto } from '../member-sync.js?v=0.1.64';
import { sheetApi, saveMemberRow } from '../record-sheet.js?v=0.1.64';
import { FEE_KINDS, feeKind, isLeftGrade, nickParts, publicOf } from '../member-sheet.js?v=0.1.64';

// 회원 구분 = 회원 시트 등급 (VIP · 우수회원 · 슛도리 · 정회원 · 탈퇴회원), 운영진은 따로 체크
export const isLeft = (m) => isLeftGrade(m.grade) || m.status === 'left';
export const isStaff = (m) => (m.staff ?? m.status === 'staff') === true;
const isRest = (m) => isLeft(m) || m.active === false;
const GRADES = ['VIP', '우수회원', '슛도리', '정회원', '탈퇴회원'];
const dot = (iso) => (iso ? iso.slice(2).replace(/-/g, '.') : '');

// 닉네임·별칭 중 하나라도 같으면 같은 사람으로 봄
const taken = (name, exceptId) => S.members.some((x) => x.id !== exceptId && [x.name, ...(x.aliases || [])].some((a) => norm(a) === norm(name)));
let loadedOnce = false;
let tab = 'list', q = '', filt = 'all', sort = { k: 'grank', d: 1 }, sel = new Set(), per = 'all', hideLeft = true, busy = false;

// ── 회원별 출석 ──
function attendance(fromDate = '') {
  const days = playedDays().filter((m) => !m.sample && (m.date || '') >= fromDate);
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
  const nav = `<nav class="subnav">${[['list', '회원 관리'], ['fee', '회비 현황'], ['att', '출석 관리']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  root.innerHTML = nav + '<div data-body></div>';
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(root); }));
  const body = root.querySelector('[data-body]');
  if (tab === 'att') attView(body, root); else if (tab === 'fee') feeView(body, root); else listView(body, root);
  fitBoxes(root);
}


// ───────────── 회원 시트 (구글 시트 연결 · 새로 불러오기) ─────────────
const ago = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : new Date(ts).toLocaleDateString('ko-KR');
};
const BY = { auto: '자동', manual: '새로 불러오기', server: '자동(서버)' };
function sheetCard() {
  const l = sheetLink(), ms = S.msync;
  const last = ms?.checkedAt ? `마지막 확인 ${ago(ms.checkedAt)} (${BY[ms.by] || ms.by})${ms.changedAt ? ` · 마지막 변경 ${ago(ms.changedAt)}${ms.last ? ` — 새 회원 ${ms.last.created} · 바뀐 회원 ${ms.last.updated}` : ''}` : ''}${ms.sheetUpdated ? ` · 시트 최종업데이트 ${esc(ms.sheetUpdated)}` : ''}` : '아직 반영한 적이 없어요';
  if (!l) return `<section class="card mshcard">
    <div class="msh-hd"><b>📗 통합 시트 › 회원</b><span class="small muted">${last}</span></div>
    ${sheetApi() ? `<p class="small">통합 시트 회원 탭이 회원 정보에 그대로 들어오고, 이후 시트가 바뀌면 자동으로 반영돼요. 이 기기에 <b>연결 키</b>를 넣어 주세요 (시트 메뉴 슛도리 › 앱 연결 정보).</p>
    <form class="row nowrap" data-link><input name="key" type="password" placeholder="연결 키" autocomplete="off"><button class="btn sm">연결하고 불러오기</button></form>`
    : `<p class="small">회원 명부는 <b>통합 시트</b>에서 관리해요. 운영 › 설정 › 통합 시트에서 먼저 연결해 주세요.</p>
    <a class="btn sm" href="#/settings">통합 시트 연결하러 가기</a>`}
    <p class="tiny muted">🔒 이름·생년월일·연락처·장불 사유·회비는 서버에 저장하지 않고, 연결 키를 넣은 운영진 기기에서만 시트에서 바로 읽어 보여 줘요.</p></section>`;
  return `<section class="card mshcard compact"><div class="msh-row">
    <span class="msh-t"><b>📗<span class="hide-xxs"> <span class="hide-xs">통합 </span>시트</span></b> <small class="muted">${ms?.checkedAt ? ago(ms.checkedAt) : ''}${S.msheet ? '' : ' · 🔒'}</small></span>
    <span class="msh-btns"><button class="btn sm" data-reload ${busy ? 'disabled' : ''}>${busy ? '불러오는 중…' : '↻ 새로 불러오기'}</button>
      ${sheetUrl() ? `<a class="btn ghost sm" href="${esc(sheetUrl())}" target="_blank" rel="noopener">시트 열기</a>` : ''}
      <button class="btn ghost sm icon" data-shinfo aria-label="통합 시트 안내">ⓘ</button></span></div></section>`;
}
function bindSheetCard(body, root) {
  const rer = () => render(root);
  body.querySelector('[data-link]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim();
    if (!key) return toast('연결 키를 넣어 주세요');
    setSheetLink({ key }); await reload(root, true, true);
  });
  body.querySelector('[data-reload]')?.addEventListener('click', () => reload(root, true));
  body.querySelector('[data-shinfo]')?.addEventListener('click', () => {
    const ms = S.msync;
    const { el, close } = modal('통합 시트 › 회원', `<p class="small">${ms?.checkedAt ? `마지막 확인 ${ago(ms.checkedAt)} (${BY[ms.by] || ms.by})${ms.changedAt ? `<br>마지막 변경 ${ago(ms.changedAt)}${ms.last ? ` — 새 회원 ${ms.last.created} · 바뀐 회원 ${ms.last.updated}` : ''}` : ''}${ms.sheetUpdated ? `<br>시트 최종업데이트 ${esc(ms.sheetUpdated)}` : ''}` : '아직 반영한 적이 없어요'}</p>
      <p class="small muted">이 기기에서 앱을 열 때와 열어 둔 동안 30분마다 자동으로 반영돼요. 시트 항목(가입일자·등급·닉네임·이름·생년월일·연락처·운영진 이력·장불·회비)은 통합 시트 회원 탭에서 고쳐 주세요.</p>
      <p class="small muted">🔒 이름·생년월일·연락처·장불 사유·회비는 서버에 저장하지 않고 이 기기에서만 시트에서 읽어 보여 줘요.${S.msheet ? '' : ' (지금은 아직 읽지 않았어요)'}</p>
      <button class="btn ghost danger full" data-unlink>이 기기에서 연결 키 지우기</button>`);
    el.querySelector('[data-unlink]').addEventListener('click', () => {
      if (!confirm('이 기기에서 연결 키를 지울까요? (이미 반영된 회원 정보는 그대로 남아요. 시트로 경기 기록 보내기도 멈춰요)')) return;
      setSheetLink(null); S.msheet = null; startAutoSync(); close(); render(root);
    });
  });
  body.querySelector('[data-unlink]')?.addEventListener('click', () => {
    if (!confirm('이 기기에서 연결 키를 지울까요? (이미 반영된 회원 정보는 그대로 남아요. 시트로 경기 기록 보내기도 멈춰요)')) return;
    setSheetLink(null); S.msheet = null; startAutoSync(); rer();
  });
}
async function reload(root, manual, first = false) {
  if (busy) return;
  busy = true; loadedOnce = true; render(root);
  try {
    if (!manual) { await autoSync(); busy = false; return render(root); }
    const pv = await preview();
    if (needsReview(pv)) { holdAuto(true); busy = false; render(root); return reviewModal(pv, root, first); }
    const r = await apply(pv, { by: manual ? 'manual' : 'auto' });
    if (first) startAutoSync();
    if (manual) toast(r.created || r.updated || r.missing ? `시트 반영: 새 회원 ${r.created} · 바뀐 회원 ${r.updated}${r.missing ? ` · 시트에서 빠짐 ${r.missing}` : ''}` : `시트와 같아요 (회원 ${r.count}명)`);
  } catch (e) { toast(e.message || '시트를 읽지 못했어요'); }
  busy = false; render(root);
}
// 새 회원·비슷한 이름 짝 확인
function reviewModal(pv, root, first) {
  holdAuto(true);
  const { records, plan } = pv;
  const linked = new Set(plan.ops.filter((o) => o.id).map((o) => o.id));
  const free = S.members.filter((m) => !linked.has(m.id)).sort((a, b) => koSort(a.name, b.name));
  const creates = plan.ops.filter((o) => o.type === 'create');
  const fuzzy = plan.ops.filter((o) => o.how === 'similar' || o.how === 'no');
  const sum = { up: plan.ops.filter((o) => o.type === 'update').length, same: plan.ops.filter((o) => o.type === 'same').length };
  const { el, close } = modal('통합 시트 회원 반영 확인', `
    <p class="small">시트 회원 <b>${records.length}명</b> — 바뀐 회원 ${sum.up} · 그대로 ${sum.same}${plan.missing.length ? ` · 시트에서 빠진 회원 ${plan.missing.length}` : ''}</p>
    ${fuzzy.length ? `<h4>이름이 달라 짝지은 회원 ${fuzzy.length}</h4><ul class="list rv">${fuzzy.map((o) => `<li><span>앱 <b>${esc(o.from)}</b> → 시트 <b>${esc(records[o.ri].nick)}</b></span>
      <label class="inline small"><input type="checkbox" data-keep="${o.ri}" checked> 같은 사람</label></li>`).join('')}</ul>
      <p class="tiny muted">같은 사람이면 닉네임을 시트대로 바꾸고 예전 닉네임은 별칭으로 남겨요. 체크를 풀면 새 회원으로 추가해요.</p>` : ''}
    ${creates.length ? `<h4>새 회원 ${creates.length}</h4><ul class="list rv">${creates.map((o) => `<li><span><b>${esc(records[o.ri].nick)}</b> <small class="muted">${esc(records[o.ri].grade)} · ${dot(records[o.ri].joined)} 가입</small></span>
      <select data-choice="${o.ri}"><option value="new">새 회원으로 추가</option>${free.map((m) => `<option value="${m.id}">= ${esc(m.name)} (기존 회원)</option>`).join('')}</select></li>`).join('')}</ul>
      <p class="tiny muted">기록이 있는 기존 회원과 같은 사람이면 골라 주세요 (닉네임이 바뀐 경우 등).</p>` : ''}
    <button class="btn full" data-go>반영하기</button>`, { wide: true });
  new MutationObserver((_, ob) => { if (!el.isConnected) { holdAuto(false); ob.disconnect(); } }).observe(document.body, { childList: true });
  el.querySelector('[data-go]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const choices = {};
    el.querySelectorAll('[data-choice]').forEach((s) => { choices[s.dataset.choice] = s.value; });
    // 짝 풀기 → 새 회원으로
    el.querySelectorAll('[data-keep]').forEach((c) => {
      if (c.checked) return;
      const o = plan.ops.find((x) => x.ri === +c.dataset.keep);
      const fresh = planSync1(records[o.ri]);
      Object.assign(o, { type: 'create', id: undefined, how: undefined, data: fresh });
    });
    try {
      const r = await apply(pv, { by: 'manual', choices });
      toast(`시트 반영: 새 회원 ${r.created} · 바뀐 회원 ${r.updated}`); close(); holdAuto(false); if (first) startAutoSync(); render(root);
    } catch (err) { toast(err.message); e.target.disabled = false; }
  });
}
const planSync1 = (r) => { const left = isLeftGrade(r.grade); return { name: r.nick, aliases: nickParts(r.nick), ...publicOf(r), active: !left, source: 'members-sheet' }; };

// ───────────── 회원 관리 ─────────────
function rowsOf() {
  const { total, rec } = attendance();
  const P = S.msheet?.byId || {};
  return S.members.map((m) => {
    const a = rec.get(m.id) || { att: 0, last: '' };
    const p = P[m.id] || null;
    const grade = m.inSheet ? m.grade || '' : '';
    return { id: m.id, name: m.name, inSheet: !!m.inSheet, no: m.inSheet ? Number(m.sheetNo) || 9999 : 99999, sheetNo: m.inSheet ? m.sheetNo || '' : '',
      joined: m.inSheet ? m.joined || '' : '', grade, grank: grade ? (GRADES.indexOf(grade) + 1 || 9) : 10, staff: isStaff(m) ? 1 : 0, left: isLeft(m), rest: !isLeft(m) && m.active === false, staffV: !!m.staffV, staffHist: m.staffHist || '',
      absent: m.absent || '', absFrom: m.absFrom || '', absTo: m.absTo || '', p,
      realName: p ? p.realName : (m.inSheet ? '' : m.realName || ''), birth: p?.birth || '', phone: p?.phone || '', bday: p?.bMonth ? `${+p.bMonth}/${+p.bDay}` : '',
      login: S.authset?.[m.id]?.registered ? 1 : 0, aliases: (m.aliases || []).join(', '), att: a.att,
      rate: total ? Math.round((a.att / total) * 100) : 0, last: a.last, createdAt: m.createdAt || 0, source: m.source };
  });
}

function listView(body, root) {
  const all = rowsOf();
  const priv = !!S.msheet;
  // 구분: 전체 · 운영진 · 등급별 · 시트에 없음 (탈퇴회원은 항상 아래쪽에 따로)
  const FILTERS = [['all', '전체', () => true], ['staff', '운영진', (r) => r.staff], ...GRADES.filter((g) => !isLeftGrade(g)).map((g) => [g, g, (r) => r.grade === g]), ['-', '시트에 없음', (r) => !r.inSheet]];
  const fOf = (k) => (FILTERS.find((x) => x[0] === k) || FILTERS[0])[2];
  const cnt = (k) => all.filter((r) => !r.left && fOf(k)(r)).length;
  if (!FILTERS.some((x) => x[0] === filt)) filt = 'all';
  let rows = all.filter((r) => r.left || fOf(filt)(r));
  const k = q.trim().toLowerCase();
  if (k) rows = rows.filter((r) => r.name.toLowerCase().includes(k) || r.realName.toLowerCase().includes(k) || r.aliases.toLowerCase().includes(k) || norm(r.name).includes(norm(k))
    || (k.replace(/\D/g, '').length >= 4 && r.phone.replace(/\D/g, '').includes(k.replace(/\D/g, ''))));
  rows.sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    const c = typeof x === 'number' ? x - y : koSort(x || '￿', y || '￿');
    return c * sort.d || a.grank - b.grank || koSort(a.name, b.name);
  });
  sel = new Set([...sel].filter((id) => all.some((r) => r.id === id)));
  const dups = dupGroups();
  const th = (key, label, cls = '') => `<th data-sort="${key}" class="${cls} ${sort.k === key ? 'on' : ''}">${label}${sort.k === key ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const lock = '<span class="muted" title="시트를 읽으면 보여요">🔒</span>';
  // 장불 정보 말풍선: 사유 · 시작일자 · 해제일자
  const absInfo = (r, pv) => [`장불 사유: ${pv ? r.p?.absReason || '적힌 사유 없음' : '🔒 통합 시트를 읽으면 보여요'}`,
    `장불 시작일자: ${dot(r.absFrom) || '-'}`, `장불 해제일자: ${dot(r.absTo) || '-'}`].join('\n');
  // 탈퇴 회원은 같은 표 맨 아래에 구분줄과 함께
  const main = rows.filter((r) => !r.left), left = rows.filter((r) => r.left);
  const leftDiv = `<tr class="left-div"><td colspan="17"><span>탈퇴 회원 ${left.length}명 <small>시트 등급 '탈퇴회원' — 지난 기록은 그대로 남아요</small></span></td></tr>`;
  const table = (list, key) => `<table class="grid mgrid"><thead><tr>
      <th class="ck"><input type="checkbox" data-selall="${key}" ${list.length && list.every((r) => sel.has(r.id)) ? 'checked' : ''} aria-label="모두 선택"></th>
      ${th('name', '닉네임', 'stick')}${th('grank', '등급')}${th('staff', '운영진')}${th('joined', '가입일자')}${th('realName', '이름')}${th('birth', '생년월일')}${th('phone', '연락처')}${th('staffHist', '운영진 이력')}${th('absent', '장불여부')}
      <th class="gap"></th>${th('login', '로그인')}${th('aliases', '별칭')}${th('att', '출석')}${th('rate', '출석률')}${th('last', '최근 출석')}<th>관리</th></tr></thead><tbody>
      ${list.map((r, i) => `${r.left && (i === 0 || !list[i - 1].left) ? leftDiv : ''}<tr class="${sel.has(r.id) ? 'msel' : ''} ${r.left ? 'st-row-left' : r.rest || !r.inSheet ? 'st-row-rest' : ''}">
        <td class="ck"><input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? 'checked' : ''} aria-label="${esc(r.name)} 선택"></td>
        <td class="stick">${r.inSheet ? `<button type="button" class="cell ro nm-edit" data-edit="${r.id}" title="눌러서 회원 정보 고치기">${esc(r.name)}</button>` : `<input class="cell w-name" value="${esc(r.name)}" data-cell="name" data-id="${r.id}"><small class="nosheet">시트에 없음</small>`}</td>
        <td>${r.grade ? `<span class="grade g-${GRADES.indexOf(r.grade)}">${esc(r.grade)}</span>` : '-'}</td>
        <td class="ck"><input type="checkbox" class="staffck" data-staff="${r.id}" ${r.staff ? 'checked' : ''} aria-label="${esc(r.name)} 운영진"></td>
        <td>${dot(r.joined) || '-'}</td>
        <td>${r.inSheet ? (priv ? esc(r.realName) || '-' : lock) : `<input class="cell w-real" value="${esc(r.realName)}" placeholder="-" data-cell="realName" data-id="${r.id}">`}</td>
        <td>${r.inSheet ? (priv ? dot(r.birth) || '-' : lock) : '-'}</td>
        <td>${r.inSheet ? (priv ? (r.phone ? `<a href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a>` : '-') : lock) : '-'}</td>
        <td>${r.staffV || r.staffHist ? `<span class="small">${r.staffV ? '<b class="v">V</b> ' : ''}${esc(r.staffHist)}</span>` : '-'}</td>
        <td>${r.absent ? `<button type="button" class="abs" data-absr="${r.id}" title="${esc(absInfo(r, priv))}">${esc(r.absent)} <i>ⓘ</i></button>` : '-'}</td>
        <td class="gap"></td>
        <td>${r.login ? `<span class="small ok-t">등록됨</span> <button class="btn ghost sm" data-pinreset="${r.id}">초기화</button>` : '<span class="small muted">미등록</span>'}</td>
        <td><input class="cell w-alias" value="${esc(r.aliases)}" placeholder="-" data-cell="aliases" data-id="${r.id}"></td>
        <td class="num"><button class="attcell" data-att="${r.id}"><b>${r.att}</b>회</button></td>
        <td class="num"><div class="att-rate"><div class="att-bar"><i style="width:${r.rate}%"></i></div><span>${r.rate}%</span></div></td>
        <td class="num">${r.last ? r.last.slice(2).replace(/-/g, '.') : '-'}</td>
        <td class="m-act"><button class="btn ghost sm" data-edit="${r.id}">수정</button><button class="btn ghost danger sm" data-del="${r.id}">삭제</button></td></tr>`).join('')}
      </tbody></table>`;

  body.innerHTML = `
    ${sheetCard()}
    <div class="mg-top"><h2>회원 ${all.length}명 <button class="link tiny" data-tnote>ⓘ 안내</button></h2>
      <div class="row nowrap"><button class="btn ghost sm" data-bulk>붙여넣기</button><button class="btn ghost sm" data-csv>CSV</button><button class="btn sm" data-add>＋ 추가</button></div></div>
    <div class="mtools">
      <input class="search" type="search" placeholder="닉네임·이름·별칭·연락처 검색" value="${esc(q)}" data-q>
      <div class="seg mseg gseg">${FILTERS.filter(([k]) => k === 'all' || k === 'staff' || cnt(k)).map(([k, l]) =>
        `<button data-f="${esc(k)}" class="${filt === k ? 'on' : ''}">${l} ${cnt(k)}</button>`).join('')}</div>
    </div>
    ${dups.length ? `<div class="card warnbar"><b>⚠️ 같은 이름으로 보이는 회원 ${dups.length}쌍</b>
      <p class="small muted">${dups.map((g) => g.map((m) => esc(m.name)).join(' · ')).join(' / ')} — 이름을 고치거나 한 명을 휴면·삭제해 주세요.</p></div>` : ''}
    ${sel.size ? `<div class="bulkbar"><b>${sel.size}명 선택</b>
      <button class="btn ghost sm" data-bulkstaff="1">운영진 지정</button><button class="btn ghost sm" data-bulkstaff="0">운영진 해제</button>
      <button class="btn ghost sm" data-selclear>선택 해제</button><button class="btn ghost danger sm" data-seldel>선택 삭제</button></div>` : ''}

    ${rows.length ? `<div class="card sheetwrap vfit" data-key="mlist">${table([...main, ...left], 'all')}</div>` : `<section class="card">${empty(q || filt !== 'all' ? '조건에 맞는 회원이 없어요.' : '회원이 없어요. 통합 시트를 연결하거나 회원 추가·명단 붙여넣기로 등록하세요.')}</section>`}
`;

  const rer = () => render(root);
  bindSheetCard(body, root);
  body.querySelector('[data-tnote]').addEventListener('click', () => modal('회원 표 안내', `<p class="small">등급·가입일자~장불여부는 통합 시트 회원 탭 내용 그대로예요(시트에서 고치면 반영돼요). 회원 구분은 시트 등급(VIP · 우수회원 · 슛도리 · 정회원 · 탈퇴회원)을 따르고, 운영진은 체크로 따로 지정해요.
      장불여부를 누르거나 마우스를 올리면 장불 사유·시작일자·해제일자가 보여요. 표가 길면 표 안에서 위아래·옆으로 넘겨 보세요. 별칭에는 오타·다른 표기를 쉼표로 넣으세요(카페 댓글·로그인에서 알아봐요). 출석률은 기록이 있는 전체 경기 기준이에요.</p>`));
  body.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; const pos = e.target.selectionStart; rer(); const i = root.querySelector('[data-q]'); i.focus(); i.setSelectionRange(pos, pos); });
  body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filt = b.dataset.f; rer(); }));
  body.querySelectorAll('[data-sort]').forEach((t) => t.addEventListener('click', () => {
    const key = t.dataset.sort; sort = sort.k === key ? { k: key, d: -sort.d } : { k: key, d: ['att', 'rate', 'last', 'joined'].includes(key) ? -1 : 1 }; rer();
  }));
  body.querySelectorAll('[data-selall]').forEach((c) => c.addEventListener('change', (e) => { [...main, ...left].forEach((r) => (e.target.checked ? sel.add(r.id) : sel.delete(r.id))); rer(); }));
  body.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); rer(); }));
  body.querySelector('[data-selclear]')?.addEventListener('click', () => { sel.clear(); rer(); });
  body.querySelectorAll('[data-bulkstaff]').forEach((b) => b.addEventListener('click', async () => {
    const on = b.dataset.bulkstaff === '1';
    await Promise.all([...sel].map((id) => db.set('members/' + id, { staff: on }, { merge: true })));
    toast(`${sel.size}명을 운영진${on ? '으로 지정' : '에서 해제'}했어요`); sel.clear(); rer();
  }));
  body.querySelectorAll('[data-staff]').forEach((c) => c.addEventListener('change', async () => {
    const m = S.members.find((x) => x.id === c.dataset.staff);
    await db.set('members/' + m.id, { staff: c.checked }, { merge: true }); toast(`${m.name} · 운영진 ${c.checked ? '지정' : '해제'}`);
  }));
  // 장불 사유: 마우스를 올리면(title) · 누르면 말풍선
  body.querySelectorAll('[data-absr]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.abs-pop').forEach((x) => x.remove());
    const pop = document.createElement('div'); pop.className = 'abs-pop'; pop.dataset.t = Date.now(); pop.textContent = b.title;
    document.body.appendChild(pop);
    const rc = b.getBoundingClientRect();
    pop.style.top = `${rc.bottom + window.scrollY + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(rc.left + window.scrollX, window.innerWidth - pop.offsetWidth - 8))}px`;
    const off = () => { pop.remove(); document.removeEventListener('click', off); };
    setTimeout(() => document.addEventListener('click', off), 0);
  }));
  body.querySelector('[data-seldel]')?.addEventListener('click', async () => {
    if (!confirm(`${sel.size}명을 삭제할까요? 지난 경기 기록에는 '(알 수 없음)'으로 남아요. 시트에 있는 회원은 다음 반영 때 다시 들어와요.`)) return;
    await Promise.all([...sel].map((id) => db.del('members/' + id))); toast(`${sel.size}명을 삭제했어요`); sel.clear();
  });
  body.querySelectorAll('[data-cell]').forEach((el) => el.addEventListener('change', () => saveCell(el)));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const m = S.members.find((x) => x.id === b.dataset.del);
    if (!confirm(`${m.name} 님을 삭제할까요? 지난 경기 기록에는 '(알 수 없음)'으로 남아요. ${m.inSheet ? '\n(통합 시트 회원 탭에 있는 회원은 다음 반영 때 다시 들어와요)' : ''}`)) return;
    await db.del('members/' + m.id); toast('삭제했어요');
  }));
  body.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => showDates(b.dataset.att)));
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editMember(b.dataset.edit, root)));
  body.querySelectorAll('[data-pinreset]').forEach((b) => b.addEventListener('click', async () => {
    const m = S.members.find((x) => x.id === b.dataset.pinreset);
    if (!confirm(`${m.name} 님의 비밀번호를 초기화할까요? 다음 접속 때 새 비밀번호를 정하게 돼요. (자동 로그인된 기기도 다시 로그인해야 해요)`)) return;
    await resetPin(m.id); toast(`${m.name} 님 비밀번호를 초기화했어요`);
  }));
  body.querySelector('[data-add]').addEventListener('click', addMember);
  body.querySelector('[data-bulk]').addEventListener('click', bulkPaste);
  body.querySelector('[data-csv]').addEventListener('click', () => exportCSV(all));
  // 연결 키가 있는데 이번 접속에서 아직 안 읽었으면 바로 읽기 (개인정보 칸 표시)
  if (sheetLink() && !S.msheet && !busy && !loadedOnce) { loadedOnce = true; reload(root, false); }
}

// ───────────── 회비 현황 ─────────────
function feeView(body, root) {
  const P = S.msheet?.byId;
  const mon = new Date().getMonth();
  let list = S.members.filter((m) => m.inSheet && P?.[m.id]).map((m) => ({ m, f: P[m.id].fees || [] }));
  if (hideLeft) list = list.filter(({ m }) => !isLeft(m));
  const k = q.trim().toLowerCase();
  if (k) list = list.filter(({ m }) => m.name.toLowerCase().includes(k) || norm(m.name).includes(norm(k)) || (P[m.id].realName || '').includes(k));
  list.sort((a, b) => (Number(a.m.sheetNo) || 9999) - (Number(b.m.sheetNo) || 9999));
  const cnt = {}; list.forEach(({ f }) => { const kk = feeKind(f[mon]) || 'none'; cnt[kk] = (cnt[kk] || 0) + 1; });
  const pill = (v) => { const kk = feeKind(v); return kk ? `<span class="fee f-${kk}" title="${esc(v)}">${FEE_KINDS[kk]?.mark || ''} ${esc(FEE_KINDS[kk]?.label || v)}</span>` : '<span class="fee f-none">-</span>'; };
  body.innerHTML = `${sheetCard()}
    ${!P ? `<section class="card">${empty(sheetLink() ? '통합 시트를 읽는 중이에요…' : '회비 현황은 이 기기에 통합 시트 연결 키를 넣으면 보여요.')}</section>` : `
    <section class="card"><div class="att-hd"><div><b>${mon + 1}월 회비</b><small class="muted"> 회원 ${list.length}명 · ◎ 연납 ♥ 선납 O 월납 ▲ 장불 ■ 면제 — 고칠 때는 시트에서</small></div>
      <label class="inline small"><input type="checkbox" data-hl ${hideLeft ? 'checked' : ''}> 탈퇴 회원 숨기기</label></div>
      <div class="feesum">${[...Object.keys(FEE_KINDS), 'etc', 'none'].filter((x) => cnt[x]).map((x) => `<div><b>${cnt[x]}</b>${x === 'none' ? '<span class="fee f-none">-</span> 없음' : x === 'etc' ? '기타' : pill(FEE_KINDS[x].label)}</div>`).join('')}</div></section>
    <div class="mtools"><input class="search" type="search" placeholder="닉네임·이름 검색" value="${esc(q)}" data-q></div>

    <div class="card sheetwrap vfit" data-key="mfee"><table class="grid fgrid"><thead><tr><th class="stick">닉네임</th><th>등급</th>${Array.from({ length: 12 }, (_, i) => `<th class="${i === mon ? 'on' : ''}">${i + 1}월</th>`).join('')}</tr></thead><tbody>
      ${list.map(({ m, f }) => `<tr class="${isLeft(m) ? 'st-row-left' : ''}"><td class="stick"><b>${esc(m.name)}</b></td><td>${m.grade ? `<span class="grade g-${GRADES.indexOf(m.grade)}">${esc(m.grade)}</span>` : ''}</td>
        ${Array.from({ length: 12 }, (_, i) => `<td class="${i === mon ? 'cur' : ''}">${pill(f[i])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
`}`;
  bindSheetCard(body, root);
  body.querySelector('[data-hl]')?.addEventListener('change', (e) => { hideLeft = e.target.checked; render(root); });
  body.querySelector('[data-q]')?.addEventListener('input', (e) => { q = e.target.value; const pos = e.target.selectionStart; render(root); const i = root.querySelector('[data-q]'); i.focus(); i.setSelectionRange(pos, pos); });
  if (sheetLink() && !S.msheet && !busy && !loadedOnce) { loadedOnce = true; reload(root, false); }
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
  } else if (f === 'realName') {
    await db.set('members/' + id, { realName: el.value.trim() }, { merge: true }); toast('이름을 저장했어요');
  } else if (f === 'aliases') {
    const aliases = [...new Set(el.value.split(',').map((s) => s.trim()).filter(Boolean))];
    await db.set('members/' + id, { aliases }, { merge: true }); toast('별칭을 저장했어요');
  }
}

// ───────────── 회원 정보 고치기 ─────────────
//  통합 시트 회원 탭에 있는 회원: 시트 칸(닉네임·등급·가입일자·이름·생년월일·연락처·운영진 이력·장불)은 회원 탭 그 줄을 바로 고치고
//   → 고친 회원 탭을 다시 읽어 앱에 반영 (개인정보는 지금처럼 서버에 저장하지 않음)
//  시트에 없는 회원: 앱에만 저장. 별칭·운영진 표시는 언제나 앱에 저장
const SHEET_F = ['nick', 'grade', 'joined', 'name', 'birth', 'phone', 'staffV', 'staffHist', 'absent', 'reason', 'absFrom', 'absTo'];
async function editMember(id, root) {
  const m = S.members.find((x) => x.id === id);
  if (!m) return;
  const inSheet = !!m.inSheet, canSheet = inSheet && !!sheetLink();
  if (canSheet && !S.msheet) {   // 개인정보 칸을 아직 안 읽었으면 먼저 읽기 (빈 칸으로 덮어쓰지 않게)
    toast('통합 시트에서 회원 정보를 읽는 중…');
    await autoSync();
    if (!S.msheet) return toast('통합 시트를 읽지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
  const p = S.msheet?.byId?.[id] || {};
  const init = { nick: m.name, grade: m.grade || '', joined: m.joined || '', name: inSheet ? p.realName || '' : m.realName || '', birth: p.birth || '', phone: p.phone || '',
    staffV: !!m.staffV, staffHist: m.staffHist || '', absent: m.absent || '', reason: p.absReason || '', absFrom: m.absFrom || '', absTo: m.absTo || '' };
  const absOpts = [...new Set(['장불 1차', '장불 2차', ...S.members.map((x) => x.absent).filter(Boolean)])];
  const dis = inSheet && !canSheet ? 'disabled' : '';
  const grades = [...new Set([...GRADES, init.grade].filter(Boolean))];
  const { el, close } = modal(`${m.name} 회원 정보`, `<form class="stack medit">
    ${inSheet ? `<p class="medit-src">📗 통합 시트 › 회원 탭${m.sheetNo ? ` · 연번 ${esc(m.sheetNo)}` : ''}${canSheet ? ' — 저장하면 시트에도 바로 바뀌어요' : ''}</p>
      ${canSheet ? '' : '<p class="small err">이 기기에 통합 시트 연결 키가 없어서 시트 칸은 고칠 수 없어요. 회원 관리 위쪽에서 연결 키를 넣어 주세요.</p>'}` : '<p class="medit-src">시트에 없는 회원 — 앱에만 저장돼요</p>'}
    <div class="row"><label>닉네임<input name="nick" required value="${esc(init.nick)}" ${dis}></label>
      ${inSheet ? `<label>등급<select name="grade" ${dis}><option value="">-</option>${grades.map((g) => `<option ${g === init.grade ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>` : ''}</div>
    <div class="row">${inSheet ? `<label>가입일자<input type="date" name="joined" value="${esc(init.joined)}" ${dis}></label>` : ''}
      <label>이름<input name="name" value="${esc(init.name)}" ${dis} autocomplete="off"></label></div>
    ${inSheet ? `<div class="row"><label>생년월일<input type="date" name="birth" value="${esc(init.birth)}" ${dis}></label>
      <label>연락처<input type="tel" name="phone" value="${esc(init.phone)}" placeholder="010-0000-0000" ${dis} autocomplete="off"></label></div>
    <fieldset class="medit-box"><legend>운영진 이력</legend>
      <label class="inline"><input type="checkbox" name="staffV" ${init.staffV ? 'checked' : ''} ${dis}> 운영진 경력(V)</label>
      <input name="staffHist" value="${esc(init.staffHist)}" placeholder="예: 2015 운영진" ${dis}></fieldset>
    <fieldset class="medit-box"><legend>장기 불참</legend>
      <div class="row"><label>장불여부<input name="absent" list="abs-opts" value="${esc(init.absent)}" placeholder="-" ${dis}></label>
        <label>장불 사유<input name="reason" value="${esc(init.reason)}" ${dis}></label></div>
      <datalist id="abs-opts">${absOpts.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>
      <div class="row"><label>시작일자<input type="date" name="absFrom" value="${esc(init.absFrom)}" ${dis}></label>
        <label>해제일자<input type="date" name="absTo" value="${esc(init.absTo)}" ${dis}></label></div></fieldset>` : ''}
    <fieldset class="medit-box app"><legend>앱 설정</legend>
      <label>별칭 <span class="muted small">(카페 댓글에 쓰는 다른 이름 · 쉼표로 구분)</span><input name="aliases" value="${esc((m.aliases || []).join(', '))}"></label>
      <label class="inline"><input type="checkbox" name="staff" ${isStaff(m) ? 'checked' : ''}> 운영진</label></fieldset>
    <p class="err small" data-err hidden></p>
    <button class="btn full" data-save>저장</button></form>`);
  const form = el.querySelector('form'), err = el.querySelector('[data-err]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('[data-save]');
    const v = (n) => (form[n] ? (form[n].type === 'checkbox' ? form[n].checked : form[n].value.trim()) : init[n]);
    const nick = v('nick');
    if (!nick) return;
    if (nick !== m.name && taken(nick, id)) { err.hidden = false; err.textContent = '같은 닉네임(또는 별칭)의 회원이 이미 있어요'; return; }
    const aliasesIn = [...new Set(String(v('aliases')).split(',').map((x) => x.trim()).filter(Boolean))];
    btn.disabled = true; btn.textContent = '저장하는 중…'; err.hidden = true;
    try {
      const app = { staff: v('staff') };
      let aliases = aliasesIn;
      if (nick !== m.name) aliases = [...new Set([...aliases, m.name])];   // 예전 닉네임은 별칭으로 남겨 카페 댓글·지난 기록에서 계속 알아보게
      aliases = aliases.filter((a) => norm(a) !== norm(nick));
      if (inSheet) {
        const set = {};
        SHEET_F.forEach((f) => { if (form[f] && v(f) !== init[f]) set[f] = v(f); });
        if (Object.keys(set).length && canSheet) {
          const res = await saveMemberRow({ nick: m.name, no: m.sheetNo || '' }, set);
          // 닉네임을 바꿨으면 앱 회원도 먼저 새 닉네임으로 (다시 읽을 때 같은 사람으로 이어지게)
          await db.set('members/' + id, { ...app, aliases, ...(nick !== m.name ? { name: nick } : {}) }, { merge: true });
          await apply(await preview(res.rows), { by: 'manual' });
          toast(`${nick} 님 정보를 고쳤어요 · 통합 시트 회원 탭에도 반영됐어요`);
        } else {
          await db.set('members/' + id, { ...app, aliases }, { merge: true });
          toast('저장했어요');
        }
      } else {
        await db.set('members/' + id, { ...app, aliases, name: nick, realName: v('name') }, { merge: true });
        toast(`${nick} 님 정보를 고쳤어요`);
      }
      close(); render(root);
    } catch (x) {
      err.hidden = false; err.textContent = x.message || '저장하지 못했어요';
      btn.disabled = false; btn.textContent = '저장';
    }
  });
}

function addMember() {
  const { el, close } = modal('회원 추가', `<form class="stack">
    <label>닉네임 (카페 닉네임)<input name="name" required autofocus></label>
    <label>이름 <span class="muted small">(실명 · 선택)</span><input name="realName"></label>
    <label>별칭 <span class="muted small">(쉼표로 구분 · 선택)</span><input name="aliases"></label>
    <label class="inline"><input type="checkbox" name="staff"> 운영진</label>
    <p class="tiny muted">통합 시트 회원 탭에 있는 회원은 시트에 추가하면 자동으로 들어와요. 여기서는 시트에 없는 회원만 추가하세요.</p>
    <button class="btn">추가</button></form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const name = f.name.value.trim();
    if (taken(name)) return toast('같은 닉네임(또는 별칭)의 회원이 이미 있어요');
    await db.set('members/' + newId(), { name, realName: f.realName.value.trim(), aliases: f.aliases.value.split(',').map((s) => s.trim()).filter(Boolean),
      staff: f.staff.checked, active: true, createdAt: Date.now() });
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
    await Promise.all(names.map((name, i) => db.set('members/' + newId() + i, { name, aliases: [], active: true, createdAt: now })));
    toast(`${names.length}명을 추가했어요`); close();
  });
}

function exportCSV(rows) {
  const qv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const list = [...rows].sort((a, b) => koSort(a.name, b.name));
  const csv = '﻿' + [['닉네임', '등급', '운영진', '가입일자', '이름', '생년월일', '연락처', '운영진 이력', '장불여부', '장불 사유', '장불시작일자', '장불해제일자', '별칭', '출석', '출석률(%)', '최근 출석'],
    ...list.map((r) => [r.name, r.grade, r.staff ? 'O' : '', r.joined, r.realName, r.birth, r.phone, (r.staffV ? 'V ' : '') + r.staffHist, r.absent, r.p?.absReason || '', r.absFrom, r.absTo, r.aliases, r.att, r.rate, r.last])]
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
  const rows = S.members.filter((m) => !isRest(m) || rec.has(m.id))
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
      return `<li class="${isRest(m) ? 'rest' : ''}"><span class="rk">${i + 1}</span>
        <div class="am"><b>${esc(m.name)}</b><small class="muted">${a.last ? `최근 ${fmtDate(a.last, false)}` : '출석 기록 없음'}${a.streak > 1 ? ` · 🔥 ${a.streak}경기 연속` : ''}${isLeft(m) ? ' · 탈퇴' : m.active === false ? ' · 쉬는 회원' : ''}</small></div>
        <div class="att-rate"><div class="att-bar"><i style="width:${rate}%"></i></div><span>${a.att}회 · ${rate}%</span></div></li>`;
    }).join('')}</ol></section>`;
  body.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => { per = b.dataset.per; render(root); }));
}
