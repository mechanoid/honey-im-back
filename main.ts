import "@std/dotenv/load";
import { connect } from "@db/redis";

const FAMILY_MEMBERS = (Deno.env.get("FAMILY_MEMBERS") ?? "").split(",").map(
  (s) => s.trim(),
).filter(Boolean);

const API_SECRET = Deno.env.get("API_SECRET");

function isAuthorized(req: Request): boolean {
  if (!API_SECRET) return true;
  return req.headers.get("Authorization") === `ApiKey-v1 ${API_SECRET}`;
}

// WebSocket clients (browsers, the basic Deno WebSocket) can't set request
// headers, so the upgrade is authenticated via a ?token= query param instead.
function isWsAuthorized(url: URL): boolean {
  if (!API_SECRET) return true;
  return url.searchParams.get("token") === API_SECRET;
}

const redisUrl = new URL(Deno.env.get("REDIS_URL") ?? "redis://127.0.0.1:6379");
const redis = await connect({
  hostname: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  db: redisUrl.pathname.length > 1
    ? Number(redisUrl.pathname.slice(1))
    : undefined,
});

// Redis set holding the names of members currently at home.
const HOME_KEY = "home";
const clients = new Set<WebSocket>();

async function atHome(): Promise<string[]> {
  const members = await redis.smembers(HOME_KEY);
  // Preserve FAMILY_MEMBERS order and drop any stale names no longer configured.
  return FAMILY_MEMBERS.filter((m) => members.includes(m));
}

async function broadcast(): Promise<void> {
  const list = await atHome();
  const msg = JSON.stringify(list);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

async function setHome(name: string, home: boolean): Promise<boolean> {
  if (!FAMILY_MEMBERS.includes(name)) return false;
  if (home) {
    await redis.sadd(HOME_KEY, name);
  } else {
    await redis.srem(HOME_KEY, name);
  }
  await broadcast();
  return true;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const { pathname } = url;

  // The WebSocket upgrade authenticates via query-param token; every other
  // endpoint uses the Authorization header.
  if (req.method === "GET" && pathname === "/ws") {
    if (!isWsAuthorized(url)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = async () => {
      clients.add(socket);
      socket.send(JSON.stringify(await atHome()));
    };
    socket.onmessage = (e) => {
      // Keepalive: a consumer sends "ping" to stop the host from idling
      // the service out; reply "pong" so the connection stays active.
      if (e.data === "ping") socket.send("pong");
    };
    socket.onclose = () => clients.delete(socket);
    socket.onerror = () => clients.delete(socket);
    return response;
  }

  // Header-based auth for the REST endpoints.
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method === "GET" && pathname === "/status") {
    return json(await atHome());
  }

  const comingHome = pathname.match(/^\/coming-home\/([^/]+)$/);
  if (req.method === "POST" && comingHome) {
    const name = decodeURIComponent(comingHome[1]);
    const ok = await setHome(name, true);
    return ok
      ? json({ member: name, home: true })
      : json({ error: "unknown family member" }, 404);
  }

  const leaving = pathname.match(/^\/leaving\/([^/]+)$/);
  if (req.method === "POST" && leaving) {
    const name = decodeURIComponent(leaving[1]);
    const ok = await setHome(name, false);
    return ok
      ? json({ member: name, home: false })
      : json({ error: "unknown family member" }, 404);
  }

  return new Response("Not Found", { status: 404 });
});
