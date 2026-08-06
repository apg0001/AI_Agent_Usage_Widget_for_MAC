# Quota Bar

macOS 메뉴바, Windows 시스템 트레이, Linux status tray에서 Codex, Claude, Gemini 사용량을 빠르게 확인하는 Electron 기반 Quota Bar입니다.

## 주요 기능

- 메뉴바 트레이에서 사용량 팝오버 열기
- Codex, Claude, Gemini 사용량 10초 간격 자동 갱신
- 표시할 AI 제공자 선택
- 제공자별 로그인/로그아웃
- 메뉴바 제목에 평균 사용률 또는 모델별 사용률 표시
- 수동 새로고침 및 앱 종료

실제 로컬 세션을 찾지 못한 Codex 값은 데모 adapter에서 생성합니다. 실제 서비스 API가 확정되면 `src/main/usageProviders.ts`의 provider adapter를 교체하면 됩니다.
현재 앱에서 직접 저장한 인증 정보는 앱 userData 디렉터리의 JSON 설정 파일에 저장합니다. 배포 전에는 macOS Keychain 저장 방식으로 바꾸는 것을 권장합니다.

로컬 세션 자동 감지:

- Codex: `~/.codex/auth.json` access token으로 `https://chatgpt.com/backend-api/wham/usage`를 호출합니다. 실패하면 `~/.codex/sessions`의 rate limit 기록에서 사용률과 초기화 시간을 읽습니다.
- Claude: Claude Code가 저장한 로컬 OAuth 세션을 우선 사용합니다. macOS에서는 Keychain fallback도 사용해 Anthropic usage API를 호출합니다. 5시간/주간 창과 초기화 시간을 표시합니다.
- Gemini: `~/.gemini/oauth_creds.json` 로그인 상태를 감지합니다. 다만 2026년 6월 18일부터 Gemini CLI의 개인 계정 Google 로그인은 Antigravity CLI 전환 대상입니다. 기존 세션이 없으면 Antigravity CLI 전환 또는 API key 흐름이 필요합니다.

기간별 사용량:

- Codex는 제공자 API가 주는 사용량 창 길이에 따라 `주간 한도`, `n일 한도`, `n시간 한도`처럼 표시합니다. 현재 로컬 Codex 응답은 604800초, 즉 7일 주간 창으로 확인되었습니다.
- Claude는 제공자 API가 주는 `5시간 한도`와 `주간 한도` 사용률, 초기화까지 남은 시간을 동일한 크기의 행으로 표시합니다.
- Gemini는 OAuth 로그인 상태와 오늘 자정까지 남은 시간을 표시합니다. 실제 일일 사용률은 Gemini 사용량 API가 확정되면 연결합니다.
- 데모 fallback은 `5시간`, `오늘`, `주간` 추정값을 표시해 UI 검증이 가능하게 합니다.
- 네트워크나 Keychain 조회가 순간 실패하면 Codex/Claude는 마지막 정상 사용량을 유지해 로그인 상태가 깜빡이지 않게 합니다.

## 로그인

앱에서 로그인하는 방법:

1. 표시할 모델 토글을 켭니다.
2. Codex는 CLI 세션이 있으면 자동으로 연결됩니다. 필요하면 해당 카드의 토큰 입력칸에 토큰을 넣고 `로그인`을 누릅니다.
3. Claude는 터미널에서 `claude /login`을 실행하면 앱이 Claude Code 세션을 자동으로 확인합니다.
4. Gemini는 기존 `~/.gemini/oauth_creds.json` 세션이 있으면 자동 감지됩니다. 개인 계정에서 `gemini` Google 로그인이 막히면 Antigravity CLI로 전환하거나 API key 인증을 사용해야 합니다.
5. 앱에 저장된 인증으로 로그인된 경우 같은 위치가 `로그아웃`으로 바뀝니다.

앱에 저장된 로그인 상태는 userData 설정 파일에 저장되어 앱을 다시 실행해도 유지됩니다.

