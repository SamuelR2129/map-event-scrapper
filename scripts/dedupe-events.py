#!/usr/bin/env python3
"""Merge event files and drop duplicate rows sharing eventName + eventDateTime.

Rows are grouped by ``(eventName, eventDateTime)``. Within a group, copies that
name the same venue are collapsed into one row; copies that name genuinely
different venues are kept apart, because two listings with the same title on the
same night at different venues are different events (``Jazz Night`` runs at both
Lass O'Gowrie and The Underground). Pass ``--strict`` to ignore the venue and
collapse every row with the same name and timestamp.

When duplicates are collapsed the richest row is kept (most non-empty fields),
missing fields are filled from the other copies, and promoter credits are
unioned.

Usage:
    # dedupe the merged file in place
    python3 scripts/dedupe-events.py researchData/events.json --out researchData/events.json

    # or merge several dumps and dedupe at the same time
    python3 scripts/dedupe-events.py researchData/events-*.json --out researchData/events.json

Inputs may be either an object with an ``events`` list (the research-data
format) or a bare JSON list. ``processedImages`` arrays are unioned. Output
goes to stdout unless ``--out`` is given.
"""

import argparse
import json
import sys

FILL_FIELDS = (
    "venueName",
    "venueAddress",
    "lngLat",
    "ticketCost",
    "genres",
    "eventPromoters",
    "venueLink",
    "source",
)


def load_events(path):
    with open(path) as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data, []
    return data.get("events", []), data.get("processedImages", [])


def richness(event):
    return sum(1 for value in event.values() if value not in (None, "", []))


def is_blank(value):
    return value in (None, "", []) or (
        isinstance(value, str) and value.strip().lower() in ("unknown", "unknown venue")
    )


def merge_duplicates(rows):
    """Keep the richest row, fill its gaps, and union promoter credits."""
    winner_index = max(
        range(len(rows)), key=lambda index: (richness(rows[index]), -index)
    )
    merged = dict(rows[winner_index])

    for field in FILL_FIELDS:
        if is_blank(merged.get(field)):
            for row in rows:
                if not is_blank(row.get(field)):
                    merged[field] = row[field]
                    break

    promoters = []
    seen = set()
    for row in rows:
        for promoter in (row.get("eventPromoters") or "").split(","):
            promoter = promoter.strip()
            key = promoter.lower()
            if promoter and key not in seen:
                seen.add(key)
                promoters.append(promoter)
    if promoters:
        merged["eventPromoters"] = ", ".join(promoters)
    else:
        merged.pop("eventPromoters", None)

    # Only adopt a venue every copy agrees on; a genuinely different venue is a
    # different event and is handled before this function is called.
    venues = {
        (row.get("venueName") or "").strip()
        for row in rows
        if not is_blank(row.get("venueName"))
    }
    if len(venues) == 1:
        merged["venueName"] = venues.pop()

    return merged


def dedupe(events, strict=False):
    """Drop duplicate (eventName, eventDateTime) rows, preserving first position."""
    order = []
    groups = {}
    for event in events:
        key = (event.get("eventName"), event.get("eventDateTime"))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(event)

    result = []
    removed = 0
    for key in order:
        rows = groups[key]
        if len(rows) == 1:
            result.append(rows[0])
            continue

        if strict:
            result.append(merge_duplicates(rows))
            removed += len(rows) - 1
            continue

        # Venue-aware: collapse same-venue copies, keep different venues apart.
        by_venue = []
        blank_rows = []
        for row in rows:
            if is_blank(row.get("venueName")):
                blank_rows.append(row)
                continue
            venue = (row.get("venueName") or "").strip().lower()
            for group in by_venue:
                if group[0] == venue:
                    group[1].append(row)
                    break
            else:
                by_venue.append((venue, [row]))

        if not by_venue:
            # Every copy is blank/Unknown: they are the same unattributed event.
            result.append(merge_duplicates(rows))
            removed += len(rows) - 1
            continue

        # Unattributed copies belong to the only named venue when there is one.
        if len(by_venue) == 1:
            by_venue[0][1].extend(blank_rows)
        else:
            for row in blank_rows:
                result.append(row)

        for _, group in by_venue:
            result.append(merge_duplicates(group) if len(group) > 1 else group[0])
            removed += len(group) - 1

    return result, removed


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Merge event JSON files and remove duplicate eventName + eventDateTime rows."
    )
    parser.add_argument("inputs", nargs="+", help="event JSON file(s) to read")
    parser.add_argument("--out", help="write here instead of stdout")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="collapse rows with the same name and timestamp even across venues",
    )
    args = parser.parse_args(argv)

    events = []
    processed = set()
    for path in args.inputs:
        loaded, images = load_events(path)
        events.extend(loaded)
        processed.update(images)

    deduped, removed = dedupe(events, strict=args.strict)
    payload = {"processedImages": sorted(processed), "events": deduped}

    if args.out:
        with open(args.out, "w") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
    else:
        json.dump(payload, sys.stdout, indent=2)
        sys.stdout.write("\n")

    mode = "strict name + timestamp" if args.strict else "name + timestamp + venue"
    print(
        f"{len(events)} events from {len(args.inputs)} file(s) -> "
        f"{len(deduped)} unique ({removed} duplicate row(s) removed; {mode})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
