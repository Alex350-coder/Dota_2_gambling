import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize, requireStepUp } from "@/platform/authz";
import { createMarketSchema } from "../schemas";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId, session } = await authorize(container, {
        token,
        action: "market:manage",
        resource: { ownerId: "catalog" },
      });
      requireStepUp(
        session,
        container.clock.now(),
        container.config.SESSION_STEPUP_MAX_AGE_MINUTES,
      );

      const body = await parseJsonBody(request, createMarketSchema);
      const market = await container.createMarket.execute({
        actorId: userId,
        matchId: body.matchId,
        marketTypeId: body.marketTypeId,
        streamerId: body.streamerId,
        economicProfileId: body.economicProfileId,
        closesAt: new Date(body.closesAt),
        outcomes: body.outcomes,
      });
      return NextResponse.json({ market }, { status: 201 });
    },
  });
}
