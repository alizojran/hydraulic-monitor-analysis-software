const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { URL } = require('node:url');
const { WebSocketServer } = require('ws');

const config = require('./config');
const { HmasDatabase } = require('./db');
const {
  FrameDecoder,
  encodeFrame,
  normalizeAlarm,
  validateHello,
} = require('./protocol');
const { CloudSimulator } = require('./simulator');

const db = new HmasDatabase(config.databaseUrl);
const liveClients = new Set();
const lastActiveWrites = new Map();
let simulator = null;
const adminPagePath = path.resolve(__dirname, '..', 'public', 'admin.html');
const v2BasePath = '/hydraulic-monitor-analysis-software';
const v2StaticPath = path.resolve(__dirname, '..', 'public', 'hydraulic-monitor-analysis-software');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'access-control-allow-origin': config.corsOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-admin-token',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function html(res, status, body) {
  const data = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  res.end(data);
}

function file(res, filePath) {
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === '.html';
  res.writeHead(200, {
    'content-type': contentTypes[ext] || 'application/octet-stream',
    'content-length': data.length,
    'cache-control': isHtml ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  res.end(data);
}

function redirect(res, location) {
  res.writeHead(302, {
    location,
    'cache-control': 'no-store',
  });
  res.end();
}

function serveV2(url, res) {
  if (url.pathname === v2BasePath) {
    redirect(res, `${v2BasePath}/${url.search || ''}`);
    return true;
  }
  if (!url.pathname.startsWith(`${v2BasePath}/`)) return false;
  if (!fs.existsSync(v2StaticPath)) {
    json(res, 404, { error: 'v2 app is not deployed' });
    return true;
  }

  let relativePath = url.pathname.slice(v2BasePath.length + 1);
  try {
    relativePath = decodeURIComponent(relativePath);
  } catch {
    json(res, 400, { error: 'invalid path' });
    return true;
  }
  const normalized = path.normalize(relativePath || 'index.html');
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    json(res, 400, { error: 'invalid path' });
    return true;
  }
  const candidate = path.resolve(v2StaticPath, normalized);
  const rootWithSep = `${v2StaticPath}${path.sep}`;
  if (candidate !== v2StaticPath && !candidate.startsWith(rootWithSep)) {
    json(res, 400, { error: 'invalid path' });
    return true;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    file(res, candidate);
    return true;
  }
  const indexPath = path.join(v2StaticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    file(res, indexPath);
    return true;
  }
  json(res, 404, { error: 'v2 app index not found' });
  return true;
}

function getAdminToken(req, url) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (req.headers['x-admin-token']) return String(req.headers['x-admin-token']).trim();
  return url.searchParams.get('token') || '';
}

function isTokenMatch(actual, expected) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req, res, url) {
  if (!config.adminToken) {
    json(res, 503, { error: 'ADMIN_TOKEN is not configured on the server' });
    return false;
  }
  if (!isTokenMatch(getAdminToken(req, url), config.adminToken)) {
    json(res, 401, { error: 'admin token required' });
    return false;
  }
  return true;
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return config.historyLimit;
  return Math.min(Math.floor(n), config.historyLimit);
}

