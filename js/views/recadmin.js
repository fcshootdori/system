// 운영 › 기록 관리 — 순위 기준(최소 출전 경기), 승점·승률 계산 방법
//  저장하면 meta/team.recordRules · meta/team.winRate 에 들어가고, 모든 회원의 기록 화면에 바로 반영돼요
import { S } from '../state.js?v=0.1.96';
import { db } from '../store.js?v=0.1.96';
import { esc, toast } from '../util.js?v=0.1.96';
import { RULES_DEFAULT, recordRules, RATE_TEXT } from '../domain.js?v=0.1.96';
import { buildDB, seasons, METRIC, sortedBy } from '../records-data.js?v=0.1.96';
import { pushRules, canPush } from '../record-sheet.js?v=0.1.96';

let draft = null;   // 저장 전 고치는 중인 값 (화면이 다시 그려져도 유지)
let season = '';

const RATES = [['wl', '승 ÷ (승+패) · 무승부 제외'], ['win', '승 ÷ 경기 수'], ['point', '(승 + 무×0.5) ÷ 경기 수']];

// 미리 보기: 고치는 값으로 잠깐 바꿔서 순위를 계산해 봄
function preview(rules, rate) {
  const keep = { rr: S.team.recordRules, wr: S.team.winRate };
  S.team.recordRules = rules; S.team.winRate = rate;
  try { return buildDB(season); } finally { S.team.recordRules = keep.rr; S.team.winRate = keep.wr; }
}

