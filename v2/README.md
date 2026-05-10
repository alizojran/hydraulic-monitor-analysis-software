# HMAS v3.0 — Vue 3 frontend

> Vite + Vue 3 + TypeScript SPA for the Hydraulic Monitor & Analysis System.  
> See [the root README](../README.md) for full product overview.

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173/
```

> **Note**: `@tauri-apps/api` is an optional peer dependency only needed when
> running inside the Tauri desktop shell. The web build works without it.

## Scripts

| Command                | Description                             |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Start Vite dev server (HMR)             |
| `npm run build`        | Type-check + production build → `dist/` |
| `npm run preview`      | Serve `dist/` locally                   |
| `npm run test`         | Run Vitest unit tests (watch mode)      |
| `npm run test:run`     | Run tests once (CI)                     |
| `npm run coverage`     | Generate coverage report                |
| `npm run lint`         | ESLint check                            |
| `npm run lint:fix`     | ESLint auto-fix                         |
| `npm run format`       | Prettier format all files               |
| `npm run format:check` | Prettier dry-run (CI)                   |

## Stack

| Layer             | Technology                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| Framework         | Vue 3 (Composition API) + TypeScript                                        |
| Build             | Vite 6 + vue-tsc                                                            |
| State             | Pinia                                                                       |
| i18n              | vue-i18n (中文 / English)                                                   |
| Rendering         | WebGL2 (GLPlot / GLBars / GLHeatmap) + Canvas 2D                            |
| DSP / FFT         | Self-written radix-2 Cooley-Tukey in Web Worker (zero-copy)                 |
| Signal processing | Hilbert envelope · 1/3-octave IEC 61672 · bearing formulas · order tracking |
| Export            | html-to-image (PNG) · Blob (CSV / JSON)                                     |
| Testing           | Vitest + @vitest/coverage-v8                                                |
| Linting           | ESLint 9 (flat config) + eslint-plugin-vue + typescript-eslint              |
| Formatting        | Prettier + eslint-config-prettier                                           |
| Git hooks         | Husky + lint-staged                                                         |

No runtime dependency on fft.js / chart.js / d3 — all GL rendering and DSP
algorithms are hand-written.

## Data Sources

| Source    | Notes                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------ |
| Simulator | Physics-coupled synthetic waveforms (pump pulsation, harmonics, bearing faults, acoustic noise)  |
| CSV file  | Drag-and-drop; Worker auto-detects timestamp column + delimiter, chunked parse with progress bar |
| WAV file  | `AudioContext.decodeAudioData` → maps to acoustic channel, with playback controls                |
| WebSerial | Direct hardware DAQ (STM32 / Arduino) — requires Chromium-based browser                          |
| WebSocket | Streaming from backend / Modbus proxy server                                                     |

## Browser Requirements

| Required            | Recommended                             |
| ------------------- | --------------------------------------- |
| WebGL2              | Chrome 120+ / Safari 17+ / Firefox 121+ |
| ES2022 + Web Worker | Desktop (macOS / Windows / Linux)       |

Mobile browsers run but performance is limited with 13 GL canvases.

## Project Layout

```
src/
├── App.vue
├── main.ts
├── locales/             zh.json / en.json
├── config/              channels.ts · defaults.ts
├── stores/              acquisition · dsp (facade) · dspCompute · bearingModel
│                        spectrumHistory · alarms · config · profiles · session
├── utils/               persistedStore.ts — versioned localStorage + migrations
├── types/               validators.ts (runtime schema) · tauri.d.ts (optional)
├── workers/             fft.worker.ts · csv-parser.worker.ts
├── gl/                  GLPlot · GLBars · GLHeatmap + shaders / utils
├── dsp/                 window · metrics · octave · envelope · bearing · orderTracking
├── composables/         useSimulator · usePlayback · useExport · useWebSerial · useWebSocket
│                        useAnimationLoop · useAcousticSpectrogram · useReport
│                        useLocaleName · useLang
├── components/
│   ├── layout/          AppHeader · AppStatusBar
│   ├── common/          GlowCanvas · DataSourceSwitcher · PlaybackControls
│   ├── realtime/        AnalogChannelCard · FlowCard · ParticleCard
│   │                    RpmCard · VibrationCard · AcousticCard · KpiPanel
│   ├── spectrum/        SpectrumMain · SpectrumControls · SpectrumOverlays
│   │                    WaterfallChart · OctaveBandChart · PeakList
│   │                    BearingDiagnosticPanel · BearingParamEditor
│   │                    FaultAnalysisPanel · FaultSummaryPanel
│   ├── alarms/          AlarmRuleEditor · AlarmEventLog
│   │                    AlarmTimeline · AlarmStatsChart
│   ├── config/          ProfileSwitcher · ChannelConfigSection
│   │                    AcquisitionConfigSection · SpectrumConfigSection
│   │                    DiagnosticsConfigSection · SystemConfigSection
│   │                    AboutSection · AlarmRulesInline
│   └── views/           RealtimeView · SpectrumView · HistoryView · AlarmsView · ConfigView
└── fault/               faultClassifier.ts — rule-based bearing diagnostics
```

## v3.0 Architecture Notes

The v3.0 release focused on **architecture-first** restructuring (M2 milestone):

- **Versioned persistence** — `utils/persistedStore.ts` wraps every `localStorage`
  key as `{ _version, data }` with a migration chain. v2 data without `_version`
  is auto-migrated. Quota errors dispatch `hmas-storage-quota` events.
- **Split `dsp` store** — the original 387-line `dsp.ts` was split into
  `dspCompute` (FFT worker), `bearingModel` (geometry + GMF), and
  `spectrumHistory` (waterfall columns). `dsp.ts` is retained as an `@deprecated`
  facade for backward compatibility.
- **Component extraction** — four 480+ line components were split into focused
  sub-components (≤ 350 lines each): `AlarmsView`, `SpectrumMain`, `ConfigView`,
  `BearingDiagnosticPanel`.
- **Strict TypeScript** — `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch` are all enabled. All `as any`
  and `!` non-null assertions in main code have been eliminated.
- **Boundary validation** — `types/validators.ts` provides runtime schema checks
  for WebSocket / WebSerial frames and persisted data.
- **i18n hygiene** — inline `locale === 'zh' ? ... : ...` ternaries removed from
  components; ESLint `no-restricted-syntax` rule blocks new bare Chinese
  literals in component scripts.
