import { compileProgram, createTarget, releaseTarget, runProgram } from "./glassHeadlineGL";
import type { GlProgram, GlTarget } from "./glassHeadlineGL";
import { bevelPx, formed, follow, orbit } from "./glassHeadlineMath";
import { buildTextMask, type TextMaskResult } from "./glassHeadlineMask";
import { BLUR, FIELD, GLASS, VERT } from "./glassHeadlineShaders";

/** How long the glass takes to form on first paint. */
const FORM_MS = 1100;
/** The face's gentle dome comes from a blur this many times wider than the bevel's. */
const DOME = 3;
/** Seconds without pointer movement before the light goes back to drifting. */
const IDLE_S = 2.5;
/** Frame-time watchdog: this many frames slower than SLOW_FRAME_S switch to the light path. */
const SLOW_FRAME_S = 0.05;
const SLOW_FRAMES = 8;
/** A frame this slow is a software renderer, not a busy moment: it counts three times over. */
const CRAWL_FRAME_S = 0.15;

function paletteColor(palette: number[][], index: number): number[] {
  return palette[index] ?? [0, 0, 0];
}

interface Programs {
  readonly field: GlProgram;
  readonly blur: GlProgram;
  readonly glass: GlProgram;
}

export interface GlassHeadlineEngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly root: HTMLElement;
  readonly getTitleElement: () => HTMLElement | null;
  readonly initialPalette: number[][];
  /** Called once, right after WebGL2 setup succeeds (never called if it fails). */
  readonly onReady: () => void;
  /** Called after the GL context is lost and then restored - the caller should build a new engine. */
  readonly onContextRestored: () => void;
}

/**
 * Owns the glass-headline WebGL2 pipeline end to end (T-717): shader programs, render targets,
 * the adaptive frame loop, and the observers that drive it. Framework-agnostic so it can be
 * constructed/disposed from a single React effect without any WebGL state leaking into the
 * component itself.
 */
