const config = require('./config');
const { HmasDatabase } = require('./db');

async function main() {
  const deviceId = process.argv[2] || config.deviceId;
  const secret = process.argv[3] || config.deviceSecret;
  if (!deviceId || !secret) {
    throw new Error('Provide DEVICE_ID and DEVICE_SECRET, or run: npm run register-device -- HMAS-001 secret');
  }
  const db = new HmasDatabase(config.databaseUrl);
  await db.registerDevice(deviceId, secret, deviceId);
  await db.close();
  console.log(`Registered device ${deviceId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
