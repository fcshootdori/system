import { S, currentMatchday, memberById, me, go, mdPath, nameOf } from '../state.js';
import { db, newId } from '../store.js';
import { STATUS } from '../config.js';
import { applicants, rosters, draftState, fmtOf, totals } from '../domain.js';
import { esc, fmtDate, todayISO, toast } from '../util.js';
import { modal, stepper, empty, teamLabel, teamChip } from '../ui.js';
import { formatFields, bindFormatFields, readFormat } from './format-form.js';

export function fmtSummary(md) {
  const f = fmtOf(md);
  const teams = [...Array(f.teams)].map((_, i) => teamLabel(md, i));
  const vs = f.teamMode === 'fixed' ? teams.join(' vs ') : `${f.teams}팀`;
  return `${vs} · ${f.rounds}라운드${f.scoring === 'sum' ? ' 합산' : ''}`;
}

export function render(root) {
  const md = currentMatchday();
  const past = S.matchdays.filter((m) => m.status === 'played' && m.id !== md?.id).slice(0, 10);

  root.innerHTML = `
    ${md ? dayCard(md) : `<section class="card center">${empty('등록된 경기일이 없어요.')}
      ${S.operator ? '<button class="btn" data-new>경기일 만들기</button>' : ''}</section>`}
    ${S.operator ? opCard(md) : ''}
    ${S.team.cafeUrl ? `<a class="card link-card" href="${esc(S.team.cafeUrl)}" target="_blank" rel="noopener">다음 카페 바로가기 ↗</a>` : ''}
    ${past.length ? `<section class="card"><h2>지난 경기</h2><ul class="list">
      ${past.map((m) => { const t = totals(m); return `<li><a href="#/games/${m.id}"><span>${fmtDate(m.date)}</span>
        ${fmtOf(m).scoring === 'sum' && t.length === 2 ? `<span class="mini-score">${teamChip(m, 0)} <b>${t[0]} : ${t[1]}</b> ${teamChip(m, 1)}</span>` : ''}</a></li>`; }).join('')}
    </ul></section>` : ''}`;

  root.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => editMatchday()));
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  root.querySelector('[data-edit]')?.addEventListener('click', () => editMatchday(md));
  root.querySelector('[data-status]')?.addEventListener('change', async (e) => {
    await db.set(mdPath(md.id), { status: e.target.value }, { merge: true });
    toast(`상태: ${STATUS[e.target.value].label}`);
  });
  root.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!confirm(`${fmtDate(md.date)} 경기일을 삭제할까요? 경기 결과도 함께 지워집니다.`)) return;
    await Promise.all(S.games.filter((g) => g.matchdayId === md.id).map((g) => db.del('games/' + g.id)));
    await db.del(mdPath(md.id)); toast('삭제했어요');
  });
}

