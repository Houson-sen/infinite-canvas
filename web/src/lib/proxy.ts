/**
 * 在生产环境（Vercel 部署）将 API 请求路由到 /api/proxy 边缘函数，
 * 由服务端转发以绕过浏览器 CORS 限制。
 * 本地开发模式（vite dev）直连目标 API，无需代理。
 */
export function withProxy(url: string): string {
    if (import.meta.env.PROD) {
        return `/api/proxy?target=${encodeURIComponent(url)}`;
    }
    return url;
}