function parseDateParam(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowToLiveFft(row, spectrumDb = null) {
  return {
    type: 'fft',
    deviceId: row.device_id,
    seq: row.seq,
    ts: new Date(row.ts).getTime(),
    channelId: row.channel_id,
    sampleRate: row.sample_rate,
    fftSize: row.fft_size,
    binHz: row.bin_hz,
    rms: row.rms,
    peak: row.peak,
    crestFactor: row.crest_factor,
    thd: row.thd ?? 0,
    mainFreq: row.main_freq,
    mainAmpDb: row.main_amp_db,
    peaks: row.peaks ?? [],
    bearing: row.bearing ?? {},
    ch: row.channel_values ?? {},
    spectrumDb,
  };
}

function publicFftMessage(msg) {
  return {
    type: 'fft',
    deviceId: msg.deviceId,
    seq: msg.seq,
    ts: msg.ts.getTime(),
    channelId: msg.channelId,
    sampleRate: msg.sampleRate,
    fftSize: msg.fftSize,
    binHz: msg.binHz,
    rms: msg.rms,
    peak: msg.peak,
    crestFactor: msg.crestFactor,
    thd: msg.thd,
    mainFreq: msg.mainFreq,
    mainAmpDb: msg.mainAmpDb,
    peaks: msg.peaks,
    bearing: msg.bearing,
    spectrumDb: msg.spectrumDb,
    ch: msg.ch,
  };
}

function broadcast(payload) {
  const text = JSON.stringify(payload);
  for (const client of liveClients) {
    if (client.ws.readyState !== client.ws.OPEN) continue;
    if (client.deviceId && payload.deviceId && client.deviceId !== payload.deviceId) continue;
    client.ws.send(text);
  }
}

async function handleFftMessage(msg) {
  await markDeviceActive(msg.deviceId);
  await db.insertFft(msg);
  broadcast(publicFftMessage(msg));
}

async function markDeviceActive(deviceId) {
  if (!deviceId) return;
  const now = Date.now();
  const minIntervalMs = Math.max(1000, Math.floor(config.deviceOnlineTtlMs / 2));
  if (now - (lastActiveWrites.get(deviceId) || 0) < minIntervalMs) return;
  lastActiveWrites.set(deviceId, now);
  await db.markOnline(deviceId);
}

const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/health') {
      json(res, 200, {
        ok: true,
        ts: Date.now(),
        simulator: simulator ? simulator.status() : { enabled: false },
      });
      return;
    }

    if (url.pathname === '/' || url.pathname === '/admin') {
      if (!config.serveAdminPage) {
        json(res, 404, { error: 'admin page is disabled on cloud server; use local-admin/index.html' });
        return;
      }
      if (!fs.existsSync(adminPagePath)) {
        json(res, 404, { error: 'admin page not found' });
        return;
      }
      html(res, 200, fs.readFileSync(adminPagePath, 'utf8'));
      return;
    }

    if (serveV2(url, res)) {
      return;
    }

    if (url.pathname === '/api/admin/status') {
      if (!requireAdmin(req, res, url)) return;
      const status = await db.adminStatus(config.deviceOnlineTtlMs);
      json(res, 200, {
        ok: true,
        ts: Date.now(),
        service: {
          httpPort: config.httpPort,
          tcpPort: config.tcpPort,
          deviceId: config.deviceId,
          liveClients: liveClients.size,
          onlineDevices: status.onlineDevices,
          onlineTtlMs: config.deviceOnlineTtlMs,
          tcpIdleTimeoutMs: config.tcpIdleTimeoutMs,
        },
        simulator: simulator ? simulator.status() : { enabled: false },
        database: status,
      });
      return;
    }

    if (url.pathname === '/api/admin/devices') {
      if (!requireAdmin(req, res, url)) return;
      json(res, 200, { devices: await db.adminDevices(config.deviceOnlineTtlMs) });
      return;
    }

    if (url.pathname === '/api/admin/tables') {
      if (!requireAdmin(req, res, url)) return;
      json(res, 200, { tables: await db.adminTableStats() });
      return;
    }

    if (url.pathname === '/api/admin/latest') {
      if (!requireAdmin(req, res, url)) return;
      const table = url.searchParams.get('table') || 'fft_summary';
      const limit = parseLimit(url.searchParams.get('limit'));
      const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
      const deviceId = url.searchParams.get('deviceId') || '';
      const from = parseDateParam(url.searchParams.get('from'));
      const to = parseDateParam(url.searchParams.get('to'));
      const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
      json(res, 200, {
        table,
        deviceId,
        offset,
        rows: await db.adminLatestRows(table, limit, deviceId, config.deviceOnlineTtlMs, { offset, from, to, order }),
      });
      return;
    }

    if (url.pathname === '/api/admin/count') {
      if (!requireAdmin(req, res, url)) return;
      const table = url.searchParams.get('table') || 'fft_summary';
      const deviceId = url.searchParams.get('deviceId') || '';
      const from = parseDateParam(url.searchParams.get('from'));
      const to = parseDateParam(url.searchParams.get('to'));
      json(res, 200, {
        table,
        deviceId,
        count: await db.adminCountRows(table, deviceId, config.deviceOnlineTtlMs, { from, to }),
      });
      return;
    }

    if (url.pathname === '/api/admin/query') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method not allowed' });
        return;
      }
      if (!requireAdmin(req, res, url)) return;
      const body = await readJsonBody(req);
      json(res, 200, await db.adminRunReadOnly(body.sql));
      return;
    }

    if (url.pathname === '/api/admin/delete-before') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method not allowed' });
        return;
      }
      if (!requireAdmin(req, res, url)) return;
      const body = await readJsonBody(req);
      const deleted = await db.adminDeleteBefore(body.table, body.before);
      json(res, 200, { table: body.table, before: body.before, deleted });
      return;
    }

    if (url.pathname === '/api/admin/simulator/start') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method not allowed' });
        return;
      }
      if (!requireAdmin(req, res, url)) return;
      ensureSimulator().start();
      json(res, 200, ensureSimulator().status());
      return;
    }

    if (url.pathname === '/api/admin/simulator/stop') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method not allowed' });
        return;
      }
      if (!requireAdmin(req, res, url)) return;
      if (simulator) simulator.stop();
      json(res, 200, simulator ? simulator.status() : { enabled: false });
      return;
    }

    if (url.pathname === '/api/simulator/status') {
      json(res, 200, simulator ? simulator.status() : { enabled: false });
      return;
    }

    if (url.pathname === '/api/simulator/start') {
      ensureSimulator().start();
      json(res, 200, ensureSimulator().status());
      return;
    }

    if (url.pathname === '/api/simulator/stop') {
      if (simulator) simulator.stop();
      json(res, 200, simulator ? simulator.status() : { enabled: false });
      return;
    }

    if (url.pathname === '/api/latest') {
      const deviceId = url.searchParams.get('deviceId') || config.deviceId;
      if (!deviceId) {
        json(res, 400, { error: 'deviceId is required' });
        return;
      }
      const rows = await db.latest(deviceId);
      json(res, 200, { deviceId, rows: rows.map((row) => rowToLiveFft(row)) });
      return;
    }

    if (url.pathname === '/api/history') {
      const deviceId = url.searchParams.get('deviceId') || config.deviceId;
      const channelId = url.searchParams.get('channelId');
      if (!deviceId) {
        json(res, 400, { error: 'deviceId is required' });
        return;
      }
      const rows = await db.history({
        deviceId,
        channelId,
        from: parseDateParam(url.searchParams.get('from')),
        to: parseDateParam(url.searchParams.get('to')),
        limit: parseLimit(url.searchParams.get('limit')),
      });
      json(res, 200, { deviceId, rows: rows.map((row) => rowToLiveFft(row)) });
      return;
    }

    if (url.pathname === '/api/spectrum') {
      const deviceId = url.searchParams.get('deviceId') || config.deviceId;
      const channelId = url.searchParams.get('channelId');
      if (!deviceId) {
        json(res, 400, { error: 'deviceId is required' });
        return;
      }
      const rows = await db.spectrum({
        deviceId,
        channelId,
        from: parseDateParam(url.searchParams.get('from')),
        to: parseDateParam(url.searchParams.get('to')),
        limit: parseLimit(url.searchParams.get('limit')),
      });
      json(res, 200, { deviceId, rows });
      return;
    }

    if (url.pathname === '/api/alarms') {
      const deviceId = url.searchParams.get('deviceId') || config.deviceId;
      if (!deviceId) {
        json(res, 400, { error: 'deviceId is required' });
        return;
      }
      const rows = await db.alarms({ deviceId, limit: parseLimit(url.searchParams.get('limit')) });
      json(res, 200, { deviceId, rows });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[http]', err);
    json(res, 500, { error: String(err.message || err) });
  }
});

