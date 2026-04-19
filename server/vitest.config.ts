import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src-new/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src-new/**/*.ts"],
      exclude: ["src-new/**/*.test.ts", "src-new/**/*.d.ts"],
    },
  },
});
