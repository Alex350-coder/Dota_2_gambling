import { expect } from "vitest";

export interface CrossUserIsolationCase<Result> {
  readonly owner: string;
  readonly attacker: string;
  readonly resourceId: string;
  readonly attempt: (actingUserId: string, resourceId: string) => Promise<Result>;
  readonly expectedCode?: string;
}

/**
 * Reusable isolation assertion (T-317): calling `attempt` as `attacker` against a
 * resource owned by `owner` must fail as if the resource didn't exist for the
 * attacker (RULE-E02 — cross-user reads/writes report RESOURCE_NOT_FOUND, never
 * a distinguishing 403/other code that would confirm the resource's existence).
 */
export async function expectCrossUserIsolation<Result>(
  testCase: CrossUserIsolationCase<Result>,
): Promise<void> {
  const { attacker, resourceId, attempt, expectedCode = "RESOURCE_NOT_FOUND" } = testCase;

  await expect(attempt(attacker, resourceId)).rejects.toMatchObject({
    code: expectedCode,
  });
}
