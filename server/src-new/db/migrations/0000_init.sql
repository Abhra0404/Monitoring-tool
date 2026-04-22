/**
 * Initial schema migration for Theoria.
 * Generated manually (not via drizzle-kit generate) to embed TimescaleDB
 * hypertable + continuous aggregate + retention policy setup in the same
 * transactional migration so the schema and the time-series infrastructure
 * stay consistent.
 *
 * Drizzle-kit-style migration: `--> statement-breakpoint` separates statements
 * so each runs in its own transaction when needed.
 */

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
-- TimescaleDB is optional in zero-config. The hypertable conversion block
-- below is wrapped in a DO $$ BEGIN IF ... check so plain PostgreSQL still
-- accepts this migration (the tables will simply behave as ordinary tables).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    BEGIN
      CREATE EXTENSION timescaledb;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'timescaledb extension unavailable; continuing without hypertables';
    END;
  END IF;
END $$;
--> statement-breakpoint

-- ── users ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  api_key        VARCHAR(128) NOT NULL UNIQUE,
  role           VARCHAR(32) NOT NULL DEFAULT 'user',
  is_system      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users (api_key);
--> statement-breakpoint

-- ── servers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id   VARCHAR(128) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  hostname    VARCHAR(255),
  platform    VARCHAR(64),
  arch        VARCHAR(32),
  cpu_count   INTEGER,
  status      VARCHAR(32) NOT NULL DEFAULT 'offline',
  last_seen   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_servers_user_server ON servers (user_id, server_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_servers_user_lastseen ON servers (user_id, last_seen);
--> statement-breakpoint

-- ── metrics (hypertable) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metrics (
  time       TIMESTAMPTZ NOT NULL,
  user_id    UUID NOT NULL,
  server_id  VARCHAR(128) NOT NULL,
  name       VARCHAR(128) NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  labels     JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('metrics', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
    PERFORM add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metrics_user_server_time ON metrics (user_id, server_id, time DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metrics_user_server_name_time ON metrics (user_id, server_id, name, time DESC);
--> statement-breakpoint

-- Continuous aggregates (TimescaleDB only)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    BEGIN
      CREATE MATERIALIZED VIEW metrics_1m
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 minute', time) AS bucket,
        user_id,
        server_id,
        name,
        AVG(value) AS avg_val,
        MIN(value) AS min_val,
        MAX(value) AS max_val,
        COUNT(*)   AS sample_count
      FROM metrics
      GROUP BY bucket, user_id, server_id, name
      WITH NO DATA;

      PERFORM add_continuous_aggregate_policy('metrics_1m',
        start_offset => INTERVAL '2 hours',
        end_offset   => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute',
        if_not_exists => TRUE);
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
  END IF;
END $$;
--> statement-breakpoint

-- ── alert_rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  metric_name        VARCHAR(128) NOT NULL,
  labels             JSONB NOT NULL DEFAULT '{}'::jsonb,
  operator           VARCHAR(8)  NOT NULL,
  threshold          DOUBLE PRECISION NOT NULL,
  duration_minutes   INTEGER NOT NULL DEFAULT 0,
  severity           VARCHAR(16) NOT NULL DEFAULT 'warning',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_rules_user_name ON alert_rules (user_id, name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alert_rules_user_active ON alert_rules (user_id, is_active);
--> statement-breakpoint

-- ── alert_history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id        UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  rule_name      VARCHAR(255) NOT NULL,
  metric_name    VARCHAR(128) NOT NULL,
  labels         JSONB NOT NULL DEFAULT '{}'::jsonb,
  operator       VARCHAR(8) NOT NULL,
  threshold      DOUBLE PRECISION NOT NULL,
  actual_value   DOUBLE PRECISION NOT NULL,
  severity       VARCHAR(16) NOT NULL,
  status         VARCHAR(16) NOT NULL,
  message        TEXT,
  fired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alert_history_user_status ON alert_history (user_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alert_history_rule_status ON alert_history (rule_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_alert_history_user_fired ON alert_history (user_id, fired_at);
--> statement-breakpoint

-- ── http_checks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS http_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  url                 TEXT NOT NULL,
  interval_seconds    INTEGER NOT NULL DEFAULT 60,
  expected_status     INTEGER NOT NULL DEFAULT 200,
  timeout_ms          INTEGER NOT NULL DEFAULT 10000,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  status              VARCHAR(16) NOT NULL DEFAULT 'pending',
  last_checked_at     TIMESTAMPTZ,
  last_response_time  INTEGER,
  last_status_code    INTEGER,
  ssl_expiry          TIMESTAMPTZ,
  uptime_percent      DOUBLE PRECISION NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_http_checks_user_active ON http_checks (user_id, is_active);
--> statement-breakpoint

-- ── http_check_results (hypertable) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS http_check_results (
  time                TIMESTAMPTZ NOT NULL,
  check_id            UUID NOT NULL,
  user_id             UUID NOT NULL,
  status_code         INTEGER,
  response_time       INTEGER,
  status              VARCHAR(8)  NOT NULL,
  ssl_days_remaining  INTEGER,
  error               TEXT
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('http_check_results', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');
    PERFORM add_retention_policy('http_check_results', INTERVAL '90 days', if_not_exists => TRUE);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_http_check_results_check_time ON http_check_results (check_id, time DESC);
--> statement-breakpoint

-- ── pipelines ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipelines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          VARCHAR(32) NOT NULL,
  repo            VARCHAR(255) NOT NULL,
  branch          VARCHAR(255),
  pipeline_name   VARCHAR(255),
  run_id          VARCHAR(128) NOT NULL,
  run_number      INTEGER,
  status          VARCHAR(32) NOT NULL,
  triggered_by    VARCHAR(255),
  commit_sha      VARCHAR(64),
  commit_message  TEXT,
  url             TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  duration_ms     BIGINT,
  stages          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipelines_user_source_run ON pipelines (user_id, source, run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pipelines_user_created ON pipelines (user_id, created_at);
--> statement-breakpoint

-- ── notification_channels ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(32) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels (user_id);
--> statement-breakpoint

-- ── docker_containers (hypertable) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS docker_containers (
  time          TIMESTAMPTZ NOT NULL,
  user_id       UUID NOT NULL,
  server_id     VARCHAR(128) NOT NULL,
  container_id  VARCHAR(128) NOT NULL,
  name          VARCHAR(255),
  image         VARCHAR(255),
  status        VARCHAR(32),
  state         VARCHAR(32),
  cpu_percent   DOUBLE PRECISION,
  mem_usage     BIGINT,
  mem_limit     BIGINT,
  mem_percent   DOUBLE PRECISION,
  net_rx        BIGINT,
  net_tx        BIGINT,
  restarts      INTEGER
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('docker_containers', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
    PERFORM add_retention_policy('docker_containers', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_docker_user_server_time ON docker_containers (user_id, server_id, time DESC);
--> statement-breakpoint

-- ── status_page_config ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS status_page_config (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title            VARCHAR(255) NOT NULL DEFAULT 'System Status',
  description      TEXT NOT NULL DEFAULT '',
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  custom_domain    VARCHAR(255),
  custom_services  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- ── incidents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  status       VARCHAR(32) NOT NULL DEFAULT 'investigating',
  severity     VARCHAR(32) NOT NULL DEFAULT 'minor',
  services     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_incidents_user_status ON incidents (user_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS incident_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status       VARCHAR(32) NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_incident_updates_incident ON incident_updates (incident_id);
--> statement-breakpoint

-- ── heartbeat_monitors ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heartbeat_monitors (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    VARCHAR(255) NOT NULL,
  slug                    VARCHAR(128) NOT NULL UNIQUE,
  expected_every_seconds  INTEGER NOT NULL,
  grace_period_seconds    INTEGER NOT NULL DEFAULT 0,
  last_ping_at            TIMESTAMPTZ,
  status                  VARCHAR(16) NOT NULL DEFAULT 'pending',
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_heartbeat_user ON heartbeat_monitors (user_id);
--> statement-breakpoint

-- ── tcp_checks, ping_checks, dns_checks ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tcp_checks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  host              VARCHAR(255) NOT NULL,
  port              INTEGER NOT NULL,
  interval_seconds  INTEGER NOT NULL DEFAULT 60,
  timeout_ms        INTEGER NOT NULL DEFAULT 5000,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  status            VARCHAR(16) NOT NULL DEFAULT 'pending',
  last_checked_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS ping_checks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  host              VARCHAR(255) NOT NULL,
  interval_seconds  INTEGER NOT NULL DEFAULT 60,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  status            VARCHAR(16) NOT NULL DEFAULT 'pending',
  last_latency_ms   DOUBLE PRECISION,
  last_packet_loss  DOUBLE PRECISION,
  last_checked_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS dns_checks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  domain            VARCHAR(255) NOT NULL,
  record_type       VARCHAR(16) NOT NULL DEFAULT 'A',
  expected          TEXT,
  interval_seconds  INTEGER NOT NULL DEFAULT 300,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  status            VARCHAR(16) NOT NULL DEFAULT 'pending',
  last_checked_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- ── events (hypertable — unified timeline) ───────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  time      TIMESTAMPTZ NOT NULL,
  id        UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL,
  kind      VARCHAR(32) NOT NULL,
  source    VARCHAR(32) NOT NULL,
  severity  VARCHAR(16) NOT NULL DEFAULT 'info',
  title     VARCHAR(255) NOT NULL,
  detail    JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (time, id)
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('events', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');
    PERFORM add_retention_policy('events', INTERVAL '90 days', if_not_exists => TRUE);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_events_user_time ON events (user_id, time DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_events_user_kind_time ON events (user_id, kind, time DESC);
--> statement-breakpoint

-- ── refresh_tokens (auth) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(128) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
