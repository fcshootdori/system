// 카페 공지용 이미지 생성 (canvas → PNG)
import { TEAM_COLORS } from './config.js?v=0.1.30';
import { fmtDate } from './util.js?v=0.1.30';
import { noLabel } from './domain.js?v=0.1.30';

const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const W = 1080, PAD = 64;

async function fontsReady() {
  try { await Promise.all([400, 600, 800].map((w) => document.fonts.load(`${w} 40px "Pretendard Variable"`))); } catch {}
}
function loadImg(src) {
  return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
const f = (w, px) => `${w} ${px}px ${FONT}`;
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const colorOf = (key) => TEAM_COLORS.find((c) => c.key === key);
function fit(ctx, text, max) {
  let t = String(text);
  while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -1);
  return t === String(text) ? t : t.slice(0, -1) + '…';
}

// header 높이 300
async function drawHeader(ctx, team, title, md) {
  ctx.fillStyle = team.primary || '#0f766e';
  ctx.fillRect(0, 0, W, 300);
  const emblem = await loadImg(team.emblem);
  let x = PAD;
  if (emblem) {
    ctx.save(); rr(ctx, PAD, 72, 156, 156, 28); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
    ctx.drawImage(emblem, PAD + 8, 80, 140, 140); ctx.restore();
    x = PAD + 188;
  }
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = f(600, 34); ctx.fillText(team.name || '', x, 118);
  ctx.fillStyle = '#fff'; ctx.font = f(800, 68); ctx.fillText(fit(ctx, title, W - x - PAD), x, 196);
  const sub = [noLabel(md), fmtDate(md?.date), md?.time, md?.venue].filter(Boolean).join('  ·  ');
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = f(500, 32); ctx.fillText(fit(ctx, sub, W - x - PAD), x, 250);
}
function drawFooter(ctx, H, text) {
  ctx.fillStyle = '#94a3b8'; ctx.font = f(500, 24); ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H - 36); ctx.textAlign = 'left';
}
function canvas(h) {
  const c = document.createElement('canvas'); c.width = W; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, h); ctx.textBaseline = 'alphabetic';
  return [c, ctx];
}

// ── 신청 명단 ──
export async function renderApplyImage({ team, md, list, footer, minPlayers = 0 }) {
  await fontsReady();
  const main = list.filter((a) => !a.wait), wait = list.filter((a) => a.wait);
  const cols = 2, rowH = 64;
  const rows = Math.ceil(main.length / cols), wrows = Math.ceil(wait.length / cols);
  const H = 300 + 60 + 70 + rows * rowH + (wait.length ? 110 + wrows * rowH : 0) + 140;
  const [c, ctx] = canvas(Math.max(H, 900));
  await drawHeader(ctx, team, '참가 신청 명단', md);
  let y = 300 + 60;
  ctx.fillStyle = '#0f172a'; ctx.font = f(700, 36); ctx.fillText(`참가 ${main.length}명`, PAD, y + 20);
  if (minPlayers) {
    const short = Math.max(0, minPlayers - main.length);
    ctx.font = f(600, 28); ctx.textAlign = 'right';
    ctx.fillStyle = short ? '#dc2626' : '#16a34a';
    ctx.fillText(short ? `최소 ${minPlayers}명 · ${short}명 더 필요` : `최소 ${minPlayers}명 충족`, W - PAD, y + 20);
    ctx.textAlign = 'left';
  }
  y += 70;
  const colW = (W - PAD * 2 - 24) / cols;
  const cell = (a, i, y0, muted) => {
    const cx = PAD + (i % cols) * (colW + 24), cy = y0 + Math.floor(i / cols) * rowH;
    ctx.fillStyle = '#fff'; rr(ctx, cx, cy, colW, rowH - 12, 14); ctx.fill();
    ctx.fillStyle = muted ? '#94a3b8' : team.primary || '#0f766e'; ctx.font = f(700, 28);
    ctx.fillText(String(a.no).padStart(2, '0'), cx + 22, cy + 36);
    ctx.fillStyle = muted ? '#64748b' : '#0f172a'; ctx.font = f(600, 30);
    ctx.fillText(fit(ctx, a.name, colW - 100), cx + 80, cy + 37);
  };
  main.forEach((a, i) => cell(a, i, y, false));
  y += rows * rowH;
  if (wait.length) {
    y += 50; ctx.fillStyle = '#64748b'; ctx.font = f(700, 32); ctx.fillText(`대기 ${wait.length}명`, PAD, y + 10);
    y += 60; wait.forEach((a, i) => cell(a, i, y, true));
  }
  drawFooter(ctx, c.height, footer);
  return c;
}

