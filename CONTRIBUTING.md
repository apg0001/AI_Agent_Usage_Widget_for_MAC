# 기여 가이드

## 작업 규칙

- 이슈는 브랜치 생성 전에 한국어로 작성합니다.
- 브랜치명은 작업 종류와 이슈 번호를 포함합니다.
  - 예시: `feat/#1-menu-bar-usage-widget`, `fix/#2-refresh-error`
- 커밋 메시지는 한국어로 작성하고 `[feat] ~~~`, `[docs] ~~~`, `[fix] ~~~` 형식을 사용합니다.
- 작업 완료 후 PR을 생성하고 코드리뷰 내용을 한국어로 작성합니다.
- 병합 대상은 `develop` 브랜치입니다.
- PR 승인 자동화는 저장소 권한과 GitHub 정책에 따라 별도 승인 계정 또는 GitHub App 설정이 필요합니다.

작업 전에 개발 환경을 준비하고 검증하는 방법은 [HARNESS.md](HARNESS.md)를 참고하세요.

## 추가로 필요한 기능 후보

- Gemini 실제 사용량 API 연결
- Windows Credential Manager 및 Linux Secret Service fallback
- macOS Keychain 기반 앱 저장 토큰
- 사용량 임계치 알림
- 일/주/월 사용량 추세 및 CLI 로그 기반 토큰/비용 집계
- 네트워크 실패 시 재시도 및 마지막 성공값 표시
