#!/usr/bin/env python3
"""Build a PNG-ready preview page for selected analysis tables.

The companion Node script screenshots each `.shot` section to
specs/table-images/<id>.png.
"""

from __future__ import annotations

import html
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "specs" / "table-images"
SOURCE = ROOT / "specs" / "research-data-analysis.md"

renderer = SourceFileLoader(
    "analysis_renderer", str(ROOT / "scripts" / "render-analysis-html.py")
).load_module()

TABLES = [
    {
        "id": "artist-residencies",
        "marker": "**Top artist residencies at a venue**",
        "title": "Top artist residencies at a venue",
        "subtitle": "Act-level · 3+ distinct weeks · most common genre at that venue",
    },
    {
        "id": "witchhouse-artists",
        "marker": "**Artists with the most `WITCHHOUSE SELECT` bills**",
        "title": "Artists with the most WITCHHOUSE SELECT bills",
        "subtitle": "Artists with 2+ tagged bills · counts are lower bounds",
    },
    {
        "id": "live-acts",
        "marker": "**Live acts (bands & soloists) — top 10 by bill appearances**",
        "title": "Live acts — top 10 by bill appearances",
        "subtitle": "Bands & soloists · 1,631 named acts · 1,245 listings",
    },
    {
        "id": "djs",
        "marker": "**DJs — top 10 by bill appearances**",
        "title": "DJs — top 10 by bill appearances",
        "subtitle": "444 classified DJs · 1,245 listings",
    },
]


def extract_table(lines: list[str], marker: str):
    for index, line in enumerate(lines):
        if line.strip().startswith(marker):
            cursor = index + 1
            while cursor < len(lines) and not lines[cursor].startswith("|"):
                cursor += 1
            if cursor >= len(lines):
                raise ValueError(f"no table after {marker!r}")
            header = renderer.split_row(lines[cursor])
            dividers = renderer.split_row(lines[cursor + 1])
            rows: list[list[str]] = []
            cursor += 2
            while cursor < len(lines) and lines[cursor].startswith("|"):
                rows.append(renderer.split_row(lines[cursor]))
                cursor += 1
            return header, dividers, rows
    raise ValueError(f"marker not found: {marker!r}")


def card_html(item: dict, table_html: str) -> str:
    return f"""<div class="shot" id="{item['id']}">
  <section class="card">
    <p class="eyebrow">Newcastle weekly poster corpus</p>
    <h1>{html.escape(item['title'])}</h1>
    <p class="sub">{html.escape(item['subtitle'])}</p>
    {table_html}
    <p class="foot">Source: researchData/events.json · 1,245 listings from 266 images · refreshed 14 Nov 2026</p>
  </section>
</div>"""


STYLE = """
:root {
  --bg: #f3f0e7;
  --card: #fffdf8;
  --text: #1c2a2e;
  --muted: #5d696d;
  --border: #d7d0bf;
  --row: #f8f5ed;
  --accent: #0f766e;
  --accent-soft: #d8efeb;
  --shadow: 0 20px 60px rgba(28, 42, 46, .10);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 32px;
}
.shot { width: max-content; padding: 28px; background: var(--bg); }
.card {
  width: 980px;
  padding: 38px 42px 30px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: var(--shadow);
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
}
h1 { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: -.025em; }
.sub { margin: 8px 0 24px; color: var(--muted); font-size: 15px; }
.table-wrap {
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible !important;
}
table { width: 100%; border-collapse: collapse; font-size: 16px; }
thead th {
  padding: 12px 14px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
  font-weight: 750;
  text-align: left;
}
tbody td { padding: 11px 14px; border-bottom: 1px solid #e6e0d2; vertical-align: top; }
tbody tr:nth-child(even) { background: var(--row); }
tbody tr:last-child td { border-bottom: 0; }
.align-right { text-align: right; font-variant-numeric: tabular-nums; }
.align-center { text-align: center; }
.foot {
  margin: 22px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}
"""


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    cards = []
    for item in TABLES:
        header, dividers, rows = extract_table(lines, item["marker"])
        table_html = renderer.render_table(header, dividers, rows)
        cards.append(card_html(item, table_html))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    preview = OUT_DIR / "preview.html"
    preview.write_text(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        "<title>Research data analysis — table images</title>"
        f"<style>{STYLE}</style></head><body>{''.join(cards)}</body></html>",
        encoding="utf-8",
    )
    print(f"wrote {preview}")


if __name__ == "__main__":
    main()
