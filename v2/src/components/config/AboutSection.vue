<template>
  <div>
    <div class="section-label">{{ $t('config.about.title') }}</div>
    <div class="about-grid">
      <div class="about-row">
        <span class="about-key">{{ $t('config.about.version') }}</span>
        <span class="about-val mono">v2.0.0</span>
      </div>
      <div class="about-row">
        <span class="about-key">{{ $t('config.about.build') }}</span>
        <span class="about-val mono">2026-05-10</span>
      </div>
      <div class="about-row">
        <span class="about-key">Runtime</span>
        <span class="about-val mono">Vue 3 + Pinia + Vite</span>
      </div>
      <div class="about-row">
        <span class="about-key">Rendering</span>
        <span class="about-val mono">WebGL2 + Canvas2D</span>
      </div>
      <div class="about-row">
        <span class="about-key">Signal</span>
        <span class="about-val mono">FFT · Octave · Bearing · Gear · Envelope</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
  margin-bottom: 8px;
}
.about-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}
.about-row {
  display: flex;
  gap: 16px;
  font-size: 12px;
}
.about-key {
  min-width: 130px;
  color: var(--text-2);
}
.about-val {
  color: var(--text-1);
}
</style>
