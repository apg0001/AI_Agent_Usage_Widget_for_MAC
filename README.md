# Quota Bar

macOS 메뉴바, Windows 시스템 트레이, Linux 상단바에서 Codex, Claude, Gemini 사용량을 바로 확인할 수 있는 트레이 위젯입니다.

![Quota Bar 실행 화면](docs/screenshot.png)

## 주요 기능

- 트레이/메뉴바 아이콘에서 바로 사용량 확인, 클릭하면 깔끔한 제공자별 요약 표시
- `상세` 화면에서 기간 경과선, 소진 속도·예상 소진 시각, 최근 24시간·7일·30일 이력 확인
- 데이터 출처, 실제 관측 시각, 캐시·재시도 상태와 Claude/OpenAI 공식 서비스 상태 확인
- 화면 갱신 주기를 10초·30초·1분·5분 중 선택하고 Codex/Claude API는 최소 60초 간격 및 서버의 재시도 시간을 준수
- 표시할 AI 제공자를 원하는 대로 켜고 끄기
- 5시간/주간 등 기간별 사용량과 초기화까지 남은 시간 표시
- 제공자별 75%·90%·100%, 예상 소진, 실제 0% 초기화 알림과 쿨다운·방해 금지 설정
- 인증정보와 분리된 30일 로컬 사용 이력, 개인정보를 제외한 진단 정보 복사
- 제공자별 로그인/로그아웃
- 컴퓨터 켤 때 자동 실행 옵션(설치된 앱에서만 지원, `npm run dev` 개발 실행에서는 동작하지 않음)

## 로그인

1. 표시하고 싶은 모델 토글을 켭니다.
2. Codex, Claude는 각 CLI에서 로그인해두면(`codex login`, Claude Code 안에서 `/login`) 앱이 자동으로 세션을 찾아 연결합니다. Codex는 필요하면 카드에 직접 토큰을 넣을 수도 있습니다.
3. Gemini는 `gemini` CLI 로그인 세션을 자동 감지합니다.
4. 이미 연결된 항목은 같은 자리에 `로그아웃` 버튼이 나타납니다.

로그인 상태는 각 CLI가 저장한 세션을 다시 감지하므로 앱을 다시 실행해도 유지됩니다. 앱에 직접 입력한 설정도 보존됩니다. 더 자세한 동작 방식(로컬 세션 감지 경로, 기간별 사용량 계산 등)은 [FEATURES.md](FEATURES.md)를 참고하세요.

## 설치 및 실행

아직 별도로 배포되는 설치 파일은 없어서, 저장소를 받아 직접 실행하거나 빌드해야 합니다.

```bash
git clone https://github.com/apg0001/AI_Agent_Usage_Widget_for_MAC.git
cd AI_Agent_Usage_Widget_for_MAC
npm install
npm run dev
```

## 배포 파일 만들기

내 운영체제에 맞는 명령을 실행하면 됩니다. macOS 산출물은 macOS에서, Windows/Linux 산출물은 각 OS에서 직접 빌드하는 것을 권장합니다(코드서명, NSIS, AppImage 등 플랫폼 전용 도구 때문).

| OS | 명령 | 결과물 위치 |
| --- | --- | --- |
| macOS | `npm run package:mac` | `dist/Quota Bar-*.dmg`, `dist/Quota Bar-*-mac.zip` |
| Windows | `npm run package:win` | `dist/Quota Bar Setup *.exe`(설치형), `dist/Quota Bar *.exe`(portable) |
| Linux | `npm run package:linux` | `dist/*.AppImage`, `dist/*.deb` |

빌드 전에 저장소를 정리된 상태로 검증하고 싶다면 `npm run verify`를 실행하세요(타입 체크, 린트, 테스트, 빌드를 순서대로 실행합니다). 더 자세한 절차와 문제 해결은 [HARNESS.md](HARNESS.md)를 참고하세요.

## 더 읽어보기

- [FEATURES.md](FEATURES.md) — 로그인/사용량 감지가 내부적으로 어떻게 동작하는지
- [HARNESS.md](HARNESS.md) — 플랫폼별 검증·패키징 절차, 문제 해결
- [CONTRIBUTING.md](CONTRIBUTING.md) — 기여 방법, 브랜치/커밋 규칙, 향후 계획
