export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        });
    }

    const url = new URL(req.url);
    const target = url.searchParams.get("target");

    if (!target) {
        return new Response(JSON.stringify({ error: "Missing target parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    for (const key of [...headers.keys()]) {
        if (key.startsWith("x-forwarded") || key.startsWith("x-vercel") || key.startsWith("x-real-ip")) {
            headers.delete(key);
        }
    }

    try {
        const fetchOptions: RequestInit & { duplex?: string } = {
            method: req.method,
            headers,
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
            fetchOptions.body = req.body;
            fetchOptions.duplex = "half";
        }

        const response = await fetch(target, fetchOptions);

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("transfer-encoding");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Proxy request failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }
}
