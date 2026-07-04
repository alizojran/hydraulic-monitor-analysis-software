# HMAS Cloud Server

Cloud-side service for the HMAS TCP architecture:

- TCP Server: receives CODESYS length-prefixed JSON control frames and binary
  `int16` FFT frames.
- Authentication: `hello` frame validates `deviceId` and `secret`.
- PostgreSQL/TimescaleDB storage: FFT summary, full spectrum, alarms.
- HTTP API: latest values and history queries for the local Vue/HTML client.
- WebSocket relay: pushes live FFT/alarm/status frames to the browser.
- Admin API: token-protected endpoints used by the local management page for
  device status, table stats, latest rows, read-only SQL, cleanup, and simulator
  control. The cloud `/admin` page is disabled in production.

## Quick Start

```bash
cd cloud-server
npm install
cp .env.example .env
# edit DATABASE_URL, DEVICE_ID, DEVICE_SECRET, ADMIN_TOKEN
psql "$DATABASE_URL" -f sql/schema.sql
npm run register-device
npm start
```

`sql/schema.sql` is plain PostgreSQL and works without TimescaleDB. If
TimescaleDB is installed, optionally run:

```bash
psql "$DATABASE_URL" -f sql/timescaledb_optional.sql
```

Default ports:

- TCP ingest: `9100`
- HTTP API: `8080`
- WebSocket live: `ws://<server>:8080/ws/live?deviceId=HMAS-001`

## CODESYS TCP Protocol

Every TCP message starts with a 4-byte big-endian payload length:

```text
[uint32be payload_length][payload]
```

The first payload must be JSON `hello`:

```json
{
  "v": 1,
  "type": "hello",
  "deviceId": "HMAS-001",
  "secret": "change-this-device-secret",
  "ts": 1719300000000
}
```

After authentication, FFT payloads use binary `HMF1` format. CODESYS should
quantize every FFT dB bin as:

```text
int16_value = round(db_value * 10)
```

Binary FFT payload layout, all multi-byte fields are little-endian:

```text
offset  size  type       field
0       4     char[4]    magic = "HMF1"
4       1     uint8      version = 1
5       1     uint8      channel_id_length
6       2     uint16     flags = 0
8       4     uint32     seq
12      8     uint64     timestamp_ms
20      4     uint32     sample_rate
24      2     uint16     fft_size
26      2     uint16     bin_count = fft_size / 2
28      2     int16      db_scale = 10
30      2     int16      reserved = 0
32      4     float32    rms
36      4     float32    peak
40      4     float32    crest_factor
44      4     float32    thd
48      4     float32    bpfi_hz, use NaN if absent
52      4     float32    bpfi_db, use NaN if absent
56      4     float32    bpfo_hz, use NaN if absent
60      4     float32    bpfo_db, use NaN if absent
64      4     float32    bsf_hz, use NaN if absent
68      4     float32    bsf_db, use NaN if absent
72      4     float32    ftf_hz, use NaN if absent
76      4     float32    ftf_db, use NaN if absent
80      16    char[16]   channel_id ASCII, zero padded
96      52    float32[]  CH01..CH08,F01,F02,V01,V02,S01, use NaN if absent
148     N*2   int16[]    spectrum bins, db * db_scale
```

For `fftSize=2048`, one FFT payload is `148 + 1024*2 = 2196` bytes plus the
4-byte TCP length header.

## HTTP API

```text
GET /health
GET /api/latest?deviceId=HMAS-001
GET /api/history?deviceId=HMAS-001&channelId=V02&from=2026-06-26T00:00:00Z&to=2026-06-27T00:00:00Z&limit=1000
GET /api/spectrum?deviceId=HMAS-001&channelId=V02&limit=100
GET /api/alarms?deviceId=HMAS-001&limit=100
GET /api/simulator/status
GET /api/simulator/start
GET /api/simulator/stop
```

## Local Database Admin

Set a strong token in `.env`:

```env
ADMIN_TOKEN=replace-with-a-long-random-token
```

Current local admin page:

```text
http://127.0.0.1:18080/
```

Run it on the management PC:

```bash
cd hydraulic-monitor-analysis-software/local-admin
python3 serve_no_cache.py
```

The local page talks to the Aliyun API base:

```text
http://8.148.228.136:8080
```

Current admin token:

```text
d40712c1ee3df9692743f1ecb788274319128707392fb319
```

Admin API endpoints require `Authorization: Bearer <ADMIN_TOKEN>`:

```text
GET  /api/admin/status
GET  /api/admin/tables
GET  /api/admin/count?table=fft_summary&from=...&to=...
GET  /api/admin/latest?table=fft_summary&limit=50
POST /api/admin/query
POST /api/admin/delete-before
POST /api/admin/simulator/start
POST /api/admin/simulator/stop
```

The V2 analysis SPA is deployed on the same HTTP service:

```text
GET /hydraulic-monitor-analysis-software/
```

Public URL:

```text
http://8.148.228.136:8080/hydraulic-monitor-analysis-software/
```

Static files live in:

```text
/opt/hmas-cloud-server/public/hydraulic-monitor-analysis-software/
```

Because the SPA is served from the same origin as `/api/*` and `/ws/live`, the
browser can use the current page origin as the default cloud base URL.

The SQL endpoint only accepts read-only `SELECT`, `WITH`, or `EXPLAIN`
statements and returns at most 500 rows. Data deletion is limited to whitelisted
history tables and requires a cutoff timestamp.

