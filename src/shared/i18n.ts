import { LanguageSetting } from "./types.js";

export type Language = LanguageSetting;

export type Translations = {
  common: {
    quotaBarName: string;
    tagline: string;
  };
  status: Record<"ok" | "warning" | "critical" | "signed-out" | "error", string>;
  serviceStatus: Record<"operational" | "degraded" | "outage" | "unknown", string>;
  sourceFallback: Record<"demo" | "local" | "api" | "token", string>;
  sourceMode: Record<"local" | "poll" | "cache" | "estimate", string>;
  historyRange: Record<"24h" | "7d" | "30d", string>;
  loginHelp: Record<"codex" | "claude" | "gemini", string>;
  format: {
    dateLocale: string;
    resetUntil: (remaining: string) => string;
    noResetTime: string;
    refreshIntervalLabel: (ms?: number) => string;
    durationShort: (totalSeconds: number) => string;
    lastUpdated: (time: string) => string;
  };
  overview: {
    refreshAria: string;
    settingsAria: string;
    quitAria: string;
    closeAria: string;
    usageListAria: string;
    loadErrorTitle: string;
    retry: string;
    loadingTitle: string;
    loadingBody: string;
    emptyTitle: string;
    emptyBody: string;
    openSettings: string;
  };
  provider: {
    fallbackWindowLabel: string;
    detailAria: (label: string) => string;
    detail: string;
    windowUsageAria: (usageLabel: string, windowLabel: string) => string;
    windowUsageValueText: (percent: number, elapsedPercent?: number) => string;
    windowUnavailable: string;
    periodElapsed: (percent: number) => string;
    statusAriaPrefix: (label: string) => string;
  };
  auth: {
    tokenPlaceholder: string;
    tokenAria: (provider: string) => string;
    connect: string;
    connectionEyebrow: string;
    savedAccount: string;
    loginRequired: string;
    logout: string;
    googleOAuth: string;
  };
  analysisHelp: {
    triggerAria: string;
    triggerTitle: string;
    closeAria: string;
    title: string;
    bodyAria: string;
    intro: string;
    steps: { title: string; body: string }[];
    caveat: string;
  };
  history: {
    loadingTitle: string;
    loadingBody: string;
    learningTitle: string;
    learningBody: string;
    chartAria: (usageLabel: string, rangeLabel: string, observedRangeLabel: string, min: number, max: number) => string;
    observedRange: (from: string, to: string) => string;
    summary: (min: number, max: number, count: number) => string;
    rangeAria: string;
  };
  pace: {
    learningTitle: string;
    learningBodyWithSamples: (count: number) => string;
    learningBodyNoSamples: string;
    exhaustedAt: (dateTime: string) => string;
    calculating: string;
    projectedAtReset: (percent: number) => string;
    sampleBased: (count: number) => string;
    rateAndSampleBased: (rate: string, count: number) => string;
  };
  alerts: {
    heading: string;
    on: string;
    off: string;
    globalDisabledNote: string;
    providerToggleLabel: (label: string) => string;
    providerToggleHint: string;
    thresholdLegend: string;
    resetNotify: string;
    projectedNotify: string;
  };
  dataStatus: {
    heading: string;
    cached: string;
    unknownSource: string;
    source: string;
    observed: string;
    received: string;
    nextRetry: string;
    providerService: string;
    statusPage: string;
  };
  detail: {
    backAria: string;
    refreshAria: (label: string) => string;
    currentUsageEyebrow: string;
    limitsHeading: string;
    asOf: (time: string) => string;
    paceEyebrow: string;
    paceHeading: string;
    historyEyebrow: string;
    historyHeading: string;
  };
  settings: {
    title: string;
    backAria: string;
    providersEyebrow: string;
    providersHeading: string;
    providerVisibleHint: string;
    providerVisibleAria: (label: string) => string;
    displayEyebrow: string;
    displayHeading: string;
    trayDisplayLabel: string;
    trayDisplayAria: string;
    trayIcons: string;
    trayIconsPercent: string;
    refreshLabel: string;
    refreshAria: string;
    launchAtLoginTitle: string;
    launchAtLoginHint: string;
    appearanceEyebrow: string;
    appearanceHeading: string;
    themeLabel: string;
    themeAria: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    languageLabel: string;
    languageAria: string;
    languageKorean: string;
    languageEnglish: string;
    notificationsEyebrow: string;
    notificationsHeading: string;
    cooldownTitle: string;
    cooldownHint: string;
    cooldownAria: string;
    cooldownCustomOption: (minutes: number) => string;
    cooldownOption: (minutes: number) => string;
    quietHoursTitle: string;
    quietHoursHint: string;
    quietHoursRangeAria: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    supportEyebrow: string;
    diagnosticsHeading: string;
    diagnosticsHint: string;
    diagnosticsCopy: string;
  };
  colors: {
    eyebrow: string;
    heading: string;
    hint: string;
    bandColorAria: (upTo: number) => string;
    bandUpToLabel: string;
    bandUpToAria: (index: number) => string;
    bandRemoveAria: (index: number) => string;
    finalBandLabel: string;
    add: string;
    reset: string;
    maxBandsNote: (max: number) => string;
  };
  usage: {
    resettingNow: string;
    daysHoursMinutes: (days: number, hours: number, minutes: number) => string;
    hoursMinutes: (hours: number, minutes: number) => string;
    minutesOnly: (minutes: number) => string;
    limitFallback: string;
    weeklyLimit: string;
    dayLimit: (n: number) => string;
    hourLimit: (n: number) => string;
    minuteLimit: (n: number) => string;
    notProvided: string;
    claudeLoginHint: string;
    signInRequired: string;
    today: string;
    tokenEstimate: string;
    codexSessionExpired: string;
    codexRetryMessage: (remaining: string) => string;
    shortly: string;
    claudeApiNoUsageInfo: string;
    claudeWaitingRefresh: string;
    claudeSessionExpired: string;
    claudeRateLimited: (seconds: number) => string;
    claudeFetchFailed: (seconds: number) => string;
    geminiOAuthSessionDetected: string;
    geminiApiPending: string;
    googleOAuthConnected: string;
    lastGoodData: (label: string) => string;
    localSession: (label: string) => string;
    usageApi: (label: string) => string;
    tokenBasedEstimate: string;
    demoData: string;
    fetchFailedGeneric: string;
    codexApiError: (status: number) => string;
    claudeApiError: (status: number) => string;
    codexFetchFailedGeneric: string;
    claudeFetchFailedGeneric: string;
    claudeLoadingPlaceholder: string;
  };
  main: {
    trayOpen: string;
    trayQuit: string;
    serviceStatusUnknownLabel: string;
    serviceOperationalLabel: string;
    serviceOutageLabel: string;
    serviceDegradedLabel: string;
    serviceChangeTitle: (label: string) => string;
    serviceOutageBody: string;
    serviceDegradedBody: string;
    serviceRecoveredTitle: (label: string) => string;
    serviceRecoveredBody: string;
    unsupportedHistoryRequest: string;
    tokenLoginCodexOnly: string;
    usageResetTitle: (providerLabel: string) => string;
    usageResetBody: (windowLabel: string) => string;
    usageThresholdTitle: (providerLabel: string, windowLabel: string, threshold: number) => string;
    usageThresholdBody: (percent: number, resetRemaining?: string) => string;
    usageProjectedTitle: (providerLabel: string) => string;
    usageProjectedBody: (windowLabel: string) => string;
  };
  oauth: {
    loginCancelled: string;
    callbackStateInvalid: string;
    loginComplete: string;
    googleTokenExchangeFailed: (status: number) => string;
    geminiMissingConfig: string;
    geminiLoginSuccess: string;
    geminiLoginFailedGeneric: string;
    codexOAuthUnsupported: string;
    claudeOAuthUnsupported: string;
  };
  updates: {
    eyebrow: string;
    heading: string;
    currentVersion: (version: string) => string;
    check: string;
    restartAndInstall: string;
    devModeNote: string;
    statusChecking: string;
    statusAvailable: (version: string) => string;
    statusDownloading: (percent: number) => string;
    statusDownloaded: (version: string) => string;
    statusNotAvailable: string;
    statusError: (message: string) => string;
  };
  notices: {
    launchAtLoginCheckFailed: string;
    initialLoadFailed: string;
    historyLoadFailed: string;
    genericRequestFailed: string;
    providerConnected: (label: string) => string;
    loginFailed: string;
    authRemoved: string;
    launchAtLoginChangeFailed: string;
    diagnosticsCopied: string;
    diagnosticsCopyFailedResult: string;
    diagnosticsCopyFailed: string;
    statusPageOpenFailed: string;
  };
};

