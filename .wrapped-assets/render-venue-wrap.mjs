import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fontMono = readFileSync(path.join(root, '.wrapped-assets/DepartureMono-Regular.woff2')).toString('base64');
const logo = readFileSync(path.join(root, '.wrapped-assets/logo.png')).toString('base64');

// ---------- data ----------
const events = JSON.parse(readFileSync(path.join(root, 'researchData/events-2026-10-17.json'), 'utf8')).events;

const norm = (v) =>
  (v || 'unknown')
    .trim()
    .replace(/\u2019/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
    .replace(/ (hotel|bar|venue)$/, '');

/** Venue spellings that clearly point at the same room, folded into one key. */
const manual = {
  hamo: 'hamilton station',
  ori: 'oriental',
  'the ori': 'oriental',
  'the oriental': 'oriental',
  croat: 'croatian club',
  'the croat': 'croatian club',
  'croation club wickham': 'croatian club',
  'black roos - croatian club': 'croatian club',
};

const venues = new Map();
for (const e of events) {
  const raw = (e.venueName || 'unknown').trim().replace(/\u2019/g, "'");
  const key = manual[norm(raw)] ?? norm(raw);
  if (!venues.has(key)) venues.set(key, { key, cards: 0, days: new Set(), aliases: new Map() });
  const v = venues.get(key);
  v.cards += 1;
  const day = (e.eventDateTime || '').slice(0, 10);
  if (day) v.days.add(day);
  v.aliases.set(raw, (v.aliases.get(raw) || 0) + 1);
}

const ranked = [...venues.values()]
  .map((v) => {
    const aliases = [...v.aliases.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    return { ...v, aliases, name: aliases[0], share: (v.cards / events.length) * 100 };
  })
  .sort((a, b) => b.cards - a.cards || b.days.size - a.days.size);

const TOP = 8;
const top = ranked.slice(0, TOP);
const totalCards = events.length;
const totalRooms = ranked.length;
const totalNights = new Set(events.map((e) => (e.eventDateTime || '').slice(0, 10)).filter(Boolean)).size;
const topCards = top.reduce((n, v) => n + v.cards, 0);
const restCards = totalCards - topCards;
const restRooms = totalRooms - TOP;
const nf = (n) => n.toLocaleString('en-AU');

const aliasLine = (v) => {
  const rest = v.aliases.slice(1);
  if (!rest.length) return '';
  const full = rest.join(' \u00b7 ');
  if (full.length <= 62) return full;
  const shown = rest.slice(0, 2).join(' \u00b7 ');
  return `${shown} \u00b7 +${rest.length - 2} more`;
};

const rows = top.map((v, i) => `
  <div class="row">
    <div class="rank">${String(i + 1).padStart(2, '0')}</div>
    <div class="venue">
      <div class="name">${v.name}</div>
      ${aliasLine(v) ? `<div class="aliases">${aliasLine(v)}</div>` : `<div class="aliases dim">one spelling, no arguments</div>`}
    </div>
    <div class="num">${v.days.size}</div>
    <div class="num">${v.cards}</div>
    <div class="share">
      <div class="track"><i style="width:${Math.min(100, v.share / top[0].share * 100)}%"></i></div>
      <div class="pct">${v.share.toFixed(1)}%</div>
    </div>
  </div>`).join('');

// ---------- html ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Departure Mono';src:url(data:font/woff2;base64,${fontMono}) format('woff2');font-display:block}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0d0806}
body{width:1080px;height:1350px;overflow:hidden;color:#fff;
  font-family:'Departure Mono';font-weight:400;font-size:18.75px;line-height:30.5px;
  -webkit-font-smoothing:antialiased}
.card{position:relative;width:1080px;height:1350px;padding:0 55px}

.logo{position:absolute;left:59px;top:35px;width:56px;height:78px;image-rendering:pixelated}

h1{position:absolute;left:55px;top:131px;margin:0;font-size:18.75px;line-height:1.62;font-weight:700;letter-spacing:0}

.rule{position:absolute;left:55px;width:970px;height:1px;background:#2b2523}

.eyebrow{position:absolute;left:55px;top:204px;margin:0;font-size:27px;line-height:1.3;font-weight:400;letter-spacing:1.6px}
.sub{position:absolute;left:55px;top:249px;margin:0;font-size:13px;line-height:1.4;color:#8b8681;letter-spacing:.4px}

.table{position:absolute;left:55px;top:308px;width:970px}
.thead,.row{display:grid;grid-template-columns:48px 1fr 96px 96px 246px;align-items:center}
.thead{height:34px;color:#8b8681;font-size:11.5px;letter-spacing:1.6px;text-transform:uppercase;border-bottom:1px solid #2b2523}
.thead .num,.thead .share{justify-self:end}
.row{height:76px;border-bottom:1px solid #221d1a}
.rank{color:#6c6763;font-size:13px}
.name{font-size:20px;line-height:1.2;letter-spacing:0}
.aliases{margin-top:5px;font-size:12.5px;line-height:1.2;color:#8b8681;letter-spacing:.2px}
.aliases.dim{color:#4a4541}
.num{justify-self:end;font-size:18.75px}
.share{display:flex;align-items:center;gap:14px;justify-self:end}
.track{width:140px;height:9px;background:#221d1a;position:relative}
.track i{position:absolute;left:0;top:0;bottom:0;background:#fff;display:block}
.pct{width:62px;text-align:right;font-size:15px;color:#cfcac6}

.note{position:absolute;left:55px;top:962px;font-size:12.5px;line-height:1.4;color:#8b8681;letter-spacing:.3px}

.copy{position:absolute;left:55px;top:1004px;width:970px;font-size:18.75px;line-height:30.5px}
.copy p{margin:0 0 20px}
</style></head><body>
<div class="card">
  <img class="logo" src="data:image/png;base64,${logo}" alt="">
  <h1>Mulubinba/Newcastle 2027 Witchhouse Wrapped</h1>
  <div class="rule" style="top:190px"></div>

  <h2 class="eyebrow">WHERE THE YEAR ACTUALLY HAPPENED</h2>
  <p class="sub">${totalRooms} rooms, ${nf(totalCards)} cards, ${totalNights} nights &mdash; every misspelling merged into one line</p>

  <div class="table">
    <div class="thead">
      <div>#</div><div>Venue (concatenated)</div><div class="num">Nights</div><div class="num">Cards</div><div class="share">Share</div>
    </div>
    ${rows}
  </div>

  <div class="note">&hellip;and ${restRooms} more rooms splitting the other ${nf(restCards)} cards.</div>

  <div class="copy">
    <p>Same room, different name on the flyer &mdash; the hotel, the nickname, the extra &ldquo;the&rdquo;, the typo. Every spelling concatenated into one line so the ladder reads straight.</p>
    <p>The top ${TOP} rooms carried ${nf(topCards)} of the ${nf(totalCards)} cards, about ${Math.round(topCards / totalCards * 100)}% of the year across ${totalNights} nights. The other ${restRooms} split what was left, which is either a healthy long tail or a very small town with one very busy booking agent.</p>
    <p>Enjoy :)</p>
  </div>
</div>
</body></html>`;

writeFileSync(path.join(root, '.wrapped-assets/venue-table.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(root, 'src/wrapped/venue-table-wrap.png') });
await browser.close();

console.log(JSON.stringify({ totalCards, totalRooms, totalNights, topCards, restCards, restRooms }, null, 1));
