import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const indexPath = path.join(distRoot, "index.html");

let html = await readFile(indexPath, "utf8");

const styleMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const scriptMatch = html.match(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
);

if (!styleMatch || !scriptMatch) {
  throw new Error("找不到 Vite 產生的 CSS 或 JavaScript 資產");
}

const resolveDistAsset = (reference) =>
  path.join(distRoot, reference.replace(/^\.\//, ""));

const [css, javascript, favicon] = await Promise.all([
  readFile(resolveDistAsset(styleMatch[1]), "utf8"),
  readFile(resolveDistAsset(scriptMatch[1]), "utf8"),
  readFile(path.join(distRoot, "favicon.svg"), "utf8"),
]);

html = html
  .replace(styleMatch[0], () => `<style>${css}</style>`)
  .replace(
    scriptMatch[0],
    () =>
      `<script type="module">${javascript.replaceAll("</script", "<\\/script")}</script>`,
  )
  .replace(
    /<link rel="icon"[^>]*>/,
    () =>
      `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(favicon)}" />`,
  )
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, "")
  .replace(/\s*<link rel="manifest"[^>]*>/, "");

await writeFile(path.join(projectRoot, "SmartPortfolio_v1.8.1.html"), html, "utf8");
