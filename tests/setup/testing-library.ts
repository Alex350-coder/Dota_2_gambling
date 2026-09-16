import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/** Unmounts every component tree after each test so component tests never leak DOM state. */
afterEach(() => {
  cleanup();
});
