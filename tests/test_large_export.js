"use strict";

const assert = require("assert");
const path = require("path");
const targetDir = process.env.TARGET_DIR ? path.resolve(process.env.TARGET_DIR) : path.resolve(__dirname, "../src");

let clipboardData = "";
let clipboardFail = false;
let clipboardErrorMsg = "";
let fileWritten = false;
let writtenFilePath = "";
let writtenFileData = "";
let fileShared = false;
let sharedFilePath = "";
let toastTitle = "";
let actionSheetItems = [];
let actionSheetCallback = null;

global.wx = {
    env: {
        USER_DATA_PATH: "wxfile://usr"
    },
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, statusBarHeight: 44 }),
    getSystemInfoSync: () => ({ platform: "android", windowWidth: 375, windowHeight: 667, statusBarHeight: 44 }),
    getDeviceInfo: () => ({ platform: "android" }),
    getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32 }),
    getStorageSync: () => "dark",
    setStorageSync: () => {},
    vibrateShort: () => {},
    showToast: (opts) => {
        toastTitle = opts?.title || "";
    },
    showActionSheet: (opts) => {
        actionSheetItems = opts?.itemList || [];
        actionSheetCallback = opts?.success;
    },
    setClipboardData: (opts) => {
        if (clipboardFail) {
            opts?.fail?.({ errMsg: clipboardErrorMsg });
        } else {
            clipboardData = opts?.data || "";
            opts?.success?.();
        }
    },
    getFileSystemManager: () => ({
        writeFile: (opts) => {
            fileWritten = true;
            writtenFilePath = opts?.filePath || "";
            writtenFileData = opts?.data || "";
            opts?.success?.();
        }
    }),
    shareFileMessage: (opts) => {
        fileShared = true;
        sharedFilePath = opts?.filePath || "";
        opts?.success?.();
    }
};

let registeredComponent = null;
global.Component = function (config) {
    registeredComponent = config;
};

// Require the chucker component
require(path.join(targetDir, "index.js"));

const store = require(path.join(targetDir, "core/store.js"));

function createInstance() {
    const instance = {
        data: JSON.parse(JSON.stringify(registeredComponent.data)),
        properties: { enabled: true },
        setData(newData) {
            Object.assign(this.data, newData);
        }
    };
    for (const [key, fn] of Object.entries(registeredComponent.methods)) {
        instance[key] = fn.bind(instance);
    }
    return instance;
}

console.log("==========================================================");
console.log("--- 1. Testing Large Export (> 180 KB) Android Protection ---");
console.log("==========================================================");

{
    store.chuckerStore.clear();

    // Populate store with 60 transactions with large 15KB payloads each (total ~1 MB)
    for (let i = 0; i < 60; i++) {
        store.chuckerStore.transactions.push({
            id: "tx_" + i,
            type: "HTTP",
            method: "POST",
            name: "/api/order/" + i,
            url: "https://api.example.com/order/" + i,
            statusCode: 200,
            statusText: "OK",
            durationMs: 250,
            timeFormatted: "10:00:00",
            isInFlight: false,
            isError: false,
            headers: { "content-type": "application/json" },
            body: { orderId: i, items: [1, 2, 3] },
            responseHeaders: { "content-type": "application/json" },
            responseBody: { result: "X".repeat(15000), count: i }, // 15KB payload per item
            curl: "curl -X POST https://api.example.com/order/" + i
        });
    }

    const comp = createInstance();
    registeredComponent.lifetimes.attached.call(comp);

    fileWritten = false;
    fileShared = false;
    clipboardData = "";

    // Trigger onExportLogs
    comp.onExportLogs();

    // Step 1: Category selection (All Logs)
    assert(actionSheetItems.length >= 3, "Category action sheet must have Network, Native, All");
    actionSheetCallback({ tapIndex: 2 }); // Select All Logs

    // Step 2: Because payload is ~1 MB (> 150 KB), it presents format options:
    assert(actionSheetItems.length === 3, "Large payload must offer 3 safe options");
    assert(actionSheetItems[0].includes("Share Full JSON File"), "Option 0 must be Share Full JSON File");
    assert(actionSheetItems[1].includes("Copy Safe Summary"), "Option 1 must be Copy Safe Summary");
    assert(actionSheetItems[2].includes("Copy All cURL"), "Option 2 must be Copy All cURL");

    // Test Option 0: Share Full JSON File
    actionSheetCallback({ tapIndex: 0 });

    assert.strictEqual(fileWritten, true, "File must be written via getFileSystemManager");
    assert(writtenFilePath.startsWith("wxfile://usr/chucker_all_logs_"), "File must be written to USER_DATA_PATH");
    assert(writtenFileData.length > 500000, "Full un-truncated file data (>500KB) must be written");
    assert.strictEqual(fileShared, true, "shareFileMessage must be invoked for 1-tap sharing");
    assert.strictEqual(sharedFilePath, writtenFilePath, "Shared file path must match written file path");
    assert.strictEqual(clipboardData, "", "Large payload must NOT be passed to clipboard directly!");

    console.log("✅ Share Full JSON File (> 500 KB) passed without triggering Android Binder limit!");

    // Test Option 1: Copy Safe Summary to Clipboard
    clipboardData = "";
    actionSheetCallback({ tapIndex: 1 });

    assert(clipboardData.length > 0, "Safe summary must be copied to clipboard");
    assert(clipboardData.length < 180 * 1024, `Safe summary (${clipboardData.length} bytes) MUST be under 180 KB!`);
    assert(clipboardData.includes("[Response truncated"), "Large response bodies must be safely truncated with annotation");

    console.log(`✅ Safe Summary to Clipboard (${(clipboardData.length/1024).toFixed(1)} KB) is 100% under 180 KB limit!`);
}

console.log("==========================================================");
console.log("--- 2. Testing TransactionTooLargeException Recovery ---");
console.log("==========================================================");

{
    // Simulate Android OS throwing TransactionTooLargeException in setClipboardData
    clipboardFail = true;
    clipboardErrorMsg = "android.os.TransactionTooLargeException: data parcel size 1048576 bytes";
    fileWritten = false;
    fileShared = false;

    const comp = createInstance();

    // In detail view, user tries to copy a massive 300KB response body
    const massiveResponse = {
        data: "Z".repeat(300 * 1024)
    };
    comp.setData({
        selectedTransaction: {
            id: "tx_massive",
            responseBody: massiveResponse,
            responseBodyFormatted: JSON.stringify(massiveResponse)
        }
    });

    comp.onCopyResponseBody();

    // Since payload > 180KB, it automatically routes to saveAndShareFile, preventing crash!
    assert.strictEqual(fileWritten, true, "Massive response body must be automatically saved as a file");
    assert.strictEqual(fileShared, true, "Massive response body must be shared via shareFileMessage");
    assert(writtenFileData.length > 300000, "Full massive response data must be preserved in file");

    console.log("✅ Automatic file-save & share recovery prevents TransactionTooLargeException!");
}

console.log("\n🚀 ALL LARGE EXPORT & BINDER RECOVERY TESTS PASSED 100%!\n");
