import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { changePasswordSchema } from "../../schemas";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      const body = await parseJsonBody(request, changePasswordSchema);
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId, session } = await authorizeSelf(container, token, "user:update");

      await container.changePassword.execute({
        userId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        exceptSessionId: session.id,
      });
      return NextResponse.json({}, { status: 200 });
    },
  });
}
