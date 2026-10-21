// 통합 시트 › 회원 탭 → Firestore 회원 정보 자동 반영 (GitHub Actions에서 정기 실행)
//  - 통합 시트 웹 앱 주소는 팀 설정(meta/team.sheetApi)에서 읽고, 연결 키는 저장소 Secret SHEET_API_KEY 에만 둠
//    (회원 탭에 연락처가 있어 키를 공개 저장소에 적지 않음)
//  - 서버에는 공개해도 되는 항목만 저장 (연번·가입일자·등급·닉네임·운영진 이력·장불 여부/기간). 이름·연락처·생년월일·회비는 저장하지 않음
//  - 앱과 같은 규칙(js/member-sheet.js)으로 회원을 맞추고, 바뀐 회원만 고침
//  실행: SHEET_API_KEY=... [SHEET_API_URL=...] [DRY_RUN=1] node scripts/sync-members.mjs
import { FIREBASE, KNOWN_ALIASES } from '../js/config.js';
import { parseMemberTable, planSync, syncSummary } from '../js/member-sheet.js';

const KEY = (process.env.SHEET_API_KEY || '').trim();
const DRY = !!process.env.DRY_RUN;
const REFERER = process.env.APP_URL || 'https://fcshootdori.github.io/system/';
if (!KEY) { console.log('SHEET_API_KEY Secret이 없어 건너뜀 (README의 "통합 시트" 참고)'); process.exit(0); }

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
let token = '';
const H = () => ({ 'Content-Type': 'application/json', Referer: REFERER, ...(token ? { Authorization: 'Bearer ' + token } : {}) });

// Firestore REST 값 변환
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = (f) => {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  if ('timestampValue' in f) return f.timestampValue;
  return null;
};
async function req(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { ...H(), ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${opt.method || 'GET'} ${url.replace(/key=[^&]+/, 'key=…')} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function signIn() {
  const j = await req(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE.apiKey}`, { method: 'POST', body: JSON.stringify({ returnSecureToken: true }) });
  token = j.idToken;
}
async function listMembers() {
  const out = []; let page = '';
  do {
    const j = await req(`${BASE}/members?pageSize=300${page ? '&pageToken=' + page : ''}`);
    (j.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) }));
    page = j.nextPageToken || '';
  } while (page);
  return out;
}
async function patch(path, data) {
  const mask = Object.keys(data).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  return req(`${BASE}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// 웹 앱 주소: Secret SHEET_API_URL 이 있으면 그것, 없으면 팀 설정(meta/team.sheetApi)
let API = (process.env.SHEET_API_URL || '').trim();
if (!API) { const t = await req(`${BASE}/meta/team`); API = dec(t.fields?.sheetApi) || ''; }
if (!API) { console.log('통합 시트가 아직 연결되지 않아 건너뜀 (앱 운영모드 › 설정 › 통합 시트)'); process.exit(0); }
const u = new URL(API); u.searchParams.set('action', 'members'); u.searchParams.set('key', KEY);
const res = await fetch(u, { redirect: 'follow' });
const j = await res.json().catch(() => null);
if (!j?.ok) throw new Error('통합 시트 회원 탭을 읽지 못함: ' + (j?.error || 'HTTP ' + res.status));
const { records, updated } = parseMemberTable((j.rows || []).map((r) => r.map((c) => String(c ?? ''))));
await signIn();
const members = await listMembers();
const plan = planSync(records, members, { knownAliases: KNOWN_ALIASES });
const sum = syncSummary(plan);
console.log(`시트 회원 ${records.length}명 · 앱 회원 ${members.length}명 →`, sum);
plan.ops.filter((o) => o.type !== 'same').forEach((o) => console.log(' ', o.type, o.how || '', o.from || '', '→', records[o.ri].nick, Object.keys(o.data).join(',')));
if (DRY) process.exit(0);

let created = 0, upd = 0;
for (const o of plan.ops) {
  if (o.type === 'create') { await patch('members/' + newId() + o.ri, { ...o.data, createdAt: Date.now() }); created++; }
  else if (o.type === 'update') { await patch('members/' + o.id, o.data); upd++; }
}
for (const id of plan.missing) await patch('members/' + id, { inSheet: false });
const changed = created || upd || plan.missing.length;
await patch('meta/memberSheet', { checkedAt: Date.now(), by: 'server', count: records.length, sheetUpdated: updated || '',
  ...(changed ? { changedAt: Date.now(), last: { created, updated: upd, missing: plan.missing.length, count: records.length } } : {}) });
console.log(`반영 완료: 새 회원 ${created} · 바뀐 회원 ${upd} · 시트에서 빠짐 ${plan.missing.length}`);
