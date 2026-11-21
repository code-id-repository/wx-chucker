"use strict";

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.resolve(__dirname, "../src");
const DIST_DIR = path.resolve(__dirname, "../miniprogram_dist");

function rmDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Clean & minify JavaScript without breaking strings or regexes.
 * Strips comments and collapses excess whitespace.
 */
function minifyJs(content) {
    let inString = false;
    let stringChar = "";
    let inRegex = false;
    let inCharClass = false;
    let inLineComment = false;
    let inBlockComment = false;
    let result = "";

    const REGEX_PREV_TOKENS = new Set([
        "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "~", "^", "+", "-", "*", "%"
    ]);
    const REGEX_PREV_WORDS = new Set([
        "return", "case", "delete", "throw", "void", "typeof", "instanceof", "new", "in", "of"
    ]);

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1] || "";
        const prevChar = content[i - 1] || "";

        if (inLineComment) {
            if (char === "\n") {
                inLineComment = false;
                result += "\n";
            }
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && nextChar === "/") {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inString) {
            result += char;
            if (char === stringChar && prevChar !== "\\") {
                inString = false;
            }
            continue;
        }

        if (inRegex) {
            result += char;
            if (char === "\\") {
                result += nextChar;
                i++;
                continue;
            }
            if (char === "[" && !inCharClass) {
                inCharClass = true;
                continue;
            }
            if (char === "]" && inCharClass) {
                inCharClass = false;
                continue;
            }
            if (char === "/" && !inCharClass) {
                inRegex = false;
            }
            continue;
        }

        if (char === "'" || char === '"' || char === "`") {
            inString = true;
            stringChar = char;
            result += char;
            continue;
        }

        if (char === "/" && nextChar === "/") {
            inLineComment = true;
            i++;
            continue;
        }

        if (char === "/" && nextChar === "*") {
            inBlockComment = true;
            i++;
            continue;
        }

        if (char === "/") {
            const trimmed = result.trimEnd();
            const lastChar = trimmed[trimmed.length - 1];
            const matchWord = trimmed.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/);
            const lastWord = matchWord ? matchWord[0] : "";

            if (!lastChar || REGEX_PREV_TOKENS.has(lastChar) || REGEX_PREV_WORDS.has(lastWord)) {
                inRegex = true;
                inCharClass = false;
                result += char;
                continue;
            }
        }

        result += char;
    }

    // Collapse empty lines & leading/trailing indentation
    return result
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");
}

/**
 * Optimize WXSS:
 * 1. Consolidate duplicate SVG mask-image & -webkit-mask-image definitions using CSS custom variables (--chk-mask).
 * 2. Strip CSS comments.
 * 3. Minify CSS rules and whitespace.
 */
