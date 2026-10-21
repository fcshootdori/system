// 통합 시트 연결 (Apps Script 웹 앱)
//  · 실시간이 필요한 것(신청·드래프트·경기 진행)은 Firebase, 끝난 경기 기록과 회원 명부는 통합 시트
//  · 웹 앱 주소는 팀 설정(meta/team.sheetApi)에 — 모든 회원이 경기 기록을 읽어야 해서 (기록은 원래 공개)
//  · 연결 키는 운영진 기기에만 — 회원 명부(연락처 포함)를 읽고 시트에 기록을 쓰는 열쇠라서
//  · 기록 화면: 시트 기록 + 아직 시트에 없는(또는 시트에 보낸 뒤 앱에서 고친) 경기는 Firebase 기록
//  · 운영진 기기(연결 키 있음): 경기를 마치거나 고치면 잠시 뒤 시트로 자동으로 보냄
import { S, refresh, memberById, onChange } from './state.js?v=0.1.47';
import { inSandbox } from './store.js?v=0.1.47';
import { rosters, teamColor, teamName, fmtOf, matchNumbers } from './domain.js?v=0.1.47';
import { toItem, fromSheet } from './record-rows.js?v=0.1.47';
import { norm } from './member-sheet.js?v=0.1.47';

const LK = 'teamapp:sheetkey', LC = 'teamapp:rec', LP = 'teamapp:recpush';
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
try { localStorage.removeItem('teamapp:msheet'); } catch {}   // 예전 회원현황 시트 주소 (이제 쓰지 않음)

export const sheetApi = () => String(S.team.sheetApi || '').trim();
export const sheetKey = () => ls.get(LK) || '';
export const setSheetKey = (k) => (k ? ls.set(LK, String(k).trim()) : ls.del(LK));
export const canPush = () => !!(sheetApi() && sheetKey() && !inSandbox());
export const okApiUrl = (u) => /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(u || '').trim());

// ── 요청 ──
async function call(params, body, url = sheetApi()) {
  if (!url) throw new Error('통합 시트가 연결되지 않았어요');
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  let res;
  try { res = await fetch(u, body ? { method: 'POST', body: JSON.stringify(body), redirect: 'follow' } : { cache: 'no-store', redirect: 'follow' }); }
  catch { throw new Error('웹 앱이 응답하지 않았어요. 보통 setup 권한 허용이 안 됐거나 배포 액세스가 \'모든 사용자\'가 아닐 때 생겨요'); }
  const txt = await res.text();
  let j;
  try { j = JSON.parse(txt); } catch { throw new Error(/<html/i.test(txt) ? "웹 앱 주소가 맞는지, 배포 '액세스: 모든 사용자'인지 확인해 주세요" : '통합 시트 응답을 읽지 못했어요'); }
  if (!j.ok) throw new Error(j.error || '통합 시트 오류');
  return j;
}
export const readCheck = (url) => call({ action: 'records', ver: 'x' }, null, url);
export const ping = (url, key) => call({ action: 'ping', key }, null, url);
export const fetchMemberRows = async () => { const j = await call({ action: 'members', key: sheetKey() }); return { rows: j.rows || [], url: j.url || '' }; };

// ── 시트 기록 (모든 기기) ──
let R = (() => { try { return JSON.parse(ls.get(LC) || 'null'); } catch { return null; } })();   // { api, ver, at, data }
if (R && !R.data) R = null;
let loading = null;
export const sheetState = () => { const r = R && R.api === sheetApi() ? R : null; return { on: !!sheetApi(), ver: r?.ver, at: r?.at, games: r?.data?.games?.length || 0, err: lastErr }; };
let lastErr = '';
export function loadRecords(force = false) {
  const api = sheetApi();
  if (!api) return Promise.resolve(null);
  if (R && R.api !== api) R = null;
  if (loading) return loading;
  if (!force && R && Date.now() - (R.at || 0) < 60e3) return Promise.resolve(R);
  loading = (async () => {
    try {
      const j = await call({ action: 'records', ver: R?.ver || '' });
      if (j.same && R) { R.at = Date.now(); }
      else { R = { api, ver: j.ver, at: Date.now(), data: { games: j.games || [], rounds: j.rounds || [], players: j.players || [] } }; built = null; refresh(); }
      ls.set(LC, JSON.stringify(R));
      lastErr = '';
    } catch (e) { lastErr = e.message; console.warn('통합 시트 기록', e); }
    finally { loading = null; }
    return R;
  })();
  return loading;
}

// 이름 → 회원ID (닉네임·별칭)
function idByName(name) {
  const k = norm(name);
  if (!k) return null;
  const m = S.members.find((x) => norm(x.name) === k) || S.members.find((x) => (x.aliases || []).some((a) => norm(a) === k));
  return m?.id || null;
}
let built = null, builtKey = '';
function sheetBuilt() {
  if (!R?.data || !sheetApi() || R.api !== sheetApi()) return null;
  const key = R.ver + '|' + S.members.length;
  if (built && builtKey === key) return built;
  built = fromSheet(R.data, { memberById, idByName }); builtKey = key;
  return built;
}

