import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DiagnosisMeasurements, RuleEngineSummary } from '@/types/diagnostic'
import type { ConditionBaseline, DeviceStaticProfile, DeviationReport } from '@/types/deviceProfile'

// ── Store mocks ───────────────────────────────────────────────────────────────
// Explicit factories so the real store modules (which pull in Web Workers,
// localStorage and window.crypto at runtime) are never imported in the node
// test environment. `vi.hoisted` lets the factories reference these objects.
const m = vi.hoisted(() => {
  const staticProfile = {
    deviceId: 'PUMP-01',
    brand: 'Bosch',
    model: 'A10VSO',
    installedAt: '2020-01-01',
    ratedRpm: 1480,
    ratedFlowLpm: 50,
    ratedPressureBar: 280,
    oilTempMinC: 40,
    oilTempMaxC: 65,
    mountingOrientation: 'horizontal',
    environment: 'indoor',
    notes: '',
    bearings: [],
  }
  return {
    profile: {
      aiConfig: { enabled: true, model: 'claude-sonnet-4-6' },
      staticProfile,
      getCurrentConditionKey: vi.fn(),
      getActiveBaseline: vi.fn(),
      computeDeviation: vi.fn(),
      getApiKeyPlaintext: vi.fn(),
      isOverBudget: vi.fn(),
      addSpend: vi.fn(),
    },
    log: {
      getHistorySummaryText: vi.fn(),
      createEvent: vi.fn(),
      markAiError: vi.fn(),
      patchAiResult: vi.fn(),
      abortCompression: vi.fn(),
      patchCompression: vi.fn(),
    },
    dsp: { fftResult: null },
    acq: { channelValues: {} as Record<string, number> },
    bearing: { bearings: [] as unknown[] },
  }
})

vi.mock(
  '@/stores/deviceProfile',
  () =>
    ({
      useDeviceProfileStore: () => m.profile,
    }) as unknown as typeof import('@/stores/deviceProfile'),
)
vi.mock(
  '@/stores/diagnosticLog',
  () =>
    ({ useDiagnosticLogStore: () => m.log }) as unknown as typeof import('@/stores/diagnosticLog'),
)
vi.mock(
  '@/stores/dspCompute',
  () => ({ useDspComputeStore: () => m.dsp }) as unknown as typeof import('@/stores/dspCompute'),
)
vi.mock(
  '@/stores/acquisition',
  () => ({ useAcquisitionStore: () => m.acq }) as unknown as typeof import('@/stores/acquisition'),
)
vi.mock(
  '@/stores/bearingModel',
  () =>
    ({
      useBearingModelStore: () => m.bearing,
    }) as unknown as typeof import('@/stores/bearingModel'),
)

import {
  estimateCostUsd,
  ampDbAt,
  parseResult,
  buildPrompt,
  runDiagnosis,
  compressHistory,
  testConnection,
  useAIDiagnosis,
} from '@/composables/useAIDiagnosis'

// ── SSE response helpers ──────────────────────────────────────────────────────
function makeStreamResponse(events: unknown[]): Response {
  const enc = new TextEncoder()
  const lines = [...events.map((e) => `data: ${JSON.stringify(e)}\n`), 'data: [DONE]\n']
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < lines.length) controller.enqueue(enc.encode(lines[i++]))
      else controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: stream,
    text: () => Promise.resolve(''),
  } as unknown as Response
}

function diagnosisStream(jsonChunks: string[], inputTokens = 100, outputTokens = 50): Response {
  return makeStreamResponse([
    { type: 'message_start', message: { usage: { input_tokens: inputTokens } } },
    ...jsonChunks.map((text) => ({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
    })),
    { type: 'message_delta', usage: { output_tokens: outputTokens } },
  ])
}

