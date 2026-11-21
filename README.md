# wx-chucker

<p align="center">
  <strong>In-App Network & Native Bridge Inspector for WeChat Mini-Programs & TCMPP Super-Apps</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wx-chucker"><img src="https://img.shields.io/npm/v/wx-chucker.svg?color=blue" alt="npm version" /></a>
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

## 📦 Installation

```bash
npm install wx-chucker
```

In WeChat Developer Tools:
1. Click **Tools (工具)** in the top menu bar.
2. Select **Build npm (构建 npm)**.

---

## ⚡ Quick Start

### 1. Initialize in `app.js`

```javascript
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

### 2. Register Component in `app.json` or Page JSON

Register the component globally in `app.json`:

```json
{
  "usingComponents": {
    "chucker": "wx-chucker"
  }
}
```

### 3. Add to Page WXML

```html
<chucker />
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

## 👤 Author

**Ryan Agung Samudra**
- GitHub: [@ryanagungsamudra](https://github.com/ryanagungsamudra)
- Email: [ryansamudra67@gmail.com](mailto:ryansamudra67@gmail.com)

---

## 📄 License

MIT © 2026 Ryan Agung Samudra
