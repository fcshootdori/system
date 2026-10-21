/**
 * 슛도리 통합 시트 — Apps Script
 *
 *  회원 명부와 경기 기록을 시트 하나에서 관리하고, 앱과 주고받습니다.
 *   · 실시간이 필요한 것(신청·드래프트·경기 진행)은 앱(Firebase)이 맡고
 *   · 끝난 경기 기록과 회원 명부는 이 시트가 맡습니다.
 *
 *  탭
 *   회원      회원 명부 (예전 회원현황 시트 그대로). 앱 회원 정보는 여기서 고칩니다.
 *   경기      경기마다 한 줄. 회차·구분·팀 이름·방식을 고칠 수 있고, 점수·결과·MOM·득점은 자동 계산(회색 칸)
 *   라운드    라운드마다 한 줄. 점수와 득점자는 여기서 고칩니다.
 *   출전기록  선수마다 한 줄. 팀·MOM·지각은 여기서 고칩니다. 결과·득점·자책골은 자동 계산(회색 칸)
 *   개인기록  시즌별·통산 개인 기록 (자동 계산)
 *   안내      쓰는 방법
 *
 *  처음 설정 (한 번만)
 *   1) 새 구글 시트 → 확장 프로그램 › Apps Script → 이 코드를 모두 붙여 넣고 저장
 *   2) 위쪽 함수 목록에서 setup 을 골라 ▶ 실행 → 권한 허용
 *   3) 배포 › 새 배포 › 유형: 웹 앱 · 실행: 나 · 액세스: 모든 사용자 → 배포 → 웹 앱 주소 복사
 *   4) 시트 메뉴 슛도리 › 앱 연결 정보 에서 연결 키 확인
 *   5) 앱 운영모드 › 설정 › 통합 시트 에 웹 앱 주소와 연결 키를 넣고 [경기 기록 모두 보내기]
 *   6) 시트 메뉴 슛도리 › 예전 회원 명부 가져오기 (예전 시트 주소를 넣으면 그대로 복사)
 *  코드를 고친 뒤에는 배포 › 배포 관리 › 수정(연필) › 버전: 새 버전 → 배포 (주소는 그대로)
 */

var APP_NAME = '슛도리';
var TABS = { members: '회원', games: '경기', rounds: '라운드', players: '출전기록', stats: '개인기록', guide: '안내' };
var RAW_TAB = '앱원본';   // 앱(Firebase)에서 지우기 전에 남겨 두는 경기 원본 (숨김 탭)
var RANK_MIN = 15;

// 탭 칸 — 회색(auto) 칸은 시트가 다시 계산할 때 덮어씁니다
var COLS = {
  games: [
    ['경기ID', 'id'], ['날짜', 'date'], ['회차', 'no'], ['구분', 'kind'], ['핑크팀 이름', 'nameA'], ['블루팀 이름', 'nameB'], ['방식', 'scoring'],
    ['핑크(A)', 'sa', 1], ['블루(B)', 'sb', 1], ['결과', 'result', 1], ['라운드 수', 'nr', 1], ['MOM', 'momText', 1], ['득점', 'goalText', 1],
    ['출처', 'src'], ['앱 기록 지문', 'hash'], ['앱에서 받은 시각', 'sentAt'],
  ],
  rounds: [['경기ID', 'id'], ['날짜', 'date', 1], ['라운드', 'r'], ['핑크(A)', 'a'], ['블루(B)', 'b'], ['핑크 득점', 'ga'], ['블루 득점', 'gb']],
  players: [
    ['경기ID', 'id'], ['날짜', 'date', 1], ['이름', 'name'], ['팀', 'team'], ['MOM', 'mom'], ['지각', 'late'],
    ['결과', 'res', 1], ['득점', 'goals', 1], ['자책골', 'og', 1], ['회원ID', 'mid'],
  ],
  stats: [['시즌', 's'], ['순위', 'rank'], ['이름', 'name'], ['출전', 'gp'], ['승', 'w'], ['무', 'd'], ['패', 'l'], ['승점', 'pts'], ['승률', 'wr'],
    ['득점', 'g'], ['자책골', 'og'], ['MOM', 'mom'], ['지각', 'late'], ['순위 대상', 'ranked']],
};

// ───────────────────────── 메뉴 ─────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP_NAME)
    .addItem('처음 설정 (탭 만들기)', 'setup')
    .addItem('기록 다시 계산', 'rebuild')
    .addItem('디자인 정리 (모든 탭)', 'styleAll')
    .addSeparator()
    .addItem('예전 회원 명부 가져오기', 'importOldMembers')
    .addItem('예전 승률계산기 보관하기 (참고용)', 'archiveOldRecords')
    .addSeparator()
    .addItem('앱 연결 정보', 'showConnection')
    .addItem('연결 키 새로 만들기', 'resetKey')
    .addToUi();
}

