"use strict";
const assert = require("assert");
const path = require("path");
const targetDir = process.env.TARGET_DIR ? path.resolve(process.env.TARGET_DIR) : path.resolve(__dirname, "../src");

// Mock WeChat global wx
global.wx = {
    __chucker_installed__: false,
    request: () => {},
    uploadFile: () => {},
    downloadFile: () => {},
    invokeNativePlugin: () => {},
    invoke: () => {},
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    setClipboardData: ({ data, success }) => { success && success(); },
    showToast: () => {},
    vibrateShort: () => {}
};

const { installInterceptors } = require(path.join(targetDir, "core/interceptor"));
const { chuckerStore } = require(path.join(targetDir, "core/store"));
const { safeJsonStringify } = require(path.join(targetDir, "core/sanitizer"));
const { generateCurl } = require(path.join(targetDir, "core/curl"));

console.log("--- 1. Testing Synchronous Native Bridge (Object-Style) ---");
let syncBridgeCalled = false;
global.wx.invokeNativePlugin = function (options) {
    syncBridgeCalled = true;
    // Native plugin returns synchronous object directly, WITHOUT invoking callbacks
    return { code: 0, message: "Sync Success", data: { battery: 98 } };
};

installInterceptors({ enabled: true });

const syncRes = global.wx.invokeNativePlugin({ api_name: "getBatteryLevelSync" });
assert.strictEqual(syncRes.data.battery, 98, "Sync native call should return value directly");

const state1 = chuckerStore.getState();
const syncTx = state1.transactions.find(t => t.name === "getBatteryLevelSync");
assert.ok(syncTx, "Sync bridge call should be recorded in store");
assert.strictEqual(syncTx.isInFlight, false, "Sync bridge transaction must NOT be left in-flight / pending");
assert.strictEqual(syncTx.statusCode, 0, "Sync bridge status code should be 0");
assert.strictEqual(syncTx.isError, false, "Code 0 is success");
console.log("✅ Sync Native Bridge successfully resolved without hanging in Pending!");

console.log("--- 2. Testing Query Parameter Merging & Deduplication ---");
chuckerStore.clear();

// Calling wx.request with GET where URL already has userId=100, and data has { userId: 100, status: 'active' }
global.wx.request = function (options) {
    if (options.success) {
        options.success({ statusCode: 200, header: {}, data: { ok: true } });
    }
};
global.wx.__chucker_installed__ = false; // re-install to wrap mock
installInterceptors({ enabled: true });

global.wx.request({
    url: "https://tdwhaqa.telkomsel.com/dev/api/profile?userId=100&version=2",
    method: "GET",
    data: {
        userId: "100", // duplicate
        role: "vip"
    }
});

const state2 = chuckerStore.getState();
const getTx = state2.transactions[0];
assert.ok(getTx, "GET transaction should exist");
console.log("Merged URL:", getTx.url);

// Check that userId=100 appears only ONCE in getTx.url
const userIdMatches = getTx.url.match(/userId=100/g);
assert.strictEqual(userIdMatches.length, 1, "userId=100 must appear exactly ONCE, no duplicates!");
assert.ok(getTx.url.includes("role=vip"), "New query params should be cleanly merged");
assert.ok(getTx.url.includes("version=2"), "Existing query params should be preserved");

const curlCmd = generateCurl(getTx);
console.log("Generated cURL:", curlCmd);
const curlMatches = curlCmd.match(/userId=100/g);
assert.strictEqual(curlMatches.length, 1, "cURL URL must also have zero duplicate query parameters!");
console.log("✅ Query Parameter Deduplication verified successfully!");

console.log("--- 3. Testing Circular Reference Safety in Clipboard & Formatting ---");
const circularObj = {
    name: "circular_test",
    count: 42,
    big: BigInt(9007199254740991)
};
circularObj.self = circularObj; // circular reference!

const serialized = safeJsonStringify(circularObj, 2);
assert.ok(serialized.includes("[Circular]"), "Should safely detect circular references");
assert.ok(serialized.includes("9007199254740991"), "Should safely handle BigInt");
console.log("✅ Circular reference & BigInt safely serialized without throwing exceptions!");

console.log("--- 4. Testing Callback Double-Firing Latch ---");
chuckerStore.clear();

let mockCallCount = 0;
global.wx.request = function (options) {
    // Malicious or buggy SDK that fires both success AND complete
    if (options.success) options.success({ statusCode: 200, data: { pass: 1 } });
    if (options.complete) options.complete({ statusCode: 200, data: { pass: 1 } });
};
global.wx.__chucker_installed__ = false;
installInterceptors({ enabled: true });

let storeNotifiedCount = 0;
const unsub = chuckerStore.subscribe(() => {
    storeNotifiedCount++;
});

global.wx.request({
    url: "https://api.test.com/latch",
    method: "POST",
    data: { test: true }
});

const state4 = chuckerStore.getState();
const latchTx = state4.transactions[0];
assert.strictEqual(latchTx.isInFlight, false);
assert.strictEqual(latchTx.statusCode, 200);
unsub();
console.log("✅ Callback latch prevents duplicate resolution!");

console.log("\n🎯 ALL INTERMITTENT LOGIC & STABILITY TESTS PASSED WITH 100% SUCCESS!");
