const assert = require("assert");
const path = require("path");
const targetDir = process.env.TARGET_DIR ? path.resolve(process.env.TARGET_DIR) : path.resolve(__dirname, "../src");

// 1. Test Production Environment Auto-Gating
console.log("--- 1. Testing Production Auto-Gating ---");
global.__wxConfig = { envVersion: "release" };
global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
    request: function () { return "original_unpatched_request"; },
    uploadFile: function () { return "original_unpatched_upload"; },
    downloadFile: function () { return "original_unpatched_download"; }
};

const types = require(path.join(targetDir, "core/types"));
assert.strictEqual(types.isProductionEnv(), true, "Should detect release environment as production");
assert.strictEqual(types.isProductionEnv("production"), true, "Should detect 'production' as production");
assert.strictEqual(types.isProductionEnv("prod"), true, "Should detect 'prod' as production");
assert.strictEqual(types.isProductionEnv("live"), true, "Should detect 'live' as production");
assert.strictEqual(types.isProductionEnv("prd"), true, "Should detect 'prd' as production");
assert.strictEqual(types.isProductionEnv("develop"), false, "Should not detect 'develop' as production");
assert.strictEqual(types.isProductionEnv("trial"), false, "Should not detect 'trial' as production");

// Test getApp().globalData.apiEnv auto-detection
global.getApp = () => ({ globalData: { apiEnv: "PROD" } });
assert.strictEqual(types.isProductionEnv(), true, "Should detect getApp().globalData.apiEnv === 'PROD'");
delete global.getApp;

const { initChucker, isChuckerEnabled, chuckerStore } = require(path.join(targetDir, "chucker"));

// Initialize without explicit enabled flag in release environment
const store = initChucker();
assert.strictEqual(isChuckerEnabled(), false, "Chucker must automatically be DISABLED in production release");
assert.strictEqual(global.wx.request(), "original_unpatched_request", "wx.request must remain 100% unpatched in production");

// Test init with explicit env: 'production'
const storeProd = initChucker({ env: "production" });
assert.strictEqual(isChuckerEnabled(), false, "Chucker must automatically be DISABLED when env: 'production'");

// 2. Test Component Dormancy when Disabled
console.log("--- 2. Testing Component Zero-Footprint when Disabled ---");
let compDef = null;
global.Component = function (def) { compDef = def; };
require(path.join(targetDir, "index.js"));

const compInstance = {
    properties: { enabled: null },
    data: { ...compDef.data },
    setData: function (d) { Object.assign(this.data, d); }
};
compDef.lifetimes.attached.call(compInstance);
assert.strictEqual(compInstance.data.enabled, false, "Component must set enabled=false");
assert.strictEqual(compInstance.unsubscribe, undefined, "Component must not subscribe to store when disabled");

// 3. Test Staging Pentest Masking Mode
console.log("--- 3. Testing Staging Pentest Masking Mode ---");
global.__wxConfig = { envVersion: "trial" }; // Staging / UAT build
global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "trial" } });

// Staging Pentest initialization
initChucker({
    enabled: true,
    maskSensitive: true // Mask tokens so pentesters do not flag cleartext data exposure
});

const reqId = chuckerStore.addRequest({
    id: "pentest_test_1",
    url: "https://api.telkomsel.com/user/profile",
    method: "POST",
    headers: {
        "Authorization": "Bearer super_secret_jwt_token_12345",
        "Content-Type": "application/json"
    },
    body: {
        password: "MySecretPassword123",
        pin: "123456",
        username: "testuser"
    }
});

const detail = chuckerStore.getById(reqId);
assert(detail.requestHeadersFormatted.includes("•••••••• [Redacted]"), "Authorization header must be masked in pentest mode");
assert(!detail.requestHeadersFormatted.includes("super_secret_jwt_token_12345"), "Raw token must NOT appear when maskSensitive: true");
assert(detail.requestBodyFormatted.includes("•••••••• [Redacted]"), "Password/PIN must be masked in pentest mode");
assert(!detail.requestBodyFormatted.includes("MySecretPassword123"), "Raw password must NOT appear when maskSensitive: true");
assert(detail.requestBodyFormatted.includes("testuser"), "Non-sensitive fields like username should remain visible");

console.log("✅ ALL SECURITY & PRODUCTION GATING TESTS PASSED!");
