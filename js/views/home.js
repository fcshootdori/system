// 회원 홈 — 경기장 사진 첫 화면(다음 경기 한 줄) + 참석 카드(바로 참석·불참) + MOM 알림 + 지난 경기 카드
import { sheetPending } from '../record-sheet.js?v=0.1.73';
import { momAsks, momStrip } from './mom.js?v=0.1.73';
import { S, memberById, me, go, mdPath, nameOf, playedDays, nextMatchday, captainMatchday, upcomingCancelled } from '../state.js?v=0.1.73';
import { db, newId } from '../store.js?v=0.1.73';
import { STATUS } from '../config.js?v=0.1.73';
import { applicants, rosters, draftState, fmtOf, totals, teamColor, dayStandings, matchNumbers, explicitNo, noLabel, eventTeams, isOpen, closeLabel, signupView, captainIds, evCaps } from '../domain.js?v=0.1.73';
import { icon } from '../icons.js?v=0.1.73';
import { inSandbox, sandboxRole } from '../sandbox.js?v=0.1.73';
import { myBox, bindMy } from './apply.js?v=0.1.73';
import { TEAM_COLORS, DEFAULT_SLOT } from '../config.js?v=0.1.73';
import { esc, fmtDate, todayISO, toast } from '../util.js?v=0.1.73';
import { norm } from '../cafe-parser.js?v=0.1.73';
import { modal, stepper, empty, teamLabel, teamChip } from '../ui.js?v=0.1.73';
import { formatFields, bindFormatFields, readFormat } from './format-form.js?v=0.1.73';

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

// 다음 경기 티켓: 날짜·시간·장소·D-day · 참석 현황 · 내 참석/불참 (티켓에서 바로)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function dday(date) {
  const a = new Date(todayISO() + 'T00:00:00'), b = new Date(date + 'T00:00:00');
  const n = Math.round((b - a) / 864e5);
  return n === 0 ? '오늘' : n > 0 ? `D-${n}` : '지난 경기';
}
// 구장 이름에서 부르기 좋은 장소 이름만: "서울 어린이대공원 잔디축구장" → "어린이대공원", "보라매공원 인조잔디 축구장" → "보라매공원"
const REGION = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|특별자치시|특별자치도|시|도)?$|^\S{1,4}(시|군|구)$/;
const FIELD = /(인조잔디|천연잔디|잔디)?(축구장|풋살장|운동장|경기장|구장)$/;
export function placeName(venue) {
  const ws = String(venue || '').trim().split(/\s+/).filter(Boolean);
  while (ws.length > 1 && REGION.test(ws[0])) ws.shift();
  const w = ws[0] || '', cut = w.replace(FIELD, '');
  return /공원$/.test(cut) ? cut : w;   // "어린이대공원잔디축구장"은 공원까지, "효창운동장"은 그대로
}
// 홈 첫 화면 문구: "10월 24일 (토) 14:00 / 어린이대공원에서 만나요" — 시작 시간을 날짜 옆에
function headline(md) {
  const d = new Date(md.date + 'T00:00:00');
  const start = parseTime(md.time)?.[0];
  const l1 = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  const place = placeName(md.venue);
  const l2 = md.cancelled ? '이 경기는 취소됐어요' : place ? `${place}에서 만나요` : '경기장에서 만나요';
  return `<span class="h2-when">${esc(l1)}${start ? ` <b class="h2-time">${esc(start)}</b>` : ''}</span><br>${esc(l2)}`;
}

