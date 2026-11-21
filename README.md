# wx-chucker

<p align="center">
  <strong>In-App Network & Native Bridge Inspector for WeChat Mini-Programs & TCMPP Super-Apps</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wx-chucker"><img src="https://img.shields.io/npm/v/wx-chucker.svg?color=blue" alt="npm version" /></a>
  <a href="https://github.com/code-id-repository/wx-chucker"><img src="https://img.shields.io/badge/GitHub-code--id--repository%2Fwx--chucker-181717.svg?logo=github" alt="GitHub Repo" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/minified-~25KB-brightgreen.svg" alt="Minified Size" />
  <img src="https://img.shields.io/badge/platform-WeChat%20%7C%20TCMPP-07C160.svg" alt="Platform" />
</p>

A production-grade developer and QA inspection suite tailored for WeChat Mini-Programs and TCMPP containers. Inspect outgoing HTTP/HTTPS calls and native bridge plugins directly inside your running Mini-Program with zero desktop proxy configuration.

---

## 🚀 Key Features

- 🌐 **Full Network Interception**: Captures `wx.request`, `wx.uploadFile`, and `wx.downloadFile` with method, URL, headers, query parameters, request payload, response status code, timing, and response body.
- 🔌 **Native Bridge Inspector**: Intercepts `wx.invokeNativePlugin` and `wx.invoke` calls, capturing input parameters and return data.
- 🧲 **Smart Ghost Dock**: AssistiveTouch-style floating badge that snaps to screen edges and auto-dims to 38% opacity after 3 seconds of inactivity.
- 📳 **Passive Shake-to-Open**: Native accelerometer gesture (`Δ > 2.2`) to toggle the inspector on physical devices. Sensor listener automatically pauses when the inspector is open to consume 0% idle battery.
- 🖥️ **DevTools Fail-Safe**: Built-in unhide notch fallback in WeChat DevTools when physical motion sensors are unavailable.
- 📋 **1-Tap cURL & JS Call Export**: Generates executable `curl` commands for network calls and JavaScript snippets for bridge calls.
- 🛡️ **Android Binder IPC Protection**: Prevents `android.os.TransactionTooLargeException` by automatically routing payloads > 180 KB through `wx.getFileSystemManager` and `wx.shareFileMessage`.
- 🔒 **Production Auto-Gating**: Detects release environments (`release`, `prod`, `live`) and remains completely dormant with zero runtime overhead in production builds.

---

## 📦 Installation & Setup Guide

### Step 1: Install via npm

In your Mini-Program project root:

```bash
# If your project does not have a package.json yet, initialize it first:
npm init -y

# Install wx-chucker:
npm install wx-chucker
```

### Step 2: Build npm in WeChat / TCMPP DevTools (CRITICAL)

> [!IMPORTANT]
> In WeChat and TCMPP Mini-Programs, running `npm install` only downloads files into `node_modules/`. The runtime **cannot** read directly from `node_modules/`. You **must** build the npm package in your IDE:

1. Open **WeChat Developer Tools** or **TCSAS DevTools**.
2. In the top menu bar, click:
   👉 **Tools (工具)** → **Build npm (构建 npm)**.
3. Wait for the success dialog: `"构建完成"` (Build finished).
   *(This compiles `node_modules/wx-chucker/miniprogram_dist/` into `miniprogram_npm/wx-chucker/`)*.

---

## ⚡ Quick Start

### Step 3: Initialize in `app.js`

Add the import at the top of your `app.js` and call `initChucker()` inside `onLaunch`:

```javascript
// At the top of app.js
const { initChucker } = require('wx-chucker');

App({
  onLaunch() {
    initChucker({
      // Auto-disabled in production release builds by default
      autoDetectEnv: true,
      maskSensitive: false // Set true to mask tokens & PII during security pentests
    });
  }
});
```

### Step 4: Register Component in `app.json` or Page JSON

Register the component globally in `app.json` (or in any specific page JSON):

```json
{
  "usingComponents": {
    "chucker": "wx-chucker"
  }
}
```

