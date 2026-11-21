"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const testFiles = [
    "test_chucker.js",
    "test_security_gating.js",
    "test_search.js",
    "test_intermittent_logic.js",
    "test_shake_dock.js",
    "test_large_export.js"
];

const targetDir = process.env.TARGET_DIR || path.resolve(__dirname, "../src");
console.log(`\n======================================================`);
console.log(`🧪 RUNNING WX-CHUCKER TEST SUITE`);
console.log(`Target Directory: ${targetDir}`);
console.log(`======================================================\n`);

let passed = 0;
let failed = 0;

for (const file of testFiles) {
    const fullPath = path.join(__dirname, file);
    console.log(`▶ Running ${file}...`);
    const res = spawnSync("node", [fullPath], {
        env: { ...process.env, TARGET_DIR: targetDir },
        stdio: "inherit"
    });

    if (res.status === 0) {
        passed++;
        console.log(`✅ ${file} PASSED\n`);
    } else {
        failed++;
        console.error(`❌ ${file} FAILED with status code ${res.status}\n`);
    }
}

console.log(`======================================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    console.log(`🎉 ALL 6 SUITES PASSED! 100% SUCCESS.\n`);
    process.exit(0);
}
