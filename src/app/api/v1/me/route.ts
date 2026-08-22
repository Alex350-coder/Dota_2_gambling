import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "user:read");

      const user = await container.uow.run((tx) => container.users(tx).findById(userId));
      if (!user) {
        throw new DomainError("UNAUTHENTICATED", "session does not resolve to a known user");
      }

      return NextResponse.json(
        {
          id: user.id,
          email: user.email,
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
          mfaEnabled: user.mfaEnabledAt !== null,
          createdAt: user.createdAt,
        },
        { status: 200 },
      );
    },
  });
}
