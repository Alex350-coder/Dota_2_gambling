import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { runAllReconcileChecks } from "@/infra/db/reconcile-queries";
import { alertOnReconciliationFailures } from "@/application/admin";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";

/**
 * T-908 — reuses `runAllReconcileChecks` verbatim (the same INV-01..15 queries
 * `scripts/reconcile.ts`/CI's nightly job run), inside the identical
 * `BEGIN ISOLATION LEVEL REPEATABLE READ` transaction pattern, so the admin view can never
 * report a different result than the CLI/CI invariant check. `audit:read` (ADMIN or AUDITOR),
 * read-only, no step-up.
 */
export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      await authorize(container, {
        token,
        action: "audit:read",
        resource: { ownerId: "system" },
      });

      const client = await container.pool.connect();
      let results;
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        results = await runAllReconcileChecks(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      await alertOnReconciliationFailures(results, container.alertNotifier);

      return NextResponse.json(
        { generatedAt: new Date().toISOString(), moneyMode: container.config.MONEY_MODE, results },
        { status: 200 },
      );
    },
  });
}