// ───────────────────────── 설정 ─────────────────────────
function setup() {
  var ss = SpreadsheetApp.getActive();
  ensureTab_(ss, TABS.members, 0);
  ['games', 'rounds', 'players', 'stats'].forEach(function (k, i) { tableTab_(ss, k, i + 1); });
  guideTab_(ss);
  var blank = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  key_();
  // 시트를 손으로 고치면 앱이 새 기록을 받아 가도록 + 매시간 자동 계산
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('onSheetEdit') < 0) ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  if (have.indexOf('hourly') < 0) ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  rebuild();
  styleAll(true);
  ui_('처음 설정을 마쳤어요.\n\n다음 순서:\n1) 배포 › 새 배포 › 웹 앱 (실행: 나, 액세스: 모든 사용자) → 웹 앱 주소 복사\n2) 슛도리 메뉴 › 앱 연결 정보 에서 연결 키 확인\n3) 앱 운영모드 › 설정 › 통합 시트 에 주소·키를 넣고 [경기 기록 모두 보내기]\n4) 슛도리 메뉴 › 예전 회원 명부 가져오기');
}
function ensureTab_(ss, name, index) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name, Math.min(index, ss.getSheets().length)); }
  return sh;
}
function tableTab_(ss, k, index) {
  var sh = ensureTab_(ss, TABS[k], index), cols = COLS[k];
  if (sh.getLastRow() > 0) return sh;   // 이미 쓰던 탭은 그대로 (칸 순서를 바꿔 썼을 수 있음 — 빠진 칸은 쓸 때 뒤에 붙임)
  sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[0]; })]).setFontWeight('bold').setBackground('#131c2b').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  cols.forEach(function (c, i) {
    var col = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
    if (/^(id|date|mid|hash|sentAt|nameA|nameB|name|ga|gb|momText|goalText|s)$/.test(c[1])) col.setNumberFormat('@');
    if (c[2]) col.setBackground('#eef1f5').setFontColor('#5b6676');
  });
  if (k === 'stats') sh.getRange(2, 9, sh.getMaxRows() - 1, 1).setNumberFormat('0.0%');
  return sh;
}
function guideTab_(ss) {
  var sh = ensureTab_(ss, TABS.guide, 9);
  var lines = [
    [APP_NAME + ' 통합 시트'],
    [''],
    ['실시간이 필요한 신청·드래프트·경기 진행은 앱이 맡고, 끝난 경기 기록과 회원 명부는 이 시트가 맡아요.'],
    ['경기를 마치면(앱에서 [경기 끝내기]) 운영진 기기에서 이 시트로 기록이 자동으로 들어와요.'],
    ['회원·경기결과·개인기록 화면은 이 시트 내용을 읽어 보여 줘요. 시트에서 고치면 앱에도 반영돼요.'],
    [''],
    ['고치는 곳'],
    ['  회원 명부: 회원 탭 (앱 회원 정보에 자동 반영 — 이름·연락처·생년월일·회비는 앱 서버에 저장하지 않음)'],
    ['  점수·득점자: 라운드 탭 — 득점 칸 예) 홍길동×2, 김철수, 이영희(자책)   ← 자책골은 상대 선수 이름 뒤에 (자책)'],
    ['  출전 선수·팀·MOM·지각: 출전기록 탭 (MOM·지각은 O 표시)'],
    ['  회차·구분·팀 이름·방식(합산/라운드별): 경기 탭'],
    ['  회색 칸과 개인기록 탭은 자동 계산이라 고쳐도 다시 계산할 때 바뀌어요 (슛도리 메뉴 › 기록 다시 계산, 매시간 자동)'],
    [''],
    ['주의'],
    ['  앱에서 같은 경기를 다시 고치면(예: MOM 수정) 그 경기 줄은 앱 기록으로 다시 바뀌어요.'],
    ['  경기ID는 앱과 짝을 맞추는 칸이라 바꾸지 마세요. 새 경기를 시트에 직접 적을 땐 겹치지 않는 아무 ID(예: m20261024)를 쓰면 돼요.'],
    ['  이 시트는 공유하지 마세요(회원 연락처가 있어요). 앱은 연결 키로만 회원 명부를 읽어요.'],
    ['  끝난 지 3일 지난 경기는 앱 서버(Firebase)에서 지워져요. 기록은 이 시트가 기준이고, 신청자·드래프트까지 담긴 원본은 숨김 탭 앱원본에 남아요.'],
  ];
  sh.clear();
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  styleGuide_(sh, lines.length);
}
function key_() {
  var p = PropertiesService.getScriptProperties(), k = p.getProperty('KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, '').slice(0, 24); p.setProperty('KEY', k); }
  return k;
}
function resetKey() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('연결 키를 새로 만들까요?', '예전 키를 넣어 둔 앱 기기와 GitHub 자동 반영은 새 키로 바꿔 넣어야 해요.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().deleteProperty('KEY');
  showConnection();
}
function showConnection() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  ui_('앱 연결 정보\n\n웹 앱 주소: ' + (url || '(아직 배포 안 함 — 배포 › 새 배포 › 웹 앱)') + '\n\n연결 키: ' + key_() +
    '\n\n앱 운영모드 › 설정 › 통합 시트 에 넣어 주세요.\n연결 키는 운영진끼리만 알고 있어야 해요 (회원 명부를 읽을 수 있는 열쇠).');
}
function ui_(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } }

