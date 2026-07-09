export const config = { runtime: "edge" };

// 仅转发这些请求头，避免浏览器 origin/referer 等头干扰目标 API 的鉴权
const ALLOWED_HEADERS = new Set([
    "authorization",
    "content-type",
    "accept",
]);

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

    // 用白名单构建转发头，丢弃浏览器特有的 origin/referer/sec-* 等
    const forwardHeaders = new Headers();
    for (const [key, value] of req.headers.entries()) {
        if (ALLOWED_HEADERS.has(key.toLowerCase())) {
            forwardHeaders.set(key, value);
        }
    }

    try {
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: forwardHeaders,
        };

        // 缓冲完整 body 并设置 content-length，避免 chunked encoding 被目标服务器拒绝
        if (req.method !== "GET" && req.method !== "HEAD") {
            const bodyBuffer = await req.arrayBuffer();
            if (bodyBuffer.byteLength > 0) {
                fetchOptions.body = bodyBuffer;
                forwardHeaders.set("content-length", String(bodyBuffer.byteLength));
            }
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
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Proxy request failed" }),
            {
                status: 502,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            }
        );
    }
}
