// 내 정보 — 내 이름, 내 기록 요약, 앱 정보, 운영모드 입구 (WD_FUTSAL 내 정보와 같은 위치)
import { S, me, memberById, opDevice, refresh, samplesOnDevice, setSamplesOnDevice } from '../state.js?v=0.1.74';
import { changePin, saveSession, isRemembered, validPin } from '../auth.js?v=0.1.74';
import { modal } from '../ui.js?v=0.1.74';
import { toast } from '../util.js?v=0.1.74';
import { allStats, pct } from '../domain.js?v=0.1.74';
import { esc } from '../util.js?v=0.1.74';
import { inSandbox, sandboxRole, ROLES, pickRole, switchRole, askExit } from '../sandbox.js?v=0.1.74';

export function render(root) {
  const m = memberById(me.id);
  const r = m ? allStats().find((x) => x.id === m.id) : null;
  root.innerHTML = `
    <section class="card">
      <h1>내 정보</h1>
      ${m ? `<div class="me-row"><div><b class="me-name">${esc(m.name)}</b><small class="muted">${S.auth?.temp ? '비밀번호 없이 접속 중' : isRemembered() ? '자동 로그인 켜짐' : '이번 접속에만 로그인'}</small></div></div>
          <div class="row">${S.auth?.temp ? '' : '<button class="btn ghost" data-pin>비밀번호 변경</button>'}<button class="btn ghost" data-logout>로그아웃</button></div>`
        : `<p class="muted">카페 닉네임과 비밀번호로 로그인하면 신청하고 내 기록을 볼 수 있어요.</p><button class="btn full" data-pick>로그인</button>`}
    </section>
    ${r ? `<a class="card" href="#/records/${r.id}"><h2>내 기록 <small>자세히 ›</small></h2>
      <div class="stats3 four">
        <div><b>${r.games}</b><span>경기</span></div>
        <div><b>${pct(r.rate)}</b><span>승률</span></div>
        <div><b>${r.pts}</b><span>승점</span></div>
        <div><b>${r.goals}</b><span>득점</span></div>
      </div></a>` : ''}
    <section class="card">
      <h2>홈 화면에 추가</h2>
      <p class="muted small">브라우저 메뉴에서 <b>홈 화면에 추가(설치)</b>하면 앱처럼 아이콘이 생겨요. 아이폰·갤럭시·크롬별로 그림과 함께 보여 드려요.</p>
      <a class="btn full" href="install.html">📲 앱 설치 방법 보기</a>
      ${S.team.cafeUrl ? `<a class="btn ghost full" href="${esc(S.team.cafeUrl)}" target="_blank" rel="noopener">다음 카페 열기 ↗</a>` : ''}
    </section>
    ${inSandbox() ? `<section class="card beta">
      <h2>🧪 데모 체험 중 <small>${ROLES[sandboxRole()]?.icon} ${ROLES[sandboxRole()]?.label}</small></h2>
      <p class="small">여기서 한 일은 이 기기에만 남고 실제 기록에는 반영되지 않아요. 데모에서 나가려면 운영진 비밀번호가 필요해요.</p>
      <div class="row wrap"><button class="btn" data-sbxrole>역할 바꾸기</button><button class="btn ghost" data-sbxnew>체험 경기 새로 만들기</button><button class="btn ghost" data-sbxexit>나가기 (운영진)</button></div>
    </section>` : (S.allMatchdays || []).some((x) => x.sample) ? `<section class="card beta"><h2>🧪 베타 테스트</h2>
      <label class="chk"><input type="checkbox" data-samples ${samplesOnDevice() ? 'checked' : ''}><span>이 기기에서 샘플 경기 보기<small class="muted">운영진이 만든 시험 경기 · 기록에는 안 들어가요</small></span></label></section>` : ''}
    ${inSandbox() && sandboxRole() !== 'op' ? '' : `<section class="card op-entry">
      <h2>운영진</h2>
      <p class="muted small">운영진은 비밀번호로 운영모드에 들어가요.${opDevice() ? ' 이 기기는 오른쪽 위 버튼으로도 들어갈 수 있어요.' : ''}</p>
      <button class="btn ghost full" data-op>운영모드</button>
    </section>`}`;
  root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/login'; }));
  root.querySelector('[data-sbxrole]')?.addEventListener('click', () => pickRole(true));
  root.querySelector('[data-sbxexit]')?.addEventListener('click', askExit);
  root.querySelector('[data-sbxnew]')?.addEventListener('click', () => switchRole(sandboxRole()));
  root.querySelector('[data-samples]')?.addEventListener('change', (e) => { setSamplesOnDevice(e.target.checked); toast(e.target.checked ? '샘플 경기를 보여요' : '샘플 경기를 숨겨요'); });
  root.querySelector('[data-logout]')?.addEventListener('click', () => {
    if (!confirm('로그아웃할까요? 다음에는 닉네임과 비밀번호를 다시 입력해야 해요.')) return;
    S.auth = null; saveSession(null); toast('로그아웃했어요'); location.hash = '#/login'; refresh();
  });
  root.querySelector('[data-pin]')?.addEventListener('click', () => {
    const { el, close } = modal('비밀번호 변경', `<form class="stack">
      <label>지금 비밀번호<input name="p0" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password"></label>
      <label>새 비밀번호 (숫자 4자리)<input name="p1" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
      <label>새 비밀번호 한 번 더<input name="p2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
      <button class="btn">바꾸기</button></form>`);
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      if (!validPin(f.p1.value) || f.p1.value !== f.p2.value) return toast('새 비밀번호를 숫자 4자리로 똑같이 두 번 넣어 주세요');
      try { const sess = await changePin(S.auth, f.p0.value.trim(), f.p1.value.trim()); saveSession(sess, isRemembered()); S.auth = sess; toast('비밀번호를 바꿨어요'); close(); refresh(); }
      catch (err) { toast(err.message || '바꾸지 못했어요'); }
    });
  });
}
