// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroNetworkAnimation } from "./heroNetworkAnimation";

function fakeContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
}

function createAnimation() {
  const canvas = document.createElement("canvas");
  const ctx = fakeContext();
  const animation = new HeroNetworkAnimation({
    canvas,
    context: ctx as unknown as CanvasRenderingContext2D,
  });
  return { animation, ctx };
}

describe("HeroNetworkAnimation", () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws more particles at desktop width than at mobile width", () => {
    const { animation, ctx } = createAnimation();

    animation.resize(320, 800);
    animation.renderStaticFrame();
    const mobileArcCalls = ctx.arc.mock.calls.length;

    ctx.arc.mockClear();
    animation.resize(1440, 800);
    animation.renderStaticFrame();
    const desktopArcCalls = ctx.arc.mock.calls.length;

    expect(desktopArcCalls).toBeGreaterThan(mobileArcCalls);
  });

  it("only ever schedules one animation frame per start() call", () => {
    const { animation } = createAnimation();
    animation.resize(800, 600);

    animation.start();
    animation.start();

    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("stop() cancels the frame and allows a clean restart", () => {
    const { animation } = createAnimation();
    animation.resize(800, 600);

    animation.start();
    animation.stop();
    expect(cafSpy).toHaveBeenCalledTimes(1);

    animation.start();
    expect(rafSpy).toHaveBeenCalledTimes(2);
  });

  it("stop() before start() is a safe no-op", () => {
    const { animation } = createAnimation();
    animation.resize(800, 600);

    expect(() => {
      animation.stop();
    }).not.toThrow();
    expect(cafSpy).not.toHaveBeenCalled();
  });
});
