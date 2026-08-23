import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize, requireStepUp } from "@/platform/authz";
import { idParamSchema } from "../../../../schemas";
import { transitionMarketSchema } from "../../../schemas";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const { id } = await params;
      const parsedId = idParamSchema.safeParse({ id });
      if (!parsedId.success) {
        throw new DomainError("VALIDATION_FAILED", "market id must be a UUID");
      }

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

      const body = await parseJsonBody(request, transitionMarketSchema);
      const market = await container.transitionMarket.execute({
        actorId: userId,
        marketId: parsedId.data.id,
        actor: "ADMIN",
        to: body.to,
        ...(body.manualClose !== undefined ? { manualClose: body.manualClose } : {}),
        ...(body.matchPlayed !== undefined ? { matchPlayed: body.matchPlayed } : {}),
      });
      return NextResponse.json({ market }, { status: 200 });
    },
  });
}