function durationShortKo(totalSeconds: number) {
  return totalSeconds < 60 ? `${totalSeconds}초` : `${totalSeconds / 60}분`;
}

function durationShortEn(totalSeconds: number) {
  return totalSeconds < 60 ? `${totalSeconds}s` : `${totalSeconds / 60}m`;
}

const ko: Translations = {
  common: {
    quotaBarName: "Quota Bar",
    tagline: "AI quota tracker"
  },
  status: {
    ok: "정상",
    warning: "주의",
    critical: "임박",
    "signed-out": "미로그인",
    error: "오류"
  },
  serviceStatus: {
    operational: "서비스 정상",
    degraded: "일부 지연",
    outage: "서비스 장애",
    unknown: "상태 확인 중"
  },
  sourceFallback: {
    demo: "예시 데이터",
    local: "로컬 세션",
    api: "제공자 사용량 API",
    token: "저장된 토큰"
  },
  sourceMode: {
    local: "로컬",
    poll: "주기 조회",
    cache: "캐시",
    estimate: "추정"
  },
  historyRange: {
    "24h": "24시간",
    "7d": "7일",
    "30d": "30일"
  },
  loginHelp: {
    codex: "Codex CLI에서 로그인하거나 아래에 토큰을 입력하세요.",
    claude: "Claude Code를 열고 /login을 실행하세요.",
    gemini: "Gemini CLI 로그인 또는 Google OAuth로 연결하세요."
  },
  format: {
    dateLocale: "ko-KR",
    resetUntil: (remaining) => `초기화까지 ${remaining}`,
    noResetTime: "초기화 시간 없음",
    refreshIntervalLabel: (ms) => {
      if (!ms) {
        return "자동 갱신";
      }
      return ms < 60_000 ? `${ms / 1_000}초마다 갱신` : `${ms / 60_000}분마다 갱신`;
    },
    durationShort: durationShortKo,
    lastUpdated: (time) => `마지막 갱신 ${time}`
  },
  overview: {
    refreshAria: "사용량 새로고침",
    settingsAria: "설정 열기",
    quitAria: "Quota Bar 종료",
    closeAria: "창 닫기",
    usageListAria: "AI 제공자 사용량",
    loadErrorTitle: "사용량을 불러오지 못했습니다",
    retry: "다시 시도",
    loadingTitle: "사용량을 불러오는 중",
    loadingBody: "연결된 AI 도구를 확인하고 있습니다.",
    emptyTitle: "표시 중인 제공자가 없습니다",
    emptyBody: "설정에서 확인할 AI 제공자를 선택하세요.",
    openSettings: "설정 열기"
  },
  provider: {
    fallbackWindowLabel: "사용량",
    detailAria: (label) => `${label} 상세 보기`,
    detail: "상세",
    windowUsageAria: (usageLabel, windowLabel) => `${usageLabel} ${windowLabel} 사용률`,
    windowUsageValueText: (percent, elapsedPercent) =>
      `${percent}% 사용${elapsedPercent === undefined ? "" : `, 현재 한도 기간 ${elapsedPercent}% 경과`}`,
    windowUnavailable: "사용량 정보 없음",
    periodElapsed: (percent) => `기간 ${percent}% 경과`,
    statusAriaPrefix: (label) => `${label} 상태: `
  },
  auth: {
    tokenPlaceholder: "액세스 토큰",
    tokenAria: (provider) => `${provider} 액세스 토큰`,
    connect: "연결",
    connectionEyebrow: "연결",
    savedAccount: "저장된 계정",
    loginRequired: "로그인이 필요합니다",
    logout: "로그아웃",
    googleOAuth: "Google OAuth로 연결"
  },
  analysisHelp: {
    triggerAria: "사용량 분석 방식 보기",
    triggerTitle: "사용량 분석 방식",
    closeAria: "분석 방식 설명 닫기",
    title: "사용량을 이렇게 분석합니다",
    bodyAria: "사용량 분석 설명",
    intro: "제공자가 보고한 사용률과 Quota Bar가 쌓은 정상 이력을 함께 해석합니다.",
    steps: [
      {
        title: "기간 경과선",
        body: "초기화 시각과 한도 길이로 현재 기간의 경과율을 계산해 막대 위 세로선으로 표시합니다."
      },
      {
        title: "정상 이력만 사용",
        body: "오류·미로그인·오래된 캐시는 빼고, 식별할 수 있는 같은 계정·한도·초기화 주기의 0~100% 기록만 비교합니다."
      },
      {
        title: "소진 추세 계산",
        body: "최소 2개 기록이 5분 이상 쌓이면 시간당 소진율을 계산합니다. 초기화 시각을 알면 그 전에 100%에 닿을 때, 모르면 현재 증가 추세로 예상 시각을 표시합니다."
      },
      {
        title: "정상 0% 변화만 감지",
        body: "정상 응답에서 이전 값이 0%보다 높았다가 0%가 된 경우에만 초기화로 감지합니다."
      }
    ],
    caveat: "예측은 최근 사용 패턴을 직선 추세로 본 참고값입니다. 모델 변경, 병렬 작업, 제공자의 집계 지연에 따라 실제 결과와 달라질 수 있습니다."
  },
  history: {
    loadingTitle: "기록 불러오는 중",
    loadingBody: "최근 기록을 확인하고 있습니다.",
    learningTitle: "사용 패턴 학습 중",
    learningBody: "사용량이 두 번 이상 수집되면 그래프가 나타납니다.",
    chartAria: (usageLabel, rangeLabel, observedRangeLabel, min, max) =>
      `${usageLabel} 최근 ${rangeLabel} 사용률${observedRangeLabel}, 최저 ${min}%, 최고 ${max}%`,
    observedRange: (from, to) => `, ${from}부터 ${to}까지`,
    summary: (min, max, count) => `최저 ${min}% · 최고 ${max}% · ${count}개 기록`,
    rangeAria: "사용 이력 기간"
  },
  pace: {
    learningTitle: "소진 속도를 학습 중입니다",
    learningBodyWithSamples: (count) => `${count}개 기록 수집됨`,
    learningBodyNoSamples: "기록이 쌓이면 초기화 시점의 예상 사용률을 알려드려요.",
    exhaustedAt: (dateTime) => `${dateTime} 소진 예상`,
    calculating: "예상치 계산 중",
    projectedAtReset: (percent) => `초기화 시점 약 ${percent}% 예상`,
    sampleBased: (count) => `${count}개 기록 기반`,
    rateAndSampleBased: (rate, count) => `시간당 ${rate}% · ${count}개 기록 기반`
  },
  alerts: {
    heading: "알림 설정",
    on: "켜짐",
    off: "꺼짐",
    globalDisabledNote: "전체 알림이 꺼져 있습니다. 설정 화면에서 먼저 켜주세요.",
    providerToggleLabel: (label) => `${label} 알림`,
    providerToggleHint: "이 제공자의 알림만 켜거나 끕니다.",
    thresholdLegend: "사용률 경고",
    resetNotify: "한도가 초기화되면 알림",
    projectedNotify: "초기화 전에 소진될 것으로 예상되면 알림"
  },
  dataStatus: {
    heading: "데이터 상태",
    cached: "캐시 표시 중",
    unknownSource: "알 수 없음",
    source: "출처",
    observed: "원본 관측",
    received: "앱 수신",
    nextRetry: "다음 재시도",
    providerService: "제공자 서비스",
    statusPage: "상태 페이지"
  },
  detail: {
    backAria: "개요로 돌아가기",
    refreshAria: (label) => `${label} 사용량 새로고침`,
    currentUsageEyebrow: "현재 사용량",
    limitsHeading: "기간별 한도",
    asOf: (time) => `${time} 기준`,
    paceEyebrow: "PACE",
    paceHeading: "소진 예상",
    historyEyebrow: "HISTORY",
    historyHeading: "사용 이력"
  },
  settings: {
    title: "설정",
    backAria: "개요로 돌아가기",
    providersEyebrow: "OVERVIEW",
    providersHeading: "표시할 제공자",
    providerVisibleHint: "개요와 트레이에 표시",
    providerVisibleAria: (label) => `${label} 표시`,
    displayEyebrow: "DISPLAY",
    displayHeading: "표시와 갱신",
    trayDisplayLabel: "트레이 표시",
    trayDisplayAria: "트레이 표시 방식",
    trayIcons: "아이콘",
    trayIconsPercent: "아이콘 + %",
    refreshLabel: "자동 갱신",
    refreshAria: "자동 갱신 간격",
    launchAtLoginTitle: "로그인할 때 자동 실행",
    launchAtLoginHint: "컴퓨터를 켜면 Quota Bar 시작",
    appearanceEyebrow: "APPEARANCE",
    appearanceHeading: "테마와 언어",
    themeLabel: "테마",
    themeAria: "테마 선택",
    themeLight: "라이트",
    themeDark: "다크",
    themeSystem: "시스템",
    languageLabel: "언어",
    languageAria: "언어 선택",
    languageKorean: "한국어",
    languageEnglish: "English",
    notificationsEyebrow: "NOTIFICATIONS",
    notificationsHeading: "전체 알림",
    cooldownTitle: "알림 쿨다운",
    cooldownHint: "같은 알림의 반복을 제한",
    cooldownAria: "알림 쿨다운",
    cooldownCustomOption: (minutes) => `${minutes}분 (사용자 지정)`,
    cooldownOption: (minutes) => `${minutes}분`,
    quietHoursTitle: "방해 금지 시간",
    quietHoursHint: "해당 시간에는 알림을 보류",
    quietHoursRangeAria: "방해 금지 시간 범위",
    quietHoursStart: "시작",
    quietHoursEnd: "종료",
    supportEyebrow: "SUPPORT",
    diagnosticsHeading: "진단 정보",
    diagnosticsHint: "토큰과 개인정보를 제외한 연결 상태를 복사합니다.",
    diagnosticsCopy: "진단 정보 복사"
  },
  colors: {
    eyebrow: "COLORS",
    heading: "사용률 색상",
    hint: "퍼센트 구간마다 원하는 색상을 지정하세요. 구간은 원하는 만큼 추가하거나 삭제할 수 있습니다.",
    bandColorAria: (upTo) => `${upTo}%까지 구간 색상`,
    bandUpToLabel: "까지",
    bandUpToAria: (index) => `${index}번째 구간 상한 퍼센트`,
    bandRemoveAria: (index) => `${index}번째 구간 삭제`,
    finalBandLabel: "100% (마지막 구간)",
    add: "구간 추가",
    reset: "기본값으로 초기화",
    maxBandsNote: (max) => `구간은 최대 ${max}개까지 추가할 수 있습니다.`
  },
  usage: {
    resettingNow: "초기화 중",
    daysHoursMinutes: (days, hours, minutes) => `${days}일 ${hours}시간 ${minutes}분`,
    hoursMinutes: (hours, minutes) => `${hours}시간 ${minutes}분`,
    minutesOnly: (minutes) => `${minutes}분`,
    limitFallback: "한도",
    weeklyLimit: "주간 한도",
    dayLimit: (n) => `${n}일 한도`,
    hourLimit: (n) => `${n}시간 한도`,
    minuteLimit: (n) => `${n}분 한도`,
    notProvided: "제공 안 됨",
    claudeLoginHint: "Claude Code를 열고 /login을 먼저 실행하세요.",
    signInRequired: "로그인이 필요합니다.",
    today: "오늘",
    tokenEstimate: "토큰 기반 추정",
    codexSessionExpired: "Codex 로그인 세션이 만료되었습니다. codex login을 다시 실행하세요.",
    codexRetryMessage: (remaining) => `Codex 세션은 연결되어 있지만 사용량을 갱신하지 못했습니다. ${remaining} 후 다시 시도합니다.`,
    shortly: "잠시",
    claudeApiNoUsageInfo: "Claude 사용량 API 응답에 사용량 정보가 없습니다.",
    claudeWaitingRefresh: "저장된 Claude Code 로그인은 확인했지만 액세스 토큰 갱신을 기다리는 중입니다. Claude Code가 갱신하면 자동으로 다시 연결됩니다.",
    claudeSessionExpired: "Claude Code 로그인 세션이 만료되었습니다. Claude Code에서 다시 로그인하세요.",
    claudeRateLimited: (seconds) => `Claude Code 세션은 연결되어 있지만 사용량 조회가 제한되었습니다. ${seconds}초 후 다시 시도합니다.`,
    claudeFetchFailed: (seconds) => `Claude Code 세션은 연결되어 있지만 사용량을 불러오지 못했습니다. ${seconds}초 후 다시 시도합니다.`,
    geminiOAuthSessionDetected: "Gemini OAuth 세션 감지",
    geminiApiPending: "Gemini 사용량 API 연결 대기",
    googleOAuthConnected: "Google OAuth 로그인",
    lastGoodData: (label) => `${label} 마지막 정상 데이터`,
    localSession: (label) => `${label} 로컬 세션`,
    usageApi: (label) => `${label} 사용량 API`,
    tokenBasedEstimate: "직접 입력 토큰 기반 추정",
    demoData: "데모 데이터",
    fetchFailedGeneric: "사용량을 불러오지 못했습니다.",
    codexApiError: (status) => `Codex 사용량 API 오류: ${status}`,
    claudeApiError: (status) => `Claude 사용량 API 오류: ${status}`,
    codexFetchFailedGeneric: "Codex 사용량을 불러오지 못했습니다.",
    claudeFetchFailedGeneric: "Claude 사용량을 불러오지 못했습니다.",
    claudeLoadingPlaceholder: "Claude 사용량을 불러오는 중입니다."
  },
  main: {
    trayOpen: "Quota Bar 열기",
    trayQuit: "종료",
    serviceStatusUnknownLabel: "상태 확인 불가",
    serviceOperationalLabel: "정상 운영",
    serviceOutageLabel: "서비스 장애",
    serviceDegradedLabel: "일부 지연",
    serviceChangeTitle: (label) => `${label} 서비스 상태 변경`,
    serviceOutageBody: "공식 상태 페이지에서 서비스 장애가 확인되었습니다.",
    serviceDegradedBody: "공식 상태 페이지에서 일부 지연이 확인되었습니다.",
    serviceRecoveredTitle: (label) => `${label} 서비스 복구`,
    serviceRecoveredBody: "공식 상태 페이지가 정상 운영으로 돌아왔습니다.",
    unsupportedHistoryRequest: "지원하지 않는 사용량 이력 요청입니다.",
    tokenLoginCodexOnly: "토큰 로그인은 Codex만 지원합니다.",
    usageResetTitle: (providerLabel) => `${providerLabel} 사용량 초기화`,
    usageResetBody: (windowLabel) => `${windowLabel} 사용률이 0%로 초기화되었습니다.`,
    usageThresholdTitle: (providerLabel, windowLabel, threshold) => `${providerLabel} ${windowLabel} ${threshold}%`,
    usageThresholdBody: (percent, resetRemaining) =>
      `현재 사용률은 ${percent}%입니다.${resetRemaining ? ` 초기화까지 ${resetRemaining} 남았습니다.` : ""}`,
    usageProjectedTitle: (providerLabel) => `${providerLabel} 한도 소진 예상`,
    usageProjectedBody: (windowLabel) => `${windowLabel} 한도가 초기화 전에 소진될 것으로 예상됩니다.`
  },
  oauth: {
    loginCancelled: "로그인이 취소되었습니다. 이 창을 닫아도 됩니다.",
    callbackStateInvalid: "OAuth callback 상태가 올바르지 않습니다.",
    loginComplete: "Quota Bar 로그인 완료. 이 창을 닫아도 됩니다.",
    googleTokenExchangeFailed: (status) => `Google OAuth 토큰 교환 실패: ${status}`,
    geminiMissingConfig: "앱 OAuth 설정이 없습니다. 터미널에서 gemini를 실행해 브라우저 로그인을 완료하세요.",
    geminiLoginSuccess: "Gemini OAuth 로그인이 완료되었습니다.",
    geminiLoginFailedGeneric: "Gemini OAuth 로그인에 실패했습니다.",
    codexOAuthUnsupported: "Codex/OpenAI 개인 사용량 조회용 OAuth API는 아직 앱 설정에 연결되지 않았습니다.",
    claudeOAuthUnsupported: "Claude 개인 사용량 조회용 공식 OAuth API 확인이 필요합니다."
  },
  updates: {
    eyebrow: "UPDATES",
    heading: "업데이트",
    currentVersion: (version) => `현재 버전 v${version}`,
    check: "업데이트 확인",
    restartAndInstall: "지금 재시작하고 설치",
    devModeNote: "개발 모드에서는 업데이트를 확인하지 않습니다.",
    statusChecking: "업데이트 확인 중...",
    statusAvailable: (version) => `새 버전 v${version} 다운로드 중`,
    statusDownloading: (percent) => `다운로드 중 ${percent}%`,
    statusDownloaded: (version) => `v${version} 설치 준비 완료`,
    statusNotAvailable: "최신 버전입니다.",
    statusError: (message) => `업데이트 확인 실패: ${message}`
  },
  notices: {
    launchAtLoginCheckFailed: "자동 실행 상태를 확인하지 못했습니다.",
    initialLoadFailed: "사용량을 불러오지 못했습니다. 다시 시도해 주세요.",
    historyLoadFailed: "사용 기록을 불러오지 못했습니다.",
    genericRequestFailed: "요청을 완료하지 못했습니다.",
    providerConnected: (label) => `${label} 연결 정보가 저장되었습니다.`,
    loginFailed: "로그인을 완료하지 못했습니다.",
    authRemoved: "저장된 연결 정보를 삭제했습니다.",
    launchAtLoginChangeFailed: "자동 실행 설정을 변경하지 못했습니다.",
    diagnosticsCopied: "진단 정보를 클립보드에 복사했습니다.",
    diagnosticsCopyFailedResult: "진단 정보를 복사하지 못했습니다.",
    diagnosticsCopyFailed: "진단 정보를 복사하지 못했습니다.",
    statusPageOpenFailed: "상태 페이지를 열지 못했습니다."
  }
};

