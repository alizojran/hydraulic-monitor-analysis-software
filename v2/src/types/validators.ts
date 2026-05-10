import type { SampleFrame } from './channel'
import type { AlarmRule } from './alarm'
import { CHANNEL_DEFS } from '@/config/channels'

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/**
 * Parse and validate a raw WebSocket frame object into a typed SampleFrame.
 * Returns null if the object is missing required fields or has no valid channels.
 */
export function parseChannelFrame(raw: unknown): SampleFrame | null {
  if (raw === null || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!isFiniteNumber(obj.ts) || typeof obj.ch !== 'object' || obj.ch === null) return null

  const chObj = obj.ch as Record<string, unknown>
  const channels = new Map<string, number>()
  for (const def of CHANNEL_DEFS) {
    const v = chObj[def.id]
    if (isFiniteNumber(v)) channels.set(def.id, v)
  }
  return channels.size > 0 ? { timestamp: obj.ts, channels } : null
}

/**
 * Validate that a raw object has the required shape to be an AlarmRule.
 * Returns null if validation fails.
 */
export function parseAlarmRule(raw: unknown): AlarmRule | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.id !== 'string' ||
    typeof r.channelId !== 'string' ||
    typeof r.metric !== 'string' ||
    typeof r.operator !== 'string' ||
    !isFiniteNumber(r.threshold) ||
    typeof r.severity !== 'string' ||
    typeof r.enabled !== 'boolean' ||
    typeof r.label !== 'string'
  )
    return null

  return r as unknown as AlarmRule
}
