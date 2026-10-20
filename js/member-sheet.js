// 회원현황 구글 시트 → 앱 회원 정보
//  브라우저(운영진 기기)와 자동 반영 스크립트(GitHub Actions)가 함께 쓰는 순수 모듈 — 화면·저장소 코드 없음
//
//  시트 항목 (2026_슛도리 회원현황 탭)
//   연번 · 가입일자 · 등급 · 닉네임 · 이름 · 생년월일 · 연락처 · 운영진 이력(V, 내용) · 장불여부 · 장불 사유
//   · 장불시작일자 · 장불해제일자 · 생일(월) · 생일(일) · 1~12월 회비
//
//  개인정보 보호: 앱 서버(Firestore)는 누구나 읽을 수 있으므로
//   - 서버에 저장: 연번 · 가입일자 · 등급 · 닉네임 · 운영진 이력 · 장불여부 · 장불 시작/해제일자
//   - 서버에 저장하지 않음: 이름 · 생년월일 · 연락처 · 장불 사유 · 생일 · 회비
//     → 시트 주소를 저장해 둔 운영진 기기에서만 시트에서 바로 읽어 보여 줌
export const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

// ── CSV ──
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const T = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const dash = (v) => (/^[-–—]$/.test(T(v)) ? '' : T(v));
// 2017.10.02. / 2024.05.20 / 2026. 10. 20 / 2026-01-04 → 2017-10-02
export function isoDay(v) {
  const m = T(v).match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}
const two = (v) => { const n = parseInt(T(v), 10); return Number.isFinite(n) && n > 0 ? String(n).padStart(2, '0') : ''; };

// 회비 칸: ◎(연납) ♥(선납) O(월납) ▲(장불) ■(면제) - (없음)
export const FEE_KINDS = {
  year: { label: '연납', mark: '◎' },
  pre: { label: '선납', mark: '♥' },
  month: { label: '월납', mark: 'O' },
  abs: { label: '장불', mark: '▲' },
  free: { label: '면제', mark: '■' },
};
export function feeKind(v) {
  const s = T(v);
  if (!s || /^[-–—]$/.test(s)) return '';
  if (/연납|◎/.test(s)) return 'year';
  if (/선납|♥|❤/.test(s)) return 'pre';
  if (/월납|^[oO○]/.test(s)) return 'month';
  if (/장불|▲/.test(s)) return 'abs';
  if (/면제|■/.test(s)) return 'free';
  return 'etc';
}

// 닉네임에 괄호 표기가 있으면 앞뒤를 별칭으로: 스테이(stay) → 스테이, stay
export function nickParts(nick) {
  const m = T(nick).match(/^(.+?)\s*\((.+)\)\s*$/);
  return m ? [m[1].trim(), m[2].trim()].filter((x) => x && norm(x) !== norm(nick)) : [];
}

