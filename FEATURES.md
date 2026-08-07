# 동작 방식 상세

README에 담기엔 너무 자세한, "실제로 어떻게 사용량을 가져오는지"에 대한 내용을 정리합니다.

## 로컬 세션 자동 감지

- **Codex**: `~/.codex/auth.json`의 access token으로 `https://chatgpt.com/backend-api/wham/usage`를 호출합니다. 실패하면 `~/.codex/sessions`의 rate limit 기록에서 사용률과 초기화 시간을 읽습니다.
- **Claude**: Claude Code가 저장한 로컬 OAuth 세션(`~/.claude/.credentials.json`)을 우선 사용합니다. macOS에서는 Keychain fallback도 사용해 Anthropic usage API를 호출합니다. 5시간/주간 창과 초기화 시간을 표시합니다.
- **Gemini**: `~/.gemini/oauth_creds.json` 로그인 상태를 감지합니다. 다만 2026년 6월 18일부터 Gemini CLI의 개인 계정 Google 로그인은 Antigravity CLI 전환 대상입니다. 기존 세션이 없으면 Antigravity CLI 전환 또는 API key 흐름이 필요합니다.

실제 로컬 세션을 찾지 못한 Codex 값은 데모 adapter에서 생성합니다. 실제 서비스 API가 확정되면 `src/main/usageProviders.ts`의 provider adapter를 교체하면 됩니다.

앱에서 직접 저장한 인증 정보는 앱 userData 디렉터리의 JSON 설정 파일에 저장합니다. 배포 전에는 macOS Keychain 저장 방식으로 바꾸는 것을 권장합니다.

## 기간별 사용량 표시

- Codex는 제공자 API가 주는 사용량 창 길이에 따라 `주간 한도`, `n일 한도`, `n시간 한도`처럼 표시합니다. 현재 로컬 Codex 응답은 604800초, 즉 7일 주간 창으로 확인되었습니다.
- Claude는 제공자 API가 주는 `5시간 한도`와 `주간 한도` 사용률, 초기화까지 남은 시간을 동일한 크기의 행으로 표시합니다.
- Gemini는 OAuth 로그인 상태와 오늘 자정까지 남은 시간을 표시합니다. 실제 일일 사용률은 Gemini 사용량 API가 확정되면 연결합니다.
- 데모 fallback은 `5시간`, `오늘`, `주간` 추정값을 표시해 UI 검증이 가능하게 합니다.
- 네트워크나 Keychain 조회가 순간 실패하면 Codex/Claude는 마지막 정상 사용량을 유지해 로그인 상태가 깜빡이지 않게 합니다.

## 로그인 상세

- Codex는 CLI 세션이 있으면 자동으로 연결됩니다. 필요하면 카드의 토큰 입력칸에 토큰을 넣고 `로그인`을 누릅니다.
- Claude는 터미널에서 `claude /login`을 실행하면 앱이 Claude Code 세션을 자동으로 확인합니다.
- Gemini는 기존 `~/.gemini/oauth_creds.json` 세션이 있으면 자동 감지됩니다. 개인 계정에서 `gemini` Google 로그인이 막히면 Antigravity CLI로 전환하거나 API key 인증을 사용해야 합니다.
- 앱 안의 Gemini `Google OAuth 로그인` 버튼을 사용하려면 실행 환경에 `GEMINI_OAUTH_CLIENT_ID`, `GEMINI_OAUTH_CLIENT_SECRET`가 필요합니다. 일반 배포판에서는 Google의 Gemini CLI/Antigravity 전환 정책 때문에 기존 CLI 세션 또는 API key 기반 흐름을 우선 확인해야 합니다.

## 플랫폼별 구조

공통 사용량 계산, API 파싱, UI는 `src/shared`, `src/main`, `src/renderer`에 두고 OS별 처리는 `src/main/platform` 아래 어댑터로 분리합니다.

- macOS: `src/main/platform/mac.ts`
- Windows: `src/main/platform/windows.ts`
- Linux: `src/main/platform/linux.ts`

트레이 아이콘 표시 방식도 OS마다 다릅니다.

- macOS는 `Tray.setTitle`로 아이콘 옆에 텍스트를 표시합니다(`src/main/trayTitle.ts`).
- Windows/Linux는 `Tray.setTitle`을 지원하지 않아, 제공자별 사용률을 색상 구획 + 숫자로 아이콘 비트맵에 직접 그려 넣습니다(`src/main/trayIcon.ts`, `src/main/trayIconRenderer.ts`). `nativeImage`가 SVG를 직접 디코딩하지 못해서, 숨겨진 `BrowserWindow`로 SVG를 렌더링한 뒤 캡처하는 방식을 씁니다.

## Linux 참고 사항

데스크톱 환경에 따라 트레이 아이콘 표시 여부가 다릅니다.

- **GNOME(Ubuntu 기본 등)**: GNOME 3.26부터 트레이 지원이 빠져서 "AppIndicator and KStatusNotifierItem Support" 확장을 설치/활성화하지 않으면 트레이 아이콘 자체가 보이지 않습니다.
- **KDE Plasma, XFCE, Cinnamon, MATE 등**: 별도 설정 없이 패널의 알림 영역에 정상적으로 표시됩니다.
