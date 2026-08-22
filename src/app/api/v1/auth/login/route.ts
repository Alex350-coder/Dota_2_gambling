import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { clientIp } from "@/platform/http/request-context";
import { serializeSessionCookie } from "@/platform/session/cookie";
import { generateCsrfToken, serializeCsrfCookie } from "@/platform/csrf/token";
import { loginSchema } from "../schemas";

// PUBLIC_ROUTE

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      const body = await parseJsonBody(request, loginSchema);
      const container = getContainer();

      const { userId } = await container.login.execute({
        email: body.email,
        password: body.password,
        ip: clientIp(request),
      });

      const { token } = await container.sessionService.createSession({
        userId,
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      });

      const response = NextResponse.json({ userId }, { status: 200 });
      response.headers.append(
        "Set-Cookie",
        serializeSessionCookie(token, {
          name: container.config.SESSION_COOKIE_NAME,
          maxAgeSeconds: container.config.SESSION_TTL_HOURS * 60 * 60,
        }),
      );
      response.headers.append("Set-Cookie", serializeCsrfCookie(generateCsrfToken()));
      return response;
    },
  });
}