// ── 팀 구성 ──
export async function renderTeamsImage({ team, md, teams, footer }) {
  // teams: [{ label, colorKey, members:[{name, captain}] }]
  await fontsReady();
  const n = teams.length;
  const perRow = n <= 3 ? n : Math.ceil(n / 2);
  const gridRows = Math.ceil(n / perRow);
  const maxMembers = Math.max(...teams.map((t) => t.members.length), 1);
  const rowH = 58, cardH = 110 + maxMembers * rowH + 30;
  const H = 300 + 60 + gridRows * (cardH + 32) + 120;
  const [c, ctx] = canvas(H);
  await drawHeader(ctx, team, '팀 구성 발표', md);
  const gap = 24, cardW = (W - PAD * 2 - gap * (perRow - 1)) / perRow;
  teams.forEach((t, i) => {
    const x = PAD + (i % perRow) * (cardW + gap), y = 360 + Math.floor(i / perRow) * (cardH + 32);
    const col = colorOf(t.colorKey) || { hex: '#334155', text: '#fff', label: '' };
    ctx.fillStyle = '#fff'; rr(ctx, x, y, cardW, cardH, 22); ctx.fill();
    ctx.save(); rr(ctx, x, y, cardW, 92, [22, 22, 0, 0]); ctx.fillStyle = col.hex; ctx.fill();
    if (col.key === 'white') { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = col.text; ctx.font = f(800, 38); ctx.fillText(fit(ctx, t.label, cardW - 40), x + 26, y + 60);
    ctx.font = f(600, 26); ctx.textAlign = 'right'; ctx.fillText(`${t.members.length}명`, x + cardW - 24, y + 58); ctx.textAlign = 'left';
    t.members.forEach((m, j) => {
      const yy = y + 92 + 26 + j * rowH;
      if (j) { ctx.fillStyle = '#f1f5f9'; ctx.fillRect(x + 22, yy - 6, cardW - 44, 2); }
      ctx.fillStyle = '#0f172a'; ctx.font = f(m.captain ? 800 : 500, 32);
      ctx.fillText(fit(ctx, m.name, cardW - 110), x + 26, yy + 38);
      if (m.captain) {
        ctx.fillStyle = col.key === 'white' || col.key === 'yellow' ? '#0f172a' : col.hex;
        rr(ctx, x + cardW - 76, yy + 10, 52, 38, 10); ctx.fill();
        ctx.fillStyle = col.key === 'white' || col.key === 'yellow' ? '#fff' : col.text;
        ctx.font = f(800, 24); ctx.textAlign = 'center'; ctx.fillText('C', x + cardW - 50, yy + 38); ctx.textAlign = 'left';
      }
    });
  });
  drawFooter(ctx, H, footer);
  return c;
}

// ── 경기 결과 ──
export async function renderResultImage({ team, md, standings, games, scorers, footer }) {
  // standings: [{label, colorKey, p,w,d,l,gf,ga,pts}], games: [{round, aLabel, bLabel, sa, sb}], scorers: [{name, goals}]
  await fontsReady();
  const rowH = 70;
  const H = 300 + 60 + 60 + 70 + standings.length * rowH + 80 + 60 + games.length * 58 + (scorers.length ? 80 + 60 + Math.ceil(scorers.length / 2) * 56 : 0) + 130;
  const [c, ctx] = canvas(H);
  await drawHeader(ctx, team, '경기 결과', md);
  let y = 360;
  ctx.fillStyle = '#0f172a'; ctx.font = f(800, 36); ctx.fillText('순위', PAD, y + 24); y += 60;
  const cols = [['경기', 'p'], ['승', 'w'], ['무', 'd'], ['패', 'l'], ['득실', 'gd'], ['승점', 'pts']];
  const cx = (i) => W - PAD - (cols.length - 1 - i) * 100 - 40;
  ctx.fillStyle = '#64748b'; ctx.font = f(600, 26); ctx.textAlign = 'center';
  cols.forEach(([h], i) => ctx.fillText(h, cx(i), y + 30)); ctx.textAlign = 'left'; y += 60;
  standings.forEach((s, i) => {
    ctx.fillStyle = '#fff'; rr(ctx, PAD, y, W - PAD * 2, rowH - 10, 14); ctx.fill();
    const col = colorOf(s.colorKey) || { hex: '#334155' };
    ctx.fillStyle = col.hex; rr(ctx, PAD + 20, y + 16, 28, 28, 8); ctx.fill();
    if (col.key === 'white') { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = '#0f172a'; ctx.font = f(800, 32); ctx.fillText(`${i + 1}  ${s.label}`, PAD + 66, y + 42);
    ctx.textAlign = 'center';
    cols.forEach(([, k], ci) => {
      const v = k === 'gd' ? (s.gf - s.ga > 0 ? '+' : '') + (s.gf - s.ga) : s[k];
      ctx.font = f(k === 'pts' ? 800 : 500, 30); ctx.fillText(String(v), cx(ci), y + 42);
    });
    ctx.textAlign = 'left'; y += rowH;
  });
  y += 40; ctx.fillStyle = '#0f172a'; ctx.font = f(800, 36); ctx.fillText('경기별 스코어', PAD, y + 24); y += 60;
  games.forEach((g, i) => {
    ctx.fillStyle = '#64748b'; ctx.font = f(600, 26); ctx.fillText(`${i + 1}경기`, PAD, y + 34);
    ctx.fillStyle = '#0f172a'; ctx.font = f(600, 30); ctx.textAlign = 'right'; ctx.fillText(g.aLabel, W / 2 - 80, y + 34);
    ctx.textAlign = 'center'; ctx.font = f(800, 32); ctx.fillText(`${g.sa} : ${g.sb}`, W / 2, y + 34);
    ctx.textAlign = 'left'; ctx.font = f(600, 30); ctx.fillText(g.bLabel, W / 2 + 80, y + 34);
    y += 58;
  });
  if (scorers.length) {
    y += 40; ctx.fillStyle = '#0f172a'; ctx.font = f(800, 36); ctx.fillText('득점', PAD, y + 24); y += 60;
    const colW = (W - PAD * 2) / 2;
    scorers.forEach((s, i) => {
      const x = PAD + (i % 2) * colW, yy = y + Math.floor(i / 2) * 56;
      ctx.fillStyle = '#0f172a'; ctx.font = f(600, 30); ctx.fillText(fit(ctx, s.name, colW - 120), x, yy + 34);
      ctx.fillStyle = team.primary || '#0f766e'; ctx.font = f(800, 30); ctx.fillText(`${s.goals}골`, x + colW - 110, yy + 34);
    });
  }
  drawFooter(ctx, H, footer);
  return c;
}

export function downloadCanvas(c, filename) {
  c.toBlob((b) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
export async function shareCanvas(c, filename) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
  return false;
}

// ── 2팀 합산 경기 결과 (핑크 vs 블루) ──
export async function renderMatchImage({ team, md, sides, rounds, scorers, moms, footer }) {
  // sides: [{label, colorKey, score, res}], rounds: [{round, sa, sb}], scorers: [{name, goals, og}], moms: [name]
  await fontsReady();
  const H = 300 + 40 + 360 + 40 + (rounds.length ? 70 : 0) + rounds.length * 56 + (scorers.length ? 120 + Math.ceil(scorers.length / 2) * 56 : 0) + (moms.length ? 130 : 0) + 120;
  const [c, ctx] = canvas(H);
  await drawHeader(ctx, team, '경기 결과', md);
  let y = 340;
  ctx.fillStyle = '#fff'; rr(ctx, PAD, y, W - PAD * 2, 340, 28); ctx.fill();
  const cx = [W / 2 - 270, W / 2 + 270];
  sides.forEach((sd, i) => {
    const col = colorOf(sd.colorKey) || { hex: '#334155', text: '#fff' };
    ctx.fillStyle = col.hex; rr(ctx, cx[i] - 120, y + 50, 240, 70, 35); ctx.fill();
    if (col.key === 'white') { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = col.text; ctx.font = f(800, 38); ctx.textAlign = 'center'; ctx.fillText(sd.label, cx[i], y + 99);
    ctx.fillStyle = '#0f172a'; ctx.font = f(800, 150); ctx.fillText(String(sd.score), cx[i], y + 270);
    if (sd.res) {
      ctx.font = f(800, 32);
      ctx.fillStyle = sd.res === '승' ? '#16a34a' : sd.res === '패' ? '#94a3b8' : '#64748b';
      ctx.fillText(sd.res, cx[i], y + 318);
    }
  });
  ctx.fillStyle = '#cbd5e1'; ctx.font = f(800, 90); ctx.textAlign = 'center'; ctx.fillText(':', W / 2, y + 250); ctx.textAlign = 'left';
  y += 380;
  if (rounds.length) { ctx.fillStyle = '#0f172a'; ctx.font = f(800, 36); ctx.fillText('라운드별', PAD, y + 24); y += 60; }
  rounds.forEach((r) => {
    ctx.fillStyle = '#64748b'; ctx.font = f(600, 28); ctx.fillText(`${r.round}R`, PAD + 10, y + 34);
    ctx.textAlign = 'right'; ctx.fillStyle = '#0f172a'; ctx.font = f(600, 30); ctx.fillText(sides[0].label, W / 2 - 90, y + 34);
    ctx.textAlign = 'center'; ctx.font = f(800, 32); ctx.fillText(`${r.sa} : ${r.sb}`, W / 2, y + 34);
    ctx.textAlign = 'left'; ctx.font = f(600, 30); ctx.fillText(sides[1].label, W / 2 + 90, y + 34);
    y += 56;
  });
  if (scorers.length) {
    y += 40; ctx.fillStyle = '#0f172a'; ctx.font = f(800, 36); ctx.fillText('득점', PAD, y + 24); y += 60;
    const colW = (W - PAD * 2) / 2;
    scorers.forEach((s, i) => {
      const x = PAD + (i % 2) * colW, yy = y + Math.floor(i / 2) * 56;
      ctx.fillStyle = '#0f172a'; ctx.font = f(600, 30); ctx.fillText(fit(ctx, s.name, colW - 150), x, yy + 34);
      ctx.fillStyle = team.primary || '#0f766e'; ctx.font = f(800, 30); ctx.textAlign = 'right';
      ctx.fillText(s.goals ? `${s.goals}골` : '', x + colW - 30, yy + 34);
      if (s.og) { ctx.fillStyle = '#94a3b8'; ctx.font = f(600, 24); ctx.fillText(`자책 ${s.og}`, x + colW - (s.goals ? 110 : 30), yy + 34); }
      ctx.textAlign = 'left';
    });
    y += Math.ceil(scorers.length / 2) * 56;
  }
  if (moms.length) {
    y += 40;
    ctx.fillStyle = '#fef3c7'; rr(ctx, PAD, y, W - PAD * 2, 80, 20); ctx.fill();
    ctx.fillStyle = '#92400e'; ctx.font = f(800, 32); ctx.fillText('MOM', PAD + 30, y + 52);
    ctx.fillStyle = '#0f172a'; ctx.font = f(700, 32); ctx.fillText(fit(ctx, moms.join(', '), W - PAD * 2 - 170), PAD + 140, y + 52);
  }
  drawFooter(ctx, H, footer);
  return c;
}
