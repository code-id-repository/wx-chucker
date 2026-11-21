"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const store_1 = require("./core/store");
const sanitizer_1 = require("./core/sanitizer");
const chucker_1 = require("./chucker");

// Re-export headless APIs for direct require('wx-chucker') usage
exports.initChucker = chucker_1.initChucker;
exports.chuckerStore = chucker_1.chuckerStore;
exports.getChuckerStore = chucker_1.getChuckerStore;
exports.isChuckerEnabled = chucker_1.isChuckerEnabled;
exports.setChuckerEnabled = chucker_1.setChuckerEnabled;
exports.isProductionEnv = chucker_1.isProductionEnv;

let windowWidth = 375;
let windowHeight = 667;
let defaultStatusBarHeight = 44;
let defaultNavBarHeight = 44;

try {
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
    windowWidth = info.windowWidth || 375;
    windowHeight = info.windowHeight || 667;
    if (info.statusBarHeight) defaultStatusBarHeight = info.statusBarHeight;
    if (typeof wx.getMenuButtonBoundingClientRect === "function") {
        const menu = wx.getMenuButtonBoundingClientRect();
        if (menu && menu.top) defaultNavBarHeight = (menu.top - defaultStatusBarHeight) * 2 + (menu.height || 32);
    }
} catch (_) {}

function triggerHaptic(type = "light") {
    try {
        if (typeof wx !== "undefined" && typeof wx.vibrateShort === "function") {
            wx.vibrateShort({ type });
        }
    } catch (_) {}
}

const MAX_CLIPBOARD_BYTES = 180 * 1024; // 180 KB safe threshold for Android Binder IPC

function saveAndShareFile(contentStr, fileName, callback) {
    if (typeof wx === "undefined") {
        if (callback) callback(false);
        return;
    }

    try {
        const fs = typeof wx.getFileSystemManager === "function" ? wx.getFileSystemManager() : null;
        const userPath = (wx.env && wx.env.USER_DATA_PATH) || "";
        if (!fs || !userPath) {
            if (callback) callback(false);
            return;
        }

        const safeName = fileName || `chucker_${Date.now()}.json`;
        const filePath = `${userPath}/${safeName}`;

        fs.writeFile({
            filePath,
            data: contentStr,
            encoding: "utf8",
            success: () => {
                triggerHaptic("medium");
                if (typeof wx.shareFileMessage === "function") {
                    wx.shareFileMessage({
                        filePath,
                        fileName: safeName,
                        success: () => {
                            if (wx.showToast) wx.showToast({ title: "File Shared!", icon: "success" });
                            if (callback) callback(true);
                        },
                        fail: () => {
                            openOrAlertFile(filePath, safeName);
                            if (callback) callback(true);
                        }
                    });
                } else {
                    openOrAlertFile(filePath, safeName);
                    if (callback) callback(true);
                }
            },
            fail: () => {
                if (callback) callback(false);
            }
        });
    } catch (_) {
        if (callback) callback(false);
    }
}

function openOrAlertFile(filePath, fileName) {
    if (typeof wx.openDocument === "function") {
        wx.openDocument({
            filePath,
            showMenu: true,
            success: () => {
                if (wx.showToast) wx.showToast({ title: "File opened!", icon: "success" });
            },
            fail: () => {
                if (wx.showModal) {
                    wx.showModal({
                        title: "Export Saved",
                        content: `Full log file saved as ${fileName}. (Size: ${filePath.length} bytes)`,
                        showCancel: false
                    });
                }
            }
        });
    } else if (wx.showModal) {
        wx.showModal({
            title: "Export Saved",
            content: `Logs saved to ${fileName}.`,
            showCancel: false
        });
    }
}

