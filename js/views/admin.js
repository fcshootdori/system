import { S, memberById } from '../state.js';
import { db, newId } from '../store.js';
import { APP_NAME, APP_VERSION, DEFAULT_TEAM, KNOWN_ALIASES } from '../config.js';
import { fetchTab, parseSheet, suggestMember, buildDocs } from '../sheet-import.js';
import { esc, toast, fileToDataUrl, todayISO, byName } from '../util.js';
import { modal, empty } from '../ui.js';
import { formatFields, bindFormatFields, readFormat } from './format-form.js';

export function render(root, { sub }) { return sub === 'settings' ? settings(root) : members(root); }

// ───────────── 회원 관리 ─────────────
function members(root) {
  const act = S.members.filter((m) => m.active !== false), off = S.members.filter((m) => m.active === false);
  const li = (m) => `<li data-edit="${m.id}"><span class="nm">${esc(m.name)}</span>
    <span class="aliases">${(m.aliases || []).map((a) => `<span class="chip sm">${esc(a)}</span>`).join('')}</span></li>`;
  root.innerHTML = `<section class="card">
    <h1>회원 <small>활동 ${act.length}명 · 휴면 ${off.length}명</small></h1>
    <p class="muted small">회원 이름은 <b>카페 닉네임</b> 그대로 쓰는 걸 권해요. 그래야 카페 댓글을 자동으로 알아봐요.</p>
    <form class="stack" data-add>
      <label>회원 추가 <span class="muted small">(여러 명은 쉼표나 줄바꿈으로)</span><textarea name="names" rows="2" placeholder="닉네임1, 닉네임2"></textarea></label>
      <button class="btn">추가</button>
    </form></section>
    <section class="card"><h2>활동 회원</h2>
      <p class="muted small">이름을 누르면 수정할 수 있어요. 회색 칩은 별칭(오타·다른 표기)이에요.</p>
      ${act.length ? `<ul class="members">${act.map(li).join('')}</ul>` : empty('등록된 회원이 없어요. 설정 → 승률계산기에서 가져오기로 한 번에 등록할 수 있어요.')}
      ${off.length ? `<h2 class="mt">휴면 ${off.length}명</h2><ul class="members off">${off.map(li).join('')}</ul>` : ''}
    </section>`;
  root.querySelector('[data-add]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const names = e.target.names.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const exist = new Set(S.members.map((m) => m.name));
    const fresh = [...new Set(names)].filter((n) => !exist.has(n));
    await Promise.all(fresh.map((name) => db.set('members/' + newId(), { name, aliases: [], active: true, createdAt: Date.now() })));
    e.target.reset(); e.target.names.blur();
    toast(fresh.length ? `${fresh.length}명 추가` : '이미 있는 이름이에요');
  });
  root.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => editMember(el.dataset.edit)));
}

function editMember(id) {
  const m = memberById(id);
  const { el, close } = modal('회원 수정', `<form class="stack">
    <label>이름 (카페 닉네임)<input name="name" required value="${esc(m.name)}"></label>
    <label>별칭 <span class="muted small">(쉼표로 구분 — 오타·줄임말·다른 표기)</span><input name="aliases" value="${esc((m.aliases || []).join(', '))}"></label>
    <label class="inline"><input type="checkbox" name="active" ${m.active !== false ? 'checked' : ''}> 활동 회원</label>
    <div class="row"><button class="btn">저장</button><button type="button" class="btn ghost danger" data-del>삭제</button></div>
  </form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await db.set('members/' + id, { name: f.name.value.trim(), aliases: f.aliases.value.split(',').map((s) => s.trim()).filter(Boolean), active: f.active.checked }, { merge: true });
    toast('저장했어요'); close();
  });
  el.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm(`${m.name} 님을 삭제할까요? 지난 기록에서는 '(알 수 없음)'으로 보여요. 보통은 '활동 회원' 체크를 끄는 걸 권해요.`)) return;
    await db.del('members/' + id); close();
  });
}

// ───────────── 설정 ─────────────
function settings(root) {
  const t = S.team;
  root.innerHTML = `
  <section class="card"><h1>설정</h1>
    <form class="stack" data-team>
      <label>팀 이름<input name="name" value="${esc(t.name)}"></label>
      <div class="row"><label>대표 색<input type="color" name="primary" value="${esc(t.primary)}"></label>
        <label>엠블럼<div class="emblem-edit">${t.emblem ? `<img src="${t.emblem}" alt="">` : ''}<input type="file" accept="image/*" name="emblem"></div></label></div>
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
        <button class="btn ghost" data-sample>체험용 신청 데이터</button>
        <button class="btn ghost danger" data-wipe>전체 초기화</button>` : ''}
    </div>
  </section>`;

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
  root.querySelector('[data-sample]')?.addEventListener('click', seedSample);
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
async function seedSample() {
  let pool = S.members.filter((m) => m.active !== false);
  if (pool.length < 28) {
    const add = [];
    for (let i = pool.length; i < 30; i++) { const id = newId(); add.push({ id, name: `체험${String(i + 1).padStart(2, '0')}` }); }
    await Promise.all(add.map((m) => db.set('members/' + m.id, { name: m.name, aliases: [], active: true, createdAt: Date.now() })));
    pool = [...pool, ...add];
  }
  const pick = pool.slice().sort(() => Math.random() - 0.5).slice(0, 28);
  const now = Date.now();
  const apps = Object.fromEntries(pick.map((m, i) => [m.id, { at: now - (28 - i) * 300000, source: i % 3 ? 'cafe' : 'app' }]));
  await db.set('matchdays/' + newId(), { date: todayISO(), time: '07:00~09:00', venue: '체험 구장', note: '체험용 경기일', status: 'open', format: null,
    apps, guests: {}, captains: [], picks: [], teams: [], mom: [], late: {}, createdAt: now });
  toast('체험용 경기일을 만들었어요');
}
