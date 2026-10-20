// 🧪 데모 체험 (베타 테스트 기간)
//  · 지금 회원·경기·기록을 이 기기에 복사한 "체험판"으로 들어가, 신청 → 주장·드래프트 → 포지션 → 경기 기록 → 결과까지 모든 기능을 직접 해 봄
//  · 체험판에서 한 일은 이 기기에만 남고 실제 기록·서버에는 전혀 반영되지 않음. [체험 끝내기]를 누르면 원래 앱으로
//  · 체험판 운영모드 PIN은 0000 (운영 기능도 시험 가능)
//  · 운영모드 › 설정의 '베타 데모 기능'을 끄면 입구가 사라짐
import { S, me, onChange } from './state.js?v=0.1.41';
import { SANDBOX_KEY, inSandbox } from './store.js?v=0.1.41';
import { createSample } from './sample.js?v=0.1.41';
import { hardReload } from './update.js?v=0.1.41';
import { toast } from './util.js?v=0.1.41';

export const SANDBOX_PIN = '0000';
export const betaOn = () => S.team.betaDemo !== false;
export { inSandbox };

const strip = ({ id, ...rest }) => rest;
export function enterSandbox() {
  const data = {};
  data['meta/team'] = { ...strip(S.team), operatorPin: SANDBOX_PIN, betaDemo: true };
  S.members.forEach((m) => { data['members/' + m.id] = strip(m); });
  (S.allMatchdays || S.matchdays).filter((m) => !m.sample).forEach((m) => { data['matchdays/' + m.id] = strip(m); });
  S.games.filter((g) => !String(g.matchdayId).startsWith('sample_')).forEach((g) => { data['games/' + g.id] = strip(g); });
  // 지금 로그인한 회원은 체험판에서도 그대로 로그인된 상태로
  if (S.auth?.pid && S.auth.key) {
    data['authset/' + S.auth.pid] = { ver: S.auth.ver || 1, registered: true, at: Date.now() };
    data['auth/' + S.auth.key] = { pid: S.auth.pid, at: Date.now() };
  }
  try {
    localStorage.setItem(SANDBOX_KEY, JSON.stringify(data));
    localStorage.setItem('teamapp:sandbox', '1');
    localStorage.setItem('teamapp:sandbox:seed', '1');
  } catch (e) { toast('이 기기 저장 공간이 부족해 체험판을 만들지 못했어요'); return; }
  sessionStorage.removeItem('teamapp:op');
  location.hash = '#/home';
  hardReload();
}
export function exitSandbox() {
  try { localStorage.removeItem('teamapp:sandbox'); localStorage.removeItem(SANDBOX_KEY); localStorage.removeItem('teamapp:sandbox:seed'); } catch {}
  sessionStorage.removeItem('teamapp:op');
  location.hash = '#/home';
  hardReload();
}
// 체험판에 처음 들어가면(로그인 뒤) 단계별 체험 경기를 만들어 둠 — 로그인한 회원이 주장
export function startSandbox() {
  if (!inSandbox()) return;
  document.body.classList.add('sandbox');
  const bar = document.createElement('div');
  bar.className = 'sbx-bar';
  bar.innerHTML = `<span>🧪 <b>데모 체험 중</b> · 실제 기록에 반영되지 않아요 · 운영모드 PIN <b>${SANDBOX_PIN}</b></span><button type="button" data-sbxexit>체험 끝내기</button>`;
  document.body.prepend(bar);
  bar.querySelector('[data-sbxexit]').addEventListener('click', () => { if (confirm('데모 체험을 끝내고 실제 앱으로 돌아갈까요? 체험판에서 한 일은 지워져요.')) exitSandbox(); });
  let busy = false;
  const off = onChange(async () => {
    if (busy || localStorage.getItem('teamapp:sandbox:seed') !== '1' || !S.members.length || !(S.auth || S.operator)) return;
    busy = true; localStorage.removeItem('teamapp:sandbox:seed'); off();
    const mine = me.id || null;
    for (const [stage, kind] of [['open', 'normal'], ['drafting', 'normal'], ['teams', 'normal'], ['played', 'normal'], ['open', 'teams']]) {
      try { await createSample({ stage, kind, me: mine }); } catch (e) { console.warn(e); }
    }
    toast(mine ? '체험 경기를 만들었어요 — 내가 주장인 경기도 있어요' : '체험 경기를 만들었어요');
  });
}
