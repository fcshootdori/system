// 운영 > 경기 — 위쪽에 선택한 경기(날짜·장소·상태, 이전/이후)와 단계 막대를 고정하고
//  신청 → 주장 → 드래프트 → 팀 확정 → 경기 → 결과 단계 화면을 보여 줌 (WD_FUTSAL 경기 메뉴와 같은 구성)
import { S, nextMatchday, matchdayById, mdPath, go, statusLabel } from '../state.js';
import { db } from '../store.js';
import { STATUS } from '../config.js';
import { esc, fmtDate, toast } from '../util.js';
import { noLabel, eventTeams, signupView, eventTeamsToTeams } from '../domain.js';
import { colorChip } from '../ui.js';
import { empty } from '../ui.js';
import { fmtSummary, editMatchday, cancelMatchday } from './home.js';
import * as apply from './apply.js';
import * as draft from './draft.js';
import * as games from './games.js';

const STAGES = [['apply', '신청'], ['captain', '주장'], ['draft', '드래프트'], ['teams', '팀 확정'], ['games', '경기'], ['result', '결과']];
const idx = (k) => STAGES.findIndex(([s]) => s === k);

// 경기일 상태 → 지금 단계
export function stageOf(md) {
  const hasGames = S.games.some((g) => g.matchdayId === md.id);
  switch (md.status) {
    case 'open': case 'closed': return 'apply';
    case 'captains': return 'captain';
    case 'drafting': return (md.captains || []).length ? 'draft' : 'captain';
    case 'teams': return hasGames ? 'games' : 'teams';
    case 'played': return 'result';
    default: return 'apply';
  }
}

