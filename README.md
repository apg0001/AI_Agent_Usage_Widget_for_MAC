# AI Agent Usage Widget for macOS

macOS 상단 메뉴바에서 Codex, Claude, Gemini 사용량을 빠르게 확인하는 Electron 기반 위젯입니다.

## 주요 기능

- 메뉴바 트레이에서 사용량 팝오버 열기
- Codex, Claude, Gemini 사용량 10초 간격 자동 갱신
- 표시할 AI 제공자 선택
- 제공자별 로그인/로그아웃
- Gemini 브라우저 OAuth 로그인 골격
- 메뉴바 제목에 평균 사용률 표시
- 수동 새로고침 및 앱 종료

현재 사용량 값은 데모 adapter에서 생성합니다. 실제 서비스 API가 확정되면 `src/main/usageProviders.ts`의 provider adapter를 교체하면 됩니다.
현재 로그인 값은 앱 userData 디렉터리의 JSON 설정 파일에 저장합니다. 배포 전에는 macOS Keychain 또는 OAuth 세션 저장 방식으로 바꾸는 것을 권장합니다.

## 브라우저 로그인

Gemini는 Google OAuth 데스크톱 앱 흐름을 사용할 수 있도록 main 프로세스에 callback 서버와 토큰 교환 흐름을 추가했습니다.

```bash
GEMINI_OAUTH_CLIENT_ID="..." \
GEMINI_OAUTH_CLIENT_SECRET="..." \
open "dist/mac-arm64/AI Usage Widget.app"
```

Codex/OpenAI와 Claude는 현재 앱에서 브라우저 OAuth를 바로 완료하지 않고 지원 예정 메시지를 표시합니다. 각 제공자의 공식 개인 사용량 조회 API와 OAuth 정책이 확정되면 `src/main/oauthProviders.ts`와 `src/main/usageProviders.ts`의 adapter를 연결합니다.

## 실행

```bash
npm install
npm run dev
```

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

- 실제 Codex, Claude, Gemini 사용량 API 연결
- macOS Keychain 기반 OAuth 세션 저장
- 제공자별 공식 사용량 OAuth API 연결
- 사용량 임계치 알림
- 일/주/月 사용량 추세
- 자동 시작 로그인 항목 등록
- 네트워크 실패 시 재시도 및 마지막 성공값 표시
