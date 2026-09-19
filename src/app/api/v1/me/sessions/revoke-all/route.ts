import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";

const emptyBodySchema = z.object({}).strict();

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      await parseJsonBody(request, emptyBodySchema);
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId, session } = await authorizeSelf(container, token, "session:revoke");

      await container.revokeAllSessions.execute({ userId, exceptSessionId: session.id });
      return NextResponse.json({}, { status: 200 });
    },
  });
}
