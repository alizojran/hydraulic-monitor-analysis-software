/**
 * useReport — generate a printable HTML report for the current session.
 *
 * Strategy: build an HTML string with inline CSS, open it in a new window,
 * then trigger window.print(). The user can print to PDF via the browser's
 * built-in print dialog (all modern browsers support "Save as PDF").
 *
 * This avoids adding a heavy PDF library as a dependency while producing a
 * well-formatted, pageable output that matches the app theme.
 */
import { toPng } from 'html-to-image'
import { useAcquisitionStore } from '@/stores/acquisition'
import { useDspStore } from '@/stores/dsp'
import { CHANNEL_DEFS } from '@/config/channels'
import type { BearingFaultResult } from '@/dsp/faultClassifier'
import { overallSeverity } from '@/dsp/faultClassifier'

export interface ReportOptions {
  /** Optional reference to the main spectrum canvas element for snapshot */
  spectrumEl?: HTMLElement | null
  /** Fault classification results to include in the report */
  faults?: BearingFaultResult[]
  /** Locale used for bilingual labels */
  locale?: 'zh' | 'en'
}

const SEVERITY_COLOR: Record<string, string> = {
  none: '#666',
  watch: '#ffaa00',
  warning: '#ff8800',
  critical: '#ff3355',
}

function fmtTs(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC')
}

function severityBadge(s: string): string {
  const color = SEVERITY_COLOR[s] ?? '#666'
  return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:11px;font-weight:700;background:${color}20;border:1px solid ${color};color:${color}">${s.toUpperCase()}</span>`
}

export function useReport() {
  const acqStore = useAcquisitionStore()
  const dspStore = useDspStore()

  async function generate(opts: ReportOptions = {}): Promise<void> {
    const { spectrumEl, faults = [], locale = 'zh' } = opts
    const t = (zh: string, en: string) => (locale === 'zh' ? zh : en)
    const now = Date.now()

    // Capture spectrum screenshot
    let specImg = ''
    if (spectrumEl) {
      try {
        specImg = await toPng(spectrumEl, { cacheBust: true })
      } catch (e) {
        console.warn('[report] screenshot failed', e)
      }
    }

    // Channel value table rows
    const channelRows = CHANNEL_DEFS.map((ch) => {
      const v = acqStore.channelValues[ch.id] ?? 0
      const name = locale === 'zh' ? ch.nameZh : ch.nameEn
      return `<tr>
        <td class="mono">${ch.id}</td>
        <td>${name}</td>
        <td class="mono right">${v.toFixed(2)}</td>
        <td>${ch.unit}</td>
      </tr>`
    }).join('')

    // Fault table rows
    const faultRows = faults
      .map((f) => {
        const desc = locale === 'zh' ? f.descriptionZh : f.description
        return `<tr>
          <td class="mono bold">${f.faultType}</td>
          <td>${desc}</td>
          <td class="mono right">${f.snrDb.toFixed(1)}</td>
          <td>${severityBadge(f.severity)}</td>
        </tr>`
      })
      .join('')

    const overall = overallSeverity(faults)
    const fftCfg = dspStore.fftConfig
    const bearing = dspStore.bearings[0]

    const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8"/>
<title>Hydraulic Monitor — ${t('诊断报告', 'Diagnostic Report')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a2e;background:#fff;padding:24px 32px}
  h1{font-size:20px;font-weight:700;color:#0a1628;margin-bottom:4px}
  h2{font-size:14px;font-weight:700;color:#0a1628;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #e0e8f0}
  .meta{font-size:11px;color:#666;margin-bottom:16px}
  .badge-overall{display:inline-block;padding:3px 12px;border-radius:4px;font-size:12px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f0f5ff;padding:6px 10px;text-align:left;font-size:11px;font-weight:600;color:#334;border-bottom:2px solid #d0d8ee}
  td{padding:5px 10px;border-bottom:1px solid #eef1f8}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even){background:#f8faff}
  .mono{font-family:'Cascadia Code','Consolas',monospace}
  .right{text-align:right}
  .bold{font-weight:700}
  .spec-img{width:100%;border:1px solid #dde4f0;border-radius:4px;margin-top:4px}
  .config-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px;font-size:12px}
  .config-item{display:flex;flex-direction:column}
  .config-label{font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
  .config-value{font-family:'Cascadia Code','Consolas',monospace;font-weight:600;color:#1a1a2e}
  @media print{body{padding:12px 16px}@page{size:A4 landscape;margin:15mm}}
</style>
</head>
<body>
<h1>🔧 ${t('液压监测系统诊断报告', 'Hydraulic Monitor Diagnostic Report')}</h1>
<div class="meta">
  ${t('生成时间', 'Generated')}: ${fmtTs(now)} &nbsp;·&nbsp;
  ${t('采样率', 'Sample rate')}: ${acqStore.sampleRate.toLocaleString()} Hz &nbsp;·&nbsp;
  ${t('会话时长', 'Session duration')}: ${acqStore.elapsedSec.toFixed(1)} s &nbsp;·&nbsp;
  ${t('整体状态', 'Overall')}: ${severityBadge(overall)}
</div>

<h2>${t('测量配置', 'Measurement Configuration')}</h2>
<div class="config-grid">
  <div class="config-item"><span class="config-label">FFT Size</span><span class="config-value">${fftCfg.fftSize}</span></div>
  <div class="config-item"><span class="config-label">${t('窗函数', 'Window')}</span><span class="config-value">${fftCfg.window}</span></div>
  <div class="config-item"><span class="config-label">${t('平均次数', 'Averages')}</span><span class="config-value">${fftCfg.averages}</span></div>
  <div class="config-item"><span class="config-label">${t('轴承型号', 'Bearing')}</span><span class="config-value">${bearing?.preset ?? 'N/A'}</span></div>
  <div class="config-item"><span class="config-label">${t('转速', 'RPM')}</span><span class="config-value">${(acqStore.channelValues['V01'] ?? 0).toFixed(0)} RPM</span></div>
  <div class="config-item"><span class="config-label">${t('数据源', 'Data source')}</span><span class="config-value">${acqStore.dataSource.toUpperCase()}</span></div>
</div>

${faults.length > 0 ? `
<h2>${t('轴承故障诊断', 'Bearing Fault Diagnosis')}</h2>
<table>
  <thead><tr>
    <th>${t('类型', 'Type')}</th>
    <th>${t('描述', 'Description')}</th>
    <th class="right">SNR (dB)</th>
    <th>${t('严重程度', 'Severity')}</th>
  </tr></thead>
  <tbody>${faultRows}</tbody>
</table>` : ''}

<h2>${t('通道实时值', 'Channel Live Values')}</h2>
<table>
  <thead><tr>
    <th>ID</th>
    <th>${t('名称', 'Name')}</th>
    <th class="right">${t('数值', 'Value')}</th>
    <th>${t('单位', 'Unit')}</th>
  </tr></thead>
  <tbody>${channelRows}</tbody>
</table>

${specImg ? `
<h2>${t('频谱快照', 'Spectrum Snapshot')}</h2>
<img class="spec-img" src="${specImg}" alt="spectrum" />` : ''}

</body>
</html>`

    const win = window.open('', '_blank', 'width=1100,height=850')
    if (!win) {
      alert(t('弹窗被屏蔽，请允许弹窗后重试', 'Pop-up blocked — please allow pop-ups and try again'))
      return
    }
    win.document.write(html)
    win.document.close()
    // Give images time to load before triggering print
    win.onload = () => setTimeout(() => win.print(), 300)
  }

  return { generate }
}
