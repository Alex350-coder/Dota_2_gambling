export interface SystemHealthStatus {
  readonly migrationVersion: string | null;
  readonly pendingJobCount: number;
  readonly failedJobCount: number;
}

/**
 * T-909 — no secret or connection string is ever part of this shape (its own AC); `moneyMode`
 * is already exposed on `config` directly and rendered by the page without going through here.
 */
export interface SystemHealthReader {
  getStatus(): Promise<SystemHealthStatus>;
}
