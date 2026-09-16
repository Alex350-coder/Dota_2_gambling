// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BetForm, type BetOrderResponse } from "./BetForm";

const MARKET_ID = "11111111-1111-4111-8111-111111111111";
const OUTCOME_ID = "22222222-2222-4222-8222-222222222222";

function renderForm(onPlaced: (order: BetOrderResponse) => void = vi.fn()) {
  render(
    <BetForm marketId={MARKET_ID} outcomeId={OUTCOME_ID} currency="PEN" onPlaced={onPlaced} />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
});

describe("BetForm", () => {
  it("disables the submit button until a valid amount is entered", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /place bet/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/stake amount/i), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /place bet/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/stake amount/i), { target: { value: "100" } });
    expect(screen.getByRole("button", { name: /place bet/i })).toBeEnabled();
  });

  it("shows a fixed-odds estimate derived from bigint math, not floats", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/stake amount/i), { target: { value: "100" } });
    expect(screen.getByText(/estimated return/i)).toHaveTextContent("180");
  });

  it("submits the bet and calls onPlaced with the server-confirmed order", async () => {
    document.cookie = "csrf_token=test-token";
    const order: BetOrderResponse = {
      id: "order-1",
      marketId: MARKET_ID,
      outcomeId: OUTCOME_ID,
      requestedMinor: "100",
      matchedMinor: "0",
      unmatchedMinor: "100",
      releasedMinor: "0",
      oddsNum: 18,
      oddsDen: 10,
      status: "OPEN",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ order }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPlaced = vi.fn();
    renderForm(onPlaced);

    fireEvent.change(screen.getByLabelText(/stake amount/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));

    await waitFor(() => {
      expect(onPlaced).toHaveBeenCalledWith(order);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/bets");
    expect(init.headers).toMatchObject({ "x-csrf-token": "test-token" });
  });

  it("shows a friendly message when the server rejects with STALE_STATE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { code: "STALE_STATE", message: "stale" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();

    fireEvent.change(screen.getByLabelText(/stake amount/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/market changed/i);
  });
});
