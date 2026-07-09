// 使用 Node.js Serverless Function（非 Edge），maxDuration: 60 秒
// Edge Function 固定 25s 上限，生图 API 常需要 25-40s
export const config = {
    maxDuration: 60,
    api: { bodyParser: false },
};

// 仅转发这些请求头，避免浏览器 origin/referer 等头干扰目标 API 的鉴权
const ALLOWED_HEADERS = new Set(["authorization", "content-type", "accept"]);

/** 从 Node.js 可读流中缓冲完整 body */
function getRawBody(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

export default async function handler(req: any, res: any) {
    // CORS 预检
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "*");
        return res.status(204).end();
    }

    const target = req.query?.target as string | undefined;
    if (!target) {
        return res.status(400).json({ error: "Missing target parameter" });
    }

    // 用白名单构建转发头，丢弃浏览器特有的 origin/referer/sec-* 等
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers || {})) {
        if (ALLOWED_HEADERS.has(key.toLowerCase()) && typeof value === "string") {
            forwardHeaders[key] = value;
        }
    }

    try {
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: forwardHeaders,
        };

        // 缓冲完整 body 并设置 content-length，避免 chunked encoding 被目标服务器拒绝
        if (req.method !== "GET" && req.method !== "HEAD") {
            const bodyBuffer = await getRawBody(req);
            if (bodyBuffer.length > 0) {
                fetchOptions.body = bodyBuffer;
                forwardHeaders["content-length"] = String(bodyBuffer.length);
            }
        }

        const response = await fetch(target, fetchOptions);

        // 转发响应头
        res.setHeader("Access-Control-Allow-Origin", "*");
        response.headers.forEach((value: string, key: string) => {
            const lower = key.toLowerCase();
            if (lower !== "content-encoding" && lower !== "transfer-encoding") {
                res.setHeader(key, value);
            }
        });

        res.status(response.status);

        // 流式转发响应体（支持 SSE 等流式响应）
        if (response.body) {
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
        }
        res.end();
    } catch (error) {
        res.status(502).json({
            error: error instanceof Error ? error.message : "Proxy request failed",
        });
    }
}
