import { S, memberById, me, matchdayById } from '../state.js?v=0.1.31';
import { allStats, pct, RATE_TEXT } from '../domain.js?v=0.1.31';
import { esc, fmtDate } from '../util.js?v=0.1.31';
import { empty, teamChip } from '../ui.js?v=0.1.31';

let sortKey = 'pts', minGames = 15, showAll = false;   // 최소 경기 기본 15경기
// 부문별 1위 (최소 경기 조건을 채운 회원 중) — 공동 1위는 함께 표시
const LEADS = [
  ['rate', '승률', (r) => r.rate, (v) => pct(v)],
  ['pts', '승점', (r) => r.pts, (v) => `${v}점`],
  ['w', '최다 승', (r) => r.w, (v) => `${v}승`],
  ['goals', '득점', (r) => r.goals, (v) => `${v}골`],
  ['mom', 'MOM', (r) => r.mom, (v) => `${v}회`],
  ['games', '최다 출전', (r) => r.games, (v) => `${v}경기`],
];
function leaders(rows) {
  return LEADS.map(([k, label, get, fmt]) => {
    const vals = rows.map((r) => ({ r, v: get(r) })).filter((x) => x.v != null && x.v > 0);
    if (!vals.length) return { k, label, none: true };
    const top = Math.max(...vals.map((x) => x.v));
    const who = vals.filter((x) => Math.abs(x.v - top) < 1e-9).map((x) => x.r).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return { k, label, val: fmt(top), who };
  });
}
const COLS = [
  ['name', '이름'], ['games', '경기'], ['w', '승'], ['d', '무'], ['l', '패'], ['rate', '승률'], ['pts', '승점'],
  ['goals', '득점'], ['mom', 'MOM'], ['late', '지각'], ['og', '자책'],
];

export function render(root, { params }) {
  if (params[0]) return detail(root, params[0]);
  let rows = allStats().filter((r) => r.games >= minGames && (showAll || memberById(r.id).active !== false || r.games));
  rows.sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name, 'ko')
    : ((b[sortKey] ?? -1) - (a[sortKey] ?? -1)) || b.pts - a.pts || a.name.localeCompare(b.name, 'ko'));
  const days = new Set(S.games.filter((g) => g.done && !matchdayById(g.matchdayId)?.sample && !String(g.matchdayId).startsWith('sample_')).map((g) => g.matchdayId)).size;

  root.innerHTML = `<section class="card">
    <h1>기록 <small>${days}경기일</small></h1>
    <div class="row wrap filters">
      <label class="inline">최소 경기 <select data-min>${[0, 3, 5, 10, 15, 20].map((n) => `<option ${n === minGames ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="inline"><input type="checkbox" data-all ${showAll ? 'checked' : ''}> 기록 없는 휴면 회원도 보기</label>
    </div>
    <p class="muted small">${RATE_TEXT[S.team.winRate || 'wl']} · 승점 = 승×3 + 무 · 표 제목을 누르면 정렬돼요</p>
    ${rows.length ? `<div class="leads">${leaders(rows).map((L) => `<button class="lead ${L.k === sortKey ? 'on' : ''}" data-lead="${L.k}">
      <span class="lb">👑 ${L.label} 1위</span>
      ${L.none ? '<b class="muted">-</b>' : `<b class="lv">${L.val}</b><span class="lw">${L.who.slice(0, 3).map((r) => esc(r.name)).join(' · ')}${L.who.length > 3 ? ` 외 ${L.who.length - 3}명` : ''}${L.who.length > 1 ? ' <small>(공동)</small>' : ''}</span>`}
    </button>`).join('')}</div>
    <p class="tiny muted lead-note">${minGames ? `최소 ${minGames}경기 이상 회원 기준` : '전체 회원 기준'} · 부문을 누르면 그 순서로 정렬돼요</p>` : ''}
    ${rows.length ? `<div class="tbl-wrap vfit" data-key="rec"><table class="tbl rec"><thead><tr><th>#</th>${COLS.map(([k, l]) =>
      `<th data-sort="${k}" class="${k === sortKey ? 'on' : ''} ${k === 'name' ? 'nm' : ''}">${l}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.id === me.id ? 'me' : ''}" data-m="${r.id}"><td>${i + 1}</td>
        <td class="nm">${esc(r.name)}</td><td>${r.games}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td><b>${pct(r.rate)}</b></td><td><b>${r.pts}</b></td><td>${r.goals}</td><td>${r.mom}</td><td>${r.late}</td><td>${r.og}</td></tr>`).join('')}
      </tbody></table></div>` : empty('아직 기록이 없어요.')}
  </section>`;

  const rer = () => render(root, { params });
  root.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => { sortKey = th.dataset.sort; rer(); }));
  root.querySelectorAll('[data-lead]').forEach((b) => b.addEventListener('click', () => { sortKey = b.dataset.lead; rer(); }));
  root.querySelector('[data-min]').addEventListener('change', (e) => { minGames = +e.target.value; e.target.blur(); rer(); });
  root.querySelector('[data-all]').addEventListener('change', (e) => { showAll = e.target.checked; e.target.blur(); rer(); });
  root.querySelectorAll('[data-m]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/records/' + tr.dataset.m; }));
}

function detail(root, id) {
  const m = memberById(id);
  const r = allStats().find((x) => x.id === id);
  if (!m || !r) { root.innerHTML = `<section class="card">${empty('회원을 찾을 수 없어요.')}</section>`; return; }
  root.innerHTML = `<section class="card">
    <a href="#/results" class="back">‹ 경기결과</a>
    <h1>${esc(m.name)} ${m.active === false ? '<small>휴면</small>' : ''}</h1>
    <div class="stats3 four">
      <div><b>${pct(r.rate)}</b><span>승률</span></div>
      <div><b>${r.w}-${r.d}-${r.l}</b><span>승-무-패</span></div>
      <div><b>${r.pts}</b><span>승점</span></div>
      <div><b>${r.games}</b><span>경기</span></div>
      <div><b>${r.goals}</b><span>득점</span></div>
      <div><b>${r.mom}</b><span>MOM</span></div>
      <div><b>${r.late}</b><span>지각</span></div>
      <div><b>${r.og}</b><span>자책</span></div>
    </div>
  </section>
  <section class="card"><h2>경기일별 기록</h2>
    ${r.history.length ? `<ul class="hist">${r.history.map((h) => {
      const md = matchdayById(h.mdId);
      const res = h.w ? '<em class="res w">승</em>' : h.l ? '<em class="res l">패</em>' : '<em class="res d">무</em>';
      const one = h.w + h.d + h.l === 1;
      return `<li><a href="#/games/${h.mdId}"><span>${fmtDate(h.date)}</span>
        ${h.team != null ? teamChip(md, h.team) : ''}
        ${one ? res : `<span>${h.w}승 ${h.d}무 ${h.l}패</span>`}
        <span class="tags">${h.goals ? `⚽${h.goals}` : ''}${h.mom ? ' <b class="mom">MOM</b>' : ''}${h.late ? ' 지각' : ''}${h.og ? ` 자책${h.og}` : ''}</span></a></li>`;
    }).join('')}</ul>` : empty('기록된 경기가 아직 없어요.')}
  </section>`;
}
