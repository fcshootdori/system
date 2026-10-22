// 경기결과 — 경기기록시스템(팀 기록 웹앱)과 같은 구성: [경기 결과 | 전체 순위 | 개인 기록]
//  · 경기 결과: 핑크 vs 블루 시즌 전적 · 시즌 흐름(막대를 누르면 그 경기) · 경기 카드(MOM·득점·라운드·출전 명단)
//  · 전체 순위: 부문별 1위 · 기준별 순위(승점·승률·득점·MOM·출전) · 순위 산정 전 회원
//  · 개인 기록: 선수 카드 · 시즌 출전 칸 · 팀 평균과 비교 · 전체 경기 기록
import { S, me, matchdayById } from '../state.js?v=0.1.67';
import { esc } from '../util.js?v=0.1.67';
import { icon } from '../icons.js?v=0.1.67';
import { noLabel } from '../domain.js?v=0.1.67';
import { sheetState, loadRecords, sheetPending } from '../record-sheet.js?v=0.1.67';
import { buildDB, fromSheet, seasons, METRIC, RANK_MIN, TEAM, RES, pctTxt, ko, sortedBy } from '../records-data.js?v=0.1.67';

const st = { tab: 'games', season: null, sort: 'pts', q: '', rankLimit: 10, selGame: null, showAll: false, who: null, meSel: null, meSelFor: null, meAll: false };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const ic = (n, c = '') => icon(n, c);
const tipAttr = (s) => `data-tip="${esc(s)}"`;
const shirt = (t, c = '') => `<span class="r-shirt ${t}">${icon('shirt', c)}</span>`;
function fmtD(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { short: '?', long: s || '날짜 없음', ok: false };
  const y = +m[1], mo = +m[2], d = +m[3];
  return { short: `${mo}.${d}`, long: `${mo}월 ${d}일 (${WD[new Date(y, mo - 1, d).getDay()]})`, m: mo, ok: true };
}
const gLabel = (g) => (g.md.fromSheet ? (g.md.recNo != null ? `${g.md.recNo}회` : '') : noLabel(g.md) || '');
const tname = (g, t) => g.names?.[t] || `${TEAM[t]}팀`;
function bar3(parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  return `<div class="r-bar3">${parts.filter((p) => p.v).map((p) => `<i class="${p.k}" style="flex:${p.v / tot}" ${p.tip ? tipAttr(p.tip) : ''}></i>`).join('')}</div>`;
}
const cardHead = (i, title, aside) => `<div class="r-ch"><span class="r-ci">${ic(i)}</span><h3>${title}</h3>${aside ? `<span class="r-aside">${aside}</span>` : ''}</div>`;
function monthLabels(G) {
  let lastM = null, lastAt = -9;
  return G.map((g, i) => { const d = fmtD(g.date); if (d.ok && d.m !== lastM) { lastM = d.m; if (i - lastAt >= 3) { lastAt = i; return `<span>${d.m}월</span>`; } } return '<span></span>'; }).join('');
}

// 다른 화면에서 특정 선수·탭으로 열기 (#/records/회원ID → 개인 기록)
export function open({ player, tab } = {}) { if (player) { st.who = player; st.tab = 'me'; } else if (tab) st.tab = tab; }

