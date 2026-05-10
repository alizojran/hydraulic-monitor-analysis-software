<template>
  <div class="spectrum-main">
    <div class="spec-header">
      <span class="text-dim">{{ $t('spectrum.channel') }}</span>
      <select :value="dspStore.selectedChannelId" @change="onChChange">
        <option v-for="opt in spectralChannels" :key="opt.id" :value="opt.id">
          {{ opt.id }} · {{ locale === 'zh' ? opt.nameZh : opt.nameEn }}
        </option>
      </select>
      <span class="text-dim">{{ $t('spectrum.windowFn') }}</span>
      <select
        :value="dspStore.fftConfig.window"
        @change="
          (e) => dspStore.setFftConfig({ window: (e.target as HTMLSelectElement).value as any })
        "
      >
        <option v-for="w in WINDOWS" :key="w">{{ w }}</option>
      </select>
      <span class="text-dim">{{ $t('spectrum.fftSize') }}</span>
      <select
        :value="dspStore.fftConfig.fftSize"
        @change="
          (e) =>
            dspStore.setFftConfig({
              fftSize: parseInt((e.target as HTMLSelectElement).value) as any,
            })
        "
      >
        <option v-for="s in FFT_SIZES" :key="s">{{ s }}</option>
      </select>
      <span class="text-dim">{{ $t('spectrum.averages') }}</span>
      <select
        :value="dspStore.fftConfig.averages"
        @change="
          (e) =>
            dspStore.setFftConfig({
              averages: parseInt((e.target as HTMLSelectElement).value) as any,
            })
        "
      >
        <option v-for="a in [1, 4, 8, 16, 32]" :key="a">{{ a }}</option>
      </select>
      <span class="flex-spacer" />
      <button
        class="env-btn"
        :class="{ on: dspStore.xAxisMode === 'order' }"
        :title="
          locale === 'zh'
            ? '阶次跟踪：X 轴用 shaft 频率倍数'
            : 'Order-axis: X labelled in multiples of shaft Hz'
        "
        @click="dspStore.toggleXAxisMode"
      >
        {{ dspStore.xAxisMode === 'order' ? 'ORDER' : 'Hz' }}
      </button>
      <button
        class="env-btn"
        :class="{ on: dspStore.envelopeMode }"
        :title="locale === 'zh' ? '希尔伯特包络解调' : 'Hilbert envelope demodulation'"
        @click="dspStore.toggleEnvelopeMode"
      >
        {{ locale === 'zh' ? '包络' : 'Envelope' }}
      </button>
    </div>

    <div class="canvas-area">
      <div class="y-axis">
        <span
          v-for="tick in yTicks"
          :key="tick.v"
          class="y-tick mono"
          :style="{ bottom: tick.pct + '%' }"
          >{{ tick.v }}</span
        >
      </div>
      <div class="canvas-stack" @click="onCanvasClick">
        <GlowCanvas ref="specCanvas" class="spec-canvas" />
        <!-- Bearing fault frequency overlay (all bearings with overlay enabled) -->
        <div v-if="bearingOverlays.length" class="bearing-overlay">
          <div
            v-for="b in bearingOverlays"
            :key="b.key"
            class="b-marker"
            :style="{ left: b.pct + '%', borderColor: b.color }"
          >
            <span class="b-label mono" :style="{ color: b.color, background: b.bgColor }">{{
              b.label
            }}</span>
          </div>
        </div>
        <!-- Gear mesh overlay -->
        <div v-if="dspStore.gearOverlay && gearOverlays.length" class="bearing-overlay">
          <div
            v-for="g in gearOverlays"
            :key="g.label"
            class="b-marker"
            :style="{ left: g.pct + '%', borderColor: g.color }"
          >
            <span class="b-label mono" :style="{ color: g.color, background: g.bgColor }">{{
              g.label
            }}</span>
          </div>
        </div>
        <!-- M1 / M2 cursors -->
        <div class="cursors-overlay">
          <div v-if="m1Pct !== null" class="cursor m1" :style="{ left: m1Pct + '%' }">
            <span class="cur-label mono">M1</span>
          </div>
          <div v-if="m2Pct !== null" class="cursor m2" :style="{ left: m2Pct + '%' }">
            <span class="cur-label mono">M2</span>
          </div>
        </div>
      </div>
    </div>

    <div class="x-axis">
      <span
        v-for="tick in xTicks"
        :key="tick.hz"
        class="x-tick mono"
        :style="{ left: tick.pct + '%' }"
        >{{ tick.label }}</span
      >
    </div>

    <div class="stats-row">
      <div v-if="res" class="stat">
        RMS <span class="mono text-cyan">{{ res.rms.toFixed(4) }}</span>
      </div>
      <div v-if="res" class="stat">
        Peak <span class="mono text-green">{{ res.peakValue.toFixed(4) }}</span>
      </div>
      <div v-if="res" class="stat">
        Crest <span class="mono text-amber">{{ res.crestFactor.toFixed(2) }}</span>
      </div>
      <div v-if="res" class="stat">
        THD <span class="mono text-1">{{ (res.thd * 100).toFixed(1) }}%</span>
      </div>
      <div v-if="res" class="stat text-dim">Δf {{ res.binHz.toFixed(2) }} Hz/bin</div>
      <span class="flex-spacer" />
      <div v-if="m1Hz !== null" class="stat">
        M1 <span class="mono text-amber">{{ formatXValue(m1Hz) }}</span
        ><span class="mono text-dim">{{ formatDb(m1Db) }} dB</span>
      </div>
      <div v-if="m2Hz !== null" class="stat">
        M2 <span class="mono text-purple">{{ formatXValue(m2Hz) }}</span
        ><span class="mono text-dim">{{ formatDb(m2Db) }} dB</span>
      </div>
      <div v-if="m1Hz !== null && m2Hz !== null" class="stat text-cyan">
        Δ <span class="mono">{{ formatXValue(Math.abs(m2Hz - m1Hz)) }}</span> ·
        <span class="mono">1/Δ {{ (1000 / Math.abs(m2Hz - m1Hz)).toFixed(1) }} ms</span>
      </div>
      <button v-if="m1Hz !== null || m2Hz !== null" class="clear-cur" @click="clearCursors">
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useDspStore } from '@/stores/dsp'
import { CHANNEL_DEFS, CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()
const dspStore = useDspStore()

const WINDOWS = ['hamming', 'hanning', 'blackman', 'flattop', 'rect']
const FFT_SIZES = [512, 1024, 2048, 4096, 8192]

const spectralChannels = CHANNEL_DEFS.filter(
  (c) => c.type === 'vibration' || c.type === 'acoustic' || c.type === 'pressure',
)

const specCanvas = ref<InstanceType<typeof GlowCanvas> | null>(null)
const specCanvasRef = computed(() => specCanvas.value?.canvas ?? null)
const { draw } = useGLPlot(specCanvasRef)

const res = computed(() => dspStore.fftResult)
const ch = computed(() => CHANNEL_MAP.get(dspStore.selectedChannelId))

const yTicks = [
  { v: '0', pct: 0 },
  { v: '-30', pct: 25 },
  { v: '-60', pct: 50 },
  { v: '-90', pct: 75 },
  { v: '-120', pct: 100 },
]
const xTicks = computed(() => {
  if (!res.value) return []
  const nyq = dspStore.fftConfig.sampleRate / 2

  if (dspStore.xAxisMode === 'order') {
    const shaftHz = Math.max(0.01, dspStore.bearingShaftRpm / 60)
    const maxOrder = nyq / shaftHz
    const candidates = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512].filter((o) => o <= maxOrder)
    return candidates.map((order) => ({
      hz: order * shaftHz,
      pct: ((order * shaftHz) / nyq) * 100,
      label: `${order}×`,
    }))
  }

  const ticks = [0.1, 0.2, 0.5, 1, 2, 5, 10].map((v) => v * 1000).filter((hz) => hz <= nyq)
  return ticks.map((hz) => ({
    hz,
    pct: (hz / nyq) * 100,
    label: hz >= 1000 ? `${hz / 1000}k` : `${hz}`,
  }))
})

