export function computeRms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

export function computePeak(samples: Float32Array): number {
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > max) max = abs
  }
  return max
}

export function computeCrestFactor(samples: Float32Array): number {
  const rms = computeRms(samples)
  if (rms === 0) return 0
  return computePeak(samples) / rms
}

export function computeTHD(magnitudeLinear: Float32Array, f0Bin: number, harmonics = 5): number {
  if (f0Bin <= 0 || f0Bin >= magnitudeLinear.length) return 0
  const f0Power = magnitudeLinear[f0Bin] * magnitudeLinear[f0Bin]
  if (f0Power === 0) return 0
  let harmonicPower = 0
  for (let h = 2; h <= harmonics; h++) {
    const bin = f0Bin * h
    if (bin < magnitudeLinear.length) {
      harmonicPower += magnitudeLinear[bin] * magnitudeLinear[bin]
    }
  }
  return Math.sqrt(harmonicPower / f0Power)
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

export function linearToDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -120
}
