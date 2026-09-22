import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";
import { pageQuerySchema } from "../../schemas";
import { serializeUser } from "./serialize";

/** Read-only listing — not individually audited, same as every other admin/catalog list.
 * `user:read` with `anyOwner: ["ADMIN"]` (policy.ts) is the precise action here, not the
 * broader `audit:read` the (admin) shell layout uses — only ADMIN may browse user accounts. */
export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      await authorize(container, {
        token,
        action: "user:read",
        resource: { ownerId: "identity" },
      });

      const query = parseQuery(request, pageQuerySchema);
      const result = await container.listUsers.execute(query);

      return NextResponse.json(
        {
          users: result.items.map(serializeUser),
          meta: { total: result.total, page: result.page, limit: result.limit },
        },
        { status: 200 },
      );
    },
  });
}
