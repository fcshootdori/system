// 회원 로그인 — 카페 닉네임 + 비밀번호(숫자 4자리)
//
//  저장 구조 (Firestore)
//   authset/{회원ID}  : { ver, registered, at }        — 비밀번호를 정했는지 여부와 버전 (누구나 읽기)
//   auth/{열쇠}       : { pid, at }                    — 열쇠 = SHA-256(회원ID:버전:비밀번호)
//  auth 컬렉션은 목록 조회가 막혀 있어서(firestore.rules), 비밀번호를 모르면 열쇠 문서를 찾을 수 없음.
//  비밀번호를 바꾸거나 운영진이 초기화하면 버전이 올라가서 예전 비밀번호 열쇠는 더 이상 맞지 않음.
//
//  자동 로그인: 켜면 이 기기(localStorage)에 로그인 정보를 남기고, 끄면 이번 접속(sessionStorage)에만.
import { db } from './store.js?v=0.1.81';

const SALT = 'shootdori-v1';
const LS = 'teamapp:auth';
export async function sha(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const keyOf = (pid, ver, pin) => sha(`${pid}:${ver}:${pin}:${SALT}`);
export const validPin = (p) => /^\d{4}$/.test(String(p || ''));

export function loadSession() {
  try { const s = sessionStorage.getItem(LS) || localStorage.getItem(LS); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveSession(a, remember) {
  try { sessionStorage.removeItem(LS); localStorage.removeItem(LS); } catch {}
  if (!a) return;
  try { (remember ? localStorage : sessionStorage).setItem(LS, JSON.stringify(a)); } catch {}
}
export const isRemembered = () => { try { return !!localStorage.getItem(LS); } catch { return false; } };

export async function status(pid) {
  const s = await db.get('authset/' + pid);
  return { registered: !!s?.registered, ver: s?.ver || 1 };
}

// 처음 접속: 비밀번호 등록
export async function register(pid, pin) {
  if (!validPin(pin)) throw new Error('비밀번호는 숫자 4자리로 정해 주세요');
  const st = await status(pid);
  if (st.registered) throw new Error('이미 비밀번호가 있어요. 비밀번호로 로그인해 주세요');
  const key = await keyOf(pid, st.ver, pin);
  await db.set('auth/' + key, { pid, at: Date.now() });
  await db.set('authset/' + pid, { ver: st.ver, registered: true, at: Date.now() });
  return { pid, key, ver: st.ver };
}

// 로그인
export async function login(pid, pin) {
  if (!validPin(pin)) throw new Error('비밀번호는 숫자 4자리예요');
  const st = await status(pid);
  if (!st.registered) throw new Error('아직 비밀번호가 없어요. 처음 접속으로 비밀번호를 정해 주세요');
  const key = await keyOf(pid, st.ver, pin);
  const doc = await db.get('auth/' + key);
  if (!doc || doc.pid !== pid) throw new Error('비밀번호가 맞지 않아요. 잊었다면 운영진에게 초기화를 요청해 주세요');
  return { pid, key, ver: st.ver };
}

// 자동 로그인 확인: 비밀번호가 바뀌었거나 초기화됐으면 다시 로그인
export async function verify(sess) {
  if (sess?.temp) return true;   // 서버 규칙이 아직 없을 때의 임시 접속 (이번 접속에만)
  if (!sess?.pid || !sess.key) return false;
  const st = await status(sess.pid);
  if (!st.registered || st.ver !== sess.ver) return false;
  const doc = await db.get('auth/' + sess.key);
  return !!doc && doc.pid === sess.pid;
}

export async function changePin(sess, oldPin, newPin) {
  if (!validPin(newPin)) throw new Error('새 비밀번호는 숫자 4자리로 정해 주세요');
  const cur = await login(sess.pid, oldPin);
  const ver = cur.ver + 1;
  const key = await keyOf(sess.pid, ver, newPin);
  await db.set('auth/' + key, { pid: sess.pid, at: Date.now() });
  await db.set('authset/' + sess.pid, { ver, registered: true, at: Date.now() });
  try { await db.del('auth/' + cur.key); } catch {}
  return { pid: sess.pid, key, ver };
}

// 운영진: 비밀번호 초기화 → 다음 접속 때 새로 정함
export async function resetPin(pid) {
  const st = await status(pid);
  await db.set('authset/' + pid, { ver: st.ver + 1, registered: false, at: Date.now() });
}
