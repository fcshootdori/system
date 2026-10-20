// 회원 홈 — MATCH REVIEW(지난 경기) + NEXT MATCH(다음 경기)  (WD_FUTSAL 홈과 같은 구성)
import { S, memberById, me, go, mdPath, nameOf, playedDays, nextMatchday, captainMatchday, upcomingCancelled } from '../state.js';
import { db, newId } from '../store.js';
import { STATUS } from '../config.js';
import { applicants, rosters, draftState, fmtOf, totals, dayStandings, matchNumbers, explicitNo, noLabel, eventTeams, isOpen, closeLabel } from '../domain.js';
import { TEAM_COLORS } from '../config.js';
import { esc, fmtDate, todayISO, toast } from '../util.js';
import { norm } from '../cafe-parser.js';
import { modal, stepper, empty, teamLabel, teamChip } from '../ui.js';
import { formatFields, bindFormatFields, readFormat } from './format-form.js';

export function fmtSummary(md) {
  const f = fmtOf(md);
  const teams = [...Array(f.teams)].map((_, i) => teamLabel(md, i));
  const vs = f.teamMode === 'fixed' ? teams.join(' vs ') : `${f.teams}팀`;
  if (md?.source === 'sheet') return `${vs} · 승률계산기 기록`;
  return `${vs} · ${f.rounds}라운드${f.scoring === 'sum' ? ' 합산' : ''}`;
}

// 지난 경기 한 줄 요약 카드 (홈·일정에서 공용)
export function reviewCard(md) {
  const f = fmtOf(md);
  const games = S.games.filter((g) => g.matchdayId === md.id);
  const t = totals(md, games);
  let score = '';
  if (f.scoring === 'sum' && t.length === 2) {
    const res = (i) => (t[i] > t[1 - i] ? '<em class="res w">승</em>' : t[i] < t[1 - i] ? '<em class="res l">패</em>' : '<em class="res d">무</em>');
    score = `<div class="board mini"><div class="sb-team">${teamChip(md, 0)}${res(0)}</div>
      <div class="sb-score"><b>${t[0]}</b><span>:</span><b>${t[1]}</b></div><div class="sb-team">${teamChip(md, 1)}${res(1)}</div></div>`;
  } else {
    const st = dayStandings(md, games);
    score = `<ol class="mini-rank">${st.map((r, i) => `<li><b>${i + 1}</b>${teamChip(md, r.team)}<span>${r.w}승 ${r.d}무 ${r.l}패 · 승점 ${r.pts}</span></li>`).join('')}</ol>`;
  }
  const goals = {};
  games.forEach((g) => Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; }));
  const top = Object.entries(goals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `${score}
    <p class="review-meta">${(md.mom || []).length ? `<span><b class="mom">MOM</b> ${esc(md.mom.map((id) => nameOf(id, md)).join(', '))}</span>` : ''}
      ${top.length ? `<span>⚽ ${esc(top.map(([id, n]) => `${nameOf(id, md)}${n > 1 ? ' ' + n : ''}`).join(', '))}</span>` : ''}</p>`;
}

