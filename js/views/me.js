// 내 정보 — 내 이름, 내 기록 요약, 앱 정보, 운영모드 입구 (WD_FUTSAL 내 정보와 같은 위치)
import { S, me, memberById, opDevice } from '../state.js';
import { db } from '../store.js';
import { APP_NAME, APP_VERSION } from '../config.js';
import { allStats, pct } from '../domain.js';
import { esc } from '../util.js';
import { pickMe } from './pickme.js';

export function render(root) {
  const m = memberById(me.id);
  const r = m ? allStats().find((x) => x.id === m.id) : null;
  root.innerHTML = `
    <section class="card">
      <h1>내 정보</h1>
      ${m ? `<div class="me-row"><div><b class="me-name">${esc(m.name)}</b><small class="muted">이 기기에서 쓰는 이름</small></div>
          <button class="btn ghost sm" data-pick>바꾸기</button></div>`
        : `<p class="muted">이름을 고르면 신청하고 내 기록을 볼 수 있어요.</p><button class="btn full" data-pick>내 이름 선택</button>`}
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
      <p class="muted small">안드로이드 크롬: 메뉴 ⋮ → <b>홈 화면에 추가</b> · 아이폰 사파리: 공유 → <b>홈 화면에 추가</b> 하면 앱처럼 아이콘이 생겨요.</p>
      ${S.team.cafeUrl ? `<a class="btn ghost full" href="${esc(S.team.cafeUrl)}" target="_blank" rel="noopener">다음 카페 열기 ↗</a>` : ''}
    </section>
    <section class="card op-entry">
      <h2>운영진</h2>
      <p class="muted small">운영진은 비밀번호로 운영모드에 들어가요.${opDevice() ? ' 이 기기는 오른쪽 위 버튼으로도 들어갈 수 있어요.' : ''}</p>
      <button class="btn ghost full" data-op>운영모드</button>
    </section>
    <p class="muted tiny center">${APP_NAME} Ver.${APP_VERSION} · ${db.mode === 'demo' ? '데모 모드' : '서버 연결됨'}</p>`;
  root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => pickMe()));
}
