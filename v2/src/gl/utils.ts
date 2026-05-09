export function hex2rgb(h: string): [number, number, number] {
  const v = h.replace('#', '')
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ]
}

export function makeProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  function compile(type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile failed:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const vs = compile(gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc)
  if (!vs || !fs) return null
  const p = gl.createProgram()!
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('Link failed:', gl.getProgramInfoLog(p))
    return null
  }
  return p
}

export function resizeCanvas(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
  const r = canvas.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.floor(r.width * dpr)
  const h = Math.floor(r.height * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  gl.viewport(0, 0, w, h)
}
