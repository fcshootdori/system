import { S, currentMatchday, matchdayById, nameOf } from '../state.js?v=0.1.68';
import { APP_NAME, APP_VERSION } from '../config.js?v=0.1.68';
import { applicants, rosters, dayStandings, teamColor, fmtOf, totals, noLabel, captainIds } from '../domain.js?v=0.1.68';
import { renderApplyImage, renderTeamsImage, renderResultImage, renderMatchImage, downloadCanvas, shareCanvas } from '../notice-image.js?v=0.1.68';
import { esc, fmtDate, copyText, toast } from '../util.js?v=0.1.68';
import { empty, teamLabel } from '../ui.js?v=0.1.68';

let kind = null, mdId = null, lastCanvas = null;
const KINDS = { apply: '신청 명단', teams: '팀 구성', result: '경기 결과' };

export function render(root) {
  if (window.__noticeMd) { mdId = window.__noticeMd; kind = null; window.__noticeMd = null; }
  const md = (mdId && matchdayById(mdId)) || currentMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('경기일이 없어요.')}</section>`; return; }
  if (!kind) kind = md.status === 'played' ? 'result' : md.teams?.length ? 'teams' : 'apply';
  root.innerHTML = `<section class="card">
    <h1>공지 이미지</h1>
    <label class="inline">경기일 <select data-md>${S.matchdays.slice(0, 40).map((m) => `<option value="${m.id}" ${m.id === md.id ? 'selected' : ''}>${noLabel(m) ? noLabel(m) + ' · ' : ''}${fmtDate(m.date)} ${esc(m.venue || '')}</option>`).join('')}</select></label>
    <div class="seg">${Object.entries(KINDS).map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div>
    <div class="preview" data-preview><div class="muted center">만드는 중…</div></div>
    <div class="row wrap">
      <button class="btn" data-save>이미지 저장</button>
      <button class="btn ghost" data-share>공유</button>
      <button class="btn ghost" data-text>카페용 텍스트 복사</button>
    </div>
  </section>`;
  root.querySelector('[data-md]').addEventListener('change', (e) => { mdId = e.target.value; kind = null; e.target.blur(); render(root); });
  root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; render(root); }));
  const fname = () => `${APP_NAME}_${KINDS[kind]}_${md.date.replace(/-/g, '')}.png`.replace(/\s+/g, '');
  root.querySelector('[data-save]').addEventListener('click', () => lastCanvas && downloadCanvas(lastCanvas, fname()));
  root.querySelector('[data-share]').addEventListener('click', async () => {
    if (lastCanvas && !(await shareCanvas(lastCanvas, fname()))) { downloadCanvas(lastCanvas, fname()); toast('공유를 지원하지 않아 저장했어요'); }
  });
  root.querySelector('[data-text]').addEventListener('click', () => copyText(textNotice(md)));
  draw(root, md);
}

function teamsData(md) {
  return rosters(md).map((ids, i) => { const caps = captainIds(md, i);
    return { label: teamLabel(md, i), colorKey: teamColor(md, i), members: ids.map((id) => ({ name: nameOf(id, md), captain: caps.includes(id) })) }; });
}
function goalsOf(md) {
  const games = S.games.filter((g) => g.matchdayId === md.id);
  const goals = {}, og = {};
  games.forEach((g) => {
    Object.entries(g.goals || {}).forEach(([id, n]) => { goals[id] = (goals[id] || 0) + n; });
    Object.entries(g.og || {}).forEach(([id, n]) => { og[id] = (og[id] || 0) + n; });
  });
  const ids = [...new Set([...Object.keys(goals), ...Object.keys(og)])];
  return { games, scorers: ids.map((id) => ({ name: nameOf(id, md), goals: goals[id] || 0, og: og[id] || 0 })).sort((a, b) => b.goals - a.goals) };
}
function matchData(md) {
  const { games, scorers } = goalsOf(md);
  const t = totals(md, games);
  const done = games.length && games.every((g) => g.done);
  const res = (i) => (!done ? '' : t[i] > t[1 - i] ? '승' : t[i] < t[1 - i] ? '패' : '무');
  return {
    sides: [0, 1].map((i) => ({ label: teamLabel(md, i), colorKey: teamColor(md, i), score: t[i] || 0, res: res(i) })),
    rounds: md.source === 'sheet' ? [] : games.map((g) => (g.a === 0 ? { round: g.round, sa: g.sa, sb: g.sb } : { round: g.round, sa: g.sb, sb: g.sa })),
    scorers, moms: (md.mom || []).map((id) => nameOf(id, md)),
  };
}
function resultData(md) {
  const { games, scorers } = goalsOf(md);
  const standings = dayStandings(md, games).map((s) => ({ ...s, label: teamLabel(md, s.team), colorKey: teamColor(md, s.team) }));
  return { standings, games: games.filter((g) => g.done).map((g) => ({ round: g.round, aLabel: teamLabel(md, g.a), bLabel: teamLabel(md, g.b), sa: g.sa, sb: g.sb })),
    scorers: scorers.filter((s) => s.goals) };
}

async function draw(root, md) {
  const box = root.querySelector('[data-preview]');
  const footer = `${S.team.name} · ${APP_NAME} Ver.${APP_VERSION}`;
  let c;
  if (kind === 'apply') {
    c = await renderApplyImage({ team: S.team, md, list: applicants(md).map((a) => ({ ...a, name: nameOf(a.id, md) })), footer, minPlayers: fmtOf(md).minPlayers });
  } else if (kind === 'teams') {
    if (!rosters(md).length) { box.innerHTML = empty('아직 팀이 정해지지 않았어요.'); lastCanvas = null; return; }
    c = await renderTeamsImage({ team: S.team, md, teams: teamsData(md), footer });
  } else {
    if (!md.teams?.length) { box.innerHTML = empty('팀이 확정되지 않았어요.'); lastCanvas = null; return; }
    c = fmtOf(md).scoring === 'sum'
      ? await renderMatchImage({ team: S.team, md, ...matchData(md), footer })
      : await renderResultImage({ team: S.team, md, ...resultData(md), footer });
  }
  lastCanvas = c;
  box.innerHTML = '';
  const img = new Image(); img.src = c.toDataURL('image/png'); img.alt = KINDS[kind];
  box.appendChild(img);
}

function textNotice(md) {
  const head = `[${S.team.name}] ${noLabel(md) ? noLabel(md) + ' ' : ''}${fmtDate(md.date)} ${md.time || ''} ${md.venue || ''}`.replace(/\s+/g, ' ').trim();
  if (kind === 'apply') {
    const list = applicants(md), f = fmtOf(md);
    const main = list.filter((a) => !a.wait), wait = list.filter((a) => a.wait);
    return `${head}\n참가 신청 명단 (${main.length}명${f.minPlayers ? ` / 최소 ${f.minPlayers}명` : ''})\n\n${main.map((a) => `${a.no}. ${nameOf(a.id, md)}`).join('\n')}${wait.length ? `\n\n대기 (${wait.length}명)\n${wait.map((a) => `${a.no}. ${nameOf(a.id, md)}`).join('\n')}` : ''}`;
  }
  if (kind === 'teams') {
    return `${head}\n팀 구성\n\n${teamsData(md).map((t) => `■ ${t.label} (${t.members.length}명)\n${t.members.map((m) => (m.captain ? `${m.name}(C)` : m.name)).join(', ')}`).join('\n\n')}`;
  }
  const extra = (scorers, moms) => `${scorers.filter((s) => s.goals).length ? `\n\n득점: ${scorers.filter((s) => s.goals).map((s) => `${s.name} ${s.goals}`).join(', ')}` : ''}${moms?.length ? `\nMOM: ${moms.join(', ')}` : ''}`;
  if (fmtOf(md).scoring === 'sum') {
    const m = matchData(md);
    return `${head}\n경기 결과\n\n${m.sides[0].label} ${m.sides[0].score} : ${m.sides[1].score} ${m.sides[1].label}\n${m.rounds.map((r) => `${r.round}R ${r.sa}:${r.sb}`).join(' / ')}${extra(m.scorers, m.moms)}`;
  }
  const r = resultData(md);
  return `${head}\n경기 결과\n\n${r.standings.map((s, i) => `${i + 1}위 ${s.label} ${s.w}승 ${s.d}무 ${s.l}패 (승점 ${s.pts})`).join('\n')}\n\n${r.games.map((g, i) => `${i + 1}경기 ${g.aLabel} ${g.sa} : ${g.sb} ${g.bLabel}`).join('\n')}${extra(r.scorers, (md.mom || []).map((id) => nameOf(id, md)))}`;
}
