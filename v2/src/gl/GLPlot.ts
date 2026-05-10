import { hex2rgb, makeProgram, resizeCanvas } from './utils'

export interface PlotOptions {
  min?: number
  max?: number
  fill?: boolean
  fillAlpha?: number
  lw?: number
  glow?: number
  cols?: number
  rows?: number
}

export class GLPlot {
  canvas: HTMLCanvasElement
  failed = false
  private gl!: WebGL2RenderingContext
  private prog!: WebGLProgram
  private uColor!: WebGLUniformLocation
  private uAlpha!: WebGLUniformLocation
  private aPos!: number
  private aIntensity!: number
  private buf!: WebGLBuffer
  private vao!: WebGLVertexArrayObject
  private vertData: Float32Array | null = null
  private _fillBuf: Float32Array | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    // preserveDrawingBuffer lets html-to-image / toDataURL capture the canvas
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    })
    if (!gl) {
      this.failed = true
      return
    }
    this.gl = gl

    const vs = `#version 300 es
      in vec2 a_pos;
      in float a_intensity;
      out float v_intensity;
      void main(){
        v_intensity = a_intensity;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`
    const fs = `#version 300 es
      precision highp float;
      in float v_intensity;
      uniform vec3 u_color;
      uniform float u_alpha;
      out vec4 frag;
      void main(){
        frag = vec4(u_color, u_alpha * v_intensity);
      }`
    const prog = makeProgram(gl, vs, fs)
    if (!prog) {
      this.failed = true
      return
    }
    this.prog = prog

    this.uColor = gl.getUniformLocation(prog, 'u_color')!
    this.uAlpha = gl.getUniformLocation(prog, 'u_alpha')!
    this.aPos = gl.getAttribLocation(prog, 'a_pos')
    this.aIntensity = gl.getAttribLocation(prog, 'a_intensity')

    this.buf = gl.createBuffer()!
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 12, 0)
    gl.enableVertexAttribArray(this.aIntensity)
    gl.vertexAttribPointer(this.aIntensity, 1, gl.FLOAT, false, 12, 8)
    gl.bindVertexArray(null)
  }

  resize() {
    if (this.failed) return
    resizeCanvas(this.canvas, this.gl)
  }

  draw(buf: ArrayLike<number>, hex: string, options: PlotOptions = {}) {
    if (this.failed) return
    this.resize()
    const gl = this.gl
    const w = this.canvas.width,
      h = this.canvas.height
    const min = options.min ?? Math.min(...Array.from(buf))
    const max = options.max ?? Math.max(...Array.from(buf))
    const range = max - min || 1
    const padFrac = 0.08
    const N = buf.length
    if (N < 2) return
    const lw = (options.lw || 1.4) * (window.devicePixelRatio || 1)
    const glowStrength = options.glow ?? 0.7

    gl.clearColor(0.018, 0.024, 0.03, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    this._drawGrid(options.cols || 10, options.rows || 3)

    const xToNdc = (i: number) => -1 + (i / (N - 1)) * 2
    const yToNdc = (v: number) => {
      const yPx = h - h * padFrac - ((v - min) / range) * (h - h * padFrac * 2)
      return 1 - (yPx / h) * 2
    }

    if (options.fill) {
      const stride = 3
      const fillVerts = N * 2
      const need = fillVerts * stride
      if (!this._fillBuf || this._fillBuf.length < need) this._fillBuf = new Float32Array(need * 2)
      const fa = this._fillBuf
      for (let i = 0; i < N; i++) {
        const x = xToNdc(i),
          y = yToNdc((buf as ArrayLike<number>)[i])
        const o = i * 2 * stride
        fa[o] = x
        fa[o + 1] = y
        fa[o + 2] = 0.45
        fa[o + 3] = x
        fa[o + 4] = -1.0
        fa[o + 5] = 0.0
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
      gl.bufferData(gl.ARRAY_BUFFER, fa.subarray(0, need), gl.DYNAMIC_DRAW)
      gl.useProgram(this.prog)
      gl.bindVertexArray(this.vao)
      const [r, g, b] = hex2rgb(hex)
      gl.uniform3f(this.uColor, r, g, b)
      gl.uniform1f(this.uAlpha, options.fillAlpha ?? 0.55)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, fillVerts)
    }

    const halfWPx = lw / 2
    const vertCount = N * 2
    const stride = 3
    if (!this.vertData || this.vertData.length < vertCount * stride) {
      this.vertData = new Float32Array(vertCount * stride * 2)
    }
    const arr = this.vertData

    for (let i = 0; i < N; i++) {
      const x = xToNdc(i),
        y = yToNdc((buf as ArrayLike<number>)[i])
      let tpx: number, tpy: number
      if (i === 0) {
        tpx = (xToNdc(1) - x) * w * 0.5
        tpy = (yToNdc((buf as ArrayLike<number>)[1]) - y) * h * 0.5
      } else if (i === N - 1) {
        tpx = (x - xToNdc(N - 2)) * w * 0.5
        tpy = (y - yToNdc((buf as ArrayLike<number>)[N - 2])) * h * 0.5
      } else {
        tpx = (xToNdc(i + 1) - xToNdc(i - 1)) * 0.5 * w * 0.5
        tpy =
          (yToNdc((buf as ArrayLike<number>)[i + 1]) - yToNdc((buf as ArrayLike<number>)[i - 1])) *
          0.5 *
          h *
          0.5
      }
      const tlen = Math.hypot(tpx, tpy) || 1
      const npx = -tpy / tlen,
        npy = tpx / tlen
      const dx = (npx * halfWPx * 2) / w,
        dy = (npy * halfWPx * 2) / h
      const o = i * 2 * stride
      arr[o] = x + dx
      arr[o + 1] = y + dy
      arr[o + 2] = 1.0
      arr[o + 3] = x - dx
      arr[o + 4] = y - dy
      arr[o + 5] = 1.0
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, vertCount * stride), gl.DYNAMIC_DRAW)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const [r, g, b] = hex2rgb(hex)
    gl.uniform3f(this.uColor, r, g, b)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.uniform1f(this.uAlpha, 1.0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount)

    if (glowStrength > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      gl.uniform1f(this.uAlpha, 0.35 * glowStrength)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount)
    }

    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  private _drawGrid(cols: number, rows: number) {
    const gl = this.gl
    const lines: number[] = []
    for (let i = 1; i < cols; i++) {
      const x = -1 + (i / cols) * 2
      lines.push(x, -1, 0.06, x, 1, 0.06)
    }
    for (let j = 1; j < rows; j++) {
      const y = -1 + (j / rows) * 2
      lines.push(-1, y, 0.06, 1, y, 0.06)
    }
    const arr = new Float32Array(lines)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.uniform3f(this.uColor, 0.0, 1.0, 0.58)
    gl.uniform1f(this.uAlpha, 1.0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.LINES, 0, arr.length / 3)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  destroy() {
    if (this.failed || !this.gl) return
    const gl = this.gl
    gl.deleteBuffer(this.buf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
  }
}
