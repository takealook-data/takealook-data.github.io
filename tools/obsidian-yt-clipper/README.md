# YouTube → Obsidian Clipper

YouTube 영상을 자막·설명·메타데이터가 붙은 Obsidian 노트로 저장하는 Chrome 확장(MV3).

## 왜 "나중에 볼 동영상"을 큐로 쓰지 않나

2016-09-12 YouTube Data API v3 breaking change 이후, 나중에 볼 동영상(`WL`)과
시청 기록(`HL`)은 **API로 읽을 수도 고칠 수도 없다.**

- `channels.list` → `contentDetails.relatedPlaylists.watchLater` 는 모든 채널에서
  문자열 `"WL"` 만 돌려준다. 본인 채널을 OAuth로 조회해도 마찬가지다.
- 그 `WL` 로 `playlists.list` / `playlistItems.list` 를 호출하면 빈 목록이거나
  404 `playlistNotFound` 이다.
- `playlistItems.insert` / `delete` 도 막혀 있다. 즉 **클리핑한 영상을 WL에서
  빼는 자동화가 불가능**하다. 큐로 쓰기에 치명적이다.
- Google Takeout에도 WL은 포함되지 않는다(시스템 재생목록이라 제외).

그래서 이 확장은 **내가 소유한 일반 재생목록 하나(기본값 `📥 Clip`)를 큐로 쓴다.**
일반 재생목록은 조회·추가·삭제가 모두 공식 API로 되기 때문에
"클리핑 → 큐에서 제거" 루프가 성립한다.

이미 WL에 쌓아 둔 영상은 **1회 마이그레이션** 기능으로 옮긴다. 이 경로만은 API가
아니라 로그인된 탭의 페이지 컨텍스트에서 직접 읽는다(아래 *동작 구조* 참고).

## 동작 구조

```
popup / options  ──메시지──▶  background.js (서비스 워커)
                                 │   ├─ YouTube Data API v3  (큐 조회/추가/삭제)
                                 │   └─ Obsidian 전달 (REST / 다운로드 / URI)
                                 ▼
                          bridge.js  (ISOLATED world)
                                 ▼  window.postMessage
                          page.js    (MAIN world, youtube.com)
                                     ├─ ytInitialPlayerResponse → 제목·설명·자막
                                     └─ ytInitialData + InnerTube → WL 목록
```

`page.js` 가 MAIN world인 게 핵심이다. ISOLATED world에서는 `window.ytInitialPlayerResponse`
같은 페이지 전역이 보이지 않고, content script의 `fetch` 는 확장 오리진 취급이라
로그인 쿠키가 빠질 수 있다. MAIN world에서는 진짜 동일 출처 요청이라 세션이 그대로 실린다.

DOM 셀렉터(`ytd-playlist-video-renderer` 등)는 쓰지 않는다. YouTube UI 개편마다 깨지기
때문에, 페이지가 들고 있는 JSON(`ytInitialPlayerResponse` / `ytInitialData`)을 파싱한다.

## 설치

### 1. 확장 로드

1. `chrome://extensions` → 개발자 모드 켜기
2. **압축해제된 확장 프로그램을 로드** → 이 폴더(`tools/obsidian-yt-clipper`) 선택
3. 표시된 **확장 프로그램 ID**를 복사해 둔다 (32자 문자열)

### 2. Google Cloud에서 OAuth 클라이언트 만들기

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → `YouTube Data API v3` 사용 설정
3. **OAuth 동의 화면** → 사용자 유형 `외부` → 테스트 사용자에 **본인 계정 추가**
   (게시하지 않아도 테스트 사용자면 쓸 수 있다)
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **Chrome 확장 프로그램**
   - 항목 ID: 1단계에서 복사한 확장 ID
5. 발급된 클라이언트 ID를 `manifest.json` 의 `oauth2.client_id` 에 붙여넣는다
6. `chrome://extensions` 에서 확장 새로고침

> 확장 유형 클라이언트라 client secret이 없다. 확장 ID가 바뀌면(폴더를 옮기는 등)
> 클라이언트 ID의 항목 ID도 같이 고쳐야 한다.

### 3. Obsidian 전달 방식 고르기

확장 아이콘 → **설정** 에서 선택한다.

| 방식 | 준비물 | 특징 |
|---|---|---|
| `local-rest` (권장) | Obsidian **Local REST API** 커뮤니티 플러그인 | 볼트에 바로 꽂힌다. 플러그인 설정에서 API Key를 복사해 넣고 **연결 테스트** |
| `download` | 없음 | 다운로드 폴더에 `.md` 저장. 볼트로 수동 이동 필요 |
| `uri` | Obsidian 설치 | `obsidian://new`. 간단하지만 긴 자막은 URI 길이 제한에 걸린다 |

`local-rest` 는 HTTP 포트(기본 27123)를 쓴다. 플러그인 설정에서 "Enable Non-encrypted
(HTTP) Server" 를 켜야 한다. HTTPS 포트(27124)는 자체 서명 인증서라 확장에서 막힌다.

## 사용법

- **현재 영상 클리핑** — YouTube 영상 페이지에서 확장 아이콘 → 버튼 클릭
- **큐** — 설정한 재생목록의 대기열. `전체 처리` 를 누르면 하나씩 클리핑하고
  성공한 항목을 재생목록에서 제거한다(설정에서 끌 수 있음)
- **나중에 볼 동영상** — `불러오기` 로 WL 전체를 읽은 뒤
  - `큐로 가져오기` : 큐 재생목록에 추가 (API 할당량 소모)
  - `마크다운으로 저장` : 할당량 없이 체크리스트 `.md` 로 내려받기

평소 워크플로는 YouTube에서 영상을 큐 재생목록에 담아 두고, 나중에 `전체 처리` 를
한 번 누르는 것이다.

## API 할당량

기본 일일 할당량은 10,000 유닛이다.

| 동작 | 유닛 | 하루 상한 |
|---|---|---|
| 큐 조회 (`playlistItems.list`) | 1 / 50건 | 사실상 무제한 |
| 큐에 추가 (`playlistItems.insert`) | 50 | 200건 |
| 큐에서 제거 (`playlistItems.delete`) | 50 | 200건 |

**클리핑 자체는 할당량을 쓰지 않는다** (페이지에서 직접 읽는다). 할당량을 쓰는 건
큐에 넣고 빼는 작업뿐이다. WL 마이그레이션이 200건을 넘으면 중간에 멈추므로
며칠에 나눠 돌리거나, `마크다운으로 저장` 을 쓰면 된다.

## 테스트

```bash
npm test
```

순수 로직(노트 렌더링)과 `page.js` 의 추출 파이프라인을 검증한다. `page.js` 는
MAIN world 전용이라 import할 수 없어서, `node:vm` 에 가짜 `window`/`fetch` 를 깔고
파일을 그대로 실행해 메시지 프로토콜까지 통째로 확인한다.

## 알려진 한계

- WL 수집과 자막 추출은 YouTube 내부 데이터 구조(`ytInitialData`, InnerTube)에
  의존한다. 공식 API가 아니라서 YouTube가 구조를 바꾸면 깨질 수 있다.
  큐 기반 워크플로는 공식 API만 쓰므로 영향받지 않는다.
- 자막이 아예 없는 영상은 `_자막 없음_` 으로 저장된다.
- 개인용으로 설계했다. 웹스토어 배포는 YouTube ToS와 스토어 정책을 먼저 확인할 것.
