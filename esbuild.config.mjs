import * as esbuild from "esbuild";
import { dirname } from "path";
import { fileURLToPath } from "url";

const watch = process.argv.includes("--watch");
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

// No secrets are bundled. Users supply their own API keys in the popup,
// which are stored in chrome.storage.local and read at runtime.
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
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