export class GlassHeadlineEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly root: HTMLElement;
  private readonly getTitleElement: () => HTMLElement | null;
  private readonly onReady: () => void;
  private readonly onContextRestored: () => void;
  private readonly reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

  private gl: WebGL2RenderingContext | null = null;
  private floatTargets = false;
  private programs: Programs | null = null;
  private disposed = false;

  private field: GlTarget | null = null;
  private blurA: GlTarget | null = null;
  private blurB: GlTarget | null = null;
  private maskTex: WebGLTexture | null = null;
  private builtKey = "";
  private bevel = 4;

  private palette: number[][];
  private raf = 0;
  private pendingResize = 0;
  private last = 0;
  private time = 0;
  private readyAt = -1;
  private inView = true;
  private lite = false;
  private judged = 0;
  private slow = 0;

  private light = { x: 0.5, y: 0.56 };
  private pointerX = 0.5;
  private pointerY = 0.56;
  private pointerAt = -1e9;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(options: GlassHeadlineEngineOptions) {
    this.canvas = options.canvas;
    this.root = options.root;
    this.getTitleElement = options.getTitleElement;
    this.onReady = options.onReady;
    this.onContextRestored = options.onContextRestored;
    this.palette = options.initialPalette;
  }

  setPalette(colors: number[][]): void {
    this.palette = colors;
  }

  rebuildMask(): void {
    if (this.disposed) return;
    this.buildMask();
    this.kick();
  }

  handlePointer(xRatio: number, yRatioFromTop: number): void {
    this.pointerX = xRatio;
    this.pointerY = yRatioFromTop;
    this.pointerAt = performance.now();
    this.kick();
  }

  start(): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;
    this.floatTargets = Boolean(gl.getExtension("EXT_color_buffer_float"));

    try {
      this.gl = gl;
      this.programs = {
        field: compileProgram(gl, VERT, FIELD),
        blur: compileProgram(gl, VERT, BLUR),
        glass: compileProgram(gl, VERT, GLASS),
      };
      gl.bindVertexArray(gl.createVertexArray());
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.resize();
    } catch {
      this.gl = null;
      this.programs = null;
      return;
    }

    this.readyAt = performance.now();
    this.onReady();
    this.kick();
    this.attachObservers();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.pendingResize);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.reduceMq.removeEventListener("change", this.handleReduceChange);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);

    const gl = this.gl;
    if (!gl) return;
    if (this.field) releaseTarget(gl, this.field);
    if (this.blurA) releaseTarget(gl, this.blurA);
    if (this.blurB) releaseTarget(gl, this.blurB);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    if (this.programs) {
      gl.deleteProgram(this.programs.field.program);
      gl.deleteProgram(this.programs.blur.program);
      gl.deleteProgram(this.programs.glass.program);
    }
  }

  private attachObservers(): void {
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.pendingResize);
      this.pendingResize = requestAnimationFrame(() => {
        if (this.disposed) return;
        this.resize();
        this.kick();
      });
    });
    this.resizeObserver.observe(this.root);

    this.intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      this.inView = entry ? entry.isIntersecting : true;
      if (this.inView) this.kick();
    });
    this.intersectionObserver.observe(this.root);

    document.addEventListener("visibilitychange", this.handleVisibility);
    this.reduceMq.addEventListener("change", this.handleReduceChange);
    document.fonts.ready
      .then(() => {
        this.rebuildMask();
      })
      .catch(() => undefined);
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private handleContextRestored = (): void => {
    this.onContextRestored();
  };

  private handleVisibility = (): void => {
    if (!document.hidden) this.kick();
  };

  private handleReduceChange = (): void => {
    this.kick();
  };

  /**
   * Lite draws the glass below CSS resolution and lets the browser scale it up: softer edges,
   * on a device that was dropping frames anyway. The field is drawn smaller still and stretched
   * through the glass - a fraction of the pixels, same look once refracted.
   */
  private resize(): void {
    const gl = this.gl;
    if (!gl) return;
    const dpr = this.lite ? 0.65 : Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const fieldScale = this.lite ? 0.25 : 0.4;
    const fw = Math.max(1, Math.round(w * fieldScale));
    const fh = Math.max(1, Math.round(h * fieldScale));
    if (this.field?.w !== fw || this.field.h !== fh) {
      if (this.field) releaseTarget(gl, this.field);
      this.field = createTarget(gl, fw, fh, false, this.floatTargets);
    }
    this.buildMask();
  }

  /**
   * Rebuilds the bevel height-field only when the headline's real text/layout actually changed -
   * first paint alone asks for this three or four times over with nothing changed, and each
   * build is four blur passes.
   */
  private buildMask(): void {
    const { gl, programs } = this;
    const heading = this.getTitleElement();
    if (!gl || !programs || !heading || !this.field) return;
    const scale = this.lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const result = buildTextMask({ heading, root: this.root, scale });
    if (!result || result.key === this.builtKey) return;
    this.builtKey = result.key;
    this.bevel = bevelPx(result.fontPx, scale);
    this.uploadMask(result);
    this.blurMask(gl, programs, result);
  }

  private uploadMask(result: TextMaskResult): void {
    const gl = this.gl;
    if (!gl) return;
    this.maskTex ??= gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, result.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Bevel across then down, then the dome across then down from the bevel. */
  private blurMask(gl: WebGL2RenderingContext, programs: Programs, result: TextMaskResult): void {
    const maskTex = this.maskTex;
    if (!maskTex) return;
    const w = result.canvas.width;
    const h = result.canvas.height;
    if (this.blurA?.w !== w || this.blurA.h !== h) {
      if (this.blurA) releaseTarget(gl, this.blurA);
      if (this.blurB) releaseTarget(gl, this.blurB);
      this.blurA = createTarget(gl, w, h, true, this.floatTargets);
      this.blurB = createTarget(gl, w, h, true, this.floatTargets);
    }
    const { blurA, blurB } = this;
    if (!blurB) return;
    runProgram(gl, this.canvas, programs.blur, blurA, {
      src: maskTex,
      step: [1 / w, 0],
      radius: this.bevel,
      read: 0,
      write: 0,
    });
    runProgram(gl, this.canvas, programs.blur, blurB, {
      src: blurA.tex,
      step: [0, 1 / h],
      radius: this.bevel,
      read: 1,
      write: 0,
    });
    runProgram(gl, this.canvas, programs.blur, blurA, {
      src: blurB.tex,
      step: [1 / w, 0],
      radius: this.bevel * DOME,
      read: 1,
      write: 1,
    });
    runProgram(gl, this.canvas, programs.blur, blurB, {
      src: blurA.tex,
      step: [0, 1 / h],
      radius: this.bevel * DOME,
      read: 2,
      write: 1,
    });
  }

  private computeForm(): number {
    if (this.reduceMq.matches || this.readyAt < 0) return 1;
    return formed(performance.now() - this.readyAt, FORM_MS);
  }

  private draw(): void {
    const { gl, programs, field, blurB } = this;
    if (!gl || !programs || !field || !blurB) return;
    const aspect = this.canvas.width / this.canvas.height;
    const p = this.palette;
    runProgram(gl, this.canvas, programs.field, field, {
      time: this.time,
      aspect,
      octaves: this.lite ? 3 : 5,
      c0: paletteColor(p, 0),
      c1: paletteColor(p, 1),
      c2: paletteColor(p, 2),
      c3: paletteColor(p, 3),
      c4: paletteColor(p, 4),
    });
    const form = this.computeForm();
    runProgram(gl, this.canvas, programs.glass, null, {
      field: field.tex,
      height: blurB.tex,
      htexel: [1 / blurB.w, 1 / blurB.h],
      bevel: this.bevel,
      aspect,
      light: [this.light.x, this.light.y],
      glass: 1,
      form,
      res: [this.canvas.width, this.canvas.height],
    });
  }

  private animating(): boolean {
    return this.inView && !document.hidden && !this.reduceMq.matches;
  }

  private judgePerformance(rawDt: number): void {
    if (this.lite || this.judged >= 40 || !this.animating()) return;
    this.judged += 1;
    if (this.judged > 3 && rawDt > SLOW_FRAME_S) {
      this.slow += rawDt > CRAWL_FRAME_S ? 3 : 1;
    }
    if (this.slow >= SLOW_FRAMES) {
      this.lite = true;
      this.resize();
    }
  }

  /** Eases the light toward the pointer (or a slow idle drift) and returns its target position. */
  private updateLight(now: number, dt: number): [number, number] {
    const idle = (now - this.pointerAt) / 1000 > IDLE_S;
    const shouldOrbit = idle && this.animating();
    const [ox, oy] = shouldOrbit ? orbit(this.time) : [this.pointerX, this.pointerY];
    const targetX = ox ?? 0.5;
    const targetY = oy ?? 0.56;
    const rate = idle ? 1.2 : 7;
    this.light.x = follow(this.light.x, targetX, dt, rate);
    this.light.y = follow(this.light.y, targetY, dt, rate);
    return [targetX, targetY];
  }

  /**
   * A hero is on screen a lot: it only keeps drawing while visible, the tab is showing and
   * motion is welcome, or while the light is still catching up with the pointer (which matters
   * even off that path, e.g. reduced motion where the pointer is the only thing that moves it).
   */
  private shouldScheduleNextFrame(targetX: number, targetY: number): boolean {
    const catching = Math.abs(this.light.x - targetX) + Math.abs(this.light.y - targetY) > 0.0015;
    const visible = this.inView && !document.hidden;
    const forming = this.readyAt >= 0 && performance.now() - this.readyAt < FORM_MS;
    return visible && (this.animating() || catching || forming);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(raw, 0.1);

    this.judgePerformance(raw);
    if (this.animating()) this.time += dt;

    const [targetX, targetY] = this.updateLight(now, dt);
    this.draw();

    if (this.shouldScheduleNextFrame(targetX, targetY)) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private kick(): void {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
}
