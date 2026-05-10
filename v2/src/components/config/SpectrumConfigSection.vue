<template>
  <div class="cfg-section">
    <div class="sec-title">{{ $t('config.spectrum.title') }}</div>

    <div class="cfg-grid">
      <div class="cfg-row">
        <label>{{ $t('config.spectrum.fftSize') }}</label>
        <select
          :value="dsp.fftConfig.fftSize"
          @change="
            dsp.setFftConfig({
              fftSize: parseInt(($event.target as HTMLSelectElement).value) as any,
            })
          "
        >
          <option v-for="n in [512, 1024, 2048, 4096, 8192]" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.spectrum.window') }}</label>
        <select
          :value="dsp.fftConfig.window"
          @change="dsp.setFftConfig({ window: ($event.target as HTMLSelectElement).value as any })"
        >
          <option value="hanning">Hanning</option>
          <option value="hamming">Hamming</option>
          <option value="blackman">Blackman</option>
          <option value="flattop">Flat Top</option>
          <option value="rect">Rectangular</option>
        </select>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.spectrum.averages') }}</label>
        <select
          :value="dsp.fftConfig.averages"
          @change="
            dsp.setFftConfig({
              averages: parseInt(($event.target as HTMLSelectElement).value) as 1 | 4 | 8 | 16 | 32,
            })
          "
        >
          <option v-for="n in [1, 2, 4, 8, 16, 32]" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.spectrum.overlap') }}</label>
        <select
          :value="dsp.fftConfig.overlap"
          @change="
            dsp.setFftConfig({
              overlap: parseFloat(($event.target as HTMLSelectElement).value) as any,
            })
          "
        >
          <option value="0">0%</option>
          <option value="0.25">25%</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
        </select>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.spectrum.xAxisMode') }}</label>
        <div class="toggle-group">
          <button
            :class="{ active: dsp.xAxisMode === 'hz' }"
            @click="dsp.xAxisMode !== 'hz' && dsp.toggleXAxisMode()"
          >
            Hz
          </button>
          <button
            :class="{ active: dsp.xAxisMode === 'order' }"
            @click="dsp.xAxisMode !== 'order' && dsp.toggleXAxisMode()"
          >
            Order
          </button>
        </div>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.spectrum.envelopeDefault') }}</label>
        <div class="toggle-group">
          <button
            :class="{ active: dsp.envelopeMode }"
            @click="!dsp.envelopeMode && dsp.toggleEnvelopeMode()"
          >
            ON
          </button>
          <button
            :class="{ active: !dsp.envelopeMode }"
            @click="dsp.envelopeMode && dsp.toggleEnvelopeMode()"
          >
            OFF
          </button>
        </div>
      </div>

      <div class="cfg-row">
        <label>{{ $t('config.spectrum.octaveWeighting') }}</label>
        <div class="toggle-group">
          <button
            :class="{ active: dsp.octaveWeighting === 'A' }"
            @click="dsp.setOctaveWeighting('A')"
          >
            A
          </button>
          <button
            :class="{ active: dsp.octaveWeighting === 'C' }"
            @click="dsp.setOctaveWeighting('C')"
          >
            C
          </button>
          <button
            :class="{ active: dsp.octaveWeighting === 'none' }"
            @click="dsp.setOctaveWeighting('none')"
          >
            {{ $t('spectrum.noWeighting') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDspStore } from '@/stores/dsp'
const dsp = useDspStore()
</script>

<style scoped>
.cfg-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec-title {
  font-size: 10px;
  color: var(--text-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.cfg-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cfg-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  padding: 4px 0;
}
.cfg-row label {
  color: var(--text-2);
  font-size: 11px;
}
.cfg-row select {
  font-size: 12px;
  padding: 3px 6px;
  height: 26px;
  min-width: 120px;
  max-width: 180px;
}
.toggle-group {
  display: flex;
  gap: 3px;
}
.toggle-group button {
  padding: 2px 10px;
  font-size: 11px;
  font-family: var(--font-mono);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--text-2);
}
.toggle-group button.active {
  background: rgba(0, 217, 255, 0.12);
  border-color: var(--cyan);
  color: var(--cyan);
}
</style>
