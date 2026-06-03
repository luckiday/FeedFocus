// Package only what ships to the Chrome Web Store.
// Run via `npm run zip` (which builds first). No secrets are in these files.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const out = `feed-focus-for-youtube-v${manifest.version}.zip`;

// Exactly the files Chrome loads — nothing from src/, proxy/, .env, .git/, node_modules/.
const include = ["manifest.json", "background", "content", "popup", "icons"];

const required = [
  "background/background.js",
  "content/youtube-home.js",
  "content/youtube-home.css",
  "popup/popup.html",
  "popup/popup.js",
  "popup/popup.css",
  "icons/icon16.png",
  "icons/icon128.png",
];
const missing = required.filter((f) => !existsSync(f));
if (missing.length) {
  console.error(`Missing built files: ${missing.join(", ")}\nRun \`npm run build\` first.`);
  process.exit(1);
}

if (existsSync(out)) rmSync(out);

execFileSync(
  "zip",
  ["-r", "-X", out, ...include, "-x", ".DS_Store", "*/.DS_Store", "*.map", "icons/icon.png"],
  { stdio: "inherit" }
);

console.log(`\n✓ Created ${out}`);
console.log("  Upload this at https://chrome.google.com/webstore/devconsole");