Refresh behavior of the local admin page:

```text
selected device process values: 0.5 second
devices / table stats / status:  about 3 seconds
history result table:            manual query only
database relation sizes:         about 60 seconds on the cloud side
```

`/api/admin/tables` is optimized for low CPU usage. Row counters and latest
timestamps are kept in a cloud-side memory cache and are incremented when FFT,
spectrum, alarm, or ingest-log rows are inserted. PostgreSQL relation sizes are
still recalculated periodically, so storage bytes may update slower than row
counts.

For history queries, the local admin page uses two modes:

```text
without from/to: query the latest N rows using "latest rows without time"
with from/to:    call /api/admin/count first, then download all rows in 100-row pages
```

This keeps normal refresh light while still allowing long time-range queries to
show progress and finish without guessing how many rows are needed.

After a history query completes, the local admin page can draw curves from the
rows already downloaded into the browser:

```text
X axis: timestamp
Y axis: selected numeric signals
supports one signal or multiple signals
```

The chart does not issue extra database queries. Multiple signals are scaled by
their own min/max ranges so process values such as pressure, flow, speed,
vibration, and sound can be viewed together.

## Spectrum Storage

Incoming CODESYS FFT frames are already compact `int16` binary. `fft_summary`
keeps compact FFT metrics and peaks as JSON. Full FFT spectrum rows in
`fft_spectrum` are stored as compressed binary:

```text
spectrumDb number[] -> int16, 0.1 dB scale -> zlib deflate -> bytea
```

The HTTP API still returns `spectrum_db` as a normal dB array, so the browser
client does not need to know the database encoding.

To delete old JSON spectrum data and switch an existing database to compressed
storage:

```bash
psql "$DATABASE_URL" -f sql/migrate_spectrum_int16_zlib.sql
```

The simulator generates cloud-side FFT messages without a CODESYS connection.
Enable it at startup with `SIMULATOR_ENABLED=true`, or start it on demand:

```bash
curl http://127.0.0.1:8080/api/simulator/start
```

## Capacity Planning

Current CODESYS upload protocol uses binary `int16` FFT frames. With
`fftSize=2048` and one `V02` plus one `S01` frame per second:

```text
single device upload: about 35 kbps payload
single device public network budget: about 40-45 kbps with TCP/IP overhead
single device 4G traffic: about 13-15 GB/month, use 20 GB/month for margin
```

For an Aliyun server with `3 Mbps` public bandwidth:

```text
theoretical limit: about 60 devices
recommended planning target: 40 devices
```

For 40 devices:

```text
FFT ingest: about 80 frames/second
database writes: about 160 rows/second
  - fft_summary: 80 rows/second
  - fft_spectrum: 80 rows/second
```

Server sizing:

```text
minimum workable: 2 vCPU / 2 GB
recommended:       2 vCPU / 4 GB
long-term margin:  4 vCPU / 8 GB
```

Disk sizing with compressed spectrum storage:

```text
single device: 0.4-0.5 GB/day
40 devices:    16-20 GB/day
7 days:        about 140 GB, use at least 200 GB disk
30 days:       about 540 GB, use at least 600 GB disk
```

The current 40 GB system disk is suitable for testing only. With 40 devices it
holds roughly 1.5-2 days of data, so production should enable scheduled cleanup
or use a larger data disk.

## Company Backup Pull Model

If the company data server has no public IP, use a pull-based backup model. The
company server initiates the connection to Aliyun, so no inbound company network
port is required:

```text
CODESYS controllers
  -> Aliyun TCP ingest
  -> Aliyun PostgreSQL short-term buffer, 3-7 days
  -> local browser UI for realtime view and manual CSV/PNG export only
  <- company data server pulls data every night over SSH/HTTPS
  -> company PostgreSQL/TimescaleDB on RAID storage for long-term retention
```

Recommended nightly job:

```text
1. Company server starts a cron job.
2. SSH into Aliyun. Do not expose PostgreSQL 5432 to the public internet.
3. Export yesterday's data, 00:00:00-23:59:59.
4. Generate manifest.json and sha256 checksums.
5. Download the compressed export archive.
6. Verify checksums and import into the company database.
7. Keep 7 days on Aliyun and delete only data older than the retention window.
```

Bandwidth billing comparison for 40 devices:

```text
daily data: 16-20 GB
monthly data: 480-600 GB
0.8 CNY/GB + 100 Mbps: about 384-480 CNY/month, nightly sync in 30-60 minutes
10 Mbps monthly plan: 538.86 CNY/month, nightly sync in about 4.5-6 hours
break-even: 538.86 / 0.8 = about 674 GB/month
```

For the current 40-device estimate, prefer `0.8 CNY/GB + 100 Mbps`. Reconsider a
fixed-bandwidth plan after real outbound traffic is consistently above
`700 GB/month`.

Company data server sizing:

```text
CPU:      4-8 cores
Memory:   16-32 GB
Database: PostgreSQL + TimescaleDB or daily partitions
Storage:  RAID6 for capacity/safety, RAID10 for performance
Capacity: 40 devices need about 6-8 TB/year; plan 8-10 TB/year with margin
```

## Notes

- Periodic FFT data can use best-effort delivery. The `seq` field lets the
  server and UI detect gaps.
- Full spectrum is compressed in PostgreSQL. Keep `fft_summary` for fast trend
  queries and use `/api/spectrum` only when the UI needs the full FFT curve.