function createSafeClipboardString(data, maxBytes = MAX_CLIPBOARD_BYTES) {
    if (!data) return "";
    let str = typeof data === "object" ? (0, sanitizer_1.safeJsonStringify)(data, 0) : String(data);
    if (str.length <= maxBytes) return str;

    if (typeof data === "object" && data && Array.isArray(data.transactions)) {
        const safeTxs = data.transactions.map((t) => {
            let b = t.body;
            let rb = t.responseBody;
            const bStr = typeof b === "string" ? b : (b ? JSON.stringify(b) : "");
            const rbStr = typeof rb === "string" ? rb : (rb ? JSON.stringify(rb) : "");
            if (bStr.length > 800) {
                b = `[Body truncated (${(bStr.length / 1024).toFixed(1)}KB) for clipboard. Use File Export for full data]`;
            }
            if (rbStr.length > 800) {
                rb = `[Response truncated (${(rbStr.length / 1024).toFixed(1)}KB) for clipboard. Use File Export for full data]`;
            }
            return {
                id: t.id,
                method: t.method,
                name: t.name,
                url: t.url,
                statusCode: t.statusCode,
                durationMs: t.durationMs,
                time: t.time || t.timeFormatted,
                isError: t.isError,
                body: b,
                responseBody: rb
            };
        });

        const safeObj = {
            ...data,
            note: "Payload was truncated for Android clipboard safety (<180KB). Use File Export for 100% full bodies.",
            transactions: safeTxs
        };
        str = (0, sanitizer_1.safeJsonStringify)(safeObj, 0);
        if (str.length <= maxBytes) return str;
    }

    return str.slice(0, maxBytes - 120) + "\n...[Truncated: Exceeded Android 180KB Clipboard Limit]";
}

function copyClipboard(text, successTitle = "Copied!", fallbackFileName = "chucker_export.json") {
    if (!text) return;
    triggerHaptic("light");
    if (typeof wx === "undefined" || !wx.setClipboardData) return;

    const payloadStr = typeof text === "object" ? (0, sanitizer_1.safeJsonStringify)(text, 2) : String(text);

    // If payload is dangerously large for Android Binder IPC (> 180KB)
    if (payloadStr.length > MAX_CLIPBOARD_BYTES) {
        saveAndShareFile(payloadStr, fallbackFileName, (fileSuccess) => {
            if (!fileSuccess) {
                const safeStr = createSafeClipboardString(text, MAX_CLIPBOARD_BYTES);
                wx.setClipboardData({
                    data: safeStr,
                    success: () => wx.showToast && wx.showToast({ title: "Copied (Safe Mode)!", icon: "success" }),
                    fail: (err) => wx.showToast && wx.showToast({ title: "Copy failed: " + (err?.errMsg || "system error"), icon: "none" })
                });
            }
        });
        return;
    }

    wx.setClipboardData({
        data: payloadStr,
        success: () => wx.showToast && wx.showToast({ title: successTitle, icon: "success" }),
        fail: (err) => {
            const errStr = String(err?.errMsg || "");
            if (errStr.includes("Transaction") || errStr.includes("Large") || errStr.includes("fail")) {
                saveAndShareFile(payloadStr, fallbackFileName, (fileSuccess) => {
                    if (!fileSuccess) {
                        const safeStr = createSafeClipboardString(text, MAX_CLIPBOARD_BYTES);
                        wx.setClipboardData({
                            data: safeStr,
                            success: () => wx.showToast && wx.showToast({ title: "Copied (Safe Mode)!", icon: "success" }),
                            fail: (e) => wx.showToast && wx.showToast({ title: "Copy failed: " + (e?.errMsg || errStr), icon: "none" })
                        });
                    }
                });
            } else {
                wx.showToast && wx.showToast({ title: "Copy failed: " + errStr, icon: "none" });
            }
        }
    });
}

function matchesSearch(t, q) {
    if (!q) return true;
    if (t.url && t.url.toLowerCase().includes(q)) return true;
    if (t.path && t.path.toLowerCase().includes(q)) return true;
    if (t.name && t.name.toLowerCase().includes(q)) return true;
    if (t.method && t.method.toLowerCase().includes(q)) return true;
    if (t.host && t.host.toLowerCase().includes(q)) return true;
    if (String(t.statusCode).includes(q)) return true;
    if (t.statusText && t.statusText.toLowerCase().includes(q)) return true;
    if (t.error && String(t.error).toLowerCase().includes(q)) return true;

    // Query parameter search
    if (t.queryParams && typeof t.queryParams === "object") {
        for (const [k, v] of Object.entries(t.queryParams)) {
            if (k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)) return true;
        }
    }
    // Request body payload search
    const b = t.rawBody !== undefined ? t.rawBody : t.body;
    if (b != null) {
        if (typeof b === "string" && b.toLowerCase().includes(q)) return true;
        if (typeof b === "object") {
            try {
                if (JSON.stringify(b).toLowerCase().includes(q)) return true;
            } catch (_) {}
        }
    }
    // Response body payload search
    const resp = t.rawRespBody !== undefined ? t.rawRespBody : t.responseBody;
    if (resp != null) {
        if (typeof resp === "string" && resp.toLowerCase().includes(q)) return true;
        if (typeof resp === "object") {
            try {
                if (JSON.stringify(resp).toLowerCase().includes(q)) return true;
            } catch (_) {}
        }
    }
    return false;
}

