export interface BetSlip {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: Date;
}

export interface CreateBetSlipInput {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: Date;
}

/**
 * `bet_orders.bet_slip_id` is `NOT NULL`; every placed order creates exactly one bet slip
 * (no parlay UI in this phase). Owner-scoped at construction like the other order-family repos.
 */
export interface BetSlipRepository {
  create(input: CreateBetSlipInput): Promise<BetSlip>;
}
