<template>
  <!-- Bearing fault frequency overlay -->
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
  <div v-if="gearOverlays.length" class="bearing-overlay">
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
</template>

<script setup lang="ts">
defineProps<{
  bearingOverlays: { key: string; label: string; pct: number; color: string; bgColor: string }[]
  gearOverlays: { label: string; pct: number; color: string; bgColor: string }[]
  m1Pct: number | null
  m2Pct: number | null
}>()
</script>

<style scoped>
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
</style>
