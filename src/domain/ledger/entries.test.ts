import { describe, expect, it } from "vitest";
import { createLedgerTransaction, type LedgerEntryInput } from "./entries";

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

function baseEntries(): readonly LedgerEntryInput[] {
  return [
    {
      id: "entry-1",
      accountKey: "USER_AVAILABLE:user-1",
      currency: "PEN",
      signedAmountMinor: -10_000n,
    },
    {
      id: "entry-2",
      accountKey: "USER_LOCKED:user-1",
      currency: "PEN",
      signedAmountMinor: 10_000n,
    },
  ];
}

function baseInput() {
  return {
    id: "txn-1",
    kind: "RESERVE" as const,
    referenceType: "bet_order" as const,
    referenceId: "order-1",
    idempotencyKey: "idem-1",
    actorType: "USER" as const,
    actorId: "user-1",
    createdAt: FIXED_DATE,
    entries: baseEntries(),
  };
}

describe("createLedgerTransaction", () => {
  it("builds a transaction whose entries sum to zero (RULE-F05 / INV-02)", () => {
    const txn = createLedgerTransaction(baseInput());

    expect(txn.entries).toHaveLength(2);
    expect(txn.entries[0]?.transactionId).toBe("txn-1");
  });

  it("allows a system actor with no actorId", () => {
    const txn = createLedgerTransaction({
      ...baseInput(),
      actorType: "SYSTEM",
      actorId: undefined,
    });

    expect(txn.actorId).toBeUndefined();
  });

  it("allows more than two balanced entries (e.g. a settlement split)", () => {
    const txn = createLedgerTransaction({
      ...baseInput(),
      kind: "SETTLE_PAYOUT",
      entries: [
        {
          id: "e1",
          accountKey: "MARKET_ESCROW:market-1",
          currency: "PEN",
          signedAmountMinor: -10_000n,
        },
        {
          id: "e2",
          accountKey: "USER_AVAILABLE:winner",
          currency: "PEN",
          signedAmountMinor: 8_000n,
        },
        {
          id: "e3",
          accountKey: "STREAMER_PAYABLE:streamer-1",
          currency: "PEN",
          signedAmountMinor: 2_000n,
        },
      ],
    });

    expect(txn.entries).toHaveLength(3);
  });

  it("throws when the entries do not sum to zero (RULE-F05)", () => {
    expect(() => {
      createLedgerTransaction({
        ...baseInput(),
        entries: [
          {
            id: "entry-1",
            accountKey: "USER_AVAILABLE:user-1",
            currency: "PEN",
            signedAmountMinor: -10_000n,
          },
          {
            id: "entry-2",
            accountKey: "USER_LOCKED:user-1",
            currency: "PEN",
            signedAmountMinor: 9_000n,
          },
        ],
      });
    }).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("throws when a transaction mixes currencies (RULE-F16)", () => {
    expect(() => {
      createLedgerTransaction({
        ...baseInput(),
        entries: [
          {
            id: "entry-1",
            accountKey: "USER_AVAILABLE:user-1",
            currency: "PEN",
            signedAmountMinor: -10_000n,
          },
          {
            id: "entry-2",
            accountKey: "USER_LOCKED:user-1",
            currency: "USD",
            signedAmountMinor: 10_000n,
          },
        ],
      });
    }).toThrow(expect.objectContaining({ code: "CURRENCY_MISMATCH" }));
  });

  it("throws when fewer than two entries are given (not double-entry)", () => {
    expect(() => {
      createLedgerTransaction({
        ...baseInput(),
        entries: [
          {
            id: "entry-1",
            accountKey: "USER_AVAILABLE:user-1",
            currency: "PEN",
            signedAmountMinor: 0n,
          },
        ],
      });
    }).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("throws when an entry has an empty accountKey", () => {
    expect(() => {
      createLedgerTransaction({
        ...baseInput(),
        entries: [
          { id: "entry-1", accountKey: "", currency: "PEN", signedAmountMinor: -10_000n },
          {
            id: "entry-2",
            accountKey: "USER_LOCKED:user-1",
            currency: "PEN",
            signedAmountMinor: 10_000n,
          },
        ],
      });
    }).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});
