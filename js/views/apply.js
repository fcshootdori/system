import { S, nextMatchday, matchdayById, memberById, me, mdPath, nameOf } from '../state.js';
import { pickMe } from './pickme.js';
import { db, newId } from '../store.js';
import { applicants, pendingApps, fmtOf } from '../domain.js';
import { parseCafeComments, norm } from '../cafe-parser.js';
import { esc, fmtDate, fmtTime, toast, byName } from '../util.js';
import { modal, empty } from '../ui.js';

const SRC = { app: '앱', cafe: '카페', manual: '운영진', sheet: '시트' };

export function render(root, ctx = {}) {
  const md = ctx.md || (ctx.params?.[0] && matchdayById(ctx.params[0])) || nextMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('진행 중인 경기가 없어요.')}</section>`; return; }
  const list = applicants(md);
  const main = list.filter((a) => !a.wait), wait = list.filter((a) => a.wait);
  const mine = list.find((a) => a.id === me.id);
  const open = md.status === 'open';
  const f = fmtOf(md), cap = f.capacity;
  const short = f.minPlayers && main.length < f.minPlayers ? f.minPlayers - main.length : 0;
  const pend = pendingApps(md);
  const decl = Object.entries(md.declines || {});

  root.innerHTML = `
    ${ctx.embedded ? '' : '<a class="back" href="#/home">‹ 홈</a>'}
    <section class="card">
      ${ctx.embedded ? '' : `<div class="eyebrow">${fmtDate(md.date)} ${esc(md.venue || '')}</div>`}
      <h1>참가 신청 <small>${main.length}${cap ? ` / ${cap}` : ''}명</small></h1>
      ${f.minPlayers ? `<div class="meter ${short ? '' : 'ok'}"><i style="width:${Math.min(100, main.length / f.minPlayers * 100)}%"></i></div>
        <p class="small ${short ? 'warn-t' : 'ok-t'}">${short ? `최소 ${f.minPlayers}명까지 ${short}명 더 필요해요` : `최소 인원 ${f.minPlayers}명 충족`}</p>` : ''}
      ${md.cancelled ? `<p class="cancel-box">취소된 경기예요${md.cancelReason ? ` — ${esc(md.cancelReason)}` : ''}.</p>` : open ? (me.id
        ? `<button class="btn full ${mine ? 'ghost danger' : ''}" data-toggle>${mine ? '신청 취소' : `${esc(memberById(me.id)?.name || '')}(으)로 참가 신청`}</button>`
        : `<button class="btn full" data-me>내 이름 선택 후 신청하기</button>`)
        : `<p class="muted">신청이 마감됐어요.</p>`}
    </section>
    ${S.operator ? `<section class="card op"><h2>운영</h2><div class="row wrap">
      ${S.team.cafeImport !== false ? '<button class="btn" data-cafe>카페 댓글로 참석자 가져오기</button>' : ''}
      <button class="btn ghost" data-add>회원 추가</button>
      <button class="btn ghost" data-guest>게스트 추가</button>
      <button class="btn ghost" data-close>${open ? '신청 마감' : '신청 다시 열기'}</button>
    </div></section>` : ''}
    <section class="card">
      <h2>참가 ${main.length}명</h2>
      ${main.length ? listHtml(main, md) : empty('아직 신청자가 없어요.')}
      ${wait.length ? `<h2 class="mt">대기 ${wait.length}명</h2>${listHtml(wait, md)}` : ''}
    </section>
    ${pend.length ? `<section class="card"><h2>운영진 협의 ${pend.length}명 <small>승인하면 참가 명단에 들어가요</small></h2>
      <ol class="apps">${pend.map((a) => `<li><span class="no">·</span><span class="nm">${esc(nameOf(a.id, md))}</span>${a.group ? `<span class="grp">${esc(a.group)}</span>` : ''}
        ${S.operator ? `<button class="btn sm" data-ok="${a.id}">승인</button><button class="icon-btn" data-rm="${a.id}" aria-label="빼기">✕</button>` : '<span class="tag">협의 중</span>'}</li>`).join('')}</ol></section>` : ''}
    ${decl.length ? `<section class="card"><details><summary>불참 ${decl.length}명</summary><p class="small muted">${decl.map(([id, d]) => esc(memberById(id)?.name || d.name)).join(', ')}</p></details></section>` : ''}`;

  root.querySelector('[data-me]')?.addEventListener('click', () => pickMe());
  root.querySelector('[data-toggle]')?.addEventListener('click', async () => {
    await db.tx(mdPath(md.id), (cur) => {
      cur.apps = cur.apps || {};
      if (cur.apps[me.id]) delete cur.apps[me.id];
      else cur.apps[me.id] = { at: Date.now(), source: 'app' };
      return cur;
    });
    toast(mine ? '신청을 취소했어요' : '신청했어요');
  });
  root.querySelector('[data-cafe]')?.addEventListener('click', () => cafeImport(md));
  root.querySelector('[data-add]')?.addEventListener('click', () => addMembers(md));
  root.querySelector('[data-guest]')?.addEventListener('click', () => addGuest(md));
  root.querySelector('[data-close]')?.addEventListener('click', async () => {
    await db.set(mdPath(md.id), { status: open ? 'closed' : 'open' }, { merge: true });
    toast(open ? '신청을 마감했어요' : '신청을 다시 열었어요');
  });
  root.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.ok;
    await db.tx(mdPath(md.id), (cur) => { if (cur.apps?.[id]) cur.apps[id].pending = false; return cur; });
    toast(`${nameOf(id, md)} 님을 참가 명단에 넣었어요`);
  }));
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.rm;
    if (!confirm(`${nameOf(id, md)} 님을 신청 명단에서 뺄까요?`)) return;
    await db.tx(mdPath(md.id), (cur) => { delete cur.apps[id]; return cur; });
  }));
}

function listHtml(list, md) {
  return `<ol class="apps">${list.map((a) => `<li class="${a.id === me.id ? 'me' : ''}">
    <span class="no">${a.no}</span><span class="nm">${esc(nameOf(a.id, md))}</span>
    ${a.group ? `<span class="grp">${esc(a.group)}</span>` : ''}${a.tentative ? '<span class="tag">미정</span>' : ''}
    <span class="src src-${a.source}">${SRC[a.source] || ''}</span>
    <span class="tm">${a.at > 1e12 ? fmtTime(a.at) : ''}</span>
    ${S.operator ? `<button class="icon-btn" data-rm="${a.id}" aria-label="빼기">✕</button>` : ''}</li>`).join('')}</ol>`;
}

function addMembers(md) {
  const applied = new Set(Object.keys(md.apps || {}));
  const list = S.members.filter((m) => m.active !== false && !applied.has(m.id));
  const { el, close } = modal('회원 추가 신청', list.length ? `
    <div class="name-grid">${list.map((m) => `<label class="name-btn check"><input type="checkbox" value="${m.id}">${esc(m.name)}</label>`).join('')}</div>
    <button class="btn full" data-ok>추가</button>` : empty('추가할 회원이 없어요.'));
  el.querySelector('[data-ok]')?.addEventListener('click', async () => {
    const ids = [...el.querySelectorAll('input:checked')].map((i) => i.value);
    const now = Date.now();
    await db.tx(mdPath(md.id), (cur) => { ids.forEach((id, i) => { cur.apps = cur.apps || {}; cur.apps[id] = { at: now + i, source: 'manual' }; }); return cur; });
    toast(`${ids.length}명 추가`); close();
  });
}

function addGuest(md) {
  const { el, close } = modal('게스트 추가', `<form class="stack">
    <label>게스트 이름<input name="name" required></label>
    <label>데려온 회원<select name="host"><option value="">-</option>${S.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
    <button class="btn">추가</button></form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const gid = 'g_' + newId();
    await db.tx(mdPath(md.id), (cur) => {
      cur.guests = cur.guests || {}; cur.apps = cur.apps || {};
      cur.guests[gid] = { name: f.name.trim(), host: f.host || null };
      cur.apps[gid] = { at: Date.now(), source: 'manual' };
      return cur;
    });
    toast('게스트를 추가했어요'); close();
  });
}


