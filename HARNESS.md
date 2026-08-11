# GigaCharge Harness

이 문서는 GigaCharge를 macOS, Windows, Linux에서 같은 저장소로 검증하고 패키징하며, 태그 기반 GitHub Actions로 안전하게 릴리스하기 위한 하네스입니다.

## 전제

- Node.js 20 이상을 권장합니다.
- 저장소 기준 브랜치는 `develop`입니다.
- 배포 파일은 `dist` 아래에 생성됩니다.
- `npm run package`는 현재 OS를 자동으로 선택해 로컬 배포 파일을 만듭니다.
- 정식 릴리스는 로컬에서 OS별 파일을 직접 게시하지 않고, 버전 태그가 시작한 GitHub Actions에서 macOS, Windows, Linux 파일을 각각 빌드합니다.
- 기존 설치본 자동 업데이트를 유지하기 위해 내부 패키지명 `quota-bar`와 앱 식별자 `com.apg0001.aiusagewidget`는 바꾸지 않습니다. 사용자에게 보이는 제품명만 `GigaCharge`로 표시합니다.

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
git pull --ff-only
npm install
```

## 작업 단위 마감 규칙

수정·추가 작업은 기능, 버그 수정, 문서 변경처럼 되돌리거나 리뷰하기 쉬운 논리 단위로 나눕니다. 관련 테스트를 통과시킨 뒤 변경을 먼저 커밋합니다.

앱 코드, 런타임·빌드 설정, 의존성 또는 패키징 동작이 바뀌었다면 사용자가 명시적으로 배포를 제외하지 않는 한 릴리스까지가 작업 완료 범위입니다.

```bash
git status --short
npm test
git add <changed-files>
git commit -m "[feat] 작업 내용 요약"
git status --short
npm run release:auto -- <patch|minor|major>
```

- `release:auto`는 깨끗한 `develop`에서만 실행하며, `preversion` 단계에서 전체 `npm run verify`를 다시 실행합니다.
- 구현 커밋을 별도로 먼저 푸시할 필요는 없습니다. `postversion`이 구현 커밋, 버전 커밋, 새 태그를 함께 atomic push합니다.
- 문서만 바꾸거나 테스트만 보강한 작업은 기본적으로 앱 버전을 올리거나 릴리스하지 않습니다. 이 경우 필요한 검증을 통과한 뒤 일반 커밋·푸시 흐름을 사용합니다.
- 커밋 메시지는 [CONTRIBUTING.md](CONTRIBUTING.md)의 `[feat]`, `[fix]`, `[docs]` 형식을 따릅니다.
- 한 커밋에는 하나의 작업 단위만 담고, 관련 없는 변경이나 이전 빌드 산출물은 함께 커밋하지 않습니다.
- 검증에 실패한 상태에서는 버전 태그를 만들거나 릴리스하지 않습니다.

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

## 현재 OS 패키징

현재 작업 중인 OS의 설치 파일을 만들고 직접 확인하려면 공통 dispatcher를 사용합니다.

```bash
npm run package
```

dispatcher는 실행 플랫폼에 따라 다음 스크립트를 선택합니다.

| 실행 플랫폼 | 선택되는 스크립트 |
| --- | --- |
| macOS | `npm run package:mac` |
| Windows | `npm run package:win` |
| Linux | `npm run package:linux` |

`npm run package`와 개별 `package:*` 스크립트는 로컬 `dist` 산출물만 만들며 GitHub Release를 생성하지 않습니다. 다른 OS의 명령을 현재 OS에서 교차 실행하기보다 해당 OS 또는 GitHub Actions에서 빌드합니다.

## macOS 실행 및 패키징

개발 실행:

```bash
npm run dev
```

앱 디렉터리 빌드:

```bash
npm run build
open "dist/mac-arm64/GigaCharge.app"
```

배포 파일 생성:

```bash
npm run package
# macOS 타깃을 명시해야 할 때만: npm run package:mac
```

성공 산출물:

- `dist/GigaCharge-<version>-<arch>.dmg`
- `dist/GigaCharge-<version>-<arch>-mac.zip`
- `dist/latest-mac.yml`
- `dist/mac-<arch>/GigaCharge.app`

Apple Developer 인증서로 서명하고 공증하기 전까지 macOS 자동 업데이트는 활성화하지 않습니다. 서명되지 않은 산출물은 다운로드·수동 설치 검증 용도로만 취급합니다.

## Windows 실행 및 패키징

Windows PowerShell에서:

```powershell
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
npm run verify
npm run package
```

성공 산출물:

- `dist/GigaCharge Setup <version>.exe`
- `dist/GigaCharge <version>.exe` portable 파일
- `dist/GigaCharge Setup <version>.exe.blockmap`
- `dist/latest.yml`

주의:

- Windows Credential Manager fallback은 후속 작업 대상입니다.
- 현재 Windows에서는 Claude Code가 파일로 저장한 로컬 OAuth 세션을 우선 확인합니다.

## Linux 실행 및 패키징

Linux 터미널에서:

```bash
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
git switch develop
npm install
npm run verify
npm run package
```

성공 산출물:

- `dist/*<version>*.AppImage`
- `dist/*<version>*.deb`
- `dist/latest-linux.yml`

주의:

- Linux Secret Service fallback은 후속 작업 대상입니다.
- AppImage/deb 빌드 도구 체인은 배포판 환경에 따라 추가 패키지가 필요할 수 있습니다.

## 릴리스와 자동 업데이트

GigaCharge의 정식 릴리스는 `v<version>` 태그가 시작하는 GitHub Actions에서 만듭니다. 워크플로는 macOS, Windows, Linux를 각 운영체제 runner에서 패키징하고, 하나의 draft 릴리스에 자산을 모아 검증한 뒤 공개합니다.

Windows와 Linux의 패키징된 앱은 `electron-updater`로 공개된 GitHub Releases를 확인합니다. 개발 모드인 `npm run dev`에서는 업데이트를 확인하지 않습니다.

### 최초 1회 설정

1. 로컬 Git 자격 증명이 `origin`의 `develop` 브랜치와 버전 태그를 푸시할 수 있어야 합니다.
2. GitHub Actions 릴리스 워크플로에는 Release 자산을 만들고 수정할 수 있는 `contents: write` 권한이 필요합니다.
3. 코드 서명·공증을 사용하는 플랫폼의 인증서와 비밀번호는 GitHub Actions Secrets로만 전달합니다. 토큰이나 비밀값을 명령행, 로그, 문서에 출력하지 않습니다.
4. `release:auto`의 preflight가 저장소 push 권한과 기존 릴리스 충돌을 확인할 수 있도록 `GH_TOKEN` 또는 `GITHUB_TOKEN`이 필요합니다. 환경 변수로 설정하거나 `.gitignore`된 `electron-builder.env`에 저장하며, 값을 커밋하거나 출력하지 않습니다. 정상 릴리스 경로는 이 토큰으로 직접 게시하는 `release:*`가 아니라 `release:auto`입니다.

### SemVer 단계 선택

사용자가 버전을 지정하지 않았다면 변경 내용에 따라 한 단계를 선택합니다.

| 단계 | 사용 기준 |
| --- | --- |
| `patch` | 하위 호환되는 버그 수정, 안정성·성능 개선, 내부 리팩터링 |
| `minor` | 하위 호환되는 새 기능 또는 사용자에게 보이는 기능 확장 |
| `major` | 설정, 저장 데이터, 설치·업데이트 호환성을 깨는 변경 |

문서만 바꾸거나 테스트만 보강한 작업은 기본적으로 앱 릴리스 대상이 아닙니다. 사용자가 배포를 명시했거나 패키징 결과에 영향을 주는 변경이 함께 있을 때만 버전을 올립니다.

### 자동 버전·릴리스 실행

기능 변경을 논리 단위로 커밋한 뒤, 깨끗한 `develop`에서 다음 명령 하나를 실행합니다.

```bash
git status --short --branch
npm run release:auto -- patch
```

예를 들어 현재 버전이 `0.4.0`이고 호환되는 버그 수정이라면 이 명령이 `0.4.1`을 만듭니다. 새 기능은 `minor`, 호환성을 깨는 변경은 `major`를 전달합니다.

`release:auto`의 단계는 다음과 같습니다.

1. `release:auto`가 `patch`, `minor`, `major` 중 선택한 단계를 npm version lifecycle에 전달합니다.
2. `preversion`이 현재 브랜치가 `develop`인지, 작업 트리가 깨끗한지, 원격과 안전하게 fast-forward 관계인지, 다음 버전의 태그·릴리스가 아직 없는지를 확인하고 `npm run verify`를 실행합니다. 하나라도 실패하면 버전 커밋이나 태그를 만들지 않습니다.
3. npm이 `package.json`과 `package-lock.json`의 버전을 함께 올리고 버전 커밋과 `v<version>` 태그를 만듭니다.
4. `postversion`이 `develop`과 `v<version>`을 원격에 atomic push합니다. 둘 중 하나만 원격에 반영되는 상태를 허용하지 않습니다.
5. 태그 push가 GitHub Actions의 3개 OS 패키징과 draft 릴리스 검증·공개를 시작합니다.

정상 릴리스에서는 `npm version`을 직접 실행하거나 `release:mac`, `release:win`, `release:linux`를 수동 실행하지 않습니다. 특히 `npm version --no-git-tag-version`으로 lifecycle 일부를 우회하지 않습니다.

### GitHub Actions 성공 기준

각 OS 작업은 같은 버전의 자산을 검증해 Actions artifact로 전달합니다. 세 작업이 모두 성공한 뒤 최종 작업 하나가 draft 릴리스를 만들고 아래 자산만 업로드합니다.

| OS | 필수 자산 |
| --- | --- |
| macOS | `GigaCharge-<version>-*.dmg`, `GigaCharge-<version>-*-mac.zip`, `latest-mac.yml` |
| Windows | `GigaCharge-Setup-<version>.exe`, `GigaCharge-<version>.exe`, `GigaCharge-Setup-<version>.exe.blockmap`, `latest.yml` |
| Linux | `<version>`이 포함된 AppImage와 deb, `latest-linux.yml` |

최종 작업은 태그와 모든 자산의 버전이 같은지, Windows/Linux 업데이트 메타데이터가 실제 업로드 파일을 가리키는지, 모든 OS 작업이 성공했는지 검증합니다. 이 검증이 끝나기 전에는 draft를 공개하지 않으며, 검증이 통과해야 GitHub의 `latest` 릴리스가 바뀝니다.

### 실패 복구

- preflight나 `verify`가 실패해 버전 태그가 만들어지지 않았다면 원인을 수정·커밋한 뒤 같은 `release:auto` 명령을 다시 실행합니다.
- 로컬 버전 커밋과 태그가 만들어진 뒤 atomic push만 실패했다면 새 버전을 만들지 않고 `npm run release:resume`을 실행합니다. 이 명령은 버전을 올리지 않으며 현재 `develop`과 태그의 atomic push만 재시도합니다.
- 태그 push 뒤 GitHub Actions가 실패했다면 버전을 다시 올리거나 태그를 이동하지 않습니다. GitHub에서 같은 Actions run의 실패한 작업을 재실행합니다.
- 태그가 원격에 있지만 Actions run 자체가 생성되지 않은 예외 상황에서는 `Build and publish release` 워크플로를 `Run workflow`로 실행하고 기존 `v<version>` 태그를 입력합니다. 워크플로는 그 태그의 커밋만 체크아웃해 동일 버전을 재개합니다.
- 일부 자산만 올라간 draft는 수동 공개하지 않습니다. 같은 run이 재실행되어 필수 자산 검증까지 통과하게 합니다.
- 현재 버전 태그가 HEAD에 이미 있다면 `release:auto`를 다시 실행하지 않습니다. `release:resume`은 원격 태그가 이미 있으면 릴리스 상태를 확인하고, 공개가 미완료인 경우 같은 GitHub Actions run을 재실행하라고 중단합니다.

### 자동 업데이트 동작 확인

1. 공개된 이전 버전의 Windows 또는 Linux 설치본을 설치·실행합니다.
2. 새 앱 변경을 완료하고 `npm run release:auto -- patch`로 다음 버전을 릴리스합니다.
3. GitHub Actions가 draft 검증을 마치고 릴리스를 공개한 것을 확인합니다.
4. 이전 버전 앱을 실행한 채로 기다리거나 설정 화면에서 "업데이트 확인"을 누릅니다. 새 버전을 다운로드하면 "지금 재시작하고 설치" 버튼이 나타납니다.

macOS 자산도 GitHub Release에 포함되지만, Apple Developer 인증서 서명과 공증이 완성되기 전까지 앱의 macOS 자동 업데이트 기능은 비활성화 상태를 유지합니다.

## dist 정리 기준

현재 버전의 로컬 패키지를 확인할 때 남기는 파일:

- 현재 OS의 `GigaCharge` 설치·배포 파일
- 현재 버전의 `*.blockmap`과 `latest*.yml`
- `dist/mac-<arch>/GigaCharge.app`, `dist/win-unpacked`, 또는 해당 Linux unpacked 디렉터리
- `dist/main`
- `dist/renderer`

로컬에서 정리해도 되는 파일:

- 이전 버전 또는 예전 제품명으로 생성된 설치·배포 파일
- `builder-*.yml`
- 현재 검증에 사용하지 않는 이전 버전의 `*.blockmap`과 `latest*.yml`

이 정리 기준은 로컬 `dist`에만 적용합니다. GitHub draft나 공개 Release의 자산은 임의로 삭제하지 않습니다. 패키징 포함 범위는 `package.json`의 `build.files`에서 `dist/main`, `dist/renderer`, `package.json`만 포함하도록 제한합니다. 기존 배포 파일이 새 앱 안에 다시 포장되면 설치 파일 크기가 급격히 커지므로 `tests/integration/crossPlatformBuild.test.ts`에서 이를 검증합니다.
