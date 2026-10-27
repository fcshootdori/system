// 통합 시트 › 회원 탭 → 앱 회원 정보 반영 (브라우저)
//  - 통합 시트는 공유하지 않고, 운영진 기기에 넣은 연결 키로만 회원 탭을 읽음 (시트에 연락처가 있어서)
//  - [새로 불러오기]: 바로 읽어 반영. 새 회원·비슷한 이름 짝이 있으면 먼저 확인
//  - 자동 반영: 연결 키가 있는 기기에서 앱을 열 때 + 열어 둔 동안 30분마다
//    (앱을 아무도 안 열어도 반영되게 하려면 GitHub Actions 자동 반영 — README 참고)
import { db, newId } from './store.js?v=0.1.76';
import { S, refresh, onChange } from './state.js?v=0.1.76';
import { KNOWN_ALIASES } from './config.js?v=0.1.76';
import { parseMemberTable, planSync, privateOf, syncSummary, norm } from './member-sheet.js?v=0.1.76';
import { sheetApi, sheetKey, setSheetKey, fetchMemberRows } from './record-sheet.js?v=0.1.76';

// 연결 = 팀 설정의 통합 시트 웹 앱 주소 + 이 기기의 연결 키
export function sheetLink() { const url = sheetApi(), key = sheetKey(); return url && key ? { url, key } : null; }
export function setSheetLink(v) { setSheetKey(v?.key || ''); }
const memo = { url: '' };
export const sheetUrl = () => memo.url || '';

async function fetchRows() {
  const { rows, url } = await fetchMemberRows();
  if (url) memo.url = url;
  if (!rows.some((r) => r.some((c) => String(c).trim() === '닉네임'))) throw new Error("통합 시트 회원 탭에 '닉네임' 머리글이 없어요. 시트 메뉴 슛도리 › 예전 회원 명부 가져오기를 먼저 해 주세요.");
  return rows.map((r) => r.map((c) => String(c ?? '')));
}

// 운영진 기기 메모리에만 두는 개인정보 { at, byId: { 회원ID: { realName, birth, phone, absReason, bMonth, bDay, fees } }, updated }
S.msheet = null;

// 시트를 읽어 계획만 세움 (아직 저장 안 함)
export async function preview(given) {
  if (!sheetLink()) throw new Error('이 기기에 통합 시트 연결 키가 없어요');
  const rows = given ? given.map((r) => r.map((c) => String(c ?? ''))) : await fetchRows();
  const parsed = parseMemberTable(rows);
  const plan = planSync(parsed.records, S.members, { knownAliases: KNOWN_ALIASES });
  return { ...parsed, plan };
}

// 계획 반영: 바뀐 회원만 저장. choices: { [기록 번호]: 'new' | 회원ID } — 새 회원을 기존 회원과 합칠 때
export async function apply(pv, { by = 'manual', choices = {} } = {}) {
  const { records, plan } = pv;
  const byId = {};
  const writes = [];
  let created = 0, updated = 0;
  for (const o of plan.ops) {
    const r = records[o.ri];
    let id = o.id, data = o.data;
    if (o.type === 'create') {
      const ch = choices[o.ri];
      if (ch && ch !== 'new') {
        // 운영진이 기존 회원과 같은 사람으로 고른 경우 → 그 회원 정보를 시트 기준으로 갱신
        const again = planSync([r], S.members.filter((m) => m.id === ch), { links: { [ch]: 0 }, knownAliases: KNOWN_ALIASES }).ops[0];
        id = ch; data = again.data; if (Object.keys(data).length) { writes.push(db.set('members/' + id, data, { merge: true })); updated++; }
      } else if ((id = S.members.find((m) => norm(m.name) === norm(r.nick))?.id)) {
        // 그사이 다른 기기·자동 반영이 먼저 추가했으면 새로 만들지 않음
        data = { ...data }; delete data.active; delete data.source; delete data.aliases;
        writes.push(db.set('members/' + id, data, { merge: true })); updated++;
      } else {
        id = newId() + o.ri;
        writes.push(db.set('members/' + id, { ...data, createdAt: Date.now() })); created++;
      }
    } else if (o.type === 'update') { writes.push(db.set('members/' + id, data, { merge: true })); updated++; }
    byId[id] = privateOf(r);
  }
  const chosen = new Set(Object.values(choices));
  plan.missing.filter((id) => !chosen.has(id)).forEach((id) => writes.push(db.set('members/' + id, { inSheet: false }, { merge: true })));
  await Promise.all(writes);
  S.msheet = { at: Date.now(), byId, updated: pv.updated, count: records.length };
  const sum = { created, updated, missing: plan.missing.length, count: records.length };
  const prevMeta = S.msync || {};
  if (created || updated || sum.missing || by === 'manual' || (S.msync && Date.now() - (prevMeta.checkedAt || 0) > 3600e3)) {   // 회원 모드(기록 구독 없음)에서는 바뀐 게 있을 때만
    await db.set('meta/memberSheet', { checkedAt: Date.now(), by, count: records.length, sheetUpdated: pv.updated || '',
      ...(created || updated || sum.missing ? { changedAt: Date.now(), last: sum } : {}) }, { merge: true });
  }
  refresh();
  return sum;
}

// 확인이 필요한 항목: 새 회원, 비슷한 이름으로 짝지은 회원
export const needsReview = (pv) => pv.plan.ops.some((o) => o.type === 'create' || o.how === 'similar' || o.how === 'no');

let timer = 0, running = null, hold = false;
// 운영진이 반영 확인 창을 보고 있는 동안에는 자동 반영을 멈춤
export const holdAuto = (v) => { hold = v; };
export async function autoSync() {
  if (!sheetLink() || !S.members.length || hold) return null;
  if (running) return running;
  running = (async () => {
    try { const pv = await preview(); return await apply(pv, { by: 'auto' }); }
    catch (e) { console.warn('회원 시트 자동 반영 실패', e); return null; }
    finally { running = null; }
  })();
  return running;
}
let waiting = null;
export function startAutoSync() {
  clearInterval(timer);
  // 팀 설정(통합 시트 주소)은 앱이 열린 뒤에 들어오므로, 연결이 생기면 그때 시작
  if (!sheetLink()) { if (!waiting) waiting = onChange(() => { if (sheetLink()) { waiting(); waiting = null; startAutoSync(); } }); return; }
  const kick = () => { if (S.members.length) autoSync(); else setTimeout(kick, 1500); };
  kick();
  timer = setInterval(autoSync, 30 * 60e3);
}
export { syncSummary };
