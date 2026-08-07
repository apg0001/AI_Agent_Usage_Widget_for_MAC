import { PROVIDERS, ProviderId, ProviderUsage, UsageSnapshot } from "../shared/types.js";

const providerInitials: Record<ProviderId, string> = {
  codex: "Co",
  claude: "Cl",
  gemini: "G"
};

const STATUS_FILL_COLOR: Record<ProviderUsage["status"], string> = {
  ok: "#2563eb",
  warning: "#f59e0b",
  critical: "#dc2626",
  "signed-out": "#64748b",
  error: "#dc2626"
};

const STATUS_TEXT_COLOR: Record<ProviderUsage["status"], string> = {
  ok: "#ffffff",
  warning: "#111827",
  critical: "#ffffff",
  "signed-out": "#ffffff",
  error: "#ffffff"
};

type TraySegment = { text: string; background: string; textColor: string };

function buildTraySegments(snapshot: UsageSnapshot): TraySegment[] {
  const visibleProviders = PROVIDERS.filter((provider) => snapshot.settings.providers[provider.id].visible);

  if (!visibleProviders.length) {
    return [{ text: "AI", background: "#111827", textColor: "#e2e8f0" }];
  }

  return visibleProviders.map((provider) => {
    const usage = snapshot.usage.find((item) => item.provider === provider.id);
    const status = usage?.status ?? "signed-out";
    const text =
      snapshot.settings.menuBarDisplayMode === "icons" ? providerInitials[provider.id] : `${usage?.percent ?? 0}`;
    return { text, background: STATUS_FILL_COLOR[status], textColor: STATUS_TEXT_COLOR[status] };
  });
}

// 실제 트레이 슬롯 크기는 Windows가 강제하지만(보통 16~32px), SVG는 벡터라 이 값을 키워서
// 렌더링 해상도를 높이면 축소 표시될 때도 글씨 테두리가 흐려지지 않고 또렷하게 보인다.
export const TRAY_ICON_RENDER_SIZE = 128;

/**
 * Windows/Linux 시스템 트레이는 macOS의 Tray.setTitle과 달리 아이콘 옆에 텍스트를 표시하지 않으므로,
 * Codex/Claude 등 제공자별 사용률을 아이콘 비트맵 안에 색상 구획 + 숫자로 직접 그려 넣는다.
 * 제공자별 구획은 위에서 아래로 쌓아(세로 배치) 각 구획이 아이콘 전체 너비를 쓰도록 해서
 * 나란히 놓는 방식보다 숫자를 더 크게 그릴 수 있게 한다.
 * 표시 순서는 설정 화면 및 macOS 메뉴바 텍스트와 동일하게 PROVIDERS 순서(Codex → Claude → Gemini)를 따른다.
 */
export function buildUsageTrayIconSvg(snapshot: UsageSnapshot): string {
  const segments = buildTraySegments(snapshot);
  const viewBoxSize = 64;
  const rowHeight = viewBoxSize / segments.length;
  const clipId = "tray-icon-clip";

  const rows = segments
    .map((segment, index) => {
      const y = index * rowHeight;
      const fontSize = Math.max(18, Math.min(38, Math.floor(rowHeight * 0.62)));
      const textY = y + rowHeight / 2 + fontSize * 0.35;
      return `
        <rect x="0" y="${y}" width="${viewBoxSize}" height="${rowHeight}" fill="${segment.background}"/>
        <text x="${viewBoxSize / 2}" y="${textY}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="${segment.textColor}">${segment.text}</text>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TRAY_ICON_RENDER_SIZE}" height="${TRAY_ICON_RENDER_SIZE}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}">
      <defs>
        <clipPath id="${clipId}">
          <rect width="${viewBoxSize}" height="${viewBoxSize}" rx="14"/>
        </clipPath>
      </defs>
      <g clip-path="url(#${clipId})">
        ${rows}
      </g>
    </svg>
  `;
}

export function buildStaticTrayIconSvg(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#111827"/>
      <path d="M9 21L14 8h4l5 13h-4l-.9-2.8h-4.4L12.8 21H9zm5.5-5.8h2.9L16 10.8l-1.5 4.4z" fill="#fff"/>
    </svg>
  `;
}
