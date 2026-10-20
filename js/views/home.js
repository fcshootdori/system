// 회원 홈 — MATCH REVIEW(지난 경기) + NEXT MATCH(다음 경기)  (WD_FUTSAL 홈과 같은 구성)
import { S, memberById, me, go, mdPath, nameOf, playedDays, nextMatchday, captainMatchday } from '../state.js';
import { db, newId } from '../store.js';
import { STATUS } from '../config.js';
import { applicants, rosters, draftState, fmtOf, totals, dayStandings } from '../domain.js';
import { esc, fmtDate, todayISO, toast } from '../util.js';
import { modal, stepper, empty, teamLabel, teamChip } from '../ui.js';
import { formatFields, bindFormatFields, readFormat } from './format-form.js';

export function fmtSummary(md) {
  const f = fmtOf(md);
  const teams = [...Array(f.teams)].map((_, i) => teamLabel(md, i));
  const vs = f.teamMode === 'fixed' ? teams.join(' vs ') : `${f.teams}팀`;
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
    if (md.status === 'open') dock = `<div class="dock"><button class="btn full" data-go="apply/${md.id}">${mine ? (mine.wait ? `대기 ${mine.no}번 · 신청 현황` : `신청 완료 (${mine.no}번) · 신청 현황`) : '참가 신청하기'}</button></div>`;
    next = `<section class="card day">
      <div class="eyebrow">${STATUS[md.status]?.label || ''}</div>
      <h1>${fmtDate(md.date)}${md.time ? ` <small>${esc(md.time)}</small>` : ''}</h1>
      <p class="muted">${[md.venue, fmtSummary(md)].filter(Boolean).map(esc).join(' · ')}</p>
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

  root.innerHTML = `
    ${capMd ? `<a class="card cap-strip" href="#/draft">👑 <b>${fmtDate(capMd.date)} 드래프트</b>에 주장으로 참여 중이에요 — 입장하기 ›</a>` : ''}
    <div class="homegrid">
      <div>
        <div class="sec-lab"><span>MATCH REVIEW</span>${last ? `<small>${fmtDate(last.date)}</small>` : ''}</div>
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
  const custom = !!md?.format;
  const { el, close } = modal(isNew ? '경기 추가' : '경기일 수정', `
    <form class="stack">
      <label>날짜<input type="date" name="date" required value="${esc(md?.date || presetDate || todayISO())}"></label>
      <label>시간<input name="time" placeholder="예: 07:00~09:00" value="${esc(md?.time || '')}"></label>
      <label>장소<input name="venue" placeholder="구장 이름" value="${esc(md?.venue || '')}"></label>
      <label>메모<textarea name="note" rows="2" placeholder="회비, 준비물 등">${esc(md?.note || '')}</textarea></label>
      ${isNew ? '' : `<label>진행 상태<select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === md.status ? 'selected' : ''}>${v.step}. ${v.label}</option>`).join('')}</select></label>`}
      <details ${custom ? 'open' : ''}><summary>이날 경기 방식 <span class="muted small">${custom ? '(이날만 변경됨)' : '(기본값 사용 중)'}</span></summary>
        ${formatFields(f)}
        ${custom ? '<label class="inline"><input type="checkbox" name="reset"> 기본 경기 방식으로 되돌리기</label>' : ''}
      </details>
      <button class="btn">${isNew ? '추가' : '저장'}</button>
    </form>`);
  const form = el.querySelector('form');
  bindFormatFields(form);
  let touched = false;
  form.querySelector('details').addEventListener('change', () => { touched = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = { date: form.date.value, time: form.time.value, venue: form.venue.value, note: form.note.value };
    if (!isNew) base.status = form.status.value;
    let format = md?.format || null;
    if (form.reset?.checked) format = null;
    else if (touched) format = readFormat(form);
    if (isNew) {
      const id = newId();
      await db.set(mdPath(id), { ...base, format, status: 'open', apps: {}, guests: {}, captains: [], picks: [], teams: [], mom: [], late: {}, createdAt: Date.now() });
      S.sel = id; S.step = null;
      toast('경기를 추가했어요 — 신청을 받을 수 있어요');
    } else {
      await db.set(mdPath(md.id), { ...base, format }, { merge: true }); toast('저장했어요');
    }
    close();
  });
}
