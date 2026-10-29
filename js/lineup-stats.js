// 라운드별 출전 현황 — 주장이 정한 라운드별 포지션으로 선수마다 맡은 자리 · 대기 · 출전 횟수
//  · 경기 화면(포지션): 주장은 팀 전체 표, 그 밖에는 내 출전 현황 + [팀 전체 출전 현황 펼쳐 보기]
//  · 경기 기록(경기 상세): 두 팀 표 — 팀 이름을 눌러 펼쳐 봄 (주장이 공개했거나 경기가 끝난 팀)
import { S, nameOf } from './state.js?v=0.1.87';
import { rosters, fmtOf, teamColor } from './domain.js?v=0.1.87';
import { TEAM_COLORS } from './config.js?v=0.1.87';
import { esc } from './util.js?v=0.1.87';
import { teamLabel, colorChip } from './ui.js?v=0.1.87';

export const POS = { GK: 'GK', LB: 'LB', RB: 'RB', LCB: 'CB', RCB: 'CB', CB: 'CB', LM: 'LM', RM: 'RM', LCM: 'CM', RCM: 'CM', CM: 'CM', LDM: 'DM', RDM: 'DM',
  LAM: 'LW', RAM: 'RW', CAM: 'AM', LW: 'LW', RW: 'RW', ST: 'ST', LS: 'ST', RS: 'ST', LWB: 'LWB', RWB: 'RWB' };
const hexOf = (md, i) => TEAM_COLORS.find((c) => c.key === teamColor(md, i)) || { hex: '#64748b', text: '#fff' };
const nRounds = (md) => Math.max(fmtOf(md).rounds, ...S.games.filter((g) => g.matchdayId === md.id).map((g) => g.round || 0));
const lineupOf = (md, ti, r) => md.lineups?.[ti]?.[r] || null;
// 라운드 심판 — 라운드당 주심 1 · 부심 2
//  · 주심: 두 팀이 라운드마다 번갈아 1명 (md.refStart = 1라운드 주심을 내는 팀, 기본 왼쪽 팀)
//  · 부심: 라운드마다 두 팀이 1명씩
//  각 팀 주장이 그 라운드 대기 선수 중에서 고름 (lineups[팀][라운드].ref = { m: 주심, a1: 부심 })
export const REF_KEYS = [['m', '주심'], ['a1', '부심']];
// 주심 순서: 운영진·주장이 [순서 바꾸기]로 정한 값 → 없으면 이미 주심을 정한 라운드에서 거꾸로 맞춤
//  (예: 오른쪽 팀 순서 기본값과 달리 왼쪽 팀 주장이 2·4라운드 주심을 먼저 정했으면 왼쪽 팀 = 짝수 라운드)
export function refStartOf(md) {
  if (md.refStart === 0 || md.refStart === 1) return md.refStart;
  const rs = Object.keys({ ...(md.lineups?.[0] || {}), ...(md.lineups?.[1] || {}) }).map(Number).filter((r) => r > 0).sort((a, b) => a - b);
  for (const r of rs) {
    const has = [0, 1].filter((ti) => md.lineups?.[ti]?.[r]?.ref?.m);
    if (has.length === 1) return ((has[0] - (r - 1)) % 2 + 2) % 2;
  }
  return 0;
}
export const mainTeam = (md, r) => (refStartOf(md) + r - 1) % 2;   // 이 라운드 주심을 내는 팀
export function refOf(md, ti, r) {
  const lu = lineupOf(md, ti, r), ros = rosters(md)[ti] || [], placed = new Set(Object.values(lu?.s || {}));
  const out = {};
  REF_KEYS.forEach(([k]) => { if (k === 'm' && mainTeam(md, r) !== ti) return; const id = lu?.ref?.[k]; if (id && ros.includes(id) && !placed.has(id)) out[k] = id; });
  return out;
}
export const refRole = (ref, id) => (ref.m === id ? '주심' : ref.a1 === id ? '부심' : '');
export const lineupShown = (md, ti) => md.status === 'played' || !!md.lineupPub?.[ti];

