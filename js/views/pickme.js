// 내 이름 고르기 (로그인 없이 이 기기의 회원을 정함) — 검색 지원
import { S, me } from '../state.js';
import { esc, toast } from '../util.js';
import { modal, empty } from '../ui.js';

export function pickMe(after) {
  const list = S.members.filter((m) => m.active !== false);
  const { el, close } = modal('내 이름 선택', list.length ? `
    <p class="muted small">카페 닉네임을 골라 주세요. 이 기기에서 신청하거나 내 기록을 볼 때 쓰여요.</p>
    <input class="search" placeholder="닉네임 검색" data-q autocomplete="off">
    <div class="name-grid" data-list></div>
    ${me.id ? '<button class="btn ghost full" data-id="">선택 해제</button>' : ''}`
    : empty('아직 등록된 회원이 없어요. 운영진에게 문의해 주세요.'));
  const box = el.querySelector('[data-list]');
  const draw = (q = '') => {
    const k = q.trim().toLowerCase();
    const hit = list.filter((m) => !k || m.name.toLowerCase().includes(k) || (m.aliases || []).some((a) => a.toLowerCase().includes(k)));
    if (box) box.innerHTML = hit.length ? hit.map((m) => `<button class="name-btn ${m.id === me.id ? 'on' : ''}" data-id="${m.id}">${esc(m.name)}</button>`).join('') : empty('찾는 이름이 없어요.');
  };
  draw();
  el.querySelector('[data-q]')?.addEventListener('input', (e) => draw(e.target.value));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    me.set(b.dataset.id); close();
    if (b.dataset.id) toast(`${S.members.find((m) => m.id === b.dataset.id)?.name} 님으로 설정했어요`);
    after?.();
  });
}
