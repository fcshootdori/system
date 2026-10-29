// 카페 공지용 이미지 생성 (canvas → PNG)
import { TEAM_COLORS } from './config.js?v=0.1.78';
import { fmtDate } from './util.js?v=0.1.78';
import { noLabel } from './domain.js?v=0.1.78';

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

// ── 팀 포지션 (주장이 정한 라운드 포지션 + 라운드별 출전 현황) ──
//  lineup: { teamLabel, hex, text, round, form, slots:[{x, y, pos, name, gk}], bench:[name], captain }
//  stats: { rounds, rows:[{ name, cells:[pos|null], n }] }
const SHIRT = {
  body: new Path2D('M15.5 2.5 8 6.2 3 14.4l6 3.8.5-.5V36h25V17.7l.5.5 6-3.8-5-8.2-7.5-3.7c-1.3 2.6-3.7 4-6.5 4s-5.2-1.4-6.5-4Z'),
  shade: new Path2D('M28.5 2.5 36 6.2l5 8.2-6 3.8-.5-.5V36H28.6V7.6c0-1.7 0-3.4-.1-5.1Z'),
  cuff: new Path2D('m3 14.4 6 3.8.9-1.5-6-3.8Zm38 0-6 3.8-.9-1.5 6-3.8Z'),
  col: new Path2D('M15.5 2.5c1.3 2.6 3.7 4 6.5 4s5.2-1.4 6.5-4l-2-.7c-1 2-2.6 3-4.5 3s-3.5-1-4.5-3Z'),
};
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = (s) => Math.round(((n >> s) & 255) * k); return `rgb(${c(16)},${c(8)},${c(0)})`; };
function shirt(ctx, cx, cy, w, fill, ink, label) {
  const s = w / 44;
  ctx.save(); ctx.translate(cx - w / 2, cy - 20 * s); ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 6 / s; ctx.shadowOffsetY = 3 / s;
  ctx.fillStyle = fill; ctx.fill(SHIRT.body); ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fill(SHIRT.shade);
  ctx.fillStyle = shade(fill, .68); ctx.fill(SHIRT.cuff);
  ctx.fillStyle = '#fff'; ctx.fill(SHIRT.col);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke(SHIRT.body);
  ctx.restore();
  if (label) { ctx.fillStyle = ink; ctx.font = f(800, Math.round(w * .22)); ctx.textAlign = 'center'; ctx.fillText(label, cx, cy + w * .14); ctx.textAlign = 'left'; }
}
export async function renderLineupImage({ team, md, lineup: L, stats, footer }) {
  await fontsReady();
  const PW = W - PAD * 2, PH = Math.round(PW * 64 / 68);
  const R = stats?.rounds || 0, rows = stats?.rows || [];
  const benchRows = Math.ceil((L.bench.length || 0) / 4);
  const tblH = rows.length ? 120 + 58 + rows.length * 54 + 30 : 0;
  const H = 270 + 40 + PH + (L.bench.length ? 70 + benchRows * 64 : 0) + 40 + tblH + 110;
  const [c, ctx] = canvas(H);
  // 머리: 밤 남색 + 팀 색 띠 + 엠블럼
  const g = ctx.createLinearGradient(0, 0, 0, 270); g.addColorStop(0, '#171c61'); g.addColorStop(1, '#0f1442');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 270);
  ctx.fillStyle = L.hex; ctx.fillRect(0, 262, W, 8);
  const emblem = await loadImg(team.emblem);
  let x = PAD;
  if (emblem) { ctx.save(); ctx.beginPath(); ctx.arc(PAD + 70, 132, 70, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip(); ctx.drawImage(emblem, PAD + 12, 74, 116, 116); ctx.restore(); x = PAD + 172; }
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = f(600, 30); ctx.fillText(fit(ctx, [noLabel(md), fmtDate(md?.date), md?.time?.split('~')[0]].filter(Boolean).join('  ·  '), W - x - PAD), x, 98);
  ctx.fillStyle = '#fff'; ctx.font = f(800, 64); ctx.fillText(fit(ctx, `${L.teamLabel} 포지션`, W - x - PAD), x, 172);
  ctx.fillStyle = '#ffcf3d'; ctx.font = f(800, 34); ctx.fillText(`${L.round}라운드  ·  ${L.form}`, x, 226);
  if (L.captain) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = f(600, 28); ctx.textAlign = 'right'; ctx.fillText(`주장 ${L.captain}`, W - PAD, 226); ctx.textAlign = 'left'; }
  // 축구장
  const px = PAD, py = 310;
  ctx.save(); rr(ctx, px, py, PW, PH, 28); ctx.clip();
  for (let k = 0; k < 10; k++) { ctx.fillStyle = k % 2 ? '#2a7f4b' : '#2f8a52'; ctx.fillRect(px, py + (PH * k) / 10, PW, PH / 10 + 1); }
  const sx = PW / 68, sy = PH / 60, X = (v) => px + v * sx, Y = (v) => py + v * sy;
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3;
  ctx.strokeRect(X(1), Y(1), 66 * sx, 54 * sy);
  ctx.strokeRect(X(13.85), Y(38.5), 40.3 * sx, 16.5 * sy); ctx.strokeRect(X(24.85), Y(49.5), 18.3 * sx, 5.5 * sy);
  ctx.beginPath(); ctx.ellipse(X(34), Y(1), 8.15 * sx, 8.15 * sy, 0, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(X(34), Y(44), 9.15 * sx, 9.15 * sy, 0, Math.PI * 1.22, Math.PI * 1.78); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(X(30.34), Y(55), 7.32 * sx, 3 * sy); ctx.strokeRect(X(30.34), Y(55), 7.32 * sx, 3 * sy);
  const mark = await loadImg('assets/emblem-w.png');   // 바탕 없는 흰 엠블럼 (센터 무늬)
  if (mark) { ctx.globalAlpha = .13; ctx.drawImage(mark, px + PW / 2 - 140, py + PH * .27, 280, 280); ctx.globalAlpha = 1; }
  ctx.restore();
  L.slots.forEach((s) => {
    const cx = px + (PW * s.x) / 100, cy = py + (PH * (1.7 + s.y * .9)) / 100;
    if (!s.name) { ctx.setLineDash([8, 7]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.font = f(700, 24); ctx.textAlign = 'center'; ctx.fillText(s.pos, cx, cy + 8); ctx.textAlign = 'left'; return; }
    shirt(ctx, cx, cy - 6, 104, s.gk ? '#facc15' : L.hex, s.gk ? '#5c4300' : L.text, s.pos);
    ctx.font = f(800, 26); const tw = Math.min(ctx.measureText(s.name).width, 190) + 28;
    ctx.fillStyle = '#fff'; rr(ctx, cx - tw / 2, cy + 52, tw, 40, 20); ctx.fill();
    ctx.fillStyle = '#121633'; ctx.textAlign = 'center'; ctx.fillText(fit(ctx, s.name, 190), cx, cy + 81); ctx.textAlign = 'left';
  });
  let y = py + PH + 40;
  // 대기 · 교체
  if (L.bench.length) {
    ctx.fillStyle = '#121633'; ctx.font = f(800, 32); ctx.fillText(`대기 · 교체  ${L.bench.length}명`, PAD, y + 30);
    const cw = (PW - 3 * 14) / 4;
    L.bench.forEach((nm, i) => {
      const bx = PAD + (i % 4) * (cw + 14), by = y + 56 + Math.floor(i / 4) * 64;
      ctx.fillStyle = '#fff'; rr(ctx, bx, by, cw, 50, 25); ctx.fill();
      ctx.fillStyle = L.hex; ctx.beginPath(); ctx.arc(bx + 26, by + 25, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#121633'; ctx.font = f(700, 26); ctx.fillText(fit(ctx, nm, cw - 52), bx + 44, by + 34);
    });
    y += 70 + benchRows * 64;
  }
  // 라운드별 출전 현황
  if (rows.length) {
    y += 20;
    ctx.fillStyle = '#fff'; rr(ctx, PAD, y, PW, tblH - 30, 28); ctx.fill();
    ctx.fillStyle = '#121633'; ctx.font = f(800, 34); ctx.fillText('라운드별 출전 현황', PAD + 30, y + 60);
    const nameW = 240, cntW = 110, colW = (PW - 60 - nameW - cntW) / Math.max(R, 1);
    const hy = y + 120;
    ctx.font = f(700, 24); ctx.fillStyle = '#5f6680'; ctx.textAlign = 'center';
    for (let r = 0; r < R; r++) { ctx.fillStyle = r + 1 === L.round ? L.hex : '#5f6680'; ctx.fillText(`${r + 1}R`, PAD + 30 + nameW + colW * r + colW / 2, hy); }
    ctx.fillStyle = '#5f6680'; ctx.fillText('출전', PAD + PW - 30 - cntW / 2, hy); ctx.textAlign = 'left';
    rows.forEach((row, i) => {
      const ry = hy + 22 + i * 54;
      if (i % 2 === 0) { ctx.fillStyle = '#f3f4f8'; rr(ctx, PAD + 18, ry, PW - 36, 50, 12); ctx.fill(); }
      ctx.fillStyle = '#121633'; ctx.font = f(700, 27); ctx.fillText(fit(ctx, row.name, nameW - 20), PAD + 34, ry + 35);
      row.cells.forEach((p, r) => {
        const cx = PAD + 30 + nameW + colW * r + colW / 2;
        if (p) { ctx.fillStyle = p === 'GK' ? '#facc15' : L.hex; rr(ctx, cx - colW / 2 + 6, ry + 8, colW - 12, 34, 10); ctx.fill();
          ctx.fillStyle = p === 'GK' ? '#5c4300' : L.text; ctx.font = f(800, 20); ctx.textAlign = 'center'; ctx.fillText(p, cx, ry + 32); }
        else { ctx.fillStyle = '#b8bdcc'; ctx.font = f(700, 24); ctx.textAlign = 'center'; ctx.fillText('·', cx, ry + 33); }
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = '#121633'; ctx.font = f(800, 28); ctx.textAlign = 'center'; ctx.fillText(`${row.n}`, PAD + PW - 30 - cntW / 2, ry + 36); ctx.textAlign = 'left';
    });
    y += tblH;
  }
  // 맨 아래: 슛도리 로고만 (남색 엠블럼)
  const logo = await loadImg('assets/emblem-n.png');
  if (logo) { ctx.globalAlpha = .9; ctx.drawImage(logo, W / 2 - 40, H - 100, 80, 80); ctx.globalAlpha = 1; }
  else if (footer) drawFooter(ctx, H, footer);
  return c;
}
