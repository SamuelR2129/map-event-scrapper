#!/usr/bin/env python3
"""Extract every table from the research-data analysis into JSON.

Writes specs/table-images/tables.json, which
scripts/screenshot-table-images.mjs renders as wrapped-style PNGs
(black ground, monospace, white 1px grid, amber top row).

Tables are numbered in document order and deduplicated by content, so the
repeated summary tables at the end of the report produce one image each.
"""

from __future__ import annotations

import json
import re
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "specs" / "table-images"
SOURCE = ROOT / "specs" / "research-data-analysis.md"

renderer = SourceFileLoader(
    "analysis_renderer", str(ROOT / "scripts" / "render-analysis-html.py")
).load_module()

NUMERIC_CELL = re.compile(r"^[-–—$0-9.,%\s]+$")
SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def plain(value: str) -> str:
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = value.replace("**", "").replace("*", "")
    return value.strip()


def slug(value: str) -> str:
    value = plain(value).lower().replace("&", " and ")
    value = SLUG_STRIP.sub("-", value).strip("-")
    words: list[str] = []
    for word in value.split("-"):
        if not word:
            continue
        if len("-".join(words + [word])) > 34:
            break
        words.append(word)
    return "-".join(words) or "table"


def is_divider(line: str) -> bool:
    return bool(re.fullmatch(r"\s*\|[\s:|-]+\|\s*", line)) and "-" in line


def heading_text(line: str) -> str:
    text = re.sub(r"^#{1,6}\s+", "", line)
    text = re.sub(r"^\d+\.\s*", "", text)
    return plain(text)


def is_numeric(column: list[str]) -> bool:
    cells = [c for c in column if c and c not in {"—", "-", "–"}]
    if not cells:
        return False
    return all(NUMERIC_CELL.match(c) and any(ch.isdigit() for ch in c) for c in cells)


CHAR_PX = 9.6          # JetBrains Mono at 16px
CELL_PADDING = 22
TOTAL_PX = 998         # 1000px table minus its two 1px borders
RANK_CAP = 68
MIN_COL = 46


def column_widths(header: list[str], rows: list[list[str]]) -> list[int]:
    """Content-proportional widths that always sum to the table width."""
    longest = [max(1, len(text)) for text in header]
    for row in rows:
        for index, cell in enumerate(row[: len(header)]):
            longest[index] = max(longest[index], len(cell))

    need = [max(MIN_COL, length * CHAR_PX + CELL_PADDING) for length in longest]
    width = [value * TOTAL_PX / sum(need) for value in need]

    # Keep the rank column from ballooning on tables with short numeric columns.
    for index, text in enumerate(header):
        if text in {"#", "Rank"} and width[index] > RANK_CAP:
            spare = width[index] - RANK_CAP
            width[index] = RANK_CAP
            others = [i for i in range(len(width)) if i != index]
            pool = sum(width[i] for i in others)
            for i in others:
                width[i] += spare * width[i] / pool

    snapped = [int(round(value)) for value in width]
    snapped[-1] += TOTAL_PX - sum(snapped)
    return snapped


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    tables: list[dict] = []
    seen: set[tuple] = set()
    section = "Research data analysis"
    section_count = 0
    last_heading_index = -1

    index = 0
    while index < len(lines) - 1:
        line = lines[index]
        if line.startswith("#"):
            if index > last_heading_index:
                section = heading_text(line)
                section_count = 0
                last_heading_index = index
            index += 1
            continue

        if not (line.startswith("|") and is_divider(lines[index + 1])):
            index += 1
            continue

        header = [plain(c) for c in renderer.split_row(line)]
        cursor = index + 2
        rows: list[list[str]] = []
        while cursor < len(lines) and lines[cursor].startswith("|"):
            rows.append([plain(c) for c in renderer.split_row(lines[cursor])])
            cursor += 1

        # A label line directly above the table reads better than the heading.
        label = ""
        for back in range(index - 1, max(index - 4, -1), -1):
            candidate = lines[back].strip()
            if not candidate:
                continue
            if candidate.startswith("**"):
                label = plain(candidate)
                break
            break

        key = (tuple(header), tuple(tuple(row) for row in rows))
        if key in seen:
            index = cursor
            continue
        seen.add(key)

        section_count += 1
        title = label or section
        widths = column_widths(header, rows)

        tables.append(
            {
                "id": f"{len(tables) + 1:02d}-{slug(title)}",
                "title": title,
                "section": section,
                "header": header,
                "rows": rows,
                "widths": widths,
                "aligns": [
                    "left" if cell == "#" or not is_numeric(column)
                    else "num"
                    for cell, column in zip(
                        header,
                        [[row[i] if i < len(row) else "" for row in rows]
                         for i in range(len(header))],
                    )
                ],
            }
        )
        index = cursor

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    output = OUT_DIR / "tables.json"
    output.write_text(json.dumps(tables, indent=2) + "\n", encoding="utf-8")

    index = ["# Table images", "",
             "One PNG per table in `specs/research-data-analysis.md`, in document order.",
             "Regenerate with `npm run analysis:table-images`.", "",
             "| # | Table | Rows | Image |",
             "|---:|---|---:|---|"]
    for number, table in enumerate(tables, 1):
        index.append(
            f"| {number:02d} | {table['title']} | {len(table['rows'])} | "
            f"[{table['id']}.png](./{table['id']}.png) |"
        )
    (OUT_DIR / "index.md").write_text("\n".join(index) + "\n", encoding="utf-8")

    # Drop PNGs from earlier runs whose table title (and so id) has since changed.
    keep = {f"{table['id']}.png" for table in tables}
    for stale in OUT_DIR.glob("*.png"):
        if stale.name not in keep:
            stale.unlink()

    print(f"wrote {output} ({len(tables)} tables)")


if __name__ == "__main__":
    main()
