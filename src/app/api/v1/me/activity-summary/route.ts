import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { activitySummaryQuerySchema } from "./schemas";

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "compliance:manage");

      const query = parseQuery(request, activitySummaryQuerySchema);
      const summary = await container.activitySummary.execute({
        userId,
        currency: query.currency ?? container.config.CURRENCY,
        period: query.period ?? "ALL",
      });

      return NextResponse.json(
        {
          summary: {
            period: summary.period,
            totalStakedMinor: summary.totalStakedMinor.toString(),
            totalWonMinor: summary.totalWonMinor.toString(),
            netResultMinor: summary.netResultMinor.toString(),
            betCount: summary.betCount,
            timeOnSiteMinutes: summary.timeOnSiteMinutes,
          },
        },
        { status: 200 },
      );
    },
  });
}
