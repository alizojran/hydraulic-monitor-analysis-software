const { TextDecoder } = require('node:util');

const decoder = new TextDecoder();
const BINARY_FFT_MAGIC = Buffer.from('HMF1', 'ascii');
const BINARY_FFT_VERSION = 1;
const BINARY_FFT_HEADER_BYTES = 148;
const BINARY_FFT_CHANNEL_BYTES = 16;
const BINARY_FFT_SCALE = 10;
const CHANNEL_VALUE_IDS = [
  'CH01',
  'CH02',
  'CH03',
  'CH04',
  'CH05',
  'CH06',
  'CH07',
  'CH08',
  'F01',
  'F02',
  'V01',
  'V02',
  'S01',
];

function encodeFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return encodeTcpPayload(body);
}

function encodeTcpPayload(body) {
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function encodeBinaryFftPayload(msg) {
  const spectrumDb = Array.isArray(msg.spectrumDb) ? msg.spectrumDb : [];
  const binCount = spectrumDb.length;
  const payload = Buffer.alloc(BINARY_FFT_HEADER_BYTES + binCount * 2);
  const sampleRate = Math.round(finiteNumber(msg.sampleRate, 10000));
  const fftSize = Math.round(finiteNumber(msg.fftSize, binCount * 2 || 2048));
  const channelId = String(msg.channelId || '').slice(0, BINARY_FFT_CHANNEL_BYTES);
  const ts = normalizeTimestamp(msg.ts).getTime();
  const bearing = msg.bearing && typeof msg.bearing === 'object' ? msg.bearing : {};
  const ch = msg.ch && typeof msg.ch === 'object' ? msg.ch : {};

  BINARY_FFT_MAGIC.copy(payload, 0);
  payload.writeUInt8(BINARY_FFT_VERSION, 4);
  payload.writeUInt8(Buffer.byteLength(channelId, 'ascii'), 5);
  payload.writeUInt16LE(0, 6);
  payload.writeUInt32LE(Number.isFinite(Number(msg.seq)) ? Number(msg.seq) >>> 0 : 0, 8);
  payload.writeBigUInt64LE(BigInt(Math.max(0, Math.round(ts))), 12);
  payload.writeUInt32LE(sampleRate >>> 0, 20);
  payload.writeUInt16LE(Math.max(0, Math.min(65535, fftSize)), 24);
  payload.writeUInt16LE(Math.max(0, Math.min(65535, binCount)), 26);
  payload.writeInt16LE(BINARY_FFT_SCALE, 28);
  payload.writeInt16LE(0, 30);
  payload.writeFloatLE(finiteNumber(msg.rms, Number.NaN), 32);
  payload.writeFloatLE(finiteNumber(msg.peak, finiteNumber(msg.peakValue, Number.NaN)), 36);
  payload.writeFloatLE(finiteNumber(msg.crestFactor, Number.NaN), 40);
  payload.writeFloatLE(finiteNumber(msg.thd, 0), 44);
  payload.writeFloatLE(finiteNumber(bearing.bpfiHz, finiteNumber(msg.bpfiHz, Number.NaN)), 48);
  payload.writeFloatLE(finiteNumber(bearing.bpfiDb, finiteNumber(msg.bpfiDb, Number.NaN)), 52);
  payload.writeFloatLE(finiteNumber(bearing.bpfoHz, finiteNumber(msg.bpfoHz, Number.NaN)), 56);
  payload.writeFloatLE(finiteNumber(bearing.bpfoDb, finiteNumber(msg.bpfoDb, Number.NaN)), 60);
  payload.writeFloatLE(finiteNumber(bearing.bsfHz, finiteNumber(msg.bsfHz, Number.NaN)), 64);
  payload.writeFloatLE(finiteNumber(bearing.bsfDb, finiteNumber(msg.bsfDb, Number.NaN)), 68);
  payload.writeFloatLE(finiteNumber(bearing.ftfHz, finiteNumber(msg.ftfHz, Number.NaN)), 72);
  payload.writeFloatLE(finiteNumber(bearing.ftfDb, finiteNumber(msg.ftfDb, Number.NaN)), 76);
  payload.write(channelId, 80, BINARY_FFT_CHANNEL_BYTES, 'ascii');

  for (let i = 0; i < CHANNEL_VALUE_IDS.length; i++) {
    payload.writeFloatLE(finiteNumber(ch[CHANNEL_VALUE_IDS[i]], Number.NaN), 96 + i * 4);
  }

  for (let i = 0; i < binCount; i++) {
    const db = finiteNumber(spectrumDb[i], -120);
    const q = Math.max(-32768, Math.min(32767, Math.round(db * BINARY_FFT_SCALE)));
    payload.writeInt16LE(q, BINARY_FFT_HEADER_BYTES + i * 2);
  }

  return payload;
}

function encodeBinaryFftFrame(msg) {
  return encodeTcpPayload(encodeBinaryFftPayload(msg));
}

class FrameDecoder {
  constructor(maxFrameBytes) {
    this.maxFrameBytes = maxFrameBytes;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];

    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (len <= 0 || len > this.maxFrameBytes) {
        throw new Error(`Invalid TCP frame length: ${len}`);
      }
      if (this.buffer.length < 4 + len) break;

      const body = this.buffer.subarray(4, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      frames.push(decodeTcpPayload(body));
    }

    return frames;
  }
}