export function playStats(md, ti) {
  const R = nRounds(md), ros = rosters(md)[ti] || [];
  const set = [...Array(R)].map((_, k) => !!Object.keys(lineupOf(md, ti, k + 1)?.s || {}).length);
  const rows = ros.map((id) => {
    // 자리에 있으면 포지션, 대기 중 심판이면 { ref: '주심' | '부심' }
    const cells = [...Array(R)].map((_, k) => { const s = lineupOf(md, ti, k + 1)?.s || {}; const key = Object.keys(s).find((x) => s[x] === id);
      if (key) return POS[key] || key; const rr = refRole(refOf(md, ti, k + 1), id); return rr ? { ref: rr } : null; });
    return { id, name: nameOf(id, md), cells, n: cells.filter((c) => typeof c === 'string').length, refs: cells.filter((c) => c?.ref).length };
  }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko'));
  return { R, set, rows, anyRef: rows.some((r) => r.refs) };
}
const cell = (p, ok) => (p?.ref ? `<span class="rf ${p.ref === '주심' ? 'm' : ''}">${p.ref}</span>` : p ? `<i class="${p === 'GK' ? 'gk' : ''}">${p}</i>` : ok ? '<span class="off">대기</span>' : '<span class="na">–</span>');

// 팀 전체 표 (cur: 지금 보고 있는 라운드 강조, title: 머리 대신 팀 이름 등)
export function statsTable(md, ti, { cur = 0, title = '라운드별 출전 현황', open = true } = {}) {
  const st = playStats(md, ti), hx = hexOf(md, ti);
  const ns = st.rows.map((r) => r.n), setN = st.set.filter(Boolean).length;
  return `<details class="lp-stats" ${open ? 'open' : ''} style="--tc:${hx.hex};--ti:${hx.text}"><summary><b>${title}</b>
      <small>${setN ? `정한 라운드 ${setN}/${st.R} · 출전 ${Math.min(...ns)}~${Math.max(...ns)}회` : '아직 정한 라운드가 없어요'}</small></summary>
    <div class="lps-wrap"><table class="lps"><thead><tr><th class="nm">선수</th>${st.set.map((ok, k) => `<th class="${k + 1 === cur ? 'cur' : ''}">${k + 1}R${ok ? '' : '<small>미정</small>'}</th>`).join('')}<th class="n">출전</th>${st.anyRef ? '<th class="n">심판</th>' : ''}</tr></thead>
    <tbody>${st.rows.map((r) => `<tr><td class="nm">${esc(r.name)}</td>${r.cells.map((p, k) => `<td class="${k + 1 === cur ? 'cur' : ''}">${cell(p, st.set[k])}</td>`).join('')}<td class="n ${st.anyRef ? 'mid' : ''}"><b>${r.n}</b></td>${st.anyRef ? `<td class="n rfn">${r.refs ? `<b>${r.refs}</b>` : '<span class="na">–</span>'}</td>` : ''}</tr>`).join('')}</tbody></table></div>
  </details>`;
}

// 내 출전 현황 한 줄 (팀원 화면)
export function myStats(md, ti, id, cur = 0) {
  const st = playStats(md, ti), r = st.rows.find((x) => x.id === id), hx = hexOf(md, ti);
  if (!r) return '';
  return `<div class="lp-mine" style="--tc:${hx.hex};--ti:${hx.text}"><div class="lpm-hd"><b>내 출전 현황</b><small>${st.R}라운드 중 <em>${r.n}</em>라운드 출전${r.refs ? ` · 심판 <em>${r.refs}</em>번` : ''}</small></div>
    <div class="lpm-row">${r.cells.map((p, k) => `<span class="${k + 1 === cur ? 'cur' : ''}"><small>${k + 1}R</small>${cell(p, st.set[k])}</span>`).join('')}</div></div>`;
}

// 경기 기록 화면 카드: 두 팀 (보여 줄 수 있는 팀만)
export function statsCard(md) {
  const ros = rosters(md);
  const teams = ros.map((_, i) => i).filter((i) => lineupShown(md, i) && Object.keys(md.lineups?.[i] || {}).length);
  if (!teams.length) return '';
  return `<section class="card lps-card"><h2>라운드별 출전 현황 <small>주장이 정한 포지션 기준</small></h2>
    ${teams.map((i) => statsTable(md, i, { title: `${colorChip(teamColor(md, i), teamLabel(md, i))}`, open: false })).join('')}</section>`;   // 팀 이름을 눌러 펼쳐 보기
}