// ── 카페 댓글로 참석자 가져오기 (임시 기능 · 설정에서 끌 수 있음) ──
//  1) 붙여넣기 → 2) 머리 댓글 구역별로 회원 일치 확인 → 3) 최종 확인 → 참가 명단 반영
//  회원 목록과 일치하지 않는 닉네임은 게스트로 참석 (원하면 회원을 골라 별칭으로 저장)
const KIND_OPTS = [['in', '참석'], ['tentative', '참석(미정)'], ['pending', '협의 대기'], ['out', '불참'], ['skip', '제외']];
function cafeImport(md) {
  const { el, close } = modal('카페 댓글로 참석자 가져오기', `
    <ol class="howto small">
      <li>카페 신청 글에서 댓글 전체를 길게 눌러 선택 → 복사</li>
      <li>아래에 붙여넣고 <b>분석하기</b> (댓글이 여러 페이지면 이어서 붙여넣기)</li>
      <li>회원 일치 여부를 확인하고 <b>참석자 확정</b></li>
    </ol>
    <textarea rows="7" data-src placeholder="여기에 댓글 붙여넣기"></textarea>
    <button class="btn full" data-parse>분석하기</button>
    <div data-out></div>`, { wide: true });
  const members = [...S.members].sort(byName);
  const memOpts = (sel) => `<option value="">게스트로 참석</option>${members.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.active === false ? ' (휴면)' : ''}</option>`).join('')}`;

  el.querySelector('[data-parse]').addEventListener('click', () => {
    const out = el.querySelector('[data-out]');
    const { rows, sections } = parseCafeComments(el.querySelector('[data-src]').value, S.members);
    if (!rows.length) { out.innerHTML = `<p class="err">댓글을 찾지 못했어요. 닉네임 앞의 "*" 표시와 작성 시간이 함께 복사됐는지 확인해 주세요.</p>`; return; }
    const groups = [...new Set(rows.map((r) => r.section))];
    out.innerHTML = `
      <div class="sum" data-sum></div>
      ${sections.length ? `<p class="muted small">머리 댓글 ${sections.length}개: ${sections.map((s) => `<b>${esc(s.title)}</b>`).join(' · ')}</p>` : ''}
      ${groups.map((g) => `<h3 class="sec">${esc(g || '구역 없음')}</h3>
        <div class="tbl-wrap"><table class="tbl parse"><thead><tr><th>카페 닉네임</th><th>회원 일치</th><th>참석</th></tr></thead><tbody>
        ${rows.map((r, i) => r.section !== g ? '' : `<tr data-i="${i}" class="${r.memberId ? '' : 'guest'}">
          <td><b>${esc(r.nick)}</b><div class="tiny muted">${esc(r.body)}</div></td>
          <td><select data-mem>${memOpts(r.memberId)}</select>
            <div class="tiny" data-badge></div>
            ${!r.memberId && r.suggestion ? `<button class="link tiny" data-sug="${r.suggestion}">혹시 ${esc(memberById(r.suggestion)?.name || '')}?</button>` : ''}</td>
          <td><select data-kind>${KIND_OPTS.map(([k, l]) => `<option value="${k}" ${k === (r.tentative ? 'tentative' : r.kind) ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        </tr>`).join('')}</tbody></table></div>`).join('')}
      <p class="muted small">게스트로 참석하는 사람은 개인 기록에 남지 않아요. 회원을 고르면 그 닉네임이 별칭으로 저장돼서 다음부터 자동으로 일치해요.</p>
      <button class="btn full" data-apply>참석자 확정</button>`;

    const sync = () => {
      const c = { in: 0, tentative: 0, pending: 0, out: 0, guest: 0 };
      out.querySelectorAll('tr[data-i]').forEach((tr) => {
        const r = rows[+tr.dataset.i], mem = tr.querySelector('[data-mem]').value, k = tr.querySelector('[data-kind]').value;
        const badge = tr.querySelector('[data-badge]');
        badge.textContent = mem ? (mem === r.memberId ? '✓ 회원 일치' : '회원으로 연결 (별칭 저장)') : '게스트';
        badge.className = 'tiny ' + (mem ? 'ok-t' : 'warn-t');
        tr.classList.toggle('guest', !mem);
        if (k in c) c[k]++;
        if (!mem && k !== 'out' && k !== 'skip') c.guest++;
      });
      out.querySelector('[data-sum]').innerHTML = `<span><b>${c.in + c.tentative}</b>참석${c.tentative ? ` (미정 ${c.tentative})` : ''}</span><span><b>${c.guest}</b>게스트</span><span><b>${c.pending}</b>협의</span><span><b>${c.out}</b>불참</span>`;
    };
    out.addEventListener('change', sync);
    out.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => { b.closest('tr').querySelector('[data-mem]').value = b.dataset.sug; b.remove(); sync(); }));
    sync();

    out.querySelector('[data-apply]').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      const picked = [...out.querySelectorAll('tr[data-i]')].map((tr) => ({
        r: rows[+tr.dataset.i], mem: tr.querySelector('[data-mem]').value, kind: tr.querySelector('[data-kind]').value,
      }));
      // 회원으로 직접 연결한 닉네임 → 별칭 저장
      const aliasAdds = new Map();
      picked.forEach(({ r, mem }) => { if (mem && mem !== r.memberId) aliasAdds.set(mem, [...(aliasAdds.get(mem) || []), r.nick]); });
      await Promise.all([...aliasAdds].map(([mid, nicks]) =>
        db.set('members/' + mid, { aliases: [...new Set([...(memberById(mid)?.aliases || []), ...nicks])] }, { merge: true })));
      const now = Date.now();
      const n = { in: 0, out: 0, pending: 0, guest: 0 };
      await db.tx(mdPath(md.id), (cur) => {
        cur.apps = cur.apps || {}; cur.guests = cur.guests || {}; cur.declines = cur.declines || {};
        // 머리 댓글 순서 기억 (구역대로 팀 나눌 때 이 순서 = 1번·2번 팀)
        const order = sections.filter((x) => x.kind === 'in').map((x) => x.title);
        if (order.length) cur.groupOrder = [...new Set([...order, ...(cur.groupOrder || [])])];
        picked.forEach(({ r, mem, kind }) => {
          if (kind === 'skip') return;
          const id = mem || 'g_c_' + (norm(r.nick) || 'x');
          if (kind === 'out') {
            if (cur.apps[id]) delete cur.apps[id];
            cur.declines[id] = { name: r.nick, at: r.at || now };
            n.out++; return;
          }
          if (!mem) { cur.guests[id] = { name: r.nick, cafe: true }; n.guest++; }
          const prev = cur.apps[id];
          const t = r.firstAt ?? r.at ?? now;
          const approved = prev && !prev.pending;            // 이미 승인·참가 중이면 다시 붙여넣어도 협의 대기로 돌리지 않음
          cur.apps[id] = { ...(prev || {}), at: prev?.at ?? t, source: prev?.source || 'cafe', cafeName: r.nick,
            group: kind === 'pending' ? (prev?.group || null) : (r.section || prev?.group || null),
            tentative: kind === 'tentative', pending: kind === 'pending' && !approved };
          delete cur.declines[id];
          if (kind === 'pending') n.pending++; else n.in++;
        });
        return cur;
      });
      toast(`참석 ${n.in}명(게스트 ${n.guest}) · 협의 ${n.pending}명 · 불참 ${n.out}명 반영`);
      close();
    });
  });
}