// ─── M1 / M2 cursors ───────────────────────────────────────────────
const m1Hz = ref<number | null>(null)
const m2Hz = ref<number | null>(null)
const m1Pct = computed(() => hzToPct(m1Hz.value))
const m2Pct = computed(() => hzToPct(m2Hz.value))
const m1Db = computed(() => dbAt(m1Hz.value))
const m2Db = computed(() => dbAt(m2Hz.value))

function hzToPct(hz: number | null): number | null {
  if (hz === null) return null
  const nyq = dspStore.fftConfig.sampleRate / 2
  return Math.max(0, Math.min(100, (hz / nyq) * 100))
}
function dbAt(hz: number | null): number {
  if (hz === null) return -120
  const r = res.value
  if (!r) return -120
  const bin = Math.round(hz / r.binHz)
  if (bin < 0 || bin >= r.magnitudeDb.length) return -120
  return r.magnitudeDb[bin]
}
function formatDb(v: number): string {
  return Number.isFinite(v) && v > -120 ? v.toFixed(1) : '—'
}

function formatXValue(hz: number): string {
  if (dspStore.xAxisMode === 'order') {
    const shaftHz = Math.max(0.01, dspStore.bearingShaftRpm / 60)
    return `${(hz / shaftHz).toFixed(2)}×`
  }
  return `${hz.toFixed(1)} Hz`
}

function onCanvasClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const nyq = dspStore.fftConfig.sampleRate / 2
  const hz = frac * nyq
  if (e.shiftKey) m2Hz.value = hz
  else m1Hz.value = hz
}
function clearCursors() {
  m1Hz.value = null
  m2Hz.value = null
}

