import { describe, expect, test } from "vitest";
import { MAX_PAGE_SIZE, paginate } from "./pagination";

describe("paginate", () => {
  const all = Array.from({ length: 75 }, (_, i) => i);

  test("defaults to page 1 with the default page size", () => {
    const result = paginate(all, {});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.items).toEqual(all.slice(0, 20));
    expect(result.total).toBe(75);
  });

  test("slices the requested page", () => {
    const result = paginate(all, { page: 2, limit: 10 });
    expect(result.items).toEqual(all.slice(10, 20));
  });

  test("clamps limit to the hard maximum page size", () => {
    const result = paginate(all, { limit: 1000 });
    expect(result.limit).toBe(MAX_PAGE_SIZE);
    expect(result.items).toHaveLength(MAX_PAGE_SIZE);
  });

  test("returns an empty page past the end of the list", () => {
    const result = paginate(all, { page: 100, limit: 20 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(75);
  });

  test("treats non-positive page and limit as unset", () => {
    const result = paginate(all, { page: 0, limit: -5 });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
