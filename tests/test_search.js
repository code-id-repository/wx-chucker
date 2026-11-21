const assert = require("assert");
const path = require("path");
const targetDir = process.env.TARGET_DIR ? path.resolve(process.env.TARGET_DIR) : path.resolve(__dirname, "../src");

let compDef = null;
global.Component = function (def) { compDef = def; };
global.wx = {
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, statusBarHeight: 44 }),
    getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32 }),
    getStorageSync: () => "dark"
};

require(path.join(targetDir, "index.js"));
const { chuckerStore } = require(path.join(targetDir, "core/store"));

chuckerStore.clear();

// Seed test transactions
chuckerStore.addRequest({
    id: "tx_1",
    type: "HTTP",
    method: "POST",
    url: "https://tdwhaqa.telkomsel.com/dev/api/offers/filtered-offers/v9?lang=en",
    body: { filter: "cinema", count: 10 }
});
chuckerStore.updateResponse("tx_1", { statusCode: 200 });

chuckerStore.addRequest({
    id: "tx_2",
    type: "HTTP",
    method: "GET",
    url: "https://api.telkomsel.com/user/profile",
    body: null
});
chuckerStore.updateResponse("tx_2", { statusCode: 404 });

chuckerStore.addRequest({
    id: "tx_3",
    type: "BRIDGE",
    method: "NATIVE",
    url: "getDeviceInfo",
    name: "getDeviceInfo",
    body: { extended: true }
});
chuckerStore.updateResponse("tx_3", { statusCode: 200 });

const ctx = {
    data: { ...compDef.data },
    setData(obj) { Object.assign(this.data, obj); },
    ...compDef.methods
};

ctx.openModal();
assert.strictEqual(ctx.data.filteredTransactions.length, 3, "Initial count should be 3");

console.log("1. Testing search by URL path ('offer')...");
ctx.onSearchInput({ detail: { value: "offer" } });
assert.strictEqual(ctx.data.filteredTransactions.length, 1, "Only 'offer' should match");
assert.strictEqual(ctx.data.filteredTransactions[0].id, "tx_1");
assert.strictEqual(ctx.data.stats.total, 1, "Category count 'All' must follow search filter");
assert.strictEqual(ctx.data.stats.networkCount, 1, "Category count 'Network' must follow search filter");
assert.strictEqual(ctx.data.stats.nativeCount, 0, "Category count 'Native' must follow search filter");

console.log("2. Testing search by request payload ('cinema')...");
ctx.onSearchInput({ detail: { value: "cinema" } });
assert.strictEqual(ctx.data.filteredTransactions.length, 1, "Only 'cinema' payload should match");
assert.strictEqual(ctx.data.filteredTransactions[0].id, "tx_1");
assert.strictEqual(ctx.data.stats.total, 1);
assert.strictEqual(ctx.data.stats.networkCount, 1);
assert.strictEqual(ctx.data.stats.nativeCount, 0);

console.log("3. Testing search by status code ('404')...");
ctx.onSearchInput({ detail: { value: "404" } });
assert.strictEqual(ctx.data.filteredTransactions.length, 1, "Only 404 should match");
assert.strictEqual(ctx.data.filteredTransactions[0].id, "tx_2");
assert.strictEqual(ctx.data.stats.total, 1);
assert.strictEqual(ctx.data.stats.networkCount, 1);
assert.strictEqual(ctx.data.stats.nativeCount, 0);
assert.strictEqual(ctx.data.stats.errors, 1, "Error count chip must follow search filter");

console.log("4. Testing search by native bridge name ('getDeviceInfo')...");
ctx.onSearchInput({ detail: { value: "deviceinfo" } });
assert.strictEqual(ctx.data.filteredTransactions.length, 1, "Only getDeviceInfo should match");
assert.strictEqual(ctx.data.filteredTransactions[0].id, "tx_3");
assert.strictEqual(ctx.data.stats.total, 1);
assert.strictEqual(ctx.data.stats.networkCount, 0, "Network count should be 0 for native call");
assert.strictEqual(ctx.data.stats.nativeCount, 1, "Native count should be 1 for native call");

console.log("5. Testing clear search...");
ctx.onClearSearch();
assert.strictEqual(ctx.data.filteredTransactions.length, 3, "Clearing search should restore all 3 transactions");
assert.strictEqual(ctx.data.searchQuery, "");
assert.strictEqual(ctx.data.stats.total, 3, "Category 'All' should restore to total 3");
assert.strictEqual(ctx.data.stats.networkCount, 2, "Category 'Network' should restore to 2");
assert.strictEqual(ctx.data.stats.nativeCount, 1, "Category 'Native' should restore to 1");
assert.strictEqual(ctx.data.stats.errors, 1, "Error chip should restore to 1");

console.log("✅ ALL SEARCH & DYNAMIC STATS TESTS PASSED SUCCESSFULLY!");
