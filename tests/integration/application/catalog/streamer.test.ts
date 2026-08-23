import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleStreamerRepository } from "@/infra/db/repositories/streamer-repository";
import { DrizzleEconomicProfileRepository } from "@/infra/db/repositories/economic-profile-repository";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import {
  CreateStreamerChannelUseCase,
  CreateStreamerUseCase,
  UpdateStreamerCommissionUseCase,
} from "@/application/catalog/streamer";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("streamer catalog use cases", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();

  const createStreamer = new CreateStreamerUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    ids,
    audit,
  });

  const updateCommission = new UpdateStreamerCommissionUseCase<DbTx>({
    uow,
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    audit,
  });

  const createChannel = new CreateStreamerChannelUseCase<DbTx>({
    uow,
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    ids,
    audit,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUserAndAdmin(): Promise<{ userId: string; actorId: string }> {
    const userId = ids.next();
    const actorId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01'), ($3, $4, 'ACTIVE', '1990-01-01')",
      [
        userId,
        `streamer-${randomUUID()}@example.test`,
        actorId,
        `admin-${randomUUID()}@example.test`,
      ],
    );
    return { userId, actorId };
  }

  it("creates a streamer and emits exactly one STREAMER_CREATED audit event", async () => {
    const { userId, actorId } = await createUserAndAdmin();

    const streamer = await createStreamer.execute({
      actorId,
      userId,
      displayName: "StreamerOne",
      defaultCommissionBps: 2000,
    });

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'STREAMER_CREATED'",
        [streamer.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("reports RESOURCE_NOT_FOUND for an unknown userId", async () => {
    const { actorId } = await createUserAndAdmin();

    await expect(
      createStreamer.execute({
        actorId,
        userId: randomUUID(),
        displayName: "Ghost",
        defaultCommissionBps: 2000,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("creates a channel for an existing streamer and emits exactly one STREAMER_CHANNEL_CREATED audit event", async () => {
    const { userId, actorId } = await createUserAndAdmin();
    const streamer = await createStreamer.execute({
      actorId,
      userId,
      displayName: "StreamerTwo",
      defaultCommissionBps: 2000,
    });

    const channel = await createChannel.execute({
      actorId,
      streamerId: streamer.id,
      platform: "twitch",
      channelUrl: "https://twitch.tv/streamertwo",
    });

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'STREAMER_CHANNEL_CREATED'",
        [channel.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("updating a streamer's commission does not mutate an economic profile already created", async () => {
    const { userId, actorId } = await createUserAndAdmin();
    const streamer = await createStreamer.execute({
      actorId,
      userId,
      displayName: "StreamerThree",
      defaultCommissionBps: 2000,
    });

    const profile = await uow.run(async (tx: DbTx) =>
      new DrizzleEconomicProfileRepository(tx).create({
        id: randomUUID(),
        oddsNum: 18,
        oddsDen: 10,
        streamerCommissionBps: streamer.defaultCommissionBps,
        platformFeeBps: 0,
        currency: "PEN",
        minStakeMinor: 100n,
        maxStakeMinor: 10_000_000n,
      }),
    );

    await updateCommission.execute({
      actorId,
      streamerId: streamer.id,
      defaultCommissionBps: 3000,
    });

    const unchangedProfile = await uow.run(async (tx: DbTx) =>
      new DrizzleEconomicProfileRepository(tx).findById(profile.id),
    );
    expect(unchangedProfile?.streamerCommissionBps).toBe(2000);
  });
});
