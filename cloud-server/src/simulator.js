const { decodeBinaryFftPayload, encodeBinaryFftPayload } = require('./protocol');

function harmonicSpectrum({ fftSize, sampleRate, peaks, floorDb = -92 }) {
  const halfN = fftSize / 2;
  const binHz = sampleRate / fftSize;
  const out = new Array(halfN);
  for (let i = 0; i < halfN; i++) {
    const f = i * binHz;
    let db = floorDb + Math.random() * 3;
    for (const peak of peaks) {
      const width = peak.widthHz ?? 12;
      const lift = peak.liftDb ?? 45;
      db += Math.exp(-((f - peak.f) ** 2) / (2 * width * width)) * lift;
    }
    out[i] = Math.max(-120, Math.min(0, db));
  }
  return out;
}

function topPeaksFromSpectrum(spectrumDb, binHz, count = 8) {
  const peaks = [];
  for (let i = 1; i < spectrumDb.length - 1; i++) {
    const v = spectrumDb[i];
    if (v > spectrumDb[i - 1] && v > spectrumDb[i + 1] && v > -70) {
      peaks.push({ f: i * binHz, db: v });
    }
  }
  peaks.sort((a, b) => b.db - a.db);
  return peaks.slice(0, count);
}

class CloudSimulator {
  constructor({ db, onFft, deviceId, intervalMs }) {
    this.db = db;
    this.onFft = onFft;
    this.deviceId = deviceId;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.seq = Math.floor(Date.now() / 1000);
    this.t0 = Date.now();
  }

  start() {
    if (this.timer) return;
    void this.db.markOnline(this.deviceId).catch((err) => console.error('[simulator]', err));
    this.timer = setInterval(() => {
      void this.tick().catch((err) => console.error('[simulator]', err));
    }, this.intervalMs);
    void this.tick().catch((err) => console.error('[simulator]', err));
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    void this.db.markOffline(this.deviceId).catch((err) => console.error('[simulator]', err));
  }

  status() {
    return { enabled: Boolean(this.timer), intervalMs: this.intervalMs, deviceId: this.deviceId };
  }

  async tick() {
    const elapsed = (Date.now() - this.t0) / 1000;
    const rpm = 1500 + Math.sin(elapsed * 0.17) * 35 + (Math.random() - 0.5) * 4;
    const shaftHz = rpm / 60;
    const pressure = 220 + Math.sin(elapsed * 0.07) * 18 + Math.sin(elapsed * 1.3) * 1.5;
    const temp = 56 + Math.sin(elapsed * 0.025) * 3;
    const iso4um = 18 + (Math.sin(elapsed * 0.04) > 0.85 ? 1 : 0);
    const ch = {
      CH01: pressure,
      CH02: pressure * 0.9 + 3,
      CH03: pressure * 0.82 - 2,
      CH04: 14 + Math.sin(elapsed * 0.11) * 0.4,
      CH05: temp,
      CH06: temp + 11 + Math.sin(elapsed * 0.04) * 1.5,
      CH07: 25 + Math.sin(elapsed * 0.18) * 8,
      CH08: 18 + Math.sin(elapsed * 0.21 + 1) * 4,
      F01: 122 + Math.sin(elapsed * 0.09) * 6,
      F02: iso4um,
      F02_4um: iso4um,
      F02_6um: Math.max(0, iso4um - 2),
      F02_14um: Math.max(0, iso4um - 5),
      V01: rpm,
      V02: 0.4,
      S01: 72,
    };

    const vib = this.makeFft({
      channelId: 'V02',
      rms: 0.38 + Math.sin(elapsed * 0.15) * 0.04,
      peak: 1.1 + Math.sin(elapsed * 0.18) * 0.12,
      crestFactor: 2.7,
      peaks: [
        { f: shaftHz, widthHz: 4, liftDb: 35 },
        { f: shaftHz * 2, widthHz: 5, liftDb: 50 },
        { f: shaftHz * 6, widthHz: 10, liftDb: 28 },
        { f: 135.2, widthHz: 6, liftDb: 22 + Math.sin(elapsed * 0.08) * 5 },
      ],
      ch,
      bearing: {
        bpfiHz: 135.2,
        bpfiDb: -43 + Math.sin(elapsed * 0.08) * 3,
        bpfoHz: 89.7,
        bpfoDb: -51,
        bsfHz: 58.4,
        bsfDb: -49,
        ftfHz: 9.9,
        ftfDb: -62,
      },
    });
    ch.V02 = vib.rms;

    const acoustic = this.makeFft({
      channelId: 'S01',
      rms: 71 + Math.sin(elapsed * 0.1) * 2,
      peak: 76 + Math.sin(elapsed * 0.14) * 2,
      crestFactor: 1.2,
      peaks: [
        { f: 1000 + Math.sin(elapsed * 0.04) * 80, widthHz: 80, liftDb: 42 },
        { f: 1800, widthHz: 120, liftDb: 30 },
        { f: shaftHz * 9, widthHz: 25, liftDb: 24 },
      ],
      ch,
      bearing: {},
      floorDb: -86,
    });
    ch.S01 = acoustic.rms;

    for (const msg of [vib, acoustic]) {
      const binaryPayload = encodeBinaryFftPayload(msg);
      const parsed = decodeBinaryFftPayload(binaryPayload);
      await this.onFft({ ...parsed, deviceId: this.deviceId });
    }
  }

  makeFft({ channelId, rms, peak, crestFactor, peaks, ch, bearing, floorDb = -92 }) {
    const sampleRate = 10000;
    const fftSize = 2048;
    const binHz = sampleRate / fftSize;
    const spectrumDb = harmonicSpectrum({ fftSize, sampleRate, peaks, floorDb });
    const topPeaks = topPeaksFromSpectrum(spectrumDb, binHz);
    const main = topPeaks[0] ?? { f: 0, db: -120 };
    return {
      type: 'fft',
      deviceId: this.deviceId,
      seq: ++this.seq,
      ts: new Date(),
      channelId,
      sampleRate,
      fftSize,
      binHz,
      rms,
      peak,
      crestFactor,
      thd: 0.02 + Math.random() * 0.02,
      mainFreq: main.f,
      mainAmpDb: main.db,
      peaks: topPeaks.map((p, idx) => ({
        frequency: p.f,
        amplitudeDb: p.db,
        binIndex: Math.round(p.f / binHz),
        rank: idx + 1,
      })),
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
}

module.exports = { CloudSimulator };
