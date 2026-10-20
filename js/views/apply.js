import { S, nextMatchday, matchdayById, memberById, me, mdPath, nameOf } from '../state.js';
import { pickMe } from './pickme.js';
import { db, newId } from '../store.js';
import { applicants, fmtOf } from '../domain.js';
import { parseCafeComments } from '../cafe-parser.js';
import { esc, fmtDate, fmtTime, toast, byName } from '../util.js';
import { modal, empty } from '../ui.js';

const SRC = { app: '앱', cafe: '카페', manual: '운영진' };

export function render(root, ctx = {}) {
  const md = ctx.md || (ctx.params?.[0] && matchdayById(ctx.params[0])) || nextMatchday();
  if (!md) { root.innerHTML = `<section class="card">${empty('진행 중인 경기가 없어요.')}</section>`; return; }
  const list = applicants(md);
  const main = list.filter((a) => !a.wait), wait = list.filter((a) => a.wait);
  const mine = list.find((a) => a.id === me.id);
  const open = md.status === 'open';
  const f = fmtOf(md), cap = f.capacity;
  const short = f.minPlayers && main.length < f.minPlayers ? f.minPlayers - main.length : 0;

  root.innerHTML = `
    ${ctx.embedded ? '' : '<a class="back" href="#/home">‹ 홈</a>'}
    <section class="card">
      ${ctx.embedded ? '' : `<div class="eyebrow">${fmtDate(md.date)} ${esc(md.venue || '')}</div>`}
      <h1>참가 신청 <small>${main.length}${cap ? ` / ${cap}` : ''}명</small></h1>
      ${f.minPlayers ? `<div class="meter ${short ? '' : 'ok'}"><i style="width:${Math.min(100, main.length / f.minPlayers * 100)}%"></i></div>
        <p class="small ${short ? 'warn-t' : 'ok-t'}">${short ? `최소 ${f.minPlayers}명까지 ${short}명 더 필요해요` : `최소 인원 ${f.minPlayers}명 충족`}</p>` : ''}
      ${open ? (me.id
        ? `<button class="btn full ${mine ? 'ghost danger' : ''}" data-toggle>${mine ? '신청 취소' : `${esc(memberById(me.id)?.name || '')}(으)로 참가 신청`}</button>`
        : `<button class="btn full" data-me>내 이름 선택 후 신청하기</button>`)
        : `<p class="muted">신청이 마감됐어요.</p>`}
    </section>
    ${S.operator ? `<section class="card op"><h2>운영</h2><div class="row wrap">
      <button class="btn" data-cafe>카페 댓글 가져오기</button>
      <button class="btn ghost" data-add>회원 추가</button>
      <button class="btn ghost" data-guest>게스트 추가</button>
      <button class="btn ghost" data-close>${open ? '신청 마감' : '신청 다시 열기'}</button>
    </div></section>` : ''}
    <section class="card">
      <h2>참가 ${main.length}명</h2>
      ${main.length ? listHtml(main, md) : empty('아직 신청자가 없어요.')}
      ${wait.length ? `<h2 class="mt">대기 ${wait.length}명</h2>${listHtml(wait, md)}` : ''}
    </section>`;

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
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.rm;
    if (!confirm(`${nameOf(id, md)} 님을 신청 명단에서 뺄까요?`)) return;
    await db.tx(mdPath(md.id), (cur) => { delete cur.apps[id]; return cur; });
  }));
}

function listHtml(list, md) {
  return `<ol class="apps">${list.map((a) => `<li class="${a.id === me.id ? 'me' : ''}">
    <span class="no">${a.no}</span><span class="nm">${esc(nameOf(a.id, md))}</span>
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

function cafeImport(md) {
  const { el, close } = modal('카페 댓글 가져오기', `
    <p class="muted">카페 신청 글의 댓글 영역을 길게 눌러 전체 선택 → 복사한 뒤 아래에 붙여넣으세요.</p>
    <textarea rows="8" data-src placeholder="여기에 댓글 붙여넣기"></textarea>
    <button class="btn full" data-parse>분석하기</button>
    <div data-out></div>`, { wide: true });
  const members = S.members.filter((m) => m.active !== false).sort(byName);
  const opts = (sel) => `<option value="">— 연결 안 함 —</option>${members.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;

  el.querySelector('[data-parse]').addEventListener('click', () => {
    const { entries } = parseCafeComments(el.querySelector('[data-src]').value, S.members);
    const out = el.querySelector('[data-out]');
    if (!entries.length) { out.innerHTML = empty('댓글을 찾지 못했어요.'); return; }
    const already = md.apps || {};
    out.innerHTML = `
      <table class="tbl parse"><thead><tr><th>카페 닉네임</th><th>회원</th><th>의사</th><th>댓글</th></tr></thead><tbody>
      ${entries.map((c, i) => `<tr data-i="${i}" class="${c.memberId ? '' : 'warn'}">
        <td>${esc(c.author)}${c.memberId ? '' : '<br><label class="tiny"><input type="checkbox" data-alias checked> 별칭으로 저장</label>'}</td>
        <td><select data-mem>${opts(c.memberId)}</select>${c.memberId && already[c.memberId] ? '<div class="tiny muted">이미 신청됨</div>' : ''}</td>
        <td><select data-int><option value="in" ${c.intent === 'in' ? 'selected' : ''}>참석</option><option value="out" ${c.intent === 'out' ? 'selected' : ''}>불참·취소</option><option value="skip">무시</option></select>${c.sure ? '' : '<div class="tiny muted">추정</div>'}</td>
        <td class="muted small">${esc(c.text)}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small">회원과 연결되지 않은 닉네임은 회원을 골라 주면, 다음부터 자동으로 알아봐요.</p>
      <button class="btn full" data-apply>신청 명단에 반영</button>`;
    out.querySelector('[data-apply]').addEventListener('click', async () => {
      const base = Date.now();
      const rows = [...out.querySelectorAll('tr[data-i]')].map((tr) => ({
        c: entries[+tr.dataset.i], mem: tr.querySelector('[data-mem]').value,
        intent: tr.querySelector('[data-int]').value, alias: tr.querySelector('[data-alias]')?.checked,
      }));
      // 별칭 저장
      for (const r of rows) {
        if (r.mem && r.alias && !r.c.memberId) {
          const m = memberById(r.mem);
          const aliases = [...new Set([...(m.aliases || []), r.c.author])];
          await db.set('members/' + r.mem, { aliases }, { merge: true });
        }
      }
      let added = 0, removed = 0;
      await db.tx(mdPath(md.id), (cur) => {
        cur.apps = cur.apps || {};
        rows.forEach((r) => {
          if (!r.mem || r.intent === 'skip') return;
          if (r.intent === 'in' && !cur.apps[r.mem]) {
            const t = r.c.firstAt ?? r.c.at;
            cur.apps[r.mem] = { at: t > 1e12 ? t : base + t, source: 'cafe', raw: r.c.author };
            added++;
          } else if (r.intent === 'out' && cur.apps[r.mem]) { delete cur.apps[r.mem]; removed++; }
        });
        return cur;
      });
      toast(`추가 ${added}명 · 취소 ${removed}명 반영`); close();
    });
  });
}
