import { createSample, clearSamples, sampleList, SAMPLE_STAGES, SAMPLE_KINDS } from '../sample.js?v=0.1.35';
import { S, memberById, samplesOnDevice, setSamplesOnDevice } from '../state.js?v=0.1.35';
import { db, newId } from '../store.js?v=0.1.35';
import { APP_NAME, APP_VERSION, DEFAULT_TEAM, KNOWN_ALIASES } from '../config.js?v=0.1.35';
import { fetchTab, parseSheet, suggestMember, buildDocs } from '../sheet-import.js?v=0.1.35';
import { esc, toast, fileToDataUrl, todayISO, byName, fmtDate } from '../util.js?v=0.1.35';
import { modal, empty } from '../ui.js?v=0.1.35';
import { formatFields, bindFormatFields, readFormat } from './format-form.js?v=0.1.35';

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

  <section class="card"><h2>승률계산기에서 가져오기</h2>
    <p class="muted small">Members · Games · Match_Player 탭을 읽어 회원과 지난 경기를 경기일별로 옮겨요. 시트는 읽기만 하고, 다시 가져오면 같은 경기는 덮어써요.</p>
    <form class="stack" data-sheet>
      <label>시트 주소 또는 ID<input name="id" value="${esc(t.legacySheet?.id || '')}" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
      <button class="btn">시트 읽기</button>
    </form>
    <div data-sheet-out>${t.legacySheet?.importedAt ? `<p class="muted small">마지막 가져오기: ${esc(t.legacySheet.importedAt)} · ${t.legacySheet.count || 0}경기</p>` : ''}</div>
  </section>

  <section class="card"><h2>데이터</h2>
    <p class="muted small">저장 방식: <b>${db.mode === 'demo' ? '데모 모드 (이 브라우저에만 저장)' : 'Firebase (모든 회원 공유)'}</b> · ${APP_NAME} Ver.${APP_VERSION}</p>
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
  root.querySelector('[data-sheet]').addEventListener('submit', (e) => { e.preventDefault(); readSheet(e.target, root.querySelector('[data-sheet-out]')); });
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

