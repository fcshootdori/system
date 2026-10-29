// MOM 선정 — 경기가 끝나면 승리 팀 주장이 자기 팀에서 1명, 무승부면 두 팀 주장이 각자 자기 팀에서 1명
//  · 경기 결과 화면(#/games/ID)에서 고르고, 홈에는 뽑을 차례인 주장에게 알림 띠를 보여 줌
//  · 운영진은 모든 팀을 대신 고를 수 있음 (주장이 없거나 못 고를 때)
import { S, me, mdPath, nameOf, today } from '../state.js?v=0.1.85';
import { db, inSandbox } from '../store.js?v=0.1.85';
import { rosters, teamName, teamColor, momTeams, momTeamsFor, momPicked, momPending, applyMomPick } from '../domain.js?v=0.1.85';
import { TEAM_COLORS } from '../config.js?v=0.1.85';
import { esc, toast, fmtDate } from '../util.js?v=0.1.85';
import { teamChip } from '../ui.js?v=0.1.85';

const label = (md, ti) => teamName(md, ti) || `${TEAM_COLORS.find((c) => c.key === teamColor(md, ti))?.label || ti + 1 + '번'}팀`;
const gamesOf = (md) => S.games.filter((g) => g.matchdayId === md.id);

// 경기 결과 화면에 넣는 카드 (끝난 경기만). 고를 수 없는 사람에게는 결과·진행 상황만
export function momCard(md) {
  if (md.status !== 'played') return '';
  const games = gamesOf(md), teams = momTeams(md, games);
  if (!teams.length) return '';
  const mine = new Set(momTeamsFor(md, me.id, S.operator, games));
  const goals = {};
  games.forEach((g) => Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; }));
  const ros = rosters(md);
  const draw = teams.length > 1;
  const rows = teams.map((ti) => {
    const pick = momPicked(md, ti), by = md.momPick?.[ti]?.by;
    const hex = TEAM_COLORS.find((c) => c.key === teamColor(md, ti))?.hex || '#94a3b8';
    const head = `<div class="mp-head">${teamChip(md, ti)}${pick
      ? `<span class="mp-done">★ <b>${esc(nameOf(pick, md))}</b>${by && by !== pick ? `<small>${esc(nameOf(by, md))} 선정</small>` : ''}</span>`
      : `<span class="mp-wait">${mine.has(ti) ? '아래에서 골라 주세요' : '주장이 고르는 중'}</span>`}</div>`;
    if (!mine.has(ti) || md.fromSheet) return `<div class="mp-team" style="--tc:${hex}">${head}</div>`;
    const list = [...(ros[ti] || [])].sort((a, b) => (goals[b] || 0) - (goals[a] || 0) || nameOf(a, md).localeCompare(nameOf(b, md), 'ko'));
    return `<div class="mp-team edit" style="--tc:${hex}">${head}
      <div class="mp-grid">${list.map((id) => `<button type="button" class="mp-p ${pick === id ? 'on' : ''}" data-mompick="${ti}:${id}" aria-pressed="${pick === id}">
        <span>${esc(nameOf(id, md))}</span>${goals[id] ? `<i>⚽${goals[id] > 1 ? goals[id] : ''}</i>` : ''}</button>`).join('')}</div>
      <p class="tiny muted">${pick ? '다른 선수를 누르면 바뀌고, 같은 선수를 다시 누르면 취소돼요.' : '우리 팀에서 오늘 가장 잘한 선수 1명을 골라 주세요.'}</p></div>`;
  }).join('');
  const lead = draw ? '무승부라 <b>두 팀 주장이 각자 자기 팀에서 1명씩</b> 뽑아요.'
    : `<b>${esc(label(md, teams[0]))}</b> 승리 — <b>승리 팀 주장</b>이 자기 팀에서 1명을 뽑아요.`;
  return `<section class="card mom-pick"><h2>🏆 MOM 선정</h2><p class="small muted mp-lead">${lead}${S.operator ? ' <span class="tiny">(운영진은 대신 고를 수 있어요)</span>' : ''}</p>${rows}</section>`;
}

export function bindMom(root, md) {
  root.querySelectorAll('[data-mompick]').forEach((b) => b.addEventListener('click', async () => {
    const [t, id] = b.dataset.mompick.split(':'), ti = +t;
    const teams = momTeams(md, gamesOf(md)), ros = rosters(md);
    if (!momTeamsFor(md, me.id, S.operator).includes(ti)) return toast('이 팀 MOM은 주장만 고를 수 있어요');
    const same = momPicked(md, ti) === id;
    b.disabled = true;
    try {
      await db.tx(mdPath(md.id), (cur) => cur && applyMomPick(cur, ti, same ? null : id, me.id || (S.operator ? 'op' : ''), teams, ros));
      toast(same ? 'MOM 선택을 취소했어요' : `${nameOf(id, md)} 님을 MOM으로 뽑았어요`);
    } catch (e) { toast('저장하지 못했어요: ' + (e.message || e)); b.disabled = false; }
  }));
}

// 홈 알림: 내가 MOM을 뽑을 차례인 경기 (최근 7일)
export function momAsks() {
  if (!me.id) return [];
  const d = new Date(today() + 'T00:00:00'); d.setDate(d.getDate() - 7);
  const from = d.toISOString().slice(0, 10);
  return S.matchdays.filter((m) => (!m.sample || inSandbox()) && !m.fromSheet && (m.date || '') >= from && momPending(m))
    .map((m) => ({ md: m, teams: momTeamsFor(m, me.id, false).filter((ti) => !momPicked(m, ti)) }))
    .filter((x) => x.teams.length);
}
export const momStrip = (x) => `<a class="card cap-strip mom-strip" href="#/games/${x.md.id}"><span class="ms-ic"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" fill="#e0a100"/></svg></span><span><b>${fmtDate(x.md.date)} 경기 MOM</b>을 뽑아 주세요 · ${x.teams.map((ti) => esc(label(x.md, ti))).join(', ')} 주장</span><span class="ms-go" aria-hidden="true">›</span></a>`;
