import { sql } from "drizzle-orm";
import type { Clock, IdGenerator } from "@/domain/ports";
import { auditEvents, rateLimitBuckets } from "./schema/platform";
import type { DbTx } from "./uow";

/** Rate-limit classes and their per-window ceilings (Routes.md §4). */
export type RateLimitClass = "auth-strict" | "financial" | "default" | "public";

interface RateLimitRule {
  readonly max: number;
  readonly windowSeconds: number;
}

const RATE_LIMIT_RULES: Readonly<Record<RateLimitClass, RateLimitRule>> = {
  "auth-strict": { max: 10, windowSeconds: 60 },
  financial: { max: 30, windowSeconds: 60 },
  default: { max: 120, windowSeconds: 60 },
  public: { max: 60, windowSeconds: 60 },
};

export interface RateLimitCheckInput {
  readonly rateLimitClass: RateLimitClass;
  readonly userId: string | null;
  readonly ipHash: string;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Fixed-window counter backed by rate_limit_buckets (T-313, no Redis in the
 * MVP). Keyed by userId when authenticated, else ipHash, matching
 * Routes.md §4's "per-IP and per-user" intent without needing two separate
 * bucket rows per request.
 */
export class RateLimiter {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async check(tx: DbTx, input: RateLimitCheckInput): Promise<RateLimitResult> {
    const rule = RATE_LIMIT_RULES[input.rateLimitClass];
    const windowMs = rule.windowSeconds * 1000;
    const now = this.clock.now();
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const identity = input.userId ?? input.ipHash;
    const bucketKey = `${input.rateLimitClass}:${identity}`;

    const [row] = await tx
      .insert(rateLimitBuckets)
      .values({ bucketKey, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBuckets.bucketKey, rateLimitBuckets.windowStart],
        set: { count: sql`${rateLimitBuckets.count} + 1` },
      })
      .returning({ count: rateLimitBuckets.count });

    if (!row) {
      throw new Error("rate limit bucket upsert returned no row");
    }

    const allowed = row.count <= rule.max;
    const retryAfterSeconds = allowed
      ? 0
      : Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);

    // Only the request that first crosses the threshold writes an audit event —
    // otherwise every subsequent request in the same window would emit one too.
    if (row.count === rule.max + 1) {
      await this.recordBreach(tx, input, now);
    }

    return { allowed, retryAfterSeconds };
  }

  /**
   * Only attributable when the caller is authenticated (entity_id is a
   * non-null uuid FK-shaped column) — anonymous/IP-only breaches (e.g. public
   * registration spam) have no user entity to attach the event to. The
   * dedicated audit writer (T-314) reuses this same table going forward.
   */
  private async recordBreach(tx: DbTx, input: RateLimitCheckInput, now: Date): Promise<void> {
    if (!input.userId) {
      return;
    }
    await tx.insert(auditEvents).values({
      id: this.ids.next(),
      actorType: "user",
      actorId: input.userId,
      action: "RATE_LIMIT_BREACH",
      entityType: "user",
      entityId: input.userId,
      ipHash: input.ipHash,
      createdAt: now,
    });
  }
}
