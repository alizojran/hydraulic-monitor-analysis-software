export type WindowFn = (N: number) => Float32Array

export function hamming(N: number): Float32Array {
  const w = new Float32Array(N)
  for (let i = 0; i < N; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1))
  return w
}

export function hanning(N: number): Float32Array {
  const w = new Float32Array(N)
  for (let i = 0; i < N; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
  return w
}

export function blackman(N: number): Float32Array {
  const w = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    w[i] =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) +
      0.08 * Math.cos((4 * Math.PI * i) / (N - 1))
  }
  return w
}

export function flattop(N: number): Float32Array {
  const w = new Float32Array(N)
  const a0 = 0.21557895,
    a1 = 0.41663158,
    a2 = 0.27726316,
    a3 = 0.08357895,
    a4 = 0.00694737
  for (let i = 0; i < N; i++) {
    const x = (2 * Math.PI * i) / (N - 1)
    w[i] =
      a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x) - a3 * Math.cos(3 * x) + a4 * Math.cos(4 * x)
  }
  return w
}

export function rect(N: number): Float32Array {
  return new Float32Array(N).fill(1)
}

export function getWindow(name: string, N: number): Float32Array {
  switch (name) {
    case 'hamming':
      return hamming(N)
    case 'hanning':
      return hanning(N)
    case 'blackman':
      return blackman(N)
    case 'flattop':
      return flattop(N)
    default:
      return rect(N)
  }
}
