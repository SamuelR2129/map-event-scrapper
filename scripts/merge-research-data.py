#!/usr/bin/env python3
"""
Merge researchData/events-*.json dumps into one de-duplicated event file.

Each `npm run research` run writes only the rows it extracted that day, so a
corpus that spans several runs has to be merged before it can be analysed as a
whole.

De-duplication happens in four passes:

1. by `id` — a later dump that re-writes the same event wins;
2. by `(eventDateTime, eventName)` — a group of rows that describe the same
   event on the same night. Date alone is not enough (a poster's rows all share
   one timestamp), and event name alone is not enough (``Jazz Night`` legitimately
   runs at two venues), so within a group the venue decides;
3. within a group, rows are clustered by venue similarity, matching address, or
   matching coordinates. This catches the common extraction failures:
   ``Grindhouse - Croatian Club Side Room`` vs ``Croatian Club`` vs
   ``Croatian Wickham Sports Club``, ``The Oak`` vs ``The Oak Hotel``,
   ``Ori Hotel`` vs ``The Oriental Hotel``. Rows whose venue is blank, ``Unknown``
   or actually a promoter (``New Brain Communications``) join the only known
   venue in their group;
4. across the output, rows on the same night at the same venue whose names are
   the same bill — one truncated (``Mi-Sex, Krisp`` vs the full line-up) or one
   misspelled word (``Aperitivo`` / ``Apertivo``) — collapse too.

When duplicates disagree, the richest row wins: one with a promoter, then
coordinates, then an address, then the most non-empty fields. Missing fields are
filled from the other copies and promoter credits are unioned.

Usage:
    # the per-date dumps were consolidated on 2026-11-14; pass any new dumps explicitly
    python3 scripts/merge-research-data.py path/to/new-dumps/*.json > researchData/events.json
    python3 scripts/dedupe-events.py researchData/events.json --out researchData/events.json
    python3 scripts/research-data-analysis.py researchData/events.json
"""

import glob
import json
import os
import re
import sys
from datetime import datetime
from difflib import SequenceMatcher

# Promoter spellings the model returns inconsistently. Keys are lowercase; the
# value is the canonical credit written to the merged file.
PROMOTER_ALIASES = {
    "kova": "Kova Events",
    "ode": "Ode",
    "sirocco": "Sirocco",
    "c.t": "C.T.",
    "c.t.": "C.T.",
    "made on sunday": "Made On Sunday",
}

# Venue values that are actually promoter names. A bare promoter leaves the
# venue unknown; "Sirocco Meantime" means Sirocco at Meantime.
PROMOTER_ONLY_VENUES = {
    "ode": ("Unknown", "Ode"),
    "sirocco": ("Unknown", "Sirocco"),
    "sirocco meantime": ("Meantime", "Sirocco"),
    "made on sunday": ("Unknown", "Made On Sunday"),
}

STREET_ALIASES = {
    "st": "street",
    "rd": "road",
    "ave": "avenue",
    "av": "avenue",
    "hwy": "highway",
    "dr": "drive",
    "ln": "lane",
    "pl": "place",
    "pde": "parade",
    "cres": "crescent",
    "nth": "north",
    "sth": "south",
}

UNKNOWN_VENUES = {"", "unknown", "unknown venue", "tba", "tbc", "various"}

SEGMENT_SEPARATOR = " - "
PRICE_SEGMENT = re.compile(r"^(?:a?\$?\s*\d+(?:[.,]\d+)?|free)$", re.IGNORECASE)