// ───────────────────────── 디자인 (모든 탭 같은 모양) ─────────────────────────
//  앱과 같은 색: 남색 머리글 · 핑크/블루 팀 색 · 자동 계산 칸은 회색 · 줄무늬 · 같은 글꼴
var D = {
  font: 'Noto Sans KR', size: 10,
  navy: '#171c61', ink: '#121633', sub: '#5f6680', faint: '#8b93a5', line: '#dfe3ea',
  band: '#f7f8fb', white: '#ffffff', autoHead: '#6b7096', autoBody: '#e9ecf2',
  pink: '#e11d48', pinkD: '#b0123a', pinkT: '#fde4ea', blue: '#2563eb', blueD: '#1a46b8', blueT: '#e2ebfd',
  win: '#16a36a', winT: '#e3f5ec', loss: '#d93a40', lossT: '#fde8e8', gold: '#a87400', goldT: '#fdf3dc',
  late: '#c2410c', lateT: '#fff1e6', turf: '#1f7a3d', tabRec: '#171c61', tabStat: '#e0a100', tabEtc: '#9aa4b2',
};
// 칸마다: 너비 · 정렬 · 작게(회색) · 머리글 색
var LOOK = {
  games: { id: [96, 'left', 'small'], date: [92, 'center'], no: [56, 'center'], kind: [60, 'center'], nameA: [110, 'left'], nameB: [110, 'left'], scoring: [76, 'center'],
    sa: [70, 'center', 'bold', 'pink'], sb: [70, 'center', 'bold', 'blue'], result: [110, 'center', 'bold'], nr: [72, 'center'], momText: [150, 'left'], goalText: [240, 'left'],
    src: [92, 'center'], hash: [96, 'center', 'small'], sentAt: [124, 'center', 'small'] },
  rounds: { id: [96, 'left', 'small'], date: [92, 'center'], r: [62, 'center'], a: [70, 'center', 'bold', 'pink'], b: [70, 'center', 'bold', 'blue'], ga: [260, 'left', '', 'pink'], gb: [260, 'left', '', 'blue'] },
  players: { id: [96, 'left', 'small'], date: [92, 'center'], name: [120, 'left', 'bold'], team: [64, 'center'], mom: [58, 'center'], late: [58, 'center'],
    res: [58, 'center', 'bold'], goals: [58, 'center'], og: [64, 'center'], mid: [120, 'left', 'small'] },
  stats: { s: [64, 'center'], rank: [56, 'center', 'bold'], name: [120, 'left', 'bold'], gp: [58, 'center'], w: [52, 'center'], d: [52, 'center'], l: [52, 'center'],
    pts: [64, 'center', 'bold'], wr: [72, 'center'], g: [58, 'center'], og: [64, 'center'], mom: [58, 'center'], late: [58, 'center'], ranked: [80, 'center', 'small'] },
};
function styleAll(quiet) {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n === RAW_TAB) return;
    try {
      if (n === TABS.members) styleMembers_(sh);
      else if (n === TABS.guide) styleGuide_(sh, sh.getLastRow());
      else {
        var k = Object.keys(TABS).filter(function (x) { return TABS[x] === n && COLS[x]; })[0];
        if (k) styleTab_(k); else styleGeneric_(sh);
      }
    } catch (e) { Logger.log(n + ': ' + e); }
  });
  if (quiet !== true) ui_('모든 탭의 디자인을 정리했어요.');
}
function base_(sh, rows) {
  var cols = Math.max(1, sh.getMaxColumns());
  var all = sh.getRange(1, 1, rows, cols);
  all.setFontFamily(D.font).setFontSize(D.size).setFontColor(D.ink).setVerticalAlignment('middle').setFontWeight('normal').setFontStyle('normal');
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.setConditionalFormatRules([]);
  try { sh.setHiddenGridlines(true); } catch (e) {}
  return all;
}
function head_(rg, color) {
  rg.setBackground(color || D.navy).setFontColor(D.white).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBorder(true, true, true, true, true, false, color || D.navy, SpreadsheetApp.BorderStyle.SOLID);
}
function band_(sh, row, rows, cols) {
  if (rows < 1) return;
  var b = sh.getRange(row, 1, rows, cols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  b.setFirstRowColor(D.white).setSecondRowColor(D.band);
}
function rule_(rg, text, bg, fg, bold) {
  var r = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setFontColor(fg);
  if (bg) r = r.setBackground(bg);
  if (bold) r = r.setBold(true);
  return r.setRanges([rg]).build();
}
function colOf_(sh, header) { var h = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0].map(T_); return h.indexOf(header) + 1; }

// 기록 탭 (경기 · 라운드 · 출전기록 · 개인기록)
function styleTab_(k) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TABS[k]);
  if (!sh) return;
  if (sh.getMaxRows() < 1000) sh.insertRowsAfter(sh.getMaxRows(), 1000 - sh.getMaxRows());
  var rows = sh.getMaxRows(), cols = Math.max(1, sh.getLastColumn());
  base_(sh, rows);
  sh.setFrozenRows(1);
  try { sh.setFrozenColumns(k === 'stats' ? 3 : k === 'players' ? 3 : 2); } catch (e) {}
  sh.setRowHeight(1, 36);
  try { sh.setRowHeightsForced(2, rows - 1, 26); } catch (e) { sh.setRowHeights(2, rows - 1, 26); }
  head_(sh.getRange(1, 1, 1, cols));
  band_(sh, 2, rows - 1, cols);
  var rules = [];
  COLS[k].forEach(function (c) {
    var ci = colOf_(sh, c[0]); if (ci < 1) return;
    var lk = (LOOK[k] || {})[c[1]] || [90, 'left'];
    var body = sh.getRange(2, ci, rows - 1, 1), h = sh.getRange(1, ci);
    sh.setColumnWidth(ci, lk[0]);
    body.setHorizontalAlignment(lk[1]).setWrap(false);
    if (lk[2] === 'small') body.setFontSize(9).setFontColor(D.faint);
    if (lk[2] === 'bold') body.setFontWeight('bold');
    if (lk[3] === 'pink') head_(h, D.pink);
    if (lk[3] === 'blue') head_(h, D.blue);
    if (c[2] && k !== 'stats') {   // 자동 계산 칸
      if (!lk[3]) head_(h, D.autoHead);
      body.setBackground(D.autoBody).setFontColor(lk[2] === 'small' ? D.faint : D.sub);
      h.setNote('자동 계산 칸 — 고쳐도 다시 계산할 때 바뀌어요');
    } else h.clearNote();
    if (c[1] === 'team') { rules.push(rule_(body, '핑크', D.pinkT, D.pinkD, true)); rules.push(rule_(body, '블루', D.blueT, D.blueD, true)); }
    if (c[1] === 'res') { rules.push(rule_(body, '승', D.winT, D.win, true)); rules.push(rule_(body, '패', D.lossT, D.loss, true)); rules.push(rule_(body, '무', D.autoBody, D.sub, true)); }
    if (c[1] === 'result') rules.push(rule_(body, '무승부', D.autoBody, D.sub, true));
    if (c[1] === 'mom') rules.push(rule_(body, 'O', D.goldT, D.gold, true));
    if (c[1] === 'late') rules.push(rule_(body, 'O', D.lateT, D.late, true));
    if (c[1] === 'ranked') rules.push(rule_(body, 'O', null, D.win, true));
    if (c[1] === 'wr') body.setNumberFormat('0.0%');
    if (k === 'stats' && c[1] === 'rank') {
      [['1', '#fdf3dc', '#a87400'], ['2', '#eef1f6', '#5b6676'], ['3', '#f8eadf', '#9a5a2c']].forEach(function (x) {
        rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(+x[0]).setBackground(x[1]).setFontColor(x[2]).setBold(true).setRanges([body]).build());
      });
    }
  });
  if (k === 'stats') {   // 시즌이 바뀌는 줄에 구분선 + 통산 줄은 남색 기운
    var sc = colOf_(sh, '시즌');
    if (sc > 0) {
      var L = String.fromCharCode(64 + sc);
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="통산"').setBackground('#eef0fb').setRanges([sh.getRange(2, 1, rows - 1, cols)]).build());
    }
  }
  sh.setConditionalFormatRules(rules);
  sh.setTabColor(k === 'stats' ? D.tabStat : D.tabRec);
}

