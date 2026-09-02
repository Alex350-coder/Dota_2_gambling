import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize, requireStepUp } from "@/platform/authz";
import { idParamSchema } from "../../../../schemas";
import { serializeSettlementRun } from "../../../settlements/serialize";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

/** Idempotent (SETTLEMENT.md §2): resumes an existing FAILED run, no-ops a COMPLETED one via ALREADY_SETTLED. */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "financial",
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
        action: "settlement:manage",
        resource: { ownerId: "settlement" },
      });
      requireStepUp(
        session,
        container.clock.now(),
        container.config.SESSION_STEPUP_MAX_AGE_MINUTES,
      );

      const run = await container.settleMarket.execute({
        actorId: userId,
        marketId: parsedId.data.id,
      });
      return NextResponse.json({ run: serializeSettlementRun(run) }, { status: 200 });
    },
  });
}
