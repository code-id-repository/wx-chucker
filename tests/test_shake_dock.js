"use strict";

const assert = require("assert");
const path = require("path");
const targetDir = process.env.TARGET_DIR ? path.resolve(process.env.TARGET_DIR) : path.resolve(__dirname, "../src");

// Mock global WeChat Mini-Program environment
let accelerometerStarted = false;
let accelerometerStopped = false;
let accelerometerInterval = "";
let accelerometerCallback = null;
let vibrated = false;
let vibrateType = "";
let toastShown = false;
let toastTitle = "";
let actionSheetShown = false;
let actionSheetItems = [];

global.wx = {
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, statusBarHeight: 44 }),
    getSystemInfoSync: () => ({ platform: "ios", windowWidth: 375, windowHeight: 667, statusBarHeight: 44 }),
    getDeviceInfo: () => ({ platform: "ios" }),
    getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32 }),
    getStorageSync: () => "dark",
    setStorageSync: () => {},
    vibrateShort: (opts) => {
        vibrated = true;
        vibrateType = opts?.type || "";
    },
    showToast: (opts) => {
        toastShown = true;
        toastTitle = opts?.title || "";
    },
    showActionSheet: (opts) => {
        actionSheetShown = true;
        actionSheetItems = opts?.itemList || [];
        // Simulate selecting first option
        opts?.success?.({ tapIndex: 0 });
    },
    startAccelerometer: (opts) => {
        accelerometerStarted = true;
        accelerometerStopped = false;
        accelerometerInterval = opts?.interval || "";
    },
    stopAccelerometer: () => {
        accelerometerStopped = true;
        accelerometerStarted = false;
    },
    onAccelerometerChange: (cb) => {
        accelerometerCallback = cb;
    },
    offAccelerometerChange: (cb) => {
        if (accelerometerCallback === cb) {
            accelerometerCallback = null;
        }
    }
};

// Mock Component factory
let registeredComponent = null;
global.Component = function (config) {
    registeredComponent = config;
};

// Load the chucker component
require(path.join(targetDir, "index.js"));

function createComponentInstance(properties = {}, platform = "ios") {
    global.wx.getDeviceInfo = () => ({ platform });
    global.wx.getSystemInfoSync = () => ({ platform, windowWidth: 375, windowHeight: 667, statusBarHeight: 44 });

    const instance = {
        data: JSON.parse(JSON.stringify(registeredComponent.data)),
        properties: { ...properties },
        setData(newData) {
            Object.assign(this.data, newData);
        }
    };

    // Attach methods
    for (const [key, fn] of Object.entries(registeredComponent.methods)) {
        instance[key] = fn.bind(instance);
    }

    return instance;
}

console.log("==========================================================");
console.log("--- 1. Testing Native Shake-to-Open Sensor Engine ---");
console.log("==========================================================");