// 회원 탭 (예전 회원현황 그대로 옮긴 표 — 값은 그대로 두고 모양만)
function styleMembers_(sh) {
  var last = sh.getLastRow(), cols = Math.max(1, sh.getLastColumn());
  sh.setTabColor(D.turf);
  if (!last) return;
  var vals = sh.getRange(1, 1, Math.min(last, 30), cols).getDisplayValues();
  var hi = -1;
  vals.forEach(function (r, i) { if (hi < 0 && r.some(function (c) { return T_(c) === '닉네임'; })) hi = i + 1; });
  if (hi < 0) return styleGeneric_(sh);
  var rows = Math.max(last, sh.getMaxRows());
  var all = base_(sh, rows);
  all.setBackground(null).setBorder(false, false, false, false, false, false);
  // 머리글 위 (제목 · 등급 안내): 작게, 제목만 크게
  if (hi > 1) {
    var top = sh.getRange(1, 1, hi - 1, cols);
    top.setFontSize(9).setFontColor(D.sub);
    vals.slice(0, hi - 1).forEach(function (r, i) {
      r.forEach(function (c, j) {
        if (/회원현황|회원\s*명부/.test(c)) sh.getRange(i + 1, j + 1).setFontSize(15).setFontWeight('bold').setFontColor(D.navy);
        if (/최종\s*업데이트/.test(c)) { sh.getRange(i + 1, j + 1).setFontWeight('bold'); if (j + 2 <= cols) sh.getRange(i + 1, j + 2).setFontWeight('bold').setFontColor(D.navy); }
      });
    });
  }
  sh.setFrozenRows(hi);
  var H = vals[hi - 1].map(T_);
  var nick = H.indexOf('닉네임') + 1;
  try { sh.setFrozenColumns(nick > 0 ? nick : 0); } catch (e) {}
  sh.setRowHeight(hi, 36);
  head_(sh.getRange(hi, 1, 1, cols));
  if (rows > hi) {
    try { sh.setRowHeightsForced(hi + 1, rows - hi, 26); } catch (e) {}
    band_(sh, hi + 1, rows - hi, cols);
  }
  var rules = [];
  H.forEach(function (h, j) {
    var ci = j + 1, body = rows > hi ? sh.getRange(hi + 1, ci, rows - hi, 1) : null;
    var w = /닉네임|^이름|성명/.test(h) ? 110 : /연락처|전화/.test(h) ? 120 : /사유|내용/.test(h) ? 160 : /운영진/.test(h) ? 70 : /일자|생년월일/.test(h) ? 96 : /회비/.test(h) ? 52 : /^연번|^번호/.test(h) ? 48 : 80;
    sh.setColumnWidth(ci, w);
    if (!body) return;
    body.setHorizontalAlignment(/닉네임|^이름|성명|사유|내용/.test(h) ? 'left' : 'center').setWrap(false);
    if (/닉네임/.test(h)) body.setFontWeight('bold');
    if (/회비/.test(h)) {
      head_(sh.getRange(hi, ci), D.autoHead);
      [['◎', D.winT, D.win], ['♥', D.pinkT, D.pinkD], ['O', D.blueT, D.blueD], ['▲', D.lateT, D.late], ['■', D.autoBody, D.sub]].forEach(function (x) { rules.push(rule_(body, x[0], x[1], x[2], true)); });
    }
    if (/등급/.test(h)) {
      var L = String.fromCharCode(64 + ci);
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=REGEXMATCH($' + L + (hi + 1) + ',"탈퇴|방출")').setFontColor('#a3adbd').setRanges([sh.getRange(hi + 1, 1, rows - hi, cols)]).build());
      rules.push(rule_(body, 'VIP', D.goldT, D.gold, true));
    }
  });
  sh.setConditionalFormatRules(rules);
}

// 예전 시트에서 옮겨 온 참고용 탭 (명부·…, 보관·…): 첫 줄(또는 칸이 2개 이상 찬 첫 줄)을 머리글로
function styleGeneric_(sh) {
  var last = sh.getLastRow(), cols = Math.max(1, sh.getLastColumn());
  sh.setTabColor(D.tabEtc);
  if (!last) return;
  var rows = Math.max(last, 2);
  var all = base_(sh, rows);
  all.setBackground(null).setBorder(false, false, false, false, false, false).setHorizontalAlignment('left');
  var vals = sh.getRange(1, 1, Math.min(last, 10), cols).getDisplayValues(), hi = 1;
  for (var i = 0; i < vals.length; i++) { if (vals[i].filter(function (c) { return T_(c); }).length >= 2) { hi = i + 1; break; } }
  sh.setFrozenRows(hi);
  head_(sh.getRange(hi, 1, 1, cols));
  if (last > hi) band_(sh, hi + 1, last - hi, cols);
  for (var c = 1; c <= cols; c++) sh.setColumnWidth(c, 96);
}

