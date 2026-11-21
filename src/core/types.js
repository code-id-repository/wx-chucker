"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductionEnv = exports.DEFAULT_SENSITIVE_KEYS = exports.DEFAULT_SENSITIVE_HEADERS = exports.DEFAULT_CHUCKER_CONFIG = void 0;

const PROD_KEYWORDS = new Set([
    "release",
    "production",
    "prod",
    "live",
    "prd",
    "online"
]);

const NON_PROD_KEYWORDS = new Set([
    "develop",
    "dev",
    "trial",
    "test",
    "testing",
    "staging",
    "stage",
    "uat",
    "sit",
    "qa",
    "local"
]);

/**
 * Multi-Tier Production Detector.
 * Automatically checks:
 * 1. Explicit parameter (e.g. initChucker({ env: 'production' | 'prod' | 'live' }))
 * 2. WeChat / TCMPP Platform Container (wx.getAccountInfoSync().miniProgram.envVersion)
 * 3. Mini Program Global Config (__wxConfig.envVersion)
 * 4. Bundler / Node Environment (process.env.NODE_ENV)
 * 5. Host Application Global Config (getApp().globalData: env, apiEnv, buildEnv)
 */
function isProductionEnv(customEnv) {
    // 1. Explicit parameter check (takes top precedence)
    if (customEnv && typeof customEnv === "string") {
        const c = customEnv.toLowerCase().trim();
        if (PROD_KEYWORDS.has(c)) return true;
        if (NON_PROD_KEYWORDS.has(c)) return false;
    }

    // 2. WeChat / TCMPP Platform Container Check (wx.getAccountInfoSync)
    try {
        if (typeof wx !== "undefined" && typeof wx.getAccountInfoSync === "function") {
            const acc = wx.getAccountInfoSync();
            const envVersion = acc?.miniProgram?.envVersion;
            if (envVersion && PROD_KEYWORDS.has(String(envVersion).toLowerCase().trim())) {
                return true;
            }
        }
    } catch (_) {}

    // 3. Mini Program Global Config (__wxConfig)
    try {
        if (typeof __wxConfig !== "undefined" && __wxConfig && __wxConfig.envVersion) {
            if (PROD_KEYWORDS.has(String(__wxConfig.envVersion).toLowerCase().trim())) {
                return true;
            }
        }
    } catch (_) {}

    // 4. Bundler Environment Variables (process.env.NODE_ENV)
    try {
        if (typeof process !== "undefined" && process?.env?.NODE_ENV) {
            if (PROD_KEYWORDS.has(String(process.env.NODE_ENV).toLowerCase().trim())) {
                return true;
            }
        }
    } catch (_) {}

    // 5. Host Application Global Configuration (getApp().globalData / config)
    try {
        if (typeof getApp === "function") {
            const app = getApp();
            const candidates = [
                app?.globalData?.env,
                app?.globalData?.apiEnv,
                app?.globalData?.buildEnv,
                app?.globalData?.environment,
                app?.config?.env,
                app?.config?.apiEnv
            ];
            for (const val of candidates) {
                if (val && typeof val === "string" && PROD_KEYWORDS.has(val.toLowerCase().trim())) {
                    return true;
                }
            }
        }
    } catch (_) {}

    return false;
}
exports.isProductionEnv = isProductionEnv;

/**
 * Default sensitive headers and body keys masked during pentests or when maskSensitive: true.
 */
exports.DEFAULT_SENSITIVE_HEADERS = [
    "authorization",
    "cookie",
    "x-auth-token",
    "x-access-token",
    "token",
    "session-id"
];

exports.DEFAULT_SENSITIVE_KEYS = [
    "password",
    "passwd",
    "pin",
    "otp",
    "secret",
    "cvv",
    "card_number",
    "access_token",
    "refresh_token"
];

exports.DEFAULT_CHUCKER_CONFIG = {
    // In production ('release'), enabled defaults to false automatically!
    enabled: !isProductionEnv(),
    autoDetectEnv: true,
    maskSensitive: false, // Set to true in QA / Pentest environments to mask tokens & PII
    maxTransactions: 120,
    trackHttp: true,
    trackNativePlugin: true,
    trackUpload: true,
    trackDownload: true,
    maxBodyLength: 500000,
    redactHeaders: [],
    redactBodyKeys: []
};