function dayCard(md) {
  const f = fmtOf(md);
  const list = applicants(md);
  const nIn = list.filter((a) => !a.wait).length, nWait = list.length - nIn;
  const mine = list.find((a) => a.id === me.id);
  const ros = rosters(md);
  const myTeam = ros.findIndex((ids) => ids.includes(me.id));
  const ds = md.status === 'drafting' ? draftState(md) : null;
  const short = f.minPlayers && nIn < f.minPlayers ? f.minPlayers - nIn : 0;

  let cta = '';
  if (md.status === 'open') cta = `<button class="btn" data-go="apply">${mine ? '신청 현황 보기' : '참가 신청하기'}</button>`;
  else if (md.status === 'closed') cta = `<button class="btn ghost" data-go="apply">신청 명단 보기</button>`;
  else if (md.status === 'captains' || md.status === 'drafting') cta = `<button class="btn" data-go="draft">드래프트 보기</button>`;
  else if (md.status === 'teams') cta = `<button class="btn" data-go="draft">팀 구성 보기</button><button class="btn ghost" data-go="games">경기 기록</button>`;
  else if (md.status === 'played') cta = `<button class="btn" data-go="games/${md.id}">경기 결과 보기</button>`;

  return `<section class="card day">
    <div class="eyebrow">${STATUS[md.status]?.label || ''}</div>
    <h1>${fmtDate(md.date)}${md.time ? ` <small>${esc(md.time)}</small>` : ''}</h1>
    <p class="muted">${[md.venue, fmtSummary(md)].filter(Boolean).map(esc).join(' · ')}</p>
    ${stepper(md.status)}
    ${md.note ? `<p class="note">${esc(md.note)}</p>` : ''}
    <div class="stats3">
      <div><b>${nIn}</b><span>참가${f.capacity ? ` / ${f.capacity}` : ''}</span></div>
      <div class="${short ? 'warn' : 'ok'}"><b>${short ? `-${short}` : '충족'}</b><span>최소 ${f.minPlayers || '-'}명</span></div>
      <div><b>${nWait || (md.captains || []).length}</b><span>${nWait ? '대기' : '주장'}</span></div>
    </div>
    ${me.id ? `<p class="mine">${esc(memberById(me.id)?.name || '')} · ${
      myTeam >= 0 && md.status !== 'drafting' && md.status !== 'captains' ? teamChip(md, myTeam)
      : mine ? (mine.wait ? `대기 ${mine.no}번` : `신청 완료 (${mine.no}번)`) : '미신청'}</p>` : ''}
    ${ds && ds.turn != null ? `<p class="mine">지금 지명 차례: <b>${esc(nameOf(md.captains[ds.turn].id, md))}</b> 주장</p>` : ''}
    <div class="row">${cta}</div>
  </section>`;
}

function opCard(md) {
  return `<section class="card op">
    <h2>운영</h2>
    ${md ? `<label class="inline">진행 단계
      <select data-status>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === md.status ? 'selected' : ''}>${v.step}. ${v.label}</option>`).join('')}</select></label>
      <div class="row wrap">
        <button class="btn ghost" data-edit>경기일·경기 방식 수정</button>
        <button class="btn ghost" data-go="notice">공지 이미지</button>
        <button class="btn ghost danger" data-del>삭제</button>
      </div>` : ''}
    <button class="btn mt-s" data-new>새 경기일 만들기</button>
  </section>`;
}

export function editMatchday(md) {
  const isNew = !md;
  const f = fmtOf(md);
  const custom = !!md?.format;
  const { el, close } = modal(isNew ? '새 경기일' : '경기일 수정', `
    <form class="stack">
      <label>날짜<input type="date" name="date" required value="${esc(md?.date || todayISO())}"></label>
      <label>시간<input name="time" placeholder="예: 08:00~10:00" value="${esc(md?.time || '')}"></label>
      <label>장소<input name="venue" placeholder="구장 이름" value="${esc(md?.venue || '')}"></label>
      <label>메모<textarea name="note" rows="2" placeholder="회비, 준비물 등">${esc(md?.note || '')}</textarea></label>
      <details ${custom ? 'open' : ''}><summary>이날 경기 방식 <span class="muted small">${custom ? '(이날만 변경됨)' : '(기본값 사용 중)'}</span></summary>
        ${formatFields(f)}
        ${custom ? '<label class="inline"><input type="checkbox" name="reset"> 기본 경기 방식으로 되돌리기</label>' : ''}
      </details>
      <button class="btn">${isNew ? '만들기' : '저장'}</button>
    </form>`);
  const form = el.querySelector('form');
  bindFormatFields(form);
  let touched = false;
  form.querySelector('details').addEventListener('change', () => { touched = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = { date: form.date.value, time: form.time.value, venue: form.venue.value, note: form.note.value };
    let format = md?.format || null;
    if (form.reset?.checked) format = null;
    else if (touched) format = readFormat(form);
    if (isNew) {
      await db.set(mdPath(newId()), { ...base, format, status: 'open', apps: {}, guests: {}, captains: [], picks: [], teams: [], mom: [], late: {}, createdAt: Date.now() });
      toast('경기일을 만들었어요 — 신청을 받을 수 있어요');
    } else {
      await db.set(mdPath(md.id), { ...base, format }, { merge: true }); toast('저장했어요');
    }
    close();
  });
}
