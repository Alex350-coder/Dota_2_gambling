// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isValidAmountMinorInput, Money } from "./Money";

describe("Money", () => {
  it("renders whole units with a zero-padded fractional part", () => {
    render(<Money amountMinor="10000" currency="PEN" />);
    expect(screen.getByTestId("money")).toHaveTextContent("PEN 100.00");
  });

  it("renders a fractional remainder without dropping the leading zero", () => {
    render(<Money amountMinor="105" currency="PEN" />);
    expect(screen.getByTestId("money")).toHaveTextContent("PEN 1.05");
  });

  it("groups large major amounts", () => {
    render(<Money amountMinor="123456789" currency="PEN" />);
    expect(screen.getByTestId("money")).toHaveTextContent("PEN 1,234,567.89");
  });

  it("renders a leading minus for negative amounts", () => {
    render(<Money amountMinor="-500" currency="PEN" />);
    expect(screen.getByTestId("money")).toHaveTextContent("-PEN 5.00");
  });

  it("renders an explicit plus sign when signed and positive", () => {
    render(<Money amountMinor="500" currency="PEN" signed />);
    expect(screen.getByTestId("money")).toHaveTextContent("+PEN 5.00");
  });

  it("never applies a plus sign to a zero amount even when signed", () => {
    render(<Money amountMinor="0" currency="PEN" signed />);
    expect(screen.getByTestId("money")).toHaveTextContent("PEN 0.00");
  });

  it("throws for a non-integer amountMinor string", () => {
    expect(() => render(<Money amountMinor="12.5" currency="PEN" />)).toThrow();
  });
});

describe("isValidAmountMinorInput", () => {
  it("accepts a positive integer string with no leading zero", () => {
    expect(isValidAmountMinorInput("100")).toBe(true);
  });

  it("rejects zero, negatives, decimals, and leading zeros", () => {
    expect(isValidAmountMinorInput("0")).toBe(false);
    expect(isValidAmountMinorInput("-1")).toBe(false);
    expect(isValidAmountMinorInput("1.5")).toBe(false);
    expect(isValidAmountMinorInput("01")).toBe(false);
  });
});
