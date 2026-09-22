import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";

/** Read-only aggregate — no requireStepUp(), same audit:read gate as the (admin) shell layout. */
export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      await authorize(container, {
        token,
        action: "audit:read",
        resource: { ownerId: "system" },
      });

      const dashboard = await container.getAdminDashboard.execute();
      return NextResponse.json({ dashboard }, { status: 200 });
    },
  });
}
