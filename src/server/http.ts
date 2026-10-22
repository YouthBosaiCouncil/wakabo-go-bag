import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError, requireAdmin, type Actor } from "../domain/model";
import { adminAuth, adminDb } from "./firebase-admin";
import { WorkspaceService } from "./service";

export async function identity(request: Request): Promise<Actor> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000)
    throw new AppError(401, "認証が必要です。");
  let token;
  try {
    token = await adminAuth().verifyIdToken(authorization.slice(7), true);
  } catch {
    throw new AppError(401, "認証が無効です。再度ログインしてください。");
  }
  return {
    uid: token.uid,
    admin:
      token.admin === true && token.firebase.sign_in_provider !== "anonymous",
  };
}
export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "JSON形式で送信してください。");
  if (Number(request.headers.get("content-length")) > 65536)
    throw new AppError(413, "送信内容が大きすぎます。");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "入力内容がありません。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new AppError(413, "送信内容が大きすぎます。");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "JSON形式が正しくありません。");
  }
}
export async function handle(request: Request, segments: string[]) {
  const requestId = randomUUID();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-ID": requestId,
  };
  try {
    const method = request.method;
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new AppError(403, "許可されていない送信元です。");
    const actor = await identity(request);
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error("Missing project ID");
    const service = new WorkspaceService(adminDb(), projectId);
    const [resource, id, operation] = segments;
    if (segments.length > 3) throw new AppError(404, "見つかりません。");
    if (resource === "admin" && !id && method === "GET") {
      requireAdmin(actor);
      return NextResponse.json({ admin: true }, { headers });
    }
    const participant = ["join", "results", "submit"].includes(resource);
    if (!participant) requireAdmin(actor);
    await service.rateLimit(
      `${resource}:${actor.uid}`,
      resource === "join" ? 20 : resource === "submit" ? 40 : 180,
    );
    if (resource === "join") {
      const ip =
        request.headers.get("x-vercel-forwarded-for") ??
        request.headers.get("x-forwarded-for") ??
        "local";
      await service.rateLimit(
        `join-ip:${ip.split(",")[0].trim()}`,
        120,
        600_000,
      );
    }
    let result: unknown;
    if (resource === "join" && method === "POST" && !id) {
      const body = z
        .object({ code: z.string().max(100).optional() })
        .strict()
        .parse(await readBody(request));
      result = await service.join(actor, body.code);
    } else if (resource === "results" && id && !operation && method === "GET")
      result = await service.results(actor, id);
    else if (resource === "submit" && id && !operation && method === "POST")
      result = await service.submit(actor, id, await readBody(request));
    else if (resource === "catalogs" && !operation) {
      if (method === "GET" && !id) result = await service.listCatalogs(actor);
      else if (method === "POST" && !id)
        result = await service.saveCatalog(actor, await readBody(request));
      else if (method === "PUT" && id)
        result = await service.saveCatalog(actor, await readBody(request), id);
      else if (method === "DELETE" && id) {
        await service.deleteCatalog(actor, id);
        result = { deleted: true };
      }
    } else if (resource === "sessions") {
      if (method === "GET" && !id)
        result = await service.listSessions(
          actor,
          new URL(request.url).searchParams.get("cursor") ?? undefined,
        );
      else if (method === "POST" && !id)
        result = await service.createSession(actor, await readBody(request));
      else if (method === "GET" && id && operation === "teams")
        result = await service.listTeams(actor, id);
      else if (
        method === "POST" &&
        id &&
        (operation === "open" || operation === "closed")
      ) {
        await service.setStatus(actor, id, operation);
        result = { updated: true };
      } else if (method === "POST" && id && operation === "publish") {
        await service.activatePublic(actor, id);
        result = { updated: true };
      } else if (method === "DELETE" && id && !operation) {
        await service.deleteSession(actor, id);
        result = { deleted: true };
      }
    }
    if (result === undefined) throw new AppError(404, "見つかりません。");
    return NextResponse.json(result, { headers });
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 503;
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof ZodError
          ? "入力内容を確認してください。"
          : "サービスに接続できません。しばらくしてから再試行してください。";
    if (status >= 500)
      console.error(
        JSON.stringify({
          requestId,
          event: "workspace_api_failed",
          errorType: error instanceof Error ? error.name : "unknown",
        }),
      );
    return NextResponse.json(
      { error: message, requestId },
      {
        status,
        headers: {
          ...headers,
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