function styleGuide_(sh, n) {
  var rows = Math.max(n, 1);
  base_(sh, rows);
  sh.getRange(1, 1, rows, 1).setWrap(true).setFontColor(D.ink).setBackground(null);
  sh.setColumnWidth(1, 900);
  try { sh.setRowHeightsForced(1, rows, 28); } catch (e) {}
  sh.getRange(1, 1).setFontSize(18).setFontWeight('bold').setFontColor(D.navy);
  sh.setRowHeight(1, 48);
  var vals = sh.getRange(1, 1, rows, 1).getDisplayValues();
  vals.forEach(function (r, i) {
    if (/^(고치는 곳|주의)$/.test(T_(r[0]))) sh.getRange(i + 1, 1).setFontWeight('bold').setFontColor(D.white).setBackground(D.navy);
    else if (/^\s{2}/.test(r[0])) sh.getRange(i + 1, 1).setFontColor(D.sub);
  });
  sh.setTabColor(D.tabEtc);
}

// ───────────────────────── 예전 시트 가져오기 ─────────────────────────
// 예전 회원현황 시트: 회원현황 탭 → 회원 탭 (서식 그대로, 값으로), 나머지 탭 → '명부·탭이름'
function importOldMembers() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('예전 회원 명부 가져오기', '예전 회원현황 구글 시트 주소를 붙여 넣어 주세요.\n(그 시트를 볼 수 있는 계정이어야 해요. 예전 시트는 읽기만 해요)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = r.getResponseText().trim();
  var src;
  try { src = SpreadsheetApp.openByUrl(url); } catch (e) { return ui_('시트를 열지 못했어요: ' + e.message); }
  var gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  var tabs = src.getSheets();
  var main = tabs.filter(function (s) { return gid != null && String(s.getSheetId()) === gid; })[0] ||
    tabs.filter(function (s) { return hasNick_(s); })[0];
  if (!main) return ui_("'닉네임' 머리글이 있는 회원현황 탭을 찾지 못했어요.");
  var ss = SpreadsheetApp.getActive();
  var old = ss.getSheetByName(TABS.members);
  if (old && old.getLastRow() > 0 && ui.alert('지금 회원 탭 내용을 예전 명부로 바꿀까요?', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  var n = 0;
  tabs.forEach(function (s) {
    var name = s === main ? TABS.members : '명부·' + s.getName();
    copyTab_(s, ss, name, s === main ? 0 : null); n++;
  });
  bump_();
  styleAll(true);
  ui_('회원 명부를 가져왔어요 (탭 ' + n + '개). 회원 탭이 앱 회원 정보의 기준이 돼요.\n예전 회원 시트는 이제 쓰지 않아도 돼요.');
}
// 예전 승률계산기: 참고용으로 값만 보관 ('보관·탭이름'). 앱 기록은 앱에서 [경기 기록 모두 보내기]로 경기·라운드·출전기록 탭에 들어와요
function archiveOldRecords() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('예전 승률계산기 보관하기', '승률계산기 시트 주소를 붙여 넣어 주세요. 탭을 값으로 복사해 참고용으로 보관해요.\n(앱이 읽는 기록은 경기·라운드·출전기록 탭이에요)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var src;
  try { src = SpreadsheetApp.openByUrl(r.getResponseText().trim()); } catch (e) { return ui_('시트를 열지 못했어요: ' + e.message); }
  var ss = SpreadsheetApp.getActive(), n = 0;
  src.getSheets().forEach(function (s) { var sh = copyTab_(s, ss, '보관·' + s.getName(), null); sh.setTabColor('#9aa4b2'); n++; });
  styleAll(true);
  ui_('승률계산기 탭 ' + n + '개를 보관했어요 (참고용). 맨 뒤에 있어요.');
}
function hasNick_(s) {
  var h = Math.min(10, s.getLastRow()), w = s.getLastColumn();
  if (!h || !w) return false;
  return s.getRange(1, 1, h, w).getDisplayValues().some(function (row) { return row.some(function (c) { return String(c).trim() === '닉네임'; }); });
}
function copyTab_(s, ss, name, index) {
  var ex = ss.getSheetByName(name);
  var copy = s.copyTo(ss);
  if (ex) ss.deleteSheet(ex);
  copy.setName(name);
  var h = s.getLastRow(), w = s.getLastColumn();
  if (h && w) copy.getRange(1, 1, h, w).setValues(s.getRange(1, 1, h, w).getValues());   // 다른 탭을 가리키던 수식도 값으로
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(index == null ? ss.getSheets().length : index + 1);
  return copy;
}

// ───────────────────────── 읽기 · 쓰기 ─────────────────────────
var T_ = function (v) { return String(v == null ? '' : v).trim(); };
var N_ = function (v) { var n = Number(T_(v).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
var YES_ = function (v) { return /^(o|◯|○|●|v|y|yes|true|1|✓|✔|mom|지각)$/i.test(T_(v)); };
function iso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  var s = T_(v), m = s.match(/^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : s;
}

// 탭 → [{필드: 값}] (머리글 이름으로 칸을 찾아서, 칸 순서를 바꿔도 됨)
function readTab_(k) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS[k]);
  if (!sh || sh.getLastRow() < 2) return [];
  var w = sh.getLastColumn(), vals = sh.getRange(1, 1, sh.getLastRow(), w).getDisplayValues();
  var head = vals[0].map(T_), idx = {};
  COLS[k].forEach(function (c) { idx[c[1]] = head.indexOf(c[0]); });
  return vals.slice(1).map(function (row) {
    var o = {};
    COLS[k].forEach(function (c) { o[c[1]] = idx[c[1]] >= 0 ? row[idx[c[1]]] : ''; });
    return o;
  }).filter(function (o) { return T_(o.id) || T_(o.s); });
}
function writeTab_(k, list) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TABS[k]) || tableTab_(ss, k, 1);
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0].map(T_);
  while (head.length && !head[head.length - 1]) head.pop();
  // 머리글이 없거나 칸이 빠졌으면 뒤에 붙임
  COLS[k].forEach(function (c) { if (head.indexOf(c[0]) < 0) { head.push(c[0]); sh.getRange(1, head.length).setValue(c[0]).setFontWeight('bold'); } });
  var fieldAt = head.map(function (h) { var c = COLS[k].filter(function (x) { return x[0] === h; })[0]; return c ? c[1] : null; });
  var last = sh.getLastRow();
  // 우리 칸만 지우고 다시 씀 (운영진이 오른쪽에 덧붙인 메모 칸은 건드리지 않음 — 다만 줄 순서는 바뀔 수 있음)
  if (last > 1) fieldAt.forEach(function (f, i) { if (f) sh.getRange(2, i + 1, last - 1, 1).clearContent(); });
  if (!list.length) return;
  if (sh.getMaxRows() < list.length + 1) { sh.insertRowsAfter(sh.getMaxRows(), list.length + 200 - sh.getMaxRows()); try { styleTab_(k); } catch (e) {} }   // 늘어난 줄에도 같은 디자인
  // 칸마다 이어진 묶음으로 씀
  var i = 0;
  while (i < fieldAt.length) {
    if (!fieldAt[i]) { i++; continue; }
    var j = i; while (j + 1 < fieldAt.length && fieldAt[j + 1]) j++;
    var block = list.map(function (o) { return fieldAt.slice(i, j + 1).map(function (f) { var v = o[f]; return v == null ? '' : v; }); });
    sh.getRange(2, i + 1, list.length, j - i + 1).setValues(block);
    i = j + 1;
  }
}