const en: Translations = {
  common: {
    quotaBarName: "Quota Bar",
    tagline: "AI quota tracker"
  },
  status: {
    ok: "OK",
    warning: "Warning",
    critical: "Critical",
    "signed-out": "Signed out",
    error: "Error"
  },
  serviceStatus: {
    operational: "Operational",
    degraded: "Partial outage",
    outage: "Outage",
    unknown: "Checking status"
  },
  sourceFallback: {
    demo: "Sample data",
    local: "Local session",
    api: "Provider usage API",
    token: "Saved token"
  },
  sourceMode: {
    local: "Local",
    poll: "Polling",
    cache: "Cache",
    estimate: "Estimate"
  },
  historyRange: {
    "24h": "24h",
    "7d": "7d",
    "30d": "30d"
  },
  loginHelp: {
    codex: "Sign in from the Codex CLI, or enter a token below.",
    claude: "Open Claude Code and run /login.",
    gemini: "Sign in with the Gemini CLI or connect with Google OAuth."
  },
  format: {
    dateLocale: "en-US",
    resetUntil: (remaining) => `Resets in ${remaining}`,
    noResetTime: "No reset time",
    refreshIntervalLabel: (ms) => {
      if (!ms) {
        return "Auto-refresh";
      }
      return ms < 60_000 ? `Refreshes every ${ms / 1_000}s` : `Refreshes every ${ms / 60_000}m`;
    },
    durationShort: durationShortEn,
    lastUpdated: (time) => `Last updated ${time}`
  },
  overview: {
    refreshAria: "Refresh usage",
    settingsAria: "Open settings",
    quitAria: "Quit Quota Bar",
    closeAria: "Close window",
    usageListAria: "AI provider usage",
    loadErrorTitle: "Couldn't load usage",
    retry: "Retry",
    loadingTitle: "Loading usage",
    loadingBody: "Checking your connected AI tools.",
    emptyTitle: "No providers shown",
    emptyBody: "Pick which AI providers to track in settings.",
    openSettings: "Open settings"
  },
  provider: {
    fallbackWindowLabel: "Usage",
    detailAria: (label) => `View ${label} details`,
    detail: "Details",
    windowUsageAria: (usageLabel, windowLabel) => `${usageLabel} ${windowLabel} usage`,
    windowUsageValueText: (percent, elapsedPercent) =>
      `${percent}% used${elapsedPercent === undefined ? "" : `, ${elapsedPercent}% of the current period elapsed`}`,
    windowUnavailable: "No usage data",
    periodElapsed: (percent) => `${percent}% of period elapsed`,
    statusAriaPrefix: (label) => `${label} status: `
  },
  auth: {
    tokenPlaceholder: "Access token",
    tokenAria: (provider) => `${provider} access token`,
    connect: "Connect",
    connectionEyebrow: "Connection",
    savedAccount: "Saved account",
    loginRequired: "Sign-in required",
    logout: "Log out",
    googleOAuth: "Connect with Google OAuth"
  },
  analysisHelp: {
    triggerAria: "View how usage is analyzed",
    triggerTitle: "Usage analysis",
    closeAria: "Close analysis explanation",
    title: "Here's how we analyze usage",
    bodyAria: "Usage analysis explanation",
    intro: "We combine the usage percentage providers report with the healthy history Quota Bar has collected.",
    steps: [
      {
        title: "Period elapsed line",
        body: "We compute how far into the current period you are from the reset time and limit length, and show it as a vertical line on the bar."
      },
      {
        title: "Only healthy history counts",
        body: "Errors, signed-out states, and stale cache are excluded; we only compare identifiable 0-100% records with the same account, limit, and reset cycle."
      },
      {
        title: "Burn-rate calculation",
        body: "Once at least 2 records span 5+ minutes, we compute an hourly burn rate. If the reset time is known, we show when it would hit 100% before then; otherwise we project from the current trend."
      },
      {
        title: "Only healthy 0% changes detected",
        body: "A reset is only detected when a healthy response's value was above 0% and then becomes 0%."
      }
    ],
    caveat: "Projections are reference values based on a straight-line trend of recent usage. Model changes, parallel work, and provider aggregation delays can make actual results differ."
  },
  history: {
    loadingTitle: "Loading history",
    loadingBody: "Checking recent history.",
    learningTitle: "Learning your usage pattern",
    learningBody: "The chart appears once usage has been collected twice or more.",
    chartAria: (usageLabel, rangeLabel, observedRangeLabel, min, max) =>
      `${usageLabel} usage over the last ${rangeLabel}${observedRangeLabel}, low ${min}%, high ${max}%`,
    observedRange: (from, to) => `, from ${from} to ${to}`,
    summary: (min, max, count) => `Low ${min}% · High ${max}% · ${count} records`,
    rangeAria: "Usage history range"
  },
  pace: {
    learningTitle: "Learning your burn rate",
    learningBodyWithSamples: (count) => `${count} records collected`,
    learningBodyNoSamples: "Once history builds up, we'll estimate the usage rate at reset time.",
    exhaustedAt: (dateTime) => `Expected to run out ${dateTime}`,
    calculating: "Calculating estimate",
    projectedAtReset: (percent) => `~${percent}% projected at reset`,
    sampleBased: (count) => `Based on ${count} records`,
    rateAndSampleBased: (rate, count) => `${rate}%/hour · based on ${count} records`
  },
  alerts: {
    heading: "Alert settings",
    on: "On",
    off: "Off",
    globalDisabledNote: "All notifications are off. Turn them on in settings first.",
    providerToggleLabel: (label) => `${label} alerts`,
    providerToggleHint: "Turn this provider's alerts on or off.",
    thresholdLegend: "Usage warnings",
    resetNotify: "Notify when the limit resets",
    projectedNotify: "Notify if projected to run out before reset"
  },
  dataStatus: {
    heading: "Data status",
    cached: "Showing cache",
    unknownSource: "Unknown",
    source: "Source",
    observed: "Observed at source",
    received: "Received by app",
    nextRetry: "Next retry",
    providerService: "Provider service",
    statusPage: "Status page"
  },
  detail: {
    backAria: "Back to overview",
    refreshAria: (label) => `Refresh ${label} usage`,
    currentUsageEyebrow: "CURRENT USAGE",
    limitsHeading: "Limits by period",
    asOf: (time) => `as of ${time}`,
    paceEyebrow: "PACE",
    paceHeading: "Burn-rate projection",
    historyEyebrow: "HISTORY",
    historyHeading: "Usage history"
  },
  settings: {
    title: "Settings",
    backAria: "Back to overview",
    providersEyebrow: "OVERVIEW",
    providersHeading: "Providers to show",
    providerVisibleHint: "Shown in overview and tray",
    providerVisibleAria: (label) => `Show ${label}`,
    displayEyebrow: "DISPLAY",
    displayHeading: "Display & refresh",
    trayDisplayLabel: "Tray display",
    trayDisplayAria: "Tray display mode",
    trayIcons: "Icons",
    trayIconsPercent: "Icons + %",
    refreshLabel: "Auto-refresh",
    refreshAria: "Auto-refresh interval",
    launchAtLoginTitle: "Launch at login",
    launchAtLoginHint: "Start Quota Bar when you turn on your computer",
    appearanceEyebrow: "APPEARANCE",
    appearanceHeading: "Theme & language",
    themeLabel: "Theme",
    themeAria: "Choose theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    languageLabel: "Language",
    languageAria: "Choose language",
    languageKorean: "한국어",
    languageEnglish: "English",
    notificationsEyebrow: "NOTIFICATIONS",
    notificationsHeading: "All notifications",
    cooldownTitle: "Notification cooldown",
    cooldownHint: "Limit repeats of the same alert",
    cooldownAria: "Notification cooldown",
    cooldownCustomOption: (minutes) => `${minutes} min (custom)`,
    cooldownOption: (minutes) => `${minutes} min`,
    quietHoursTitle: "Quiet hours",
    quietHoursHint: "Hold notifications during this time",
    quietHoursRangeAria: "Quiet hours range",
    quietHoursStart: "Start",
    quietHoursEnd: "End",
    supportEyebrow: "SUPPORT",
    diagnosticsHeading: "Diagnostics",
    diagnosticsHint: "Copies connection status, excluding tokens and personal data.",
    diagnosticsCopy: "Copy diagnostics"
  },
  colors: {
    eyebrow: "COLORS",
    heading: "Usage colors",
    hint: "Set a color for each percent range. Add or remove as many bands as you like.",
    bandColorAria: (upTo) => `Band color up to ${upTo}%`,
    bandUpToLabel: "up to",
    bandUpToAria: (index) => `Band ${index} upper bound percent`,
    bandRemoveAria: (index) => `Remove band ${index}`,
    finalBandLabel: "100% (final band)",
    add: "Add band",
    reset: "Reset to default",
    maxBandsNote: (max) => `You can add up to ${max} bands.`
  },
  usage: {
    resettingNow: "Resetting",
    daysHoursMinutes: (days, hours, minutes) => `${days}d ${hours}h ${minutes}m`,
    hoursMinutes: (hours, minutes) => `${hours}h ${minutes}m`,
    minutesOnly: (minutes) => `${minutes}m`,
    limitFallback: "Limit",
    weeklyLimit: "Weekly limit",
    dayLimit: (n) => `${n}-day limit`,
    hourLimit: (n) => `${n}-hour limit`,
    minuteLimit: (n) => `${n}-minute limit`,
    notProvided: "Not provided",
    claudeLoginHint: "Open Claude Code and run /login first.",
    signInRequired: "Sign-in required.",
    today: "Today",
    tokenEstimate: "Token-based estimate",
    codexSessionExpired: "The Codex sign-in session has expired. Run codex login again.",
    codexRetryMessage: (remaining) => `The Codex session is connected, but usage couldn't be refreshed. Retrying in ${remaining}.`,
    shortly: "shortly",
    claudeApiNoUsageInfo: "The Claude usage API response has no usage data.",
    claudeWaitingRefresh: "Found a saved Claude Code sign-in, but it's waiting on an access token refresh. It'll reconnect automatically once Claude Code refreshes it.",
    claudeSessionExpired: "The Claude Code sign-in session has expired. Sign in again from Claude Code.",
    claudeRateLimited: (seconds) => `The Claude Code session is connected, but usage lookups are rate-limited. Retrying in ${seconds}s.`,
    claudeFetchFailed: (seconds) => `The Claude Code session is connected, but usage couldn't be loaded. Retrying in ${seconds}s.`,
    geminiOAuthSessionDetected: "Gemini OAuth session detected",
    geminiApiPending: "Waiting to connect to the Gemini usage API",
    googleOAuthConnected: "Signed in with Google OAuth",
    lastGoodData: (label) => `${label} last good data`,
    localSession: (label) => `${label} local session`,
    usageApi: (label) => `${label} usage API`,
    tokenBasedEstimate: "Estimate based on the entered token",
    demoData: "Sample data",
    fetchFailedGeneric: "Couldn't load usage.",
    codexApiError: (status) => `Codex usage API error: ${status}`,
    claudeApiError: (status) => `Claude usage API error: ${status}`,
    codexFetchFailedGeneric: "Couldn't load Codex usage.",
    claudeFetchFailedGeneric: "Couldn't load Claude usage.",
    claudeLoadingPlaceholder: "Loading Claude usage."
  },
  main: {
    trayOpen: "Open Quota Bar",
    trayQuit: "Quit",
    serviceStatusUnknownLabel: "Status unavailable",
    serviceOperationalLabel: "Operational",
    serviceOutageLabel: "Outage",
    serviceDegradedLabel: "Partial disruption",
    serviceChangeTitle: (label) => `${label} service status changed`,
    serviceOutageBody: "The official status page confirms an outage.",
    serviceDegradedBody: "The official status page confirms a partial disruption.",
    serviceRecoveredTitle: (label) => `${label} service recovered`,
    serviceRecoveredBody: "The official status page shows normal operation again.",
    unsupportedHistoryRequest: "Unsupported usage history request.",
    tokenLoginCodexOnly: "Token login is only supported for Codex.",
    usageResetTitle: (providerLabel) => `${providerLabel} usage reset`,
    usageResetBody: (windowLabel) => `${windowLabel} usage reset to 0%.`,
    usageThresholdTitle: (providerLabel, windowLabel, threshold) => `${providerLabel} ${windowLabel} ${threshold}%`,
    usageThresholdBody: (percent, resetRemaining) =>
      `Current usage is ${percent}%.${resetRemaining ? ` ${resetRemaining} left until reset.` : ""}`,
    usageProjectedTitle: (providerLabel) => `${providerLabel} limit projected to run out`,
    usageProjectedBody: (windowLabel) => `${windowLabel} is projected to run out before it resets.`
  },
  oauth: {
    loginCancelled: "Sign-in was cancelled. You can close this window.",
    callbackStateInvalid: "The OAuth callback state is invalid.",
    loginComplete: "Quota Bar sign-in complete. You can close this window.",
    googleTokenExchangeFailed: (status) => `Google OAuth token exchange failed: ${status}`,
    geminiMissingConfig: "App OAuth isn't configured. Run gemini in a terminal to finish browser sign-in.",
    geminiLoginSuccess: "Gemini OAuth sign-in complete.",
    geminiLoginFailedGeneric: "Gemini OAuth sign-in failed.",
    codexOAuthUnsupported: "The OAuth API for personal Codex/OpenAI usage lookup isn't wired up in the app yet.",
    claudeOAuthUnsupported: "The official OAuth API for personal Claude usage lookup still needs verification."
  },
  updates: {
    eyebrow: "UPDATES",
    heading: "Updates",
    currentVersion: (version) => `Current version v${version}`,
    check: "Check for updates",
    restartAndInstall: "Restart & install",
    devModeNote: "Updates aren't checked in dev mode.",
    statusChecking: "Checking for updates...",
    statusAvailable: (version) => `Downloading v${version}`,
    statusDownloading: (percent) => `Downloading ${percent}%`,
    statusDownloaded: (version) => `v${version} ready to install`,
    statusNotAvailable: "You're up to date.",
    statusError: (message) => `Update check failed: ${message}`
  },
  notices: {
    launchAtLoginCheckFailed: "Couldn't check the launch-at-login status.",
    initialLoadFailed: "Couldn't load usage. Please try again.",
    historyLoadFailed: "Couldn't load usage history.",
    genericRequestFailed: "Couldn't complete the request.",
    providerConnected: (label) => `${label} connection info saved.`,
    loginFailed: "Couldn't complete sign-in.",
    authRemoved: "Removed the saved connection info.",
    launchAtLoginChangeFailed: "Couldn't change the launch-at-login setting.",
    diagnosticsCopied: "Diagnostics copied to clipboard.",
    diagnosticsCopyFailedResult: "Couldn't copy diagnostics.",
    diagnosticsCopyFailed: "Couldn't copy diagnostics.",
    statusPageOpenFailed: "Couldn't open the status page."
  }
};

const dictionaries: Record<Language, Translations> = { ko, en };

export function getTranslations(language: Language): Translations {
  return dictionaries[language] ?? ko;
}
