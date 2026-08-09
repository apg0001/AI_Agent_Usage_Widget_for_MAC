# 동작 방식 상세

README에 담기엔 너무 자세한, "실제로 어떻게 사용량을 가져오는지"에 대한 내용을 정리합니다.

## 로컬 세션 자동 감지

- **Codex**: 먼저 `~/.codex/sessions`의 최신 rate limit 기록을 읽고, 사용할 수 있는 로컬 기록이 없을 때 `~/.codex/auth.json`의 access token으로 사용량 API를 호출합니다. `CODEX_HOME`이 설정되어 있으면 그 디렉터리를 사용합니다.
- **Claude**: Claude Code가 저장한 로컬 OAuth 세션(`~/.claude/.credentials.json`)을 우선 사용합니다. `CLAUDE_CONFIG_DIR`이 설정되어 있으면 그 디렉터리를 사용하고, macOS에서는 Keychain fallback도 사용해 Anthropic usage API를 호출합니다. 5시간/주간 창과 초기화 시간을 표시합니다.
- **Gemini**: `~/.gemini/oauth_creds.json` 로그인 상태를 감지합니다. 다만 2026년 6월 18일부터 Gemini CLI의 개인 계정 Google 로그인은 Antigravity CLI 전환 대상입니다. 기존 세션이 없으면 Antigravity CLI 전환 또는 API key 흐름이 필요합니다.

앱에서 직접 저장한 인증 정보는 앱 userData 디렉터리의 JSON 설정 파일에 저장합니다. 배포 전에는 macOS Keychain 저장 방식으로 바꾸는 것을 권장합니다.

## 기간별 사용량 표시

- Codex는 제공자 API가 주는 사용량 창 길이에 따라 `주간 한도`, `n일 한도`, `n시간 한도`처럼 표시합니다. 현재 로컬 Codex 응답은 604800초, 즉 7일 주간 창으로 확인되었습니다.
- Claude는 제공자 API가 주는 `5시간 한도`와 `주간 한도` 사용률, 초기화까지 남은 시간을 동일한 크기의 행으로 표시합니다.
- Gemini는 OAuth 로그인 상태와 오늘 자정까지 남은 시간을 표시합니다. 실제 일일 사용률은 Gemini 사용량 API가 확정되면 연결합니다.
- 네트워크나 Keychain 조회가 순간 실패하면 Codex/Claude는 마지막 정상 사용량을 유지해 로그인 상태가 깜빡이지 않게 합니다.

## 상세 화면과 로컬 이력

- 개요에는 제공자별 핵심 한도만 표시하고, 출처·신선도·예측·알림 설정은 각 카드의 `상세` 화면에서 확인합니다. 이력 그래프는 상세 화면 안에서 최근 24시간·7일·30일을 전환할 수 있습니다.
- 한도 길이를 알 수 있으면 막대 위 세로선으로 현재 기간 경과율을 표시합니다. 사용률이 이 선보다 빠르게 증가하는지 바로 비교할 수 있습니다.
- 정상이고 사용 가능한 관측값만 앱 userData의 `usage-history.json`에 저장합니다. 인증 토큰, 계정 라벨, 메시지와 로컬 파일 경로는 이력에 저장하지 않습니다.
- 같은 값은 5분마다 한 번만 기록합니다. 최근 24시간은 원본 해상도를 유지하고, 1~7일은 30분, 7~30일은 2시간 단위로 첫값·마지막값·최솟값·최댓값을 보존해 압축하며 전체 상한은 50,000개입니다. 충분한 샘플이 쌓이면 시간당 소진율, 초기화 시 예상 사용률과 예상 소진 시각을 계산합니다.
- 첫 샘플이나 수집 간격이 짧은 동안에는 숫자를 꾸며내지 않고 `사용 패턴 학습 중`으로 표시합니다.

## 새로고침과 초기화 알림

