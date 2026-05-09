<template>
  <div class="pb-controls" v-if="acqStore.loadedFrames.length > 0">
    <button class="pb-btn" @click="onPlayPause">
      <span v-if="!playback.isPlaying.value || playback.isPaused.value">▶</span>
      <span v-else>❚❚</span>
    </button>
    <button class="pb-btn" @click="playback.stop">■</button>

    <div class="seek-wrap" @click="onSeek">
      <div class="seek-bar"><div class="seek-fill" :style="{ width: pct + '%' }" /></div>
      <span class="pos mono">{{ pct }}%</span>
    </div>

    <div class="speed-wrap">
      <span class="text-dim mono" style="font-size:10px">{{ locale === 'zh' ? '速度' : 'Speed' }}</span>
      <button
        v-for="s in SPEEDS"
        :key="s"
        class="speed-btn mono"
        :class="{ active: playback.speed.value === s }"
        @click="playback.setSpeed(s)"
      >{{ s }}×</button>
    </div>

    <span class="frames-count mono text-dim">
      {{ acqStore.loadedFrames.length.toLocaleString() }} {{ locale === 'zh' ? '帧' : 'frames' }} · {{ acqStore.loadedSampleRate.toLocaleString() }} Hz
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAcquisitionStore } from '@/stores/acquisition'
import { usePlayback } from '@/composables/usePlayback'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const acqStore = useAcquisitionStore()
const playback = usePlayback()

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]

const pct = computed(() => Math.round(playback.position.value * 100))

function onPlayPause() {
  if (!playback.isPlaying.value) playback.play()
  else playback.togglePause()
}

function onSeek(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playback.seek(frac)
}
</script>

<style scoped>
.pb-controls {
  display: flex; align-items: center; gap: 10px;
  padding: 4px 12px; font-size: 11px;
  background: var(--bg-1); border-bottom: 1px solid var(--border);
}
.pb-btn {
  background: transparent; border: 1px solid var(--border);
  border-radius: var(--r); padding: 2px 8px;
  font-size: 11px; color: var(--cyan); cursor: pointer;
  font-family: var(--font-mono);
}
.pb-btn:hover { background: rgba(0,217,255,0.1); border-color: var(--cyan); }

.seek-wrap {
  flex: 1; display: flex; align-items: center; gap: 8px;
  cursor: pointer;
}
.seek-bar {
  flex: 1; height: 6px; background: var(--bg-2);
  border: 1px solid var(--border); border-radius: 3px; overflow: hidden;
}
.seek-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--cyan), var(--green));
  transition: width 0.05s linear;
}
.pos { font-size: 10px; color: var(--text-1); min-width: 32px; text-align: right; }

.speed-wrap { display: flex; align-items: center; gap: 4px; }
.speed-btn {
  background: transparent; border: 1px solid var(--border);
  border-radius: 2px; padding: 1px 6px; font-size: 10px;
  color: var(--text-2); cursor: pointer;
}
.speed-btn:hover { color: var(--text-1); }
.speed-btn.active { background: rgba(0,217,255,0.15); border-color: var(--cyan); color: var(--cyan); }

.frames-count { font-size: 10px; }
</style>
