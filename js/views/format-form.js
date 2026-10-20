// 경기 방식 입력 폼 — 설정(기본값)과 경기일 수정(그날만 변경)에서 같이 사용
import { TEAM_COLORS } from '../config.js?v=0.1.35';

const sel = (name, value, opts) => `<select name="${name}">${opts.map(([v, l]) =>
  `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

export function formatFields(f) {
  const colorOpts = TEAM_COLORS.map((c) => [c.key, c.label]);
  return `<div class="fmt">
    <div class="row">
      <label>팀 수${sel('teams', f.teams, [[2, '2팀'], [3, '3팀'], [4, '4팀']])}</label>
      <label>라운드 수<input type="number" name="rounds" min="1" max="12" value="${f.rounds}"></label>
    </div>
    <label>결과 계산${sel('scoring', f.scoring, [['sum', '라운드 점수 합산 → 경기일 1경기 (2팀)'], ['each', '라운드마다 1경기씩 따로']])}</label>
    <label>팀 색${sel('teamMode', f.teamMode, [['fixed', '고정 (아래 순서대로)'], ['choose', '드래프트 후 주장이 선택']])}</label>
    <div class="row fixed-colors">${[0, 1, 2, 3].map((i) =>
      `<label class="${i >= f.teams ? 'hide' : ''}">${i + 1}번 주장${sel('fc' + i, f.fixedColors?.[i] || TEAM_COLORS[i].key, colorOpts)}</label>`).join('')}</div>
    <div class="row">
      <label>최소 인원<input type="number" name="minPlayers" min="0" value="${f.minPlayers}"></label>
      <label>최대 정원<input type="number" name="capacity" min="0" value="${f.capacity}"></label>
    </div>
    <label>신청 마감${sel('closeRule', f.closeRule || 'thu', [['thu', '경기일 전 목요일 0시에 자동 마감'], ['manual', '운영진이 직접 마감']])}</label>
    <label>드래프트 순서${sel('draft', f.draft, [['snake', '스네이크 (1-2-2-1…)'], ['round', '순환 (1-2-1-2…)']])}</label>
    <p class="muted small">최소 인원을 채워도 신청은 마감 시각까지 계속 받아요. 최대 정원 0은 제한 없음(정원을 넣으면 넘는 인원은 대기). 합산 방식은 2팀일 때만 적용되고, 3팀 이상이면 라운드마다 따로 계산해요.</p>
  </div>`;
}

export function bindFormatFields(form) {
  const upd = () => {
    const n = +form.teams.value;
    form.querySelectorAll('.fixed-colors label').forEach((l, i) => l.classList.toggle('hide', i >= n || form.teamMode.value !== 'fixed'));
  };
  form.teams.addEventListener('change', upd); form.teamMode.addEventListener('change', upd); upd();
}

export function readFormat(form) {
  return {
    teams: +form.teams.value, rounds: Math.max(1, +form.rounds.value || 1), scoring: form.scoring.value,
    teamMode: form.teamMode.value, fixedColors: [0, 1, 2, 3].map((i) => form['fc' + i].value),
    minPlayers: Math.max(0, +form.minPlayers.value || 0), capacity: Math.max(0, +form.capacity.value || 0), closeRule: form.closeRule.value, draft: form.draft.value,
  };
}
