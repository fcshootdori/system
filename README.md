# 슛도리 SHOOTDORI (Ver.0.1.1)

다음 카페 기반 슛도리 운영 앱 — **신청 → 주장 선정 → 드래프트 → 공지 이미지 → 경기 결과 → 기록 열람**을 한 곳에서.
WD_FUTSAL 운영 흐름과 경기기록시스템(승률계산기) 조회 기능을 합친 구조입니다.

- 정적 웹앱(빌드 없음) — GitHub Pages에 그대로 올리면 동작
- 데이터: Firebase Firestore (설정 전에는 **데모 모드**로 이 브라우저에만 저장)
- 로그인 없음: 회원은 "내 이름 선택", 운영진은 오른쪽 위 **운영모드**(PIN), 주장은 **주장 링크**로 드래프트 참여

---

## 1. 새 계정에 올리기 (GitHub Pages)

1. 새 GitHub 계정(또는 조직)에서 저장소 생성 (예: `system`, Public)
2. 이 폴더의 파일 전체를 저장소 루트에 업로드
3. 저장소 **Settings → Pages → Branch: main / (root)** 저장
4. 1~2분 뒤 `https://<계정>.github.io/<저장소>/` 접속 → 데모 모드로 바로 체험 가능
   (설정 → 데이터 → **체험용 샘플 데이터**로 회원 18명·경기일을 만들어 볼 수 있음)

## 2. Firebase 연결 (모든 회원이 같은 데이터 공유)

1. 새 계정으로 [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트 만들기
2. **Build → Firestore Database** 만들기 (위치: `asia-northeast3` 서울 권장)
3. **Build → Authentication → 시작하기 → 로그인 방법 → 익명** 사용 설정
4. **Authentication → 설정 → 승인된 도메인**에 `<계정>.github.io` 추가
5. **프로젝트 설정 → 내 앱 → 웹 앱 추가** → 나오는 `firebaseConfig` 값을 `js/config.js`의 `FIREBASE`에 붙여넣기
6. **Firestore → 규칙** 탭에 `firestore.rules` 내용을 붙여넣고 게시
7. 접속 → 상단의 데모 모드 안내가 사라지면 연결 완료

> 데모 모드에서 쓰던 데이터를 옮기려면: 데모에서 **설정 → 백업 파일 받기** → (Firebase 연결 후 복원 기능은 다음 버전에서 추가)

## 3. 처음 설정 (운영모드 기본 PIN: `0000`)

1. **설정**: 엠블럼·대표 색·카페 주소·**운영 PIN 변경**
2. **설정 → 승률계산기에서 가져오기**: 시트 주소가 미리 들어가 있음 → 시트 읽기 → 낯선 이름(오타·게스트) 확인 → 가져오기
   - Members 탭 → 회원(활성 Y/N), Games + Match_Player 탭 → 지난 경기일 전체(득점·MOM·지각·자책골 포함)
   - 다시 가져와도 같은 경기는 덮어쓰기만 함 (앱으로 옮기기 전까지 시트와 병행 가능)
   - 시트 공유가 '링크가 있는 모든 사용자 · 뷰어'여야 읽을 수 있음
3. **설정 → 기본 경기 방식** (기본값: 핑크 vs 블루, 5라운드 합산, 최소 26명)
   - 팀 수 2~4, 라운드 수, 결과 계산(라운드 합산 / 라운드별 따로), 팀 색(고정 / 주장 선택), 최소 인원, 최대 정원, 드래프트 순서
   - 특정 날만 바꾸려면 **홈 → 경기일·경기 방식 수정**에서 그날만 변경
4. **회원**: 이름은 카페 닉네임 그대로. 오타·다른 표기는 별칭으로 등록

### 기록 계산 (승률계산기와 동일)
- 경기 = 참석한 경기일 수 (합산 방식: 5라운드 합계 스코어로 그날 승/무/패 1번)
- 승률 = 승 ÷ (승+패), 무승부 제외 · 승점 = 승×3 + 무
- 게스트(회원 명단에 없는 이름)는 개인 기록에서 제외

## 4. 경기일 운영 흐름

| 단계 | 누가 | 화면 |
|---|---|---|
| 1. 경기일 만들기 | 운영진 | 홈 → 새 경기일 |
| 2. 신청 | 회원(앱) / 운영진(카페 댓글 붙여넣기·직접 추가·게스트) | 신청 |
| 3. 신청 명단 공지 | 운영진 | 공지 → 신청 명단 → 이미지 저장 → 카페 업로드 |
| 4. 주장 선정·순서 | 운영진 | 팀 → 주장 선택 → 드래프트 시작 → 주장 링크 전달 |
| 5. 드래프트 | 주장(링크) / 운영진(대리 지명) | 팀 |
| 6. 팀 색 선택 → 팀 확정 → 밸런스 이동 | 주장 / 운영진 | 팀 |
| 7. 팀 공지 | 운영진 | 공지 → 팀 구성 |
| 8. 결과 입력 | 운영진 | 경기 → 5라운드 만들기 → 라운드별 점수·득점·자책골 → MOM·지각 |
| 9. 경기일 종료 | 운영진 | 경기 → 경기일 종료 · 기록 반영 → 공지 → 경기 결과 |
| 10. 기록 열람 | 모두 | 기록 (개인 상세 포함) |

## 5. 파일 구조

```
index.html              앱 진입점
css/app.css             화면 스타일 (Pretendard)
js/config.js            버전 · Firebase 설정 · 기본값 · 팀 색
js/store.js             저장소 계층 (데모 ↔ Firestore 공통 API, 트랜잭션)
js/state.js             실시간 구독 상태 · 내 이름 · 운영모드
js/domain.js            신청 순서 · 드래프트 순번 · 대진 · 순위 · 개인 기록
js/cafe-parser.js       다음 카페 댓글 붙여넣기 파서
js/notice-image.js      공지 이미지(canvas) — 신청 명단 / 팀 구성 / 경기 결과(핑크 vs 블루 스코어보드)
js/sheet-import.js      승률계산기 시트 가져오기 (Members · Games · Match_Player)
js/ui.js                모달 · 단계 표시 · 팀 색 칩
js/views/*.js           화면별 코드 (home, apply, draft, games, records, notice, admin, format-form)
firestore.rules         Firestore 보안 규칙 (v0.1)
```

## 6. 데이터 구조 (Firestore)

```
meta/team               팀 이름 · 엠블럼 · 대표 색 · PIN · winRate · cafeUrl · legacySheet
                        format{teams, rounds, scoring(sum|each), teamMode(fixed|choose), fixedColors[], minPlayers, capacity, draft}
members/{id}            name · aliases[] · active
matchdays/{id}          date · time · venue · note · format(그날만 변경 시) · mom[] · late{} · source('sheet')
                        status(open→closed→captains→drafting→teams→played)
                        apps{memberId:{at, source}} · guests{g_id:{name, host}}
                        captains[{id, token, color}] · picks[{id, team, at}] · teams[{color, members[]}]
games/{id}              matchdayId · date · order · round · a · b · sa · sb · goals{memberId:n} · og{memberId:n} · done
```

## 버전

- 0.x는 정식 출시 전 버전, 수정마다 끝자리(0.1.1, 0.1.2…)를 올리고 "버전업" 때 0.2로 올림
- 버전 표기: `js/config.js`의 `APP_VERSION`
