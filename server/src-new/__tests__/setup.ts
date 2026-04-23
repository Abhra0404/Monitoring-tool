/**
 * Vitest global setup — runs before any test file is loaded.
 *
 * The in-memory store reads `process.env.SKIP_JSON_SNAPSHOT` at module-load
 * time and will otherwise hydrate from / persist to `~/.theoria/store.json`.
 * That file is shared across test runs and the developer's machine, which
 * causes the integration suite to inherit state from previous runs (the
 * status-page test has famously flaked on this).
 *
 * By setting the env var here, before any src-new module gets imported, we
 * guarantee the store never touches the filesystem during tests.
 */
process.env.SKIP_JSON_SNAPSHOT = "1";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
