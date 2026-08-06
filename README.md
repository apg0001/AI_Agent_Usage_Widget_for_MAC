# AI Agent Usage Widget for macOS

macOS 상단 메뉴바에서 Codex, Claude, Gemini 사용량을 빠르게 확인하는 Electron 기반 위젯입니다.

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
- Claude: Claude Code가 저장한 로컬 OAuth 세션 또는 macOS Keychain을 사용해 Anthropic usage API를 호출합니다. 5시간/주간 창과 초기화 시간을 표시합니다.
- Gemini: `~/.gemini/oauth_creds.json` 로그인 상태를 감지하거나 앱에서 Google OAuth로 로그인합니다. 실제 Gemini 사용량 API 연결은 추가 확인이 필요합니다.

기간별 사용량:

- Codex/Claude는 제공자 API가 주는 `5시간 한도`와 `주간 한도` 사용률, 초기화까지 남은 시간을 동일한 크기의 행으로 표시합니다.
- Gemini는 OAuth 로그인 상태와 오늘 자정까지 남은 시간을 표시합니다. 실제 일일 사용률은 Gemini 사용량 API가 확정되면 연결합니다.
- 데모 fallback은 `5시간`, `오늘`, `주간` 추정값을 표시해 UI 검증이 가능하게 합니다.

## 로그인

앱에서 로그인하는 방법:

1. 표시할 모델 토글을 켭니다.
2. Codex는 CLI 세션이 있으면 자동으로 연결됩니다. 필요하면 해당 카드의 토큰 입력칸에 토큰을 넣고 `로그인`을 누릅니다.
3. Claude는 터미널에서 `claude /login`을 실행하면 앱이 Claude Code 세션을 자동으로 확인합니다.
4. Gemini는 해당 카드의 `Google OAuth 로그인`을 눌러 브라우저에서 로그인합니다.
5. 앱에 저장된 인증으로 로그인된 경우 같은 위치가 `로그아웃`으로 바뀝니다.

앱에 저장된 로그인 상태는 userData 설정 파일에 저장되어 앱을 다시 실행해도 유지됩니다.

Gemini OAuth를 사용하려면 실행 환경에 `GEMINI_OAUTH_CLIENT_ID`, `GEMINI_OAUTH_CLIENT_SECRET`가 필요합니다. 이 값이 없으면 앱이 설정 필요 메시지를 보여줍니다.

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

- Gemini 실제 사용량 API 연결
- macOS Keychain 기반 토큰 저장
- 사용량 임계치 알림
- 일/주/月 사용량 추세 및 CLI 로그 기반 토큰/비용 집계
- 자동 시작 로그인 항목 등록
- 네트워크 실패 시 재시도 및 마지막 성공값 표시
