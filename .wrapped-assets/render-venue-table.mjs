import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fontMono = readFileSync(path.join(root, '.wrapped-assets/JetBrainsMono-Regular.woff2')).toString('base64');

// # | venue | listings | share | free | paid | median paid
const rows = [
  [1, "Lass O'Gowrie Hotel", 176, '14.4%', 115, 51, '$25'],
  [2, 'Hamilton Station Hotel', 161, '13.1%', 91, 60, '$25'],
  [3, 'Maru Hi-Fi', 128, '10.5%', 128, 0, '—'],
  [4, 'The Oak', 97, '7.9%', 91, 1, '$15'],
  [5, 'King Street Hotel', 81, '6.6%', 14, 55, '$49'],
  [6, 'The Ori', 74, '6.0%', 72, 0, '—'],
  [7, 'Bernies Bar', 73, '6.0%', 62, 5, '$10'],
  [8, 'Stag & Hunter Hotel', 67, '5.5%', 24, 33, '$34'],
  [9, 'The Beauford Hotel', 45, '3.7%', 19, 0, '—'],
  [10, 'Croatian Club', 36, '2.9%', 12, 22, '$18'],
  [11, 'The Underground', 36, '2.9%', 3, 33, '$10'],
  [12, 'Queens Wharf Hotel', 34, '2.8%', 34, 0, '—'],
];

const cols = [
  { label: '#', cls: 'rank' },
  { label: 'Venue', cls: 'venue' },
  { label: 'Listings', cls: 'num' },
  { label: 'Share', cls: 'num' },
  { label: 'Free', cls: 'num' },
  { label: 'Paid', cls: 'num' },
  { label: 'Median paid', cls: 'num' },
];

const body = rows.map((r, i) => `
    <tr${i === 0 ? ' class="top"' : ''}>${cols.map((c, j) => `<td class="${c.cls}">${r[j]}</td>`).join('')}</tr>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${fontMono}) format('woff2');font-display:block}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0d0806}
body{width:1000px;color:#fff;font-family:'JetBrains Mono';font-weight:400;font-size:16px;line-height:1.2;-webkit-font-smoothing:antialiased}
table{width:1000px;margin:0;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1px solid #fff}
thead th{height:44px;padding:0 10px;color:#fff;font-weight:400;font-size:16px;text-align:left;
  border-bottom:1px solid #fff;border-right:1px solid #fff;white-space:nowrap;overflow:hidden}
thead th.num{text-align:right}
tbody td{height:48px;padding:0 10px;vertical-align:middle;border-bottom:1px solid #fff;border-right:1px solid #fff;white-space:nowrap;overflow:hidden}
tbody tr:last-child td{border-bottom:0}
thead th:last-child,tbody td:last-child{border-right:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
td.rank,th.rank{text-align:left}
tbody tr.top td{color:#ffcd04}
</style></head><body>
  <table>
    <colgroup>
      <col style="width:50px"><col style="width:330px"><col style="width:130px"><col style="width:110px">
      <col style="width:100px"><col style="width:100px"><col style="width:180px">
    </colgroup>
    <thead><tr>${cols.map((c) => `<th class="${c.cls}">${c.label}</th>`).join('')}</tr></thead>
    <tbody>${body}
    </tbody>
  </table>
</body></html>`;

writeFileSync(path.join(root, '.wrapped-assets/venue-table-flat.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 300 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(root, 'src/wrapped/venue-table.png'), fullPage: true });
await browser.close();
console.log('ok');
