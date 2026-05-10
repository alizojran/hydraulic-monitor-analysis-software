<template>
  <div class="spec-header">
    <span class="text-dim">{{ $t('spectrum.channel') }}</span>
    <select :value="dspStore.selectedChannelId" @change="onChChange">
      <option v-for="opt in spectralChannels" :key="opt.id" :value="opt.id">
        {{ opt.id }} · {{ localName(opt) }}
      </option>
    </select>
    <span class="text-dim">{{ $t('spectrum.windowFn') }}</span>
    <select
      :value="dspStore.fftConfig.window"
      @change="
        (e) =>
          dspStore.setFftConfig({
            window: (e.target as HTMLSelectElement).value as
              | 'hamming'
              | 'hanning'
              | 'blackman'
              | 'flattop'
              | 'rect',
          })
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
            fftSize: parseInt((e.target as HTMLSelectElement).value) as
              | 512
              | 1024
              | 2048
              | 4096
              | 8192,
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
            averages: parseInt((e.target as HTMLSelectElement).value) as 1 | 4 | 8 | 16 | 32,
          })
      "
    >
      <option v-for="a in [1, 4, 8, 16, 32]" :key="a">{{ a }}</option>
    </select>
    <span class="flex-spacer" />
    <button
      class="env-btn"
      :class="{ on: dspStore.xAxisMode === 'order' }"
      :title="$t('spectrum.orderAxisTitle')"
      @click="dspStore.toggleXAxisMode"
    >
      {{ dspStore.xAxisMode === 'order' ? 'ORDER' : 'Hz' }}
    </button>
    <button
      class="env-btn"
      :class="{ on: dspStore.envelopeMode }"
      :title="$t('spectrum.envelopeTitle')"
      @click="dspStore.toggleEnvelopeMode"
    >
      {{ $t('spectrum.envelope') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useDspStore } from '@/stores/dsp'
import { CHANNEL_DEFS } from '@/config/channels'
import { useLocaleName } from '@/composables/useLocaleName'

const { localName } = useLocaleName()
const dspStore = useDspStore()

const WINDOWS = ['hamming', 'hanning', 'blackman', 'flattop', 'rect']
const FFT_SIZES = [512, 1024, 2048, 4096, 8192]

const spectralChannels = CHANNEL_DEFS.filter(
  (c) => c.type === 'vibration' || c.type === 'acoustic' || c.type === 'pressure',
)

function onChChange(e: Event) {
  dspStore.setSelectedChannel((e.target as HTMLSelectElement).value)
}
</script>

<style scoped>
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
</style>
