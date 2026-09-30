// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroMarketPreview } from "./HeroMarketPreview";

describe("HeroMarketPreview", () => {
  it("renders as a labelled, non-interactive illustration", () => {
    render(<HeroMarketPreview />);
    const preview = screen.getByLabelText("Illustrative market preview, simulation only");
    expect(preview.querySelectorAll("button, a, input")).toHaveLength(0);
  });

  it("shows the fixed 1.8x odds and both illustrative outcomes", () => {
    render(<HeroMarketPreview />);
    expect(screen.getByText("1.8x")).toBeInTheDocument();
    expect(screen.getByText("WIN")).toBeInTheDocument();
    expect(screen.getByText("LOSE")).toBeInTheDocument();
  });

  it("labels itself as simulation mode, not a live market", () => {
    render(<HeroMarketPreview />);
    expect(screen.getByText(/simulation mode/i)).toBeInTheDocument();
  });
});
