export interface Outcome {
  readonly id: string;
  readonly marketId: string;
  readonly code: string;
  readonly label: string;
  readonly createdAt: Date;
}

export interface CreateOutcomeInput {
  readonly id: string;
  readonly marketId: string;
  readonly code: string;
  readonly label: string;
}

/** `outcomes` is set once at market creation and never mutated afterwards. */
export interface OutcomeRepository {
  create(input: CreateOutcomeInput): Promise<Outcome>;
  listByMarketId(marketId: string): Promise<Outcome[]>;
}
