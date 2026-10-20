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
fs.writeFileSync(ip, h);
console.log(`버전 꼬리표 ${ver}: import ${n}곳 + index.html`);