// ── 승률계산기 시트 읽기 → 확인 → 가져오기 ──
async function readSheet(form, out) {
  const raw = form.id.value.trim();
  const id = (raw.match(/\/d\/([\w-]+)/) || [])[1] || raw;
  if (!id) return toast('시트 주소를 넣어 주세요');
  out.innerHTML = '<p class="muted">시트를 읽는 중…</p>';
  let parsed;
  try {
    const [members, games, players] = await Promise.all([fetchTab(id, 'Members'), fetchTab(id, 'Games'), fetchTab(id, 'Match_Player')]);
    parsed = parseSheet({ members, games, players });
  } catch (err) {
    out.innerHTML = `<p class="err">시트를 읽지 못했어요: ${esc(err.message)}<br>시트 공유가 '링크가 있는 모든 사용자 · 뷰어'인지 확인해 주세요.</p>`;
    return;
  }
  out.innerHTML = '';

  // 시트 회원 + 이미 있는 회원으로 이름 사전 만들기
  const known = new Map();
  S.members.forEach((m) => { known.set(m.name, m.id); (m.aliases || []).forEach((a) => known.set(a, m.id)); });
  const sheetNames = new Set(parsed.members.map((m) => m.name));
  // 기본 별칭(config KNOWN_ALIASES): 시트에만 있는 회원이어도 오타 이름을 같은 사람으로
  Object.entries(KNOWN_ALIASES).forEach(([name, aliases]) => {
    const target = S.members.find((m) => m.name === name)?.id || (sheetNames.has(name) ? 'new:' + name : null);
    if (target) aliases.forEach((a) => { if (!known.has(a)) known.set(a, target); });
  });
  const pool = [...S.members.map((m) => ({ id: m.id, name: m.name })),
    ...parsed.members.filter((m) => !known.has(m.name)).map((m) => ({ id: 'new:' + m.name, name: m.name }))].sort(byName);
  const counts = new Map();
  parsed.matches.forEach((mt) => mt.players.forEach((p) => {
    if (known.has(p.name) || sheetNames.has(p.name)) return;
    counts.set(p.name, (counts.get(p.name) || 0) + 1);
  }));
  const unknown = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const appDates = new Set(S.matchdays.filter((m) => m.source !== 'sheet' && S.games.some((g) => g.matchdayId === m.id && g.done)).map((m) => m.date));
  const dates = parsed.matches.map((m) => m.date).sort();

  const dlg = modal('승률계산기 가져오기', '', { wide: true });
  out = dlg.el.querySelector('.modal-body');
  out.innerHTML = `
    <div class="stats3">
      <div><b>${parsed.members.length}</b><span>회원 (활동 ${parsed.members.filter((m) => m.active).length})</span></div>
      <div><b>${parsed.matches.length}</b><span>경기</span></div>
      <div><b>${unknown.length}</b><span>확인할 이름</span></div>
    </div>
    <p class="muted small">${dates[0] || ''} ~ ${dates[dates.length - 1] || ''}${parsed.problems.length ? ' · ' + parsed.problems.join(' · ') : ''}</p>
    ${unknown.length ? `<h2 class="mt">회원 명단에 없는 이름</h2>
      <p class="muted small">오타·줄임말이면 회원을 골라 주세요(별칭으로 저장돼요). 게스트로 두면 승률계산기처럼 개인 기록에서 빠져요. <b>추천</b>은 비슷한 이름을 미리 골라 둔 거예요.</p>
      <div class="tbl-wrap"><table class="tbl parse"><thead><tr><th>시트 이름</th><th>경기</th><th>연결</th></tr></thead><tbody>
      ${unknown.map(([name, n]) => {
        const sg = suggestMember(name, pool);
        return `<tr data-name="${esc(name)}"><td><b>${esc(name)}</b>${sg ? `<div class="tiny ${sg.strong ? 'ok-t' : 'muted'}">추천: ${esc(pool.find((p) => p.id === sg.id).name)}</div>` : ''}</td><td>${n}</td>
          <td><select><option value="">게스트</option>${pool.map((p) => `<option value="${esc(p.id)}" ${sg?.strong && sg.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td></tr>`;
      }).join('')}</tbody></table></div>` : ''}
    ${appDates.size && parsed.matches.some((m) => appDates.has(m.date)) ? '<p class="small warn-t">앱에서 이미 기록한 날짜와 겹치는 시트 경기는 건너뛰어요.</p>' : ''}
    <button class="btn full mt-s" data-import>가져오기</button>`;

  out.querySelector('[data-import]').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = '가져오는 중…';
    // 1) 회원
    const idOf = new Map(known);
    const newIds = new Map();
    e.target.textContent = '회원 등록 중…';
    const writes = [];
    for (const m of parsed.members) {
      const ex = S.members.find((x) => x.name === m.name);
      if (ex) { if ((ex.active !== false) !== m.active) writes.push(db.set('members/' + ex.id, { active: m.active }, { merge: true })); idOf.set(m.name, ex.id); }
      else { const nid = newId(); newIds.set('new:' + m.name, nid); idOf.set(m.name, nid);
        writes.push(db.set('members/' + nid, { name: m.name, aliases: [], active: m.active, createdAt: Date.now(), source: 'sheet' })); }
    }
    await Promise.all(writes);
    // 2) 확인한 이름 → 별칭
    const aliasAdds = new Map();
    out.querySelectorAll('tr[data-name]').forEach((tr) => {
      let v = tr.querySelector('select').value;
      if (!v) return;
      if (v.startsWith('new:')) v = newIds.get(v) || idOf.get(v.slice(4));
      idOf.set(tr.dataset.name, v);
      aliasAdds.set(v, [...(aliasAdds.get(v) || []), tr.dataset.name]);
    });
    for (const [mid, names] of aliasAdds) {
      const cur = memberById(mid)?.aliases || [];
      await db.set('members/' + mid, { aliases: [...new Set([...cur, ...names])] }, { merge: true });
    }
    // 3) 경기일·경기
    const resolve = (name) => { const v = idOf.get(name); return v && String(v).startsWith('new:') ? newIds.get(v) || idOf.get(v.slice(4)) || null : v || null; };
    const { docs, skipped } = buildDocs(parsed.matches, resolve, appDates);
    for (let i = 0; i < docs.length; i += 10) {
      await Promise.all(docs.slice(i, i + 10).flatMap((d) => [db.set(d.md.path, d.md.data), db.set(d.game.path, d.game.data)]));
      e.target.textContent = `가져오는 중… ${Math.min(i + 10, docs.length)}/${docs.length}`;
    }
    await db.set('meta/team', { legacySheet: { ...(S.team.legacySheet || {}), id, importedAt: new Date().toLocaleString('ko-KR'), count: docs.length } }, { merge: true });
    toast(`회원 ${parsed.members.length}명 · 경기 ${docs.length}개를 가져왔어요${skipped.length ? ` (${skipped.length}개 건너뜀)` : ''}`);
    out.innerHTML = `<p class="ok-t">완료했어요 — 회원 ${parsed.members.length}명, 경기 ${docs.length}개${skipped.length ? ` (겹치는 날짜 ${skipped.length}개 건너뜀)` : ''}</p>
      <a class="btn full" href="#/records" data-done>기록 보기</a>`;
    out.querySelector('[data-done]').addEventListener('click', () => dlg.close());
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
  return `<section class="card beta"><h2>🧪 베타 테스트 <small>샘플 경기</small></h2>
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
  root.querySelectorAll('[data-bstage]').forEach((b) => b.addEventListener('click', () => { bStage = b.dataset.bstage; settings(root); }));
  root.querySelectorAll('[data-bkind]').forEach((b) => b.addEventListener('click', () => { bKind = b.dataset.bkind; if (bKind === 'teams' && bStage === 'drafting') bStage = 'teams'; settings(root); }));
  root.querySelector('[data-bmake]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const id = await createSample({ stage: bStage, kind: bKind }); toast('샘플 경기를 만들었어요 — 경기 메뉴에서 이어서 진행해 보세요'); S.sel = id; S.step = null; location.hash = '#/run'; }
    catch (err) { console.error(err); toast('샘플을 만들지 못했어요: ' + (err.message || err)); e.target.disabled = false; }
  });
  root.querySelectorAll('[data-bgo]').forEach((b) => b.addEventListener('click', () => { S.sel = b.dataset.bgo; S.step = null; location.hash = '#/run'; }));
  root.querySelector('[data-bclear]')?.addEventListener('click', async () => {
    if (!confirm('샘플 경기와 그 경기 기록을 모두 지울까요? (실제 경기는 그대로예요)')) return;
    const n = await clearSamples(); toast(`샘플 경기 ${n}개를 지웠어요`);
  });
  root.querySelector('[data-bdevice]')?.addEventListener('change', (e) => { setSamplesOnDevice(e.target.checked); toast(e.target.checked ? '이 기기에서 샘플 경기를 보여요' : '샘플 경기를 숨겨요'); });
}
