# Quota Bar

macOS 메뉴바, Windows 시스템 트레이, Linux 상단바에서 Codex, Claude, Gemini 사용량을 바로 확인할 수 있는 트레이 위젯입니다.

![Quota Bar 실행 화면](docs/screenshot.png)

## 주요 기능

- 트레이/메뉴바 아이콘에서 바로 사용량 확인, 클릭하면 상세 팝업 표시
- Codex, Claude, Gemini 사용량 10초 간격 자동 갱신
- 표시할 AI 제공자를 원하는 대로 켜고 끄기
- 5시간/주간 등 기간별 사용량과 초기화까지 남은 시간 표시
- 제공자별 로그인/로그아웃

## 로그인

1. 표시하고 싶은 모델 토글을 켭니다.
2. Codex, Claude는 터미널에서 각 CLI로 로그인해두면(`codex login`, `claude /login`) 앱이 자동으로 세션을 찾아 연결합니다. 필요하면 카드에 직접 토큰을 넣어 로그인할 수도 있습니다.
3. Gemini는 `gemini` CLI 로그인 세션을 자동 감지합니다.
4. 이미 연결된 항목은 같은 자리에 `로그아웃` 버튼이 나타납니다.

로그인 상태는 앱 설정 파일에 저장되어 다시 실행해도 유지됩니다. 더 자세한 동작 방식(로컬 세션 감지 경로, 기간별 사용량 계산 등)은 [FEATURES.md](FEATURES.md)를 참고하세요.

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
