// 캐시 꼬임 방지: 모든 앱 파일 주소에 버전 꼬리표(?v=버전)를 붙임
//  GitHub Pages는 파일마다 따로 캐시돼서, 업데이트 직후 새 파일과 예전 파일이 섞여 버튼이 안 먹는 일이 생길 수 있음
//  → 버전마다 주소가 달라지면 한 버전의 파일만 함께 읽힘
//  사용: node scripts/stamp.mjs   (js/config.js의 APP_VERSION을 올린 뒤 실행)
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ver = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const tag = (u) => u.replace(/\?v=[^'"]*/, '') + '?v=' + ver;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let n = 0;
for (const f of walk(path.join(root, 'js')).filter((f) => f.endsWith('.js'))) {
  const s = fs.readFileSync(f, 'utf8');
  const t = s.replace(/(from\s+')(\.{1,2}\/[^']+?\.js)(\?v=[^']*)?(')/g, (_, a, u, __, b) => { n++; return a + tag(u) + b; });
  if (t !== s) fs.writeFileSync(f, t);
}
const ip = path.join(root, 'index.html');
let h = fs.readFileSync(ip, 'utf8');
h = h.replace(/(src="js\/app\.js)(\?v=[^"]*)?(")/, `$1?v=${ver}$3`).replace(/(href="css\/app\.css)(\?v=[^"]*)?(")/, `$1?v=${ver}$3`);
// 모든 모듈을 처음부터 한꺼번에 받아 오도록(가져오기 사슬 대기 없앰) + Firebase SDK 미리 받기
const mods = walk(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.relative(root, f).split(path.sep).join('/')).sort();
const pre = ['<!-- preload:start -->', ...mods.map((m) => `  <link rel="modulepreload" href="${m}?v=${ver}">`),
  ...['app', 'firestore', 'auth'].map((x) => `  <link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.2/firebase-${x}.js" crossorigin>`), '  <!-- preload:end -->'].join('\n');
h = /<!-- preload:start -->[\s\S]*?<!-- preload:end -->/.test(h) ? h.replace(/<!-- preload:start -->[\s\S]*?<!-- preload:end -->/, pre) : h.replace('</head>', '  ' + pre + '\n</head>');
fs.writeFileSync(ip, h);
// 앱이 새 버전을 알아채도록 (홈 화면 앱은 예전 화면을 오래 붙잡고 있음)
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ v: ver }) + '\n');
console.log(`버전 꼬리표 ${ver}: import ${n}곳 + index.html`);