const VALID_JSON = JSON.stringify({
  fault_type: '外圈剥落',
  severity: 'warning',
  confidence: 'medium',
  evidence: ['BPFO 峰值升高 8dB'],
  recommendation: '安排停机检查外圈',
  recheck_interval_days: 30,
  stop_machine: false,
  explanation: 'BPFO 谐波明显，疑似外圈早期剥落',
})

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers (no store / network)
// ──────────────────────────────────────────────────────────────────────────────
describe('estimateCostUsd', () => {
  it('uses per-model pricing for a known model', () => {
    // haiku-4-5: in 0.8, out 4 → (1M*0.8 + 1M*4) / 1M = 4.8
    expect(estimateCostUsd('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)).toBeCloseTo(4.8, 6)
  })

  it('falls back to default pricing for an unknown model', () => {
    // default in 3 / out 15 → 3 + 15 = 18
    expect(estimateCostUsd('some-future-model', 1_000_000, 1_000_000)).toBeCloseTo(18, 6)
  })

  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('claude-sonnet-4-6', 0, 0)).toBe(0)
  })
})

describe('ampDbAt', () => {
  const freqs = new Float32Array([0, 10, 20, 30])
  const mags = new Float32Array([-50, -10, -30, -40])

  it('returns -120 for non-positive target frequency', () => {
    expect(ampDbAt(mags, freqs, 0)).toBe(-120)
    expect(ampDbAt(mags, freqs, -5)).toBe(-120)
  })

  it('returns -120 for an empty spectrum', () => {
    expect(ampDbAt(new Float32Array(0), new Float32Array(0), 10)).toBe(-120)
  })

  it('returns the amplitude of the nearest frequency bin', () => {
    expect(ampDbAt(mags, freqs, 11)).toBe(-10) // nearest 10 Hz
    expect(ampDbAt(mags, freqs, 19)).toBe(-30) // nearest 20 Hz
    expect(ampDbAt(mags, freqs, 20)).toBe(-30) // exact
  })
})

describe('parseResult', () => {
  it('extracts a JSON object embedded in surrounding prose', () => {
    const raw = `Sure, here is the diagnosis:\n${VALID_JSON}\nHope that helps.`
    const r = parseResult(raw, 'claude-sonnet-4-6', 100, 50)
    expect(r.fault_type).toBe('外圈剥落')
    expect(r.severity).toBe('warning')
    expect(r.confidence).toBe('medium')
    expect(r.evidence).toEqual(['BPFO 峰值升高 8dB'])
    expect(r.recheck_interval_days).toBe(30)
    expect(r.stop_machine).toBe(false)
  })

  it('attaches model/token/cost metadata and preserves the raw text', () => {
    const r = parseResult(VALID_JSON, 'claude-sonnet-4-6', 100, 50)
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.promptTokens).toBe(100)
    expect(r.completionTokens).toBe(50)
    expect(r.costUsd).toBeCloseTo((100 * 3 + 50 * 15) / 1_000_000, 9)
    expect(r.rawJson).toBe(VALID_JSON)
    expect(() => new Date(r.generatedAt).toISOString()).not.toThrow()
  })

  it('throws when the response contains no JSON object', () => {
    expect(() => parseResult('no json here', 'claude-sonnet-4-6', 0, 0)).toThrow(/no JSON/)
  })

  it('throws when required fields are missing', () => {
    expect(() =>
      parseResult(JSON.stringify({ severity: 'warning' }), 'claude-sonnet-4-6', 0, 0),
    ).toThrow(/missing required fields/)
    expect(() =>
      parseResult(JSON.stringify({ fault_type: 'x' }), 'claude-sonnet-4-6', 0, 0),
    ).toThrow(/missing required fields/)
  })

  it('applies safe defaults for missing/invalid optional fields', () => {
    const raw = JSON.stringify({
      fault_type: 'unknown',
      explanation: 'n/a',
      evidence: 'not-an-array',
      recommendation: 123,
      recheck_interval_days: 'soon',
      stop_machine: 1,
    })
    const r = parseResult(raw, 'claude-sonnet-4-6', 0, 0)
    expect(r.severity).toBe('normal')
    expect(r.confidence).toBe('low')
    expect(r.evidence).toEqual([])
    expect(r.recommendation).toBe('')
    expect(r.recheck_interval_days).toBeNull()
    expect(r.stop_machine).toBe(true) // Boolean(1)
  })
})

