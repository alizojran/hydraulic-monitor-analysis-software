interface ParseRequest {
  type: 'parse'
  text: string
  requestId: number
}

interface ParsedChannel {
  id: string
  samples: number[]
}

interface ParseResult {
  type: 'done'
  requestId: number
  channels: ParsedChannel[]
  timestamps: number[]
  detectedSampleRate: number
  rowCount: number
  warnings: string[]
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { type, text, requestId } = e.data
  if (type !== 'parse') return

  const warnings: string[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    self.postMessage({
      type: 'done',
      requestId,
      channels: [],
      timestamps: [],
      detectedSampleRate: 0,
      rowCount: 0,
      warnings: ['File is empty'],
    })
    return
  }

  // detect delimiter
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/"/g, ''))

  // find timestamp column
  const tsColIndex = headers.findIndex((h) => /^(time|timestamp|t|time_s|time_ms|ts)$/i.test(h))
  let tsIsMs = false

  const dataHeaders = headers.filter((_, i) => i !== tsColIndex)
  const dataIndices = headers.reduce<number[]>((acc, _, i) => {
    if (i !== tsColIndex) acc.push(i)
    return acc
  }, [])

  const channels: ParsedChannel[] = dataHeaders.map((id) => ({ id, samples: [] }))
  const timestamps: number[] = []

  const CHUNK = 10000
  for (let row = 1; row < lines.length; row++) {
    const cols = lines[row].split(delim)
    if (cols.length < 2) continue

    let ts: number
    if (tsColIndex >= 0) {
      const raw = parseFloat(cols[tsColIndex])
      if (row === 1) {
        // heuristic: if > 1e9 likely Unix ms, if < 1e7 likely seconds
        tsIsMs = raw > 1e9
      }
      ts = tsIsMs ? raw : raw * 1000
    } else {
      ts = (row - 1) * 10 // 100 Hz fallback
    }

    timestamps.push(ts)
    for (let ci = 0; ci < dataIndices.length; ci++) {
      const val = parseFloat(cols[dataIndices[ci]])
      channels[ci].samples.push(isNaN(val) ? 0 : val)
    }

    if (row % CHUNK === 0) {
      self.postMessage({ type: 'progress', percent: Math.round((row / lines.length) * 100) })
    }
  }

  // detect sample rate from median timestamp delta
  let detectedSampleRate = 1000
  if (timestamps.length > 10) {
    const deltas: number[] = []
    for (let i = 1; i < Math.min(timestamps.length, 100); i++) {
      const d = timestamps[i] - timestamps[i - 1]
      if (d > 0) deltas.push(d)
    }
    deltas.sort((a, b) => a - b)
    const medianDeltaMs = deltas[Math.floor(deltas.length / 2)]
    if (medianDeltaMs > 0) detectedSampleRate = Math.round(1000 / medianDeltaMs)
  }

  const result: ParseResult = {
    type: 'done',
    requestId,
    channels,
    timestamps,
    detectedSampleRate,
    rowCount: timestamps.length,
    warnings,
  }
  self.postMessage(result)
}