def normalise(value):
    text = (value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\bthe\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def expand(text):
    return " ".join(STREET_ALIASES.get(word, word) for word in text.split())


def venue_key(value):
    return expand(normalise(value))


def address_key(value):
    text = normalise(value)
    text = re.sub(r"\baustralia\b", " ", text)
    return expand(re.sub(r"\s+", " ", text).strip())


def coord_key(value):
    if not isinstance(value, list) or len(value) < 2:
        return None
    try:
        return (round(float(value[0]), 3), round(float(value[1]), 3))
    except (TypeError, ValueError):
        return None


def split_venue(value):
    """Return ``(venue, promoter)`` from a possibly promoter-prefixed venue."""
    venue, promoter = _split_venue(value)
    raw_key = re.sub(r"\s+", " ", (venue or "").strip().lower())
    mapped = PROMOTER_ONLY_VENUES.get(raw_key)
    if not mapped and not raw_key.startswith("the "):
        mapped = PROMOTER_ONLY_VENUES.get(venue_key(venue))
    if mapped:
        venue, mapped_promoter = mapped
        promoter = promoter or mapped_promoter
    return venue, promoter


def _split_venue(value):
    text = (value or "").replace("\u2019", "'").strip()
    if SEGMENT_SEPARATOR not in text:
        return text, None

    segments = [part.strip() for part in text.split(SEGMENT_SEPARATOR) if part.strip()]
    if len(segments) > 1 and PRICE_SEGMENT.match(segments[-1]):
        segments.pop()
    if len(segments) < 2:
        return SEGMENT_SEPARATOR.join(segments) or text, None

    # "Primitive Moth, Grindhouse - Croatian Sports Club" is a lineup, not a
    # promoter, so only split when the left side has no comma.
    if "," in segments[0]:
        return SEGMENT_SEPARATOR.join(segments), None

    return segments[-1], segments[0]


def canonicalise_promoters(value):
    parts = []
    seen = set()
    for part in (value or "").split(","):
        promoter = part.strip()
        if not promoter:
            continue
        promoter = PROMOTER_ALIASES.get(promoter.lower(), promoter)
        key = promoter.lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(promoter)
    return ", ".join(parts) or None


def token_match(a, b):
    return a == b or (len(a) >= 3 and len(b) >= 3 and (a.startswith(b) or b.startswith(a)))


def is_sublist(small, large, minimum=3):
    if len(small) > len(large):
        small, large = large, small
    if len(small) < minimum:
        return False
    for start in range(len(large) - len(small) + 1):
        if large[start : start + len(small)] == small:
            return True
    return False


def numbers(tokens):
    return sorted(token for token in tokens if token.isdigit())


def split_acts(value):
    """Split a bill into acts and normalise each act to a token list."""
    acts = []
    for part in re.split(r"[,;]|(?:\s+\+\s+)", (value or "").lower().replace("&", " and ")):
        tokens = [
            token
            for token in re.sub(r"[^a-z0-9 ]", " ", part).split()
            if token and token != "the"
        ]
        if tokens:
            acts.append(tokens)
    return acts


def act_matches(left, right):
    """True when two acts are the same name, allowing an abbreviation.

    ``T.P.S`` and ``Ten Pack Screwdriver`` both compress to ``tps``.
    """
    left_compact, right_compact = "".join(left), "".join(right)
    if left == right or left_compact == right_compact:
        return True
    left_initials = "".join(token[0] for token in left)
    right_initials = "".join(token[0] for token in right)
    if left_initials == right_compact or right_initials == left_compact:
        return True
    return is_sublist(left, right, 2) or is_sublist(right, left, 2)


def similar_event_name(a, b):
    """True when two names are the same bill, not two different bills.

    Line-ups get re-extracted truncated (``Mi-Sex, Krisp`` for the full bill),
    single words get misread (``Aperitivo`` / ``Apertivo``) and acts get
    abbreviated (``T.P.S`` / ``Ten Pack Screwdriver``), so compare token
    sequences and individual acts rather than raw strings. Differing numbers
    always win: ``Frequency Forest Day 2`` and ``Day 3`` are not the same bill.
    """
    left, right = normalise(a).split(), normalise(b).split()
    if not left or not right:
        return False
    if left == right or is_sublist(left, right, 2) or is_sublist(right, left, 2):
        return True
    if numbers(left) != numbers(right):
        return False

    left_acts, right_acts = split_acts(a), split_acts(b)
    if len(left_acts) >= 2 and len(left_acts) == len(right_acts):
        remaining = list(right_acts)
        for act in left_acts:
            for index, other in enumerate(remaining):
                if act_matches(act, other):
                    remaining.pop(index)
                    break
            else:
                break
        else:
            return True

    return SequenceMatcher(None, " ".join(left), " ".join(right)).ratio() >= 0.85


def overlapping_bill(a, b):
    """True when two same-night bills share most of their acts.

    Two extractions of one line-up can disagree on the last act
    (``Feign, Retrograde, Mudfly, Arietta, Ryan Patrick Daley`` vs
    ``Wartime, Feign, Retrograde, Mudfly, Arietta``); four shared acts on the
    same night at the same venue is the same listing, not two shows.
    """
    left, right = set(normalise(a).split()), set(normalise(b).split())
    if not left or not right or numbers(left) != numbers(right):
        return False
    shared = len(left & right)
    return shared >= 4 and shared / len(left | right) >= 0.5


def price_value(value):
    if value in (None, "", "undefined"):
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return str(value).strip().lower()


def genre_set(value):
    return {
        genre.strip().upper()
        for genre in (value or "").split(",")
        if genre.strip() and genre.strip().upper() != "FREE"
    }


def same_listing_details(left, right):
    """True when price and genres are compatible enough to be one listing."""
    left_price = price_value(left.get("ticketCost"))
    right_price = price_value(right.get("ticketCost"))
    if left_price is not None and right_price is not None and left_price != right_price:
        return False

    left_genres = genre_set(left.get("genres"))
    right_genres = genre_set(right.get("genres"))
    if left_genres and right_genres:
        return left_genres <= right_genres or right_genres <= left_genres
    return True


RECURRING_WORDS = {
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "mondays",
    "tuesdays",
    "wednesdays",
    "thursdays",
    "fridays",
    "saturdays",
    "sundays",
    "mon",
    "tue",
    "tues",
    "wed",
    "thu",
    "thur",
    "thurs",
    "fri",
    "sat",
    "sun",
    "night",
    "nights",
    "decks",
    "vinyl",
    "dj",
    "djs",
    "session",
    "sessions",
    "club",
    "residency",
    "weekly",
    "every",
    "presents",
    "rooftop",
}


def looks_recurring(name):
    """True when a name reads like a weekly residency rather than a one-off."""
    return bool(set(normalise(name).split()) & RECURRING_WORDS)


def parse_datetime(value):
    try:
        return datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def similar_venue(a, b):
    if not a or not b:
        return False
    if a == b:
        return True

    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if f" {shorter} " in f" {longer} ":
        return True

    left, right = set(a.split()), set(b.split())
    matched = sum(1 for token in left if any(token_match(token, other) for other in right))
    overlap = matched / len(left | right)
    if overlap >= 0.5 or SequenceMatcher(None, a, b).ratio() >= 0.82:
        return True

    # A short venue name that is entirely a prefix/token of the longer one:
    # "Ori" vs "Oriental Hotel", "The Prince" vs "Prince of Wales Hotel".
    small, large = (left, right) if len(left) <= len(right) else (right, left)
    return all(any(token_match(token, other) for other in large) for token in small)


def rank(event, order, venue_counts=None):
    venue = venue_key(split_venue(event.get("venueName"))[0])
    return (
        1 if (event.get("eventPromoters") or "").strip() else 0,
        1 if event.get("lngLat") else 0,
        1 if (event.get("venueAddress") or "").strip() else 0,
        sum(1 for value in event.values() if value not in (None, "", [])),
        len(event.get("eventName") or ""),
        (venue_counts or {}).get(venue, 0),
        order,
    )


def cluster_rows(rows):
    """Group the rows of one (date, event name) into distinct events by venue."""
    count = len(rows)
    parent = list(range(count))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left, right):
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    venues = [split_venue(row.get("venueName"))[0] for row in rows]
    keys = [venue_key(venue) for venue in venues]
    addresses = [address_key(row.get("venueAddress")) for row in rows]
    coords = [coord_key(row.get("lngLat")) for row in rows]

    promoter_keys = set()
    for row in rows:
        for promoter in (row.get("eventPromoters") or "").split(","):
            if promoter.strip():
                promoter_keys.add(venue_key(promoter))
        _, prefix = split_venue(row.get("venueName"))
        if prefix:
            promoter_keys.add(venue_key(prefix))

    def is_wildcard(index):
        key = keys[index]
        return not key or key in UNKNOWN_VENUES or key in promoter_keys

    for i in range(count):
        for j in range(i + 1, count):
            if keys[i] and keys[j] and similar_venue(keys[i], keys[j]):
                union(i, j)
            elif addresses[i] and addresses[i] == addresses[j]:
                union(i, j)
            elif coords[i] and coords[i] == coords[j]:
                union(i, j)

    groups = {}
    for index in range(count):
        groups.setdefault(find(index), []).append(index)

    known = {root: members for root, members in groups.items() if any(not is_wildcard(i) for i in members)}
    wild = [index for index in range(count) if is_wildcard(index)]

    # An unattributed "Unknown" row is the same event when its group resolves to
    # a single real venue. With two real venues (e.g. Jazz Night) leave it alone.
    if wild and len(known) <= 1:
        root = next(iter(known)) if known else wild[0]
        for index in wild:
            union(index, root)

    final = {}
    for index in range(count):
        final.setdefault(find(index), []).append(index)
    return list(final.values())