export function render(root) {
  const last = playedDays()[0];
  const md = nextMatchday();
  const capMd = captainMatchday();
  let dock = '';

  let next = `<section class="card">${empty('예정된 경기가 없어요.')}</section>`;
  if (md) {
    const f = fmtOf(md);
    const list = applicants(md);
    const nIn = list.filter((a) => !a.wait).length, nWait = list.length - nIn;
    const mine = list.find((a) => a.id === me.id);
    const ros = rosters(md);
    const myTeam = md.teams?.length ? ros.findIndex((ids) => ids.includes(me.id)) : -1;
    const ds = md.status === 'drafting' ? draftState(md) : null;
    const short = f.minPlayers && nIn < f.minPlayers ? f.minPlayers - nIn : 0;
    if (isOpen(md)) dock = `<div class="dock">${closeLabel(md) && !md.reopened ? `<p class="dock-dl">⏰ 신청 ${closeLabel(md)}</p>` : ''}<button class="btn full" data-go="apply/${md.id}">${mine ? (mine.wait ? `대기 ${mine.no}번 · 신청 현황` : `신청 완료 (${mine.no}번) · 신청 현황`) : '참가 신청하기'}</button></div>`;
    next = `<section class="card day">
      <div class="eyebrow">${[noLabel(md), STATUS[md.status]?.label].filter(Boolean).join(' · ')}</div>
      <h1>${fmtDate(md.date)}${md.time ? ` <small>${esc(md.time)}</small>` : ''}</h1>
      <p class="muted">${[md.venue, fmtSummary(md)].filter(Boolean).map(esc).join(' · ')}</p>
      ${isOpen(md) && closeLabel(md) && !md.reopened ? `<p class="small deadline">⏰ 신청 ${closeLabel(md)} · 최소 인원을 채워도 그때까지 받아요</p>` : ''}
      ${stepper(md.status)}
      ${md.note ? `<p class="note">${esc(md.note)}</p>` : ''}
      <div class="stats3">
        <div><b>${nIn}</b><span>참가${f.capacity ? ` / ${f.capacity}` : ''}</span></div>
        <div class="${short ? 'warn' : 'ok'}"><b>${short ? `-${short}` : '충족'}</b><span>최소 ${f.minPlayers || '-'}명</span></div>
        <div><b>${nWait}</b><span>대기</span></div>
      </div>
      ${me.id ? `<p class="mine">${esc(memberById(me.id)?.name || '')} · ${
        myTeam >= 0 ? `${teamChip(md, myTeam)} 팀이에요` : mine ? (mine.wait ? `대기 ${mine.no}번` : `신청 완료 (${mine.no}번)`) : '미신청'}</p>`
        : `<p class="mine muted">내 정보에서 이름을 고르면 신청할 수 있어요.</p>`}
      ${ds && ds.turn != null ? `<p class="mine">드래프트 중 · 지금 <b>${esc(nameOf(md.captains[ds.turn].id, md))}</b> 주장 차례</p>` : ''}
      <div class="row wrap">
        ${md.status !== 'open' ? `<button class="btn ghost" data-go="apply/${md.id}">신청 명단</button>` : ''}
        ${md.teams?.length ? `<button class="btn ghost" data-go="draft/${md.id}">팀 구성 보기</button>` : ''}
        ${md.status === 'teams' && S.games.some((g) => g.matchdayId === md.id) ? `<button class="btn ghost" data-go="mm">⚽ 경기모드</button>` : ''}
      </div>
    </section>`;
  }

  const cancels = upcomingCancelled();
  root.innerHTML = `
    ${cancels.map((c) => `<a class="card cancel-strip" href="#/sched"><b>${fmtDate(c.date)} 경기 취소</b>${c.cancelReason ? ` · ${esc(c.cancelReason)}` : ''}</a>`).join('')}
    ${capMd ? `<a class="card cap-strip" href="#/draft">👑 <b>${fmtDate(capMd.date)} 드래프트</b>에 주장으로 참여 중이에요 — 입장하기 ›</a>` : ''}
    <div class="homegrid">
      <div>
        <div class="sec-lab"><span>MATCH REVIEW</span>${last ? `<small>${[noLabel(last), fmtDate(last.date)].filter(Boolean).join(' · ')}</small>` : ''}</div>
        ${last ? `<a class="card review" href="#/games/${last.id}">${reviewCard(last)}<span class="more">결과 자세히 ›</span></a>`
          : `<section class="card">${empty('아직 끝난 경기가 없어요.')}</section>`}
      </div>
      <div>
        <div class="sec-lab"><span>NEXT MATCH</span></div>
        ${next}
        ${S.team.cafeUrl ? `<a class="card link-card" href="${esc(S.team.cafeUrl)}" target="_blank" rel="noopener">다음 카페 바로가기 ↗</a>` : ''}
      </div>
    </div>
    ${dock}`;
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}