// 기록 모델: 시트에서 고칠 수 있는 칸만 (자동 계산 칸은 다시 만듦)
function readModel_() {
  return {
    games: readTab_('games').map(function (g) { return { id: T_(g.id), date: iso_(g.date), no: T_(g.no), kind: T_(g.kind) || '정기', nameA: T_(g.nameA), nameB: T_(g.nameB), scoring: T_(g.scoring) || '합산', src: T_(g.src), hash: T_(g.hash), sentAt: T_(g.sentAt) }; }),
    rounds: readTab_('rounds').map(function (r) { return { id: T_(r.id), r: N_(r.r), a: N_(r.a), b: N_(r.b), ga: T_(r.ga), gb: T_(r.gb) }; }),
    players: readTab_('players').map(function (p) { return { id: T_(p.id), name: T_(p.name), team: /블루|^b$|blue/i.test(T_(p.team)) ? '블루' : '핑크', mom: YES_(p.mom), late: YES_(p.late), mid: T_(p.mid) }; }),
  };
}

// 득점 칸 글씨 → [[이름, 골, 자책?]] (앱 js/record-rows.js 와 같은 규칙)
function parseGoals_(text, known) {
  var out = [];
  T_(text).split(/[,，、\n]+/).map(T_).filter(String).forEach(function (tok) {
    var og = false, s = tok, re = /\((자책|og)\)|자책골?$/i;
    if (re.test(s)) { og = true; s = T_(s.replace(re, '')); }
    var name = s, n = 1;
    if (!known(s)) {
      var m = s.match(/^(.*?)\s*(?:[×xX*]\s*(\d+)|\((\d+)\)|\s(\d+)\s*골?)$/);
      if (m && T_(m[1])) { name = T_(m[1]); n = +(m[2] || m[3] || m[4]) || 1; }
      if (/\((자책|og)\)$/i.test(name)) { og = true; name = T_(name.replace(/\((자책|og)\)$/i, '')); }
    }
    if (name) out.push([name, n, og]);
  });
  return out;
}

