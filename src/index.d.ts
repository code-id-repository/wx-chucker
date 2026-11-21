export interface ChuckerConfig {
    /** Whether Chucker interception and UI are enabled. Defaults to auto-detection (false in release/prod, true in dev). */
    enabled?: boolean;
    /** Automatically detect environment (release vs develop/trial). Defaults to true. */
    autoDetectEnv?: boolean;
    /** Force environment name ('develop' | 'trial' | 'release' | 'production' | etc.). */
    env?: string;
    /** Whether to mask sensitive headers (Authorization, Cookie) and body keys (password, otp, pin). */
    maskSensitive?: boolean;
    /** Maximum number of transactions kept in memory ring buffer. Defaults to 120. */
    maxTransactions?: number;
    /** Track wx.request HTTP/HTTPS network calls. Defaults to true. */
    trackHttp?: boolean;
    /** Track wx.invokeNativePlugin / wx.invoke native bridge calls. Defaults to true. */
    trackNativePlugin?: boolean;
    /** Track wx.uploadFile network calls. Defaults to true. */
    trackUpload?: boolean;
    /** Track wx.downloadFile network calls. Defaults to true. */
    trackDownload?: boolean;
    /** Maximum body length in bytes before truncation. Defaults to 500,000. */
    maxBodyLength?: number;
    /** Additional request/response header names to redact. */
    redactHeaders?: string[];
    /** Additional payload body key names to redact. */
    redactBodyKeys?: string[];
}

export interface ChuckerTransaction {
    id: string;
    type: "HTTP" | "BRIDGE" | "UPLOAD" | "DOWNLOAD";
    name: string;
    url?: string;
    method?: string;
    statusCode?: number;
    duration?: number;
    timestamp: number;
    timeFormatted?: string;
    error?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: any;
    responseBody?: any;
    requestBodyFormatted?: string;
    responseBodyFormatted?: string;
    requestHeadersFormatted?: string;
    responseHeadersFormatted?: string;
    curl?: string;
    isSlow?: boolean;
    isError?: boolean;
    category?: "all" | "network" | "bridge" | "error" | "slow";
}

export interface ChuckerStore {
    config: ChuckerConfig;
    transactions: ChuckerTransaction[];
    listeners: Array<(transactions: ChuckerTransaction[]) => void>;
    init(config?: ChuckerConfig): void;
    addRequest(tx: Partial<ChuckerTransaction>): string;
    updateResponse(id: string, update: Partial<ChuckerTransaction>): void;
    clear(): void;
    subscribe(listener: (transactions: ChuckerTransaction[]) => void): () => void;
    notify(force?: boolean): void;
    getAll(): ChuckerTransaction[];
    getById(id: string): ChuckerTransaction | undefined;
}

/**
 * Initializes wx-chucker with optional configuration and installs network/bridge interceptors.
 */
export function initChucker(config?: ChuckerConfig): ChuckerStore;

/**
 * Returns the singleton store instance.
 */
export function getChuckerStore(): ChuckerStore;

/**
 * Global singleton store instance.
 */
export const chuckerStore: ChuckerStore;

/**
 * Check if Chucker is currently enabled.
 */
export function isChuckerEnabled(): boolean;

/**
 * Dynamically enable or disable Chucker.
 */
export function setChuckerEnabled(enabled: boolean): void;

/**
 * Multi-tier production detector. Checks wx environment, parameters, and globals.
 */
export function isProductionEnv(customEnv?: string): boolean;
