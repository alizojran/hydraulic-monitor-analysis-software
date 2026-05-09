import { useAcquisitionStore } from '@/stores/acquisition'
import { useUiStore } from '@/stores/ui'
import { CHANNEL_DEFS, DISPLAY_POINTS } from '@/config/channels'
import { toPng } from 'html-to-image'

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function useExport() {
  const acqStore = useAcquisitionStore()
  const uiStore = useUiStore()

  /**
   * Export the current display buffer (whole 5-min window by default) as CSV.
   * Columns: timestamp_ms, iso_time, then one per channel.
   */
  function exportCsv() {
    const channelIds = CHANNEL_DEFS.map(c => c.id)
    const intervalMs = (acqStore.timeWindowSec * 1000) / DISPLAY_POINTS
    const now = Date.now()

    // Collect each buffer
    const buffers: Record<string, number[]> = {}
    let N = 0
    for (const id of channelIds) {
      const b = acqStore.channelBuffers[id]?.buffer ?? []
      buffers[id] = Array.from(b)
      if (b.length > N) N = b.length
    }
    if (N === 0) return false

    const lines: string[] = []
    lines.push(['timestamp_ms', 'iso_time', ...channelIds].join(','))
    for (let i = 0; i < N; i++) {
      const ts = now - (N - 1 - i) * intervalMs
      const iso = new Date(ts).toISOString()
      const row: (string | number)[] = [ts.toFixed(0), iso]
      for (const id of channelIds) {
        const v = buffers[id][i]
        row.push(v != null ? v.toFixed(4) : '')
      }
      lines.push(row.join(','))
    }

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `hmas-export-${timestampForFile()}.csv`)
    return true
  }

  /**
   * Snapshot the active view as a PNG. Uses html-to-image which walks the
   * DOM, captures text + canvas, and produces a high-DPI PNG.
   */
  async function exportPng() {
    // Find the currently visible view (only one is mounted via v-if)
    const view = document.querySelector('.view-area > *') as HTMLElement | null
    if (!view) return false

    try {
      uiStore.setLoading(true, 0, 'Generating snapshot…')
      const dataUrl = await toPng(view, {
        pixelRatio: window.devicePixelRatio || 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--bg-0').trim() || '#000',
      })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      downloadBlob(blob, `hmas-snapshot-${timestampForFile()}.png`)
      return true
    } catch (err) {
      console.error('[export] PNG snapshot failed:', err)
      return false
    } finally {
      uiStore.setLoading(false, 0, '')
    }
  }

  return { exportCsv, exportPng }
}