// 자동 계산: 경기 점수·결과·MOM·득점, 출전 결과·득점, 개인기록 → 시트에 씀
function compute_(M) {
  var byG = {}, rounds = {}, players = {};
  M.games.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : (N_(x.no) - N_(y.no)) || (x.id < y.id ? -1 : 1); });
  M.games.forEach(function (g, i) { byG[g.id] = g; g.order = i; rounds[g.id] = []; players[g.id] = []; });
  M.rounds.forEach(function (r) { if (rounds[r.id]) rounds[r.id].push(r); });
  M.players.forEach(function (p) { if (players[p.id]) players[p.id].push(p); });
  var season = {};
  M.games.forEach(function (g) {
    var rs = rounds[g.id].sort(function (x, y) { return x.r - y.r; }), ps = players[g.id];
    var nameSet = {};
    ps.forEach(function (p) { if (!nameSet[p.name]) nameSet[p.name] = p; p.goals = 0; p.og = 0; });
    var known = function (n) { return !!nameSet[n]; };
    g.sa = 0; g.sb = 0; g.nr = rs.length;
    var units = [];
    rs.forEach(function (r) {
      g.sa += r.a; g.sb += r.b; units.push([r.a, r.b]);
      [r.ga, r.gb].forEach(function (t) { parseGoals_(t, known).forEach(function (x) { var p = nameSet[x[0]]; if (!p) return; if (x[2]) p.og += x[1]; else p.goals += x[1]; }); });
    });
    if (!/라운드/.test(g.scoring)) units = rs.length ? [[g.sa, g.sb]] : [];
    var win = g.sa > g.sb ? 'A' : g.sa < g.sb ? 'B' : 'D';
    g.result = !rs.length ? '' : win === 'D' ? '무승부' : (win === 'A' ? (g.nameA || '핑크') : (g.nameB || '블루')) + ' 승';
    g.momText = ps.filter(function (p) { return p.mom; }).map(function (p) { return p.name; }).join(', ');
    g.goalText = ps.filter(function (p) { return p.goals; }).sort(function (x, y) { return y.goals - x.goals; }).map(function (p) { return p.name + (p.goals > 1 ? '×' + p.goals : ''); }).join(', ');
    var y = g.date.slice(0, 4);
    ps.forEach(function (p) {
      p.date = g.date;
      var s = p.team === '블루' ? 'B' : 'A';
      p.res = !rs.length ? '' : win === 'D' ? '무' : win === s ? '승' : '패';
      if (!p.mid || /^g_/.test(p.mid) || !rs.length) return;   // 용병(게스트)은 개인기록에서 빠짐
      [y, '통산'].forEach(function (k) {
        var bag = season[k] || (season[k] = {}), st = bag[p.mid] || (bag[p.mid] = { name: p.name, gp: 0, w: 0, d: 0, l: 0, g: 0, og: 0, mom: 0, late: 0 });
        st.name = p.name;   // 가장 최근 이름
        units.forEach(function (u) { var mine = s === 'A' ? u[0] : u[1], th = s === 'A' ? u[1] : u[0]; st.gp++; if (mine > th) st.w++; else if (mine < th) st.l++; else st.d++; });
        st.g += p.goals; st.og += p.og; st.mom += p.mom ? 1 : 0; st.late += p.late ? 1 : 0;
      });
    });
    rs.forEach(function (r) { r.date = g.date; });
  });
  var stats = [];
  Object.keys(season).sort(function (a, b) { return a === '통산' ? 1 : b === '통산' ? -1 : b < a ? -1 : 1; }).forEach(function (k) {
    var list = Object.keys(season[k]).map(function (id) { var s = season[k][id]; s.s = k; s.pts = s.w * 3 + s.d; s.wr = s.w + s.l ? s.w / (s.w + s.l) : 0; s.ranked = s.gp >= RANK_MIN ? 'O' : ''; return s; });
    list.sort(function (x, y) { return y.pts - x.pts || y.wr - x.wr || y.gp - x.gp || (x.name < y.name ? -1 : 1); });
    var prev = null, rank = 0;
    list.forEach(function (s, i) { if (s.pts !== prev) { rank = i + 1; prev = s.pts; } s.rank = rank; stats.push(s); });
  });
  return stats;
}
function writeModel_(M) {
  var stats = compute_(M);
  var ord = {}; M.games.forEach(function (g) { ord[g.id] = g.order; });
  var rs = M.rounds.filter(function (r) { return ord[r.id] != null; }).sort(function (x, y) { return ord[x.id] - ord[y.id] || x.r - y.r; });
  var ps = M.players.filter(function (p) { return ord[p.id] != null; }).sort(function (x, y) { return ord[x.id] - ord[y.id] || (x.team < y.team ? 1 : x.team > y.team ? -1 : 0); });
  writeTab_('games', M.games);
  writeTab_('rounds', rs);
  writeTab_('players', ps.map(function (p) { var o = {}; for (var k in p) o[k] = p[k]; o.mom = p.mom ? 'O' : ''; o.late = p.late ? 'O' : ''; return o; }));
  writeTab_('stats', stats);
  PropertiesService.getScriptProperties().setProperty('DIRTY', '');
  bump_();
}
function rebuild() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { writeModel_(readModel_()); } finally { lock.releaseLock(); }
}
function bump_() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('VER', String((+p.getProperty('VER') || 0) + 1));
}
// 시트를 손으로 고쳤을 때: 앱이 새 내용을 받아 가도록 번호만 올려 두고, 자동 계산은 매시간(또는 메뉴에서)
function onSheetEdit(e) {
  var name = e && e.range ? e.range.getSheet().getName() : '';
  if ([TABS.games, TABS.rounds, TABS.players].indexOf(name) < 0) return;   // 기록 탭만 (회원 탭은 앱이 그때그때 읽음)
  var p = PropertiesService.getScriptProperties();
  p.setProperty('DIRTY', '1');
  bump_();
}
function hourly() {
  if (PropertiesService.getScriptProperties().getProperty('DIRTY') === '1') rebuild();
}

// ── 앱 원본 보관 (숨김 탭 '앱원본') ──
//  앱은 끝난 지 며칠 지난 경기를 Firebase에서 지워 가볍게 유지해요. 지우기 전에 경기일 문서와 라운드 문서를 그대로 여기 남겨 둬요
//  (신청자·주장·드래프트·포지션까지). 한 칸에 다 안 들어가면 옆 칸으로 나눠 적어요
function rawSheet_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(RAW_TAB);
  if (!sh) {
    sh = ss.insertSheet(RAW_TAB, ss.getSheets().length);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(10, sh.getMaxColumns())).setNumberFormat('@');
    sh.getRange(1, 1, 1, 4).setValues([['경기ID', '날짜', '보관 시각', '원본(JSON, 길면 오른쪽 칸으로 이어짐)']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}
function rawIds_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(RAW_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return T_(r[0]); }).filter(String);
}
function rawSave_(items) {
  var withRaw = items.filter(function (it) { return it.raw; });
  if (!withRaw.length) return;
  var sh = rawSheet_(), now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var ids = rawIds_();
  withRaw.forEach(function (it) {
    var s = String(it.raw), parts = [];
    for (var i = 0; i < s.length; i += 45000) parts.push(s.slice(i, i + 45000));
    var row = [T_(it.id), iso_(it.date), now].concat(parts);
    var at = ids.indexOf(T_(it.id)), r;
    if (at >= 0) r = at + 2; else { ids.push(T_(it.id)); r = ids.length + 1; }
    if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
    if (sh.getMaxRows() < r) sh.insertRowsAfter(sh.getMaxRows(), 100);
    var w = Math.max(row.length, sh.getLastColumn());
    while (row.length < w) row.push('');
    sh.getRange(r, 1, 1, w).setNumberFormat('@').setValues([row]);
  });
}