def merge_similar_events(events):
    """Collapse rows that describe the same listing.

    The (date, event name) pass cannot catch the extraction failures where the
    names differ, so this pass catches:

    * the same night and venue, same bill, extracted twice — a truncated tail,
      a misspelled or abbreviated act, a generic title beside a titled one, or
      a line-up that disagrees on its last act;
    * the same night and bill at two venues, which is one listing with a
      misread venue — only when the price and genres also agree;
    * the same bill at the same venue a day or two apart, which is one poster
      seen by two scrape runs;
    * the same specific bill at the same venue exactly a week apart when it
      appears only twice — a one-off tour poster picked up by consecutive
      weekly scrapes — while leaving weekly residencies alone.
    """
    count = len(events)
    parent = list(range(count))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left, right):
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    dates = [parse_datetime(event.get("eventDateTime")) for event in events]
    names = [normalise(event.get("eventName")) for event in events]
    venues = [venue_key(split_venue(event.get("venueName"))[0]) for event in events]

    frequency = {}
    for index, venue in enumerate(venues):
        if venue:
            key = (names[index], venue)
            frequency[key] = frequency.get(key, 0) + 1

    venue_counts = {}
    for venue in venues:
        if venue:
            venue_counts[venue] = venue_counts.get(venue, 0) + 1

    # Same night: compare every pair of rows from that night.
    by_day = {}
    for index, event in enumerate(events):
        day = (event.get("eventDateTime") or "")[:10]
        if day:
            by_day.setdefault(day, []).append(index)

    for indices in by_day.values():
        for offset, left in enumerate(indices):
            for right in indices[offset + 1 :]:
                if venues[left] and venues[right] and similar_venue(venues[left], venues[right]):
                    if similar_event_name(
                        events[left].get("eventName"), events[right].get("eventName")
                    ) or overlapping_bill(
                        events[left].get("eventName"), events[right].get("eventName")
                    ):
                        union(left, right)
                elif (
                    names[left]
                    and names[left] == names[right]
                    and len(split_acts(events[left].get("eventName"))) >= 2
                    and same_listing_details(events[left], events[right])
                ):
                    # Same bill, same night, different venue: the venue drifted
                    # in extraction and price/genres confirm it is one listing.
                    union(left, right)

    # Same venue, a few days apart.
    by_venue = {}
    for index, venue in enumerate(venues):
        if venue:
            by_venue.setdefault(venue, []).append(index)

    for indices in by_venue.values():
        for offset, left in enumerate(indices):
            for right in indices[offset + 1 :]:
                if not dates[left] or not dates[right]:
                    continue
                gap = abs((dates[left] - dates[right]).total_seconds())
                if gap == 0:
                    continue

                if gap <= 3 * 86400:
                    if names[left] == names[right]:
                        union(left, right)
                    continue

                if gap > 7.5 * 86400:
                    continue
                # A week apart: only collapse a specific bill that appears
                # exactly twice. Weekly residencies appear every week.
                if names[left] != names[right]:
                    continue
                if frequency.get((names[left], venues[left]), 0) != 2:
                    continue
                if looks_recurring(events[left].get("eventName")):
                    continue
                if (
                    len(split_acts(events[left].get("eventName"))) < 2
                    and len(names[left].split()) < 3
                ):
                    continue
                union(left, right)

    clusters = {}
    for index in range(count):
        clusters.setdefault(find(index), []).append(index)

    return [
        merge_cluster([events[i] for i in cluster], [0] * len(cluster), venue_counts)
        for cluster in clusters.values()
    ]