- 앱 화면 갱신 주기는 10초·30초·1분·5분 중 선택합니다. Codex와 Claude 사용량 API는 최소 60초 간격으로만 호출합니다. Claude의 `429` 응답에 `Retry-After`가 있으면 그 시간을 우선하고, 반복 실패 시 최대 15분까지 점진적으로 대기합니다.
- Claude 세션 감지 여부와 사용량 API 성공 여부를 별도로 관리하므로, 요청 제한이나 일시적인 네트워크 오류를 미로그인으로 표시하지 않습니다.
- 각 제공자와 한도 구간의 사용률이 이전 정상 관측값 `> 0%`에서 실제 `0%`로 바뀌면 운영체제 알림을 한 번 표시합니다. 첫 관측부터 0%인 경우, 미로그인·API 오류·오래된 캐시 값은 알림에서 제외합니다.
- 제공자별로 75%·90%·100% 경고, 초기화 알림, 초기화 전 예상 소진 알림을 켜고 끌 수 있습니다. 한 번의 급상승으로 여러 임계치를 넘으면 가장 높은 단계만 알리고, 쿨다운과 자정을 지나는 방해 금지 시간도 공통 적용합니다.
- Claude Code/Claude API와 Codex의 공식 상태 페이지를 5분 간격으로 확인합니다. 장애와 복구가 확인되면 알림을 표시하고, Gemini는 정확히 대응되는 공식 CLI 컴포넌트가 없어 `상태 확인 불가`로 둡니다.
- 설정의 `진단 정보 복사`는 앱 버전, 플랫폼, 사용률, 출처와 갱신 상태만 복사합니다. 토큰, 계정 라벨, 홈 경로와 계정 추적값은 제외합니다.

## 로그인 상세

- Codex는 CLI 세션이 있으면 자동으로 연결됩니다. 필요하면 카드의 토큰 입력칸에 토큰을 넣고 `로그인`을 누릅니다.
- Claude는 Claude Code를 연 뒤 `/login`을 실행하면 앱이 해당 세션을 자동으로 확인합니다.
- Claude Code의 로그인은 매번 다시 할 필요가 없습니다. Quota Bar는 저장된 로그인과 refresh credential이 남아 있으면 이를 연결된 세션으로 표시하고, Claude Code가 회전형 OAuth 토큰을 갱신해 파일이나 Keychain에 저장하면 다음 화면 갱신에서 즉시 반영합니다. 여러 Claude Code 프로세스의 토큰 갱신을 방해하지 않도록 Quota Bar 자체는 refresh token을 소비하지 않습니다.
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

## 컴퓨터 켤 때 자동 실행

팝업 하단의 토글로 로그인 시 자동 실행을 켜고 끌 수 있습니다.

- macOS/Windows는 Electron의 `app.setLoginItemSettings`를 그대로 사용합니다(`src/main/platform/loginItem.ts`).
- Linux는 이 API를 지원하지 않아 XDG 자동 시작 스펙에 따라 `~/.config/autostart/quota-bar.desktop` 파일을 직접 쓰고 지웁니다(`src/main/platform/linux.ts`). AppImage로 실행 중이면 `APPIMAGE` 환경 변수의 원본 경로를 사용해 마운트된 임시 경로가 아닌 실제 파일을 가리키게 합니다.
- `npm run dev`처럼 패키징되지 않은 상태(`app.isPackaged === false`)에서는 토글이 항상 꺼진 상태로만 보이고 실제로 등록되지 않습니다. electron 개발 셸 자체가 로그인 항목으로 등록되는 걸 막기 위한 의도적인 제한입니다. 실제 동작 확인은 `npm run package:*`로 만든 설치본에서 해야 합니다.

## Linux 참고 사항

데스크톱 환경에 따라 트레이 아이콘 표시 여부가 다릅니다.

- **GNOME(Ubuntu 기본 등)**: GNOME 3.26부터 트레이 지원이 빠져서 "AppIndicator and KStatusNotifierItem Support" 확장을 설치/활성화하지 않으면 트레이 아이콘 자체가 보이지 않습니다.
- **KDE Plasma, XFCE, Cinnamon, MATE 등**: 별도 설정 없이 패널의 알림 영역에 정상적으로 표시됩니다.
