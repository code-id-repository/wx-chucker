#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC_DIR = path.resolve(__dirname, "../src");
const targetProject = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../../le-rewrite-pure-wx");

if (!fs.existsSync(targetProject)) {
  console.error(`❌ Target project does not exist: ${targetProject}`);
  console.log("Usage: npm run dev:watch <path-to-miniprogram-project>");
  process.exit(1);
}

console.log("======================================================");
console.log("👀 [wx-chucker] Live Watch & Auto-Sync Mode");
console.log(`Watching:  ${SRC_DIR}`);
console.log(`Target:    ${targetProject}/components/chucker/`);
console.log("======================================================");

let timeout = null;
let isBuilding = false;

function sync() {
  if (isBuilding) return;
  isBuilding = true;
  const startTime = Date.now();

  try {
    // 1. Build miniprogram_dist
    execSync("node scripts/build.js", { cwd: path.resolve(__dirname, ".."), stdio: "ignore" });
    // 2. Sync to target project
    execSync(`node scripts/postinstall.js "${targetProject}"`, { cwd: path.resolve(__dirname, ".."), stdio: "ignore" });

    const now = new Date().toLocaleTimeString();
    console.log(`⚡ [${now}] Rebuilt & synced to target in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.error("❌ Build/Sync error:", err.message);
  } finally {
    isBuilding = false;
  }
}

// Initial sync on startup
sync();

// Watch src/
fs.watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  if (filename.startsWith(".") || filename.endsWith("~")) return;

  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => {
    sync();
  }, 100);
});

console.log("\n🚀 Watching for changes in src/... (Press Ctrl+C to stop)\n");