const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const client = { ws, deviceId: url.searchParams.get('deviceId') || '' };
  liveClients.add(client);
  ws.send(JSON.stringify({ type: 'status', status: 'connected', ts: Date.now() }));
  ws.on('close', () => liveClients.delete(client));
});

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws/live') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function sendAck(socket, seq, status = 'ok') {
  if (seq === null || seq === undefined) return;
  socket.write(encodeFrame({ v: 1, type: 'ack', seq, status, ts: Date.now() }));
}

function startTcpServer() {
  const server = net.createServer((socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    const decoder = new FrameDecoder(config.maxFrameBytes);
    let authedDeviceId = '';

    socket.setKeepAlive(true, 30_000);
    socket.setTimeout(config.tcpIdleTimeoutMs, () => {
      socket.destroy(new Error('TCP idle timeout'));
    });
    socket.on('error', (err) => {
      console.error('[tcp]', remoteAddr, err.message || err);
    });
    socket.on('data', async (chunk) => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          if (!authedDeviceId) {
            if (!validateHello(frame)) {
              socket.write(encodeFrame({ v: 1, type: 'error', error: 'hello required' }));
              socket.destroy();
              return;
            }
            const ok = await db.authenticateDevice(frame.deviceId, frame.secret);
            if (!ok) {
              await db.logIngest(frame.deviceId, remoteAddr, 'auth_failed');
              socket.write(encodeFrame({ v: 1, type: 'error', error: 'auth failed' }));
              socket.destroy();
              return;
            }
            authedDeviceId = frame.deviceId;
            await markDeviceActive(authedDeviceId);
            await db.logIngest(authedDeviceId, remoteAddr, 'connected');
            socket.write(encodeFrame({ v: 1, type: 'hello_ack', deviceId: authedDeviceId, ts: Date.now() }));
            broadcast({ type: 'device_status', deviceId: authedDeviceId, status: 'online', ts: Date.now() });
            continue;
          }

          if (frame.deviceId && frame.deviceId !== authedDeviceId) {
            socket.write(encodeFrame({ v: 1, type: 'error', error: 'deviceId mismatch' }));
            continue;
          }

          if (frame.type === 'heartbeat') {
            await markDeviceActive(authedDeviceId);
            sendAck(socket, frame.seq);
            broadcast({ type: 'heartbeat', deviceId: authedDeviceId, ts: Date.now(), payload: frame });
          } else if (frame.type === 'fft_i16') {
            const msg = { ...frame, deviceId: authedDeviceId };
            await handleFftMessage(msg);
            sendAck(socket, msg.seq);
          } else if (frame.type === 'alarm') {
            const msg = normalizeAlarm({ ...frame, deviceId: authedDeviceId });
            await db.insertAlarm(msg);
            sendAck(socket, msg.seq);
            broadcast({
              type: 'alarm',
              deviceId: msg.deviceId,
              seq: msg.seq,
              ts: msg.ts.getTime(),
              channelId: msg.channelId,
              severity: msg.severity,
              message: msg.message,
              payload: msg.payload,
            });
          } else {
            socket.write(encodeFrame({ v: 1, type: 'error', error: `unsupported type ${frame.type}` }));
          }
        }
      } catch (err) {
        console.error('[tcp]', remoteAddr, err);
        await db.logIngest(authedDeviceId, remoteAddr, 'error', String(err.message || err)).catch(() => {});
        socket.write(encodeFrame({ v: 1, type: 'error', error: String(err.message || err) }));
        socket.destroy();
      }
    });

    socket.on('close', async () => {
      if (authedDeviceId) {
        await db.markOffline(authedDeviceId).catch(() => {});
        await db.logIngest(authedDeviceId, remoteAddr, 'disconnected').catch(() => {});
        broadcast({ type: 'device_status', deviceId: authedDeviceId, status: 'offline', ts: Date.now() });
      }
    });
  });

  server.listen(config.tcpPort, config.host, () => {
    console.log(`[tcp] listening on ${config.host}:${config.tcpPort}`);
  });
  return server;
}

