import type { SystemHealthReader, SystemHealthStatus, UnitOfWork } from "@/domain/ports";

export interface GetSystemHealthDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly systemHealth: (tx: Tx) => SystemHealthReader;
}

/** T-909 — jobs/queue depth/migration version; MONEY_MODE comes straight from `config` and is
 * never part of this shape (no secret/connection string either, per T-909's own AC). */
export class GetSystemHealthUseCase<Tx> {
  constructor(private readonly deps: GetSystemHealthDeps<Tx>) {}

  async execute(): Promise<SystemHealthStatus> {
    return this.deps.uow.run((tx) => this.deps.systemHealth(tx).getStatus());
  }
}