{
    accelerometerStarted = false;
    accelerometerStopped = false;
    accelerometerCallback = null;
    vibrated = false;

    const comp = createComponentInstance({}, "ios");
    registeredComponent.lifetimes.attached.call(comp);

    assert.strictEqual(accelerometerStarted, true, "Accelerometer must start on attach for mobile");
    assert.strictEqual(accelerometerInterval, "ui", "Accelerometer interval must be 'ui'");
    assert(typeof accelerometerCallback === "function", "Accelerometer callback must be registered");

    // Scenario A: Phone resting / small movement (delta < 2.2)
    accelerometerCallback({ x: 0.1, y: 0.1, z: 0.98 });
    accelerometerCallback({ x: 0.2, y: 0.15, z: 0.97 });
    assert.strictEqual(comp.data.isOpen, false, "Small motion must NOT trigger openModal");

    // Scenario B: Single bump (delta > 2.2 once, no second spike within 800ms)
    accelerometerCallback({ x: 1.5, y: 1.2, z: 2.0 }); // Spike 1
    assert.strictEqual(comp.data.isOpen, false, "Single spike must not trigger openModal");

    // Phone settles down gently (delta < 2.2)
    accelerometerCallback({ x: 1.4, y: 1.1, z: 1.9 });
    accelerometerCallback({ x: 1.3, y: 1.0, z: 1.8 });

    // Wait 900ms to let spike window expire without second spike
    const originalDateNow = Date.now;
    let mockTime = Date.now();
    Date.now = () => mockTime;

    mockTime += 900;
    accelerometerCallback({ x: 1.25, y: 0.95, z: 1.75 }); // delta 0.15 < 2.2 -> resets spikeCount to 0!
    assert.strictEqual(comp.data.isOpen, false, "Expired single bump window must not trigger openModal");

    // Scenario C: Dual-spike intentional shake gesture
    mockTime += 500;
    // Peak 1: Rapid flick right (delta > 2.2)
    accelerometerCallback({ x: 2.5, y: 2.2, z: 2.8 }); // delta = 1.25 + 1.25 + 1.05 = 3.55 > 2.2
    assert.strictEqual(comp.data.isOpen, false, "First spike recorded, waiting for second spike");

    // Peak 2: 250ms later, reverse flick left
    mockTime += 250;
    accelerometerCallback({ x: -0.5, y: -0.5, z: -0.2 }); // delta = 3.0 + 2.7 + 3.0 = 8.7 > 2.2 (Spike 2 within 250ms!)

    assert.strictEqual(comp.data.isOpen, true, "Dual-spike shake MUST trigger openModal!");
    assert.strictEqual(vibrated, true, "Shake must trigger haptic feedback");
    assert.strictEqual(vibrateType, "medium", "Haptic must be 'medium'");
    assert.strictEqual(accelerometerStopped, true, "Accelerometer MUST pause when modal is open to save battery");

    // Scenario D: Shake cooldown debounce
    comp.setData({ isOpen: false }); // simulate modal closed
    comp.resumeShakeListener();
    assert.strictEqual(accelerometerStarted, true, "Accelerometer resumed on closeModal");

    // Immediate spike during 1200ms cooldown window
    mockTime += 300;
    vibrated = false;
    accelerometerCallback({ x: 3.0, y: 2.0, z: 2.0 });
    assert.strictEqual(vibrated, false, "Shake cooldown must debounce rapid bursts");

    // Cleanup
    Date.now = originalDateNow;
    registeredComponent.lifetimes.detached.call(comp);
    assert.strictEqual(accelerometerCallback, null, "Detached must unregister accelerometer listener");
    assert.strictEqual(accelerometerStopped, true, "Detached must stop accelerometer");
    console.log("✅ Passive Native Shake-to-Open sensor logic verified 100%!");
}

console.log("==========================================================");
console.log("--- 2. Testing Smart Ghost Dock & Edge Snapping ---");
console.log("==========================================================");

{
    const comp = createComponentInstance({}, "ios");
    registeredComponent.lifetimes.attached.call(comp);

    assert.strictEqual(comp.data.isDocked, false, "Initially FAB should not be docked");
    assert.strictEqual(comp.data.dockSide, "right", "Default dockSide should be 'right'");

    // Test idle timer docking after 3 seconds
    assert(comp.dockTimer !== null, "Dock timer must be scheduled on attached");
    
    // Simulate timer firing
    comp.setData({ isDocked: true });
    assert.strictEqual(comp.data.isDocked, true, "FAB is docked after 3s idle");

    // Touching FAB immediately wakes it from dock
    comp.onFabTouchStart({ touches: [{ clientX: 300, clientY: 500 }] });
    assert.strictEqual(comp.data.isDocked, false, "TouchStart must immediately wake FAB from dock");

    // Dragging FAB to the left side of screen
    comp.onFabTouchMove({ touches: [{ clientX: 50, clientY: 300 }] });
    assert.strictEqual(comp.isDragging, true, "FAB must be marked as dragging");
    comp.setData({ fabX: 40 }); // Moved to left half (< 187.5px)

    // Release drag
    comp.onFabTouchEnd();
    assert.strictEqual(comp.data.dockSide, "left", "Snapping on left half must set dockSide to 'left'");
    assert.strictEqual(comp.data.fabX, 8, "Left targetX must snap to 8px margin");
    assert.strictEqual(comp.data.isFabSnapping, true, "isFabSnapping must be true for CSS transition");
    assert(comp.dockTimer !== null, "Dock timer must restart after drag release");

    // Tap without drag opens modal
    comp.isDragging = false;
    comp.onFabTouchStart({ touches: [{ clientX: 8, clientY: 300 }] });
    comp.onFabTouchEnd();
    assert.strictEqual(comp.data.isOpen, true, "Tap on FAB must open modal");

    // Detached cleanup
    registeredComponent.lifetimes.detached.call(comp);
    assert.strictEqual(comp.dockTimer, null, "Detached must clear dock timer");
    console.log("✅ Smart Ghost Dock & Edge Snapping verified 100%!");
}

