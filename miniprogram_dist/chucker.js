"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductionEnv = exports.setChuckerEnabled = exports.isChuckerEnabled = exports.getChuckerStore = exports.initChucker = exports.chuckerStore = void 0;
const types_1 = require("./core/types");
const interceptor_1 = require("./core/interceptor");
const store_1 = require("./core/store");
Object.defineProperty(exports, "chuckerStore", { enumerable: true, get: function () { return store_1.chuckerStore; } });
exports.isProductionEnv = types_1.isProductionEnv;
function initChucker(userConfig = {}) {
const isProd = (0, types_1.isProductionEnv)(userConfig.env);
const autoDetect = userConfig.autoDetectEnv !== false;
let resolvedEnabled = true;
if (typeof userConfig.enabled === "boolean") {
resolvedEnabled = userConfig.enabled;
} else if (autoDetect && isProd) {
resolvedEnabled = false;
}
const config = {
...types_1.DEFAULT_CHUCKER_CONFIG,
...userConfig,
enabled: resolvedEnabled
};
if (config.maskSensitive) {
config.redactHeaders = Array.from(new Set([...(config.redactHeaders || []), ...types_1.DEFAULT_SENSITIVE_HEADERS]));
config.redactBodyKeys = Array.from(new Set([...(config.redactBodyKeys || []), ...types_1.DEFAULT_SENSITIVE_KEYS]));
}
store_1.chuckerStore.init(config);
if (!config.enabled) {
return store_1.chuckerStore;
}
(0, interceptor_1.installInterceptors)(config);
try {
console.log(`[wx-chucker] Initialized (enabled: ${config.enabled})`);
} catch (_) {}
return store_1.chuckerStore;
}
exports.initChucker = initChucker;
function getChuckerStore() {
return store_1.chuckerStore;
}
exports.getChuckerStore = getChuckerStore;
function isChuckerEnabled() {
return store_1.chuckerStore.config.enabled;
}
exports.isChuckerEnabled = isChuckerEnabled;
function setChuckerEnabled(enabled) {
store_1.chuckerStore.config.enabled = Boolean(enabled);
store_1.chuckerStore.notify(true);
}
exports.setChuckerEnabled = setChuckerEnabled;