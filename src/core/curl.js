"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCurl = exports.buildQueryString = void 0;

function esc(str) {
    return typeof str === "string" ? str.replace(/'/g, "'\\''") : "";
}

function buildQueryString(data) {
    if (!data || typeof data !== "object") return "";
    const entries = Array.isArray(data) ? data.map((v, i) => [String(i), v]) : Object.entries(data);
    return entries
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : String(v))}`)
        .join("&");
}
exports.buildQueryString = buildQueryString;

function generateCurl(transaction) {
    if (!transaction || !transaction.url) return "# Invalid request";

    if (transaction.type === "BRIDGE") {
        const payload = transaction.rawBody !== undefined ? transaction.rawBody : transaction.requestBody;
        return `// WeChat / TCMPP Host Bridge Replay\nwx.invokeNativePlugin({\n  api_name: "${transaction.name || transaction.url}",\n  data: ${payload ? JSON.stringify(payload, null, 2) : "{}"}\n});`;
    }

    const method = String(transaction.method || "GET").toUpperCase();
    let finalUrl = transaction.url || transaction.rawUrl || "";
    const reqBody = transaction.rawBody !== undefined ? transaction.rawBody : transaction.requestBody;

    if ((method === "GET" || method === "HEAD") && reqBody && typeof reqBody === "object" && !transaction.queryParams) {
        const qs = buildQueryString(reqBody);
        if (qs && !finalUrl.includes(qs)) finalUrl += finalUrl.includes("?") ? `&${qs}` : `?${qs}`;
    }

    const parts = [`curl -X ${method} '${esc(finalUrl)}'`];
    const headers = transaction.rawHeaders || transaction.requestHeaders || {};
    for (const [key, val] of Object.entries(headers)) {
        if (val != null) parts.push(`  -H '${esc(key)}: ${esc(String(val))}'`);
    }

    if (method !== "GET" && method !== "HEAD") {
        if (transaction.type === "UPLOAD") {
            if (transaction.filePath) parts.push(`  -F '${esc(transaction.name || "file")}=@${esc(transaction.filePath)}'`);
            if (reqBody && typeof reqBody === "object") {
                for (const [k, v] of Object.entries(reqBody)) parts.push(`  -F '${esc(k)}=${esc(String(v))}'`);
            }
        } else if (reqBody != null) {
            const isUrlEncoded = Object.entries(headers).some(
                ([k, v]) => k.toLowerCase() === "content-type" && String(v).toLowerCase().includes("application/x-www-form-urlencoded")
            );
            if (isUrlEncoded && typeof reqBody === "object") {
                const formStr = buildQueryString(reqBody);
                if (formStr) parts.push(`  --data-raw '${esc(formStr)}'`);
            } else {
                let bodyStr = "";
                if (typeof reqBody === "string") {
                    bodyStr = reqBody;
                } else if (reqBody instanceof ArrayBuffer || reqBody?.constructor?.name === "ArrayBuffer") {
                    bodyStr = `[Binary Data: ArrayBuffer ${reqBody.byteLength} bytes]`;
                } else {
                    try { bodyStr = JSON.stringify(reqBody); } catch (_) { bodyStr = String(reqBody); }
                }
                if (bodyStr.length > 0) parts.push(`  --data-raw '${esc(bodyStr)}'`);
            }
        }
    }

    return parts.join(" \\\n");
}
exports.generateCurl = generateCurl;
