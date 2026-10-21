// 로그인 — 카페 닉네임 → (처음) 비밀번호 정하기 / (다음부터) 비밀번호 입력, 자동 로그인
import { S, refresh } from '../state.js?v=0.1.48';
import { register, login, status, saveSession, validPin } from '../auth.js?v=0.1.48';
import { norm } from '../cafe-parser.js?v=0.1.48';
import { esc } from '../util.js?v=0.1.48';

let step = { pid: null, registered: false }, nick = '', err = '', denied = false;

const findMember = (name) => {
  const k = norm(name);
  if (!k) return null;
  return S.members.find((m) => norm(m.name) === k) || S.members.find((m) => (m.aliases || []).some((a) => norm(a) === k)) || null;
};

export function render(root) {
  document.body.classList.add('gate');
  const m = step.pid ? S.members.find((x) => x.id === step.pid) : null;
  root.innerHTML = `<section class="lg">
    ${S.team.emblem ? `<img class="lg-emb" src="${S.team.emblem}" alt="">` : ''}
    <h1>${esc(S.team.name)}</h1>
    <p class="muted">카페 닉네임과 비밀번호(숫자 4자리)로 접속해요</p>
    <div class="card lg-card">
      ${!m ? `
        <label>카페 닉네임<input name="nick" value="${esc(nick)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next"></label>
        <div class="lg-sug" data-sug></div>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <button class="btn full" data-next>다음</button>`
      : step.registered ? `
        <p class="lg-who"><span><b>${esc(m.name)}</b> 님</span><button class="link" data-back>다른 닉네임</button></p>
        <label>비밀번호 (숫자 4자리)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••" enterkeyhint="go"></label>
        <label class="inline"><input type="checkbox" name="auto" checked> 자동 로그인 <small class="muted">(이 기기에서 계속 로그인 유지)</small></label>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <button class="btn full" data-login>로그인</button>
        <p class="tiny muted">비밀번호를 잊었다면 운영진에게 초기화를 요청해 주세요.</p>`
      : `
        <p class="lg-who"><span><b>${esc(m.name)}</b> 님, 처음 오셨네요</span><button class="link" data-back>다른 닉네임</button></p>
        <p class="small">앞으로 쓸 비밀번호(숫자 4자리)를 정해 주세요. 다른 기기에서도 이 번호로 접속해요.</p>
        <label>비밀번호 정하기<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••"></label>
        <label>한 번 더 입력<input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••" enterkeyhint="go"></label>
        <label class="inline"><input type="checkbox" name="auto" checked> 자동 로그인 <small class="muted">(이 기기에서 계속 로그인 유지)</small></label>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <button class="btn full" data-register>비밀번호 정하고 시작하기</button>`}
    </div>
    ${denied ? `<button class="btn ghost full" data-temp>비밀번호 없이 닉네임으로만 들어가기 (임시)</button>` : ''}
    <button class="link lg-op" data-op>운영진이신가요? 운영모드로 들어가기 ›</button>
  </section>`;

  const q = (s) => root.querySelector(s);
  const rer = () => render(root);
  const done = (sess) => {
    saveSession(sess, q('[name=auto]')?.checked !== false);
    S.auth = sess; step = { pid: null, registered: false }; err = ''; nick = '';
    document.activeElement?.blur();   // 입력칸에 포커스가 남아 있으면 화면 갱신이 미뤄짐
    document.body.classList.remove('gate');
    location.hash = '#/home'; refresh();
  };
  const fail = (e) => {
    denied = e?.code === 'permission-denied';
    err = denied
      ? '서버 설정(Firestore 규칙)이 아직 업데이트되지 않아 로그인할 수 없어요. 운영진에게 알려 주세요.'
      : e?.message || '접속하지 못했어요. 잠시 뒤 다시 해 주세요.';
    rer();
  };

  // 1단계: 닉네임
  const inp = q('[name=nick]');
  if (inp) {
    const sug = q('[data-sug]');
    const draw = () => {
      const k = norm(inp.value);
      const hit = k ? S.members.filter((x) => norm(x.name).includes(k) || (x.aliases || []).some((a) => norm(a).includes(k))).slice(0, 6) : [];
      sug.innerHTML = hit.map((x) => `<button type="button" class="chip sug" data-pick="${esc(x.name)}">${esc(x.name)}</button>`).join('');
    };
    inp.addEventListener('input', () => { nick = inp.value; draw(); });
    sug.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { inp.value = nick = b.dataset.pick; go(); } });
    const go = async () => {
      const mm = findMember(inp.value);
      if (!mm) { err = inp.value.trim() ? `"${inp.value.trim()}" — 회원 목록에 없는 닉네임이에요. 카페 닉네임을 확인하거나 운영진에게 문의해 주세요.` : '카페 닉네임을 입력해 주세요.'; return rer(); }
      try { const st = await status(mm.id); step = { pid: mm.id, registered: st.registered }; err = ''; rer(); setTimeout(() => q('[name=pin]')?.focus(), 50); }
      catch (e) { fail(e); }
    };
    q('[data-next]').addEventListener('click', go);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    draw();
    if (!('ontouchstart' in window)) setTimeout(() => inp.focus(), 50);
  }
  // 서버 규칙이 아직 없을 때만: 닉네임으로 임시 접속 (이번 접속에만)
  q('[data-temp]')?.addEventListener('click', () => {
    const mm = step.pid ? { id: step.pid } : findMember(nick);
    if (!mm) { err = '먼저 카페 닉네임을 입력해 주세요.'; return rer(); }
    const sess = { pid: mm.id, temp: true };
    saveSession(sess, false); S.auth = sess; denied = false; err = ''; step = { pid: null, registered: false };
    document.activeElement?.blur(); document.body.classList.remove('gate'); location.hash = '#/home'; refresh();
  });
  q('[data-back]')?.addEventListener('click', () => { step = { pid: null, registered: false }; err = ''; rer(); });

  // 2단계: 로그인 / 비밀번호 등록
  const doLogin = async () => { try { done(await login(step.pid, q('[name=pin]').value.trim())); } catch (e) { fail(e); } };
  const doRegister = async () => {
    const p1 = q('[name=pin]').value.trim(), p2 = q('[name=pin2]').value.trim();
    if (!validPin(p1)) { err = '비밀번호는 숫자 4자리로 정해 주세요.'; return rer(); }
    if (p1 !== p2) { err = '두 번 입력한 비밀번호가 달라요.'; return rer(); }
    try { done(await register(step.pid, p1)); } catch (e) { fail(e); }
  };
  q('[data-login]')?.addEventListener('click', doLogin);
  q('[data-register]')?.addEventListener('click', doRegister);
  root.querySelectorAll('[name=pin],[name=pin2]').forEach((x) => x.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; e.preventDefault(); (q('[data-login]') ? doLogin : doRegister)();
  }));
  // 비밀번호 4자리를 다 넣으면 바로 로그인
  q('[data-login]') && q('[name=pin]').addEventListener('input', (e) => { if (validPin(e.target.value)) doLogin(); });
}
