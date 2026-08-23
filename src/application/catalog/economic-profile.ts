import { DomainError } from "@/domain/errors";
import { assertValidBps, BPS_DENOMINATOR } from "@/domain/money";
import type {
  AuditWriter,
  EconomicProfileRepository,
  IdGenerator,
  PersistedEconomicProfile,
  UnitOfWork,
} from "@/domain/ports";
import { economicProfileCreatedEvent } from "@/application/audit/writer";

export interface CreateEconomicProfileInput {
  readonly actorId: string;
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly streamerCommissionBps: number;
  readonly platformFeeBps: number;
  readonly currency: string;
  readonly minStakeMinor: bigint;
  readonly maxStakeMinor: bigint;
}

export interface CreateEconomicProfileDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Admin-only economic-profile creation (T-405). `economic_profiles` is
 * append-only (RULE-F04) — profiles are never updated once created, only
 * superseded by a new profile that future markets reference instead.
 *
 * The self-funding check mirrors `chk_ep_self_funding` (db/migrations/0006_catalog.sql)
 * so a bad admin input fails with a clear `DomainError` here rather than a raw
 * Postgres constraint-violation error.
 */
export class CreateEconomicProfileUseCase<Tx> {
  constructor(private readonly deps: CreateEconomicProfileDeps<Tx>) {}

  async execute(input: CreateEconomicProfileInput): Promise<PersistedEconomicProfile> {
    if (!Number.isInteger(input.oddsNum) || input.oddsNum <= 0) {
      throw new DomainError("VALIDATION_FAILED", "oddsNum must be a positive integer", {
        details: { field: "oddsNum" },
      });
    }
    if (!Number.isInteger(input.oddsDen) || input.oddsDen <= 0) {
      throw new DomainError("VALIDATION_FAILED", "oddsDen must be a positive integer", {
        details: { field: "oddsDen" },
      });
    }
    assertValidBps(input.streamerCommissionBps);
    assertValidBps(input.platformFeeBps);
    if (input.minStakeMinor <= 0n || input.minStakeMinor > input.maxStakeMinor) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "minStakeMinor must be positive and <= maxStakeMinor",
        {
          details: { field: "minStakeMinor" },
        },
      );
    }

    const bps = BPS_DENOMINATOR;
    const selfFunded =
      BigInt(input.oddsNum) * BPS_DENOMINATOR <=
      BigInt(input.oddsDen) *
        (2n * bps - BigInt(input.streamerCommissionBps) - BigInt(input.platformFeeBps));
    if (!selfFunded) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "odds/commission combination is not self-funding under the fixed economic model",
        { details: { field: "oddsNum", reason: "NOT_SELF_FUNDING" } },
      );
    }

    return this.deps.uow.run(async (tx) => {
      const profile = await this.deps.economicProfiles(tx).create({
        id: this.deps.ids.next(),
        oddsNum: input.oddsNum,
        oddsDen: input.oddsDen,
        streamerCommissionBps: input.streamerCommissionBps,
        platformFeeBps: input.platformFeeBps,
        currency: input.currency,
        minStakeMinor: input.minStakeMinor,
        maxStakeMinor: input.maxStakeMinor,
      });

      await this.deps.audit.record(tx, economicProfileCreatedEvent(input.actorId, profile.id));

      return profile;
    });
  }
}
