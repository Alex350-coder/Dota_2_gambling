/** Generic WebGL2 plumbing for the glass-headline hero (T-717): shader/program compilation, render targets, and a single draw-call helper. No hero-specific logic lives here. */

export interface GlTarget {
  readonly tex: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  readonly w: number;
  readonly h: number;
}

export interface GlProgram {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

export type UniformValue = number | number[] | WebGLTexture;

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader) ?? "unknown error"}`);
  }
  return shader;
}

export function compileProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): GlProgram {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace(/^u_/, "")] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

export function createTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  precise: boolean,
  floatTargets: boolean,
): GlTarget {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (precise && floatTargets) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

export function releaseTarget(gl: WebGL2RenderingContext, target: GlTarget): void {
  gl.deleteTexture(target.tex);
  gl.deleteFramebuffer(target.fbo);
}

function applyUniform(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  value: UniformValue,
  unit: number,
): boolean {
  if (typeof value === "number") {
    gl.uniform1f(loc, value);
    return false;
  }
  if (Array.isArray(value)) {
    const arr: number[] = value;
    if (arr.length === 2) gl.uniform2f(loc, arr[0] ?? 0, arr[1] ?? 0);
    else gl.uniform3f(loc, arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0);
    return false;
  }
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, value);
  gl.uniform1i(loc, unit);
  return true;
}

export function runProgram(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  prog: GlProgram,
  dst: GlTarget | null,
  uniforms: Record<string, UniformValue>,
): void {
  gl.useProgram(prog.program);
  let unit = 0;
  for (const [key, value] of Object.entries(uniforms)) {
    const loc = prog.uniforms[key];
    if (!loc) continue;
    if (applyUniform(gl, loc, value, unit)) unit += 1;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
  gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