// ── 시트 표 → 회원 기록 ──
//  rows: 시트 전체 칸(문자열 2차원 배열). 머리글 줄은 '닉네임' 칸이 있는 줄로 찾음
export function parseMemberTable(rows) {
  const hi = rows.findIndex((r) => r.some((c) => T(c) === '닉네임'));
  if (hi < 0) throw new Error("시트에서 '닉네임' 머리글을 찾지 못했어요. 회원현황 탭이 맞는지 확인해 주세요.");
  const H = rows[hi].map(T);
  const find = (re, from = 0) => { for (let i = from; i < H.length; i++) if (re.test(H[i])) return i; return -1; };
  const c = {
    no: find(/^연번|^번호/), joined: find(/가입/), grade: find(/등급/), nick: find(/^닉네임/), name: find(/^이름|성명/),
    birth: find(/생년월일/), phone: find(/연락처|전화|휴대/), absent: find(/장불\s*여부/), reason: find(/장불\s*사유/),
    absFrom: find(/장불\s*시작/), absTo: find(/장불\s*해제/), bm: find(/생일\s*\(?\s*월/), bd: find(/생일\s*\(?\s*일/),
  };
  if (c.no < 0 && c.joined === 1) c.no = 0; // 구글 시트 읽기에서 숫자 칸 머리글이 비어 오는 경우
  const st1 = find(/운영진/), st2 = st1 >= 0 ? find(/운영진/, st1 + 1) : -1;
  const fees = [];
  H.forEach((h, i) => { const m = h.match(/^(\d{1,2})\s*월\s*회비/); if (m) fees[+m[1] - 1] = i; });
  // 맨 위 '최종업데이트' 칸 옆 날짜
  let updated = '';
  rows.slice(0, hi).forEach((r) => r.forEach((x, i) => { if (/최종\s*업데이트/.test(T(x))) updated = T(r.slice(i + 1).find((y) => T(y))); }));

  const at = (r, i) => (i >= 0 ? r[i] : '');
  const records = [];
  rows.slice(hi + 1).forEach((r) => {
    const nick = T(at(r, c.nick));
    if (!nick || nick === '닉네임') return;
    // 운영진 이력: 'V' 칸과 내용 칸 (칸이 하나뿐이면 그 칸)
    let a = T(at(r, st1)), b = T(at(r, st2));
    if (st2 < 0 && a && !/^v$/i.test(a)) { b = a; a = 'V'; }
    records.push({
      no: T(at(r, c.no)).replace(/\.0+$/, ''),
      joined: isoDay(at(r, c.joined)),
      grade: T(at(r, c.grade)),
      nick,
      realName: T(at(r, c.name)),
      birth: isoDay(at(r, c.birth)),
      phone: T(at(r, c.phone)),
      staff: /^v$/i.test(a) || !!b,
      staffHist: b,
      absent: dash(at(r, c.absent)),
      absReason: dash(at(r, c.reason)),
      absFrom: isoDay(at(r, c.absFrom)),
      absTo: isoDay(at(r, c.absTo)),
      bMonth: two(at(r, c.bm)) || (isoDay(at(r, c.birth)).slice(5, 7)),
      bDay: two(at(r, c.bd)) || (isoDay(at(r, c.birth)).slice(8, 10)),
      fees: Array.from({ length: 12 }, (_, m) => (fees[m] >= 0 ? T(at(r, fees[m])) : '')),
    });
  });
  if (!records.length) throw new Error('시트에서 회원을 한 명도 찾지 못했어요.');
  return { records, updated, hasFees: fees.some((x) => x >= 0) };
}

export const isLeftGrade = (g) => /탈퇴|방출/.test(g || '');

// 서버(Firestore)에 저장하는 항목
export function publicOf(r) {
  return { sheetNo: r.no, joined: r.joined, grade: r.grade, staffV: r.staff, staffHist: r.staffHist,
    absent: r.absent, absFrom: r.absFrom, absTo: r.absTo, inSheet: true };
}
// 운영진 기기에서만 보여 주는 항목
export function privateOf(r) {
  return { realName: r.realName, birth: r.birth, phone: r.phone, absReason: r.absReason, bMonth: r.bMonth, bDay: r.bDay, fees: r.fees };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ── 시트 기록 ↔ 앱 회원 맞추기 ──
//  1) 닉네임·별칭이 같으면 같은 사람  2) 시트 연번이 같고 닉네임만 바뀐 경우  3) 한쪽 이름이 다른 쪽에 포함되는 유일한 짝(예: 우영 ↔ 우영우영우)
//  links: { [회원ID]: 기록 번호 } 로 운영진이 직접 정한 짝이 있으면 그걸 먼저 씀
export function planSync(records, members, { links = {}, knownAliases = {} } = {}) {
  const keysOf = (m) => [m.name, ...(m.aliases || []), ...(knownAliases[m.name] || [])].map(norm).filter(Boolean);
  const recKeys = (r) => [r.nick, ...nickParts(r.nick)].map(norm).filter(Boolean);
  const byRec = new Map(), used = new Set();
  const link = (ri, m, how) => { byRec.set(ri, { m, how }); used.add(m.id); };

  Object.entries(links).forEach(([mid, ri]) => {
    const m = members.find((x) => x.id === mid);
    if (m && records[ri] && !byRec.has(+ri) && !used.has(m.id)) link(+ri, m, 'manual');
  });
  records.forEach((r, ri) => {
    if (byRec.has(ri)) return;
    const ks = recKeys(r);
    const hit = members.find((m) => !used.has(m.id) && norm(m.name) === ks[0])
      || members.find((m) => !used.has(m.id) && keysOf(m).some((k) => ks.includes(k)));
    if (hit) link(ri, hit, 'name');
  });
  records.forEach((r, ri) => {
    if (byRec.has(ri) || !r.no) return;
    const hit = members.find((m) => !used.has(m.id) && m.inSheet && String(m.sheetNo || '') === r.no
      && !records.some((x) => norm(x.nick) === norm(m.name)));
    if (hit) link(ri, hit, 'no');
  });
  // 포함 관계 — 양쪽 모두 남은 것 중 짝이 하나뿐일 때만
  const restM = () => members.filter((m) => !used.has(m.id));
  records.forEach((r, ri) => {
    if (byRec.has(ri)) return;
    const k = norm(r.nick); if (k.length < 2) return;
    const cand = restM().filter((m) => { const a = norm(m.name); return a.length >= 2 && (k.includes(a) || a.includes(k)); });
    if (cand.length !== 1) return;
    const back = records.filter((x, xi) => !byRec.has(xi) && (() => { const a = norm(cand[0].name), b = norm(x.nick); return b.length >= 2 && (a.includes(b) || b.includes(a)); })());
    if (back.length === 1) link(ri, cand[0], 'similar');
  });

  const ops = [];
  records.forEach((r, ri) => {
    const pub = publicOf(r);
    const hit = byRec.get(ri);
    const extra = nickParts(r.nick);
    if (hit) {
      const m = hit.m, data = {};
      Object.entries(pub).forEach(([k, v]) => { if (!same(m[k], v)) data[k] = v; });
      let aliases = [...(m.aliases || [])];
      if (m.name !== r.nick) { aliases.push(m.name); data.name = r.nick; }
      aliases = [...new Set([...aliases, ...extra])].filter((a) => a && norm(a) !== norm(r.nick));
      if (!same(aliases, m.aliases || [])) data.aliases = aliases;
      // 회원 구분은 시트 등급으로: 탈퇴회원이 아니면 활동 회원 (예전 '유형' 값은 정리, 운영진 표시는 staff로 옮김)
      const act = !isLeftGrade(r.grade);
      if ((m.active !== false) !== act) data.active = act;
      if (m.status) { if (m.status === 'staff' && m.staff === undefined) data.staff = true; data.status = null; }
      if (m.realName) data.realName = ''; // 이름은 시트에서만 읽음 (서버에 남기지 않음)
      ops.push({ type: Object.keys(data).length ? 'update' : 'same', ri, id: m.id, how: hit.how, from: m.name, data });
    } else {
      const left = isLeftGrade(r.grade);
      ops.push({ type: 'create', ri, data: { name: r.nick, aliases: extra, ...pub, active: !left, source: 'members-sheet' } });
    }
  });
  const missing = members.filter((m) => !used.has(m.id) && m.inSheet).map((m) => m.id); // 전에는 시트에 있었는데 빠진 회원
  return { ops, missing, byRec };
}

export const syncSummary = (plan) => ({
  created: plan.ops.filter((o) => o.type === 'create').length,
  updated: plan.ops.filter((o) => o.type === 'update').length,
  same: plan.ops.filter((o) => o.type === 'same').length,
  missing: plan.missing.length,
});
