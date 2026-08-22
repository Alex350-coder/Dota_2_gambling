import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { registerSchema } from "../schemas";

// PUBLIC_ROUTE
// Unauthenticated by design — this is how an account comes into existence.

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      const body = await parseJsonBody(request, registerSchema);
      const container = getContainer();
      const { userId } = await container.register.execute(body);
      return NextResponse.json({ userId }, { status: 201 });
    },
  });
}
