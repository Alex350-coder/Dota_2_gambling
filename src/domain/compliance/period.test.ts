import { describe, expect, it } from "vitest";
import { periodStart } from "./period";

describe("periodStart", () => {
  it("DAY returns midnight UTC of the same day", () => {
    const now = new Date("2026-03-18T15:42:07.123Z");
    expect(periodStart("DAY", now)).toEqual(new Date("2026-03-18T00:00:00.000Z"));
  });

  it("WEEK returns the Monday of the current ISO week", () => {
    const wednesday = new Date("2026-03-18T15:42:07.123Z");
    expect(periodStart("WEEK", wednesday)).toEqual(new Date("2026-03-16T00:00:00.000Z"));
  });

  it("WEEK on a Sunday returns the preceding Monday, not the same day", () => {
    const sunday = new Date("2026-03-22T00:00:00.000Z");
    expect(periodStart("WEEK", sunday)).toEqual(new Date("2026-03-16T00:00:00.000Z"));
  });

  it("WEEK on a Monday returns the same day", () => {
    const monday = new Date("2026-03-16T09:00:00.000Z");
    expect(periodStart("WEEK", monday)).toEqual(new Date("2026-03-16T00:00:00.000Z"));
  });

  it("MONTH returns the first day of the current month at midnight UTC", () => {
    const now = new Date("2026-03-18T15:42:07.123Z");
    expect(periodStart("MONTH", now)).toEqual(new Date("2026-03-01T00:00:00.000Z"));
  });
});
