import { makeProgram, resizeCanvas } from './utils'

export class GLHeatmap {
  canvas: HTMLCanvasElement
  failed = false
  freqBins: number
  timeCols: number
  private gl!: WebGL2RenderingContext
  private prog!: WebGLProgram
  private uTex!: WebGLUniformLocation
  private uOffset!: WebGLUniformLocation
  private uFilled!: WebGLUniformLocation
  private vao!: WebGLVertexArrayObject
  private quadBuf!: WebGLBuffer
  private tex!: WebGLTexture
  private writeCol = 0
  private totalWrites = 0
  private colBuffer: Uint8Array

  constructor(canvas: HTMLCanvasElement, freqBins = 128, timeCols = 256) {
    this.canvas = canvas
    this.freqBins = freqBins
    this.timeCols = timeCols
    this.colBuffer = new Uint8Array(freqBins)

    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true })
    if (!gl) { this.failed = true; return }
    this.gl = gl

    const vs = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main(){
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`
    const fs = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_tex;
      uniform float u_offset;
      uniform float u_filled;
      out vec4 frag;

      vec3 heat(float t){
        t = clamp(t, 0.0, 1.0);
        vec3 c;
        if(t < 0.15)      c = mix(vec3(0.005,0.02,0.06), vec3(0.0,0.5,0.9),  t/0.15);
        else if(t < 0.40) c = mix(vec3(0.0,0.5,0.9),    vec3(0.0,0.95,0.85),(t-0.15)/0.25);
        else if(t < 0.65) c = mix(vec3(0.0,0.95,0.85),  vec3(1.0,0.85,0.10),(t-0.40)/0.25);
        else if(t < 0.85) c = mix(vec3(1.0,0.85,0.10),  vec3(1.0,0.30,0.20),(t-0.65)/0.20);
        else              c = mix(vec3(1.0,0.30,0.20),  vec3(1.0,0.95,0.95),(t-0.85)/0.15);
        return c;
      }

      void main(){
        float texX = mod(u_offset - (1.0 - v_uv.x), 1.0);
        float texY = v_uv.y;
        float v = texture(u_tex, vec2(texX, texY)).r;
        float visibleX = 1.0 - u_filled;
        float vis = step(visibleX, v_uv.x);
        frag = vec4(heat(v) * vis, vis);
      }`
    const prog = makeProgram(gl, vs, fs)
    if (!prog) { this.failed = true; return }
    this.prog = prog

    this.uTex = gl.getUniformLocation(prog, 'u_tex')!
    this.uOffset = gl.getUniformLocation(prog, 'u_offset')!
    this.uFilled = gl.getUniformLocation(prog, 'u_filled')!

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    this.quadBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, timeCols, freqBins)
  }

  resize() {
    if (this.failed) return
    resizeCanvas(this.canvas, this.gl)
  }

  pushColumn(spec: ArrayLike<number>) {
    if (this.failed) return
    const gl = this.gl
    const out = this.colBuffer
    const N = spec.length
    if (N === this.freqBins) {
      for (let i = 0; i < N; i++) out[i] = Math.max(0, Math.min(255, Math.round((spec as ArrayLike<number>)[i] * 255)))
    } else {
      for (let i = 0; i < this.freqBins; i++) {
        const t = (i / (this.freqBins - 1)) * (N - 1)
        const i0 = Math.floor(t), i1 = Math.min(N - 1, i0 + 1)
        const f = t - i0
        const v = (spec as ArrayLike<number>)[i0] * (1 - f) + (spec as ArrayLike<number>)[i1] * f
        out[i] = Math.max(0, Math.min(255, Math.round(v * 255)))
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, this.writeCol, 0, 1, this.freqBins, gl.RED, gl.UNSIGNED_BYTE, out)
    this.writeCol = (this.writeCol + 1) % this.timeCols
    this.totalWrites++
  }

  draw() {
    if (this.failed) return
    this.resize()
    const gl = this.gl
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(this.uTex, 0)
    gl.uniform1f(this.uOffset, this.writeCol / this.timeCols)
    gl.uniform1f(this.uFilled, Math.min(1, this.totalWrites / this.timeCols))
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }

  destroy() {
    if (this.failed || !this.gl) return
    const gl = this.gl
    gl.deleteTexture(this.tex)
    gl.deleteBuffer(this.quadBuf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
  }
}
