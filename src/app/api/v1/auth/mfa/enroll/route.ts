import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";

const emptyBodySchema = z.object({}).strict();

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      await parseJsonBody(request, emptyBodySchema);
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "mfa:manage");

      const user = await container.uow.run((tx) => container.users(tx).findById(userId));
      if (!user) {
        throw new DomainError("UNAUTHENTICATED", "session does not resolve to a known user");
      }

      const result = await container.enrollMfa.execute({ userId, accountLabel: user.email });
      return NextResponse.json(result, { status: 200 });
    },
  });
}
