const assert = require("assert");
const path = require("path");
const targetDir = process.env.TARGET_DIR ? path.resolve(process.env.TARGET_DIR) : path.resolve(__dirname, "../src");

// Mock WeChat global environment
global.wx = {
    __chucker_installed__: false,
    request: function (opts) {
        setTimeout(() => {
            if (opts.url && opts.url.includes("fail")) {
                opts.fail && opts.fail({ errMsg: "request:fail network error", statusCode: 500 });
                opts.complete && opts.complete({ errMsg: "request:fail network error" });
            } else {
                opts.success && opts.success({
                    statusCode: 200,
                    header: { "content-type": "application/json", "authorization": "Bearer secret_token_xyz" },
                    data: { code: 0, data: { offers: [1, 2, 3] } }
                });
                opts.complete && opts.complete({ statusCode: 200 });
            }
        }, 5);
    },
    uploadFile: function (opts) {
        setTimeout(() => {
            opts.success && opts.success({ statusCode: 200, data: '{"status":"uploaded"}' });
            opts.complete && opts.complete({ statusCode: 200 });
        }, 5);
    },
    downloadFile: function (opts) {
        setTimeout(() => {
            opts.success && opts.success({ statusCode: 200, tempFilePath: "/tmp/file.png" });
            opts.complete && opts.complete({ statusCode: 200 });
        }, 5);
    },
    invokeNativePlugin: function (opts) {
        setTimeout(() => {
            opts.success && opts.success({ code: 0, message: "native success" });
            opts.complete && opts.complete({ code: 0 });
        }, 5);
    },
    invoke: function (name, data, callback) {
        setTimeout(() => {
            callback && callback({ code: 0, data: "wechat invoke ok" });
        }, 5);
    },
    vibrateShort: () => {},
    setClipboardData: (opts) => opts.success && opts.success(),
    showToast: () => {}
};

const { installInterceptors } = require(path.join(targetDir, "core/interceptor"));
const { chuckerStore } = require(path.join(targetDir, "core/store"));
const { generateCurl } = require(path.join(targetDir, "core/curl"));
const { prettyFormat } = require(path.join(targetDir, "core/sanitizer"));

installInterceptors();

async function runTests() {
    console.log("1. Testing wx.request (POST + JSON + Token)...");
    await new Promise((resolve) => {
        wx.request({
            url: "https://tdwhaqa.telkomsel.com/dev/api/offers/filtered-offers/v9?lang=en",
            method: "POST",
            header: {
                "Authorization": "Bearer my_super_long_untruncated_and_unredacted_token_1234567890",
                "Content-Type": "application/json"
            },
            data: { filter: "cinema", count: 10 },
            success: (res) => {
                const state = chuckerStore.getState();
                const tx = state.transactions.find((t) => t.url.includes("filtered-offers"));
                assert(tx, "Transaction should exist");
                const detail = chuckerStore.getById(tx.id);
                assert(detail.curl.includes("my_super_long_untruncated_and_unredacted_token_1234567890"), "cURL must retain unredacted token");
                assert(detail.curl.includes("tdwhaqa.telkomsel.com"), "cURL must retain host");
                assert(detail.requestBodyFormatted.includes('"filter": "cinema"'), "Request body should be formatted");
                assert.strictEqual(detail.statusCode, 200);
                resolve();
            }
        });
    });

    console.log("2. Testing wx.request failure handling...");
    await new Promise((resolve) => {
        wx.request({
            url: "https://tdwhaqa.telkomsel.com/api/fail-endpoint",
            method: "GET",
            fail: (err) => {
                const state = chuckerStore.getState();
                const tx = state.transactions.find((t) => t.url.includes("fail-endpoint"));
                assert(tx, "Failed transaction should exist");
                assert.strictEqual(tx.isError, true, "Should be flagged as error");
                resolve();
            }
        });
    });

    console.log("3. Testing wx.uploadFile...");
    await new Promise((resolve) => {
        wx.uploadFile({
            url: "https://api.upload.com/avatar",
            filePath: "/tmp/avatar.png",
            name: "avatar",
            formData: { userId: "user123" },
            success: (res) => {
                const state = chuckerStore.getState();
                const tx = state.transactions.find((t) => t.url.includes("avatar"));
                assert(tx, "Upload transaction should exist");
                assert.strictEqual(tx.type, "UPLOAD");
                const detail = chuckerStore.getById(tx.id);
                assert(detail.curl.includes("-F 'avatar=@/tmp/avatar.png'"), "cURL should include file parameter");
                resolve();
            }
        });
    });

    console.log("4. Testing wx.downloadFile...");
    await new Promise((resolve) => {
        wx.downloadFile({
            url: "https://cdn.example.com/asset.zip",
            success: (res) => {
                const state = chuckerStore.getState();
                const tx = state.transactions.find((t) => t.url.includes("asset.zip"));
                assert(tx, "Download transaction should exist");
                assert.strictEqual(tx.type, "DOWNLOAD");
                resolve();
            }
        });
    });

    console.log("5. Testing wx.invokeNativePlugin...");
    await new Promise((resolve) => {
        wx.invokeNativePlugin({
            api_name: "getDeviceInfo",
            data: { extended: true },
            success: (res) => {
                const state = chuckerStore.getState();
                const tx = state.transactions.find((t) => t.name === "getDeviceInfo");
                assert(tx, "Native plugin transaction should exist");
                assert.strictEqual(tx.type, "BRIDGE");
                const detail = chuckerStore.getById(tx.id);
                assert(detail.curl.includes("wx.invokeNativePlugin"), "cURL should generate bridge invocation");
                resolve();
            }
        });
    });

    console.log("6. Testing wx.invoke...");
    await new Promise((resolve) => {
        wx.invoke("sendBridgeData", { key: "val" }, (res) => {
            const state = chuckerStore.getState();
            const tx = state.transactions.find((t) => t.name === "sendBridgeData");
            assert(tx, "WeChat invoke transaction should exist");
            assert.strictEqual(tx.type, "BRIDGE");
            resolve();
        });
    });

    console.log("7. Testing Store State & Counts...");
    const state = chuckerStore.getState();
    assert.strictEqual(state.total, 6);
    assert(state.errors >= 1);
    assert(state.networkCount >= 4);
    assert(state.nativeCount >= 2);

    console.log("✅ ALL TESTS PASSED!");
}

runTests().catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
});
