const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Pool } = require('pg');

const SPECTRUM_CODEC = 'int16-zlib';
const SPECTRUM_SCALE = 10;
const DEFAULT_ONLINE_TTL_MS = 5000;

const ADMIN_TABLES = {
  devices: { timeColumn: 'created_at', orderColumn: 'created_at' },
  fft_summary: { timeColumn: 'ts', orderColumn: 'ts' },
  fft_spectrum: { timeColumn: 'ts', orderColumn: 'ts' },
  alarm_events: { timeColumn: 'ts', orderColumn: 'ts' },
  device_ingest_log: { timeColumn: 'ts', orderColumn: 'ts' },
};

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function encodeSpectrumDb(spectrumDb) {
  if (!Array.isArray(spectrumDb) || spectrumDb.length === 0) {
    return { buffer: Buffer.alloc(0), codec: SPECTRUM_CODEC, scale: SPECTRUM_SCALE, length: 0 };
  }

  const raw = Buffer.allocUnsafe(spectrumDb.length * 2);
  for (let i = 0; i < spectrumDb.length; i++) {
    const db = typeof spectrumDb[i] === 'number' && Number.isFinite(spectrumDb[i]) ? spectrumDb[i] : -120;
    const quantized = Math.max(-32768, Math.min(32767, Math.round(db * SPECTRUM_SCALE)));
    raw.writeInt16LE(quantized, i * 2);
  }

  return {
    buffer: zlib.deflateSync(raw),
    codec: SPECTRUM_CODEC,
    scale: SPECTRUM_SCALE,
    length: spectrumDb.length,
  };
}

function decodeSpectrumDb(row) {
  const value = row.spectrum_db;
  if (Array.isArray(value)) return value;
  if (!Buffer.isBuffer(value)) return [];

  const codec = row.spectrum_codec || SPECTRUM_CODEC;
  if (codec !== SPECTRUM_CODEC) {
    throw new Error(`Unsupported spectrum codec: ${codec}`);
  }

  const scale = Number(row.spectrum_scale) || SPECTRUM_SCALE;
  const expectedLength = Number(row.spectrum_len) || 0;
  const raw = zlib.inflateSync(value);
  const length = expectedLength > 0 ? expectedLength : Math.floor(raw.length / 2);
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = raw.readInt16LE(i * 2) / scale;
  }
  return out;
}

function normalizeChannelValues(ch) {
  const values = ch && typeof ch === 'object' ? { ...ch } : {};
  const f02 = Number(values.F02);
  if (Number.isFinite(f02)) {
    const iso4um = Math.max(0, Math.round(f02));
    values.F02_4um = Number.isFinite(Number(values.F02_4um)) ? Math.round(Number(values.F02_4um)) : iso4um;
    values.F02_6um = Number.isFinite(Number(values.F02_6um))
      ? Math.round(Number(values.F02_6um))
      : Math.max(0, iso4um - 2);
    values.F02_14um = Number.isFinite(Number(values.F02_14um))
      ? Math.round(Number(values.F02_14um))
      : Math.max(0, iso4um - 5);
  }
  return values;
}

function requireAdminTable(table) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_TABLES, table)) {
    throw new Error(`Unsupported table: ${table}`);
  }
  return ADMIN_TABLES[table];
}

function normalizeReadOnlySql(sql) {
  const text = String(sql || '').trim();
  if (!text) throw new Error('SQL is required');
  if (text.length > 10_000) throw new Error('SQL is too long');

  const withoutTrailingSemicolon = text.replace(/;\s*$/, '').trim();
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Only one SQL statement is allowed');
  }

  const firstWord = withoutTrailingSemicolon.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
  if (!['select', 'with', 'explain'].includes(firstWord)) {
    throw new Error('Only read-only SELECT, WITH, or EXPLAIN SQL is allowed');
  }

  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|set|reset)\b/i;
  if (forbidden.test(withoutTrailingSemicolon)) {
    throw new Error('Write or administration SQL is not allowed');
  }

  return withoutTrailingSemicolon;
}

