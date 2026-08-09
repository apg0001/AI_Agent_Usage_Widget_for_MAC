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

## 릴리스와 자동 업데이트

Quota Bar는 `electron-updater`로 GitHub Releases를 확인해 자동 업데이트합니다. 패키징된 앱(설치본)에서만 동작하며 `npm run dev`에서는 확인하지 않습니다.

### 최초 1회 설정

1. `electron-builder.env.example`을 복사해 `electron-builder.env`를 만들고 `GH_TOKEN`에 [Personal Access Token](https://github.com/settings/tokens)을 넣습니다(이 저장소에 대한 `repo` 스코프 또는 Contents: Read/write). 이 파일은 `.gitignore`에 포함되어 있어 커밋되지 않습니다.
2. `electron-builder` CLI는 프로젝트 루트의 `electron-builder.env`를 자동으로 읽으므로(일반적인 `.env`가 아닙니다) 셸에 따로 환경변수를 export할 필요가 없습니다.

### 버전 올리고 배포하기

버전 번호는 자동으로 올라가지 않습니다 — 아래 명령을 릴리스할 때마다 직접 실행해야 합니다(문서에 적어두는 것만으로는 실행되지 않습니다).

```bash
npm version patch   # 0.2.1 -> 0.2.2 (package.json 수정 + git 커밋 + git 태그까지 자동 생성)
npm run release:win # 컴파일 + 빌드 + GitHub Release 생성/업로드까지 한 번에
```

- `npm version`은 `patch`/`minor`/`major`를 지원하고, 기본적으로 git 커밋과 태그를 함께 만듭니다. 커밋/태그 없이 `package.json` 숫자만 올리고 싶으면 `npm version patch --no-git-tag-version`을 씁니다.
- `release:win`(`release:mac`, `release:linux`)은 `electron-builder --publish always`를 실행해 빌드와 동시에 GitHub Release에 설치 파일과 `latest*.yml`을 업로드합니다.
- `publish.releaseType`이 `"release"`로 설정돼 있어 릴리스가 즉시 공개되고, 실행 중인 이전 버전 앱이 곧바로 인식합니다. 정식 배포 전에 검토 단계를 두고 싶다면 `package.json`의 `build.publish.releaseType`을 `"draft"`로 바꾸고, GitHub Releases 화면에서 수동으로 "Publish release"를 눌러야 배포되게 할 수 있습니다.

### 자동 업데이트 동작 확인

1. 위 절차로 현재 버전을 릴리스하고 설치본을 설치·실행합니다.
2. `npm version patch`로 버전을 올리고 다시 `release:win`을 실행합니다.
3. 앱을 실행한 채로 몇 초~몇 분 기다리거나 설정 화면에서 "업데이트 확인"을 누르면 새 버전을 감지해 다운로드하고, 완료되면 "지금 재시작하고 설치" 버튼이 나타납니다.

macOS는 서명되지 않은 앱은 Squirrel.Mac이 업데이트 설치를 거부하므로, Apple Developer 인증서로 서명하기 전까지는 macOS 자동 업데이트가 동작하지 않습니다.

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
