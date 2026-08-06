/// <reference types="vite/client" />

import type { AiUsageApi } from "../preload/preload";

declare global {
  interface Window {
    aiUsage: AiUsageApi;
  }
}
