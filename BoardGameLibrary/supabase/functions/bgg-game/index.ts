import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { XMLParser } from "npm:fast-xml-parser@4.5.3";

type XmlValue = Record<string, unknown>;

const BGG_API_ROOT = "https://boardgamegeek.com/xmlapi2";
const DEFAULT_ALLOWED_ORIGINS = ["https://austinpico.com"];
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true,
  trimValues: true,
  htmlEntities: true
});

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, corsHeaders);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, corsHeaders);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required." }, 401, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Function environment is incomplete." }, 500, corsHeaders);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const accessToken = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return jsonResponse({ error: "Invalid session." }, 401, corsHeaders);
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("portfolio_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (membershipError) {
    return jsonResponse({ error: "Could not verify administrator access." }, 500, corsHeaders);
  }
  if (!membership) {
    return jsonResponse({ error: "Administrator access required." }, 403, corsHeaders);
  }

  let body: { query?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400, corsHeaders);
  }

  try {
    if (typeof body.query === "string") {
      const query = body.query.trim();
      if (query.length < 2 || query.length > 100) {
        return jsonResponse({ error: "Search text must contain 2 to 100 characters." }, 400, corsHeaders);
      }
      const xml = await fetchBgg("search", { query, type: "boardgame" });
      return jsonResponse({ results: parseSearchResults(xml) }, 200, corsHeaders);
    }

    const bggId = Number(body.id);
    if (!Number.isSafeInteger(bggId) || bggId <= 0) {
      return jsonResponse({ error: "A positive numeric BGG ID is required." }, 400, corsHeaders);
    }
    const xml = await fetchBgg("thing", { id: String(bggId), stats: "1" });
    const game = parseGameDetails(xml);
    if (!game) {
      return jsonResponse({ error: "BoardGameGeek returned no matching game." }, 404, corsHeaders);
    }
    return jsonResponse({ game }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "BoardGameGeek request failed.";
    return jsonResponse({ error: message }, 502, corsHeaders);
  }
});

async function fetchBgg(path: string, parameters: Record<string, string>): Promise<string> {
  const url = new URL(`${BGG_API_ROOT}/${path}`);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = new Headers({
    Accept: "application/xml",
    "User-Agent": "AustinPico-Portfolio/1.0"
  });
  const apiToken = Deno.env.get("BGG_API_TOKEN");
  if (apiToken) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }

  const response = await fetch(url, { headers });
  if (response.status === 202) {
    throw new Error("BoardGameGeek is preparing this request. Try again in a moment.");
  }
  if (!response.ok) {
    throw new Error(`BoardGameGeek returned HTTP ${response.status}.`);
  }
  return response.text();
}

function parseSearchResults(xml: string) {
  const document = parser.parse(xml) as XmlValue;
  const items = asObject(document.items);
  return asArray(items?.item)
    .map((value) => asObject(value))
    .filter((item): item is XmlValue => Boolean(item))
    .slice(0, 12)
    .map((item) => ({
      id: toNumber(item.id),
      name: String(asObject(item.name)?.value || "Unknown game"),
      yearPublished: toNumber(asObject(item.yearpublished)?.value)
    }))
    .filter((item) => item.id !== null);
}

function parseGameDetails(xml: string) {
  const document = parser.parse(xml) as XmlValue;
  const item = asObject(asArray(asObject(document.items)?.item)[0]);
  if (!item) {
    return null;
  }

  const names = asArray(item.name).map(asObject).filter((value): value is XmlValue => Boolean(value));
  const primaryName = names.find((name) => name.type === "primary") || names[0];
  const links = asArray(item.link).map(asObject).filter((value): value is XmlValue => Boolean(value));
  const ratings = asObject(asObject(asObject(item.statistics)?.ratings));

  return {
    bggId: toNumber(item.id),
    name: String(primaryName?.value || "Unknown game"),
    yearPublished: toNumber(asObject(item.yearpublished)?.value),
    minPlayers: toNumber(asObject(item.minplayers)?.value),
    maxPlayers: toNumber(asObject(item.maxplayers)?.value),
    playingTimeMinutes: toNumber(asObject(item.playingtime)?.value),
    minAge: toNumber(asObject(item.minage)?.value),
    complexityWeight: toNumber(asObject(ratings?.averageweight)?.value),
    bggRating: toNumber(asObject(ratings?.average)?.value),
    categories: linkValues(links, "boardgamecategory"),
    mechanisms: linkValues(links, "boardgamemechanic"),
    designers: linkValues(links, "boardgamedesigner"),
    description: cleanDescription(item.description),
    imageUrl: optionalString(item.image),
    thumbnailUrl: optionalString(item.thumbnail)
  };
}

function linkValues(links: XmlValue[], type: string): string[] {
  return links
    .filter((link) => link.type === type)
    .map((link) => String(link.value || "").trim())
    .filter(Boolean);
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function asObject(value: unknown): XmlValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as XmlValue
    : null;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getAllowedOrigins(): Set<string> {
  const configured = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || getAllowedOrigins().has(origin);
}

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && getAllowedOrigins().has(origin)
    ? origin
    : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function jsonResponse(payload: unknown, status: number, corsHeaders: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}