function decodeTcpPayload(body) {
  if (body.length >= BINARY_FFT_MAGIC.length && body.subarray(0, 4).equals(BINARY_FFT_MAGIC)) {
    return decodeBinaryFftPayload(body);
  }
  const text = decoder.decode(body);
  return JSON.parse(text);
}

function normalizeTimestamp(ts) {
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts > 10_000_000_000 ? ts : ts * 1000);
  }
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function finiteNumber(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function topPeaksFromSpectrum(spectrumDb, binHz, count = 8) {
  const peaks = [];
  for (let i = 1; i < spectrumDb.length - 1; i++) {
    const v = spectrumDb[i];
    if (v > spectrumDb[i - 1] && v > spectrumDb[i + 1] && v > -70) {
      peaks.push({
        frequency: i * binHz,
        amplitudeDb: v,
        binIndex: i,
      });
    }
  }
  peaks.sort((a, b) => b.amplitudeDb - a.amplitudeDb);
  return peaks.slice(0, count).map((peak, idx) => ({ ...peak, rank: idx + 1 }));
}

function readNullableFloatLE(buffer, offset) {
  return nullableNumber(buffer.readFloatLE(offset));
}

function decodeChannelId(body, len) {
  const safeLen = len > 0 && len <= BINARY_FFT_CHANNEL_BYTES ? len : BINARY_FFT_CHANNEL_BYTES;
  const raw = body.subarray(80, 80 + safeLen);
  const nul = raw.indexOf(0);
  return raw.subarray(0, nul >= 0 ? nul : raw.length).toString('ascii').trim();
}

function decodeBinaryFftPayload(body) {
  if (body.length < BINARY_FFT_HEADER_BYTES) {
    throw new Error(`Binary FFT frame too short: ${body.length}`);
  }
  const version = body.readUInt8(4);
  if (version !== BINARY_FFT_VERSION) {
    throw new Error(`Unsupported binary FFT version: ${version}`);
  }

  const channelId = decodeChannelId(body, body.readUInt8(5));
  const seq = body.readUInt32LE(8);
  const tsMs = Number(body.readBigUInt64LE(12));
  const sampleRate = body.readUInt32LE(20);
  const fftSize = body.readUInt16LE(24);
  const binCount = body.readUInt16LE(26);
  const scale = body.readInt16LE(28) || BINARY_FFT_SCALE;
  const expectedBytes = BINARY_FFT_HEADER_BYTES + binCount * 2;
  if (!channelId || !sampleRate || !fftSize || !binCount) {
    throw new Error('Binary FFT frame missing channelId/sampleRate/fftSize/binCount');
  }
  if (body.length !== expectedBytes) {
    throw new Error(`Binary FFT length mismatch: got ${body.length}, expected ${expectedBytes}`);
  }

  const binHz = sampleRate / fftSize;
  const bearing = {
    bpfiHz: readNullableFloatLE(body, 48),
    bpfiDb: readNullableFloatLE(body, 52),
    bpfoHz: readNullableFloatLE(body, 56),
    bpfoDb: readNullableFloatLE(body, 60),
    bsfHz: readNullableFloatLE(body, 64),
    bsfDb: readNullableFloatLE(body, 68),
    ftfHz: readNullableFloatLE(body, 72),
    ftfDb: readNullableFloatLE(body, 76),
  };
  for (const key of Object.keys(bearing)) {
    if (bearing[key] === null) delete bearing[key];
  }

  const ch = {};
  for (let i = 0; i < CHANNEL_VALUE_IDS.length; i++) {
    const v = readNullableFloatLE(body, 96 + i * 4);
    if (v !== null) ch[CHANNEL_VALUE_IDS[i]] = v;
  }

  const spectrumDb = new Array(binCount);
  for (let i = 0; i < binCount; i++) {
    spectrumDb[i] = body.readInt16LE(BINARY_FFT_HEADER_BYTES + i * 2) / scale;
  }
  const peaks = topPeaksFromSpectrum(spectrumDb, binHz);
  const main = peaks[0] ?? null;

  return {
    type: 'fft_i16',
    seq,
    ts: tsMs > 0 ? new Date(tsMs) : new Date(),
    channelId,
    sampleRate,
    fftSize,
    binHz,
    rms: readNullableFloatLE(body, 32),
    peak: readNullableFloatLE(body, 36),
    crestFactor: readNullableFloatLE(body, 40),
    thd: finiteNumber(body.readFloatLE(44), 0),
    mainFreq: main?.frequency ?? null,
    mainAmpDb: main?.amplitudeDb ?? null,
    peaks,
    bearing,
    bpfiHz: bearing.bpfiHz ?? null,
    bpfiDb: bearing.bpfiDb ?? null,
    bpfoHz: bearing.bpfoHz ?? null,
    bpfoDb: bearing.bpfoDb ?? null,
    bsfHz: bearing.bsfHz ?? null,
    bsfDb: bearing.bsfDb ?? null,
    ftfHz: bearing.ftfHz ?? null,
    ftfDb: bearing.ftfDb ?? null,
    spectrumDb,
    ch,
  };
}

function normalizePeak(p, idx, binHz) {
  const frequency = finiteNumber(p.frequency, finiteNumber(p.f, null));
  const amplitudeDb = finiteNumber(p.amplitudeDb, finiteNumber(p.db, null));
  if (frequency === null || amplitudeDb === null) return null;
  return {
    frequency,
    amplitudeDb,
    binIndex: Number.isInteger(p.binIndex) ? p.binIndex : Math.round(frequency / binHz),
    rank: idx + 1,
  };
}

function validateHello(msg) {
  if (msg.type !== 'hello') return false;
  return typeof msg.deviceId === 'string' && typeof msg.secret === 'string';
}

function normalizeFft(msg) {
  if (msg.type !== 'fft') throw new Error('Not an fft message');
  const deviceId = String(msg.deviceId ?? '');
  const channelId = String(msg.channelId ?? '');
  const sampleRate = finiteNumber(msg.sampleRate, null);
  const fftSize = finiteNumber(msg.fftSize, null);
  const binHz = finiteNumber(msg.binHz, sampleRate && fftSize ? sampleRate / fftSize : null);
  if (!deviceId || !channelId || !sampleRate || !fftSize || !binHz) {
    throw new Error('FFT message missing required deviceId/channelId/sampleRate/fftSize/binHz');
  }

  const peaks = Array.isArray(msg.peaks)
    ? msg.peaks.map((p, idx) => normalizePeak(p, idx, binHz)).filter(Boolean)
    : [];

  const bearing = msg.bearing && typeof msg.bearing === 'object' ? msg.bearing : {};
  const firstPeak = peaks[0] ?? null;

  return {
    type: 'fft',
    deviceId,
    seq: Number.isFinite(Number(msg.seq)) ? Number(msg.seq) : null,
    ts: normalizeTimestamp(msg.ts),
    channelId,
    sampleRate: Math.round(sampleRate),
    fftSize: Math.round(fftSize),
    binHz,
    rms: finiteNumber(msg.rms, null),
    peak: finiteNumber(msg.peak, finiteNumber(msg.peakValue, null)),
    crestFactor: finiteNumber(msg.crestFactor, null),
    thd: finiteNumber(msg.thd, 0),
    mainFreq: firstPeak?.frequency ?? null,
    mainAmpDb: firstPeak?.amplitudeDb ?? null,
    peaks,
    bearing,
    bpfiHz: finiteNumber(bearing.bpfiHz, finiteNumber(bearing.bpfi, null)),
    bpfiDb: finiteNumber(bearing.bpfiDb, null),
    bpfoHz: finiteNumber(bearing.bpfoHz, finiteNumber(bearing.bpfo, null)),
    bpfoDb: finiteNumber(bearing.bpfoDb, null),
    bsfHz: finiteNumber(bearing.bsfHz, finiteNumber(bearing.bsf, null)),
    bsfDb: finiteNumber(bearing.bsfDb, null),
    ftfHz: finiteNumber(bearing.ftfHz, finiteNumber(bearing.ftf, null)),
    ftfDb: finiteNumber(bearing.ftfDb, null),
    spectrumDb: Array.isArray(msg.spectrumDb) ? msg.spectrumDb.map((v) => finiteNumber(v, -120)) : null,
    ch: msg.ch && typeof msg.ch === 'object' ? msg.ch : null,
  };
}

function normalizeAlarm(msg) {
  if (msg.type !== 'alarm') throw new Error('Not an alarm message');
  return {
    type: 'alarm',
    deviceId: String(msg.deviceId ?? ''),
    seq: Number.isFinite(Number(msg.seq)) ? Number(msg.seq) : null,
    ts: normalizeTimestamp(msg.ts),
    channelId: typeof msg.channelId === 'string' ? msg.channelId : null,
    severity: typeof msg.severity === 'string' ? msg.severity : 'info',
    message: typeof msg.message === 'string' ? msg.message : '',
    payload: msg,
  };
}

module.exports = {
  BINARY_FFT_HEADER_BYTES,
  BINARY_FFT_MAGIC,
  BINARY_FFT_SCALE,
  CHANNEL_VALUE_IDS,
  FrameDecoder,
  encodeFrame,
  encodeBinaryFftFrame,
  encodeBinaryFftPayload,
  decodeBinaryFftPayload,
  normalizeTimestamp,
  validateHello,
  normalizeFft,
  normalizeAlarm,
};
