"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installInterceptors = void 0;
const store_1 = require("./store");
let idCounter = 0;
function nextId() {
return `chk_${Date.now()}_${++idCounter}`;
}
function hookMethod(target, methodName, wrapperFactory) {
if (!target) return;
let original = target[methodName];
if (typeof original !== "function") {
const proto = Object.getPrototypeOf(target);
if (proto && typeof proto[methodName] === "function") original = proto[methodName];
}
if (typeof original !== "function") return;
let wrapped = null;
const getWrapped = () => {
if (!wrapped) wrapped = wrapperFactory(original);
return wrapped;
};
try {
const desc = Object.getOwnPropertyDescriptor(target, methodName);
if (!desc || desc.configurable) {
Object.defineProperty(target, methodName, {
configurable: true,
enumerable: true,
get: () => getWrapped(),
set(newFn) {
if (typeof newFn === "function" && newFn !== getWrapped()) {
original = newFn;
wrapped = wrapperFactory(newFn);
}
}
});
return;
}
} catch (_) {}
try { target[methodName] = getWrapped(); } catch (_) {}
}
function suppressConsoleNoise() {
if (typeof console === "undefined") return;
const noise = ["onSearchInput"];
["log", "info", "debug", "warn"].forEach((method) => {
hookMethod(console, method, (orig) => function (...args) {
try {
for (let i = 0; i < Math.min(args.length, 3); i++) {
const a = args[i];
if (typeof a === "string" && noise.some((k) => a.includes(k))) return;
}
} catch (_) {}
return orig.apply(this, args);
});
});
}
function wrapCallbackOptions(options, onDone, onFail) {
if (!options || typeof options !== "object") return options;
let recorded = false;
const finish = (fn, arg, isErr) => {
if (!recorded) {
recorded = true;
try { (isErr ? onFail : onDone)(arg); } catch (_) {}
}
return typeof fn === "function" ? fn(arg) : undefined;
};
const { success, fail, complete } = options;
options.success = (res) => finish(success, res, false);
options.fail = (err) => finish(fail, err, true);
options.complete = (res) => {
if (!recorded && res) {
const isErr = res.statusCode === undefined && res.errMsg && !res.errMsg.includes(":ok");
finish(null, res, isErr);
}
return typeof complete === "function" ? complete(res) : undefined;
};
return options;
}
function installInterceptors(config = {}) {
if (config.enabled === false) return;
suppressConsoleNoise();
if (typeof wx === "undefined" || wx.__chucker_installed__) return;
wx.__chucker_installed__ = true;
store_1.chuckerStore.init(config);
if (config.trackHttp !== false) {
hookMethod(wx, "request", (orig) => function interceptedRequest(options) {
if (!options || typeof options !== "object") return orig.apply(this, arguments);
const id = nextId();
store_1.chuckerStore.addRequest({
id,
type: "HTTP",
method: (options.method || "GET").toUpperCase(),
url: options.url || "",
headers: options.header || {},
rawHeaders: options.header ? { ...options.header } : {},
body: options.data,
startTime: Date.now()
});
wrapCallbackOptions(options,
(res) => store_1.chuckerStore.updateResponse(id, {
statusCode: res?.statusCode ?? 200,
headers: res?.header ?? {},
rawHeaders: res?.header ? { ...res.header } : {},
body: res?.data
}),
(err) => store_1.chuckerStore.updateError(id, {
error: err?.errMsg || err?.message || String(err),
statusCode: err?.statusCode || 0
})
);
return orig.call(this, options);
});
}
if (config.trackUpload !== false) {
hookMethod(wx, "uploadFile", (orig) => function interceptedUpload(options) {
if (!options || typeof options !== "object") return orig.apply(this, arguments);
const id = nextId();
store_1.chuckerStore.addRequest({
id,
type: "UPLOAD",
method: "POST",
url: options.url || "",
filePath: options.filePath,
name: options.name,
headers: options.header || {},
rawHeaders: options.header ? { ...options.header } : {},
body: options.formData,
startTime: Date.now()
});
wrapCallbackOptions(options,
(res) => {
let parsed = res?.data;
if (typeof parsed === "string") {
const t = parsed.trim();
if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
try { parsed = JSON.parse(t); } catch (_) {}
}
}
store_1.chuckerStore.updateResponse(id, {
statusCode: res?.statusCode ?? 200,
headers: res?.header ?? {},
rawHeaders: res?.header ? { ...res.header } : {},
body: parsed
});
},
(err) => store_1.chuckerStore.updateError(id, {
error: err?.errMsg || String(err)
})
);
return orig.call(this, options);
});
}
if (config.trackDownload !== false) {
hookMethod(wx, "downloadFile", (orig) => function interceptedDownload(options) {
if (!options || typeof options !== "object") return orig.apply(this, arguments);
const id = nextId();
store_1.chuckerStore.addRequest({
id,
type: "DOWNLOAD",
method: "GET",
url: options.url || "",
headers: options.header || {},
rawHeaders: options.header ? { ...options.header } : {},
body: null,
startTime: Date.now()
});
wrapCallbackOptions(options,
(res) => store_1.chuckerStore.updateResponse(id, {
statusCode: res?.statusCode ?? 200,
headers: res?.header ?? {},
rawHeaders: res?.header ? { ...res.header } : {},
body: { tempFilePath: res?.tempFilePath, filePath: res?.filePath }
}),
(err) => store_1.chuckerStore.updateError(id, {
error: err?.errMsg || String(err)
})
);
return orig.call(this, options);
});
}
if (config.trackNativePlugin !== false) {
const interceptBridge = (orig, bridgeType) => function interceptedBridge() {
const id = nextId();
const arg0 = arguments[0];
const arg1 = arguments[1];
const arg2 = arguments[2];
const isObj = arg0 && typeof arg0 === "object";
let apiName = "";
let inputData = null;
if (isObj) {
apiName = arg0.api_name || arg0.api || arg0.name || arg0.action || arg0.apiName || "";
if (!apiName) {
const keys = Object.keys(arg0).filter((k) => !["data", "success", "fail", "complete", "params"].includes(k));
apiName = keys[0] || "native_call";
}
inputData = arg0.data !== undefined ? arg0.data : (arg0.params !== undefined ? arg0.params : null);
} else {
apiName = String(arg0 || "native_call");
inputData = typeof arg1 !== "function" ? arg1 : null;
}
store_1.chuckerStore.addRequest({
id,
type: "BRIDGE",
method: "NATIVE",
url: apiName,
name: apiName,
headers: { "X-Bridge-Type": bridgeType },
body: inputData,
startTime: Date.now()
});
let done = false;
const onOk = (res) => {
if (done) return;
done = true;
const code = res?.code !== undefined ? Number(res.code) : 200;
const isErr = (code !== 0 && code !== 200) ||
(typeof res?.status === "string" && res.status.toLowerCase().includes("err")) ||
(typeof res?.errMsg === "string" && res.errMsg.toLowerCase().includes("fail"));
store_1.chuckerStore.updateResponse(id, { statusCode: code, body: res, isError: isErr });
};
const onErr = (err) => {
if (done) return;
done = true;
store_1.chuckerStore.updateError(id, {
error: err?.errMsg || err?.message || String(err),
statusCode: err?.code || err?.errCode || 500
});
};
if (isObj) {
wrapCallbackOptions(arg0, onOk, onErr);
try {
const ret = orig.apply(this, arguments);
if (ret && typeof ret.then === "function") {
return ret.then((r) => { onOk(r); return r; }).catch((e) => { onErr(e); throw e; });
}
if (ret !== undefined) {
onOk(ret);
}
return ret;
} catch (e) {
onErr(e);
throw e;
}
}
const cb = typeof arg1 === "function" ? arg1 : (typeof arg2 === "function" ? arg2 : null);
if (typeof cb === "function") {
const cbIndex = typeof arg1 === "function" ? 1 : 2;
const newArgs = Array.from(arguments);
newArgs[cbIndex] = function (res) {
onOk(res);
return cb.apply(this, arguments);
};
try {
return orig.apply(this, newArgs);
} catch (e) {
onErr(e);
throw e;
}
}
try {
const ret = orig.apply(this, arguments);
if (ret && typeof ret.then === "function") {
return ret.then((r) => { onOk(r); return r; }).catch((e) => { onErr(e); throw e; });
}
if (ret !== undefined) onOk(ret);
return ret;
} catch (e) {
onErr(e);
throw e;
}
};
hookMethod(wx, "invokeNativePlugin", (orig) => interceptBridge(orig, "TCMPP-Native-Plugin"));
if (typeof wx.invoke === "function") {
hookMethod(wx, "invoke", (orig) => interceptBridge(orig, "WeChat-Invoke"));
}
}
}
exports.installInterceptors = installInterceptors;