// ── 앱 경기 → 시트 한 경기 ──
function sidesOf(md) {
  const c = [0, 1].map((i) => teamColor(md, i));
  return c[0] === 'blue' || c[1] === 'pink' ? ['B', 'A'] : ['A', 'B'];
}
function helpers() {
  const nums = matchNumbers();
  return {
    rosters, sides: sidesOf, teamName, scoring: (md) => fmtOf(md).scoring,
    matchNo: (md) => nums.get(md.id)?.no ?? null,
    plainName: (id, md) => memberById(id)?.name || md?.guests?.[id]?.name || '',
  };
}
export const gamesOfMd = (id) => S.games.filter((g) => g.matchdayId === id);
// 시트에 넣을 경기: 끝난(played) 2팀 경기 (샘플·취소 제외, 끝난 라운드가 있는 것)
export const archivable = (md) => md && !md.sample && !md.cancelled && md.status === 'played' && rosters(md).length >= 2
  && S.games.some((g) => g.matchdayId === md.id && g.done);
export function appItem(md, h = helpers()) { return toItem(md, gamesOfMd(md.id), h); }

// 기록 화면용: 시트 기록 + Firebase 기록 합치기
//  · 시트에만 있는 경기 → 시트
//  · 둘 다 있으면: 앱 기록이 시트에 보낸 뒤로 그대로면(지문 같음) 시트(손으로 고친 내용 포함), 앱에서 고쳤거나 다시 진행 중이면 앱
//  appDays(): 기록에 들어갈 Firebase 경기일 (호출하는 쪽 규칙)
let mergeMemo = { k: null, v: null };
export function mergedRecords(appDays) {
  const sb = sheetBuilt();
  const k = [S.allMatchdays, S.matchdays, S.games, sb, S.members.length];
  if (mergeMemo.k && mergeMemo.k.every((x, i) => x === k[i])) return mergeMemo.v;
  const app = appDays();
  let v;
  if (!sb) {
    const gBy = groupGames(S.games);
    v = { days: app, gamesOf: (id) => gBy.get(id) || [], sheet: false };
  } else {
    const h = helpers(), inSheet = new Set(sb.mds.map((m) => m.id));
    const useApp = new Set(app.filter((m) => {
      if (!inSheet.has(m.id) || m.status !== 'played') return true;
      const sh = sb.hash.get(m.id);
      return !!sh && appItem(m, h).hash !== sh;
    }).map((m) => m.id));
    const days = [...sb.mds.filter((m) => !useApp.has(m.id)), ...app.filter((m) => useApp.has(m.id))];
    const gBy = groupGames([...sb.games.filter((g) => !useApp.has(g.matchdayId)), ...S.games.filter((g) => useApp.has(g.matchdayId))]);
    v = { days, gamesOf: (id) => gBy.get(id) || [], sheet: true };
  }
  mergeMemo = { k, v };
  return v;
}
function groupGames(list) {
  const m = new Map();
  list.forEach((g) => { const a = m.get(g.matchdayId); if (a) a.push(g); else m.set(g.matchdayId, [g]); });
  return m;
}

// ── 운영진 기기: 시트로 보내기 ──
export function pending() {
  if (!sheetApi()) return { items: [], total: 0 };
  const sb = sheetBuilt();
  const h = helpers();
  const items = (S.allMatchdays || S.matchdays).filter(archivable).map((md) => appItem(md, h))
    .filter((it) => !sb || sb.hash.get(it.id) !== it.hash);
  return { items, total: (S.allMatchdays || S.matchdays).filter(archivable).length };
}
export const lastPush = () => { try { return JSON.parse(ls.get(LP) || 'null'); } catch { return null; } };
export async function push(items, del = [], onProgress) {
  if (!canPush()) throw new Error('이 기기에 통합 시트 연결 키가 없어요');
  const CH = 60;
  let done = 0, res = null;
  if (!items.length && del.length) res = await call(null, { action: 'push', key: sheetKey(), items: [], del });
  for (let i = 0; i < items.length; i += CH) {
    res = await call(null, { action: 'push', key: sheetKey(), items: items.slice(i, i + CH), del: i ? [] : del });
    done = Math.min(items.length, i + CH);
    onProgress?.(done, items.length);
  }
  ls.set(LP, JSON.stringify({ at: Date.now(), n: items.length + del.length }));
  await loadRecords(true);
  return res;
}
// 경기를 지웠을 때 시트에서도 빼기
export async function forget(id) {
  if (!canPush() || !sheetBuilt()?.mds.some((m) => m.id === id)) return;
  try { await push([], [id]); } catch (e) { console.warn(e); }
}

// 자동: 운영진 기기에서 데이터가 바뀌면 잠시 뒤 확인해 보냄 (한 번에 많으면 설정 화면에서 직접)
const AUTO_MAX = 30;
let tmr = 0, busy = false;
async function autoPush() {
  if (!canPush() || !S.operator || busy || !S.members.length) return;
  busy = true;
  try {
    await loadRecords();
    if (!R) return;
    const { items } = pending();
    if (items.length && items.length <= AUTO_MAX) await push(items);
  } catch (e) { console.warn('통합 시트 자동 보내기', e); }
  finally { busy = false; }
}
export function startRecordSync() {
  if (inSandbox()) return;
  let started = false;
  const kick = () => { if (!sheetApi()) return; if (!started) { started = true; loadRecords(); } };
  onChange(() => { kick(); if (canPush() && S.operator) { clearTimeout(tmr); tmr = setTimeout(autoPush, 8000); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sheetApi() && Date.now() - (R?.at || 0) > 5 * 60e3) loadRecords(true); });
}
