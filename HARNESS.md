# Quota Bar Harness

이 문서는 Quota Bar를 macOS, Windows, Linux에서 같은 저장소로 검증하고 패키징하기 위한 하네스입니다.

## 전제

- Node.js 20 이상을 권장합니다.
- 저장소 기준 브랜치는 `develop`입니다.
- 배포 파일은 `dist` 아래에 생성됩니다.
- macOS 외 플랫폼 배포 파일은 해당 OS에서 빌드하는 방식을 권장합니다.

## 공통 준비

```bash
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
```

이미 저장소를 받은 상태라면:

```bash
git switch develop
git pull
npm install
```

## 검증 하네스

전체 검증:

```bash
npm run verify
```

`npm run verify`는 아래 순서로 실행됩니다.

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

성공 기준:

- 타입 검사 통과
- ESLint 통과
- 단위 테스트 통과
- 통합 테스트 통과
- 현재 OS용 앱 디렉터리 빌드 성공

## 주요 테스트 파일

- `tests/unit/trayTitle.test.ts`: 메뉴바 약칭과 퍼센트 표시를 검증합니다.
- `tests/unit/usageProviders.test.ts`: 사용량 계산, 로그아웃 상태, 초기화 시간 포맷을 검증합니다.
- `tests/integration/crossPlatformBuild.test.ts`: `package:mac`, `package:win`, `package:linux` 스크립트와 패키징 타깃, 패키징 포함 범위를 검증합니다.
- `tests/integration/localSessionDetection.test.ts`: Codex/Claude/Gemini 로컬 세션 연결과 플랫폼 어댑터 분기를 검증합니다.
- `tests/integration/packagedRendererPath.test.ts`: 패키지 앱에서 렌더러 경로를 올바르게 찾는지 검증합니다.
- `tests/integration/providerFlow.test.ts`: 표시 모델 선택, 로그인, 로그아웃 흐름을 검증합니다.

## macOS 실행 및 패키징

개발 실행:

```bash
npm run dev
```

앱 디렉터리 빌드:

```bash
npm run build
open "dist/mac-arm64/Quota Bar.app"
```

배포 파일 생성:

```bash
npm run package:mac
```

성공 산출물:

- `dist/Quota Bar-0.1.0-arm64.dmg`
- `dist/Quota Bar-0.1.0-arm64-mac.zip`
- `dist/mac-arm64/Quota Bar.app`

## Windows 이전 빌드

Windows PowerShell에서:

```powershell
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
npm run verify
npm run package:win
```

성공 산출물:

- `dist/Quota Bar Setup ... .exe`
- `dist/Quota Bar ... .exe` portable 파일

주의:

- Windows Credential Manager fallback은 후속 작업 대상입니다.
- 현재 Windows에서는 Claude Code가 파일로 저장한 로컬 OAuth 세션을 우선 확인합니다.

## Linux 이전 빌드

Linux 터미널에서:

```bash
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
npm run verify
npm run package:linux
```

성공 산출물:

- `dist/*.AppImage`
- `dist/*.deb`

주의:

- Linux Secret Service fallback은 후속 작업 대상입니다.
- AppImage/deb 빌드 도구 체인은 배포판 환경에 따라 추가 패키지가 필요할 수 있습니다.

## dist 정리 기준

최신 macOS 배포용으로 남기는 파일:

- `dist/Quota Bar-0.1.0-arm64.dmg`
- `dist/Quota Bar-0.1.0-arm64-mac.zip`
- `dist/mac-arm64/Quota Bar.app`
- `dist/main`
- `dist/renderer`

정리해도 되는 파일:

- 예전 앱 이름으로 생성된 `AI Usage Widget...` 파일
- `*.blockmap`
- `builder-*.yml`
- `latest-*.yml`

패키징 포함 범위는 `package.json`의 `build.files`에서 `dist/main`, `dist/renderer`, `package.json`만 포함하도록 제한합니다. 기존 배포 파일이 새 앱 안에 다시 포장되면 설치파일 크기가 급격히 커지므로 `tests/integration/crossPlatformBuild.test.ts`에서 이를 검증합니다.