if (typeof Component === "function") {
Component({
    options: {
        styleIsolation: "isolated",
        addGlobalClass: false
    },
    properties: {
        enabled: {
            type: null,
            value: null
        },
        enableShake: {
            type: Boolean,
            value: true
        },
        enableGhostDock: {
            type: Boolean,
            value: true
        }
    },
    data: {
        enabled: true,
        enableShake: true,
        enableGhostDock: true,
        isDocked: false,
        dockSide: "right", // 'right' | 'left'
        isFabHidden: false,
        isDevTools: false,
        statusBarHeight: defaultStatusBarHeight,
        navBarHeight: defaultNavBarHeight,
        fabX: windowWidth - 75,
        fabY: windowHeight - 160,
        isFabSnapping: false,
        isOpen: false,
        activeTab: "all", // 'all' | 'network' | 'native'
        filterOnlyErrors: false,
        filterOnlySlow: false,
        searchQuery: "",
        stats: {
            total: 0,
            errors: 0,
            inFlight: 0,
            slowCount: 0,
            networkCount: 0,
            nativeCount: 0,
            httpCount: 0,
            bridgeCount: 0
        },
        filteredTransactions: [],
        selectedTransaction: null,
        detailTab: "overview", // 'overview' | 'request' | 'response' | 'curl'
        theme: "dark" // 'dark' | 'light'
    },
    lifetimes: {
        attached() {
            const storeEnabled = store_1.chuckerStore.config.enabled;
            const isEnabled = this.properties.enabled != null ? Boolean(this.properties.enabled) : storeEnabled;

            if (!isEnabled) {
                this.setData({ enabled: false });
                return;
            }
            this.setData({ enabled: true });

            this.dragStartX = 0;
            this.dragStartY = 0;
            this.fabStartX = 0;
            this.fabStartY = 0;
            this.isDragging = false;
            this.searchTimer = null;
            this.dockTimer = null;

            // Accelerometer state on instance (zero setData allocations during motion)
            this._lastAccX = 0;
            this._lastAccY = 0;
            this._lastAccZ = 0;
            this._lastShakeTimestamp = 0;
            this._lastSpikeTimestamp = 0;
            this._spikeCount = 0;
            this._isAccelerometerActive = false;
            this._shakeBoundHandler = null;

            const enableShake = this.properties.enableShake !== false;
            const enableGhostDock = this.properties.enableGhostDock !== false;

            let isDevTools = false;
            try {
                const sys = (wx.getDeviceInfo && wx.getDeviceInfo()) || (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
                const platform = (sys.platform || "").toLowerCase();
                isDevTools = platform === "devtools" || platform === "mac" || platform === "windows";
            } catch (_) {}

            this.setData({
                enableShake,
                enableGhostDock,
                isDevTools
            });

            if (enableShake && !isDevTools) {
                this.startShakeListener();
            }

            if (enableGhostDock) {
                this.scheduleDockTimer();
            }

            try {
                const savedTheme = (wx.getStorageSync && wx.getStorageSync("chucker_theme")) || "";
                if (savedTheme === "dark" || savedTheme === "light") {
                    this.setData({ theme: savedTheme });
                } else {
                    const sys = (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
                    if (sys.theme === "light") this.setData({ theme: "light" });
                }
            } catch (_) {}

            try {
                const info = (wx.getWindowInfo && wx.getWindowInfo()) || (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
                if (info.windowWidth) windowWidth = info.windowWidth;
                if (info.windowHeight) windowHeight = info.windowHeight;
                const sbH = info.statusBarHeight || this.data.statusBarHeight;
                let nbH = this.data.navBarHeight;
                if (typeof wx.getMenuButtonBoundingClientRect === "function") {
                    const menu = wx.getMenuButtonBoundingClientRect();
                    if (menu && menu.top) nbH = (menu.top - sbH) * 2 + (menu.height || 32);
                }
                this.setData({ statusBarHeight: sbH, navBarHeight: nbH });
            } catch (_) {}

            this.unsubscribe = store_1.chuckerStore.subscribe((state) => {
                // PERFORMANCE OPTIMIZATION: When modal closed, only update stats for floating badge
                if (!this.data.isOpen) {
                    this.setData({
                        stats: {
                            total: state.total,
                            errors: state.errors,
                            inFlight: state.inFlight,
                            slowCount: state.slowCount || 0,
                            networkCount: state.networkCount ?? state.httpCount,
                            nativeCount: state.nativeCount ?? state.bridgeCount,
                            httpCount: state.httpCount,
                            bridgeCount: state.bridgeCount
                        }
                    });
                    return;
                }

                const { stats, filteredTransactions } = this.computeFilteredAndStats(
                    state.transactions,
                    this.data.activeTab,
                    this.data.searchQuery,
                    this.data.filterOnlyErrors,
                    this.data.filterOnlySlow
                );

                const updateData = { stats, filteredTransactions };
                if (this.data.selectedTransaction) {
                    const updated = store_1.chuckerStore.getById(this.data.selectedTransaction.id);
                    if (updated) updateData.selectedTransaction = updated;
                }
                this.setData(updateData);
            });
        },
        detached() {
            this.clearDockTimer();
            this.stopShakeListener();
            if (this.searchTimer) {
                clearTimeout(this.searchTimer);
                this.searchTimer = null;
            }
            if (this.unsubscribe) {
                this.unsubscribe();
                this.unsubscribe = null;
            }
        }
    },
    methods: {
        // ── Smart Ghost Dock & Idle Management ──
        scheduleDockTimer() {
            this.clearDockTimer();
            if (!this.data.enableGhostDock) return;
            this.dockTimer = setTimeout(() => {
                if (!this.data.isOpen && !this.isDragging && !this.data.isFabHidden) {
                    this.setData({ isDocked: true });
                }
            }, 3000);
        },
        clearDockTimer() {
            if (this.dockTimer) {
                clearTimeout(this.dockTimer);
                this.dockTimer = null;
            }
        },
        wakeFromDock() {
            this.clearDockTimer();
            if (this.data.isDocked) {
                this.setData({ isDocked: false });
            }
        },

        // ── Drag & Magnetic Edge-Snapping FAB ──
        onFabTouchStart(e) {
            this.wakeFromDock();
            const touch = e.touches && e.touches[0];
            if (!touch) return;
            this.dragStartX = touch.clientX;
            this.dragStartY = touch.clientY;
            this.fabStartX = this.data.fabX;
            this.fabStartY = this.data.fabY;
            this.isDragging = false;
            this.setData({ isFabSnapping: false });
        },
        onFabTouchMove(e) {
            const touch = e.touches && e.touches[0];
            if (!touch) return;
            const deltaX = touch.clientX - this.dragStartX;
            const deltaY = touch.clientY - this.dragStartY;
            if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) this.isDragging = true;
            this.setData({ fabX: this.fabStartX + deltaX, fabY: this.fabStartY + deltaY, isFabSnapping: false });
        },
        onFabTouchEnd() {
            if (this.isDragging) {
                const fabWidth = 65;
                const screenMid = windowWidth / 2;
                const dockSide = this.data.fabX < screenMid ? "left" : "right";
                const targetX = dockSide === "left" ? 8 : (windowWidth - fabWidth - 8);
                const targetY = Math.max(this.data.statusBarHeight + 10, Math.min(windowHeight - 85, this.data.fabY));
                this.setData({ fabX: targetX, fabY: targetY, isFabSnapping: true, dockSide });
                this.scheduleDockTimer();
            } else {
                this.openModal();
            }
            this.isDragging = false;
        },
        onFabLongPress() {
            if (this.isDragging) return;
            triggerHaptic("heavy");
            const isHidden = this.data.isFabHidden;
            const itemList = [
                isHidden ? "Show Floating Badge" : "Hide Trigger (Shake to Reopen)",
                "Switch to " + (this.data.theme === "dark" ? "Light" : "Dark") + " Theme",
                "Clear All Logs"
            ];
            if (typeof wx !== "undefined" && typeof wx.showActionSheet === "function") {
                wx.showActionSheet({
                    itemList,
                    success: (res) => {
                        if (res.tapIndex === 0) {
                            const nextHidden = !isHidden;
                            this.setData({ isFabHidden: nextHidden });
                            if (nextHidden) {
                                const hint = this.data.isDevTools
                                    ? "Trigger hidden. Click DevTools notch on edge to restore."
                                    : "Trigger hidden! Shake device anytime to open Chucker.";
                                if (wx.showToast) {
                                    wx.showToast({ title: hint, icon: "none", duration: 3500 });
                                }
                            }
                        } else if (res.tapIndex === 1) {
                            this.onToggleTheme();
                        } else if (res.tapIndex === 2) {
                            this.onClearAll();
                        }
                    }
                });
            }
        },
        onUnhideFab() {
            triggerHaptic("light");
            this.setData({ isFabHidden: false, isDocked: false });
            this.scheduleDockTimer();
            if (wx.showToast) {
                wx.showToast({ title: "Trigger restored!", icon: "success" });
            }
        },

        // ── Passive Native Shake-to-Open Sensor Engine ──
        startShakeListener() {
            if (!this.data.enableShake || this.data.isDevTools) return;
            if (typeof wx === "undefined" || typeof wx.startAccelerometer !== "function") return;

            if (!this._shakeBoundHandler) {
                this._shakeBoundHandler = (res) => this.handleAccelerometer(res);
            }

            try {
                if (typeof wx.onAccelerometerChange === "function") {
                    wx.onAccelerometerChange(this._shakeBoundHandler);
                }
                wx.startAccelerometer({
                    interval: "ui",
                    fail: () => {
                        try {
                            wx.startAccelerometer({ interval: "normal" });
                        } catch (_) {}
                    }
                });
                this._isAccelerometerActive = true;
            } catch (_) {}
        },
        pauseShakeListener() {
            if (!this._isAccelerometerActive) return;
            try {
                if (typeof wx !== "undefined" && typeof wx.stopAccelerometer === "function") {
                    wx.stopAccelerometer();
                }
                this._isAccelerometerActive = false;
            } catch (_) {}
        },
        resumeShakeListener() {
            if (!this.data.enabled || !this.data.enableShake || this.data.isDevTools) return;
            if (this.data.isOpen) return;
            this.startShakeListener();
        },
        stopShakeListener() {
            this.pauseShakeListener();
            try {
                if (typeof wx !== "undefined" && typeof wx.offAccelerometerChange === "function" && this._shakeBoundHandler) {
                    wx.offAccelerometerChange(this._shakeBoundHandler);
                }
            } catch (_) {}
            this._shakeBoundHandler = null;
        },
        handleAccelerometer(res) {
            if (!res || this.data.isOpen) return;
            const now = Date.now();
            if (now - this._lastShakeTimestamp < 1200) return; // 1.2s cooldown

            const x = typeof res.x === "number" ? res.x : 0;
            const y = typeof res.y === "number" ? res.y : 0;
            const z = typeof res.z === "number" ? res.z : 0;

            const deltaX = Math.abs(x - this._lastAccX);
            const deltaY = Math.abs(y - this._lastAccY);
            const deltaZ = Math.abs(z - this._lastAccZ);

            this._lastAccX = x;
            this._lastAccY = y;
            this._lastAccZ = z;

            const totalDelta = deltaX + deltaY + deltaZ;

            // Dual-spike detection: requires 2 rapid peaks above 2.2 within 100ms - 800ms
            if (totalDelta > 2.2) {
                const timeSinceLastSpike = now - this._lastSpikeTimestamp;
                if (this._spikeCount >= 1 && timeSinceLastSpike > 100 && timeSinceLastSpike < 800) {
                    this._lastShakeTimestamp = now;
                    this._spikeCount = 0;
                    this._lastSpikeTimestamp = 0;
                    this.onShakeDetected();
                    return;
                }
                this._spikeCount = 1;
                this._lastSpikeTimestamp = now;
            } else if (now - this._lastSpikeTimestamp > 800) {
                this._spikeCount = 0;
            }
        },
        onShakeDetected() {
            triggerHaptic("medium");
            if (this.data.isFabHidden) {
                this.setData({ isFabHidden: false });
            }
            this.openModal();
        },

        // ── Modal & Filter Logic ──
        openModal() {
            this.clearDockTimer();
            this.pauseShakeListener();
            const state = store_1.chuckerStore.getState();
            const { stats, filteredTransactions } = this.computeFilteredAndStats(
                state.transactions,
                this.data.activeTab,
                this.data.searchQuery,
                this.data.filterOnlyErrors,
                this.data.filterOnlySlow
            );
            this.setData({ isOpen: true, isDocked: false, stats, filteredTransactions });
        },
        closeModal() {
            this.setData({ isOpen: false, selectedTransaction: null });
            this.resumeShakeListener();
            this.scheduleDockTimer();
        },
        computeFilteredAndStats(transactions, activeTab, searchQuery, filterOnlyErrors, filterOnlySlow) {
            const allTxs = transactions || [];

            // 1. Establish search pool
            let searchPool = allTxs;
            const q = searchQuery ? String(searchQuery).toLowerCase().trim() : "";
            if (q) {
                searchPool = allTxs.filter((t) => matchesSearch(t, q));
            }

            // 2. Count errors and slow requests within the search-filtered dataset for the chips
            let searchErrors = 0;
            let searchSlow = 0;
            for (const t of searchPool) {
                if (t.isError) searchErrors++;
                if (t.durationMs >= 1000) searchSlow++;
            }

            // 3. Apply health filters (errors only / slow only) if enabled
            let activePool = searchPool;
            if (filterOnlyErrors) activePool = activePool.filter((t) => t.isError);
            if (filterOnlySlow) activePool = activePool.filter((t) => t.durationMs >= 1000);

            // 4. Calculate category counts following the active search & health filters
            let networkCount = 0;
            let nativeCount = 0;
            for (const t of activePool) {
                if (t.type === "BRIDGE") nativeCount++;
                else networkCount++;
            }
            const total = activePool.length;

            // 5. Filter for current active tab
            let list = activePool;
            if (activeTab === "network") list = list.filter((t) => t.type !== "BRIDGE");
            else if (activeTab === "native") list = list.filter((t) => t.type === "BRIDGE");

            return {
                stats: {
                    total,
                    networkCount,
                    nativeCount,
                    httpCount: networkCount,
                    bridgeCount: nativeCount,
                    errors: searchErrors,
                    slowCount: searchSlow,
                    inFlight: allTxs.filter((t) => t.isInFlight).length
                },
                filteredTransactions: list.map(store_1.toSummary)
            };
        },
        computeFiltered(transactions, activeTab, searchQuery, filterOnlyErrors, filterOnlySlow) {
            return this.computeFilteredAndStats(transactions, activeTab, searchQuery, filterOnlyErrors, filterOnlySlow).filteredTransactions;
        },
        onTabTap(e) {
            const tab = e.currentTarget.dataset.tab;
            if (tab && tab !== this.data.activeTab) {
                const state = store_1.chuckerStore.getState();
                const { stats, filteredTransactions } = this.computeFilteredAndStats(
                    state.transactions,
                    tab,
                    this.data.searchQuery,
                    this.data.filterOnlyErrors,
                    this.data.filterOnlySlow
                );
                this.setData({ activeTab: tab, stats, filteredTransactions });
            }
        },
        onToggleErrorsOnly() {
            const nextVal = !this.data.filterOnlyErrors;
            const state = store_1.chuckerStore.getState();
            const { stats, filteredTransactions } = this.computeFilteredAndStats(
                state.transactions,
                this.data.activeTab,
                this.data.searchQuery,
                nextVal,
                this.data.filterOnlySlow
            );
            this.setData({ filterOnlyErrors: nextVal, stats, filteredTransactions });
            wx.showToast({ title: nextVal ? "Errors Only Active" : "Showing All Status", icon: "none" });
        },
        onToggleSlowOnly() {
            const nextVal = !this.data.filterOnlySlow;
            const state = store_1.chuckerStore.getState();
            const { stats, filteredTransactions } = this.computeFilteredAndStats(
                state.transactions,
                this.data.activeTab,
                this.data.searchQuery,
                this.data.filterOnlyErrors,
                nextVal
            );
            this.setData({ filterOnlySlow: nextVal, stats, filteredTransactions });
            wx.showToast({ title: nextVal ? "Slow APIs Only (>1s)" : "Showing All Speeds", icon: "none" });
        },
        onSearchInput(e) {
            const rawVal = e.detail.value !== undefined ? e.detail.value : "";
            const state = store_1.chuckerStore.getState();
            const { stats, filteredTransactions } = this.computeFilteredAndStats(
                state.transactions,
                this.data.activeTab,
                rawVal,
                this.data.filterOnlyErrors,
                this.data.filterOnlySlow
            );
            this.setData({
                searchQuery: rawVal,
                stats,
                filteredTransactions
            });
        },
        onSearchConfirm(e) {
            this.onSearchInput(e);
        },
        onClearSearch() {
            const state = store_1.chuckerStore.getState();
            const { stats, filteredTransactions } = this.computeFilteredAndStats(
                state.transactions,
                this.data.activeTab,
                "",
                this.data.filterOnlyErrors,
                this.data.filterOnlySlow
            );
            this.setData({ searchQuery: "", stats, filteredTransactions });
        },

        // ── Transaction Detail ──
        onItemTap(e) {
            const id = e.currentTarget.dataset.id;
            const detailTx = store_1.chuckerStore.getById(id);
            if (detailTx) this.setData({ selectedTransaction: detailTx, detailTab: "overview" });
        },
        onBackToList() {
            this.setData({ selectedTransaction: null });
        },
        onDetailTabTap(e) {
            const tab = e.currentTarget.dataset.tab;
            if (tab) this.setData({ detailTab: tab });
        },

        // ── ⚡ Replay / Re-send Request ──
        onReplayRequest() {
            const tx = this.data.selectedTransaction;
            if (!tx) return;
            triggerHaptic("medium");
            wx.showLoading({ title: "Replaying...", mask: true });

            if (tx.type === "BRIDGE") {
                try {
                    const fn = wx.invokeNativePlugin;
                    if (typeof fn === "function") {
                        fn({
                            api_name: tx.name,
                            data: tx.body,
                            success: () => {
                                wx.hideLoading();
                                triggerHaptic("light");
                                wx.showToast({ title: "Replayed (OK)", icon: "success" });
                            },
                            fail: () => {
                                wx.hideLoading();
                                wx.showToast({ title: "Replay failed", icon: "none" });
                            }
                        });
                    } else {
                        wx.hideLoading();
                        wx.showToast({ title: "Native bridge unavailable", icon: "none" });
                    }
                } catch (e) {
                    wx.hideLoading();
                    wx.showToast({ title: `Replay error: ${e.message || String(e)}`, icon: "none" });
                }
            } else {
                try {
                    const isGetOrHead = tx.method === "GET" || tx.method === "HEAD";
                    wx.request({
                        url: isGetOrHead ? tx.url : (tx.rawUrl || tx.url),
                        method: tx.method || "GET",
                        data: isGetOrHead ? undefined : tx.body,
                        header: tx.rawHeaders || tx.headers || {},
                        success: (res) => {
                            wx.hideLoading();
                            triggerHaptic("light");
                            wx.showToast({ title: `Replayed (${res.statusCode})`, icon: "success" });
                        },
                        fail: () => {
                            wx.hideLoading();
                            wx.showToast({ title: "Replay failed", icon: "none" });
                        }
                    });
                } catch (e) {
                    wx.hideLoading();
                    wx.showToast({ title: `Replay error: ${e.message || String(e)}`, icon: "none" });
                }
            }
        },

        // ── Theme Switching ──
        onToggleTheme() {
            triggerHaptic("light");
            const nextTheme = this.data.theme === "dark" ? "light" : "dark";
            this.setData({ theme: nextTheme });
            try {
                if (wx.setStorageSync) wx.setStorageSync("chucker_theme", nextTheme);
            } catch (_) {}
            wx.showToast({ title: nextTheme === "light" ? "Light Mode" : "Dark Mode", icon: "none" });
        },

        // ── Split Export Actions ──
        onExportLogs() {
            triggerHaptic("medium");
            const state = store_1.chuckerStore.getState();
            const allTxs = state.transactions || [];
            if (allTxs.length === 0) {
                wx.showToast({ title: "No logs to export", icon: "none" });
                return;
            }

            const networkTxs = allTxs.filter((t) => t.type !== "BRIDGE");
            const nativeTxs = allTxs.filter((t) => t.type === "BRIDGE");

            wx.showActionSheet({
                itemList: [
                    `🌐 Network Logs (${networkTxs.length})`,
                    `🔌 Native Plugin Logs (${nativeTxs.length})`,
                    `📦 All Logs (${allTxs.length})`
                ],
                success: (res) => {
                    let selectedList = allTxs;
                    let categoryLabel = "All";
                    if (res.tapIndex === 0) {
                        selectedList = networkTxs;
                        categoryLabel = "Network";
                    } else if (res.tapIndex === 1) {
                        selectedList = nativeTxs;
                        categoryLabel = "Native";
                    }

                    if (selectedList.length === 0) {
                        wx.showToast({ title: `No ${categoryLabel} logs`, icon: "none" });
                        return;
                    }

                    const exportPayload = {
                        generator: "Chucker-MiniProgram-Inspector",
                        exportedAt: new Date().toISOString(),
                        category: categoryLabel,
                        total: selectedList.length,
                        transactions: selectedList.map((t) => ({
                            id: t.id,
                            type: t.type,
                            method: t.method,
                            name: t.name,
                            url: t.url,
                            statusCode: t.statusCode,
                            statusText: t.statusText,
                            durationMs: t.durationMs,
                            time: t.timeFormatted,
                            isInFlight: t.isInFlight,
                            isError: t.isError,
                            headers: t.rawHeaders || t.headers,
                            body: t.rawBody !== undefined ? t.rawBody : t.body,
                            responseHeaders: t.rawRespHeaders || t.responseHeaders,
                            responseBody: t.rawRespBody !== undefined ? t.rawRespBody : t.responseBody,
                            curl: t.curl || undefined,
                            error: t.error
                        }))
                    };

                    const rawJson = (0, sanitizer_1.safeJsonStringify)(exportPayload, 2);
                    const fileName = `chucker_${categoryLabel.toLowerCase()}_logs_${Date.now()}.json`;

                    // If payload is large (> 150KB), offer choice between File Share & Safe Clipboard
                    if (rawJson.length > 150 * 1024) {
                        const sizeKb = (rawJson.length / 1024).toFixed(0);
                        if (typeof wx !== "undefined" && typeof wx.showActionSheet === "function") {
                            wx.showActionSheet({
                                itemList: [
                                    `📁 Share Full JSON File (${sizeKb} KB)`,
                                    `📋 Copy Safe Summary to Clipboard`,
                                    `⚡ Copy All cURL Commands (${selectedList.length})`
                                ],
                                success: (fmtRes) => {
                                    if (fmtRes.tapIndex === 0) {
                                        saveAndShareFile(rawJson, fileName);
                                    } else if (fmtRes.tapIndex === 1) {
                                        const safeStr = createSafeClipboardString(exportPayload, MAX_CLIPBOARD_BYTES);
                                        copyClipboard(safeStr, `Exported ${selectedList.length} logs!`, fileName);
                                    } else if (fmtRes.tapIndex === 2) {
                                        const curls = selectedList.filter((t) => t.curl).map((t) => `# ${t.method || 'CALL'} ${t.url || t.name} (${t.statusCode || 'OK'} - ${t.durationMs}ms)\n${t.curl}`).join("\n\n");
                                        copyClipboard(curls, `Copied ${selectedList.length} cURLs!`, `chucker_curls_${Date.now()}.sh`);
                                    }
                                }
                            });
                        } else {
                            saveAndShareFile(rawJson, fileName);
                        }
                    } else {
                        copyClipboard(exportPayload, `Exported ${selectedList.length} ${categoryLabel} logs!`, fileName);
                    }
                }
            });
        },

        onClearAll() {
            triggerHaptic("medium");
            wx.showModal({
                title: "Clear Logs",
                content: "Are you sure you want to clear all tracked transactions?",
                confirmText: "Clear",
                confirmColor: "#ED0226",
                success: (res) => {
                    if (res.confirm) {
                        triggerHaptic("light");
                        store_1.chuckerStore.clear();
                        this.setData({ filteredTransactions: [], selectedTransaction: null });
                    }
                }
            });
        },

        // ── Quick Copy Actions ──
        onCopyCurl() {
            const tx = this.data.selectedTransaction;
            if (tx && tx.curl) copyClipboard(tx.curl, tx.type === "BRIDGE" ? "JS Call Copied!" : "cURL Copied!");
        },
        onCopyUrl() {
            const tx = this.data.selectedTransaction;
            if (tx) copyClipboard(tx.url || tx.name, "Copied!");
        },
        onCopyRequestHeaders() {
            const tx = this.data.selectedTransaction;
            if (!tx) return;
            const headers = tx.rawHeaders || tx.headers;
            copyClipboard(headers || tx.requestHeadersFormatted, "Request Headers Copied!");
        },
        onCopyResponseHeaders() {
            const tx = this.data.selectedTransaction;
            if (!tx) return;
            const headers = tx.rawRespHeaders || tx.responseHeaders;
            copyClipboard(headers || tx.responseHeadersFormatted, "Response Headers Copied!");
        },
        onCopyRequestBody() {
            const tx = this.data.selectedTransaction;
            if (!tx) return;
            const raw = tx.rawBody !== undefined ? tx.rawBody : tx.body;
            copyClipboard(raw != null ? raw : (tx.hasQueryParams ? tx.queryParams : tx.requestBodyFormatted), "Payload Copied!");
        },
        onCopyResponseBody() {
            const tx = this.data.selectedTransaction;
            if (!tx) return;
            const raw = tx.rawRespBody !== undefined ? tx.rawRespBody : tx.responseBody;
            copyClipboard(raw != null ? raw : tx.responseBodyFormatted, "Response Copied!");
        },
        onCopyErrorMessage() {
            const tx = this.data.selectedTransaction;
            if (tx && tx.error) copyClipboard(tx.error, "Error Message Copied!");
        }
    }
});
}
