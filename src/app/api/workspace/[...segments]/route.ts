import { handle } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ segments: string[] }> };
const route = async (request: Request, context: Context) =>
  handle(request, (await context.params).segments);
export { route as GET, route as POST, route as PUT, route as DELETE };
