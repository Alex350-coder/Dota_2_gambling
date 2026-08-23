import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { mfaVerifySchema } from "../../schemas";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      const body = await parseJsonBody(request, mfaVerifySchema);
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId, session } = await authorizeSelf(container, token, "mfa:manage");

      await container.verifyMfa.execute({ userId, code: body.code, sessionId: session.id });
      return NextResponse.json({}, { status: 200 });
    },
  });
}
