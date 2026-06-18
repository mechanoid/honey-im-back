import "@std/dotenv/load";

// Base URL all requests are made against (override per environment).
const BASE_URL = Deno.env.get("BASE_URL") ?? "http://localhost:8000";
const API_SECRET = Deno.env.get("API_SECRET");

function authHeaders(): HeadersInit {
  return API_SECRET ? { Authorization: `ApiKey-v1 ${API_SECRET}` } : {};
}

async function request(method: string, path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: authHeaders(),
  });
  const body = await res.text();
  console.log(`${method} ${BASE_URL}${path} -> ${res.status}`);
  console.log(body);
  if (!res.ok) Deno.exit(1);
}

function requireName(name: string | undefined, action: string): string {
  if (!name) {
    console.error(`usage: deno task ${action} <name>`);
    Deno.exit(2);
  }
  return name;
}

const [action, name] = Deno.args;

switch (action) {
  case "status":
    await request("GET", "/status");
    break;
  case "coming-home":
    await request(
      "POST",
      `/coming-home/${encodeURIComponent(requireName(name, "coming-home"))}`,
    );
    break;
  case "leaving":
    await request(
      "POST",
      `/leaving/${encodeURIComponent(requireName(name, "leaving"))}`,
    );
    break;
  default:
    console.error(`unknown action: ${action ?? "(none)"}`);
    console.error(
      "usage: deno task status | deno task coming-home <name> | deno task leaving <name>",
    );
    Deno.exit(2);
}