### Step 5: Add Component Tag in Page WXML

In your page's `.wxml` file (e.g. `pages/home/index.wxml`):

```html
<chucker />
```

---

## 🔍 Troubleshooting FAQ

### 1. `Component not found: wx-chucker` or `未找到自定义组件`
- **Cause**: You ran `npm install`, but did not click **Build npm (构建 npm)** in the IDE.
- **Fix**: In the IDE top menu bar, click **Tools (工具)** → **Build npm (构建 npm)**. Ensure the folder `miniprogram_npm/wx-chucker/` appears in your project root.

### 2. `ReferenceError: initChucker is not defined`
- **Cause**: `initChucker()` was called in `onLaunch()` without importing it first.
- **Fix**: Add `const { initChucker } = require('wx-chucker');` at the very top of `app.js`.

### 3. `未找到可以构建的 npm 包` (No npm package found to build)
- **Cause**: Your project root `package.json` was missing the `"name"` and `"version"` fields.
- **Fix**: Run `npm init -y` or ensure `package.json` has:
  ```json
  {
    "name": "your-miniprogram-name",
    "version": "1.0.0",
    "dependencies": {
      "wx-chucker": "^1.0.1"
    }
  }
  ```

---

## ⚙️ Configuration Reference

Options passed to `initChucker(config)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `Boolean` | Auto | Force enable or disable. Defaults to auto-detection (disabled in `release`). |
| `autoDetectEnv` | `Boolean` | `true` | Automatically checks `wx.getAccountInfoSync().miniProgram.envVersion`. |
| `env` | `String` | `undefined` | Explicit environment override (`'develop'`, `'trial'`, `'release'`, etc.). |
| `maskSensitive` | `Boolean` | `false` | When `true`, automatically redacts Authorization tokens, cookies, and passwords. |
| `maxTransactions` | `Number` | `120` | Maximum number of transactions kept in memory ring buffer. |
| `trackHttp` | `Boolean` | `true` | Intercept `wx.request`. |
| `trackUpload` | `Boolean` | `true` | Intercept `wx.uploadFile`. |
| `trackDownload` | `Boolean` | `true` | Intercept `wx.downloadFile`. |
| `trackNativePlugin` | `Boolean` | `true` | Intercept `wx.invokeNativePlugin` & `wx.invoke`. |

---

## 🧩 Component Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `Boolean` | Store State | Override component visibility. |
| `enableShake` | `Boolean` | `true` | Enable shake-to-open gesture on physical devices. |
| `enableGhostDock` | `Boolean` | `true` | Enable edge-snapping and 3-second auto-dimming. |
| `theme` | `String` | `'dark'` | Visual theme (`'dark'` or `'light'`). |

---

## 🛡️ Production Isolation (0 KB Footprint)

To isolate Chucker completely from your release bundle:

```javascript
// In app.js
if (process.env.NODE_ENV !== 'production') {
  const { initChucker } = require('wx-chucker');
  initChucker();
}
```

Or place the `<chucker />` component inside an independent WeChat Debug Subpackage (分包), consuming 0 KB of your 2 MB main package limit.

---

## 🛠️ Development & Testing

```bash
# Run 6 automated test suites against source code
npm test

# Build and minify distribution files to miniprogram_dist/
npm run build

# Run test suite against built distribution bundle
npm run test:dist
```

---

## 🔗 Repository & Issues

- **GitHub**: [https://github.com/code-id-repository/wx-chucker](https://github.com/code-id-repository/wx-chucker)
- **Issues**: [https://github.com/code-id-repository/wx-chucker/issues](https://github.com/code-id-repository/wx-chucker/issues)

---

## 👤 Author

**Ryan Agung Samudra**
- GitHub: [@ryanagungsamudra](https://github.com/ryanagungsamudra)
- Email: [ryansamudra67@gmail.com](mailto:ryansamudra67@gmail.com)

---

## 📄 License

MIT © 2026 Ryan Agung Samudra
