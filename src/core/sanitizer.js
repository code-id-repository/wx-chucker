"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettyFormat = exports.truncateString = exports.sanitizeBody = exports.sanitizeHeaders = exports.safeJsonStringify = exports.isArrayBuffer = void 0;

function isArrayBuffer(value) {
    if (!value) return false;
    return (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) ||
           (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) ||
           Boolean(value.constructor && (value.constructor.name === "ArrayBuffer" || value.constructor.name === "Uint8Array"));
}
exports.isArrayBuffer = isArrayBuffer;

function safeJsonStringify(obj, space = 2) {
    if (obj === undefined) return "undefined";
    if (obj === null) return "null";
    if (typeof obj === "string") return obj;
    if (isArrayBuffer(obj)) {
        return `[Binary Data: ArrayBuffer (${obj.byteLength ?? obj.length ?? 0} bytes)]`;
    }
    const seen = new WeakSet();
    try {
        return JSON.stringify(obj, (k, v) => {
            if (typeof v === "bigint") return v.toString();
            if (typeof v === "function") return "[Function]";
            if (isArrayBuffer(v)) return `[ArrayBuffer: ${v.byteLength || 0} bytes]`;
            if (typeof v === "object" && v !== null) {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
            }
            return v;
        }, space);
    } catch (_) {
        return String(obj);
    }
}
exports.safeJsonStringify = safeJsonStringify;

function sanitizeHeaders(headers, redactKeys = []) {
    if (!headers || typeof headers !== "object") return {};
    if (!redactKeys || redactKeys.length === 0) return { ...headers };
    const keysToRedact = new Set(redactKeys.map((k) => String(k).toLowerCase()));
    const result = {};
    for (const [k, v] of Object.entries(headers)) {
        result[k] = keysToRedact.has(k.toLowerCase()) ? "•••••••• [Redacted]" : v;
    }
    return result;
}
exports.sanitizeHeaders = sanitizeHeaders;

function sanitizeBody(body, redactKeys = [], depth = 0) {
    if (body == null || !redactKeys || redactKeys.length === 0) return body;
    if (depth > 6) return "[Max Depth Reached]";
    if (isArrayBuffer(body)) return `[ArrayBuffer: ${body.byteLength || 0} bytes]`;

    if (typeof body === "string") {
        const t = body.trim();
        if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
            try {
                const parsed = JSON.parse(body);
                if (parsed && typeof parsed === "object") return sanitizeBody(parsed, redactKeys, depth + 1);
            } catch (_) {}
        }
        return body;
    }

    if (Array.isArray(body)) {
        return body.map((item) => sanitizeBody(item, redactKeys, depth + 1));
    }

    if (typeof body === "object") {
        const keysToRedact = new Set(redactKeys.map((k) => String(k).toLowerCase()));
        const cleanObj = {};
        for (const [key, value] of Object.entries(body)) {
            if (keysToRedact.has(key.toLowerCase())) {
                cleanObj[key] = "•••••••• [Redacted]";
            } else if (typeof value === "object" && value !== null) {
                cleanObj[key] = sanitizeBody(value, redactKeys, depth + 1);
            } else {
                cleanObj[key] = value;
            }
        }
        return cleanObj;
    }
    return body;
}
exports.sanitizeBody = sanitizeBody;

function truncateString(str, maxLength = 500000) {
    if (typeof str !== "string") return String(str || "");
    if (!maxLength || str.length <= maxLength) return str;
    return `${str.slice(0, maxLength)}\n\n... [Truncated: ${str.length - maxLength} chars omitted]`;
}
exports.truncateString = truncateString;

function prettyFormat(data, maxLength = 500000, fallbackHint = "") {
    if (data === undefined) return fallbackHint || "(No body provided / undefined)";
    if (data === null) return "null";
    if (isArrayBuffer(data)) return `[Binary Data: ArrayBuffer (${data.byteLength || 0} bytes)]`;

    if (typeof data === "string") {
        if (data.length === 0) return fallbackHint || "(Empty string - 0 bytes)";
        const t = data.trim();
        if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
            try {
                return truncateString(JSON.stringify(JSON.parse(data), null, 2), maxLength);
            } catch (_) {}
        }
        return truncateString(data, maxLength);
    }

    if (typeof data === "object") {
        if (Object.keys(data).length === 0 && !Array.isArray(data)) return fallbackHint || "{} (Empty Object)";
        return truncateString(safeJsonStringify(data, 2), maxLength);
    }

    return truncateString(String(data), maxLength);
}
exports.prettyFormat = prettyFormat;
