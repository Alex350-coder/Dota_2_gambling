import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize, requireStepUp } from "@/platform/authz";
import { createEconomicProfileSchema } from "../schemas";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId, session } = await authorize(container, {
        token,
        action: "catalog:manage",
        resource: { ownerId: "catalog" },
      });
      requireStepUp(
        session,
        container.clock.now(),
        container.config.SESSION_STEPUP_MAX_AGE_MINUTES,
      );

      const body = await parseJsonBody(request, createEconomicProfileSchema);
      const profile = await container.createEconomicProfile.execute({
        actorId: userId,
        oddsNum: body.oddsNum,
        oddsDen: body.oddsDen,
        streamerCommissionBps: body.streamerCommissionBps,
        platformFeeBps: body.platformFeeBps,
        currency: body.currency,
        minStakeMinor: BigInt(body.minStakeMinor),
        maxStakeMinor: BigInt(body.maxStakeMinor),
      });
      return NextResponse.json(
        {
          profile: {
            ...profile,
            minStakeMinor: profile.minStakeMinor.toString(),
            maxStakeMinor: profile.maxStakeMinor.toString(),
          },
        },
        { status: 201 },
      );
    },
  });
}
