export interface SharedDeviceMatch {
  readonly marketId: string;
  readonly otherUserId: string;
  readonly otherOrderId: string;
}

export interface RepeatedPairing {
  readonly otherUserId: string;
  readonly marketCount: number;
  readonly marketIds: readonly string[];
}

export interface OrderRateSignal {
  readonly userId: string;
  readonly recentCount: number;
}

export interface StakeSpikeSignal {
  readonly userId: string;
  readonly requestedMinor: string;
  readonly medianMinor: string | null;
  readonly priorCount: number;
}

export interface NewAccountBalanceSignal {
  readonly userId: string;
  readonly requestedMinor: string;
  readonly availableMinor: string;
  readonly accountAgeMinutes: number;
}

export interface NewDeviceSignal {
  readonly userId: string;
  readonly sessionId: string;
  readonly ipHash: string;
  readonly sessionAgeMinutes: number;
  readonly priorSightings: number;
}

export interface CloseWindowSignal {
  readonly orderCount: number;
}

/**
 * Read-only signal queries for the deterministic fraud rules (T-913/T-914,
 * compliance/FRAUD_PREVENTION.md §3) — one method per rule's data need. Kept as a single port
 * (rather than one per rule) because every method reads the same small set of tables
 * (bet_orders, audit_events, sessions, match_allocations, markets, users, wallets) and all are
 * consumed together by `evaluatePlacementRiskRules`.
 */
export interface RiskSignalReader {
  findSharedDeviceOppositeSideMatch(
    orderId: string,
    windowMinutes: number,
  ): Promise<SharedDeviceMatch | null>;
  findRepeatedPairings(orderId: string, minMarkets: number): Promise<readonly RepeatedPairing[]>;
  getOrderRateLastMinute(orderId: string): Promise<OrderRateSignal | null>;
  getStakeSpikeSignal(orderId: string): Promise<StakeSpikeSignal | null>;
  getNewAccountBalanceSignal(orderId: string): Promise<NewAccountBalanceSignal | null>;
  getNewDeviceSignal(orderId: string, windowMinutes: number): Promise<NewDeviceSignal | null>;
  getCloseWindowOrderCount(marketId: string, windowSeconds: number): Promise<CloseWindowSignal>;
}
