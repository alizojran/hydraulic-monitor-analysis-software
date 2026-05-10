import { hex2rgb, makeProgram, resizeCanvas } from './utils'

export class GLBars {
  canvas: HTMLCanvasElement
  failed = false
  private gl!: WebGL2RenderingContext
  private prog!: WebGLProgram
  private uColor!: WebGLUniformLocation
  private aPos!: number
  private aHeight!: number
  private buf!: WebGLBuffer
  private vao!: WebGLVertexArrayObject

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
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
      in float a_height;
      out float v_height;
      void main(){
        v_height = a_height;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`
    const fs = `#version 300 es
      precision highp float;
      in float v_height;
      uniform vec3 u_color;
      out vec4 frag;
      void main(){
        float a = mix(0.25, 1.0, v_height);
        vec3 col = u_color * mix(0.55, 1.15, v_height);
        frag = vec4(col, a);
      }`
    const prog = makeProgram(gl, vs, fs)
    if (!prog) {
      this.failed = true
      return
    }
    this.prog = prog

    this.uColor = gl.getUniformLocation(prog, 'u_color')!
    this.aPos = gl.getAttribLocation(prog, 'a_pos')
    this.aHeight = gl.getAttribLocation(prog, 'a_height')

    this.buf = gl.createBuffer()!
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 12, 0)
    gl.enableVertexAttribArray(this.aHeight)
    gl.vertexAttribPointer(this.aHeight, 1, gl.FLOAT, false, 12, 8)
    gl.bindVertexArray(null)
  }

  resize() {
    if (this.failed) return
    resizeCanvas(this.canvas, this.gl)
  }

  draw(spec: ArrayLike<number>, hex: string, opts: { maxScale?: number } = {}) {
    if (this.failed) return
    this.resize()
    const gl = this.gl
    const N = spec.length
    const maxScale = opts.maxScale ?? 0.92
    const gap = 0.15

    const arr = new Float32Array(N * 6 * 3)
    const barW = 2 / N
    for (let i = 0; i < N; i++) {
      const x0 = -1 + i * barW + barW * gap * 0.5
      const x1 = -1 + (i + 1) * barW - barW * gap * 0.5
      const yBottom = -1
      const yTop = -1 + Math.max(0.005, Math.min(1, (spec as ArrayLike<number>)[i])) * 2 * maxScale
      const o = i * 6 * 3
      arr[o] = x0
      arr[o + 1] = yBottom
      arr[o + 2] = 0
      arr[o + 3] = x1
      arr[o + 4] = yBottom
      arr[o + 5] = 0
      arr[o + 6] = x1
      arr[o + 7] = yTop
      arr[o + 8] = 1
      arr[o + 9] = x0
      arr[o + 10] = yBottom
      arr[o + 11] = 0
      arr[o + 12] = x1
      arr[o + 13] = yTop
      arr[o + 14] = 1
      arr[o + 15] = x0
      arr[o + 16] = yTop
      arr[o + 17] = 1
    }

    gl.clearColor(0.012, 0.018, 0.024, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    const [r, g, b] = hex2rgb(hex)
    gl.uniform3f(this.uColor, r, g, b)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.drawArrays(gl.TRIANGLES, 0, N * 6)
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
