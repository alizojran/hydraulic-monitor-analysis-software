BEGIN;

TRUNCATE TABLE fft_spectrum, fft_summary;

ALTER TABLE fft_spectrum
  ADD COLUMN IF NOT EXISTS spectrum_codec text NOT NULL DEFAULT 'int16-zlib',
  ADD COLUMN IF NOT EXISTS spectrum_scale integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS spectrum_len integer NOT NULL DEFAULT 0;

ALTER TABLE fft_spectrum
  ALTER COLUMN spectrum_db TYPE bytea
  USING '\x'::bytea;

ALTER TABLE fft_spectrum
  ALTER COLUMN spectrum_codec SET DEFAULT 'int16-zlib',
  ALTER COLUMN spectrum_scale SET DEFAULT 10,
  ALTER COLUMN spectrum_len SET DEFAULT 0,
  ALTER COLUMN spectrum_db SET NOT NULL,
  ALTER COLUMN spectrum_codec SET NOT NULL,
  ALTER COLUMN spectrum_scale SET NOT NULL,
  ALTER COLUMN spectrum_len SET NOT NULL;

COMMIT;