// 경기일 만들기·수정 (운영 일정 메뉴에서 사용)
export function editMatchday(md, presetDate) {
  const isNew = !md;
  const f = fmtOf(md);
  const t0 = parseTime(md?.time) || (isNew ? lastTime() : ['', '']);
  const ev0 = eventTeams(md);
  const custom = !!md?.format;
  const { el, close } = modal(isNew ? '경기 추가' : '경기일 수정', `
    <form class="stack">
      <div class="row">
        <label>날짜<input type="date" name="date" required value="${esc(md?.date || presetDate || todayISO())}"></label>
        <label>회차<input type="number" name="no" min="1" inputmode="numeric" value="${md?.no ?? ''}" placeholder="자동"></label>
      </div>
      <p class="tiny muted no-hint" data-nohint></p>
      <label class="inline"><input type="checkbox" name="noExclude" ${md?.noExclude ? 'checked' : ''}> 회차에서 제외 <small class="muted">(친선 경기 등)</small></label>
      <div class="fld"><span class="fl">경기 종류</span>
        <div class="seg kind-seg"><button type="button" data-kind="normal">일반 경기</button><button type="button" data-kind="event">이벤트 경기</button></div>
        <div class="ev-teams" data-evteams>
          <div class="seg kind-seg ev-mode"><button type="button" data-emode="captains">주장만 미리 정함</button><button type="button" data-emode="teams">팀원까지 미리 정함</button></div>
          ${[0, 1].map((i) => `<div class="ev-team">
          <div class="row ev-row">
            <label>${i ? '오른쪽' : '왼쪽'} 팀 이름<input name="evn${i}" placeholder="예: ${i ? '준찬팀' : '지진희팀'}" value="${esc(ev0?.[i]?.name || '')}"></label>
            <label>색<select name="evc${i}">${TEAM_COLORS.filter((c) => ['pink', 'blue'].includes(c.key)).map((c) => `<option value="${c.key}" ${(ev0?.[i]?.color || ['pink', 'blue'][i]) === c.key ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label></div>
          <label>주장 <span class="muted small" data-caphint></span><input name="evk${i}" list="ev-members" autocomplete="off" placeholder="카페 닉네임" value="${esc(ev0?.[i]?.captain ? nameOf(ev0[i].captain) : '')}"></label></div>`).join('')}
          <datalist id="ev-members">${S.members.filter((m) => m.active !== false).map((m) => `<option value="${esc(m.name)}">`).join('')}</datalist>
        </div>
        <p class="tiny muted" data-kindhint></p>
      </div>
      <div class="row time-row">
        <label>시작<select name="t1">${timeOpts(t0[0])}</select></label>
        <span class="tilde">~</span>
        <label>종료<select name="t2">${timeOpts(t0[1])}</select></label>
      </div>
      <label>장소<input name="venue" list="venue-list" placeholder="구장 이름" value="${esc(md?.venue || '')}" autocomplete="off">
        <datalist id="venue-list">${venues().map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label>
      <label>메모<textarea name="note" rows="2" placeholder="회비, 준비물 등">${esc(md?.note || '')}</textarea></label>
      <div class="fld"><span class="fl">진행 상태</span>
        <input type="hidden" name="status" value="${esc(md?.status || 'open')}">
        <ol class="stage-pick">${Object.entries(STATUS).map(([k, v]) => `<li><button type="button" data-st="${k}"><i>${v.step}</i><span>${v.label}</span></button></li>`).join('')}</ol></div>
      <details ${custom ? 'open' : ''}><summary>이날 경기 방식 <span class="muted small">${custom ? '(이날만 변경됨)' : '(기본값 사용 중)'}</span></summary>
        ${formatFields(f)}
        ${custom ? '<label class="inline"><input type="checkbox" name="reset"> 기본 경기 방식으로 되돌리기</label>' : ''}
      </details>
      <button class="btn">${isNew ? '추가' : '저장'}</button>
    </form>`);
  const form = el.querySelector('form');
  bindFormatFields(form);
  // 경기 종류: 일반 / 이벤트(팀 미리 지정)
  let kind = ev0 ? 'event' : 'normal';
  let emode = ev0 && md?.eventMode === 'captains' ? 'captains' : ev0 ? 'teams' : 'captains';
  const paintKind = () => {
    form.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
    form.querySelectorAll('[data-emode]').forEach((b) => b.classList.toggle('on', b.dataset.emode === emode));
    form.querySelector('[data-evteams]').classList.toggle('hide', kind !== 'event');
    form.querySelectorAll('[data-caphint]').forEach((x) => { x.textContent = emode === 'captains' ? '(필수)' : '(선택)'; });
    form.querySelector('[data-kindhint]').textContent = kind !== 'event'
      ? '신청(참석·불참·협의) → 마감 후 주장 선정 → 드래프트(팀 색 배정 · 우선순위 추첨 · 선수 선택) → 팀 확정'
      : emode === 'captains'
        ? '주장만 미리 정하는 이벤트 경기: 신청은 일반 경기처럼 받고, 마감 뒤 주장 선정 단계 없이 이 주장들로 드래프트를 해요. (주장 단계 생략)'
        : '팀원까지 미리 정하는 이벤트 경기: 회원이 팀을 골라(또는 운영진이 넣어 둔 팀에서) 참석·불참을 정하고, 참석자 그대로 팀을 확정해요. (주장·드래프트 단계 생략)';
  };
  form.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; paintKind(); }));
  form.querySelectorAll('[data-emode]').forEach((b) => b.addEventListener('click', () => { emode = b.dataset.emode; paintKind(); }));
  paintKind();
  // 진행 상태: 가로 단계에서 골라 저장
  const paintStage = () => {
    const cur = STATUS[form.status.value]?.step || 1;
    form.querySelectorAll('[data-st]').forEach((b) => {
      const s = STATUS[b.dataset.st].step;
      b.className = s < cur ? 'done' : s === cur ? 'now' : '';
    });
  };
  form.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { form.status.value = b.dataset.st; paintStage(); }));
  paintStage();
  // 시작 시간을 고르면 종료는 2시간 뒤로 맞춰 줌 (종료가 시작보다 빠를 때)
  form.t1.addEventListener('change', () => {
    if (!form.t1.value) return;
    if (!form.t2.value || form.t2.value <= form.t1.value) {
      const [h, m] = form.t1.value.split(':').map(Number); const e = Math.min(h + 2, 23);
      form.t2.value = `${String(e).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  });
  // 회차 미리보기: 비워 두면 앞뒤 경기 기준으로 자동
  const hint = () => {
    const probe = { ...(md || {}), id: md?.id || '__new', date: form.date.value, no: form.no.value === '' ? null : +form.no.value,
      noExclude: form.noExclude.checked, cancelled: md?.cancelled, createdAt: md?.createdAt || Date.now() };
    const others = md ? null : probe;
    const nums = md ? (() => { const keep = S.matchdays; S.matchdays = keep.map((m) => (m.id === md.id ? probe : m)); const r = matchNumbers(); S.matchdays = keep; return r; })() : matchNumbers(others);
    const n = nums.get(probe.id);
    const box = form.querySelector('[data-nohint]');
    if (probe.cancelled) box.textContent = `취소된 경기는 회차를 쓰지 않고, 다음 경기와 같은 회차${n ? `(${n.no}회)` : ''}로 표시돼요.`;
    else if (probe.noExclude) box.textContent = '회차에 들어가지 않고, 다음 경기부터 이어서 매겨져요.';
    else if (form.no.value !== '') box.textContent = `${form.no.value}회로 지정 — 앞뒤 경기 회차가 이 번호를 기준으로 자동으로 맞춰져요.`;
    else box.textContent = n ? `자동: ${n.no}회 (앞뒤 경기 기준)` : '회차를 한 번 입력하면 앞뒤 경기는 자동으로 매겨져요.';
    form.no.placeholder = n && form.no.value === '' ? `자동 ${n.no}` : '자동';
  };
  ['input', 'change'].forEach((ev) => form.addEventListener(ev, (e) => { if (['date', 'no', 'noExclude'].includes(e.target.name)) hint(); }));
  hint();
  let touched = false;
  form.querySelector('details').addEventListener('change', () => { touched = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const time = form.t1.value ? (form.t2.value ? `${form.t1.value}~${form.t2.value}` : form.t1.value) : '';
    let evData = { event: false };
    if (kind === 'event') {
      // 주장: 카페 닉네임·별칭으로 회원 찾기
      const findM = (v) => { const k = norm(v); return k ? S.members.find((m) => norm(m.name) === k) || S.members.find((m) => (m.aliases || []).some((a) => norm(a) === k)) : null; };
      const caps = [0, 1].map((i) => form['evk' + i].value.trim());
      const capIds = caps.map((v) => (v ? findM(v)?.id || '' : ''));
      const bad = caps.findIndex((v, i) => v && !capIds[i]);
      if (bad >= 0) return toast(`"${caps[bad]}" — 회원 목록에 없는 닉네임이에요`);
      if (emode === 'captains' && capIds.some((x) => !x)) return toast('주장만 미리 정하는 경기는 두 팀 주장을 모두 넣어 주세요');
      if (capIds[0] && capIds[0] === capIds[1]) return toast('두 팀 주장이 같아요');
      const teams = [0, 1].map((i) => ({ name: form['evn' + i].value.trim(), color: form['evc' + i].value, captain: capIds[i] || null, members: ev0?.[i]?.members || [] }));
      if (teams.some((t) => !t.name)) return toast('이벤트 경기는 두 팀 이름을 넣어 주세요');
      if (teams[0].color === teams[1].color) return toast('두 팀 색을 다르게 골라 주세요');
      evData = { event: true, eventMode: emode, eventTeams: teams, teamNames: teams.map((t) => t.name) };
    } else if (ev0) evData = { event: false, eventMode: null, eventTeams: null, teamNames: null };   // 이벤트 → 일반으로 바꿈
    else evData = md?.event === undefined ? {} : { event: false };
    const base = { ...evData, date: form.date.value, time, venue: form.venue.value.trim(), note: form.note.value, status: form.status.value,
      no: form.no.value === '' ? null : +form.no.value, noExclude: form.noExclude.checked };
    let format = md?.format || null;
    if (form.reset?.checked) format = null;
    else if (touched) format = readFormat(form);
    if (isNew) {
      const id = newId();
      await db.set(mdPath(id), { ...base, format, apps: {}, guests: {}, captains: [], picks: [], teams: [], mom: [], late: {}, createdAt: Date.now() });
      S.sel = id; S.step = null;
      toast('경기를 추가했어요 — 신청을 받을 수 있어요');
    } else {
      await db.set(mdPath(md.id), { ...base, format }, { merge: true }); toast('저장했어요');
    }
    close();
  });
}

// 경기 취소 / 취소 철회 (운영진) — 취소해도 일정에는 남고 "경기 취소"로 표시
const REASONS = ['우천', '구장 사정', '인원 부족', '운영진 사정'];
export function cancelMatchday(md) {
  if (md.cancelled) {
    if (!confirm(`${fmtDate(md.date)} 경기 취소를 철회하고 원래대로 되돌릴까요?`)) return;
    db.set(mdPath(md.id), { cancelled: false, cancelReason: '', cancelledAt: null }, { merge: true }).then(() => toast('경기 취소를 철회했어요'));
    return;
  }
  const { el, close } = modal('경기 취소', `<form class="stack">
    <p class="small">${fmtDate(md.date)}${md.time ? ' ' + esc(md.time) : ''} ${esc(md.venue || '')} 경기를 취소해요. 일정에는 남고 "경기 취소"로 표시되며, 신청 명단은 그대로 보관돼요.</p>
    <div class="chips">${REASONS.map((r) => `<button type="button" class="xchip" data-r="${r}">${r}</button>`).join('')}</div>
    <label>취소 사유 (선택)<input name="reason" placeholder="예: 우천으로 구장 폐쇄"></label>
    <button class="btn danger-fill">경기 취소</button></form>`);
  el.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { el.querySelector('[name=reason]').value = b.dataset.r; }));
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.set(mdPath(md.id), { cancelled: true, cancelReason: e.target.reason.value.trim(), cancelledAt: Date.now() }, { merge: true });
    close(); toast(`${fmtDate(md.date)} 경기를 취소로 표시했어요`);
  });
}

