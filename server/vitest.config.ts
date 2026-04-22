import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src-new/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src-new/**/*.ts"],
      exclude: [
        "src-new/**/*.test.ts",
        "src-new/**/*.d.ts",
        "src-new/index.ts",
        // DB code paths exercised only in DATABASE_URL mode (integration tests
        // run against the in-memory store). Excluded until a Testcontainers-
        // based DB test suite lands in Phase 6.
        "src-new/db/migrate.ts",
        "src-new/db/connection.ts",
        "src-new/db/hydrate.ts",
        "src-new/db/persist.ts",
        "src-new/db/migrations/**",
        // External integrations — require mocked outbound HTTP which will be
        // covered by provider-level tests when the notifications refactor in
        // Phase 2 lands.
        "src-new/modules/notifications/service.ts",
        // Pure type definitions.
        "src-new/shared/types.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 65,
        statements: 70,
        branches: 55,
      },
    },
  },
});
