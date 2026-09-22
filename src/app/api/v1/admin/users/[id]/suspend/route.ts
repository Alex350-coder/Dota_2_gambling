import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize, requireStepUp } from "@/platform/authz";
import { idParamSchema } from "../../../../schemas";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

/** T-903 — Security.md §7 sensitive operation: step-up + audit. */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "financial",
    handler: async () => {
      const { id } = await params;
      const parsedId = idParamSchema.safeParse({ id });
      if (!parsedId.success) {
        throw new DomainError("VALIDATION_FAILED", "user id must be a UUID");
      }

      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId: actorId, session } = await authorize(container, {
        token,
        action: "user:suspend",
        resource: { ownerId: "identity" },
      });
      requireStepUp(
        session,
        container.clock.now(),
        container.config.SESSION_STEPUP_MAX_AGE_MINUTES,
      );

      const user = await container.adminSuspendUser.execute({
        actorId,
        userId: parsedId.data.id,
      });
      return NextResponse.json({ user }, { status: 200 });
    },
  });
}
