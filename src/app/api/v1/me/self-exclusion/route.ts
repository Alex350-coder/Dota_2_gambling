import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { selfExcludeSchema } from "./schemas";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "compliance:manage");

      const body = await parseJsonBody(request, selfExcludeSchema);
      const result = await container.selfExclude.execute({ userId, period: body.period });

      return NextResponse.json(
        { revocableAt: result.revocableAt?.toISOString() ?? null },
        { status: 200 },
      );
    },
  });
}