앱 안의 Gemini `Google OAuth 로그인` 버튼을 사용하려면 실행 환경에 `GEMINI_OAUTH_CLIENT_ID`, `GEMINI_OAUTH_CLIENT_SECRET`가 필요합니다. 일반 배포판에서는 Google의 Gemini CLI/Antigravity 전환 정책 때문에 기존 CLI 세션 또는 API key 기반 흐름을 우선 확인해야 합니다.

## 실행

```bash
npm install
npm run dev
```

## 플랫폼별 빌드

공통 사용량 계산, API 파싱, UI는 `src/shared`, `src/main`, `src/renderer`에 두고 OS별 처리는 `src/main/platform` 아래 어댑터로 분리합니다.

- macOS: `src/main/platform/mac.ts`
- Windows: `src/main/platform/windows.ts`
- Linux: `src/main/platform/linux.ts`

macOS에서 앱 디렉터리 빌드 확인:

```bash
npm run build
open "dist/mac-arm64/Quota Bar.app"
```

배포 패키지 생성:

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

Windows/Linux 배포 파일은 각 OS에서 같은 저장소를 clone한 뒤 해당 플랫폼 명령으로 빌드하는 방식을 권장합니다. macOS에서 교차 빌드를 시도할 수는 있지만 코드서명, NSIS, AppImage/deb 도구 체인 때문에 CI 또는 실제 대상 OS에서 빌드하는 편이 안정적입니다.

Windows로 가져가서 빌드:

```powershell
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
npm run verify
npm run package:win
```

Windows 산출물은 `dist` 아래의 `Quota Bar Setup ... .exe` 또는 portable `.exe`로 생성됩니다. Claude의 Windows Credential Manager fallback은 아직 후속 작업 대상이라, 현재 Windows에서는 Claude Code가 파일로 저장한 로컬 OAuth 세션을 우선 확인합니다.

Linux로 가져가서 빌드:

```bash
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
npm run verify
npm run package:linux
```

Linux 산출물은 `dist` 아래의 AppImage 또는 deb 파일로 생성됩니다. Linux Secret Service fallback도 후속 작업 대상입니다.

## 검증 및 테스트 하네스

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run verify
```

- 단위 테스트: `tests/unit`에서 사용량 수집 adapter의 표시 필터, 로그아웃 상태, 사용량 계산을 검증합니다.
- 통합 테스트: `tests/integration`에서 로그인, 표시 모델 선택, 로그아웃 흐름을 한 번에 검증합니다.
- 플랫폼 빌드 하네스: `tests/integration/crossPlatformBuild.test.ts`에서 `package:mac`, `package:win`, `package:linux` 스크립트와 macOS/Windows/Linux 패키징 타깃을 검증합니다.
- 플랫폼 분기 하네스: `tests/integration/localSessionDetection.test.ts`에서 macOS Keychain 어댑터와 Windows/Linux 어댑터 선택 분기를 검증합니다.
- 전체 검증: `npm run verify`가 타입 검사, 린트, 단위 테스트, 통합 테스트, 빌드를 순서대로 실행합니다.

## 작업 규칙

- 이슈는 브랜치 생성 전에 한국어로 작성합니다.
- 브랜치명은 작업 종류와 이슈 번호를 포함합니다.
- 예시: `feat/#1-menu-bar-usage-widget`, `fix/#2-refresh-error`
- 커밋 메시지는 한국어로 작성하고 `[feat] ~~~`, `[docs] ~~~`, `[fix] ~~~` 형식을 사용합니다.
- 작업 완료 후 PR을 생성하고 코드리뷰 내용을 한국어로 작성합니다.
- 병합 대상은 `develop` 브랜치입니다.
- PR 승인 자동화는 저장소 권한과 GitHub 정책에 따라 별도 승인 계정 또는 GitHub App 설정이 필요합니다.

## 추가로 필요한 기능 후보

- Gemini 실제 사용량 API 연결
- Windows Credential Manager 및 Linux Secret Service fallback
- macOS Keychain 기반 앱 저장 토큰
- 사용량 임계치 알림
- 일/주/月 사용량 추세 및 CLI 로그 기반 토큰/비용 집계
- 자동 시작 로그인 항목 등록
- 네트워크 실패 시 재시도 및 마지막 성공값 표시
