import { createSample, clearSamples, sampleList, SAMPLE_STAGES, SAMPLE_KINDS } from '../sample.js?v=0.1.82';
import { S, me, samplesOnDevice, setSamplesOnDevice } from '../state.js?v=0.1.82';
import { betaOn, inSandbox, pickRole } from '../sandbox.js?v=0.1.82';
import { db } from '../store.js?v=0.1.82';
import { APP_NAME, APP_VERSION, DEFAULT_TEAM } from '../config.js?v=0.1.82';
import { sheetApi, sheetKey, setSheetKey, okApiUrl, ping, readCheck, loadRecords, sheetState, pending, push, lastPush, archiveOn, archiveReady, cleanup, lastClean, ARCHIVE_DAYS } from '../record-sheet.js?v=0.1.82';
import { esc, toast, fileToDataUrl, todayISO, fmtDate } from '../util.js?v=0.1.82';
import { modal, empty } from '../ui.js?v=0.1.82';
import { formatFields, bindFormatFields, readFormat } from './format-form.js?v=0.1.82';

export function render(root) { return settings(root); }

function settings(root) {
  const t = S.team;
  root.innerHTML = `
  ${betaCard()}
  <section class="card"><h1>설정</h1>
    <form class="stack" data-team>
      <label>팀 이름<input name="name" value="${esc(t.name)}"></label>
      <div class="row"><label>대표 색<input type="color" name="primary" value="${esc(t.primary)}"></label>
        <label>엠블럼<div class="emblem-edit">${t.emblem ? `<img src="${t.emblem}" alt="">` : ''}<span class="btn ghost sm" data-embl>사진 바꾸기</span><input type="file" accept="image/*" name="emblem" class="vh"></div></label></div>
      <label>다음 카페 주소<input name="cafeUrl" placeholder="https://cafe.daum.net/..." value="${esc(t.cafeUrl || '')}"></label>
      <label>운영모드 PIN<input name="operatorPin" inputmode="numeric" value="${esc(t.operatorPin)}"></label>
      <label class="inline toggle"><input type="checkbox" name="cafeImport" ${t.cafeImport !== false ? 'checked' : ''}>
        <span>카페 댓글로 참석 받기 <small class="muted">임시 기능 · 정식 서비스에서 앱으로만 신청받으면 끄세요</small></span></label>
      <button class="btn">저장</button>
    </form></section>

  <section class="card"><h2>기본 경기 방식</h2>
    <p class="muted small">새 경기일에 자동으로 적용돼요. 특정 날만 다르게 하려면 홈 → 경기일·경기 방식 수정에서 바꾸세요.</p>
    <form class="stack" data-format>
      ${formatFields(t.format)}
      <label>승률 계산<select name="winRate">${[['wl', '승 ÷ (승+패) — 승률계산기와 같음'], ['win', '승 ÷ 경기'], ['point', '(승 + 무×0.5) ÷ 경기']]
        .map(([v, l]) => `<option value="${v}" ${t.winRate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn">저장</button>
    </form></section>

  ${sheetCard()}

  <section class="card"><h2>데이터</h2>
    <p class="muted small">저장 방식: <b>${db.mode === 'sandbox' ? '데모 체험판 (이 기기에만 · 실제 기록과 별개)' : db.mode === 'demo' ? '데모 모드 (이 브라우저에만 저장)' : 'Firebase (모든 회원 공유)'}</b> · ${APP_NAME} Ver.${APP_VERSION}</p>
    <div class="row wrap">
      <button class="btn ghost" data-backup>백업 파일 받기</button>
      ${db.mode === 'demo' ? `<label class="btn ghost file">백업 복원<input type="file" accept="application/json" data-restore hidden></label>
        <button class="btn ghost danger" data-wipe>전체 초기화</button>` : ''}
    </div>
  </section>`;

  root.querySelector('[data-team] [name=emblem]').addEventListener('change', (e) => { const f = e.target.files[0]; root.querySelector('[data-embl]').textContent = f ? f.name : '사진 바꾸기'; });
  root.querySelector('[data-team]').addEventListener('submit', async (e) => {
    e.preventDefault(); const fm = e.target;
    const patch = { name: fm.name.value.trim() || DEFAULT_TEAM.name, primary: fm.primary.value, cafeUrl: fm.cafeUrl.value.trim(), operatorPin: fm.operatorPin.value.trim() || '0000', cafeImport: fm.cafeImport.checked };
    if (fm.emblem.files[0]) patch.emblem = await fileToDataUrl(fm.emblem.files[0]);
    await db.set('meta/team', patch, { merge: true }); toast('저장했어요');
  });
  const ff = root.querySelector('[data-format]');
  bindFormatFields(ff);
  ff.addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.set('meta/team', { format: readFormat(ff), winRate: ff.winRate.value }, { merge: true }); toast('저장했어요');
  });
  bindSheet(root);
  root.querySelector('[data-backup]').addEventListener('click', backup);
  root.querySelector('[data-restore]')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('지금 데이터를 백업 파일 내용으로 바꿀까요?')) return;
    await db.importAll(JSON.parse(await file.text())); toast('복원했어요');
  });
  bindBeta(root);
  root.querySelector('[data-wipe]')?.addEventListener('click', async () => {
    if (!confirm('이 브라우저의 모든 데이터를 지울까요?')) return;
    await db.importAll({}); toast('초기화했어요');
  });
}

// ── 통합 시트 (회원 명부 + 경기 기록) ──
const LSU = 'teamapp:sheeturl';
const sheetOpenUrl = () => { try { return localStorage.getItem(LSU) || ''; } catch { return ''; } };
const agoTxt = (ts) => { if (!ts) return ''; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : new Date(ts).toLocaleDateString('ko-KR'); };
let sheetBusy = '', triedAt = 0, draft = null, connErr = '';   // draft: 연결 실패해도 입력한 값 유지
function sheetCard() {
  const api = sheetApi(), key = sheetKey(), st = sheetState(), lp = lastPush();
  const pd = api && st.ver != null ? pending() : null;
  const status = !api ? '<span class="is-pill">연결 안 됨</span>'
    : st.ver == null ? `<span class="is-pill">${st.err ? '읽기 실패' : '불러오는 중…'}</span>${st.err ? ` <small class="err">${esc(st.err)}</small>` : ''}`
    : `<span class="is-pill ok">연결됨</span> <small class="muted">시트 기록 ${st.games}경기${pd ? ` · 보낼 경기 ${pd.items.length}개` : ''}${lp ? ` · 마지막 보냄 ${agoTxt(lp.at)}` : ''}</small>`;
  return `<section class="card isheet"><h2>📗 통합 시트</h2>
    <p class="muted small">신청·드래프트·경기 진행처럼 <b>실시간</b>이 필요한 건 앱(Firebase)이, <b>끝난 경기 기록과 회원 명부</b>는 통합 시트 하나가 맡아요. 경기결과·개인기록 화면은 시트 기록을 읽고, 경기를 마치면 연결 키가 있는 운영진 기기에서 시트로 자동으로 보내요.</p>
    <div class="is-st">${status}</div>
    ${inSandbox() ? '<p class="small warn-t">데모 체험판에서는 통합 시트에 보내지 않아요.</p>' : `
    <form class="stack" data-isheet>
      <label>웹 앱 주소 <small class="muted">모든 회원 공통 — 경기 기록 읽기용</small><input name="url" value="${esc(draft ? draft.url : api)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" inputmode="url"></label>
      <label>연결 키 <small class="muted">이 기기에만 저장 — 회원 명부 읽기·기록 보내기용</small><input name="key" type="password" value="${esc(draft ? draft.key : key)}" autocomplete="off"></label>
      <button class="btn" ${sheetBusy ? 'disabled' : ''}>${sheetBusy === 'ping' ? '확인 중…' : '연결 확인하고 저장'}</button>
    </form>
    ${connErr ? `<div class="is-err small"><b>연결하지 못했어요</b> — ${esc(connErr)}
      <ul><li>Apps Script에서 <b>setup</b>을 실행해 권한 허용까지 마쳤는지 (프로젝트 설정 › 스크립트 속성에 <b>KEY</b>가 있어야 해요)</li>
      <li>배포 › 배포 관리 › 수정(연필): 실행 <b>나</b> · 액세스 <b>모든 사용자</b> ('Google 계정이 있는 모든 사용자'가 아니에요)</li>
      <li>웹 앱 주소 끝에 <code>?action=records</code>를 붙여 브라우저로 열었을 때 <code>{"ok":true,…}</code>가 보이는지</li></ul></div>` : ''}
    ${api ? archiveBox(pd) : ''}
    <div class="row wrap mt-s">
      ${api && key ? `<button class="btn ghost" data-pushall ${sheetBusy || !pd?.items.length ? 'disabled' : ''}>${sheetBusy === 'push' ? '보내는 중…' : `경기 기록 보내기${pd?.items.length ? ` (${pd.items.length}개)` : ''}`}</button>` : ''}
      ${sheetOpenUrl() ? `<a class="btn ghost" href="${esc(sheetOpenUrl())}" target="_blank" rel="noopener">시트 열기</a>` : ''}
      <button class="btn ghost" data-isguide>설정 방법</button>
    </div>
    <div data-isout></div>`}
  </section>`;
}
// Firebase 가볍게: 끝난 지 며칠 지난 경기는 시트로 옮긴 걸 확인하고 Firebase에서 지움
function archiveBox(pd) {
  const fb = (S.allMatchdays || []).filter((m) => m.status === 'played' && !m.sample).length;
  const ready = sheetState().ver != null ? archiveReady().length : 0, lc = lastClean();
  return `<div class="is-arch">
    <label class="switch-row"><span><b>Firebase 가볍게 쓰기</b><small class="muted">끝난 지 ${ARCHIVE_DAYS}일 지난 경기는 통합 시트에 옮겨진 걸 확인한 뒤 Firebase에서 지워요. 앱 화면(일정·지난 경기·경기결과·출석)에는 시트 기록으로 그대로 보이고, 신청자·드래프트까지 담긴 원본은 시트 숨김 탭 <b>앱원본</b>에 남아요.</small></span>
      <input type="checkbox" class="switch" data-archon ${archiveOn() ? 'checked' : ''}></label>
    <p class="small muted">Firebase에 남은 끝난 경기 <b>${fb}</b>개${ready ? ` · 정리할 수 있는 경기 <b>${ready}</b>개` : ''}${pd?.items.length ? ` · 먼저 시트로 보낼 경기 ${pd.items.length}개` : ''}${lc ? ` · 마지막 정리 ${agoTxt(lc.at)} (${lc.n}개)` : ''}</p>
    ${archiveOn() && ready && sheetKey() ? `<button class="btn ghost sm" data-cleanup ${sheetBusy ? 'disabled' : ''}>${sheetBusy === 'clean' ? '정리 중…' : `지금 정리하기 (${ready}개)`}</button>` : ''}
  </div>`;
}
function bindSheet(root) {
  const re = () => { if (root.isConnected) settings(root); };
  // 아직 못 읽었으면 한 번만 읽어 보고 다시 그림 (실패하면 상태 줄에 이유만 보여 줌 — 계속 다시 시도하지 않음)
  if (sheetApi() && sheetState().ver == null && Date.now() - triedAt > 30e3) { triedAt = Date.now(); loadRecords(true).then(re); }
  root.querySelector('[data-isheet]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim(), key = e.target.key.value.trim();
    if (url && !okApiUrl(url)) return toast('웹 앱 주소는 https://script.google.com/macros/s/…/exec 모양이에요');
    if (!url) { await db.set('meta/team', { sheetApi: '' }, { merge: true }); setSheetKey(''); toast('통합 시트 연결을 해제했어요'); return re(); }
    sheetBusy = 'ping'; draft = { url, key }; connErr = ''; re();
    try {
      if (key) {
        const j = await ping(url, key);
        try { localStorage.setItem(LSU, j.url || ''); } catch {}
        setSheetKey(key);
        toast(`연결됐어요 — ${j.name} · 기록 ${j.games}경기`);
      } else { await readCheck(url); setSheetKey(''); toast('저장했어요 (연결 키가 없어 기록 읽기만 해요)'); }
      if (url !== sheetApi()) await db.set('meta/team', { sheetApi: url }, { merge: true });
      draft = null;
      await loadRecords(true);
    } catch (err) { connErr = err.message || '알 수 없는 오류'; toast('통합 시트에 연결하지 못했어요'); }
    sheetBusy = ''; re();
  });
  root.querySelector('[data-pushall]')?.addEventListener('click', async (e) => {
    const { items } = pending();
    if (!items.length) return toast('보낼 경기가 없어요');
    if (items.length > 30 && !confirm(`경기 ${items.length}개를 통합 시트로 보낼까요? (같은 경기는 앱 기록으로 바꿔 써요)`)) return;
    sheetBusy = 'push'; e.target.disabled = true;
    const out = root.querySelector('[data-isout]');
    try {
      await push(items, [], (d, n) => { if (out) out.innerHTML = `<p class="small muted">보내는 중… ${d}/${n}</p>`; });
      toast(`경기 ${items.length}개를 통합 시트로 보냈어요`);
    } catch (err) { toast(err.message || '보내지 못했어요'); }
    sheetBusy = ''; re();
  });
  root.querySelector('[data-isguide]')?.addEventListener('click', sheetGuide);
  root.querySelector('[data-archon]')?.addEventListener('change', async (e) => {
    await db.set('meta/team', { archive: e.target.checked }, { merge: true });
    toast(e.target.checked ? `끝난 지 ${ARCHIVE_DAYS}일 지난 경기는 Firebase에서 정리해요` : 'Firebase 정리를 멈췄어요');
  });
  root.querySelector('[data-cleanup]')?.addEventListener('click', async () => {
    sheetBusy = 'clean'; re();
    try { await loadRecords(true); const n = await cleanup(); toast(n ? `지난 경기 ${n}개를 Firebase에서 정리했어요 (시트에 보관됨)` : '정리할 경기가 없어요'); }
    catch (err) { toast(err.message || '정리하지 못했어요'); }
    sheetBusy = ''; re();
  });
}
function sheetGuide() {
  const { el } = modal('통합 시트 설정 방법', `<ol class="steps-ol small">
    <li><b>새 구글 시트</b>를 만들어요 (운영진 계정 · <b>공유하지 않음</b> — 회원 연락처가 들어가요).</li>
    <li>시트 메뉴 <b>확장 프로그램 › Apps Script</b> → 원래 있던 코드를 지우고 아래 <b>코드 복사</b>로 복사한 코드를 붙여 넣고 저장(💾).</li>
    <li>위쪽 함수 목록에서 <b>setup</b>을 골라 <b>▶ 실행</b> → 권한 허용 (계정 선택 › 고급 › 이동 › 허용). 회원·경기·라운드·출전기록·개인기록·안내 탭이 생겨요.</li>
    <li><b>배포 › 새 배포</b> → 유형 <b>웹 앱</b> · 실행 <b>나</b> · 액세스 <b>모든 사용자</b> → 배포 → <b>웹 앱 주소</b> 복사.</li>
    <li>시트로 돌아가 새로고침 → 메뉴 <b>슛도리 › 앱 연결 정보</b>에서 <b>연결 키</b> 확인.</li>
    <li>여기(설정 › 통합 시트)에 웹 앱 주소와 연결 키를 넣고 <b>연결 확인하고 저장</b> → <b>경기 기록 보내기</b> (지금까지 기록이 모두 시트로 들어가요).</li>
    <li>시트 메뉴 <b>슛도리 › 예전 회원 명부 가져오기</b> → 예전 회원현황 시트 주소를 넣으면 회원 탭으로 그대로 복사돼요. (원하면 <b>예전 승률계산기 보관하기</b>로 원본도 참고용으로 보관)</li>
    <li>다른 운영진 기기는 연결 키만 넣으면 돼요 (운영 › 회원 또는 여기). 앱을 아무도 안 열 때도 회원 명부를 반영하려면 GitHub 저장소 Secret <b>SHEET_API_KEY</b>에 연결 키를 넣어요.</li>
  </ol>
  <div class="row wrap"><button class="btn" data-copycode>코드 복사</button><a class="btn ghost" href="apps-script/Code.gs" download="Code.gs">코드 파일 받기</a></div>
  <p class="tiny muted">예전 회원현황 시트와 승률계산기 시트는 이제 앱에서 쓰지 않아요. 기록 화면은 통합 시트를 읽고, 시트에 아직 없는 경기(진행 중·방금 끝남)만 앱 기록으로 보여 줘요.</p>`, { wide: true });
  el.querySelector('[data-copycode]').addEventListener('click', async (e) => {
    try { const t = await (await fetch('apps-script/Code.gs', { cache: 'no-store' })).text(); await navigator.clipboard.writeText(t); e.target.textContent = '복사했어요 ✓'; }
    catch { toast('복사하지 못했어요 — [코드 파일 받기]로 받아 주세요'); }
  });
}

function backup() {
  const data = db.exportAll ? db.exportAll() : {
    'meta/team': S.team,
    ...Object.fromEntries(S.members.map((m) => ['members/' + m.id, m])),
    ...Object.fromEntries(S.matchdays.map((m) => ['matchdays/' + m.id, m])),
    ...Object.fromEntries(S.games.map((g) => ['games/' + g.id, g])),
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `${APP_NAME}_백업_${todayISO().replace(/-/g, '')}.json`; a.click();
}

// 체험용: 활동 회원 중 28명이 신청한 경기일 (회원이 없으면 임시 회원 생성)

// ── 베타 테스트: 샘플 경기 ──
let bStage = 'open', bKind = 'normal';
function betaCard() {
  const list = sampleList().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const stLabel = (m) => (m.status === 'played' ? '경기 결과까지' : m.status === 'teams' ? '팀 확정' : ['drafting', 'captains'].includes(m.status) ? '드래프트 중' : m.status === 'closed' ? '신청 마감' : '신청 중');
  const kLabel = (m) => (m.event ? (m.eventMode === 'captains' ? '이벤트(주장만)' : '이벤트(팀원까지)') : '일반');
  const on = betaOn();
  return `<section class="card beta"><h2>🧪 베타 테스트</h2>
    <label class="switch-row"><span><b>베타 데모 기능</b><small class="muted">켜져 있으면 회원이 앱을 열 때 <b>일반 회원 · 주장 · 운영진</b> 중 체험할 화면을 고르고, 이 기기에만 만든 체험판에서 모든 기능을 써 봐요 (실제 기록에는 반영 안 됨). 회원은 데모에서 나갈 수 없고, <b>운영진 비밀번호로 접속해야만</b> 나가거나 이 기능을 끌 수 있어요. 끄면 모든 회원이 다음에 열 때 실제 앱으로 돌아와요.</small></span>
      <input type="checkbox" class="switch" data-betaon ${on ? 'checked' : ''} ${inSandbox() ? 'disabled' : ''}></label>
    ${inSandbox() ? '<p class="small warn-t">지금은 데모 체험판의 운영진 화면이에요. 이 기능은 실제 운영모드에서만 끌 수 있어요 — 위쪽 띠의 [나가기]에서 실제 운영진 비밀번호를 넣으세요.</p>' : ''}
    ${on && !inSandbox() ? '<div class="row wrap beta-demo"><button class="btn ghost" data-sbx>이 기기에서 역할 골라 데모 체험</button></div>' : ''}
    <h3 class="bh">샘플 경기 <small class="muted">실제 앱에 만드는 시험 경기</small></h3>
    <p class="muted small">원하는 단계까지 진행된 샘플 경기를 만들어 신청 → 주장 → 드래프트 → 팀 확정 → 경기 → 결과를 직접 시험해 보세요.
      샘플 경기는 <b>운영모드에서만</b> 보이고(회원 화면은 '이 기기에서 샘플 보기'를 켠 기기만), <b>개인 기록·출석·회차에는 들어가지 않아요.</b> 참가자는 실제 회원 중에서 무작위로 골라요.</p>
    <div class="fld"><span class="fl">시작 단계</span><div class="bopts">${SAMPLE_STAGES.map(([k, l, d]) => { const na = bKind === 'teams' && k === 'drafting';
      return `<button type="button" class="${bStage === k && !na ? 'on' : ''}" data-bstage="${k}" ${na ? 'disabled' : ''}><b>${l}</b><small>${na ? '팀원까지 미리 정하는 이벤트 경기는 드래프트가 없어요' : d}</small></button>`; }).join('')}</div></div>
    <div class="fld"><span class="fl">경기 종류</span><div class="seg">${SAMPLE_KINDS.map(([k, l]) => `<button type="button" class="${bKind === k ? 'on' : ''}" data-bkind="${k}">${l}</button>`).join('')}</div></div>
    <button class="btn full" data-bmake>샘플 경기 만들기</button>
    ${list.length ? `<h3 class="bh">만든 샘플 ${list.length}개</h3><ul class="list blist">${list.map((m) => `<li><span><b>${esc(stLabel(m))}</b> <small class="muted">${esc(kLabel(m))} · ${fmtDate(m.date, false)}</small></span>
      <button class="btn ghost sm" data-bgo="${m.id}">경기 메뉴에서 보기</button></li>`).join('')}</ul>
      <div class="row wrap"><button class="btn ghost danger" data-bclear>샘플 모두 지우기</button></div>` : ''}
    <label class="chk"><input type="checkbox" data-bdevice ${samplesOnDevice() ? 'checked' : ''}><span>이 기기에서는 운영모드를 꺼도 샘플 경기 보기<small class="muted">회원·주장 화면 시험용</small></span></label>
  </section>`;
}
function bindBeta(root) {
  root.querySelector('[data-betaon]')?.addEventListener('change', async (e) => {
    const v = e.target.checked;
    await db.set('meta/team', { betaDemo: v }, { merge: true });
    toast(v ? '베타 데모 기능을 켰어요' : '베타 데모 기능을 껐어요 — 회원 화면에서 데모 입구가 사라져요');
  });
  root.querySelector('[data-sbx]')?.addEventListener('click', () => pickRole(false));
  root.querySelectorAll('[data-bstage]').forEach((b) => b.addEventListener('click', () => { bStage = b.dataset.bstage; settings(root); }));
  root.querySelectorAll('[data-bkind]').forEach((b) => b.addEventListener('click', () => { bKind = b.dataset.bkind; if (bKind === 'teams' && bStage === 'drafting') bStage = 'teams'; settings(root); }));
  root.querySelector('[data-bmake]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const id = await createSample({ stage: bStage, kind: bKind, me: inSandbox() ? me.id : null }); toast('샘플 경기를 만들었어요 — 경기 메뉴에서 이어서 진행해 보세요'); S.sel = id; S.step = null; location.hash = '#/run'; }
    catch (err) { console.error(err); toast('샘플을 만들지 못했어요: ' + (err.message || err)); e.target.disabled = false; }
  });
  root.querySelectorAll('[data-bgo]').forEach((b) => b.addEventListener('click', () => { S.sel = b.dataset.bgo; S.step = null; location.hash = '#/run'; }));
  root.querySelector('[data-bclear]')?.addEventListener('click', async () => {
    if (!confirm('샘플 경기와 그 경기 기록을 모두 지울까요? (실제 경기는 그대로예요)')) return;
    const n = await clearSamples(); toast(`샘플 경기 ${n}개를 지웠어요`);
  });
  root.querySelector('[data-bdevice]')?.addEventListener('change', (e) => { setSamplesOnDevice(e.target.checked); toast(e.target.checked ? '이 기기에서 샘플 경기를 보여요' : '샘플 경기를 숨겨요'); });
}
