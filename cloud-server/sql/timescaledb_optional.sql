CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable('fft_summary', 'ts', if_not_exists => TRUE);
SELECT create_hypertable('fft_spectrum', 'ts', if_not_exists => TRUE);
