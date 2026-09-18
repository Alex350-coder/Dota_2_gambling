import { describe, expect, it } from "vitest";
import { sumSessionMinutes } from "./activity-window";

describe("sumSessionMinutes", () => {
  const since = new Date("2026-01-01T00:00:00.000Z");
  const until = new Date("2026-01-02T00:00:00.000Z");

  it("sums whole-session durations fully inside the window", () => {
    const minutes = sumSessionMinutes(
      [
        {
          createdAt: new Date("2026-01-01T01:00:00.000Z"),
          lastSeenAt: new Date("2026-01-01T01:30:00.000Z"),
        },
        {
          createdAt: new Date("2026-01-01T02:00:00.000Z"),
          lastSeenAt: new Date("2026-01-01T02:10:00.000Z"),
        },
      ],
      since,
      until,
    );

    expect(minutes).toBe(40);
  });

  it("clips a session that starts before the window", () => {
    const minutes = sumSessionMinutes(
      [
        {
          createdAt: new Date("2025-12-31T23:50:00.000Z"),
          lastSeenAt: new Date("2026-01-01T00:10:00.000Z"),
        },
      ],
      since,
      until,
    );

    expect(minutes).toBe(10);
  });

  it("clips a session that ends after the window", () => {
    const minutes = sumSessionMinutes(
      [
        {
          createdAt: new Date("2026-01-01T23:50:00.000Z"),
          lastSeenAt: new Date("2026-01-02T00:10:00.000Z"),
        },
      ],
      since,
      until,
    );

    expect(minutes).toBe(10);
  });

  it("ignores a session that never overlaps the window", () => {
    const minutes = sumSessionMinutes(
      [
        {
          createdAt: new Date("2025-12-30T00:00:00.000Z"),
          lastSeenAt: new Date("2025-12-30T01:00:00.000Z"),
        },
      ],
      since,
      until,
    );

    expect(minutes).toBe(0);
  });

  it("returns 0 for no sessions", () => {
    expect(sumSessionMinutes([], since, until)).toBe(0);
  });
});
