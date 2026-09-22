// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultActions } from "./ResultActions";

const MARKET_ID = "11111111-1111-4111-8111-111111111111";
const OUTCOMES = [{ id: "outcome-1", label: "Radiant" }];

/**
 * T-905's core AC: "proposer cannot see a confirm action". The server (confirm.ts:59-65)
 * remains the real authority — this proves the UI mirrors it, not that it replaces it.
 */
describe("ResultActions (4-eyes rule)", () => {
  it("hides the Confirm button when the viewer is the proposer", () => {
    render(
      <ResultActions
        marketId={MARKET_ID}
        outcomes={OUTCOMES}
        result={{
          id: "result-1",
          status: "PROPOSED",
          proposedBy: "admin-a",
          winningOutcomeId: null,
        }}
        viewerUserId="admin-a"
      />,
    );

    expect(screen.queryByTestId("confirm-result")).not.toBeInTheDocument();
    expect(screen.getByText(/you proposed this result/i)).toBeInTheDocument();
  });

  it("shows the Confirm button to a different admin than the proposer", () => {
    render(
      <ResultActions
        marketId={MARKET_ID}
        outcomes={OUTCOMES}
        result={{
          id: "result-1",
          status: "PROPOSED",
          proposedBy: "admin-a",
          winningOutcomeId: null,
        }}
        viewerUserId="admin-b"
      />,
    );

    expect(screen.getByTestId("confirm-result")).toBeInTheDocument();
  });

  it("shows the propose form when no result exists yet", () => {
    render(
      <ResultActions
        marketId={MARKET_ID}
        outcomes={OUTCOMES}
        result={null}
        viewerUserId="admin-a"
      />,
    );

    expect(screen.getByRole("button", { name: /propose result/i })).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-result")).not.toBeInTheDocument();
  });
});
