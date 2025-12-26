export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  if (request.method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, 405, request);
  }

  const APPS_SCRIPT_URL = env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) {
    return json({ success: false, message: "Missing APPS_SCRIPT_URL env var" }, 500, request);
  }

  let bodyText = "";
  try { bodyText = await request.text(); } catch (_) {}

  // Optional shared secret (prevents random abuse on your endpoint)
  const shared = env.PROXY_SHARED_SECRET;
  if (shared) {
    const provided = request.headers.get("x-proxy-secret") || "";
    if (provided !== shared) {
      return json({ success: false, message: "Forbidden" }, 403, request);
    }
  }

  // Forward to Apps Script (server-side fetch = no CORS issues)
  let gasResp;
  try {
    gasResp = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyText || "{}",
    });
  } catch (err) {
    return json({ success: false, message: "Proxy fetch failed: " + (err?.message || String(err)) }, 502, request);
  }

  const respText = await gasResp.text();
  return new Response(respText, {
    status: gasResp.status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