// 다음 경기 참석 카드: 참석 인원 · 마감 · 시간·장소 · 내 참석/불참 · 명단·팀·포지션 바로가기
function ticket(md) {
  const f = fmtOf(md);
  const list = applicants(md);
  const nIn = list.filter((a) => !a.wait).length;
  const min = f.minPlayers || 0;
  const pct = min ? Math.min(100, Math.round((nIn / min) * 100)) : 100;
  const ros = rosters(md);
  const myTeam = md.teams?.length ? ros.findIndex((ids) => ids.includes(me.id)) : -1;
  const ds = md.status === 'drafting' ? draftState(md) : null;
  const open = isOpen(md);
  const v = signupView(md);
  const [t1, t2] = String(md.time || '').split('~');
  const amCap = [0, 1].some((i) => captainIds(md, i).includes(me.id));
  return `<section class="card att" aria-label="다음 경기 참석">
    <div class="att-top">
      <div class="att-n"><b>${nIn}</b><span>${min ? `/ ${min}명 참석` : '명 참석'}</span></div>
      <span class="att-st ${open && closeLabel(md) && !md.reopened ? 'dl' : ''}">${open && closeLabel(md) && !md.reopened ? esc(closeLabel(md)) : esc(STATUS[md.status]?.label || '')}</span>
    </div>
    <div class="att-bar ${min && nIn >= min ? 'ok' : ''}"><i style="width:${pct}%"></i></div>
    <p class="att-info">${md.time ? `<span>${icon('clock')}${esc(t1)}${t2 ? `–${esc(t2)}` : ''}</span>` : ''}${md.venue ? `<span>${icon('pin')}${esc(md.venue)}</span>` : ''}<span>${icon('flag')}${esc(fmtSummary(md))}</span></p>
    ${md.note ? `<p class="tk-note">${esc(md.note)}</p>` : ''}
    ${myTeam >= 0 ? `<p class="tk-me">내 팀 ${teamChip(md, myTeam)}</p>`
      : open ? `<div class="tk-reply">${myBox(md, v, open)}</div>`
      : `<p class="tk-me">${md.cancelled ? '취소된 경기예요' : '신청이 마감됐어요'}${(md.apps || {})[me.id] ? ' · 나는 참석' : ''}</p>`}
    ${ds && ds.turn != null ? `<p class="tk-me">드래프트 중 · 지금 <b>${esc(nameOf(md.captains[ds.turn].id, md))}</b> 주장 차례</p>` : ''}
    <div class="tk-links">
      <button class="btn ghost sm" data-go="apply/${md.id}">${icon('users')}신청 명단</button>
      ${md.teams?.length || md.status === 'drafting' ? `<button class="btn ghost sm" data-go="draft/${md.id}">${icon('shirt')}${md.teams?.length ? '팀 구성' : '드래프트 보기'}</button>` : ''}
      ${md.teams?.length && md.status !== 'played' ? `<button class="btn ${amCap ? '' : 'ghost'} sm" data-go="mm">${icon('field')}${amCap ? '포지션 정하기' : '경기모드'}</button>` : ''}
    </div>
  </section>`;
}

// 지난 경기 카드 — 경기기록과 같은 모양 (팀 색 점수 막대 · VS · 라운드 점수 · MOM · 득점)
const hexOfTeam = (md, i) => TEAM_COLORS.find((c) => c.key === teamColor(md, i)) || { hex: '#64748b', text: '#ffffff' };
function lastCard(md) {
  const f = fmtOf(md), games = S.games.filter((g) => g.matchdayId === md.id), done = games.filter((g) => g.done);
  const head = `<div class="lg-hd"><span><b>지난 경기</b> · ${esc([noLabel(md), fmtDate(md.date)].filter(Boolean).join(' '))}</span>`;
  if (f.teams !== 2) return `<a class="card lgame" href="#/games/${md.id}">${head}</div>${reviewCard(md)}</a>`;
  // 두 팀 경기는 경기기록 화면과 같이 라운드 득점 합계로 승패를 보여요
  const t = [0, 0];
  done.forEach((g) => { t[g.a ?? 0] += +g.sa || 0; t[g.b ?? 1] += +g.sb || 0; });
  const win = t[0] > t[1] ? 0 : t[0] < t[1] ? 1 : -1;
  const hx = [0, 1].map((i) => hexOfTeam(md, i));
  const goals = {};
  done.forEach((g) => Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; }));
  const top = Object.entries(goals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const ink = (h) => (h.text === '#ffffff' ? h.hex : '#121633');
  const rounds = done.slice().sort((a, b) => (a.round || 0) - (b.round || 0));
  return `<a class="card lgame" href="#/games/${md.id}">${head}
      ${win < 0 ? '<span class="lg-tag d">무승부</span>' : `<span class="lg-tag" style="--tc:${hx[win].hex}">${esc(teamLabel(md, win))} 승</span>`}</div>
    <div class="lg-bar">${[0, 1].map((i) => `<div class="lg-t ${i ? 'b' : 'a'} ${win === 1 - i ? 'lose' : ''}" style="--tc:${hx[i].hex};--ti:${hx[i].text}"><span>${esc(teamLabel(md, i))}</span><b>${t[i]}</b></div>`).join('')}<i class="lg-vs">VS</i></div>
    ${rounds.length > 1 ? `<div class="lg-rounds">${rounds.map((g) => `<span><small>${g.round}R</small><b><em style="color:${ink(hx[g.a])}">${g.sa}</em>:<em style="color:${ink(hx[g.b])}">${g.sb}</em></b></span>`).join('')}</div>` : ''}
    <p class="lg-meta">${(md.mom || []).length ? `<span><b class="mom">★ MOM</b> ${esc(md.mom.map((id) => nameOf(id, md)).join(', '))}</span>` : ''}${top.length ? `<span>⚽ ${esc(top.map(([id, n]) => `${nameOf(id, md)}${n > 1 ? ' ' + n : ''}`).join(' · '))}</span>` : ''}</p>
  </a>`;
}