describe('buildPrompt', () => {
  const staticProfile: DeviceStaticProfile = {
    deviceId: 'PUMP-07',
    brand: 'Rexroth',
    model: 'A4VSO',
    installedAt: '2019-05-01',
    ratedRpm: 1500,
    ratedFlowLpm: 63,
    ratedPressureBar: 315,
    oilTempMinC: 40,
    oilTempMaxC: 70,
    mountingOrientation: 'horizontal',
    environment: 'plant',
    notes: '高温环境',
    bearings: [
      {
        position: 'DE',
        modelNumber: '6308',
        ballDiamMm: 15,
        pitchDiamMm: 65,
        ballCount: 8,
        contactAngleDeg: 0,
        installedAt: '2023-01-01',
      },
    ],
  }

  function meas(overrides: Partial<DiagnosisMeasurements> = {}): DiagnosisMeasurements {
    return {
      rmsG: 1.23,
      rmsVsBaselinePct: null,
      peakG: 4.5,
      crestFactor: 3.6,
      bpfiAmplitudeDb: -40,
      bpfiVsBaselineDb: null,
      bpfoAmplitudeDb: -35,
      bpfoVsBaselineDb: null,
      bsfAmplitudeDb: -50,
      bsfVsBaselineDb: null,
      ftfAmplitudeDb: -60,
      ftfVsBaselineDb: null,
      pressurePulsationRmsBar: null,
      oilTempC: 55,
      rpmActual: 1490,
      pressureBar: 250,
      rmsTrend7d: null,
      ...overrides,
    }
  }

  const ruleEngine: RuleEngineSummary = {
    overallSeverity: 'warning',
    findings: [{ faultType: 'BPFO', severity: 'warning', snrDb: 14.2 }],
  }

  it('system prompt pins the strict JSON output contract', () => {
    const { systemPrompt } = buildPrompt(staticProfile, null, null, meas(), ruleEngine, '')
    expect(systemPrompt).toContain('ONLY a JSON object')
    for (const field of [
      'fault_type',
      'severity',
      'confidence',
      'evidence',
      'recommendation',
      'recheck_interval_days',
      'stop_machine',
      'explanation',
    ]) {
      expect(systemPrompt).toContain(field)
    }
  })

  it('user prompt embeds device profile, measurements and bearing specs', () => {
    const { userPrompt } = buildPrompt(staticProfile, null, null, meas(), ruleEngine, '')
    expect(userPrompt).toContain('PUMP-07')
    expect(userPrompt).toContain('Rexroth A4VSO')
    expect(userPrompt).toContain('1500 rpm')
    expect(userPrompt).toContain('1490 rpm') // measured
    expect(userPrompt).toContain('DE 6308')
    expect(userPrompt).toContain('BPFO: warning (SNR 14.2 dB)')
    expect(userPrompt.trim().endsWith('请基于以上信息给出 JSON 诊断结果。')).toBe(true)
  })

  it('marks an un-established baseline when deviation is null', () => {
    const { userPrompt } = buildPrompt(staticProfile, null, null, meas(), ruleEngine, '')
    expect(userPrompt).toContain('尚未建立此工况基线')
    expect(userPrompt).not.toContain('## 基线参考')
  })

  it('renders baseline deltas and a stale-baseline warning', () => {
    const baseline: ConditionBaseline = {
      conditionKey: 'MID_NOMINAL',
      capturedAt: '2021-01-15T00:00:00.000Z',
      rpmActual: 1490,
      pressureBar: 250,
      oilTempC: 55,
      rmsG: 1.0,
      peakG: 3.0,
      crestFactor: 3.0,
      bpfiAmplitudeDb: -48,
      bpfoAmplitudeDb: -43,
      bsfAmplitudeDb: -55,
      ftfAmplitudeDb: -65,
      pressurePulsationRmsBar: 0,
      note: '',
      captureCount: 30,
    }
    const deviation: DeviationReport = {
      rmsVsBaselinePct: 23,
      bpfiVsBaselineDb: 8,
      bpfoVsBaselineDb: 8,
      bsfVsBaselineDb: 5,
      ftfVsBaselineDb: 5,
      baselineAgeDays: 800,
    }
    const { userPrompt } = buildPrompt(
      staticProfile,
      baseline,
      deviation,
      meas({ rmsVsBaselinePct: 23, bpfoVsBaselineDb: 8 }),
      ruleEngine,
      '',
    )
    expect(userPrompt).toContain('## 基线参考')
    expect(userPrompt).toContain('基线偏差 +23.0%')
    expect(userPrompt).toContain('Δ+8.0dB')
    expect(userPrompt).toContain('基线已超过 2 年')
  })

  it('includes the device-history section only when a summary is provided', () => {
    const withHistory = buildPrompt(staticProfile, null, null, meas(), ruleEngine, '历史摘要内容')
    expect(withHistory.userPrompt).toContain('## 设备历史摘要')
    expect(withHistory.userPrompt).toContain('历史摘要内容')

    const noHistory = buildPrompt(staticProfile, null, null, meas(), ruleEngine, '   ')
    expect(noHistory.userPrompt).not.toContain('## 设备历史摘要')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Orchestration: runDiagnosis / compressHistory / testConnection
// ──────────────────────────────────────────────────────────────────────────────
describe('runDiagnosis orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.profile.aiConfig.enabled = true
    m.profile.aiConfig.model = 'claude-sonnet-4-6'
    m.profile.getCurrentConditionKey.mockReturnValue('MID_NOMINAL')
    m.profile.getActiveBaseline.mockReturnValue(null)
    m.profile.computeDeviation.mockReturnValue(null)
    m.profile.getApiKeyPlaintext.mockResolvedValue('sk-test')
    m.profile.isOverBudget.mockReturnValue(false)
    m.log.getHistorySummaryText.mockReturnValue('')
    m.log.createEvent.mockReturnValue({ id: 'evt-1' })
    m.dsp.fftResult = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs the happy path: calls Claude, parses, records spend and patches the event', async () => {
    // Split across two deltas to also exercise SSE chunk reassembly.
    const mid = Math.floor(VALID_JSON.length / 2)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(diagnosisStream([VALID_JSON.slice(0, mid), VALID_JSON.slice(mid)]))
    vi.stubGlobal('fetch', fetchMock)

    const event = await runDiagnosis('manual')

    expect(event).toEqual({ id: 'evt-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect(
      (init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access'],
    ).toBe('true')

    expect(m.log.createEvent).toHaveBeenCalledWith(
      'manual',
      'MID_NOMINAL',
      expect.any(Object),
      expect.any(Object),
      undefined,
    )
    expect(m.profile.addSpend).toHaveBeenCalledWith(expect.any(Number))
    expect(m.profile.addSpend.mock.calls[0][0]).toBeGreaterThan(0)
    expect(m.log.patchAiResult).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({
        fault_type: '外圈剥落',
        severity: 'warning',
        model: 'claude-sonnet-4-6',
      }),
    )
  })

  it('skips the API and shows a preview when AI is disabled', async () => {
    m.profile.aiConfig.enabled = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const event = await runDiagnosis('manual')
    const ai = useAIDiagnosis()

    expect(event).toEqual({ id: 'evt-1' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.log.markAiError).toHaveBeenCalledWith('evt-1')
    expect(ai.lastError.value).toContain('AI 未启用')
    expect(ai.streamBuffer.value).toContain('=== System Prompt ===')
  })

  it('skips the API when no key is configured', async () => {
    m.profile.getApiKeyPlaintext.mockResolvedValue('')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const event = await runDiagnosis('manual')
    const ai = useAIDiagnosis()

    expect(event).toEqual({ id: 'evt-1' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.log.markAiError).toHaveBeenCalledWith('evt-1')
    expect(ai.lastError.value).toContain('API Key 未配置')
  })

  it('blocks a non-manual trigger when over budget', async () => {
    m.profile.isOverBudget.mockReturnValue(true)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const event = await runDiagnosis('alarm', 'alarm-42')
    const ai = useAIDiagnosis()

    expect(event).toEqual({ id: 'evt-1' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.log.markAiError).toHaveBeenCalledWith('evt-1')
    expect(ai.lastError.value).toContain('月度预算')
    // relatedAlarmEventId is forwarded to createEvent
    expect(m.log.createEvent).toHaveBeenCalledWith(
      'alarm',
      'MID_NOMINAL',
      expect.any(Object),
      expect.any(Object),
      'alarm-42',
    )
  })

  it('still calls the API for a manual trigger even when over budget', async () => {
    m.profile.isOverBudget.mockReturnValue(true)
    const fetchMock = vi.fn().mockResolvedValue(diagnosisStream([VALID_JSON]))
    vi.stubGlobal('fetch', fetchMock)

    await runDiagnosis('manual')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null and records lastError when the response has no JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(diagnosisStream(['this is not json at all']))
    vi.stubGlobal('fetch', fetchMock)

    const event = await runDiagnosis('manual')
    const ai = useAIDiagnosis()

    expect(event).toBeNull()
    expect(m.log.createEvent).toHaveBeenCalledTimes(1)
    expect(m.log.patchAiResult).not.toHaveBeenCalled()
    expect(m.profile.addSpend).not.toHaveBeenCalled()
    expect(ai.lastError.value).toMatch(/no JSON/)
  })

  it('is re-entrancy guarded: a concurrent call returns null', async () => {
    let release: (v: string) => void = () => {}
    m.profile.getApiKeyPlaintext.mockReturnValue(
      new Promise<string>((r) => {
        release = r
      }),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(diagnosisStream([VALID_JSON])))

    const p1 = runDiagnosis('manual') // suspends at getApiKeyPlaintext, isRunning = true
    const second = await runDiagnosis('manual') // guarded → null
    expect(second).toBeNull()

    release('sk-test')
    await p1 // let the first call drain so isRunning resets for later tests
  })
})

describe('compressHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.profile.aiConfig.enabled = true
    m.profile.aiConfig.model = 'claude-sonnet-4-6'
    m.profile.getApiKeyPlaintext.mockResolvedValue('sk-test')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const sampleEvents = [
    {
      id: 'e1',
      timestamp: '2026-01-01T00:00:00.000Z',
      conditionKey: 'MID_NOMINAL',
      aiDiagnosis: null,
      outcome: null,
    },
  ] as unknown as Parameters<typeof compressHistory>[0]

  it('aborts when AI is disabled', async () => {
    m.profile.aiConfig.enabled = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await compressHistory(sampleEvents, null)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.log.abortCompression).toHaveBeenCalledTimes(1)
  })

  it('aborts when there are no events', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await compressHistory([], null)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.log.abortCompression).toHaveBeenCalledTimes(1)
  })

  it('patches the trimmed summary and records spend on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(diagnosisStream(['  设备反复出现 BPFO，更换轴承后恢复正常  ']))
    vi.stubGlobal('fetch', fetchMock)

    await compressHistory(sampleEvents, '旧摘要')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(m.log.patchCompression).toHaveBeenCalledWith('设备反复出现 BPFO，更换轴承后恢复正常', [
      'e1',
    ])
    expect(m.profile.addSpend).toHaveBeenCalledWith(expect.any(Number))
  })

  it('aborts compression when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await compressHistory(sampleEvents, null)
    expect(m.log.abortCompression).toHaveBeenCalledTimes(1)
    expect(m.log.patchCompression).not.toHaveBeenCalled()
  })
})

describe('testConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when the API responds OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))
    expect(await testConnection('sk-test', 'claude-sonnet-4-6')).toBe(true)
  })

  it('returns false on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))
    expect(await testConnection('sk-test', 'claude-sonnet-4-6')).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    expect(await testConnection('sk-test', 'claude-sonnet-4-6')).toBe(false)
  })
})