def merge_cluster(rows, orders, venue_counts=None):
    winner_index = max(
        range(len(rows)), key=lambda i: rank(rows[i], orders[i], venue_counts)
    )
    merged = dict(rows[winner_index])

    for field in ("flags", "curatedVenue"):
        merged.pop(field, None)

    # Union every promoter credit, including ones that leaked into venueName.
    promoter_values = []
    for row in rows:
        if (row.get("eventPromoters") or "").strip():
            promoter_values.append(row["eventPromoters"])
        _, prefix = split_venue(row.get("venueName"))
        if prefix:
            promoter_values.append(prefix)
    promoter = canonicalise_promoters(", ".join(promoter_values))
    if promoter:
        merged["eventPromoters"] = promoter
    else:
        merged.pop("eventPromoters", None)

    # Prefer a real venue over a blank/Unknown/leaked-promoter value.
    display_venue = split_venue(merged.get("venueName"))[0]
    if venue_key(display_venue) in UNKNOWN_VENUES:
        candidates = [
            split_venue(row.get("venueName"))[0]
            for row in rows
            if venue_key(split_venue(row.get("venueName"))[0]) not in UNKNOWN_VENUES
        ]
        if candidates:
            display_venue = candidates[0]
    if display_venue:
        merged["venueName"] = display_venue

    for field in ("venueAddress", "lngLat", "ticketCost", "genres", "venueLink"):
        if merged.get(field) in (None, "", []):
            for row in rows:
                if row.get(field) not in (None, "", []):
                    merged[field] = row[field]
                    break

    return merged


