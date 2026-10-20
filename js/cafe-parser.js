// 다음 카페 댓글 붙여넣기 파서 (v2 — 슛도리 신청 글 형식)
//
//  카페 신청 글 형식
//   · 운영진(작성자)이 머리 댓글을 남김: [준찬팀] / [지진희팀] / [불참] / 외 참석자(운영진 협의)
//   · 회원은 그 머리 댓글에 대댓글로 참석 여부를 남김 (참석, 참, 참스억, 불 … 표현은 자유)
//   · 복사하면 들여쓰기가 사라지므로, 머리 댓글 다음부터 다음 머리 댓글 전까지를 그 구역 댓글로 봄
//
//  댓글 한 개(모바일 복사): "* 닉네임" → ("작성자") 작성시간 [새글] → 내용 → "답글" → "기능 더보기"
//  댓글 한 개(PC 복사):     "닉네임(작성자) 작성시간 [새글]" → 내용 → "답글기능 더보기"
//  작성시간:    26.10.18 10:14 (날짜+시간) 또는 12:00 (오늘 단 댓글은 시간만)
export const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

const TIME_FULL = /(\d{2,4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?\s+(\d{1,2}):(\d{2})/;
const TIME_ONLY = /(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/;
const NOISE = /^(답글|답글쓰기|기능 더보기|답글\s*기능\s*더보기|신고|수정|삭제|좋아요|더보기|베스트|new|새글|이전 목록으로 이동|다음 목록으로 이동|\d+)$/i;
// PC에서 복사한 형식: 닉네임과 작성시간이 한 줄에 붙어 있음
//   "라미란26.10.18 10:36" · "진이작성자 26.10.18 10:14" · "치즈12:00 새글"
//   날짜는 항상 yy.mm.dd(두 자리씩)라서 "성이9826.10.18 10:36" → 성이98 / 26.10.18 로 나뉨
const HEAD_INLINE = /^(.+?)\s*(작성자)?\s*((\d{2})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2})|(\d{1,2}):(\d{2}))(\s*새글)?\s*$/;

function parseTime(line, baseDate = new Date()) {
  let m = line.match(TIME_FULL);
  if (m) { const y = m[1].length === 2 ? 2000 + +m[1] : +m[1]; return new Date(y, m[2] - 1, +m[3], +m[4], +m[5]).getTime(); }
  m = line.match(TIME_ONLY);
  if (m) { const d = new Date(baseDate); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); }
  return null;
}
const isTimeLine = (l) => TIME_FULL.test(l) || /^(작성자\s*)?\d{1,2}:\d{2}(\s*새글)?$/.test(l) || /^작성자\b/.test(l);

// 1) 댓글 단위로 나누기
function splitComments(text, baseDate) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim());
  const out = [];
  let cur = null;
  const push = () => { if (cur && cur.at != null) out.push(cur); cur = null; };
  let boundary = true;
  lines.forEach((raw) => {
    if (!raw) return;
    const wasBoundary = boundary; boundary = false;
    const boundaryNow = wasBoundary;
    const bullet = raw.match(/^[*•·∙●○-]\s*(.+)$/);
    const line = bullet ? bullet[1].trim() : raw;
    const inl = line.match(HEAD_INLINE);
    const waitingTime = cur && cur.at == null && !bullet;      // 모바일 형식: 닉네임 다음 줄이 시간
    const nm = inl ? inl[1].trim() : '';
    // 댓글 첫 줄로 인정: 첫 줄이거나, "답글기능 더보기" 바로 다음이거나, 날짜까지 붙은 형식일 때
    //  (댓글 내용 "참석 10:00"처럼 시간으로 끝나는 줄을 새 댓글로 잘못 읽지 않도록)
    const headOk = !cur || boundaryNow || (inl && inl[4] != null);
    if (inl && !waitingTime && headOk && nm && !/^(작성자|답글|기능 더보기|새글)$/.test(nm)) {   // 숫자 닉네임(3232)도 허용   // 닉네임+시간이 한 줄 (PC 복사)
      push();
      cur = { name: nm, author: !!inl[2], at: parseTime(inl[3], baseDate), body: [] };
      return;
    }
    if (bullet) {                                             // "* 닉네임" 다음 줄에 시간 (모바일 복사)
      push();
      cur = { name: line, author: false, at: null, body: [] };
      return;
    }
    if (!cur) return;
    if (cur.at == null && isTimeLine(raw)) {
      cur.author = /작성자/.test(raw);
      cur.at = parseTime(raw, baseDate);
      return;
    }
    if (NOISE.test(raw)) { boundary = true; return; }
    if (cur.at != null) cur.body.push(raw);
  });
  push();
  return out.map((c, i) => ({ ...c, order: i, body: c.body.join(' ').replace(/^첫댓글\s*/, '').trim() }));
}

