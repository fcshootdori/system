// 엠블럼 무늬: 화면 곳곳(경기장 사진·경기모드·기록 머리·빈 화면·바닥글)에 깔리는 한 가지 색 엠블럼
//  기본 엠블럼은 미리 만든 assets/emblem-w.png(흰색)·emblem-n.png(남색)을 쓰고,
//  설정에서 엠블럼을 바꾸면 그 이미지로 같은 한 가지 색 무늬를 기기에서 만들어 바꿔 끼워요.
const DEFAULT = 'assets/emblem.png';
let cur = DEFAULT;

function load(src) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
}

// 이미지 → 실루엣(알파) : 투명 배경 PNG면 투명도를, 아니면 어두운 부분을 무늬로
async function silhouettes(src) {
  const im = await load(src);
  const N = 320, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true });
  const s = Math.min(N / im.naturalWidth, N / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
  x.drawImage(im, (N - w) / 2, (N - h) / 2, w, h);
  const d = x.getImageData(0, 0, N, N), p = d.data;
  let clear = 0, lo = 255, hi = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 20) clear++;
    else { const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  }
  const useAlpha = clear > (N * N) * 0.05, span = Math.max(1, hi - lo);
  const alpha = new Uint8ClampedArray(N * N);
  for (let i = 0, k = 0; i < p.length; i += 4, k++) {
    const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    alpha[k] = useAlpha ? p[i + 3] : Math.min(255, ((hi - l) / span) * 255 * 1.3) * (p[i + 3] / 255);
  }
  const paint = ([r, g, b]) => {
    for (let i = 0, k = 0; i < p.length; i += 4, k++) { p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = alpha[k]; }
    x.putImageData(d, 0, 0); return c.toDataURL('image/png');
  };
  return { w: paint([255, 255, 255]), n: paint([23, 28, 97]) };
}

export async function applyEmblemMarks(src) {
  src = src || DEFAULT;
  if (src === cur) return;
  cur = src;
  const root = document.documentElement.style;
  if (src === DEFAULT) { root.removeProperty('--emb-w'); root.removeProperty('--emb-n'); return; }
  try {
    const m = await silhouettes(src);
    if (cur !== src) return;
    root.setProperty('--emb-w', `url("${m.w}")`); root.setProperty('--emb-n', `url("${m.n}")`);
  } catch { /* 엠블럼을 못 읽으면 기본 무늬 그대로 */ }
}
