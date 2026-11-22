#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      if (fs.existsSync(destPath)) {
        try { fs.chmodSync(destPath, 0o644); } catch (_) {}
      }
      fs.copyFileSync(srcPath, destPath);
      // Enforce Read-Only permissions (0o444) so consumers cannot tamper with UI files
      try {
        fs.chmodSync(destPath, 0o444);
      } catch (_) {}
    }
  }
}

function run() {
  try {
    // 1. Determine consumer project root
    let projectRoot = process.env.INIT_CWD;

    // Fallback if INIT_CWD is missing: look above node_modules/wx-chucker
    if (!projectRoot || projectRoot === process.cwd()) {
      const parts = __dirname.split(path.sep);
      const nmIndex = parts.lastIndexOf("node_modules");
      if (nmIndex > 0) {
        projectRoot = parts.slice(0, nmIndex).join(path.sep);
      }
    }

    if (!projectRoot) return;

    // Skip if running inside wx-chucker's own repository during development
    const ownPkgPath = path.resolve(__dirname, "..", "package.json");
    if (fs.existsSync(ownPkgPath)) {
      try {
        const ownPkg = JSON.parse(fs.readFileSync(ownPkgPath, "utf8"));
        if (ownPkg.name === "wx-chucker" && path.resolve(projectRoot) === path.resolve(__dirname, "..")) {
          return;
        }
      } catch (_) {}
    }

    // 2. Check if projectRoot is a WeChat / TCMPP Mini-Program project
    const hasAppJson = fs.existsSync(path.join(projectRoot, "app.json"));
    const hasProjectConfig = fs.existsSync(path.join(projectRoot, "project.config.json"));

    if (!hasAppJson && !hasProjectConfig) {
      // Not a mini-program project (e.g. backend server or CI), skip
      return;
    }

    // 3. Source is miniprogram_dist
    const srcDir = path.resolve(__dirname, "..", "miniprogram_dist");
    if (!fs.existsSync(srcDir)) return;

    // 4. Target is <projectRoot>/components/chucker
    const targetDir = path.join(projectRoot, "components", "chucker");

    copyDirRecursive(srcDir, targetDir);

    console.log("\n======================================================");
    console.log("⚡ [wx-chucker] Auto-synced native component for TCMPP / WeChat!");
    console.log(`📁 Installed at: components/chucker/`);
    console.log("------------------------------------------------------");
    console.log("👉 Step 1 (app.js):");
    console.log("   const { initChucker } = require('./components/chucker/chucker');");
    console.log("   initChucker({ enabled: true });");
    console.log("\n👉 Step 2 (app.json):");
    console.log('   "usingComponents": {');
    console.log('     "chucker": "/components/chucker/index"');
    console.log("   }");
    console.log("\n👉 Step 3 (WXML):");
    console.log("   <chucker />");
    console.log("======================================================\n");
  } catch (_) {
    // Postinstall must never fail or block npm install
  }
}

run();
