# GigaCharge 저장소 작업 지침

## 기준 문서

- 개발, 검증, 패키징, 릴리스 절차는 `HARNESS.md`를 기준으로 합니다.
- 기존 설치본의 자동 업데이트 호환성을 위해 `package.json`의 내부 패키지명 `quota-bar`와 앱 식별자 `com.apg0001.aiusagewidget`는 바꾸지 않습니다. 사용자에게 표시되는 제품명은 `GigaCharge`입니다.

## 작업 마감과 자동 릴리스

- `src`의 앱 코드, 런타임·빌드 설정, 의존성, 패키징 동작을 바꾸는 작업은 사용자가 명시적으로 배포를 제외하지 않는 한 릴리스까지 완료해야 합니다.
- 문서만 바꾸거나 테스트만 보강하는 작업은 기본적으로 앱 릴리스를 만들지 않습니다. 사용자가 릴리스를 명시한 경우에는 예외입니다.
- 기능 변경은 되돌리거나 리뷰하기 쉬운 논리 단위로 먼저 커밋합니다. 릴리스 명령을 실행할 때는 `develop` 브랜치여야 하고 작업 트리가 깨끗해야 합니다. 로컬 `develop`이 `origin/develop`보다 앞선 것은 허용하지만, 뒤처졌거나 분기된 상태에서는 릴리스하지 않습니다.
- 사용자가 버전을 지정하지 않았다면 변경 성격에 따라 SemVer 단계를 선택합니다.
  - `patch`: 호환되는 버그 수정, 성능·안정성 개선, 내부 리팩터링
  - `minor`: 하위 호환되는 새 기능이나 사용자에게 보이는 기능 확장
  - `major`: 설정·데이터·업데이트 호환성을 깨는 변경
- 표준 진입점은 `npm run release:auto -- <patch|minor|major>`입니다. 개별 `release:mac`, `release:win`, `release:linux` 스크립트를 정상 릴리스 진입점으로 사용하지 않습니다.
- `release:auto`가 실행하는 npm version lifecycle을 우회하지 않습니다.
  1. `preversion`: 릴리스 사전 조건과 전체 `verify`를 확인합니다.
  2. npm이 `package.json`과 lockfile의 버전을 올리고 버전 커밋과 `v<version>` 태그를 만듭니다.
  3. `postversion`: `develop`과 새 태그를 원격에 atomic push합니다.
  4. 태그가 GitHub Actions의 macOS, Windows, Linux 패키징을 시작합니다. 워크플로는 draft 릴리스의 필수 자산과 업데이트 메타데이터를 검증한 뒤에만 공개합니다.
- 완료는 로컬 검증 성공만을 뜻하지 않습니다. 버전 커밋과 태그가 원격에 있고, 3개 OS 작업이 성공했으며, draft 검증을 통과한 GitHub Release가 공개된 것까지 확인해야 합니다.

## 실패 복구와 보안

- `preversion` 또는 버전 커밋·태그 생성 전에 실패했다면 원인을 고친 뒤 같은 SemVer 단계로 다시 시작할 수 있습니다.
- 버전 태그가 이미 만들어졌다면 다시 버전을 올리지 않습니다. atomic push가 실패한 경우 같은 버전 커밋과 태그를 그대로 푸시하고, GitHub Actions가 실패한 경우 같은 Actions run의 실패한 작업을 재실행합니다.
- 필수 자산 검증을 통과하지 않은 draft 릴리스를 수동으로 공개하지 않습니다. 기존 태그를 이동하거나 삭제해서 재릴리스하지 않습니다.
- 토큰, 인증서, 서명 비밀번호와 `electron-builder.env`의 내용을 출력하거나 커밋하지 않습니다. 로그와 최종 보고에도 비밀값을 포함하지 않습니다.
- `npm run package`는 현재 OS를 자동 선택하는 로컬 패키징 명령이며 GitHub Release를 만들지 않습니다. 정상 공개 릴리스에는 항상 `release:auto`와 태그 기반 GitHub Actions를 사용합니다.
