import "server-only";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "./firebase-admin";
import { WorkspaceService } from "./service";

export async function handleMaintenance(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return Response.json(
      { error: "Maintenance unavailable" },
      { status: 503, headers },
    );
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (request.method !== "GET")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers },
    );
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error("Missing project");
    const result = await new WorkspaceService(
      adminDb(),
      projectId,
    ).cleanupRateLimits();
    console.info(JSON.stringify({ event: "rate_limits_cleanup", ...result }));
    return Response.json(result, { headers });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "rate_limits_cleanup_failed",
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return Response.json(
      { error: "Maintenance failed" },
      { status: 503, headers },
    );
  }
}
