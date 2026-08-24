import type { IncomingMessage, ServerResponse } from "node:http";

import { getMe, initPlayer, listLeaderboard, submitScore, updateNickname } from "./leaderboardStore";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

export async function handleLeaderboardApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/player/init") {
    const body = await readJsonBody(request);
    const anonymousId = asNonEmptyString(body.anonymousId);
    const nickname = asNonEmptyString(body.nickname) ?? "匿名同学";
    if (!anonymousId) {
      return badRequest("anonymousId is required");
    }
    return json(await initPlayer({ anonymousId, nickname }));
  }

  if (request.method === "POST" && url.pathname === "/api/player/nickname") {
    const body = await readJsonBody(request);
    const anonymousId = asNonEmptyString(body.anonymousId);
    const nickname = asNonEmptyString(body.nickname);
    if (!anonymousId || !nickname) {
      return badRequest("anonymousId and nickname are required");
    }
    return json(await updateNickname({ anonymousId, nickname }));
  }

  if (request.method === "POST" && url.pathname === "/api/scores") {
    const body = await readJsonBody(request);
    const anonymousId = asNonEmptyString(body.anonymousId);
    const nickname = asNonEmptyString(body.nickname);
    const score = asPositiveNumber(body.score);
    const peakLevel = asPositiveNumber(body.peakLevel);
    if (!anonymousId || !nickname || score === null || peakLevel === null) {
      return badRequest("anonymousId, nickname, score, and peakLevel are required");
    }
    return json(await submitScore({ anonymousId, nickname, score, peakLevel }));
  }

  if (request.method === "GET" && url.pathname === "/api/leaderboard/global") {
    const anonymousId = asNonEmptyString(url.searchParams.get("anonymousId"));
    return json(await listLeaderboard(anonymousId, 20));
  }

  if (request.method === "GET" && url.pathname === "/api/leaderboard/me") {
    const anonymousId = asNonEmptyString(url.searchParams.get("anonymousId"));
    if (!anonymousId) {
      return badRequest("anonymousId is required");
    }
    return json({ me: await getMe(anonymousId) });
  }

  return json({ error: "Not found" }, 404);
}

export async function handleNodeLeaderboardApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const origin = req.headers.host ? `http://${req.headers.host}` : "http://localhost";
  const request = new Request(new URL(req.url ?? "/", origin), {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });

  const response = await handleLeaderboardApiRequest(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const output = Buffer.from(await response.arrayBuffer());
  res.end(output);
}
