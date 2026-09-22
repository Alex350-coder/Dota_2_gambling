import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";
import { idParamSchema } from "../../../schemas";
import { serializeUser } from "../serialize";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

/** Single-user detail read — audited every time via GetUserUseCase (OBSERVABILITY.md §1). */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const { id } = await params;
      const parsedId = idParamSchema.safeParse({ id });
      if (!parsedId.success) {
        throw new DomainError("VALIDATION_FAILED", "user id must be a UUID");
      }

      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId: actorId } = await authorize(container, {
        token,
        action: "user:read",
        resource: { ownerId: "identity" },
      });

      const user = await container.getUser.execute({ actorId, userId: parsedId.data.id });
      return NextResponse.json({ user: serializeUser(user) }, { status: 200 });
    },
  });
}
