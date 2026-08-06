import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION: "1"
    },
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    conditions: ["node"]
  }
});