// ── 시간 선택 (30분 단위) ──
const TIMES = (() => { const a = []; for (let h = 5; h <= 23; h++) for (const m of [0, 30]) a.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`); return a; })();
function timeOpts(sel) {
  const list = sel && !TIMES.includes(sel) ? [...TIMES, sel].sort() : TIMES;
  return `<option value="">미정</option>${list.map((t) => `<option value="${t}" ${t === sel ? 'selected' : ''}>${t}</option>`).join('')}`;
}
function parseTime(s) {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})(?:\s*[~\-–]\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const f = (h, mm) => `${String(+h).padStart(2, '0')}:${mm}`;
  return [f(m[1], m[2]), m[3] ? f(m[3], m[4]) : ''];
}
// 새 경기 기본 시간 = 가장 최근에 등록한 경기의 시간 (없으면 07:00~09:00)
function lastTime() {
  const m = [...S.matchdays].filter((x) => x.source !== 'sheet' && x.time).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  return parseTime(m?.time) || ['07:00', '09:00'];
}
// 예전에 쓴 구장 이름 (자주 쓴 순)
function venues() {
  const c = new Map();
  S.matchdays.forEach((m) => { if (m.venue) c.set(m.venue, (c.get(m.venue) || 0) + 1); });
  return [...c].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 12);
}
