const MAX_DEVICE_PIXEL_RATIO = 2;

export interface HeroNetworkAnimationOptions {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  depth: number;
}

function particleCountForWidth(width: number): number {
  if (width < 640) return 22;
  if (width < 1024) return 40;
  return 70;
}

function createParticles(width: number, height: number, count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    const depth = Math.random();
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * (0.15 + depth * 0.25),
      vy: (Math.random() - 0.5) * (0.15 + depth * 0.25),
      radius: 1 + depth * 1.8,
      depth,
    });
  }
  return particles;
}

function wrap(value: number, max: number): number {
  if (max <= 0) return 0;
  if (value < 0) return value + max;
  if (value > max) return value - max;
  return value;
}

/** Falls back when the canvas hasn't been styled yet (e.g. under test). */
function readCssColor(canvas: HTMLCanvasElement, variable: string, fallback: string): string {
  const value = getComputedStyle(canvas).getPropertyValue(variable).trim();
  return value === "" ? fallback : value;
}

/**
 * Decorative "competitive network" particle field (T-717). Framework-agnostic on purpose
 * so it can be unit-tested without mounting React or a real canvas 2D context.
 */
export class HeroNetworkAnimation {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private frameId: number | null = null;

  constructor(options: HeroNetworkAnimationOptions) {
    this.canvas = options.canvas;
    this.ctx = options.context;
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    this.width = width;
    this.height = height;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${String(width)}px`;
    this.canvas.style.height = `${String(height)}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.particles = createParticles(width, height, particleCountForWidth(width));
  }

  renderStaticFrame(): void {
    this.advanceParticles();
    this.draw();
  }

  start(): void {
    if (this.frameId !== null) return;
    const step = () => {
      this.advanceParticles();
      this.draw();
      this.frameId = requestAnimationFrame(step);
    };
    this.frameId = requestAnimationFrame(step);
  }

  stop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private advanceParticles(): void {
    for (const particle of this.particles) {
      particle.x = wrap(particle.x + particle.vx, this.width);
      particle.y = wrap(particle.y + particle.vy, this.height);
    }
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const farColor = readCssColor(this.canvas, "--accent-secondary", "#22d3ee");
    const nearColor = readCssColor(this.canvas, "--accent-primary", "#6366f1");
    this.drawConnections(nearColor);
    this.drawParticles(farColor, nearColor);
  }

  private drawParticles(farColor: string, nearColor: string): void {
    const { ctx } = this;
    for (const particle of this.particles) {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = particle.depth > 0.6 ? nearColor : farColor;
      ctx.globalAlpha = 0.35 + particle.depth * 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Lines fade out with distance so the network reads as sparse signal, not a mesh. */
  private drawConnections(color: string): void {
    const { ctx, particles } = this;
    const maxDistance = 140;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      if (!a) continue;
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        if (!b) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance >= maxDistance) continue;
        ctx.globalAlpha = (1 - distance / maxDistance) * 0.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