export function render(root) {
  const cur = recordRules();
  const v = draft || { min: cur.min, minFor: { ...cur.minFor }, win: cur.win, draw: cur.draw, rate: cur.rate };
  const ss = seasons();
  if (!season || !ss.includes(season)) season = ss[0] || '';
  const changed = JSON.stringify(v) !== JSON.stringify({ min: cur.min, minFor: cur.minFor, win: cur.win, draw: cur.draw, rate: cur.rate });
  const isDefault = v.min === RULES_DEFAULT.min && v.win === RULES_DEFAULT.win && v.draw === RULES_DEFAULT.draw && v.rate === 'wl'
    && Object.keys(RULES_DEFAULT.minFor).every((k) => !!v.minFor[k] === RULES_DEFAULT.minFor[k]);

  let pv = null;
  try { pv = season ? preview({ min: v.min, minFor: v.minFor, win: v.win, draw: v.draw }, v.rate) : null; } catch { pv = null; }
  const top = (k) => { if (!pv) return ''; const L = sortedBy(k, METRIC[k].all ? pv.players : pv.ranked); return L[0] ? `${esc(L[0].name)} <small>${METRIC[k].fmt(L[0])}${METRIC[k].unit}</small>` : '<span class="muted">-</span>'; };

  root.innerHTML = `
  <section class="card ra">
    <h1>기록 관리</h1>
    <p class="muted small">순위 기준과 승점·승률 계산 방법을 정해요. 저장하면 모든 회원의 <b>경기기록 › 순위 · 개인 기록</b>에 바로 반영돼요 (경기 결과 자체는 바뀌지 않아요).</p>
  </section>

  <section class="card ra">
    <h2>순위 기준</h2>
    <label class="ra-num">최소 출전 경기
      <span class="ra-step"><button type="button" class="btn ghost sm" data-step="-1" aria-label="1경기 줄이기">−</button>
      <input type="number" name="min" min="0" max="100" inputmode="numeric" value="${v.min}">
      <button type="button" class="btn ghost sm" data-step="1" aria-label="1경기 늘리기">＋</button> 경기 이상</span></label>
    <p class="tiny muted">0으로 두면 한 경기라도 뛴 회원은 모두 순위에 들어가요.</p>
    <div class="fld"><span class="fl">이 기준을 적용할 순위</span>
      <div class="ra-chk">${Object.keys(METRIC).map((k) => `<label class="chip-chk"><input type="checkbox" data-minfor="${k}" ${v.minFor[k] ? 'checked' : ''}><span>${METRIC[k].t}</span></label>`).join('')}</div>
      <p class="tiny muted">체크한 순위는 기준 경기 이상 뛴 회원끼리, 체크하지 않은 순위는 출전한 회원 전체로 매겨요.</p>
    </div>
  </section>

  <section class="card ra">
    <h2>승점 · 승률 계산</h2>
    <div class="row ra-pts">
      <label>승리<span class="ra-in"><input type="number" name="win" min="0" max="10" inputmode="numeric" value="${v.win}">점</span></label>
      <label>무승부<span class="ra-in"><input type="number" name="draw" min="0" max="10" inputmode="numeric" value="${v.draw}">점</span></label>
      <label>패배<span class="ra-in"><input value="0" disabled>점</span></label>
    </div>
    <label>승률<select name="rate">${RATES.map(([k, l]) => `<option value="${k}" ${v.rate === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </section>

  <section class="card ra ra-pv">
    <h2>미리 보기 ${ss.length > 1 ? `<select class="ra-season" data-season aria-label="시즌">${ss.map((s) => `<option ${s === season ? 'selected' : ''}>${s}</option>`).join('')}</select>` : season ? `<small>${season} 시즌</small>` : ''}</h2>
    ${pv ? `<p class="small">출전 <b>${pv.players.length}명</b> 중 기준(${v.min}경기 이상)을 채운 회원 <b>${pv.ranked.length}명</b></p>
      <ul class="ra-top">${Object.keys(METRIC).map((k) => `<li><span class="k">${METRIC[k].award}<small>${v.minFor[k] && v.min ? `${v.min}경기 이상` : '전체'}</small></span><span class="v">${top(k)}</span></li>`).join('')}</ul>`
      : '<p class="muted small">아직 기록된 경기가 없어요.</p>'}
  </section>

  <div class="ra-act">
    <button class="btn full big" data-save ${changed ? '' : 'disabled'}>${changed ? '저장하고 모두에게 적용' : '저장된 기준이에요'}</button>
    <div class="row">${changed ? '<button class="btn ghost" data-undo>고친 것 취소</button>' : ''}${isDefault ? '' : '<button class="btn ghost" data-reset>기본값으로 (15경기 · 승3 무1 · 무승부 제외)</button>'}</div>
  </div>

  <section class="card ra">
    <h2>바로 가기</h2>
    <div class="row wrap"><a class="btn ghost" href="#/results">경기기록 화면 보기</a><a class="btn ghost" href="#/settings">통합 시트 연결 (설정)</a></div>
    <p class="tiny muted">경기 결과·득점 수정은 일정 › 지난 경기에서, 끝난 경기 기록 보내기는 설정 › 통합 시트에서 해요. 저장하면 연결 키가 있는 이 기기에서 통합 시트 <b>개인기록</b> 탭도 같은 기준으로 다시 계산해요${canPush() ? '' : ' (이 기기엔 연결 키가 없어 앱 화면에만 적용)'}.</p>
  </section>`;

  const set = (patch) => { draft = { ...v, ...patch, minFor: { ...v.minFor, ...(patch.minFor || {}) } }; render(root); };
  const num = (x, lo, hi, d) => { const n = Math.round(+x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  root.querySelector('[name=min]').addEventListener('change', (e) => set({ min: num(e.target.value, 0, 100, v.min) }));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => set({ min: num(v.min + +b.dataset.step, 0, 100, v.min) })));
  root.querySelectorAll('[data-minfor]').forEach((c) => c.addEventListener('change', () => set({ minFor: { [c.dataset.minfor]: c.checked } })));
  root.querySelector('[name=win]').addEventListener('change', (e) => set({ win: num(e.target.value, 0, 10, v.win) }));
  root.querySelector('[name=draw]').addEventListener('change', (e) => set({ draw: num(e.target.value, 0, 10, v.draw) }));
  root.querySelector('[name=rate]').addEventListener('change', (e) => set({ rate: e.target.value }));
  root.querySelector('[data-season]')?.addEventListener('change', (e) => { season = e.target.value; render(root); });
  root.querySelector('[data-undo]')?.addEventListener('click', () => { draft = null; render(root); });
  root.querySelector('[data-reset]')?.addEventListener('click', () => set({ min: RULES_DEFAULT.min, minFor: { ...RULES_DEFAULT.minFor }, win: RULES_DEFAULT.win, draw: RULES_DEFAULT.draw, rate: 'wl' }));
  root.querySelector('[data-save]')?.addEventListener('click', async () => {
    if (!confirm(`기록 기준을 바꿀까요?\n· 순위 기준: ${v.min}경기 이상 (${Object.keys(METRIC).filter((k) => v.minFor[k]).map((k) => METRIC[k].t).join('·') || '적용 안 함'})\n· 승점: 승 ${v.win} · 무 ${v.draw}\n· ${RATE_TEXT[v.rate]}\n모든 회원의 기록 화면에 바로 반영돼요.`)) return;
    await db.set('meta/team', { recordRules: { min: v.min, minFor: { ...v.minFor }, win: v.win, draw: v.draw }, winRate: v.rate }, { merge: true });
    draft = null; toast('기록 기준을 저장했어요');
    // 통합 시트 개인기록 탭도 같은 기준으로 (연결 키가 있는 운영진 기기에서만)
    if (canPush()) {
      const r = await pushRules({ min: v.min, win: v.win, draw: v.draw, rate: v.rate });
      toast(r.ok ? '통합 시트 개인기록도 새 기준으로 다시 계산했어요' : '통합 시트에는 못 보냈어요 — 최신 Code.gs로 다시 배포했는지 확인해 주세요');
    }
  });
}
