#!/usr/bin/env node
/**
 * Screenshot every analysis table in the wrapped "venue-table" style:
 * black ground, monospace, white 1px grid, amber top row.
 *
 * Run scripts/render-table-images.py first to produce tables.json.
 * Usage: node scripts/screenshot-table-images.mjs
 */

import { chromium } from "playwright";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "specs", "table-images");
const fontMono = readFileSync(
  path.join(root, ".wrapped-assets", "JetBrainsMono-Regular.woff2"),
).toString("base64");

const tables = JSON.parse(readFileSync(path.join(outDir, "tables.json"), "utf8"));

const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function buildHtml(table) {
  const cols = table.widths
    .map((width) => `<col style="width:${width}px">`)
    .join("");

  const head = table.header
    .map((label, i) => `<th class="${table.aligns[i]}">${esc(label)}</th>`)
    .join("");

  const body = table.rows
    .map((row, i) => {
      const cells = table.header
        .map((_, j) => {
          const cls = table.aligns[j];
          const value = row[j] ?? "";
          return `<td class="${cls}">${esc(value)}</td>`;
        })
        .join("");
      return `\n    <tr${i === 0 ? ' class="top"' : ""}>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${fontMono}) format('woff2');font-display:block}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0d0806}
body{width:1000px;color:#fff;font-family:'JetBrains Mono';font-weight:400;font-size:16px;line-height:1.2;-webkit-font-smoothing:antialiased}
table{width:1000px;margin:0;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1px solid #fff}
thead th{height:44px;padding:0 10px;color:#fff;font-weight:400;font-size:16px;text-align:left;white-space:nowrap;
  border-bottom:1px solid #fff;border-right:1px solid #fff}
thead th.num{text-align:right}
tbody td{height:48px;padding:8px 10px;vertical-align:middle;border-bottom:1px solid #fff;border-right:1px solid #fff}
tbody tr:last-child td{border-bottom:0}
thead th:last-child,tbody td:last-child{border-right:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tbody tr.top td{color:#ffcd04}
</style></head><body>
  <table>
    <colgroup>${cols}</colgroup>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}
    </tbody>
  </table>
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1000, height: 300 },
  deviceScaleFactor: 1,
});

for (const table of tables) {
  const html = buildHtml(table);
  const htmlPath = path.join(outDir, `${table.id}.html`);
  writeFileSync(htmlPath, html);

  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(120);
  await page.screenshot({
    path: path.join(outDir, `${table.id}.png`),
    fullPage: true,
  });
  unlinkSync(htmlPath);
  console.log(`wrote ${table.id}.png`);
}

await browser.close();
