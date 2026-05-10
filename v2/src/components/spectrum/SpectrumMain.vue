<template>
  <div class="spectrum-main">
    <SpectrumControls />

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
        <SpectrumOverlays
          :bearing-overlays="bearingOverlays"
          :gear-overlays="gearOverlays"
          :m1-pct="m1Pct"
          :m2-pct="m2Pct"
        />
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
import { CHANNEL_MAP } from '@/config/channels'
import { useGLPlot } from '@/composables/useGLPlot'
import { useAnimationLoop, shouldDraw } from '@/composables/useAnimationLoop'
import GlowCanvas from '@/components/common/GlowCanvas.vue'
import SpectrumControls from './SpectrumControls.vue'
import SpectrumOverlays from './SpectrumOverlays.vue'

const acqStore = useAcquisitionStore()
const dspStore = useDspStore()

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

// ─── Cursors ─────────────────────────────────────────────────────────────────
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

// ─── Overlays (passed as props to SpectrumOverlays) ───────────────────────────
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
      if (it.hz > 0 && it.hz <= nyq)
        result.push({
          key: `${b.id}-${it.tag}`,
          label: `${prefix}${it.tag}`,
          pct: (it.hz / nyq) * 100,
          color: it.fg,
          bgColor: it.bg,
        })
    }
  }
  return result
})

const gearOverlays = computed(() => {
  if (!res.value || dspStore.gearTeeth <= 0) return []
  const nyq = dspStore.fftConfig.sampleRate / 2
  const f = dspStore.gearFreqs
  return [
    { label: 'GMF', hz: f.mesh, fg: '#b366ff', bg: 'rgba(179,102,255,0.18)' },
    { label: '−SB', hz: f.sb1, fg: '#8a4ad6', bg: 'rgba(138,74,214,0.14)' },
    { label: '+SB', hz: f.sb2, fg: '#8a4ad6', bg: 'rgba(138,74,214,0.14)' },
  ]
    .filter((it) => it.hz > 0 && it.hz <= nyq)
    .map((it) => ({ label: it.label, pct: (it.hz / nyq) * 100, color: it.fg, bgColor: it.bg }))
})

// ─── Animation loop ───────────────────────────────────────────────────────────
let fftTimer = 0
useAnimationLoop((now) => {
  if (now - fftTimer > 16) {
    fftTimer = now
    const samples = acqStore.getFftSamples(dspStore.selectedChannelId, dspStore.fftConfig.fftSize)
    dspStore.requestFft(samples, dspStore.selectedChannelId)
  }

  if (shouldDraw('spectrum-main', 60) && res.value) {
    const { magnitudeDb } = res.value
    const disp = new Float32Array(magnitudeDb.length)
    for (let i = 0; i < magnitudeDb.length; i++) disp[i] = Math.max(-120, magnitudeDb[i])
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
</script>

<style scoped>
.spectrum-main {
  display: flex;
  flex-direction: column;
  height: 100%;
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
.canvas-stack {
  flex: 1;
  position: relative;
  min-width: 0;
  cursor: crosshair;
}
.spec-canvas {
  position: absolute;
  inset: 0;
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
.flex-spacer {
  flex: 1;
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
