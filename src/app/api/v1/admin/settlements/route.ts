import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";
import { pageQuerySchema } from "../../schemas";
import { serializeSettlementRun } from "./serialize";

/** Read-only listing — no requireStepUp() (nothing here moves money, unlike settle/void). */
export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      await authorize(container, {
        token,
        action: "settlement:manage",
        resource: { ownerId: "settlement" },
      });

      const query = parseQuery(request, pageQuerySchema);
      const result = await container.listSettlementRuns.execute(query);

      return NextResponse.json(
        {
          settlementRuns: result.items.map(serializeSettlementRun),
          meta: { total: result.total, page: result.page, limit: result.limit },
        },
        { status: 200 },
      );
    },
  });
}