export function render(root) {
  loadRecords();   // 1분 넘게 지났으면 통합 시트에서 새 기록 확인 (바뀐 게 있을 때만 다시 그림)
  const ss = seasons();
  if (!st.season || !ss.includes(st.season)) st.season = ss[0] || String(new Date().getFullYear());
  const DB = buildDB(st.season);
  if (!st.who && me.id) st.who = me.id;
  root.innerHTML = `<div class="rec">
    <section class="r-hero">
      <div class="r-hero-t"><span class="r-eyebrow">${esc(S.team.name)} · 경기기록</span><h1>${st.season} 시즌</h1>
        <small>${DB.games.length}경기 · 출전 ${DB.players.length}명</small></div>
      ${ss.length > 1 ? `<div class="r-seasons">${ss.map((y) => `<button type="button" data-season="${y}" class="${y === st.season ? 'on' : ''}">${y}</button>`).join('')}</div>` : ''}
    </section>
    <nav class="r-tabs" role="tablist">${[['games', 'ball', '경기 결과'], ['rank', 'trophy', '전체 순위'], ['me', 'user', '개인 기록']].map(([k, i, l]) =>
      `<button type="button" role="tab" data-rtab="${k}" aria-selected="${st.tab === k}">${ic(i)}${l}</button>`).join('')}</nav>
    <div class="r-view" data-rv></div>
    ${fromSheet() ? `<p class="r-src">📗 통합 시트 기록${sheetState().at ? ` · ${new Date(sheetState().at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 확인` : ''} · 진행 중인 경기는 앱 기록</p>` : ''}
  </div>`;
  const box = root.querySelector('[data-rv]');
  const draw = () => {
    root.querySelectorAll('[data-rtab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.rtab === st.tab));
    box.innerHTML = !DB.games.length ? `<section class="card"><div class="empty">${sheetPending() ? '통합 시트에서 기록을 불러오는 중이에요…' : '아직 기록된 경기가 없어요.'}</div></section>`
      : st.tab === 'rank' ? rankView(DB) : st.tab === 'me' ? meView(DB) : gamesView(DB);
  };
  draw();
  bind(root, DB, draw);
}

// ───────── 경기 결과 ─────────
function gameCard(DB, g, opts = {}) {
  const d = fmtD(g.date), ps = DB.byGame.get(g.id) || [];
  const moms = ps.filter((m) => m.mom).map((m) => esc(m.name));
  const scorers = ps.filter((m) => m.goals).sort((x, y) => y.goals - x.goals || x.team.localeCompare(y.team)).map((m) => `${esc(m.name)}${m.goals > 1 ? ` <b class="n">${m.goals}</b>` : ''}`);
  const lose = (t) => (g.win !== 'D' && g.win !== t ? 'lose' : '');
  const result = g.win === 'D' ? '<span class="r-tag">무승부</span>' : `<span class="r-tag ${g.win}">${esc(tname(g, g.win))} 승</span>`;
  const team = (t) => { const list = ps.filter((m) => m.team === t);
    return `<ul class="${t}"><li class="lh">${shirt(t)}${esc(tname(g, t))} <span class="muted n">${list.length}</span></li>${list.map((m) =>
      `<li class="${m.id === opts.me ? 'meline' : ''}"><button type="button" ${m.guest ? 'class="guest" disabled' : `data-p="${m.id}"`}>${esc(m.name)}</button><span class="marks">${m.goals ? `${ic('ball', 'xs')}${m.goals > 1 ? `<b class="n">${m.goals}</b>` : ''}` : ''}${m.mom ? ic('star', 'xs gold') : ''}</span></li>`).join('')}</ul>`; };
  const rounds = g.rounds.length > 1 ? `<div class="r-rounds">${g.rounds.map((r) => `<div class="rr"><span>${r.round}R</span><b class="n"><i class="A">${r.A}</i>:<i class="B">${r.B}</i></b></div>`).join('')}</div>` : '';
  return `<details class="r-game" ${opts.open ? 'open' : ''}><summary>
    <div class="g-top"><span class="when">${ic('calendar', 'xs')}<b>${esc(d.long)}</b>${esc(gLabel(g))}</span>${result}</div>
    <div class="r-sb">
      <div class="h A ${lose('A')}"><span class="t">${shirt('W')}${esc(tname(g, 'A'))}</span><span class="s n">${g.a}</span></div>
      <div class="h B ${lose('B')}"><span class="t">${shirt('W')}${esc(tname(g, 'B'))}</span><span class="s n">${g.b}</span></div>
      <span class="vs">VS</span></div>
    ${rounds}
    ${moms.length || scorers.length ? `<div class="g-info">
      ${moms.length ? `<div>${ic('star', 'sm gold')}<span><span class="lbl">MOM</span>${moms.join(', ')}</span></div>` : ''}
      ${scorers.length ? `<div>${ic('ball', 'sm')}<span>${scorers.join(' · ')}</span></div>` : ''}</div>` : ''}
    ${ps.length ? `<div class="g-more">${ic('users', 'xs')}<span class="o">출전 명단 보기</span><span class="c">명단 접기</span>${ic('chevron', 'xs rot')}</div>` : '<div style="height:14px"></div>'}
  </summary>${ps.length ? `<div class="r-lineups">${team('A')}${team('B')}</div>
    ${matchdayById(g.id) ? `<a class="r-detail" href="#/games/${g.id}">라운드별 기록 자세히 ${ic('chevron', 'xs')}</a>` : ''}` : ''}</details>`;
}

function gamesView(DB) {
  const G = DB.games;
  const aw = G.filter((g) => g.win === 'A').length, bw = G.filter((g) => g.win === 'B').length, dr = G.length - aw - bw;
  const goals = G.reduce((s, g) => s + g.a + g.b, 0);
  if (!st.selGame || !DB.gById.has(st.selGame)) st.selGame = G[G.length - 1].id;
  const md = Math.max(1, ...G.map((g) => Math.abs(g.a - g.b)));
  const cols = `grid-template-columns:repeat(${G.length},minmax(0,1fr))`;
  return `
    <div class="r-season">
      <div class="blocks">
        <div class="blk A"><span class="t">${shirt('W')}핑크팀</span><b class="big n">${aw}</b><span class="u">승</span>${icon('shirt', 'bg')}</div>
        <div class="blk B"><span class="t">블루팀${shirt('W')}</span><b class="big n">${bw}</b><span class="u">승</span>${icon('shirt', 'bg')}</div>
        <div class="draw"><b class="n">${dr}</b><span>무승부</span></div>
      </div>
      <div class="facts">
        <div class="fact"><span class="k">${ic('calendar', 'xs')}경기</span><b class="v n">${G.length}</b></div>
        <div class="fact"><span class="k">${ic('ball', 'xs')}총 득점</span><b class="v n">${goals}</b></div>
        <div class="fact"><span class="k">${ic('goalpost', 'xs')}경기당 골</span><b class="v n">${(goals / Math.max(1, G.length)).toFixed(1)}</b></div>
      </div>
    </div>
    <section class="r-card">
      ${cardHead('trend', '시즌 흐름', '막대를 누르면 아래에 그 경기')}
      <div class="r-flow" style="${cols}">${G.map((g) => {
        const cls = g.win === 'D' ? 'D' : g.win, h = Math.abs(g.a - g.b) / md * 50;
        const tip = `${gLabel(g)} · ${fmtD(g.date).short}\n핑크 ${g.a} : ${g.b} 블루\n${g.win === 'D' ? '무승부' : TEAM[g.win] + ' 승'}`;
        return `<button type="button" class="fcol ${g.id === st.selGame ? 'sel' : ''}" data-g="${g.id}" aria-label="${esc(fmtD(g.date).long)} 경기 보기" ${tipAttr(tip)}><i class="${cls}" style="${cls === 'D' ? '' : `height:${h}%`}"></i></button>`;
      }).join('')}</div>
      <div class="r-months" style="${cols}">${monthLabels(G)}</div>
      <div class="r-key r-flowkey"><span>${shirt('A', 'xs')}위 · 핑크 승</span><span><i class="dot D"></i>무승부</span><span>${shirt('B', 'xs')}아래 · 블루 승</span></div>
    </section>
    <div class="r-gsel" data-gsel>${gameSel(DB)}</div>
    <button type="button" class="r-more" data-gall>${st.showAll ? `${ic('list', 'sm')}전체 경기 기록 접기${ic('chevron', 'xs up')}` : `${ic('list', 'sm')}전체 경기 기록 보기 <span class="muted n">${G.length}</span>${ic('chevron', 'xs down')}`}</button>
    ${st.showAll ? `<div class="r-games">${[...G].reverse().map((g) => gameCard(DB, g)).join('')}</div>` : ''}`;
}
const gameSel = (DB) => { const g = DB.gById.get(st.selGame); return g ? `<div class="r-selhead">${ic('calendar', 'xs')}선택한 경기 <span class="muted">· 막대를 눌러 다른 경기 보기</span></div>${gameCard(DB, g)}` : ''; };

// ───────── 전체 순위 ─────────
function rankView(DB) {
  const pool = (k) => (METRIC[k].all ? DB.players : DB.ranked);
  const allMode = !!METRIC[st.sort].all, R = pool(st.sort);
  const k = st.sort, list = sortedBy(k, R), rk = DB.ranks[k];
  const unit = METRIC[k].unit ? `<small>${METRIC[k].unit}</small>` : '';
  const q = st.q.toLowerCase();
  const matched = list.filter((p) => !q || p.name.toLowerCase().includes(q));
  const shown = q ? matched : matched.slice(0, st.rankLimit);
  const top3 = q ? [] : shown.slice(0, 3);
  const mx = k === 'wr' ? 1 : Math.max(1, ...list.map((p) => p[k]));
  const rest = q ? 0 : matched.length - shown.length;
  const un = DB.players.filter((p) => p.gp < RANK_MIN).sort((a, b) => b.gp - a.gp || ko(a.name, b.name)).filter((p) => !q || p.name.toLowerCase().includes(q));
  return `
    <p class="r-note">${ic('info', 'xs')}<span>${allMode
      ? `${METRIC[k].t} 순위는 한 경기라도 출전한 <b>전체 ${R.length}명</b>을 매겨요. 승률·득점·MOM은 ${RANK_MIN}경기 이상 ${DB.ranked.length}명만.`
      : `${METRIC[k].t} 순위는 <b>${RANK_MIN}경기 이상</b> 출전한 ${R.length}명끼리 매겨요.`}</span></p>
    <div class="r-awards">${Object.keys(METRIC).map((kk) => {
      const L = sortedBy(kk, pool(kk)); if (!L.length) return `<div class="r-award none"><span class="ic">${ic(METRIC[kk].icon)}</span><span class="k">${METRIC[kk].award}</span><span class="nm muted">-</span></div>`;
      const top = L[0], ties = L.filter((p) => p[kk] === top[kk]).length - 1;
      return `<button class="r-award" type="button" data-p="${top.id}" ${tipAttr(`${METRIC[kk].award} ${top.name} ${METRIC[kk].fmt(top)}${METRIC[kk].unit}${ties ? `\n공동 ${ties + 1}명` : ''}`)}>
        <span class="ic">${ic(METRIC[kk].icon)}</span><span class="k">${METRIC[kk].award}</span><span class="nm">${esc(top.name)}</span>
        <span class="v n">${METRIC[kk].fmt(top)}${METRIC[kk].unit ? `<small>${METRIC[kk].unit}</small>` : ''}</span>${ties ? `<span class="tie">외 ${ties}명</span>` : ''}</button>`;
    }).join('')}</div>
    <section class="r-card">
      <div class="r-seg" role="group" aria-label="순위 기준">${Object.keys(METRIC).map((kk) => `<button type="button" data-k="${kk}" aria-pressed="${kk === k}">${ic(METRIC[kk].icon, 'xs')}${METRIC[kk].t}</button>`).join('')}</div>
      ${top3.length ? `<div class="r-top3">${top3.map((p) => { const r = rk.get(p.id); return `<button class="t3 r${Math.min(r, 3)}" type="button" data-p="${p.id}"><span class="rk n">${r}</span><span class="nm">${esc(p.name)}</span><span class="v n">${METRIC[k].fmt(p)}${unit}</span></button>`; }).join('')}</div>` : ''}
      <div class="r-search">${ic('search', 'sm')}<input data-q placeholder="이름으로 찾기" autocomplete="off" value="${esc(st.q)}"></div>
      <ol class="r-lb">${shown.slice(top3.length).map((p) => `<li data-p="${p.id}" class="${p.id === me.id ? 'me' : ''}">
        <span class="rk n">${rk.get(p.id)}</span>
        <div><div class="nm"><span>${esc(p.name)}</span>${p.id === me.id ? '<em class="r-mine">나</em>' : ''}</div><div class="sub">${p.gp}경기 · ${p.w}승 ${p.d}무 ${p.l}패</div>
          <div class="trk"><i style="width:${(p[k] / mx) * 100}%"></i></div></div>
        <span class="v n">${METRIC[k].fmt(p)}${unit}</span></li>`).join('') || (top3.length ? '' : '<li class="muted empty-li">조건에 맞는 선수가 없어요.</li>')}</ol>
      ${rest > 0 || (st.rankLimit > 10 && !q) ? `<button type="button" class="r-more in" data-lbmore>${rest > 0 ? `${ic('chevron', 'xs down')}${shown.length + 1}~${shown.length + Math.min(10, rest)}위 더보기 <span class="muted">· 남은 ${rest}명</span>` : `${ic('chevron', 'xs up')}10위까지만 보기`}</button>` : ''}
    </section>
    ${allMode ? '' : `<details class="r-card r-un" ${q && un.length && !list.some((p) => p.name.toLowerCase().includes(q)) ? 'open' : ''}><summary><span class="r-ci">${ic('hourglass')}</span><h3>순위 산정 전 <span class="muted n">${un.length}</span><small class="muted">명</small></h3>${ic('chevron', 'chev down')}</summary>
      <p class="r-note flat">${RANK_MIN}경기를 채우면 순위에 들어가요.</p>
      <ul class="r-ur">${un.map((p) => `<li data-p="${p.id}"><span>${esc(p.name)}</span><span class="trk" ${tipAttr(`${p.gp}/${RANK_MIN}경기`)}><i style="width:${(p.gp / RANK_MIN) * 100}%"></i></span><span class="left n">${p.gp}/${RANK_MIN}</span></li>`).join('')}</ul></details>`}
    <p class="r-note">${ic('info', 'xs')}<span>승점 = 승 3점 · 무 1점. 승률 = 승 ÷ (승+패), 무승부는 빠져요.</span></p>`;
}

// ───────── 개인 기록 ─────────
function side(logs, t) {
  const r = logs.filter((m) => m.team === t);
  return { n: r.length, w: r.filter((m) => m.res === 'W').length, d: r.filter((m) => m.res === 'D').length, l: r.filter((m) => m.res === 'L').length };
}
function halves(G) {
  const H = [{ t: '전반기', sub: '1~6월', games: [] }, { t: '하반기', sub: '7~12월', games: [] }];
  let last = 0;
  G.forEach((g) => { const d = fmtD(g.date); const h = d.ok ? (d.m <= 6 ? 0 : 1) : last; last = h; H[h].games.push(g); });
  return H;
}
function meView(DB) {
  const p = st.who && DB.byId.get(st.who);
  const names = [...DB.players].sort((a, b) => ko(a.name, b.name));
  const pick = `<div class="r-pick"><div class="r-search">${ic('search', 'sm')}<input data-who list="r-names" placeholder="닉네임으로 찾기" autocomplete="off" enterkeyhint="search" aria-label="선수 찾기"></div>
    ${me.id && st.who !== me.id ? `<button type="button" class="r-mebtn" data-p="${me.id}">${ic('user', 'sm')}내 기록</button>` : ''}</div>
    <datalist id="r-names">${names.map((x) => `<option value="${esc(x.name)}"></option>`).join('')}</datalist>`;
  if (!p || !p.gp) {
    const who = st.who && (S.members.find((m) => m.id === st.who)?.name || st.who);
    return `${pick}
      ${st.who ? `<section class="r-card r-note-card">${ic('alert', 'sm')}<span><b>${esc(who)}</b> ${p || S.members.some((m) => m.id === st.who) ? `님은 ${st.season} 시즌 출전 기록이 아직 없어요.` : '기록을 찾지 못했어요.'}</span></section>` : ''}
      <section class="r-card">${cardHead('users', '이름을 눌러 기록 보기', `${names.length}명 · 가나다순`)}
      <div class="r-chips">${names.map((x) => `<button class="r-chip" type="button" data-p="${x.id}">${esc(x.name)}<small class="n">${x.gp}</small></button>`).join('')}</div></section>`;
  }
  const logs = DB.mp.filter((m) => m.id === p.id).sort((x, y) => y.g.idx - x.g.idx);
  const isRanked = p.gp >= RANK_MIN;
  const rOf = (k) => (isRanked || METRIC[k].all ? DB.ranks[k].get(p.id) : null);
  const tile = (k, label) => { const r = rOf(k);
    return `<div class="tile"><span class="k">${ic(METRIC[k].icon, 'xs')}${label}</span><b class="v n">${METRIC[k].fmt(p)}</b><span class="r ${r && r <= 3 ? 'top' : ''}">${r ? `${r <= 3 ? ic('medal', 'xs') : ''}${r}위` : '&nbsp;'}</span></div>`; };
  const cmpRow = (k) => {
    const v = p[k], mx = DB.agg.max[k], av = DB.agg.avg[k];
    const avTxt = k === 'wr' ? pctTxt(av) : av.toFixed(1);
    return `<div class="cmp-row">${ic(METRIC[k].icon, 'sm')}<span class="lab">${METRIC[k].t}</span>
      <div class="ctrk" ${tipAttr(`${METRIC[k].t} ${METRIC[k].fmt(p)}${METRIC[k].unit}\n팀 평균 ${avTxt}\n팀 최고 ${k === 'wr' ? '100%' : mx}`)}><i class="fill" style="width:${Math.min(100, (v / mx) * 100)}%"></i><i class="avg" style="left:calc(${Math.min(100, (av / mx) * 100)}% - 1.5px)"></i></div>
      <span class="val n">${METRIC[k].fmt(p)}</span></div>`;
  };
  const A = side(logs, 'A'), B = side(logs, 'B');
  const teamCard = (t, s) => `<div class="tcard ${t}"><span class="tt">${shirt(t)}${TEAM[t]}팀 승률</span><b class="wr n">${s.n ? pctTxt(s.w + s.l ? s.w / (s.w + s.l) : 0) : '-'}</b>
    ${bar3([{ k: 'W', v: s.w, tip: `승 ${s.w}` }, { k: 'D', v: s.d, tip: `무 ${s.d}` }, { k: 'L', v: s.l, tip: `패 ${s.l}` }])}<span class="sm">${s.n}경기 · ${s.w}승 ${s.d}무 ${s.l}패</span></div>`;
  const byG = new Map(logs.map((m) => [m.gid, m]));
  if (st.meSelFor !== p.id || !DB.gById.has(st.meSel)) { st.meSel = logs.length ? logs[0].gid : null; st.meSelFor = p.id; st.meAll = false; }
  const pr = rOf('pts');
  return `${pick}
    <div class="r-pcard">
      <div class="band"><span class="r-eyebrow">Player · ${st.season}</span>
        <h2>${esc(p.name)}${p.id === me.id ? '<em class="r-mine">나</em>' : ''}</h2>
        <span class="sub">${ic('medal', 'xs')}승점 순위 · 출전한 ${DB.players.length}명 중</span>
        <div class="ptsrow"><b class="n">${p.pts}</b><span>승점</span>${pr ? `<span class="rkb"><b class="n">${pr}</b><small>위</small></span>` : ''}</div></div>
      <div class="body">
        ${isRanked ? '' : `<div class="prog"><span>승률·득점·MOM 순위는 ${RANK_MIN}경기부터 · <b>${RANK_MIN - p.gp}경기</b> 남았어요 · <span class="n">${p.gp}/${RANK_MIN}</span></span><div class="trk"><i style="width:${(p.gp / RANK_MIN) * 100}%"></i></div></div>`}
        <div class="tiles">${tile('gp', '출전')}${tile('g', '득점')}${tile('mom', 'MOM')}${tile('wr', '승률')}</div>
        <div class="teams">${teamCard('A', A)}${teamCard('B', B)}</div>
        <div class="wdl">${bar3([{ k: 'W', v: p.w, tip: `승 ${p.w}` }, { k: 'D', v: p.d, tip: `무 ${p.d}` }, { k: 'L', v: p.l, tip: `패 ${p.l}` }])}
          <div class="r-key"><span><i class="dot W"></i>승 <b class="n">${p.w}</b></span><span><i class="dot D"></i>무 <b class="n">${p.d}</b></span><span><i class="dot L"></i>패 <b class="n">${p.l}</b></span>
          <span class="push">${ic('clock', 'xs')}지각 <b class="n">${p.late}</b></span><span>${ic('alert', 'xs')}자책골 <b class="n">${p.og}</b></span></div></div>
      </div>
    </div>
    <section class="r-card">${cardHead('calendar', '시즌 출전', `${logs.length}/${DB.games.length}경기 출전`)}
      <div class="halves">${halves(DB.games).map((h) => { const n = h.games.filter((g) => byG.has(g.id)).length;
        return `<div class="half"><div class="hh"><b>${h.t}</b><span class="muted">${h.sub}</span><span class="muted n">${n}/${h.games.length}</span></div>
        ${h.games.length ? `<div class="pgrid">${h.games.map((g) => { const m = byG.get(g.id), d = fmtD(g.date);
          const tip = m ? `${gLabel(g)} · ${d.short}\n${TEAM[m.team]} ${m.team === 'A' ? g.a : g.b}:${m.team === 'A' ? g.b : g.a} ${RES[m.res]}${m.goals ? ` · ${m.goals}골` : ''}${m.mom ? ' · MOM' : ''}` : `${gLabel(g)} · ${d.short}\n불참`;
          return `<button type="button" class="pcell ${m ? m.res : 'off'} ${g.id === st.meSel ? 'sel' : ''}" data-mg="${g.id}" ${tipAttr(tip)}><b>${m ? RES[m.res] : '–'}</b><span class="n">${d.short}</span>${m && (m.goals || m.mom) ? `<i class="pip ${m.mom ? 'mom' : ''}"></i>` : ''}</button>`;
        }).join('')}</div>` : '<p class="r-note flat">아직 경기가 없어요.</p>'}</div>`; }).join('')}</div>
      <div class="r-key"><span><i class="dot W"></i>승</span><span><i class="dot D"></i>무</span><span><i class="dot L"></i>패</span><span><i class="dot off"></i>불참</span><span><i class="pipkey"></i>득점</span><span><i class="pipkey mom"></i>MOM</span></div>
      <p class="r-note flat">${ic('info', 'xs')}<span>칸을 누르면 바로 아래에 그 경기 기록이 나와요.</span></p>
    </section>
    <div data-mesel>${meSel(DB, p)}</div>
    <section class="r-card">${cardHead('activity', '팀 평균과 비교', '노란 선 = 팀 평균')}<div class="cmp">${['pts', 'wr', 'g', 'mom', 'gp'].map(cmpRow).join('')}</div></section>
    ${logs.length ? `<button type="button" class="r-more" data-meall>${st.meAll ? `${ic('list', 'sm')}전체 경기 기록 접기${ic('chevron', 'xs up')}` : `${ic('list', 'sm')}전체 경기 기록 보기 <span class="muted n">${logs.length}</span>${ic('chevron', 'xs down')}`}</button>
    ${st.meAll ? `<section class="r-card">${cardHead('list', '전체 경기 기록', '최신순')}<ul class="r-log">${logs.map((m) => { const g = m.g, d = fmtD(g.date);
      const my = m.team === 'A' ? g.a : g.b, opp = m.team === 'A' ? g.b : g.a;
      return `<li data-mg="${g.id}"><span class="rc ${m.res}">${RES[m.res]}</span>
        <div><div class="l1">${shirt(m.team, 'xs')}${esc(tname(g, m.team))}<span class="sc n">${my} : ${opp}</span></div><div class="l2">${esc(d.long)}${gLabel(g) ? ` · ${esc(gLabel(g))}` : ''}</div></div>
        <span class="marks">${m.goals ? `<span>${ic('ball', 'sm')}<b class="n">${m.goals}</b></span>` : ''}${m.mom ? `<span>${ic('star', 'sm gold')}</span>` : ''}${m.late ? `<span title="지각">${ic('clock', 'sm')}</span>` : ''}${m.og ? `<span title="자책골">${ic('alert', 'sm')}</span>` : ''}</span></li>`; }).join('')}</ul></section>` : ''}` : ''}`;
}
function meSel(DB, p) {
  const g = st.meSel && DB.gById.get(st.meSel);
  if (!p || !g) return '';
  const m = (DB.byGame.get(g.id) || []).find((x) => x.id === p.id);
  const head = m
    ? `<span class="rc ${m.res}">${RES[m.res]}</span><span class="who"><b>${esc(p.name)}</b> · ${shirt(m.team, 'xs')}${esc(tname(g, m.team))}${m.goals ? ` · ${ic('ball', 'xs')}<b class="n">${m.goals}</b>골` : ''}${m.mom ? ` · ${ic('star', 'xs gold')}MOM` : ''}${m.late ? ` · ${ic('clock', 'xs')}지각` : ''}${m.og ? ` · ${ic('alert', 'xs')}자책골 ${m.og}` : ''}</span>`
    : `<span class="rc D">–</span><span class="who"><b>${esc(p.name)}</b> · 불참한 경기</span>`;
  return `<div class="r-selhead me">${head}</div>${gameCard(DB, g, { me: p.id })}`;
}

// ───────── 이벤트 ─────────
function bind(root, DB, draw) {
  root.onclick = (e) => {
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t('[data-season]'))) { st.season = b.dataset.season; st.selGame = null; render(root); return; }
    if ((b = t('[data-rtab]'))) { st.tab = b.dataset.rtab; draw(); window.scrollTo({ top: 0 }); return; }
    if ((b = t('.fcol[data-g]'))) { st.selGame = b.dataset.g; hideTip(); root.querySelectorAll('.fcol').forEach((x) => x.classList.toggle('sel', x === b)); root.querySelector('[data-gsel]').innerHTML = gameSel(DB); return; }
    if ((b = t('[data-mg]'))) {
      st.meSel = b.dataset.mg; hideTip();
      root.querySelectorAll('.pcell').forEach((x) => x.classList.toggle('sel', x.dataset.mg === st.meSel));
      const box = root.querySelector('[data-mesel]'); box.innerHTML = meSel(DB, DB.byId.get(st.who));
      if (b.tagName === 'LI') box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t('[data-gall]')) { st.showAll = !st.showAll; draw(); return; }
    if (t('[data-meall]')) { st.meAll = !st.meAll; draw(); return; }
    if (t('[data-lbmore]')) { const total = (METRIC[st.sort].all ? DB.players : DB.ranked).length; st.rankLimit = st.rankLimit < total ? st.rankLimit + 10 : 10; draw(); return; }
    if ((b = t('.r-seg [data-k]'))) { st.sort = b.dataset.k; st.rankLimit = 10; draw(); return; }
    if ((b = t('[data-p]'))) { e.preventDefault(); hideTip(); st.who = b.dataset.p; st.tab = 'me'; draw(); window.scrollTo({ top: 0 }); }
  };
  root.oninput = (e) => {
    if (e.target.matches('[data-q]')) {
      st.q = e.target.value.trim(); const pos = e.target.selectionStart; draw();
      const q = root.querySelector('[data-q]'); q.focus(); try { q.setSelectionRange(pos, pos); } catch {}
    }
  };
  root.onchange = (e) => {
    if (!e.target.matches('[data-who]')) return;
    const v = e.target.value.trim(); if (!v) return;
    const hit = DB.players.find((p) => p.name === v) || S.members.find((m) => m.name === v);
    st.who = hit ? hit.id : v; e.target.blur(); draw();
  };
  initTip();
}

// ───────── 툴팁 (막대·칸에 손가락/마우스를 올리면) ─────────
let tipEl = null;
const hideTip = () => { if (tipEl) tipEl.hidden = true; };
function initTip() {
  if (tipEl) return;
  tipEl = document.createElement('div'); tipEl.className = 'r-tip'; tipEl.hidden = true; tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);
  const place = (x, y) => { const r = tipEl.getBoundingClientRect(); let l = x + 12, tp = y - r.height - 12;
    if (l + r.width > innerWidth - 8) l = x - r.width - 12; if (l < 8) l = 8; if (tp < 8) tp = y + 16;
    tipEl.style.left = l + 'px'; tipEl.style.top = tp + 'px'; };
  document.addEventListener('pointerover', (e) => { const el = e.target.closest?.('.rec [data-tip]'); if (!el) return; tipEl.textContent = el.dataset.tip; tipEl.hidden = false; place(e.clientX, e.clientY); });
  document.addEventListener('pointermove', (e) => { if (!tipEl.hidden) place(e.clientX, e.clientY); });
  document.addEventListener('pointerout', (e) => { const el = e.target.closest?.('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
  addEventListener('scroll', hideTip, { passive: true });
  addEventListener('hashchange', hideTip);
}
