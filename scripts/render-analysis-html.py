#!/usr/bin/env python3
"""Render specs/research-data-analysis.md as a self-contained styled HTML page.

The project has no Markdown dependency, so this uses a small renderer for the
constructs the analysis actually uses: headings, paragraphs, lists, tables,
fenced code, blockquotes, horizontal rules, and inline code/bold/italic/links.

Usage:
    python3 scripts/render-analysis-html.py
    python3 scripts/render-analysis-html.py --out /tmp/analysis.html
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "specs" / "research-data-analysis.md"
DEFAULT_OUTPUT = ROOT / "specs" / "research-data-analysis.html"

CODE_PLACEHOLDER = "\x00CODE{}\x00"


def plain_text(value: str) -> str:
    """Strip the inline Markdown needed for a heading slug."""
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[*_]", "", value)
    return value


def slugify(value: str) -> str:
    value = plain_text(value)
    value = value.replace("–", " ").replace("—", " ").replace("&", " and ")
    value = value.lower()
    value = re.sub(r"[^a-z0-9\s-]", "", value)
    value = re.sub(r"[\s_]+", "-", value).strip("-")
    return value or "section"


def unique_slug(slug: str, used: set[str]) -> str:
    candidate = slug
    index = 2
    while candidate in used:
        candidate = f"{slug}-{index}"
        index += 1
    used.add(candidate)
    return candidate


def inline(value: str) -> str:
    """Escape HTML and apply the inline Markdown used in the document."""
    value = html.escape(value, quote=False)

    codes: list[str] = []

    def keep_code(match: re.Match[str]) -> str:
        codes.append(f"<code>{match.group(1)}</code>")
        return CODE_PLACEHOLDER.format(len(codes) - 1)

    value = re.sub(r"`([^`]+)`", keep_code, value)

    def link(match: re.Match[str]) -> str:
        label, href = match.group(1), match.group(2)
        return f'<a href="{href}">{label}</a>'

    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", value)
    value = re.sub(r"\*(.+?)\*", r"<em>\1</em>", value)

    for index, code in enumerate(codes):
        value = value.replace(CODE_PLACEHOLDER.format(index), code)
    return value


def split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def is_divider(line: str) -> bool:
    return bool(re.fullmatch(r"\s*\|?[\s:|-]+\|?\s*", line)) and "-" in line


def is_table_start(lines: list[str], index: int) -> bool:
    return (
        index + 1 < len(lines)
        and "|" in lines[index]
        and "|" in lines[index + 1]
        and is_divider(lines[index + 1])
    )


def alignment(cell: str) -> str:
    left, right = cell.startswith(":"), cell.endswith(":")
    if left and right:
        return "center"
    if right:
        return "right"
    if left:
        return "left"
    return ""


def render_table(header: list[str], dividers: list[str], rows: list[list[str]]) -> str:
    aligns = [alignment(cell) for cell in dividers]
    parts = ['<div class="table-wrap"><table>', "<thead><tr>"]
    for cell, align in zip(header, aligns):
        css = f' class="align-{align}"' if align else ""
        parts.append(f'<th scope="col"{css}>{inline(cell)}</th>')
    parts.append("</tr></thead><tbody>")
    for row in rows:
        row = row + [""] * (len(header) - len(row))
        parts.append("<tr>")
        for cell, align in zip(row[: len(header)], aligns):
            css = f' class="align-{align}"' if align else ""
            parts.append(f"<td{css}>{inline(cell)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></div>")
    return "".join(parts)


def is_block_start(lines: list[str], index: int) -> bool:
    line = lines[index]
    stripped = line.lstrip()
    return bool(
        re.match(r"^#{1,6}\s+", line)
        or stripped.startswith("```")
        or stripped.startswith(">")
        or re.match(r"^\s*---+\s*$", line)
        or re.match(r"^\s*([-*]|\d+\.)\s+", line)
        or is_table_start(lines, index)
    )


def render_list(lines: list[str], index: int) -> tuple[str, int]:
    ordered = bool(re.match(r"^\s*\d+\.\s+", lines[index]))
    pattern = r"^\s*\d+\.\s+" if ordered else r"^\s*[-*]\s+"
    tag = "ol" if ordered else "ul"
    items: list[str] = []

    while index < len(lines):
        match = re.match(pattern, lines[index])
        if not match:
            break
        item = lines[index][match.end() :].strip()
        index += 1
        while (
            index < len(lines)
            and lines[index].strip()
            and not re.match(r"^\s*([-*]|\d+\.)\s+", lines[index])
            and not is_block_start(lines, index)
        ):
            item += " " + lines[index].strip()
            index += 1
        items.append(item)
        if index < len(lines) and not lines[index].strip():
            lookahead = index
            while lookahead < len(lines) and not lines[lookahead].strip():
                lookahead += 1
            if lookahead < len(lines) and re.match(pattern, lines[lookahead]):
                index = lookahead
                continue
            break

    body = "".join(f"<li>{inline(item)}</li>" for item in items)
    return f"<{tag}>{body}</{tag}>", index


def render(markdown: str) -> tuple[str, str, list[tuple[int, str, str]], str]:
    lines = markdown.splitlines()
    body: list[str] = []
    toc: list[tuple[int, str, str]] = []
    used_slugs: set[str] = set()
    title = "Research data analysis"
    subtitle = "What the posters actually show"
    index = 0

    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue

        stripped = line.lstrip()

        if stripped.startswith("```"):
            language = stripped[3:].strip()
            index += 1
            code: list[str] = []
            while index < len(lines) and not lines[index].lstrip().startswith("```"):
                code.append(lines[index])
                index += 1
            if index < len(lines):
                index += 1
            css = f' class="language-{html.escape(language)}"' if language else ""
            body.append(f"<pre><code{css}>{html.escape(chr(10).join(code))}</code></pre>")
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2).strip()
            if level == 1:
                parts = re.split(r"\s+[—–-]\s+", text, maxsplit=1)
                title = parts[0].strip()
                subtitle = parts[1].strip() if len(parts) > 1 else subtitle
            else:
                slug = unique_slug(slugify(text), used_slugs)
                body.append(f'<h{level} id="{slug}">{inline(text)}</h{level}>')
                if level in (2, 3):
                    toc.append((level, slug, inline(text)))
            index += 1
            continue

        if re.match(r"^\s*---+\s*$", line):
            body.append("<hr>")
            index += 1
            continue

        if stripped.startswith(">"):
            quote: list[str] = []
            while index < len(lines) and lines[index].lstrip().startswith(">"):
                value = lines[index].lstrip()[1:]
                if value.startswith(" "):
                    value = value[1:]
                quote.append(value.strip())
                index += 1
            body.append(f"<blockquote><p>{inline(' '.join(quote))}</p></blockquote>")
            continue

        if is_table_start(lines, index):
            header = split_row(lines[index])
            dividers = split_row(lines[index + 1])
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].strip() and "|" in lines[index]:
                rows.append(split_row(lines[index]))
                index += 1
            body.append(render_table(header, dividers, rows))
            continue

        if re.match(r"^\s*([-*]|\d+\.)\s+", line):
            rendered, index = render_list(lines, index)
            body.append(rendered)
            continue

        paragraph: list[str] = []
        while index < len(lines) and lines[index].strip() and not is_block_start(lines, index):
            paragraph.append(lines[index].strip())
            index += 1

        text = " ".join(paragraph)
        if re.fullmatch(r"\*\*.+\*\*", text):
            body.append(f'<h4 class="minor-heading">{inline(text[2:-2])}</h4>')
        else:
            body.append(f"<p>{inline(text)}</p>")

    return title, subtitle, toc, "\n".join(body)


def render_toc(toc: list[tuple[int, str, str]]) -> str:
    items = ['<li class="toc-top"><a href="#top">Top</a></li>']
    for level, slug, text in toc:
        css = ' class="toc-h3"' if level == 3 else ""
        items.append(f'<li{css}><a href="#{slug}">{text}</a></li>')
    return "<ul>" + "".join(items) + "</ul>"


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Research data analysis of the Newcastle weekly poster corpus.">
<title>__TITLE__ — __SUBTITLE__</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #f3f0e7;
  --surface: #fffdf8;
  --surface-2: #eae4d5;
  --text: #1c2a2e;
  --muted: #5d696d;
  --border: #d7d0bf;
  --accent: #0f766e;
  --accent-soft: #d8efeb;
  --accent-2: #a14f08;
  --shadow: 0 12px 40px rgba(28, 42, 46, .08);
  --radius: 16px;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1518;
    --surface: #172126;
    --surface-2: #1f2d33;
    --text: #e8eef1;
    --muted: #a6b3ba;
    --border: #2c3b43;
    --accent: #5eead4;
    --accent-soft: #123b38;
    --accent-2: #fbbf24;
    --shadow: 0 12px 40px rgba(0, 0, 0, .35);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, .10), transparent 38%),
    radial-gradient(circle at top right, rgba(161, 79, 8, .08), transparent 34%),
    var(--bg);
  font-family: var(--sans);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
a { color: var(--accent); text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
a:focus-visible, .toc a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hero {
  padding: 4.5rem 1.5rem 2.75rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, rgba(15, 118, 110, .10), rgba(161, 79, 8, .06));
}
.hero-inner { max-width: 1180px; margin: 0 auto; }
.eyebrow {
  margin: 0 0 .6rem;
  color: var(--accent);
  font-size: .74rem;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4.5vw, 3.6rem);
  line-height: 1.05;
  letter-spacing: -.035em;
}
.hero h1 span { display: block; margin-top: .35rem; color: var(--muted); font-weight: 500; font-size: .62em; letter-spacing: -.02em; }
.dek { max-width: 62ch; margin: 1rem 0 0; color: var(--muted); font-size: 1.08rem; }
.hero-links { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; margin: 1.25rem 0 0; font-size: .92rem; }
.hero-links a { font-weight: 650; text-decoration: none; }
.hero-links a:hover { text-decoration: underline; }
.layout {
  display: grid;
  grid-template-columns: 265px minmax(0, 1fr);
  gap: 2.5rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}
.toc { position: sticky; top: 1.25rem; align-self: start; max-height: calc(100vh - 2.5rem); overflow: auto; }
.toc-inner {
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.toc-title {
  margin: 0 0 .65rem;
  color: var(--muted);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.toc ul { margin: 0; padding: 0; list-style: none; font-size: .88rem; line-height: 1.4; }
.toc li { margin: .1rem 0; }
.toc a { display: block; padding: .22rem .4rem; border-radius: 7px; color: var(--muted); text-decoration: none; }
.toc a:hover, .toc a.active { color: var(--accent); background: var(--accent-soft); }
.toc .toc-h3 { padding-left: .85rem; font-size: .82rem; }
.toc .toc-top a { color: var(--accent-2); font-weight: 700; }
.content { min-width: 0; max-width: 920px; }
.content h2 {
  margin: 3rem 0 1rem;
  padding-top: .6rem;
  border-top: 1px solid var(--border);
  font-size: 1.7rem;
  line-height: 1.2;
  letter-spacing: -.025em;
  scroll-margin-top: 1.5rem;
}
.content h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.content h3 {
  margin: 2rem 0 .75rem;
  color: var(--accent-2);
  font-size: 1.18rem;
  letter-spacing: -.01em;
  scroll-margin-top: 1.5rem;
}
.content h4.minor-heading {
  margin: 2rem 0 .6rem;
  color: var(--accent-2);
  font-size: .82rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.content p, .content li { max-width: 74ch; }
.content p { margin: 0 0 1rem; }
.content strong { font-weight: 750; }
.content em { color: var(--muted); }
.content ul, .content ol { margin: 0 0 1.2rem; padding-left: 1.4rem; }
.content li { margin: .35rem 0; }
.content blockquote {
  max-width: 74ch;
  margin: 1.5rem 0;
  padding: 1rem 1.2rem;
  border-left: 4px solid var(--accent);
  border-radius: 0 var(--radius) var(--radius) 0;
  background: var(--accent-soft);
}
.content blockquote p { margin: 0; }
.content hr { margin: 2.5rem 0; border: 0; border-top: 1px solid var(--border); }
.content code {
  padding: .12em .34em;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: .88em;
}
.content pre {
  margin: 1.5rem 0;
  padding: 1rem 1.2rem;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  box-shadow: var(--shadow);
  line-height: 1.5;
}
.content pre code { padding: 0; border: 0; background: none; font-size: .86rem; }
.table-wrap {
  margin: 1.5rem 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
thead th {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 750;
  text-align: left;
  white-space: nowrap;
}
th, td { padding: .62rem .8rem; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-2) 45%, var(--surface)); }
tbody tr:hover { background: var(--accent-soft); }
tbody tr:last-child td { border-bottom: 0; }
.align-right { text-align: right; font-variant-numeric: tabular-nums; }
.align-center { text-align: center; }
.page-footer {
  max-width: 920px;
  margin: 3rem 0 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: .88rem;
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; gap: 1.5rem; padding-top: 1.25rem; }
  .toc { position: static; max-height: none; }
  .toc-inner { max-height: 18rem; overflow: auto; }
  .content { max-width: none; }
  .hero { padding-top: 3rem; }
}
@media (max-width: 600px) {
  .hero { padding: 2.5rem 1rem 2rem; }
  .layout { padding: 1rem 1rem 3rem; }
  .content h2 { font-size: 1.45rem; }
  table { font-size: .85rem; }
  th, td { padding: .48rem .55rem; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
@media print {
  body { background: #fff; color: #000; }
  .hero { padding: 0 0 1rem; border: 0; background: none; }
  .hero h1 { font-size: 2rem; }
  .layout { display: block; max-width: none; padding: 0; }
  .toc, .hero-links { display: none; }
  .content { max-width: none; }
  .table-wrap, pre { box-shadow: none; border: 1px solid #bbb; }
  a { color: #000; text-decoration: none; }
  h2, h3 { break-after: avoid; }
  table, pre, blockquote { break-inside: avoid; }
}
</style>
</head>
<body id="top">
<header class="hero">
  <div class="hero-inner">
    <p class="eyebrow">Newcastle weekly poster corpus</p>
    <h1>__TITLE__<span>__SUBTITLE__</span></h1>
    <p class="dek">1,245 listings from 266 images · refreshed 14 November 2026</p>
    <p class="hero-links"><a href="#direct-answers">Jump to the analysis</a><a href="research-data-analysis.md">Markdown source</a></p>
  </div>
</header>
<div class="layout">
  <nav class="toc" aria-label="Table of contents">
    <div class="toc-inner">
      <p class="toc-title">Contents</p>
      __TOC__
    </div>
  </nav>
  <main class="content">
__BODY__
    <footer class="page-footer">
      <p>Generated from <code>specs/research-data-analysis.md</code> · <a href="research-data-analysis.md">Markdown source</a> · <a href="#top">Back to top</a></p>
    </footer>
  </main>
</div>
<script>
  const links = Array.from(document.querySelectorAll('.toc a[href^="#"]'));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = '#' + entry.target.id;
        for (const link of links) link.classList.toggle('active', link.getAttribute('href') === id);
      }
    }, { rootMargin: '-18% 0px -72% 0px', threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }
</script>
</body>
</html>
"""


def build_html(title: str, subtitle: str, toc: list[tuple[int, str, str]], body: str) -> str:
    return (
        TEMPLATE.replace("__TITLE__", html.escape(title))
        .replace("__SUBTITLE__", html.escape(subtitle))
        .replace("__TOC__", render_toc(toc))
        .replace("__BODY__", body)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", default=str(DEFAULT_INPUT))
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    source = Path(args.input).read_text(encoding="utf-8")
    title, subtitle, toc, body = render(source)
    output = build_html(title, subtitle, toc, body)
    Path(args.out).write_text(output, encoding="utf-8")
    print(f"wrote {args.out} ({len(output):,} bytes, {len(toc)} sections)")


if __name__ == "__main__":
    main()
