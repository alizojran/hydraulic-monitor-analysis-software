const net = require('node:net');
const config = require('./config');
const { encodeBinaryFftFrame, encodeFrame, FrameDecoder } = require('./protocol');

const host = process.argv[2] || '127.0.0.1';
const port = Number(process.argv[3] || config.tcpPort);
const deviceId = process.env.DEVICE_ID || config.deviceId || 'HMAS-001';
const secret = process.env.DEVICE_SECRET || config.deviceSecret || 'change-this-device-secret';
const decoder = new FrameDecoder(1024 * 1024);

function spectrum() {
  const arr = [];
  for (let i = 0; i < 1024; i++) {
    const f = (i * 10000) / 2048;
    const peak = Math.exp(-((f - 50) ** 2) / 800) * 58;
    arr.push(-90 + peak + Math.random() * 4);
  }
  return arr;
}

const socket = net.createConnection({ host, port }, () => {
  socket.write(encodeFrame({ v: 1, type: 'hello', deviceId, secret, ts: Date.now() }));
});

socket.on('data', (chunk) => {
  for (const frame of decoder.push(chunk)) {
    console.log('[server]', frame);
    if (frame.type === 'hello_ack') {
      socket.write(
        encodeBinaryFftFrame({
          v: 1,
          type: 'fft_i16',
          deviceId,
          seq: 1,
          ts: Date.now(),
          channelId: 'V02',
          sampleRate: 10000,
          fftSize: 2048,
          binHz: 10000 / 2048,
          rms: 0.42,
          peak: 1.16,
          crestFactor: 2.76,
          thd: 0.03,
          peaks: [
            { f: 50.0, db: -31.4 },
            { f: 149.9, db: -42.8 },
          ],
          bearing: { bpfiHz: 135.2, bpfiDb: -45.1, bpfoHz: 89.7, bpfoDb: -52.4 },
          ch: { V01: 1485, V02: 0.42, CH01: 231.2, CH05: 56.8 },
          spectrumDb: spectrum(),
        }),
      );
      setTimeout(() => socket.end(), 500);
    }
  }
});

socket.on('error', (err) => {
  console.error(err);
  process.exitCode = 1;
});
