// ⚽ 경기모드 — 오늘(또는 진행 중인) 경기의 실시간 스코어
//  회원은 보기, 운영진은 운영모드 > 경기 메뉴에서 기록
import { S, today, playedDays } from '../state.js';
import { fmtDate } from '../util.js';
import * as games from './games.js';

export function liveMatchday() {
  const t = today();
  const withTeams = S.matchdays.filter((m) => m.teams?.length && m.source !== 'sheet' && !m.cancelled);
  return withTeams.find((m) => m.date === t)
    || withTeams.filter((m) => m.status === 'teams').sort((a, b) => a.date.localeCompare(b.date))[0]
    || null;
}

export function render(root) {
  const md = liveMatchday();
  if (!md) {
    const last = playedDays()[0];
    root.innerHTML = `<section class="card center mm-empty"><div class="mm-ball">⚽</div>
      <h2>진행 중인 경기가 없어요</h2><p class="muted small">팀이 확정되면 여기서 실시간 점수를 볼 수 있어요.</p>
      ${last ? `<a class="btn ghost" href="#/games/${last.id}">지난 경기 결과 (${fmtDate(last.date)})</a>` : ''}</section>`;
    return;
  }
  root.innerHTML = `<div class="mm-live-tag">${md.status === 'played' ? '경기 종료' : '<i></i> LIVE'} · ${fmtDate(md.date)}</div><div data-body></div>`;
  games.render(root.querySelector('[data-body]'), { md, live: true });
}