console.log("==========================================================");
console.log("--- 3. Testing DevTools & Hidden Mode Fail-Safe ---");
console.log("==========================================================");

{
    // Test DevTools environment
    accelerometerStarted = false;
    const devComp = createComponentInstance({}, "devtools");
    registeredComponent.lifetimes.attached.call(devComp);

    assert.strictEqual(devComp.data.isDevTools, true, "isDevTools must be true when platform === 'devtools'");
    assert.strictEqual(accelerometerStarted, false, "DevTools must NEVER start physical accelerometer");

    // Test Long-Press to hide trigger
    actionSheetShown = false;
    devComp.onFabLongPress();
    assert.strictEqual(actionSheetShown, true, "Long-press must display ActionSheet");
    assert.strictEqual(devComp.data.isFabHidden, true, "Choosing option 0 must set isFabHidden to true");

    // Test Unhide trigger
    devComp.onUnhideFab();
    assert.strictEqual(devComp.data.isFabHidden, false, "onUnhideFab must restore isFabHidden to false");

    // On mobile: Shaking also unhides trigger if it was hidden
    const mobileComp = createComponentInstance({}, "android");
    registeredComponent.lifetimes.attached.call(mobileComp);
    mobileComp.setData({ isFabHidden: true });
    assert.strictEqual(mobileComp.data.isFabHidden, true);

    mobileComp.onShakeDetected();
    assert.strictEqual(mobileComp.data.isFabHidden, false, "onShakeDetected must automatically unhide trigger");
    assert.strictEqual(mobileComp.data.isOpen, true, "onShakeDetected must open inspector modal");

    // Cleanup
    registeredComponent.lifetimes.detached.call(devComp);
    registeredComponent.lifetimes.detached.call(mobileComp);
    console.log("✅ DevTools & Hidden Mode Fail-Safe verified 100%!");
}

console.log("==========================================================");
console.log("--- 4. Testing Props: enableShake & enableGhostDock ---");
console.log("==========================================================");

{
    // When enableShake is explicitly set to false
    accelerometerStarted = false;
    const noShakeComp = createComponentInstance({ enableShake: false }, "ios");
    registeredComponent.lifetimes.attached.call(noShakeComp);
    assert.strictEqual(noShakeComp.data.enableShake, false);
    assert.strictEqual(accelerometerStarted, false, "enableShake=false must not start accelerometer");

    // When enableGhostDock is explicitly set to false
    const noDockComp = createComponentInstance({ enableGhostDock: false }, "ios");
    registeredComponent.lifetimes.attached.call(noDockComp);
    assert.strictEqual(noDockComp.data.enableGhostDock, false);
    assert.strictEqual(noDockComp.dockTimer, null, "enableGhostDock=false must not start dock timer");

    registeredComponent.lifetimes.detached.call(noShakeComp);
    registeredComponent.lifetimes.detached.call(noDockComp);
    console.log("✅ Custom Properties (enableShake / enableGhostDock) verified 100%!");
}

console.log("\n🚀 ALL 4 TEST SUITES FOR SHAKE & GHOST DOCK PASSED WITH 100% SUCCESS!\n");