function startPresenceMonitor() {
  const intervalMs = Math.max(1000, Math.min(config.deviceOnlineTtlMs, 5000));
  setInterval(async () => {
    try {
      const staleIds = await db.markStaleOffline(config.deviceOnlineTtlMs);
      for (const deviceId of staleIds) {
        lastActiveWrites.delete(deviceId);
        broadcast({ type: 'device_status', deviceId, status: 'offline', ts: Date.now() });
      }
    } catch (err) {
      console.error('[presence]', err);
    }
  }, intervalMs).unref();
}

function ensureSimulator() {
  if (!simulator) {
    simulator = new CloudSimulator({
      db,
      onFft: handleFftMessage,
      deviceId: config.deviceId || 'HMAS-001',
      intervalMs: config.simulatorIntervalMs,
    });
  }
  return simulator;
}

async function bootstrapDevice() {
  if (!config.deviceId || !config.deviceSecret) return;
  await db.registerDevice(config.deviceId, config.deviceSecret, config.deviceId);
  console.log(`[db] bootstrap device ready: ${config.deviceId}`);
}

async function main() {
  await bootstrapDevice();
  startTcpServer();
  startPresenceMonitor();
  if (config.simulatorEnabled) {
    ensureSimulator().start();
    console.log(`[simulator] started for ${config.deviceId}`);
  }
  httpServer.listen(config.httpPort, config.host, () => {
    console.log(`[http] listening on http://${config.host}:${config.httpPort}`);
    console.log(`[ws] live endpoint ws://${config.host}:${config.httpPort}/ws/live`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