// 2) 머리 댓글 판별 · 구역 종류
const ATTEND_WORD = /^(참|참석|참가|참여)/;
export function headerKind(body) {
  const t = body.replace(/^\[|\]$/g, '');
  if (/불참|불가|미참/.test(t)) return 'out';
  if (/협의|외\s*참석|대기|미정|보류/.test(t)) return 'pending';
  return 'in';
}
function isHeader(c) {
  if (!c.author) return false;
  const b = c.body;
  if (/^\[.+\]/.test(b)) return true;                        // [준찬팀], [불참]
  if (/참석자|협의|명단|신청/.test(b) && !ATTEND_WORD.test(b.replace(/\s/g, ''))) return true; // 외 참석자(운영진 협의)
  return false;
}

// 3) 이름 맞추기 (회원 이름 + 별칭, 기호·대소문자 무시)
export function buildAliasIndex(members) {
  const map = new Map();
  members.forEach((m) => [m.name, ...(m.aliases || [])].forEach((a) => { const k = norm(a); if (k && !map.has(k)) map.set(k, m.id); }));
  return map;
}
// 비슷한 회원 추천 (자동 연결은 하지 않음)
export function suggest(name, members) {
  const n = norm(name);
  if (n.length < 2) return null;
  const hits = members.filter((m) => { const k = norm(m.name); return k.length >= 2 && (n.includes(k) || k.includes(n)); });
  return hits.length === 1 ? hits[0].id : null;
}

// 4) 전체 해석 → 구역별 참석 의사 (같은 사람은 마지막 댓글 기준, 신청 시간은 첫 참석 댓글)
export function parseCafeComments(text, members, { baseDate = new Date() } = {}) {
  const idx = buildAliasIndex(members);
  const comments = splitComments(text, baseDate);
  const structured = comments.length > 0;
  const sections = [];
  let sec = null;
  const entries = [];
  comments.forEach((c) => {
    if (isHeader(c)) {
      sec = { title: c.body.replace(/^\[|\]$/g, '').trim(), kind: headerKind(c.body), count: 0 };
      sections.push(sec);
      return;
    }
    let kind = sec ? sec.kind : 'in';
    const b = c.body.replace(/\s/g, '');
    if (/^불|불참|못가|못갈|취소/.test(b)) kind = 'out';             // 팀 구역에 "불참"이라고 단 경우
    const tentative = kind === 'in' && /미정|아마|\?/.test(c.body);
    if (sec) sec.count++;
    entries.push({
      nick: c.name, at: c.at, order: c.order, body: c.body.slice(0, 60),
      section: sec?.title || '', kind, tentative,
      memberId: idx.get(norm(c.name)) || null,
    });
  });

  // 같은 사람 정리
  const final = new Map();
  entries.forEach((e) => {
    const key = e.memberId || 'nick:' + norm(e.nick);
    const prev = final.get(key);
    const firstIn = prev?.firstAt ?? (e.kind !== 'out' ? e.at : null);
    final.set(key, { ...e, firstAt: e.kind !== 'out' ? (prev?.firstAt ?? e.at) : firstIn });
  });
  const rows = [...final.values()].map((e) => ({ ...e, suggestion: e.memberId ? null : suggest(e.nick, members) }));
  return { structured, sections, rows, comments: comments.length };
}