// ───────────────────────── 앱 연결 (웹 앱) ─────────────────────────
//  GET  ?action=records[&ver=N]       경기 기록 (누구나 — 앱 기록 화면). ver가 같으면 { same: true }
//  GET  ?action=members&key=K         회원 탭 전체 칸 (운영진 기기·자동 반영만 — 연락처가 있어 키 필요)
//  GET  ?action=ping&key=K            연결 확인
//  POST { action:'push', key, items:[경기], del:[경기ID] }   앱에서 끝난 경기 보내기
function doGet(e) {
  var q = (e && e.parameter) || {};
  try {
    if (q.action === 'records') return out_(records_(q.ver));
    if (!q.key || q.key !== key_()) return out_({ ok: false, error: '연결 키가 맞지 않아요' });
    if (q.action === 'members') return out_(members_());
    if (q.action === 'ping') return out_(ping_());
    return out_({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!b.key || b.key !== key_()) return out_({ ok: false, error: '연결 키가 맞지 않아요' });
    if (b.action === 'push') return out_(push_(b.items || [], b.del || []));
    if (b.action === 'members') return out_(members_());
    return out_({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function records_(ver) {
  var cur = PropertiesService.getScriptProperties().getProperty('VER') || '0';
  if (ver && String(ver) === cur) return { ok: true, ver: cur, same: true };
  var cache = CacheService.getScriptCache(), hit = cacheGet_(cache, 'rec' + cur);
  if (hit) return JSON.parse(hit);
  var M = readModel_();
  var o = {
    ok: true, ver: cur, at: new Date().toISOString(),
    games: M.games.map(function (g) { return [g.id, g.date, g.no, g.kind, g.nameA, g.nameB, g.scoring, g.src, g.hash]; }),
    rounds: M.rounds.map(function (r) { return [r.id, r.r, r.a, r.b, r.ga, r.gb]; }),
    players: M.players.map(function (p) { return [p.id, p.mid, p.name, p.team, p.mom ? 1 : 0, p.late ? 1 : 0]; }),
    raw: rawIds_(),
  };
  cachePut_(cache, 'rec' + cur, JSON.stringify(o));
  return o;
}
function cacheGet_(c, k) {
  try { var n = +c.get(k + '#n'); if (!n) return null; var parts = c.getAll(Array.apply(null, Array(n)).map(function (_, i) { return k + '#' + i; }));
    var s = ''; for (var i = 0; i < n; i++) { if (parts[k + '#' + i] == null) return null; s += parts[k + '#' + i]; } return s; } catch (e) { return null; }
}
function cachePut_(c, k, s) {
  try { var map = {}, n = Math.ceil(s.length / 90000); for (var i = 0; i < n; i++) map[k + '#' + i] = s.slice(i * 90000, (i + 1) * 90000);
    map[k + '#n'] = String(n); c.putAll(map, 21600); } catch (e) {}
}
function members_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TABS.members);
  var rows = sh && sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getDisplayValues() : [];
  return { ok: true, rows: rows, url: ss.getUrl() + '#gid=' + (sh ? sh.getSheetId() : 0) };
}
function ping_() {
  var ss = SpreadsheetApp.getActive(), M = readModel_();
  var mem = members_().rows.length;
  return { ok: true, name: ss.getName(), url: ss.getUrl(), games: M.games.length, members: mem, ver: PropertiesService.getScriptProperties().getProperty('VER') || '0' };
}
// 앱에서 보낸 경기: 같은 경기ID 줄은 모두 바꾸고, 없으면 추가
function push_(items, del) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var M = readModel_(), drop = {};
    items.forEach(function (it) { drop[it.id] = 1; });
    del.forEach(function (id) { drop[id] = 1; });
    var keep = function (x) { return !drop[x.id]; };
    M.games = M.games.filter(keep); M.rounds = M.rounds.filter(keep); M.players = M.players.filter(keep);
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    items.forEach(function (it) {
      M.games.push({ id: T_(it.id), date: iso_(it.date), no: T_(it.no), kind: T_(it.kind) || '정기', nameA: T_((it.names || [])[0]), nameB: T_((it.names || [])[1]),
        scoring: T_(it.scoring) || '합산', src: T_(it.src) || '앱', hash: T_(it.hash), sentAt: now });
      (it.rounds || []).forEach(function (r) { M.rounds.push({ id: T_(it.id), r: N_(r.r), a: N_(r.a), b: N_(r.b), ga: T_(r.ga), gb: T_(r.gb) }); });
      (it.players || []).forEach(function (p) { M.players.push({ id: T_(it.id), name: T_(p.name), team: T_(p.team) === '블루' ? '블루' : '핑크', mom: !!p.mom, late: !!p.late, mid: T_(p.mid) }); });
    });
    rawSave_(items);
    writeModel_(M);
    return { ok: true, ver: PropertiesService.getScriptProperties().getProperty('VER'), games: M.games.length, saved: items.length, removed: del.length };
  } finally { lock.releaseLock(); }
}
