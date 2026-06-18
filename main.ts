import "jsr:@std/dotenv/load";

const FAMILY_MEMBERS = (Deno.env.get("FAMILY_MEMBERS") ?? "").split(",").map(
  (s) => s.trim(),
).filter(Boolean);

const API_SECRET = Deno.env.get("API_SECRET");

function isAuthorized(req: Request): boolean {
  if (!API_SECRET) return true;
  return req.headers.get("Authorization") === `ApiKey-v1 ${API_SECRET}`;
}

const kv = await Deno.openKv(Deno.env.get("DENO_KV_PATH"));
const clients = new Set<WebSocket>();

async function atHome(): Promise<string[]> {
  const result: string[] = [];
  for (const member of FAMILY_MEMBERS) {
    const entry = await kv.get<boolean>(["home", member]);
    if (entry.value === true) result.push(member);
  }
  return result;
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
  await kv.set(["home", name], home);
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
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { pathname } = new URL(req.url);

  if (req.method === "GET" && pathname === "/status") {
    return json(await atHome());
  }

  if (req.method === "GET" && pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = async () => {
      clients.add(socket);
      socket.send(JSON.stringify(await atHome()));
    };
    socket.onclose = () => clients.delete(socket);
    socket.onerror = () => clients.delete(socket);
    return response;
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
