import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";
import { auditQuerySchema } from "../schemas";

/** T-907 — `audit:read` (ADMIN or AUDITOR, policy.ts), read-only, no step-up. */
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

      const query = parseQuery(request, auditQuerySchema);
      const result = await container.searchAuditEvents.execute({
        ...(query.page !== undefined ? { page: query.page } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
        ...(query.action !== undefined ? { action: query.action } : {}),
        ...(query.entityType !== undefined ? { entityType: query.entityType } : {}),
        ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
        ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
        ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
      });

      return NextResponse.json(
        {
          events: result.items,
          meta: { total: result.total, page: result.page, limit: result.limit },
        },
        { status: 200 },
      );
    },
  });
}
