import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { sessionIdParamSchema } from "../../../auth/schemas";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const { id } = await params;
      const parsedParams = sessionIdParamSchema.safeParse({ id });
      if (!parsedParams.success) {
        throw new DomainError("VALIDATION_FAILED", "session id must be a UUID");
      }

      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "session:revoke");

      await container.revokeSession.execute({ userId, sessionId: parsedParams.data.id });
      return NextResponse.json({}, { status: 200 });
    },
  });
}