const bearingOverlays = computed(() => {
  if (!res.value) return []
  const nyq = dspStore.fftConfig.sampleRate / 2
  const result: { key: string; label: string; pct: number; color: string; bgColor: string }[] = []

  for (const b of dspStore.allBearingFreqs) {
    if (!b.overlay) continue
    const cs = b.colorSet
    const prefix = dspStore.bearings.length > 1 ? `${b.name}·` : ''
    const items = [
      { tag: 'BPFI', hz: b.freqs.bpfi, fg: cs.BPFI, bg: `${cs.BPFI}22` },
      { tag: 'BPFO', hz: b.freqs.bpfo, fg: cs.BPFO, bg: `${cs.BPFO}22` },
      { tag: 'BSF', hz: b.freqs.bsf, fg: cs.BSF, bg: `${cs.BSF}22` },
      { tag: 'FTF', hz: b.freqs.ftf, fg: cs.FTF, bg: `${cs.FTF}22` },
    ]
    for (const it of items) {
      if (it.hz > 0 && it.hz <= nyq) {
        result.push({
          key: `${b.id}-${it.tag}`,
          label: `${prefix}${it.tag}`,
          pct: (it.hz / nyq) * 100,
          color: it.fg,
          bgColor: it.bg,
        })
      }
    }
  }
  return result
})

const gearOverlays = computed(() => {
  if (!res.value || dspStore.gearTeeth <= 0) return []
  const nyq = dspStore.fftConfig.sampleRate / 2
  const f = dspStore.gearFreqs
  const items = [
    { label: 'GMF', hz: f.mesh, fg: '#b366ff', bg: 'rgba(179,102,255,0.18)' },
    { label: '−SB', hz: f.sb1, fg: '#8a4ad6', bg: 'rgba(138,74,214,0.14)' },
    { label: '+SB', hz: f.sb2, fg: '#8a4ad6', bg: 'rgba(138,74,214,0.14)' },
  ]
  return items
    .filter((it) => it.hz > 0 && it.hz <= nyq)
    .map((it) => ({
      label: it.label,
      pct: (it.hz / nyq) * 100,
      color: it.fg,
      bgColor: it.bg,
    }))
})

let fftTimer = 0
useAnimationLoop((now) => {
  // Request FFT computation at ~60 Hz (worker gates with pendingRequest)
  if (now - fftTimer > 16) {
    fftTimer = now
    const samples = acqStore.getFftSamples(dspStore.selectedChannelId, dspStore.fftConfig.fftSize)
    dspStore.requestFft(samples, dspStore.selectedChannelId)
  }

  if (shouldDraw('spectrum-main', 60) && res.value) {
    const { magnitudeDb } = res.value
    // normalize for display: -120..0 dB -> 0..1 for GLPlot
    const disp = new Float32Array(magnitudeDb.length)
    for (let i = 0; i < magnitudeDb.length; i++) {
      disp[i] = Math.max(-120, magnitudeDb[i])
    }
    draw(disp, ch.value?.hex ?? '#00d9ff', {
      min: -120,
      max: 0,
      fill: true,
      fillAlpha: 0.3,
      cols: 10,
      rows: 4,
    })
  }
})

function onChChange(e: Event) {
  dspStore.setSelectedChannel((e.target as HTMLSelectElement).value)
}
</script>

<style scoped>
.spectrum-main {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.spec-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 8px;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
}
.flex-spacer {
  flex: 1;
}
.env-btn {
  font-size: 10.5px;
  padding: 2px 9px;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.env-btn.on {
  background: rgba(179, 102, 255, 0.12);
  border-color: var(--purple);
  color: var(--purple);
  box-shadow: 0 0 8px rgba(179, 102, 255, 0.25);
}
.canvas-area {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}
.y-axis {
  width: 36px;
  position: relative;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
}
.y-tick {
  position: absolute;
  right: 4px;
  font-size: 9px;
  color: var(--text-dim);
  transform: translateY(50%);
}
.spec-canvas {
  flex: 1;
}
.x-axis {
  height: 20px;
  position: relative;
  margin-left: 36px;
  border-top: 1px solid var(--border);
}
.x-tick {
  position: absolute;
  font-size: 9px;
  color: var(--text-dim);
  transform: translateX(-50%);
}
.stats-row {
  display: flex;
  gap: 16px;
  padding: 4px 8px;
  font-size: 11px;
  border-top: 1px solid var(--border);
}
.stat {
  display: flex;
  gap: 4px;
  align-items: center;
}

/* Bearing fault frequency overlay */
.canvas-stack {
  flex: 1;
  position: relative;
  min-width: 0;
}
.spec-canvas {
  position: absolute;
  inset: 0;
}
.bearing-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.b-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px dashed;
  border-color: inherit;
  transform: translateX(-0.5px);
}
.b-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 2px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.canvas-stack {
  cursor: crosshair;
}
.cursors-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
.cursor.m1 {
  background: var(--amber);
  box-shadow: 0 0 4px var(--amber);
}
.cursor.m2 {
  background: var(--purple);
  box-shadow: 0 0 4px var(--purple);
}
.cur-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 600;
}
.cursor.m1 .cur-label {
  color: var(--amber);
  background: rgba(255, 170, 0, 0.15);
}
.cursor.m2 .cur-label {
  color: var(--purple);
  background: rgba(179, 102, 255, 0.15);
}

.text-purple {
  color: var(--purple);
}
.clear-cur {
  font-size: 11px;
  padding: 0 6px;
  line-height: 1;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: 2px;
  min-height: 18px;
}
</style>
