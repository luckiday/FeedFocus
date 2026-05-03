import * as esbuild from "esbuild";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const watch = process.argv.includes("--watch");
const __dirname = dirname(fileURLToPath(import.meta.url));

function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

function loadExtensionEnv() {
  if (process.env.PUBLIC_BUILD === "1") return {};
  const p = join(__dirname, ".env");
  if (!existsSync(p)) return {};
  try {
    return parseEnvText(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

const env = loadExtensionEnv();
const arkKey = env.ARK_API_KEY || env.VOLCENGINE_API_KEY || "";
const dashKey = env.DASHSCOPE_API_KEY || "";

const ctx = await esbuild.context({
  entryPoints: {
    "popup/popup": "src/popup/popup.ts",
    "background/background": "src/background/background.ts",
    "content/youtube-home": "src/content/youtube-home.ts",
  },
  bundle: true,
  outdir: ".",
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  minify: false,
  logLevel: "info",
  define: {
    __ENV_ARK_API_KEY__: JSON.stringify(arkKey),
    __ENV_DASHSCOPE_API_KEY__: JSON.stringify(dashKey),
  },
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
