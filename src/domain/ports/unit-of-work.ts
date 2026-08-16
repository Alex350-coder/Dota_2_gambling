/** Postgres transaction isolation levels this port supports (MATCHING_ENGINE.md §5). */
export type IsolationLevel = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

export interface RetryOptions {
  /** Total attempts including the first, e.g. 3 = 1 initial + 2 retries (MATCHING_ENGINE.md §7). */
  readonly attempts: number;
}

export interface UnitOfWorkOptions {
  readonly isolation?: IsolationLevel;
  readonly retry?: RetryOptions;
}

/**
 * `Tx` is deliberately opaque here — the domain layer must not import a driver/ORM type
 * (RULE-A01). Infra binds it to its concrete transaction handle when implementing this port.
 */
export interface UnitOfWork<Tx = unknown> {
  run<T>(work: (tx: Tx) => Promise<T>, opts?: UnitOfWorkOptions): Promise<T>;
}
