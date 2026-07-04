import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useDspComputeStore } from '@/stores/dspCompute'
import type { CloudAlarmMessage, CloudFftMessage, CloudLiveMessage } from '@/types/cloud'
import type { FftResult, PeakInfo } from '@/types/dsp'
import type { SampleFrame } from '@/types/channel'
import { CHANNEL_DEFS } from '@/config/channels'

export type CloudStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const CLOUD_BASE_KEY = 'hmas-cloud-base-url'
const CLOUD_DEVICE_KEY = 'hmas-cloud-device-id'

function defaultCloudBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) return window.location.origin
  return 'http://localhost:8080'
}

function finiteNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function normalizeTs(ts: number | string | undefined): number {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts > 10_000_000_000 ? ts : ts * 1000
  if (typeof ts === 'string') {
    const t = new Date(ts).getTime()
    if (Number.isFinite(t)) return t
  }
  return Date.now()
}

function normalizePeaks(msg: CloudFftMessage): PeakInfo[] {
  const binHz = finiteNumber(msg.binHz, 1)
  return (msg.peaks ?? [])
    .map((p) => {
      const frequency = finiteNumber(p.frequency, finiteNumber(p.f, NaN))
      const amplitudeDb = finiteNumber(p.amplitudeDb, finiteNumber(p.db, NaN))
      if (!Number.isFinite(frequency) || !Number.isFinite(amplitudeDb)) return null
      return {
        frequency,
        amplitudeDb,
        binIndex: Number.isInteger(p.binIndex) ? Number(p.binIndex) : Math.round(frequency / binHz),
      }
    })
    .filter((p): p is PeakInfo => p !== null)
}

function normalizeFftSize(size: number): 512 | 1024 | 2048 | 4096 | 8192 {
  return size === 512 || size === 1024 || size === 4096 || size === 8192 ? size : 2048
}

function cloudToFftResult(msg: CloudFftMessage): FftResult {
  const fftSize = normalizeFftSize(Math.floor(finiteNumber(msg.fftSize, 2048)))
  const sampleRate = finiteNumber(msg.sampleRate, 10000)
  const binHz = finiteNumber(msg.binHz, sampleRate / fftSize)
  const halfN = Math.floor(fftSize / 2)
  const magnitudeDb = new Float32Array(halfN)
  const source = msg.spectrumDb ?? []
  for (let i = 0; i < halfN; i++) magnitudeDb[i] = finiteNumber(source[i], -120)
  const magnitudeLinear = new Float32Array(halfN)
  const frequencies = new Float32Array(halfN)
  for (let i = 0; i < halfN; i++) {
    frequencies[i] = i * binHz
    magnitudeLinear[i] = 10 ** (magnitudeDb[i] / 20)
  }
  return {
    magnitudeDb,
    magnitudeLinear,
    frequencies,
    binHz,
    peaks: normalizePeaks(msg),
    thd: finiteNumber(msg.thd, 0),
    rms: finiteNumber(msg.rms, 0),
    peakValue: finiteNumber(msg.peakValue, finiteNumber(msg.peak, 0)),
    crestFactor: finiteNumber(msg.crestFactor, 0),
  }
}

function frameFromCloud(msg: CloudFftMessage): SampleFrame {
  const ts = normalizeTs(msg.ts)
  const values = new Map<string, number>()
  const ch = msg.ch ?? {}
  for (const def of CHANNEL_DEFS) {
    const v = ch[def.id]
    if (typeof v === 'number' && Number.isFinite(v)) values.set(def.id, v)
  }
  if (msg.channelId === 'V02') {
    values.set('V02', finiteNumber(msg.rms, values.get('V02') ?? 0))
  }
  if (msg.channelId === 'S01') {
    values.set('S01', finiteNumber(msg.rms, values.get('S01') ?? 0))
  }
  return { timestamp: ts, channels: values }
}

function toWsUrl(baseUrl: string, deviceId: string): string {
  const u = new URL(baseUrl)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/ws/live'
  u.search = ''
  u.searchParams.set('deviceId', deviceId)
  return u.toString()
}