export function render(root) {
  const last = playedDays()[0];
  const md = nextMatchday();
  const capMd = captainMatchday();
  const cancels = upcomingCancelled();
  root.innerHTML = `
    <section class="hero2" aria-label="다음 경기">
      <div class="h2-in">
        ${md ? `<div class="h2-meta"><span class="h2-dd">${dday(md.date)}</span>${noLabel(md) ? `<span>${esc(noLabel(md))}</span>` : ''}</div>
          <h1>${headline(md)}</h1>` : '<h1>다음 경기를<br>준비하고 있어요</h1>'}
        <a class="h2-link" href="#/sched">전체 일정 ${icon('chevron')}</a>
      </div>
    </section>
    ${md ? ticket(md) : '<section class="card att empty-t"><p class="muted">운영진이 다음 경기를 올리면 여기에서 바로 참석을 정할 수 있어요.</p></section>'}
    ${inSandbox() ? `<section class="card beta-entry sbx"><div><b>🧪 ${sandboxRole() === 'captain' ? '주장' : '일반 회원'} 화면 체험 중</b><p class="small muted">${sandboxRole() === 'captain'
      ? '내가 주장인 체험 경기가 있어요. 위쪽 <b>👑 드래프트</b> 버튼으로 팀 색 고르기·우선순위 추첨·선수 뽑기를 하고, <b>경기</b> 탭에서 라운드별 포지션을 정해 보세요.'
      : '다음 경기에서 <b>참석·불참</b>을 눌러 보고, <b>경기</b> 탭에서 우리 팀 포지션·실시간 점수를, <b>기록</b> 탭에서 기록을 확인해 보세요.'}</p></div>
      <a class="btn ghost sm" href="#/sched">체험 경기 보기</a></section>` : ''}
    ${cancels.map((c) => `<a class="card cancel-strip" href="#/sched"><b>${fmtDate(c.date)} 경기 취소</b>${c.cancelReason ? ` · ${esc(c.cancelReason)}` : ''}</a>`).join('')}
    ${momAsks().map(momStrip).join('')}
    ${capMd ? `<a class="card cap-strip" href="#/draft">${icon('crown')}<span><b>${fmtDate(capMd.date)} 드래프트</b>에 주장으로 참여 중이에요</span>${icon('chevron')}</a>` : ''}
    ${last ? lastCard(last) : `<section class="card">${empty(sheetPending() ? '지난 경기를 불러오는 중이에요…' : '아직 끝난 경기가 없어요.')}</section>`}`;
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  if (md) bindMy(root, md);
}

