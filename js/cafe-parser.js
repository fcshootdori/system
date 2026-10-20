// 다음 카페 댓글 붙여넣기 파서 (v0.1)
//  - 카페 글의 댓글 영역을 통째로 복사해 넣으면 작성자·작성시간·참석/불참을 추정
//  - 실제 카페 댓글 형식 샘플을 받으면 규칙을 맞춰 정교화할 예정
const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

const TS = [
  // 24.10.19. 14:22 / 2024.10.19 14:22 / 24-10-19 14:22
  { re: /(\d{2,4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?\s+(\d{1,2}):(\d{2})/, f: (m) => {
    const y = m[1].length === 2 ? 2000 + +m[1] : +m[1];
    return new Date(y, m[2] - 1, +m[3], +m[4], +m[5]).getTime(); } },
  // 10.19 14:22
  { re: /(\d{1,2})[.\-/](\d{1,2})\.?\s+(\d{1,2}):(\d{2})/, f: (m) =>
    new Date(new Date().getFullYear(), m[1] - 1, +m[2], +m[3], +m[4]).getTime() },
  // n분 전 / n시간 전
  { re: /(\d+)\s*분\s*전/, f: (m) => Date.now() - m[1] * 60000 },
  { re: /(\d+)\s*시간\s*전/, f: (m) => Date.now() - m[1] * 3600000 },
  // 14:22
  { re: /(^|\s)(\d{1,2}):(\d{2})(\s|$)/, f: (m) => { const d = new Date(); d.setHours(+m[2], +m[3], 0, 0); return d.getTime(); } },
];
function findTime(line) {
  for (const t of TS) { const m = line.match(t.re); if (m) return t.f(m); }
  return null;
}

const OUT_RE = /(불참|취소|못\s*가|못\s*갈|빠질|빠집|빠지겠|안\s*가|x\b|ㅂㅊ)/i;
const IN_RE = /(참석|참가|신청|갑니다|가요|가겠|ㅊㅅ|ㅊㄱ|^\s*참\s*$|\bo\b|⭕|👍)/i;
const NOISE = /^(답글|답글쓰기|신고|수정|삭제|좋아요|댓글|더보기|작성자|베스트|new|\d+)$/i;

export function buildAliasIndex(members) {
  const idx = [];
  members.forEach((m) => [m.name, ...(m.aliases || [])].forEach((a) => {
    const k = norm(a); if (k) idx.push({ key: k, id: m.id });
  }));
  return idx.sort((a, b) => b.key.length - a.key.length); // 긴 별칭 우선
}
function matchMember(line, idx) {
  const k = norm(line);
  if (!k) return null;
  const exact = idx.find((a) => a.key === k);
  if (exact) return exact.id;
  const head = k.slice(0, 24);
  const part = idx.find((a) => a.key.length >= 2 && head.startsWith(a.key));
  return part ? part.id : null;
}

export function parseCafeComments(text, members) {
  const idx = buildAliasIndex(members);
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !NOISE.test(l));

  // 1) 시간 표시를 경계로 댓글 단위 분리
  const blocks = [];
  let cur = [];
  lines.forEach((l) => {
    const t = findTime(l);
    const rest = l.replace(/\d{2,4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?\s+\d{1,2}:\d{2}|\d{1,2}[.\-/]\d{1,2}\.?\s+\d{1,2}:\d{2}|\d+\s*(분|시간)\s*전|\b\d{1,2}:\d{2}\b/g, '')
      .replace(/답글(쓰기)?|신고/g, '').trim();
    if (rest) cur.push(rest);
    if (t != null) { if (cur.length) blocks.push({ lines: cur, at: t }); cur = []; }
  });
  if (cur.length) blocks.push({ lines: cur, at: null });

  // 시간 표시가 하나도 없으면 한 줄 = 댓글 하나로 간주
  const units = blocks.length > 1 || blocks[0]?.at != null
    ? blocks
    : lines.map((l) => ({ lines: [l], at: null }));

  // 2) 작성자·의사 판단
  const out = units.map((b, i) => {
    let memberId = null, authorLine = b.lines[0];
    for (const l of b.lines.slice(0, 2)) { const id = matchMember(l, idx); if (id) { memberId = id; authorLine = l; break; } }
    const body = b.lines.filter((l) => l !== authorLine).join(' ') || b.lines.join(' ');
    const intent = OUT_RE.test(body) ? 'out' : 'in';
    const sure = OUT_RE.test(body) || IN_RE.test(body);
    return { order: i, at: b.at ?? i, author: authorLine.slice(0, 30), memberId, intent, sure, text: body.slice(0, 80) };
  });

  // 3) 같은 회원은 마지막 댓글 의사로 정리, 첫 참석 댓글 시간을 신청 시간으로
  const final = new Map();
  out.forEach((c) => {
    const key = c.memberId || 'nick:' + norm(c.author);
    const prev = final.get(key);
    if (!prev) final.set(key, { ...c, firstAt: c.intent === 'in' ? c.at : null });
    else final.set(key, { ...c, firstAt: prev.firstAt ?? (c.intent === 'in' ? c.at : null) });
  });
  return { comments: out, entries: [...final.values()] };
}
