"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chuckerStore = exports.ChuckerStore = exports.toSummary = void 0;

const curl_1 = require("./curl");
const sanitizer_1 = require("./sanitizer");

function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}

function formatTime(timestamp, full = false) {
    const d = new Date(timestamp);
    const base = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    return full ? `${base}.${String(d.getMilliseconds()).padStart(3, "0")}` : base;
}

function parseUrlInfo(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
        return { host: "", path: "", search: "", queryParams: {} };
    }
    if (rawUrl.startsWith("jsplugin://") || rawUrl.startsWith("bridge://")) {
        return { host: "Native Plugin", path: rawUrl.replace(/^[^/]+:\/\//, ""), search: "", queryParams: {} };
    }
    const match = rawUrl.match(/^https?:\/\/([^/?#]+)([^?#]*)(.*)$/i);
    if (match) {
        const host = match[1] || "";
        const path = match[2] || "/";
        const search = match[3] || "";
        const queryParams = {};
        if (search.startsWith("?")) {
            for (const pair of search.slice(1).split("&")) {
                if (!pair) continue;
                const [k, v] = pair.split("=");
                if (k) {
                    try {
                        queryParams[decodeURIComponent(k)] = v !== undefined ? decodeURIComponent(v) : "";
                    } catch (_) {
                        queryParams[k] = v || "";
                    }
                }
            }
        }
        return { host, path, search, queryParams };
    }
    return { host: "Native Plugin", path: rawUrl, search: "", queryParams: {} };
}

function toSummary(tx) {
    let latencyLevel = "fast";
    if (tx.durationMs >= 1000) {
        latencyLevel = "slow";
    } else if (tx.durationMs >= 300) {
        latencyLevel = "moderate";
    }
    return {
        id: tx.id,
        type: tx.type,
        method: tx.method,
        name: tx.name,
        url: tx.url,
        host: tx.host,
        path: tx.path,
        statusCode: tx.statusCode,
        statusText: tx.statusText,
        durationMs: tx.durationMs,
        timeFormatted: tx.timeFormatted,
        isInFlight: tx.isInFlight,
        isError: tx.isError,
        latencyLevel,
        isSlow: tx.durationMs >= 1000
    };
}
exports.toSummary = toSummary;

class ChuckerStore {
    constructor() {
        this.config = {
            enabled: true,
            maxTransactions: 120,
            maxBodyLength: 500000,
            redactHeaders: [],
            redactBodyKeys: []
        };
        this.transactions = [];
        this.listeners = new Set();
        this.notifyScheduled = false;
    }

    init(config = {}) {
        Object.assign(this.config, config);
    }

    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }

    notify(immediate = false) {
        if (immediate) {
            this.flushNotify();
            return;
        }
        if (this.notifyScheduled) return;
        this.notifyScheduled = true;
        setTimeout(() => this.flushNotify(), 16);
    }

    flushNotify() {
        this.notifyScheduled = false;
        const state = this.getState();
        for (const listener of this.listeners) {
            try { listener(state); } catch (e) { console.error("[Chucker] Listener error:", e); }
        }
    }

    getState() {
        let errors = 0;
        let inFlight = 0;
        let slowCount = 0;
        let networkCount = 0;
        let nativeCount = 0;

        for (const tx of this.transactions) {
            if (tx.isInFlight) inFlight++;
            if (tx.isError) errors++;
            if (tx.durationMs >= 1000) slowCount++;
            if (tx.type === "BRIDGE") nativeCount++;
            else networkCount++;
        }

        return {
            enabled: this.config.enabled,
            total: this.transactions.length,
            errors,
            inFlight,
            slowCount,
            networkCount,
            nativeCount,
            httpCount: networkCount,
            bridgeCount: nativeCount,
            transactions: this.transactions
        };
    }

    addRequest(rawTx) {
        if (!this.config.enabled) return rawTx.id;
        if (this.transactions.some((t) => t.id === rawTx.id)) return rawTx.id;

        const isBridge = rawTx.type === "BRIDGE";
        const method = (rawTx.method || (isBridge ? "NATIVE" : "GET")).toUpperCase();
        const urlInfo = parseUrlInfo(rawTx.url);
        const cleanName = rawTx.name || urlInfo.path || rawTx.url;

        let fullUrl = rawTx.url || cleanName;
        const mergedQueryParams = { ...urlInfo.queryParams };
        if ((method === "GET" || method === "HEAD") && rawTx.body && typeof rawTx.body === "object" && !(0, sanitizer_1.isArrayBuffer)(rawTx.body)) {
            if (!Array.isArray(rawTx.body)) {
                Object.assign(mergedQueryParams, rawTx.body);
                const baseUrl = fullUrl.split("?")[0];
                const qs = (0, curl_1.buildQueryString)(mergedQueryParams);
                if (qs) {
                    fullUrl = `${baseUrl}?${qs}`;
                }
            }
        }

        const tx = {
            id: rawTx.id,
            type: rawTx.type || "HTTP",
            method,
            url: fullUrl,
            rawUrl: rawTx.url || cleanName,
            host: isBridge ? "Native Plugin" : urlInfo.host,
            path: isBridge ? cleanName : urlInfo.path,
            name: cleanName,
            filePath: rawTx.filePath,
            queryParams: mergedQueryParams,
            hasQueryParams: Object.keys(mergedQueryParams).length > 0,
            startTime: rawTx.startTime || Date.now(),
            timeFormatted: formatTime(rawTx.startTime || Date.now()),
            timeFull: formatTime(rawTx.startTime || Date.now(), true),
            durationMs: 0,
            isInFlight: true,
            isError: false,
            statusCode: 0,
            statusText: "Pending",
            rawHeaders: rawTx.rawHeaders || rawTx.headers || {},
            rawBody: rawTx.body,
            headers: rawTx.headers || {},
            body: rawTx.body,
            responseHeaders: null,
            responseBody: null,
            rawRespHeaders: null,
            rawRespBody: null,
            error: null,
            _detailResolved: false,
            requestHeadersFormatted: "",
            requestBodyFormatted: "",
            responseHeadersFormatted: "",
            responseBodyFormatted: "(Waiting for response...)",
            curl: ""
        };

        this.transactions = [tx, ...this.transactions].slice(0, this.config.maxTransactions);
        this.notify();
        return tx.id;
    }

    updateResponse(id, responseData) {
        if (!this.config.enabled) return;
        const index = this.transactions.findIndex((t) => t.id === id);
        if (index === -1) return;

        const tx = { ...this.transactions[index] };
        const duration = Math.max(0, (responseData.endTime || Date.now()) - tx.startTime);
        const statusCode = Number(responseData.statusCode ?? 200);
        const isError = statusCode >= 400 || Boolean(responseData.isError);

        tx.durationMs = duration;
        tx.isInFlight = false;
        tx.statusCode = statusCode;
        tx.isError = isError;

        if (tx.type === "BRIDGE") {
            tx.statusText = isError ? `Bridge Error (${statusCode})` : "Success";
        } else {
            tx.statusText = statusCode === 204 ? "204 No Content" : statusCode === 304 ? "304 Not Modified" : (isError ? `Error ${statusCode}` : `${statusCode} OK`);
        }

        tx.rawRespHeaders = responseData.rawHeaders || responseData.headers || {};
        tx.responseHeaders = responseData.headers || {};
        tx.rawRespBody = responseData.body;
        tx.responseBody = responseData.body;
        tx._detailResolved = false;

        this.transactions[index] = tx;
        this.notify();
    }

    updateError(id, errorData) {
        if (!this.config.enabled) return;
        const index = this.transactions.findIndex((t) => t.id === id);
        if (index === -1) return;

        const tx = { ...this.transactions[index] };
        const duration = Math.max(0, (errorData.endTime || Date.now()) - tx.startTime);
        const errMsg = String(errorData.error || errorData.errMsg || "Request Failed");

        tx.durationMs = duration;
        tx.isInFlight = false;
        tx.isError = true;
        tx.statusCode = errorData.statusCode || 0;
        tx.statusText = "Failed";
        tx.error = errMsg;
        tx.responseBody = { error: errMsg };
        tx.rawRespBody = tx.responseBody;
        tx._detailResolved = false;

        this.transactions[index] = tx;
        this.notify();
    }

    resolveDetail(tx) {
        if (!tx) return null;
        if (tx._detailResolved) return tx;

        const maxLen = this.config.maxBodyLength;

        // 1. Headers (Unredacted & Untruncated)
        const reqHeaders = tx.rawHeaders || tx.headers || {};
        tx.requestHeaders = (0, sanitizer_1.sanitizeHeaders)(reqHeaders, this.config.redactHeaders);
        tx.requestHeadersFormatted = (0, sanitizer_1.prettyFormat)(tx.requestHeaders, maxLen);

        // 2. Request Body
        const effectiveBody = tx.rawBody !== undefined ? tx.rawBody : tx.body;
        const sanitizedBody = (0, sanitizer_1.sanitizeBody)(effectiveBody, this.config.redactBodyKeys);
        tx.requestBody = sanitizedBody;

        if (tx.type === "BRIDGE") {
            tx.requestBodyFormatted = (0, sanitizer_1.prettyFormat)(sanitizedBody, maxLen, "(No bridge parameters)");
        } else if (tx.method === "GET" || tx.method === "HEAD") {
            if (effectiveBody && typeof effectiveBody === "object" && Object.keys(effectiveBody).length > 0) {
                tx.requestBodyFormatted = `Query Parameters (Sent in URL):\n${(0, sanitizer_1.prettyFormat)(sanitizedBody, maxLen)}`;
            } else if (tx.hasQueryParams) {
                tx.requestBodyFormatted = `Query Parameters (From URL):\n${(0, sanitizer_1.prettyFormat)(tx.queryParams, maxLen)}`;
            } else {
                tx.requestBodyFormatted = "(No request body - GET requests pass parameters via URL Query String)";
            }
        } else {
            tx.requestBodyFormatted = effectiveBody == null ? "(Empty Request Body - No payload sent)" : (0, sanitizer_1.prettyFormat)(sanitizedBody, maxLen);
        }

        // 3. Response Headers
        const respHeaders = tx.rawRespHeaders || tx.responseHeaders || {};
        tx.responseHeaders = (0, sanitizer_1.sanitizeHeaders)(respHeaders, this.config.redactHeaders);
        tx.responseHeadersFormatted = (0, sanitizer_1.prettyFormat)(tx.responseHeaders, maxLen);

        // 4. Response Body
        const effectiveRespBody = tx.rawRespBody !== undefined ? tx.rawRespBody : tx.responseBody;
        const sanitizedRespBody = (0, sanitizer_1.sanitizeBody)(effectiveRespBody, this.config.redactBodyKeys);
        if (tx.isInFlight) {
            tx.responseBodyFormatted = "(Waiting for response...)";
        } else if (effectiveRespBody == null) {
            tx.responseBodyFormatted = tx.statusCode === 204 || tx.statusCode === 304 ? `(${tx.statusCode} ${tx.statusText} - No Content Body returned)` : "(Empty response body - Server returned 0 bytes)";
        } else if (effectiveRespBody === "") {
            tx.responseBodyFormatted = "(Empty string response - 0 bytes)";
        } else if ((0, sanitizer_1.isArrayBuffer)(effectiveRespBody)) {
            tx.responseBodyFormatted = `[Binary Data: ArrayBuffer (${effectiveRespBody.byteLength || 0} bytes)]`;
        } else {
            tx.responseBodyFormatted = (0, sanitizer_1.prettyFormat)(sanitizedRespBody, maxLen);
        }

        // 5. cURL (Unredacted token for Postman)
        tx.curl = (0, curl_1.generateCurl)(tx);
        tx._detailResolved = true;

        return tx;
    }

    clear() {
        this.transactions = [];
        this.notify(true);
    }

    getById(id) {
        const tx = this.transactions.find((t) => t.id === id);
        return tx ? this.resolveDetail(tx) : null;
    }
}
function getGlobalStore() {
    const root = typeof wx !== "undefined" ? wx : typeof global !== "undefined" ? global : {};
    if (!root.__chucker_store__) {
        root.__chucker_store__ = new ChuckerStore();
    }
    return root.__chucker_store__;
}

exports.ChuckerStore = ChuckerStore;
exports.chuckerStore = getGlobalStore();
