import { NextResponse } from "next/server";
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
      const { userId } = await authorizeSelf(container, token, "session:list");

      const sessions = await container.listSessions.execute({ userId });
      return NextResponse.json(
        {
          sessions: sessions.map((session) => ({
            id: session.id,
            createdAt: session.createdAt,
            lastSeenAt: session.lastSeenAt,
            expiresAt: session.expiresAt,
            userAgent: session.userAgent,
          })),
        },
        { status: 200 },
      );
    },
  });
}