export const useCloudStore = defineStore('cloud', () => {
  const baseUrl = ref(localStorage.getItem(CLOUD_BASE_KEY) ?? defaultCloudBaseUrl())
  const deviceId = ref(localStorage.getItem(CLOUD_DEVICE_KEY) ?? 'HMAS-001')
  const status = ref<CloudStatus>('disconnected')
  const errorMsg = ref('')
  const framesReceived = ref(0)
  const latestFft = shallowRef<CloudFftMessage | null>(null)
  const alarms = ref<CloudAlarmMessage[]>([])

  const acq = useAcquisitionStore()
  const dsp = useDspComputeStore()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectTries = 0
  let intentionalClose = false

  const wsUrl = computed(() => toWsUrl(baseUrl.value, deviceId.value))

  function setBaseUrl(url: string) {
    baseUrl.value = url.replace(/\/+$/, '')
    localStorage.setItem(CLOUD_BASE_KEY, baseUrl.value)
  }

  function setDeviceId(id: string) {
    deviceId.value = id
    localStorage.setItem(CLOUD_DEVICE_KEY, id)
  }

  function applyFft(msg: CloudFftMessage) {
    latestFft.value = msg
    framesReceived.value++
    acq.setSampleRate(msg.sampleRate)
    if (msg.channelId === dsp.selectedChannelId && msg.spectrumDb?.length) {
      dsp.setFftConfig({ sampleRate: msg.sampleRate, fftSize: normalizeFftSize(msg.fftSize) })
      dsp.setFftResult(cloudToFftResult(msg))
    }
    const frame = frameFromCloud(msg)
    if (frame.channels.size > 0) acq.pushFrame(frame)
  }

  function handleMessage(raw: string) {
    const msg = JSON.parse(raw) as CloudLiveMessage
    if (msg.type === 'fft') {
      applyFft(msg)
    } else if (msg.type === 'alarm') {
      alarms.value = [msg, ...alarms.value].slice(0, 200)
    }
  }

  async function loadLatest() {
    const u = new URL('/api/latest', baseUrl.value)
    u.searchParams.set('deviceId', deviceId.value)
    const resp = await fetch(u)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as { rows?: CloudFftMessage[] }
    for (const row of data.rows ?? []) applyFft(row)
  }

  async function fetchHistory(params: { channelId?: string; from?: string; to?: string; limit?: number } = {}) {
    const u = new URL('/api/history', baseUrl.value)
    u.searchParams.set('deviceId', deviceId.value)
    if (params.channelId) u.searchParams.set('channelId', params.channelId)
    if (params.from) u.searchParams.set('from', params.from)
    if (params.to) u.searchParams.set('to', params.to)
    if (params.limit) u.searchParams.set('limit', String(params.limit))
    const resp = await fetch(u)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return (await resp.json()) as { deviceId: string; rows: CloudFftMessage[] }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (intentionalClose) return
    const delay = Math.min(30_000, 1000 * 2 ** reconnectTries)
    reconnectTries++
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    if (status.value === 'connected' || status.value === 'connecting') return
    intentionalClose = false
    clearReconnect()
    status.value = 'connecting'
    errorMsg.value = ''
    try {
      ws = new WebSocket(wsUrl.value)
      ws.onopen = () => {
        reconnectTries = 0
        status.value = 'connected'
        acq.setDataSource('cloud')
        acq.start()
        void loadLatest().catch((err) => {
          errorMsg.value = String(err.message ?? err)
        })
      }
      ws.onmessage = (ev) => handleMessage(String(ev.data))
      ws.onerror = () => {
        errorMsg.value = 'Cloud WebSocket error'
        status.value = 'error'
      }
      ws.onclose = () => {
        ws = null
        if (!intentionalClose) {
          status.value = 'disconnected'
          scheduleReconnect()
        } else {
          status.value = 'disconnected'
        }
      }
    } catch (err) {
      status.value = 'error'
      errorMsg.value = String(err)
      scheduleReconnect()
    }
  }

  function disconnect() {
    intentionalClose = true
    clearReconnect()
    ws?.close()
    ws = null
    status.value = 'disconnected'
    acq.stop()
  }

  return {
    baseUrl,
    deviceId,
    status,
    errorMsg,
    framesReceived,
    latestFft,
    alarms,
    wsUrl,
    setBaseUrl,
    setDeviceId,
    connect,
    disconnect,
    loadLatest,
    fetchHistory,
    applyFft,
  }
})