def merge_paths(paths):
    """Merge the given dump files. Returns ``(events, processed_images, stats)``."""
    # Pass 1: collapse the same id, later dumps win.
    by_id = {}
    processed = set()
    for order, path in enumerate(paths):
        with open(path) as fh:
            data = json.load(fh)
        for event in data.get("events", []):
            key = event.get("id") or f"{path}#{order}"
            by_id[key] = (order, event)
        processed.update(data.get("processedImages", []))

    # Pass 2: group the same event on the same night, then split by venue.
    groups = {}
    for order, event in by_id.values():
        key = (event.get("eventDateTime") or "", normalise(event.get("eventName")))
        groups.setdefault(key, []).append((order, event))

    events = []
    for group in groups.values():
        orders = [order for order, _ in group]
        rows = [event for _, event in group]
        for cluster in cluster_rows(rows):
            events.append(
                merge_cluster([rows[i] for i in cluster], [orders[i] for i in cluster])
            )

    before_similarity = len(events)
    events = merge_similar_events(events)

    stats = {
        "files": len(paths),
        "unique_ids": len(by_id),
        "events": len(events),
        "dropped": len(by_id) - len(events),
        "similarity_merges": before_similarity - len(events),
    }
    return events, processed, stats


def main(argv):
    if not argv:
        sys.exit(
            "usage: merge-research-data.py <events.json> [more.json ...] > out.json"
        )

    paths = []
    for arg in argv:
        matches = sorted(glob.glob(arg))
        if not matches and not os.path.exists(arg):
            sys.exit(f"no event files matched {arg!r}")
        paths.extend(matches or [arg])

    events, processed, stats = merge_paths(paths)
    print(
        f"merged {stats['files']} file(s): {stats['unique_ids']} unique ids -> "
        f"{stats['events']} events ({stats['dropped']} duplicate row(s) removed; "
        f"{stats['similarity_merges']} by near-identical name on the same night and "
        "venue)",
        file=sys.stderr,
    )
    json.dump(
        {"processedImages": sorted(processed), "events": events},
        sys.stdout,
        indent=2,
    )


if __name__ == "__main__":
    main(sys.argv[1:])
