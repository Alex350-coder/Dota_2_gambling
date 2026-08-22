import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { serializeExpiredSessionCookie } from "@/platform/session/cookie";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId, session } = await authorizeSelf(container, token, "session:revoke");

      await container.sessionService.revokeSession(session.id);

      const response = NextResponse.json({ userId }, { status: 200 });
      response.headers.append(
        "Set-Cookie",
        serializeExpiredSessionCookie(container.config.SESSION_COOKIE_NAME),
      );
      return response;
    },
  });
}
