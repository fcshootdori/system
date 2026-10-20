// 회원현황 구글 시트 → 앱 회원 정보 반영 (브라우저)
//  - 시트 주소는 운영진 기기에만 저장 (공개 저장소·서버에 남기지 않음 — 시트에 연락처가 있어서)
//  - [새로 불러오기]: 바로 읽어 반영. 새 회원·비슷한 이름 짝이 있으면 먼저 확인
//  - 자동 반영: 시트 주소가 저장된 기기에서 앱을 열 때 + 열어 둔 동안 30분마다
//    (앱을 아무도 안 열어도 반영되게 하려면 GitHub Actions 자동 반영 — README 참고)
import { db, newId } from './store.js?v=0.1.40';
import { S, refresh } from './state.js?v=0.1.40';
import { KNOWN_ALIASES } from './config.js?v=0.1.40';
import { parseCSV, parseMemberTable, planSync, privateOf, syncSummary, norm } from './member-sheet.js?v=0.1.40';

const LS = 'teamapp:msheet';
export function sheetLink() { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } }
export function setSheetLink(v) { try { v ? localStorage.setItem(LS, JSON.stringify(v)) : localStorage.removeItem(LS); } catch {} }
export function parseLink(s) {
  const t = String(s || '').trim();
  const id = (t.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || t.match(/^([a-zA-Z0-9_-]{30,})$/) || [])[1];
  if (!id) return null;
  const gid = (t.match(/[#?&]gid=(\d+)/) || [])[1] || '';
  return { id, gid };
}
export const sheetUrl = (l) => `https://docs.google.com/spreadsheets/d/${l.id}/edit${l.gid ? '#gid=' + l.gid : ''}`;

async function fetchRows(l) {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${l.id}/export?format=csv&gid=${l.gid || 0}`,
    `https://docs.google.com/spreadsheets/d/${l.id}/gviz/tq?tqx=out:csv&headers=0${l.gid ? '&gid=' + l.gid : ''}`,
  ];
  let last;
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      if (/^\s*</.test(txt)) throw new Error('공유 설정');
      const rows = parseCSV(txt);
      if (rows.some((r) => r.includes('닉네임'))) return rows;
      last = new Error("'닉네임' 머리글이 없어요");
    } catch (e) { last = e; }
  }
  throw new Error(`회원 시트를 읽지 못했어요 (${last?.message || '연결 실패'}). 시트 공유가 '링크가 있는 모든 사용자 · 뷰어'인지, 주소가 회원현황 탭인지 확인해 주세요.`);
}

// 운영진 기기 메모리에만 두는 개인정보 { at, byId: { 회원ID: { realName, birth, phone, absReason, bMonth, bDay, fees } }, updated }
S.msheet = null;

// 시트를 읽어 계획만 세움 (아직 저장 안 함)
export async function preview(l = sheetLink()) {
  if (!l) throw new Error('회원 시트 주소가 없어요');
  const rows = await fetchRows(l);
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
export function startAutoSync() {
  clearInterval(timer);
  if (!sheetLink()) return;
  const kick = () => { if (S.members.length) autoSync(); else setTimeout(kick, 1500); };
  kick();
  timer = setInterval(autoSync, 30 * 60e3);
}
export { syncSummary };