export function render(root) {
  const list = [...S.matchdays].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let md = matchdayById(S.sel);
  if (!md) { md = nextMatchday() || list[list.length - 1] || null; S.sel = md?.id || null; S.step = null; }
  if (!md) {
    root.innerHTML = `<section class="card center">${empty('경기가 없어요. 일정 메뉴에서 먼저 추가하세요.')}<button class="btn" data-add>＋ 경기 추가</button></section>`;
    root.querySelector('[data-add]').addEventListener('click', () => editMatchday());
    return;
  }
  const i = list.indexOf(md), prev = list[i - 1], next = list[i + 1];
  const auto = stageOf(md);
  const step = S.step || auto;

  root.innerHTML = `
    <div class="runbar card">
      <div class="rb-top">
        <button class="navb" data-to="${prev?.id || ''}" ${prev ? '' : 'disabled'} aria-label="이전 경기">‹</button>
        <div class="rb-title"><b>${noLabel(md) ? `<span class="no">${noLabel(md)}</span> ` : ''}${fmtDate(md.date)}${md.time ? ` <small>${esc(md.time)}</small>` : ''}</b>
          <small>${esc([md.venue, fmtSummary(md)].filter(Boolean).join(' · '))} · <span class="st ${md.cancelled ? 'st-cancel' : ''}">${statusLabel(md, STATUS)}</span></small></div>
        <button class="navb" data-to="${next?.id || ''}" ${next ? '' : 'disabled'} aria-label="이후 경기">›</button>
      </div>
      <ol class="stages">${STAGES.map(([k, l], n) => `<li><button data-step="${k}" class="${n < idx(auto) ? 'done' : ''} ${k === auto ? 'now' : ''} ${k === step ? 'sel' : ''}">${l}</button></li>`).join('')}</ol>
      <div class="rb-tools"><button class="link" data-edit>경기일·경기 방식 수정</button><button class="link" data-notice>공지 이미지</button>${md.status === 'played' ? '' : `<button class="link danger" data-cancelmd>${md.cancelled ? '취소 철회' : '경기 취소'}</button>`}</div>
    </div>
    <div data-body></div>`;

  const body = root.querySelector('[data-body]');
  const ctx = { md, embedded: true };
  root.querySelector('[data-cancelmd]')?.addEventListener('click', () => cancelMatchday(md));
  if (md.cancelled) {
    body.innerHTML = `<section class="card cancel-card"><h2>취소된 경기예요</h2>
      <p class="small">${md.cancelReason ? esc(md.cancelReason) + ' · ' : ''}일정에는 "경기 취소"로 표시되고, 회원 홈에도 안내가 떠요. 신청 명단은 그대로 보관돼요.</p>
      <button class="btn ghost" data-uncancel>취소 철회</button></section>`;
    body.querySelector('[data-uncancel]').addEventListener('click', () => cancelMatchday(md));
  } else if (step === 'apply') apply.render(body, ctx);
  else if ((step === 'captain' || step === 'draft' || step === 'teams') && eventTeams(md) && !md.teams?.length) {
    // 이벤트 경기: 주장·드래프트 없이 미리 정한 팀 그대로
    const v = signupView(md);
    body.innerHTML = `<section class="card op"><h2>이벤트 경기 — 팀이 미리 정해져 있어요</h2>
      <p class="small">${v.sides.map((s) => `${colorChip(s.color, s.name)} 참석 <b>${s.ins.length}</b>명`).join(' · ')}${v.noTeam.length ? ` · 팀 미정 ${v.noTeam.length}명(인원 적은 팀으로)` : ''}${v.pend.length ? ` · 협의 ${v.pend.length}명(승인 전)` : ''}</p>
      <p class="muted small">주장 선정·드래프트 없이 참석자 그대로 팀을 확정해요. 확정 뒤에도 팀 확정 단계에서 선수를 옮길 수 있어요.</p>
      <button class="btn" data-evfinal>참석자로 팀 확정</button></section>`;
    body.querySelector('[data-evfinal]').addEventListener('click', async () => {
      await db.tx(mdPath(md.id), (cur) => {
        cur.teams = eventTeamsToTeams(cur); cur.teamNames = eventTeams(cur).map((t) => t.name);
        cur.captains = []; cur.picks = []; cur.draftStarted = false; cur.status = 'teams'; return cur;
      });
      S.step = 'teams'; toast('이벤트 팀을 확정했어요');
    });
  } else if (step === 'captain' || step === 'draft' || step === 'teams') {
    draft.render(body, ctx);
    if (step === 'teams' && md.status === 'teams') body.insertAdjacentHTML('beforeend', `<section class="card op"><h2>다음 단계</h2>
      <p class="muted small">밸런스 조정이 끝났으면 팀 공지를 올리고 경기 단계로 넘어가세요.</p>
      <div class="row wrap"><button class="btn ghost" data-notice2>팀 공지 이미지</button><button class="btn" data-gogames>경기 단계로 →</button></div></section>`);
    if (step === 'captain' && ['open', 'closed'].includes(md.status)) body.insertAdjacentHTML('afterbegin', `<section class="card op"><p class="small">아직 신청 단계예요. 주장을 정하려면 신청을 마감하세요.</p>
      <button class="btn" data-tocap>신청 마감 · 주장 정하기</button></section>`);
  } else {
    games.render(body, ctx);
    if (step === 'result' && md.status === 'played') body.insertAdjacentHTML('afterbegin', `<section class="card op"><div class="row wrap">
      <button class="btn" data-notice2>결과 공지 이미지</button></div></section>`);
  }

  root.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.to) { S.sel = b.dataset.to; S.step = null; render(root); } }));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { S.step = b.dataset.step === auto ? null : b.dataset.step; render(root); window.scrollTo(0, 0); }));
  root.querySelector('[data-edit]').addEventListener('click', () => editMatchday(md));
  root.querySelectorAll('[data-notice],[data-notice2]').forEach((b) => b.addEventListener('click', () => { window.__noticeMd = md.id; go('notice'); }));
  root.querySelector('[data-gogames]')?.addEventListener('click', () => { S.step = 'games'; render(root); window.scrollTo(0, 0); });
  root.querySelector('[data-tocap]')?.addEventListener('click', async () => {
    await db.set(mdPath(md.id), { status: 'captains' }, { merge: true }); S.step = null; toast('신청을 마감했어요 — 주장을 정하세요');
  });
}