function minifyWxss(content) {
    // Strip comments
    let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, "");

    // Add --chk-mask rule to .chucker-ico if not already present
    if (cleaned.includes(".chucker-ico {") && !cleaned.includes("var(--chk-mask)")) {
        cleaned = cleaned.replace(
            ".chucker-ico {",
            `.chucker-ico {\n  -webkit-mask-image: var(--chk-mask);\n  mask-image: var(--chk-mask);`
        );
    }

    // Replace duplicate:
    // -webkit-mask-image: url("data:image/svg+xml,...");
    // mask-image: url("data:image/svg+xml,...");
    // with:
    // --chk-mask: url("data:image/svg+xml,...");
    const svgMaskRegex = /-webkit-mask-image:\s*(url\("data:image\/svg\+xml,[^"]+"\));\s*mask-image:\s*url\("data:image\/svg\+xml,[^"]+"\);?/g;
    cleaned = cleaned.replace(svgMaskRegex, "--chk-mask: $1;");

    // Also handle single occurrences inside specific classes if any
    cleaned = cleaned.replace(/mask-image:\s*(url\("data:image\/svg\+xml,[^"]+"\));?/g, "--chk-mask: $1;");

    // Minify whitespace
    return cleaned
        .replace(/\s*([\{\}\:\;\,])\s*/g, "$1")
        .replace(/;}/g, "}")
        .replace(/\n+/g, " ")
        .trim();
}

/**
 * Minify WXML:
 * Strip XML comments and collapse redundant whitespace between tags.
 */
function minifyWxml(content) {
    // Strip WXML comments <!-- ... -->
    let cleaned = content.replace(/<!--[\s\S]*?-->/g, "");

    // Collapse spaces between tags
    cleaned = cleaned.replace(/>\s+</g, "><");

    // Clean multiple linebreaks
    return cleaned
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
}

/**
 * Minify JSON
 */
function minifyJson(content) {
    return JSON.stringify(JSON.parse(content));
}

function processDirectory(srcDir, distDir, stats) {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const distPath = path.join(distDir, entry.name);

        if (entry.isDirectory()) {
            ensureDir(distPath);
            processDirectory(srcPath, distPath, stats);
        } else {
            const ext = path.extname(entry.name);
            const originalContent = fs.readFileSync(srcPath, "utf8");
            const originalSize = Buffer.byteLength(originalContent, "utf8");
            let minifiedContent = originalContent;

            if (ext === ".js") {
                minifiedContent = minifyJs(originalContent);
            } else if (ext === ".wxss") {
                minifiedContent = minifyWxss(originalContent);
            } else if (ext === ".wxml") {
                minifiedContent = minifyWxml(originalContent);
            } else if (ext === ".json") {
                minifiedContent = minifyJson(originalContent);
            } else if (ext === ".ts" || ext === ".d.ts") {
                minifiedContent = originalContent; // copy type definitions verbatim
            }

            fs.writeFileSync(distPath, minifiedContent, "utf8");
            const minifiedSize = Buffer.byteLength(minifiedContent, "utf8");

            const relPath = path.relative(SRC_DIR, srcPath);
            stats.push({
                file: relPath,
                originalSize,
                minifiedSize,
                saved: originalSize - minifiedSize,
                percentage: originalSize > 0 ? (((originalSize - minifiedSize) / originalSize) * 100).toFixed(1) : "0.0"
            });
        }
    }
}

function runBuild() {
    console.log("\n📦 BUILDING WX-CHUCKER FOR PRODUCTION RELEASE...");
    console.log(`Source:      ${SRC_DIR}`);
    console.log(`Destination: ${DIST_DIR}\n`);

    const startTime = Date.now();
    rmDir(DIST_DIR);
    ensureDir(DIST_DIR);

    const stats = [];
    processDirectory(SRC_DIR, DIST_DIR, stats);

    const totalOriginal = stats.reduce((sum, s) => sum + s.originalSize, 0);
    const totalMinified = stats.reduce((sum, s) => sum + s.minifiedSize, 0);
    const totalSaved = totalOriginal - totalMinified;
    const totalPct = (((totalOriginal - totalMinified) / totalOriginal) * 100).toFixed(1);

    console.log("---------------------------------------------------------------------------------");
    console.log(
        "File".padEnd(30) +
        "Original".padStart(12) +
        "Minified".padStart(12) +
        "Saved".padStart(12) +
        "Reduction".padStart(12)
    );
    console.log("---------------------------------------------------------------------------------");

    for (const s of stats) {
        console.log(
            s.file.padEnd(30) +
            `${(s.originalSize / 1024).toFixed(2)} KB`.padStart(12) +
            `${(s.minifiedSize / 1024).toFixed(2)} KB`.padStart(12) +
            `${(s.saved / 1024).toFixed(2)} KB`.padStart(12) +
            `${s.percentage}%`.padStart(12)
        );
    }

    console.log("---------------------------------------------------------------------------------");
    console.log(
        "TOTAL".padEnd(30) +
        `${(totalOriginal / 1024).toFixed(2)} KB`.padStart(12) +
        `${(totalMinified / 1024).toFixed(2)} KB`.padStart(12) +
        `${(totalSaved / 1024).toFixed(2)} KB`.padStart(12) +
        `${totalPct}%`.padStart(12)
    );
    console.log("---------------------------------------------------------------------------------");
    console.log(`✨ Build completed in ${Date.now() - startTime}ms!\n`);
}

runBuild();
