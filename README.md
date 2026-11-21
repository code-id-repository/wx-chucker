# wx-chucker

> In-App Network & Native Bridge Inspector for WeChat Mini-Programs & TCMPP Super-Apps.

A developer and QA inspection tool designed specifically for WeChat Mini-Programs and TCMPP containers. Inspect outgoing HTTP/HTTPS calls and native bridge plugins directly inside the running Mini-Program.

---

## Features

- **Network Inspection**: Automatically captures `wx.request`, `wx.uploadFile`, and `wx.downloadFile` with method, URL, headers, query parameters, request payload, response status code, timing, and response body.
- **Native Bridge Inspector**: Tracks `wx.invokeNativePlugin` and `wx.invoke` calls, capturing input parameters and return data.
- **Smart Ghost Dock**: Draggable AssistiveTouch badge that docks to the nearest screen edge and fades to 38% opacity after 3 seconds of inactivity.
- **Passive Shake-to-Open**: Dual-peak accelerometer gesture (`Δ > 2.2`) to toggle the inspector on physical mobile devices. Automatically pauses sensor polling when inspector is open to preserve battery.
- **DevTools Fail-Safe**: Unhide notch fallback in WeChat DevTools when physical sensors are unavailable.
- **cURL Exporter**: Generates one-tap executable `curl` commands for all network requests.
- **Android Binder Protection**: Automatically handles large payloads (> 180 KB) via `wx.getFileSystemManager` and `wx.shareFileMessage` to prevent `TransactionTooLargeException` crashes.
- **Production Auto-Gating**: Automatically detects release environments (`release`, `prod`, `live`) and disables interception to ensure zero runtime overhead in production.

---

## Installation

```bash
npm install wx-chucker
```

In WeChat Developer Tools:
1. Click **Tools (工具)** in the top menu bar.
2. Select **Build npm (构建 npm)**.

---

## Quick Start

### 1. Initialize in `app.js`

```javascript
const { initChucker } = require('wx-chucker');

App({
  onLaunch() {
    initChucker({
      // Auto-disabled in production release builds by default
      autoDetectEnv: true,
      maskSensitive: false // Set true to mask tokens and credentials during pentests
    });
  }
});
```

### 2. Declare Component in `app.json` or Page JSON

To make the inspector available across all pages, register it in your root `app.json`:

```json
{
  "usingComponents": {
    "chucker": "wx-chucker"
  }
}
```

### 3. Add Component in Page WXML

Add the custom component tag to your page:

```html
<chucker />
```

---

## Configuration Options

Options passed to `initChucker(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `Boolean` | Auto | Force enable or disable. Defaults to auto-detection (disabled in `release`). |
| `autoDetectEnv` | `Boolean` | `true` | Automatically checks `wx.getAccountInfoSync().miniProgram.envVersion`. |
| `env` | `String` | `undefined` | Explicit environment override (`'develop'`, `'trial'`, `'release'`, etc.). |
| `maskSensitive` | `Boolean` | `false` | When `true`, automatically redacts Authorization tokens, cookies, and passwords. |
| `maxTransactions` | `Number` | `120` | Maximum number of transactions kept in memory. |
| `trackHttp` | `Boolean` | `true` | Intercept `wx.request`. |
| `trackUpload` | `Boolean` | `true` | Intercept `wx.uploadFile`. |
| `trackDownload` | `Boolean` | `true` | Intercept `wx.downloadFile`. |
| `trackNativePlugin` | `Boolean` | `true` | Intercept `wx.invokeNativePlugin` & `wx.invoke`. |

---

## Component Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `Boolean` | Store State | Override component visibility. |
| `enableShake` | `Boolean` | `true` | Enable shake-to-open gesture on physical devices. |
| `enableGhostDock` | `Boolean` | `true` | Enable edge-snapping and 3-second auto-dimming. |
| `theme` | `String` | `'dark'` | Visual theme (`'dark'` or `'light'`). |

---

## Production Isolation (Zero Impact)

To ensure zero overhead in production builds, you can conditionally initialize Chucker:

```javascript
// app.js
if (process.env.NODE_ENV !== 'production') {
  const { initChucker } = require('wx-chucker');
  initChucker();
}
```

Or place Chucker inside an independent WeChat Debug Subpackage (分包), consuming 0 KB of your 2 MB main package limit.

---

## Scripts

```bash
# Run test suite against source
npm test

# Build and minify distribution files to miniprogram_dist/
npm run build

# Run test suite against built distribution
npm run test:dist
```

---

## Author

**Ryan Agung Samudra**
- Email: [ryansamudra67@gmail.com](mailto:ryansamudra67@gmail.com)

---

## License

MIT
