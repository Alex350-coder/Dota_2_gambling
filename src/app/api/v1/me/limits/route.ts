import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { updateLimitSchema } from "./schemas";

function serializeLimit(limit: {
  readonly kind: string;
  readonly period: string;
  readonly currentValue: bigint;
  readonly pendingValue: bigint | null;
  readonly effectiveAt: Date | null;
  readonly effectiveValue: bigint;
}) {
  return {
    kind: limit.kind,
    period: limit.period,
    currentValue: limit.currentValue.toString(),
    pendingValue: limit.pendingValue?.toString() ?? null,
    effectiveAt: limit.effectiveAt?.toISOString() ?? null,
    effectiveValue: limit.effectiveValue.toString(),
  };
}

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "compliance:manage");

      const limits = await container.listLimits.execute({ userId });
      return NextResponse.json({ limits: limits.map(serializeLimit) }, { status: 200 });
    },
  });
}

export async function PUT(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "compliance:manage");

      const body = await parseJsonBody(request, updateLimitSchema);
      const limit = await container.updateLimit.execute({
        userId,
        kind: body.kind,
        period: body.period,
        value: BigInt(body.value),
      });

      return NextResponse.json({ limit: serializeLimit(limit) }, { status: 200 });
    },
  });
}
