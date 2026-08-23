import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize, requireStepUp } from "@/platform/authz";
import { createTournamentSchema } from "../schemas";

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

      const body = await parseJsonBody(request, createTournamentSchema);
      const tournament = await container.createTournament.execute({
        actorId: userId,
        gameId: body.gameId,
        name: body.name,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      });
      return NextResponse.json({ tournament }, { status: 201 });
    },
  });
}
