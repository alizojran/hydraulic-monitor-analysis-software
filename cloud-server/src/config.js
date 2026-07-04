const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const DEFAULTS = {
  HOST: '0.0.0.0',
  TCP_PORT: '9100',
  HTTP_PORT: '8080',
  CORS_ORIGIN: '*',
  TCP_MAX_FRAME_BYTES: String(1024 * 1024),
  TCP_IDLE_TIMEOUT_MS: '15000',
  DEVICE_ONLINE_TTL_MS: '5000',
  HTTP_HISTORY_LIMIT: '10000',
  SIMULATOR_ENABLED: 'false',
  SIMULATOR_INTERVAL_MS: '1000',
  ADMIN_TOKEN: '',
  SERVE_ADMIN_PAGE: 'false',
};

function env(name) {
  return process.env[name] ?? DEFAULTS[name];
}

function intEnv(name) {
  const n = Number(env(name));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${name}: ${env(name)}`);
  return Math.floor(n);
}

module.exports = {
  host: env('HOST'),
  tcpPort: intEnv('TCP_PORT'),
  httpPort: intEnv('HTTP_PORT'),
  corsOrigin: env('CORS_ORIGIN'),
  databaseUrl: process.env.DATABASE_URL ?? '',
  deviceId: process.env.DEVICE_ID ?? '',
  deviceSecret: process.env.DEVICE_SECRET ?? '',
  maxFrameBytes: intEnv('TCP_MAX_FRAME_BYTES'),
  tcpIdleTimeoutMs: intEnv('TCP_IDLE_TIMEOUT_MS'),
  deviceOnlineTtlMs: intEnv('DEVICE_ONLINE_TTL_MS'),
  historyLimit: intEnv('HTTP_HISTORY_LIMIT'),
  simulatorEnabled: env('SIMULATOR_ENABLED') === 'true',
  simulatorIntervalMs: intEnv('SIMULATOR_INTERVAL_MS'),
  adminToken: env('ADMIN_TOKEN'),
  serveAdminPage: env('SERVE_ADMIN_PAGE') === 'true',
};
