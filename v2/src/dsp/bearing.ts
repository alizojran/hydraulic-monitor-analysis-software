import type { BearingGeometry, BearingParams } from '@/types/dsp'

export function computeBearingFrequencies(params: BearingParams): BearingGeometry {
  const { rpmHz, ballCount, pitchDiamMm, ballDiamMm, contactAngleDeg } = params
  const cos_a = Math.cos((contactAngleDeg * Math.PI) / 180)
  const ratio = (ballDiamMm / pitchDiamMm) * cos_a

  return {
    bpfi: (ballCount / 2) * rpmHz * (1 + ratio),
    bpfo: (ballCount / 2) * rpmHz * (1 - ratio),
    bsf: (pitchDiamMm / (2 * ballDiamMm)) * rpmHz * (1 - ratio * ratio),
    ftf: 0.5 * rpmHz * (1 - ratio),
  }
}
