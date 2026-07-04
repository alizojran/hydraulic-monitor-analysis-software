CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  secret_hash text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fft_summary (
  ts timestamptz NOT NULL,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  seq bigint,
  channel_id text NOT NULL,
  sample_rate integer NOT NULL,
  fft_size integer NOT NULL,
  bin_hz double precision NOT NULL,
  rms double precision,
  peak double precision,
  crest_factor double precision,
  thd double precision,
  main_freq double precision,
  main_amp_db double precision,
  bpfi_hz double precision,
  bpfi_db double precision,
  bpfo_hz double precision,
  bpfo_db double precision,
  bsf_hz double precision,
  bsf_db double precision,
  ftf_hz double precision,
  ftf_db double precision,
  peaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  bearing jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fft_summary_device_channel_ts
  ON fft_summary (device_id, channel_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_fft_summary_device_seq
  ON fft_summary (device_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_fft_summary_ts
  ON fft_summary (ts DESC);

CREATE INDEX IF NOT EXISTS idx_fft_summary_device_ts
  ON fft_summary (device_id, ts DESC);

CREATE TABLE IF NOT EXISTS fft_spectrum (
  ts timestamptz NOT NULL,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  seq bigint,
  channel_id text NOT NULL,
  sample_rate integer NOT NULL,
  fft_size integer NOT NULL,
  bin_hz double precision NOT NULL,
  spectrum_db bytea NOT NULL,
  spectrum_codec text NOT NULL DEFAULT 'int16-zlib',
  spectrum_scale integer NOT NULL DEFAULT 10,
  spectrum_len integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fft_spectrum_device_channel_ts
  ON fft_spectrum (device_id, channel_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_fft_spectrum_device_ts
  ON fft_spectrum (device_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_fft_spectrum_ts
  ON fft_spectrum (ts DESC);

CREATE TABLE IF NOT EXISTS alarm_events (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  seq bigint,
  channel_id text,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alarm_events_device_ts
  ON alarm_events (device_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_alarm_events_ts
  ON alarm_events (ts DESC);

CREATE TABLE IF NOT EXISTS device_ingest_log (
  ts timestamptz NOT NULL DEFAULT now(),
  device_id text,
  remote_addr text,
  event text NOT NULL,
  detail text
);

CREATE INDEX IF NOT EXISTS idx_device_ingest_log_ts
  ON device_ingest_log (ts DESC);

CREATE INDEX IF NOT EXISTS idx_device_ingest_log_device_ts
  ON device_ingest_log (device_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_devices_created_at
  ON devices (created_at DESC);