class HmasDatabase {
  constructor(databaseUrl) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({ connectionString: databaseUrl });
    this.adminStatsCache = null;
    this.adminStatsCacheAt = 0;
    this.adminStatsRefreshMs = 60_000;
    this.deviceFftRows = new Map();
    this.deviceFftRowsReady = false;
    this.deviceFftRowsLoading = null;
  }

  async close() {
    await this.pool.end();
  }

  async registerDevice(id, secret, name = id) {
    const secretHash = hashSecret(secret);
    await this.pool.query(
      `INSERT INTO devices (id, name, secret_hash, status, last_seen_at)
       VALUES ($1, $2, $3, 'offline', now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           secret_hash = EXCLUDED.secret_hash`,
      [id, name, secretHash],
    );
  }

  async authenticateDevice(id, secret) {
    const { rows } = await this.pool.query('SELECT secret_hash FROM devices WHERE id = $1', [id]);
    if (rows.length === 0) return false;
    return rows[0].secret_hash === hashSecret(secret);
  }

  async markOnline(id) {
    await this.pool.query(
      `UPDATE devices
       SET status = 'online', last_seen_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  async markOffline(id) {
    if (!id) return;
    await this.pool.query(
      `UPDATE devices
       SET status = 'offline', last_seen_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  async markStaleOffline(onlineTtlMs = DEFAULT_ONLINE_TTL_MS) {
    const ttlSeconds = Math.max(Number(onlineTtlMs) || DEFAULT_ONLINE_TTL_MS, 1000) / 1000;
    const { rows } = await this.pool.query(
      `WITH stale AS (
         SELECT d.id
         FROM devices d
         WHERE d.status = 'online'
           AND COALESCE(d.last_seen_at, 'epoch'::timestamptz)
             < now() - ($1::double precision * interval '1 second')
       )
       UPDATE devices d
       SET status = 'offline'
       FROM stale
       WHERE d.id = stale.id
       RETURNING d.id`,
      [ttlSeconds],
    );
    return rows.map((row) => row.id);
  }

  async logIngest(deviceId, remoteAddr, event, detail = '') {
    await this.pool.query(
      `INSERT INTO device_ingest_log (device_id, remote_addr, event, detail)
       VALUES ($1, $2, $3, $4)`,
      [deviceId || null, remoteAddr || null, event, detail || null],
    );
    this.touchAdminTable('device_ingest_log', { rowDelta: 1, lastTs: new Date() });
  }

  async insertFft(msg) {
    await this.pool.query(
      `INSERT INTO fft_summary (
         ts, device_id, seq, channel_id, sample_rate, fft_size, bin_hz,
         rms, peak, crest_factor, thd, main_freq, main_amp_db,
         bpfi_hz, bpfi_db, bpfo_hz, bpfo_db, bsf_hz, bsf_db, ftf_hz, ftf_db,
         peaks, bearing, channel_values
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21,
         $22::jsonb, $23::jsonb, $24::jsonb
       )`,
      [
        msg.ts,
        msg.deviceId,
        msg.seq,
        msg.channelId,
        msg.sampleRate,
        msg.fftSize,
        msg.binHz,
        msg.rms,
        msg.peak,
        msg.crestFactor,
        msg.thd,
        msg.mainFreq,
        msg.mainAmpDb,
        msg.bpfiHz,
        msg.bpfiDb,
        msg.bpfoHz,
        msg.bpfoDb,
        msg.bsfHz,
        msg.bsfDb,
        msg.ftfHz,
        msg.ftfDb,
        JSON.stringify(msg.peaks),
        JSON.stringify(msg.bearing),
        JSON.stringify(normalizeChannelValues(msg.ch)),
      ],
    );
    this.touchAdminTable('fft_summary', { rowDelta: 1, firstTs: msg.ts, lastTs: msg.ts });
    this.touchDeviceFftRows(msg.deviceId, 1);

    if (msg.spectrumDb && msg.spectrumDb.length > 0) {
      const encoded = encodeSpectrumDb(msg.spectrumDb);
      await this.pool.query(
        `INSERT INTO fft_spectrum (
           ts, device_id, seq, channel_id, sample_rate, fft_size, bin_hz,
           spectrum_db, spectrum_codec, spectrum_scale, spectrum_len
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          msg.ts,
          msg.deviceId,
          msg.seq,
          msg.channelId,
          msg.sampleRate,
          msg.fftSize,
          msg.binHz,
          encoded.buffer,
          encoded.codec,
          encoded.scale,
          encoded.length,
        ],
      );
      this.touchAdminTable('fft_spectrum', { rowDelta: 1, firstTs: msg.ts, lastTs: msg.ts });
    }
  }

  async insertAlarm(msg) {
    await this.pool.query(
      `INSERT INTO alarm_events (ts, device_id, seq, channel_id, severity, message, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        msg.ts,
        msg.deviceId,
        msg.seq,
        msg.channelId,
        msg.severity,
        msg.message,
        JSON.stringify(msg.payload),
      ],
    );
    this.touchAdminTable('alarm_events', { rowDelta: 1, firstTs: msg.ts, lastTs: msg.ts });
  }

  async latest(deviceId) {
    const { rows } = await this.pool.query(
      `SELECT
         ts, device_id, seq, channel_id, sample_rate, fft_size, bin_hz,
         rms, peak, crest_factor, thd, main_freq, main_amp_db,
         bpfi_hz, bpfi_db, bpfo_hz, bpfo_db, bsf_hz, bsf_db, ftf_hz, ftf_db,
         peaks, bearing, channel_values
       FROM fft_summary
       WHERE device_id = $1
       ORDER BY ts DESC
       LIMIT 4`,
      [deviceId],
    );
    return rows;
  }

  async history({ deviceId, channelId, from, to, limit }) {
    const params = [deviceId, channelId, from, to, limit];
    const { rows } = await this.pool.query(
      `SELECT
         ts, device_id, seq, channel_id, sample_rate, fft_size, bin_hz,
         rms, peak, crest_factor, thd, main_freq, main_amp_db,
         bpfi_hz, bpfi_db, bpfo_hz, bpfo_db, bsf_hz, bsf_db, ftf_hz, ftf_db,
         peaks, bearing, channel_values
       FROM fft_summary
       WHERE device_id = $1
         AND ($2::text IS NULL OR channel_id = $2)
         AND ($3::timestamptz IS NULL OR ts >= $3)
         AND ($4::timestamptz IS NULL OR ts <= $4)
       ORDER BY ts DESC
       LIMIT $5`,
      params,
    );
    return rows;
  }

  async spectrum({ deviceId, channelId, from, to, limit }) {
    const { rows } = await this.pool.query(
      `SELECT ts, device_id, seq, channel_id, sample_rate, fft_size, bin_hz,
              spectrum_db, spectrum_codec, spectrum_scale, spectrum_len
       FROM fft_spectrum
       WHERE device_id = $1
         AND ($2::text IS NULL OR channel_id = $2)
         AND ($3::timestamptz IS NULL OR ts >= $3)
         AND ($4::timestamptz IS NULL OR ts <= $4)
       ORDER BY ts DESC
       LIMIT $5`,
      [deviceId, channelId, from, to, limit],
    );
    return rows.map((row) => ({
      ts: row.ts,
      device_id: row.device_id,
      seq: row.seq,
      channel_id: row.channel_id,
      sample_rate: row.sample_rate,
      fft_size: row.fft_size,
      bin_hz: row.bin_hz,
      spectrum_db: decodeSpectrumDb(row),
      spectrum_codec: row.spectrum_codec,
      spectrum_scale: row.spectrum_scale,
      spectrum_len: row.spectrum_len,
    }));
  }

  async alarms({ deviceId, limit }) {
    const { rows } = await this.pool.query(
      `SELECT id, ts, device_id, seq, channel_id, severity, message, payload
       FROM alarm_events
       WHERE device_id = $1
       ORDER BY ts DESC
       LIMIT $2`,
      [deviceId, limit],
    );
    return rows;
  }

  async adminStatus(onlineTtlMs = DEFAULT_ONLINE_TTL_MS) {
    const ttlSeconds = Math.max(Number(onlineTtlMs) || DEFAULT_ONLINE_TTL_MS, 1000) / 1000;
    const nowResult = await this.pool.query('SELECT now() AS db_time');
    const versionResult = await this.pool.query('SHOW server_version');
    const onlineResult = await this.pool.query(
      `SELECT count(*)::int AS online_count
       FROM devices d
       WHERE d.status = 'online'
         AND COALESCE(d.last_seen_at, 'epoch'::timestamptz)
           >= now() - ($1::double precision * interval '1 second')`,
      [ttlSeconds],
    );
    return {
      dbTime: nowResult.rows[0]?.db_time,
      postgresVersion: versionResult.rows[0]?.server_version,
      onlineDevices: onlineResult.rows[0]?.online_count ?? 0,
      onlineTtlMs,
      pool: {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      },
    };
  }

  async adminDevices(onlineTtlMs = DEFAULT_ONLINE_TTL_MS) {
    await this.ensureDeviceFftRows();
    const ttlSeconds = Math.max(Number(onlineTtlMs) || DEFAULT_ONLINE_TTL_MS, 1000) / 1000;
    const { rows } = await this.pool.query(
      `WITH base AS (
        SELECT
         d.id,
         d.name,
         d.location,
         d.status,
         d.last_seen_at,
         d.created_at,
         latest.ts AS last_data_at,
         latest.ts AS latest_values_at,
         COALESCE(latest.channel_values, '{}'::jsonb) AS channel_values,
         GREATEST(
           COALESCE(d.last_seen_at, 'epoch'::timestamptz),
           COALESCE(latest.ts, 'epoch'::timestamptz)
         ) AS last_active_at,
         NULL::bigint AS fft_rows,
         COALESCE(channels.channels, '{}'::jsonb) AS channels
       FROM devices d
       LEFT JOIN LATERAL (
         SELECT ts, channel_values
         FROM fft_summary
         WHERE device_id = d.id
         ORDER BY ts DESC
         LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_object_agg(channel_id, ts ORDER BY channel_id) AS channels
         FROM (
           SELECT DISTINCT ON (channel_id) channel_id, ts
           FROM fft_summary
           WHERE device_id = d.id
           ORDER BY channel_id, ts DESC
         ) c
       ) channels ON TRUE
       )
       SELECT
         *,
         (status = 'online' AND last_active_at >= now() - ($1::double precision * interval '1 second')) AS online,
         CASE
           WHEN status = 'online' AND last_active_at >= now() - ($1::double precision * interval '1 second')
             THEN 'online'
           ELSE 'offline'
         END AS effective_status,
         status AS database_status,
         GREATEST(0, floor(extract(epoch FROM (now() - last_active_at))))::int AS inactive_seconds,
         $2::int AS online_ttl_ms
       FROM base
       ORDER BY online DESC, last_active_at DESC NULLS LAST, id`,
      [ttlSeconds, Math.floor(onlineTtlMs)],
    );
    return rows.map((row) => ({
      ...row,
      fft_rows: this.deviceFftRows.get(row.id) ?? Number(row.fft_rows || 0),
    }));
  }

  touchDeviceFftRows(deviceId, delta) {
    if (!deviceId || !this.deviceFftRowsReady) return;
    const current = Number(this.deviceFftRows.get(deviceId) || 0);
    this.deviceFftRows.set(deviceId, Math.max(0, current + Number(delta || 0)));
  }

  async ensureDeviceFftRows({ force = false } = {}) {
    if (this.deviceFftRowsReady && !force) return;
    if (this.deviceFftRowsLoading && !force) {
      await this.deviceFftRowsLoading;
      return;
    }

    this.deviceFftRowsLoading = (async () => {
      const { rows } = await this.pool.query(
        `SELECT device_id, count(*)::bigint AS fft_rows
         FROM fft_summary
         GROUP BY device_id`,
      );
      this.deviceFftRows = new Map(rows.map((row) => [row.device_id, Number(row.fft_rows || 0)]));
      this.deviceFftRowsReady = true;
    })();

    try {
      await this.deviceFftRowsLoading;
    } finally {
      this.deviceFftRowsLoading = null;
    }
  }

  cloneAdminStats(rows) {
    return (rows || []).map((row) => ({ ...row }));
  }

  newerTs(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const at = new Date(a).getTime();
    const bt = new Date(b).getTime();
    if (!Number.isFinite(at)) return b;
    if (!Number.isFinite(bt)) return a;
    return at >= bt ? a : b;
  }

  olderTs(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const at = new Date(a).getTime();
    const bt = new Date(b).getTime();
    if (!Number.isFinite(at)) return b;
    if (!Number.isFinite(bt)) return a;
    return at <= bt ? a : b;
  }

  touchAdminTable(table, { rowDelta = 0, firstTs = null, lastTs = null, totalBytesDelta = 0 } = {}) {
    if (!this.adminStatsCache) return;
    const row = this.adminStatsCache.find((item) => item.table === table);
    if (!row) return;
    row.rowCount = Math.max(0, Number(row.rowCount || 0) + Number(rowDelta || 0));
    if (firstTs) row.firstTs = this.olderTs(row.firstTs, firstTs);
    if (lastTs) row.lastTs = this.newerTs(row.lastTs, lastTs);
    if (totalBytesDelta) row.totalBytes = Math.max(0, Number(row.totalBytes || 0) + Number(totalBytesDelta));
    row.updatedAt = new Date();
  }

  async adminTableStats({ force = false, allowRowCountDecrease = false } = {}) {
    const now = Date.now();
    if (!force && this.adminStatsCache && now - this.adminStatsCacheAt < this.adminStatsRefreshMs) {
      return this.cloneAdminStats(this.adminStatsCache);
    }

    const previous = new Map((this.adminStatsCache || []).map((row) => [row.table, row]));
    const rows = [];
    for (const [table, meta] of Object.entries(ADMIN_TABLES)) {
      const statsSql = `
        SELECT
          GREATEST(0, COALESCE(c.reltuples, 0))::bigint AS row_count,
          (SELECT ${meta.timeColumn} FROM ${table} ORDER BY ${meta.timeColumn} ASC LIMIT 1) AS first_ts,
          (SELECT ${meta.timeColumn} FROM ${table} ORDER BY ${meta.timeColumn} DESC LIMIT 1) AS last_ts
        FROM pg_class c
        WHERE c.oid = $1::regclass`;
      const sizeSql = `SELECT pg_total_relation_size($1::regclass)::bigint AS total_bytes`;
      const [statsResult, sizeResult] = await Promise.all([
        this.pool.query(statsSql, [table]),
        this.pool.query(sizeSql, [table]),
      ]);
      const stats = statsResult.rows[0] || {};
      const previousRow = previous.get(table);
      const dbRowCount = Number(stats.row_count || 0);
      const rowCount =
        previousRow && !allowRowCountDecrease ? Math.max(Number(previousRow.rowCount || 0), dbRowCount) : dbRowCount;
      rows.push({
        table,
        rowCount,
        rowCountApproximate: true,
        firstTs: previousRow && !allowRowCountDecrease ? this.olderTs(previousRow.firstTs, stats.first_ts) : stats.first_ts,
        lastTs: previousRow && !allowRowCountDecrease ? this.newerTs(previousRow.lastTs, stats.last_ts) : stats.last_ts,
        totalBytes: Number(sizeResult.rows[0].total_bytes),
        updatedAt: new Date(),
      });
    }
    this.adminStatsCache = rows;
    this.adminStatsCacheAt = now;
    return this.cloneAdminStats(this.adminStatsCache);
  }

  async adminLatestRows(table, limit, deviceId = '', onlineTtlMs = DEFAULT_ONLINE_TTL_MS, options = {}) {
    const meta = requireAdminTable(table);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const from = options.from || null;
    const to = options.to || null;
    const order = options.order === 'asc' ? 'ASC' : 'DESC';
    if (table === 'devices') {
      const rows = await this.adminDevices(onlineTtlMs);
      const filtered = rows.filter((row) => {
        const ts = row[meta.timeColumn] ? new Date(row[meta.timeColumn]).getTime() : null;
        if (from && (!Number.isFinite(ts) || ts < new Date(from).getTime())) return false;
        if (to && (!Number.isFinite(ts) || ts > new Date(to).getTime())) return false;
        return true;
      });
      filtered.sort((a, b) => {
        const left = new Date(a[meta.orderColumn] || 0).getTime();
        const right = new Date(b[meta.orderColumn] || 0).getTime();
        return order === 'ASC' ? left - right : right - left;
      });
      return filtered.slice(offset, offset + safeLimit).map((row) => ({
        id: row.id,
        name: row.name,
        effective_status: row.effective_status,
        database_status: row.database_status,
        online: row.online,
        last_active_at: row.last_active_at,
        last_seen_at: row.last_seen_at,
        last_data_at: row.last_data_at,
        inactive_seconds: row.inactive_seconds,
        fft_rows: row.fft_rows,
        created_at: row.created_at,
      }));
    }
    const columns =
      table === 'fft_spectrum'
          ? `ts, device_id, seq, channel_id, sample_rate, fft_size, bin_hz,
             spectrum_codec, spectrum_scale, spectrum_len,
             octet_length(spectrum_db) AS compressed_bytes, created_at`
        : table === 'fft_summary'
          ? `ts, device_id, seq, channel_id,
             NULLIF(channel_values->>'CH01', '')::double precision AS ch01_pressure,
             NULLIF(channel_values->>'CH02', '')::double precision AS ch02_pressure,
             NULLIF(channel_values->>'CH03', '')::double precision AS ch03_pressure,
             NULLIF(channel_values->>'CH04', '')::double precision AS ch04_pressure,
             NULLIF(channel_values->>'CH05', '')::double precision AS ch05_temp,
             NULLIF(channel_values->>'CH06', '')::double precision AS ch06_temp,
             NULLIF(channel_values->>'CH07', '')::double precision AS ch07_displacement,
             NULLIF(channel_values->>'CH08', '')::double precision AS ch08_displacement,
             NULLIF(channel_values->>'F01', '')::double precision AS f01_flow,
             CASE
               WHEN channel_values ? 'F02_4um' THEN concat_ws(
                 ' / ',
                 channel_values->>'F02_4um',
                 channel_values->>'F02_6um',
                 channel_values->>'F02_14um'
               )
               WHEN channel_values ? 'F02' THEN concat_ws(
                 ' / ',
                 round(NULLIF(channel_values->>'F02', '')::double precision)::int::text,
                 GREATEST(0, round(NULLIF(channel_values->>'F02', '')::double precision)::int - 2)::text,
                 GREATEST(0, round(NULLIF(channel_values->>'F02', '')::double precision)::int - 5)::text
               )
               ELSE NULL
             END AS f02_iso,
             NULLIF(channel_values->>'V01', '')::double precision AS v01_speed,
             NULLIF(channel_values->>'V02', '')::double precision AS v02_vibration,
             NULLIF(channel_values->>'S01', '')::double precision AS s01_sound,
             rms, peak, main_freq, main_amp_db,
             sample_rate, fft_size, bin_hz,
             bpfi_db, bpfo_db, created_at`
        : '*';
    const params = [safeLimit, offset];
    const whereParts = [];
    if (deviceId && table !== 'devices') {
      params.push(deviceId);
      whereParts.push(`device_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      whereParts.push(`${meta.timeColumn} >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      whereParts.push(`${meta.timeColumn} <= $${params.length}`);
    }
    const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT ${columns} FROM ${table} ${where} ORDER BY ${meta.orderColumn} ${order} LIMIT $1 OFFSET $2`,
      params,
    );
    return rows;
  }

  async adminCountRows(table, deviceId = '', onlineTtlMs = DEFAULT_ONLINE_TTL_MS, options = {}) {
    const meta = requireAdminTable(table);
    const from = options.from || null;
    const to = options.to || null;
    if (table === 'devices') {
      const rows = await this.adminDevices(onlineTtlMs);
      return rows.filter((row) => {
        if (deviceId && row.id !== deviceId) return false;
        const ts = row[meta.timeColumn] ? new Date(row[meta.timeColumn]).getTime() : null;
        if (from && (!Number.isFinite(ts) || ts < new Date(from).getTime())) return false;
        if (to && (!Number.isFinite(ts) || ts > new Date(to).getTime())) return false;
        return true;
      }).length;
    }

    const params = [];
    const whereParts = [];
    if (deviceId) {
      params.push(deviceId);
      whereParts.push(`device_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      whereParts.push(`${meta.timeColumn} >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      whereParts.push(`${meta.timeColumn} <= $${params.length}`);
    }
    const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const { rows } = await this.pool.query(`SELECT count(*)::bigint AS count FROM ${table} ${where}`, params);
    return Number(rows[0]?.count || 0);
  }

  async adminRunReadOnly(sql) {
    const safeSql = normalizeReadOnlySql(sql);
    const firstWord = safeSql.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
    const querySql = firstWord === 'explain' ? safeSql : `SELECT * FROM (${safeSql}) AS admin_query LIMIT 500`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const result = await client.query(querySql);
      await client.query('COMMIT');
      return {
        command: result.command,
        rowCount: result.rowCount,
        fields: result.fields.map((field) => field.name),
        rows: result.rows.slice(0, 500),
        truncated: result.rows.length > 500,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async adminDeleteBefore(table, before) {
    const meta = requireAdminTable(table);
    if (table === 'devices') {
      throw new Error('Deleting devices from the admin page is not allowed');
    }
    const cutoff = new Date(before);
    if (Number.isNaN(cutoff.getTime())) {
      throw new Error('Invalid before timestamp');
    }
    const { rowCount } = await this.pool.query(
      `DELETE FROM ${table} WHERE ${meta.timeColumn} < $1`,
      [cutoff],
    );
    this.touchAdminTable(table, { rowDelta: -rowCount });
    await this.adminTableStats({ force: true, allowRowCountDecrease: true });
    if (table === 'fft_summary') await this.ensureDeviceFftRows({ force: true });
    return rowCount;
  }
}

module.exports = {
  HmasDatabase,
  hashSecret,
  ADMIN_TABLES,
  normalizeReadOnlySql,
  encodeSpectrumDb,
  decodeSpectrumDb,
};
