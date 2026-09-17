"use client";

import { useState } from "react";
import { BetForm, type BetOrderResponse } from "./BetForm";
import { OrderCard } from "./OrderCard";

interface MarketOutcome {
  readonly outcomeId: string;
  readonly label: string;
}

interface MarketBettingPanelProps {
  readonly marketId: string;
  readonly currency: string;
  readonly outcomes: readonly MarketOutcome[];
}

export function MarketBettingPanel({ marketId, currency, outcomes }: MarketBettingPanelProps) {
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    outcomes[0]?.outcomeId ?? null,
  );
  const [orders, setOrders] = useState<readonly BetOrderResponse[]>([]);

  function handlePlaced(order: BetOrderResponse) {
    setOrders((current) => [order, ...current]);
  }

  function handleCancelled(cancelled: BetOrderResponse) {
    setOrders((current) => current.map((order) => (order.id === cancelled.id ? cancelled : order)));
  }

  if (selectedOutcomeId === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="bet-outcome" className="text-sm font-medium text-[var(--text-primary)]">
        Outcome
      </label>
      <select
        id="bet-outcome"
        value={selectedOutcomeId}
        onChange={(event) => {
          setSelectedOutcomeId(event.target.value);
        }}
        className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {outcomes.map((outcome) => (
          <option key={outcome.outcomeId} value={outcome.outcomeId}>
            {outcome.label}
          </option>
        ))}
      </select>

      <BetForm
        marketId={marketId}
        outcomeId={selectedOutcomeId}
        currency={currency}
        onPlaced={handlePlaced}
      />

      {orders.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Your orders</h3>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              currency={currency}
              onCancelled={handleCancelled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