// 경기일 만들기·수정 (운영 일정 메뉴에서 사용)
export function editMatchday(md, presetDate) {
  const isNew = !md;
  const f = fmtOf(md);
  const t0 = parseTime(md?.time) || (isNew ? DEFAULT_SLOT.time : ['', '']);
  const ev0 = eventTeams(md);
  const custom = !!md?.format;
  const { el, close } = modal(isNew ? '경기 추가' : '경기일 수정', `
    <form class="stack">
      <div class="row">
        <label>날짜<input type="date" name="date" required value="${esc(md?.date || (presetDate && !S.matchdays.some((m) => m.date === presetDate && !m.cancelled) ? presetDate : nextFreeDay()))}"></label>
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
            <label>${i ? '오른쪽' : '왼쪽'} 팀 이름<input name="evn${i}" value="${esc(ev0?.[i]?.name || '')}"></label>
            <label>색<select name="evc${i}">${TEAM_COLORS.filter((c) => ['pink', 'blue'].includes(c.key)).map((c) => `<option value="${c.key}" ${(ev0?.[i]?.color || ['pink', 'blue'][i]) === c.key ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label></div>
          <label>주장 <span class="muted small" data-caphint></span><input name="evk${i}" autocomplete="off" placeholder="여러 명은 쉼표로 구분" value="${esc(evCaps(ev0?.[i]).map((c) => nameOf(c)).join(', '))}"></label>
          <p class="cap-check tiny" data-capchk="${i}"></p>
          <div class="ev-mem" data-evmem="${i}"></div></div>`).join('')}
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
    form.querySelectorAll('[data-caphint]').forEach((x) => { x.textContent = emode === 'captains' ? '(필수 · 2명 이상 가능)' : '(선택 · 2명 이상 가능)'; });
    form.querySelector('[data-kindhint]').textContent = kind !== 'event'
      ? '신청(참석·불참·협의) → 마감 후 주장 선정 → 드래프트(팀 색 배정 · 우선순위 추첨 · 선수 선택) → 팀 확정'
      : emode === 'captains'
        ? '주장만 미리 정하는 이벤트 경기: 신청은 일반 경기처럼 받고, 마감 뒤 주장 선정 단계 없이 이 주장들로 드래프트를 해요. (주장 단계 생략)'
        : '팀원까지 미리 정하는 이벤트 경기: 두 팀 명단을 모두 넣어 경기를 만들어요. 회원은 홈에서 참석·불참만 누르고, 참석자 그대로 팀이 확정돼요. (주장·드래프트 단계 생략)';
    form.querySelectorAll('[data-evmem]').forEach((x) => x.classList.toggle('hide', emode !== 'teams'));
    paintMembers();
  };
  // 주장 칸: 쉼표로 여러 명 — 입력하는 동안 회원 목록과 맞는지 바로 표시
  const findCap = (v) => { const k = norm(v); return k ? S.members.find((m) => norm(m.name) === k) || S.members.find((m) => (m.aliases || []).some((a) => norm(a) === k)) : null; };
  const paintCaps = () => form.querySelectorAll('[data-capchk]').forEach((p) => {
    const names = capNames(form['evk' + p.dataset.capchk].value);
    p.innerHTML = names.map((n) => { const m = findCap(n); return m ? `<span class="ok-t">👑 ${esc(m.name)}</span>` : `<span class="warn-t">✕ ${esc(n)} (회원 목록에 없음)</span>`; }).join(' ');
  });
  form.addEventListener('input', (e) => { if (/^evk\d$/.test(e.target.name)) paintCaps(); });
  paintCaps();
  // 팀원까지 미리 정하는 경기: 팀별 명단
  const evMembers = [0, 1].map((i) => [...(ev0?.[i]?.members || [])]);
  const paintMembers = () => form.querySelectorAll('[data-evmem]').forEach((box) => {
    const i = +box.dataset.evmem, ids = evMembers[i];
    box.innerHTML = `<div class="ev-mem-hd"><b>팀원 ${ids.length}명</b><button type="button" class="btn ghost sm" data-pick="${i}">${ids.length ? '팀원 고치기' : '팀원 넣기'}</button></div>
      ${ids.length ? `<p class="ev-mem-list">${ids.map((id) => esc(nameOf(id))).join(', ')}</p>` : '<p class="tiny muted">회원 목록에서 고르거나 카페 닉네임을 붙여넣어요.</p>'}`;
    box.querySelector('[data-pick]').addEventListener('click', () => pickMembers(i, evMembers, () => form['evn' + i].value.trim() || `${i ? '오른쪽' : '왼쪽'} 팀`, paintMembers));
  });
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
      const caps = [0, 1].map((i) => capNames(form['evk' + i].value));
      const bad = caps.flat().find((v) => !findM(v));
      if (bad) return toast(`"${bad}" — 회원 목록에 없는 닉네임이에요`);
      const capIds = caps.map((l) => [...new Set(l.map((v) => findM(v).id))]);
      if (emode === 'captains' && capIds.some((x) => !x.length)) return toast('주장만 미리 정하는 경기는 두 팀 주장을 모두 넣어 주세요');
      const both = capIds[0].find((x) => capIds[1].includes(x));
      if (both) return toast(`${nameOf(both)} — 두 팀 주장에 모두 들어 있어요`);
      const teams = [0, 1].map((i) => ({ name: form['evn' + i].value.trim(), color: form['evc' + i].value, captain: capIds[i][0] || null, captains: capIds[i],
        members: emode === 'teams' ? [...new Set([...capIds[i], ...evMembers[i].filter((x) => !capIds[1 - i].includes(x))])] : [] }));
      if (emode === 'teams' && teams.some((t) => !t.members.length)) return toast('팀원까지 미리 정하는 경기는 두 팀 팀원을 모두 넣어 주세요');
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

const capNames = (v) => String(v || '').split(/[,，、/]+/).map((x) => x.trim()).filter(Boolean);

// 이벤트 경기 팀원 고르기: 회원 목록에서 누르거나 카페 닉네임을 붙여넣기 (다른 팀에 있던 사람은 이 팀으로 옮김)
function pickMembers(i, evMembers, nameFn, done) {
  const sel = new Set(evMembers[i]), other = new Set(evMembers[1 - i]);
  const findM = (v) => { const k = norm(v); return k ? S.members.find((m) => norm(m.name) === k) || S.members.find((m) => (m.aliases || []).some((a) => norm(a) === k)) : null; };
  const list = S.members.filter((m) => m.active !== false || sel.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const { el, close } = modal(`${nameFn()} 팀원`, `<div class="stack pick-mem">
    <input data-q placeholder="닉네임 검색" autocomplete="off">
    <details><summary>카페 닉네임 붙여넣기</summary><textarea data-paste rows="3" placeholder="쉼표·줄바꿈으로 여러 명"></textarea>
      <button type="button" class="btn ghost sm" data-addpaste>명단에 넣기</button><p class="tiny" data-pastemsg></p></details>
    <p class="small"><b data-n></b> · <span class="muted">다른 팀 표시가 있는 사람을 누르면 이 팀으로 옮겨요</span></p>
    <div class="name-grid pick-grid" data-grid></div>
    <button type="button" class="btn full" data-ok>완료</button></div>`);
  const grid = el.querySelector('[data-grid]');
  const paint = () => {
    const q = norm(el.querySelector('[data-q]').value);
    grid.innerHTML = list.filter((m) => !q || norm(m.name).includes(q) || sel.has(m.id)).map((m) => `<button type="button" class="name-btn ${sel.has(m.id) ? 'on' : ''} ${other.has(m.id) ? 'other' : ''}" data-id="${m.id}">${esc(m.name)}${other.has(m.id) ? '<small>다른 팀</small>' : ''}</button>`).join('');
    el.querySelector('[data-n]').textContent = `${sel.size}명 선택`;
  };
  grid.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; const id = b.dataset.id;
    if (sel.has(id)) sel.delete(id); else { sel.add(id); other.delete(id); } paint(); });
  el.querySelector('[data-q]').addEventListener('input', paint);
  el.querySelector('[data-addpaste]').addEventListener('click', () => {
    const names = el.querySelector('[data-paste]').value.split(/[,\n·/]+/).map((x) => x.trim()).filter(Boolean);
    const miss = [];
    names.forEach((n) => { const m = findM(n); if (m) { sel.add(m.id); other.delete(m.id); } else miss.push(n); });
    el.querySelector('[data-pastemsg]').innerHTML = miss.length ? `<span class="warn-t">회원 목록에 없는 닉네임: ${esc(miss.join(', '))}</span>` : `<span class="ok-t">${names.length}명을 넣었어요</span>`;
    paint();
  });
  el.querySelector('[data-ok]').addEventListener('click', () => {
    evMembers[i] = list.filter((m) => sel.has(m.id)).map((m) => m.id).concat([...sel].filter((id) => !list.some((m) => m.id === id)));
    evMembers[1 - i] = evMembers[1 - i].filter((id) => other.has(id));
    close(); done();
  });
  paint();
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
    <label>취소 사유 (선택)<input name="reason"></label>
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
// 새 경기 기본값 = 토요일 14:00~16:00 (대부분의 경기) — 날짜는 아직 경기가 없는 가장 가까운 토요일
function nextFreeDay() {
  const taken = new Set(S.matchdays.filter((m) => !m.cancelled).map((m) => m.date));
  const d = new Date(todayISO() + 'T00:00:00');
  d.setDate(d.getDate() + ((DEFAULT_SLOT.dow - d.getDay() + 7) % 7));
  for (let k = 0; k < 60; k++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!taken.has(iso)) return iso;
    d.setDate(d.getDate() + 7);
  }
  return todayISO();
}
// 예전에 쓴 구장 이름 (자주 쓴 순)
function venues() {
  const c = new Map();
  S.matchdays.forEach((m) => { if (m.venue) c.set(m.venue, (c.get(m.venue) || 0) + 1); });
  return [...c].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 12);
}
