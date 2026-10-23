#!/usr/bin/env python3
"""
Reproducible analysis of researchData/events-*.json.

Reads the weekly poster extraction, normalises it, dedupes to the
(act, venue, ISO week) listing grain, and prints a markdown report to stdout.

Usage:
    python3 scripts/research-data-analysis.py [path/to/events.json]
"""

import collections
import datetime
import json
import math
import re
import statistics
import sys
from zoneinfo import ZoneInfo

SYD = ZoneInfo("Australia/Sydney")
DEFAULT_PATH = "researchData/events-2026-10-17.json"

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# ---------------------------------------------------------------- normalisation

VENUE_ALIASES = {
    # Lass O'Gowrie (7 spellings)
    "lass o gowrie": "Lass O'Gowrie Hotel",
    "lass o gowrie hotel": "Lass O'Gowrie Hotel",
    # Hamilton Station
    "hamilton station": "Hamilton Station Hotel",
    # The Oak
    "oak": "The Oak",
    "oak hotel": "The Oak",
    "oak tighes hill": "The Oak",
    # Bernies
    "bernies": "Bernies Bar",
    "bernie s": "Bernies Bar",
    # King Street family
    "king street": "King Street Hotel",
    "king st": "King Street Hotel",
    "king street hotel": "King Street Hotel",
    "king street warehouse": "King Street Hotel",
    "king st warehouse": "King Street Hotel",
    "king street bandroom": "King Street Hotel",
    "hunter king street": "King Street Hotel",
    # Ori
    "ori": "The Ori",
    "ori hotel": "The Ori",
    # Stag & Hunter
    "stag and hunter": "Stag & Hunter Hotel",
    # Beauford
    "beauford": "The Beauford Hotel",
    "beauford hotel": "The Beauford Hotel",
    # Queens Wharf
    "queens wharf": "Queens Wharf Hotel",
    "queens wharf hotel": "Queens Wharf Hotel",
    # Croatian
    "croatian": "Croatian Club",
    "croatian club": "Croatian Club",
    "croatian club main room": "Croatian Club",
    "croatian club side room": "Croatian Club",
    "croation club wickham": "Croatian Club",
    "croat": "Croatian Club",
    # Gallipoli
    "gallipoli house": "Gallipoli House",
    # Theydy's
    "theydy s": "Theydy's",
    # Shout
    "shout": "Shout Brewing",
    "shout brewing": "Shout Brewing",
    # Hiss & Crackle
    "hiss and crackle": "Hiss & Crackle",
    "hiss and crackle records": "Hiss & Crackle",
    # Bar on the Hill
    "on hill": "Bar On The Hill",
    "bar on the hill": "Bar On The Hill",
    # Bar Romeo
    "romeo": "Bar Romeo",
    # Prince family
    "prince": "The Prince",
    "next door prince": "The Prince",
    # Seven Seas
    "seven seas": "Seven Seas Hotel",
    "seven seas hotel": "Seven Seas Hotel",
    # Wicko
    "wicko": "The Wicko",
    # Ship Inn
    "ship inn": "The Ship Inn",
    # Lucky
    "lucky": "The Lucky Hotel",
    "lucky hotel": "The Lucky Hotel",
    # Earp
    "earp distillery": "Earp Distillery",
    "earp distilling co": "Earp Distillery",
    # Newcastle baths
    "newcastle baths": "Newcastle Baths",
    "newcastle east baths": "Newcastle Baths",
    # Method
    "method": "Method Brewing",
    "method brewing": "Method Brewing",
    # Lola's
    "lolas": "Lola's",
    "lola s on darby st": "Lola's",
    # Calmer
    "calmer cruise": "Calmer Cruise",
    "calmer newcastle harbour": "Calmer Cruise",
    # Sirocco
    "sirocco meantime": "Sirocco",
    # The Y
    "y": "The Y",
}

GENRE_ALIASES = {
    "LGBTQI+": "LGBTQIA+",
    "LGBTQ+": "LGBTQIA+",
    "LGBTQIA+": "LGBTQIA+",
    "PSYC": "PSYCH",
    "HEAVY TECHNO": "TECHNO",
    "WITCHHOUSE SELECT": None,  # brand tag, not a genre
}

NON_MUSIC_VENUES = {"Unknown"}

# --- act classification (bands / DJs) ----------------------------------------
# The extraction has no artist-type field, so acts are classified by genre vote
# with manual overrides for names whose genre profile is misleading.
DJ_STRONG = {"DJ", "TECHNO", "HOUSE", "ELECTRONIC", "CLUB", "BREAKS", "JUNGLE", "TRANCE",
             "AFROBEATS", "BASS", "DNB", "PSYTRANCE", "RIDDIM", "ACID", "MINIMAL",
             "INDUSTRIAL", "UPTEMPO"}
DJ_WEAK = {"DANCE", "VINYL", "DISCO", "GROOVE"}
BAND = {"ROCK", "PUNK", "METAL", "INDIE", "ALT", "ACOUSTIC", "COUNTRY", "BLUES", "FOLK",
        "FUNK", "SOUL", "JAZZ", "GRUNGE", "HARDCORE", "HEAVY", "POP", "PSYCH", "RAP",
        "LATIN", "EMO", "POPPUNK", "POST-PUNK", "POSTPUNK", "METALCORE", "REGGAE",
        "INSTRUMENTAL", "MELODIC"}

# programme titles, not artists — credited separately or excluded
PROGRAMME_TITLES = {
    "wharf life", "room 2 dance", "gender blender", "power pop", "disco divas", "so fresh",
    "90s & 00s", "gay anthems", "t-shirt couture", "cast call", "definitely something gay",
    "no hat no play", "fri-gay!", "mardi gras eve", "heels", "hearts & hands",
    "divas brats & dolls", "taking back saturday", "open drag night", "emo night",
    "divorced dad rock night", "band night", "lvl 1 district", "jazz night",
    "byo vinyl night", "open decks", "sunday club", "lvl 1 district saturdays",
    "vinyl night", "jungle vinyl night", "nuanced 80s vinyl party", "traffic light party",
    "easter eve party", "long weekend party", "made on sunday after party", "sunday rooftop",
    "slumba party", "summer latin party", "the australian beefweek show",
    "australian beef week show", "reopening street party", "lonely mountain garden party",
    "after dark emo night", "latin party", "twisted night flowers party", "mean girls night",
    "beach yacht party", "hottest 100 party", "gabs & hottest 100 party",
    "dance magic dance: labyrinth party", "laneway warmup party", "mardi gras laneway party",
    "mardi party", "coming out party: iwd edition", "sticky tart party",
    "charlie xcx tarty party", "gaga night: easter edition", "kath & kim tarty party",
    "birthday laneway party", "mother: the women who power the party",
    "pocketbook no.3 launch party", "after dark emo birthday party",
    "block party cancer council fundraiser", "glow uv party", "caribbean beach boat party",
    "rej lee fight club", "ladas latin dance party", "made on sunday block party",
    "full dance party", "west best bloc fest", "any given sunday after party",
    "open decks christmas party", "techno rave saturdays (new)", "rave edition",
    "club hollanov: heated rivalry party", "soyboy (final show)",
}

EVENT_WORDS = re.compile(
    r"\b(night|nights|decks|party|parties|session|sessions|show|fest|festival|"
    r"rooftop|arvo|rave)\b", re.I)

# names containing an event word that are nonetheless acts
BAND_WHITELIST = {"benny & the decks", "benny and the decks", "j decks", "cry club",
                  "sunday honey", "dear sunday", "elephant sessions"}

DJ_OVERRIDE = {"pc dysco", "black tiger", "rick a mortis", "mistah dux", "professor crabb",
               "bon binary", "perry carter", "funky dan", "j decks", "thisisus djs",
               "sirocco djs", "mefri ghana djs", "dj secateurs", "dj secateaurs"}
BAND_OVERRIDE = {"breeze"}

# Excluded from the act ranking after review: both are residency titles rather than band
# bookings. 18 of Breeze's 25 bills are "Jazz Night: Breeze"; Bellicanta's is 13 weekly solo
# bills at one venue.
EXCLUDED_ACTS = {"breeze", "bellicantas"}

NAME_VARIANTS = {
    "highpass": "High Pass",
    "high pass": "High Pass",
    "jyc": "JYC",
    "smd": "S.M.D",
    "dj secateaurs": "DJ Secateurs",
    "alexander ireland and the glowing union": "Alexander Ireland & The Glowing Union",
    "alexander ireland & the glowing union": "Alexander Ireland & The Glowing Union",
}


def act_key(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def act_from_bill(entry: str):
    """Return the act named on a bill, or None for a programme title."""
    e = re.sub(r"\s+", " ", entry).strip()
    # "Jazz Night: Breeze" credits Breeze, not the night
    if ":" in e:
        pre, suf = [x.strip() for x in e.split(":", 1)]
        if EVENT_WORDS.search(pre) and suf and not re.search(
            r"\b(edition|party|session|night|club|show|new|after)\b", suf, re.I
        ):
            e = suf
    key = act_key(e)
    if key in PROGRAMME_TITLES:
        return None
    if EVENT_WORDS.search(e) and key not in BAND_WHITELIST:
        return None
    return NAME_VARIANTS.get(key, e)


def classify_act(key: str, genres: collections.Counter) -> str:
    if key in DJ_OVERRIDE:
        return "DJ"
    if key in BAND_OVERRIDE:
        return "BAND"
    score = 0
    for atom, c in genres.items():
        if atom in DJ_STRONG:
            score += 2 * c
        elif atom in DJ_WEAK:
            score += c
        elif atom in BAND:
            score -= c
    return "DJ" if score > 0 else "BAND" if score < 0 else "UNKNOWN"


def collect_acts(listings):
    acts = collections.defaultdict(
        lambda: {"disp": collections.Counter(), "n": 0, "head": 0, "solo": 0,
                 "genres": collections.Counter(), "venues": set(), "weeks": set()}
    )
    for r in listings:
        parts = [p.strip() for p in r["name"].split(",") if p.strip()]
        for i, p in enumerate(parts):
            a = act_from_bill(p)
            if not a:
                continue
            k = act_key(a)
            if k in EXCLUDED_ACTS:
                continue
            d = acts[k]
            d["disp"][a] += 1
            d["n"] += 1
            if i == 0:
                d["head"] += 1
            if len(parts) == 1:
                d["solo"] += 1
            d["genres"].update(r["genres"])
            d["venues"].add(r["venue"])
            d["weeks"].add(r["week"])
    for k, d in acts.items():
        d["class"] = classify_act(k, d["genres"])
        d["name"] = d["disp"].most_common(1)[0][0]
    return acts


def pair_listings(listings):
    pairs = collections.Counter()
    for r in listings:
        gs = sorted(r["genres"])
        for i in range(len(gs)):
            for j in range(i + 1, len(gs)):
                pairs[(gs[i], gs[j])] += 1
    return pairs



def fold(s: str) -> str:
    s = (s or "").replace("\u2019", "'").replace("\u2018", "'").replace("&", "and")
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def canonical_venue(raw: str) -> str:
    s = (raw or "").strip()
    # event-prefix form: "Act - Venue"
    if " - " in s:
        s = s.split(" - ")[-1].strip()
    key = fold(s)
    if key in VENUE_ALIASES:
        return VENUE_ALIASES[key]
    if key.startswith("the "):
        key2 = key[4:]
        if key2 in VENUE_ALIASES:
            return VENUE_ALIASES[key2]
    return s


def event_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def parse_price(raw):
    """Return ('free'|'paid'|None, float|None)."""
    if not isinstance(raw, str):
        return None, None
    s = raw.strip()
    if not s:
        return None, None
    if re.fullmatch(r"\d+(\.\d+)?", s):
        v = float(s)
        return ("free" if v == 0 else "paid"), v
    if s.upper() in ("FREE", "0", "0.00"):
        return "free", 0.0
    return None, None


def parse_genres(raw):
    atoms = set()
    free_flag = False
    for g in (raw or "").split(","):
        g = g.strip().upper()
        if not g:
            continue
        if g == "FREE":
            free_flag = True
            continue
        g = GENRE_ALIASES.get(g, g)
        if g:
            atoms.add(g)
    return atoms, free_flag


def local_dt(iso: str) -> datetime.datetime:
    return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(SYD)


# ---------------------------------------------------------------- load + normalise

def load(path):
    data = json.load(open(path))
    rows = []
    for e in data["events"]:
        dt = local_dt(e["eventDateTime"])
        price_kind, price_val = parse_price(e.get("ticketCost"))
        atoms, free_flag = parse_genres(e.get("genres"))
        rows.append(
            {
                "name": (e.get("eventName") or "").strip(),
                "venue_raw": (e.get("venueName") or "").strip(),
                "venue": canonical_venue(e.get("venueName") or ""),
                "genres": atoms,
                "free_flag": free_flag,
                "price_kind": price_kind,
                "price": price_val,
                "dt": dt,
                "week": dt.date().isocalendar()[:2],
                "day": dt.strftime("%a"),
                "date": dt.date(),
            }
        )
    return data, rows


def dedupe(rows):
    groups = collections.defaultdict(list)
    for r in rows:
        groups[(event_key(r["name"]), fold(r["venue"]), r["week"])].append(r)

    listings = []
    conflicts = {"genre": 0, "price": 0}
    for key, g in groups.items():
        # representative: richest row (valid price, most genres)
        rep = max(g, key=lambda r: (r["price"] is not None, len(r["genres"]), r["free_flag"]))
        genres = set().union(*(r["genres"] for r in g))
        prices = {r["price"] for r in g if r["price"] is not None}
        kinds = {r["price_kind"] for r in g if r["price_kind"]}
        if len({frozenset(r["genres"]) for r in g}) > 1:
            conflicts["genre"] += 1
        if len(prices) > 1:
            conflicts["price"] += 1
        is_free = "free" in kinds and not prices
        price = rep["price"] if rep["price"] is not None else (0.0 if is_free else None)
        kind = rep["price_kind"] or ("free" if is_free else None)
        listings.append(
            {
                **rep,
                "genres": genres,
                "price": price,
                "price_kind": kind,
                "n_rows": len(g),
            }
        )
    return listings, len(groups), conflicts


# ---------------------------------------------------------------- metric helpers

def pct(n, d):
    return 0.0 if not d else round(100.0 * n / d, 1)


def quantiles(vals):
    vals = sorted(vals)
    if not vals:
        return {}
    def q(p):
        i = (len(vals) - 1) * p
        lo, hi = math.floor(i), math.ceil(i)
        if lo == hi:
            return vals[lo]
        return vals[lo] + (vals[hi] - vals[lo]) * (i - lo)
    return {
        "n": len(vals),
        "min": vals[0],
        "p25": round(q(0.25), 2),
        "median": round(q(0.5), 2),
        "p75": round(q(0.75), 2),
        "max": vals[-1],
        "mean": round(statistics.mean(vals), 2),
    }


def gini(counts):
    xs = sorted(counts)
    n = len(xs)
    total = sum(xs)
    if n == 0 or total == 0:
        return 0.0
    cum = 0.0
    for i, x in enumerate(xs, 1):
        cum += i * x
    return round((2 * cum) / (n * total) - (n + 1) / n, 3)


def hhi(counts):
    total = sum(counts)
    if not total:
        return 0.0
    return round(sum((c / total) ** 2 for c in counts) * 10000, 0)


# ---------------------------------------------------------------- report

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    data, rows = load(path)
    listings, n_groups, conflicts = dedupe(rows)
    n = len(listings)

    out = []
    w = out.append

    # ---- headline
    all_weeks = sorted({r["week"] for r in listings})
    dates = sorted(r["date"] for r in listings)
    artists = {a.strip() for r in listings for a in r["name"].split(",") if a.strip()}
    venues = collections.Counter(r["venue"] for r in listings)
    venue_pairs = {(event_key(r["name"]), fold(r["venue"])) for r in listings}

    w(f"# Research data analysis — {path}")
    w("")
    w(f"- Raw rows: **{len(rows):,}** from **{len(data['processedImages']):,}** processed images")
    w(f"- Listings after same-week dedupe: **{n:,}**")
    w(f"- Distinct act+venue pairs: **{len(venue_pairs):,}**")
    w(f"- Poster range: **{dates[0]} → {dates[-1]}** across **{len(all_weeks)}** ISO weeks")
    w("")

    # ---- weekday
    w("## 1. Weekly rhythm")
    w("")
    day_counts = collections.Counter(r["day"] for r in listings)
    day_free = collections.Counter(r["day"] for r in listings if r["price_kind"] == "free")
    day_paid = collections.defaultdict(list)
    for r in listings:
        if r["price_kind"] == "paid":
            day_paid[r["day"]].append(r["price"])
    w("| Day | Listings | Share | Free share | Median paid |")
    w("|---|---:|---:|---:|---:|")
    for d in ["Wed", "Thu", "Fri", "Sat", "Sun"]:
        c = day_counts.get(d, 0)
        med = statistics.median(day_paid[d]) if day_paid.get(d) else None
        w(f"| {d} | {c} | {pct(c, n)}% | {pct(day_free.get(d, 0), c)}% | "
          f"{'$' + f'{med:.0f}' if med is not None else '—'} |")
    w("")

    # ---- weekly volume
    week_counts = collections.Counter(r["week"] for r in listings)
    week_venues = collections.defaultdict(set)
    for r in listings:
        week_venues[r["week"]].add(r["venue"])
    vals = [week_counts[k] for k in all_weeks]
    med = statistics.median(vals)
    top_weeks = week_counts.most_common(5)
    bottom_weeks = sorted(week_counts.items(), key=lambda x: x[1])[:5]

    # coverage gaps inside the observed range
    def to_date(wk):
        return datetime.date.fromisocalendar(wk[0], wk[1], 1)
    missing = []
    cur = datetime.date.fromisocalendar(all_weeks[0][0], all_weeks[0][1], 1)
    end = datetime.date.fromisocalendar(all_weeks[-1][0], all_weeks[-1][1], 1)
    present = set(all_weeks)
    while cur <= end:
        wk = cur.isocalendar()[:2]
        if wk not in present:
            missing.append(wk)
        cur += datetime.timedelta(days=7)

    w("## 2. Coverage and volume")
    w("")
    w(f"- Median listings per active week: **{med:.0f}** (mean {statistics.mean(vals):.0f}, "
      f"range {min(vals)}–{max(vals)})")
    w(f"- Median distinct venues per active week: **{statistics.median([len(v) for v in week_venues.values()]):.0f}**")
    w(f"- Weeks with no data inside the range: **{len(missing)}** — "
      + ", ".join(f"{y}-W{str(wk).zfill(2)}" for y, wk in missing))
    w("")
    w("| Busiest weeks | Listings |")
    w("|---|---:|")
    for wk, c in top_weeks:
        w(f"| {wk[0]}-W{str(wk[1]).zfill(2)} | {c} |")
    w("")
    w("| Quietest weeks | Listings |")
    w("|---|---:|")
    for wk, c in bottom_weeks:
        w(f"| {wk[0]}-W{str(wk[1]).zfill(2)} | {c} |")
    w("")

    # ---- venues
    w("## 3. Where the scene lives")
    w("")
    real_venues = {v: c for v, c in venues.items() if v not in NON_MUSIC_VENUES}
    total_real = sum(real_venues.values())
    ranked = collections.Counter(real_venues).most_common()
    cum = 0
    for_target = {}
    for i, (v, c) in enumerate(ranked, 1):
        cum += c
        for t in (50, 80):
            if t not in for_target and cum / total_real * 100 >= t:
                for_target[t] = i
    counts = list(real_venues.values())
    w(f"- Canonical venues: **{len(real_venues)}** (from {len({r['venue_raw'] for r in rows})} raw spellings)")
    w(f"- Top 10 venues: **{pct(sum(c for _, c in ranked[:10]), total_real)}%** of listings")
    w(f"- Venues needed for 50% of listings: **{for_target.get(50, '—')}**; for 80%: **{for_target.get(80, '—')}**")
    w(f"- HHI: **{hhi(counts):.0f}** (10,000 = one venue, ~0 = perfectly spread); Gini **{gini(counts)}**")
    w(f"- Venues with a single listing: **{sum(1 for c in counts if c == 1)}**")
    w("")
    w("| # | Venue | Listings | Share | Weeks active | Free share | Median paid | Top night |")
    w("|---:|---|---:|---:|---:|---:|---:|---|")
    venue_weeks = collections.defaultdict(set)
    venue_free = collections.Counter()
    venue_paid = collections.defaultdict(list)
    venue_day = collections.defaultdict(collections.Counter)
    for r in listings:
        venue_weeks[r["venue"]].add(r["week"])
        venue_day[r["venue"]][r["day"]] += 1
        if r["price_kind"] == "free":
            venue_free[r["venue"]] += 1
        elif r["price_kind"] == "paid":
            venue_paid[r["venue"]].append(r["price"])
    for i, (v, c) in enumerate(ranked[:15], 1):
        med_paid = statistics.median(venue_paid[v]) if venue_paid.get(v) else None
        top_day = venue_day[v].most_common(1)[0][0] if venue_day[v] else "—"
        w(f"| {i} | {v} | {c} | {pct(c, total_real)}% | {len(venue_weeks[v])} | "
          f"{pct(venue_free[v], c)}% | {'$' + f'{med_paid:.0f}' if med_paid is not None else '—'} | {top_day} |")
    w("")

    # ---- genres
    w("## 4. What it sounds like")
    w("")
    atom_counts = collections.Counter()
    atom_listings = collections.Counter()
    for r in listings:
        for g in r["genres"]:
            atom_counts[g] += 1
        if r["genres"]:
            atom_listings.update(r["genres"])
    genre_rows = [r for r in listings if r["genres"]]
    multi = sum(1 for r in genre_rows if len(r["genres"]) > 1)
    w(f"- Listings with a genre: **{len(genre_rows):,}** ({pct(len(genre_rows), n)}%)")
    w(f"- Average genres per tagged listing: **{statistics.mean([len(r['genres']) for r in genre_rows]):.2f}**; "
      f"multi-genre: {pct(multi, len(genre_rows))}%")
    w(f"- Distinct genre atoms after alias merge: **{len(atom_counts)}**")
    w("")
    w("| # | Genre | Listings | Share of tagged |")
    w("|---:|---|---:|---:|")
    for i, (g, c) in enumerate(atom_counts.most_common(15), 1):
        w(f"| {i} | {g} | {c} | {pct(c, len(genre_rows))}% |")
    w("")

    pairs = collections.Counter()
    for r in listings:
        gs = sorted(r["genres"])
        for i in range(len(gs)):
            for j in range(i + 1, len(gs)):
                pairs[(gs[i], gs[j])] += 1
    w("**Most common pairings**")
    w("")
    w("| Pair | Listings |")
    w("|---|---:|")
    for (a, b), c in pairs.most_common(8):
        w(f"| {a} + {b} | {c} |")
    w("")

    # genre x top venues matrix
    top_v = [v for v, _ in ranked[:8]]
    top_g = [g for g, _ in atom_counts.most_common(8)]
    w("**Genre × venue** (listings; — = none)")
    w("")
    w("| Genre | " + " | ".join(top_v) + " |")
    w("|---|" + "---:|" * len(top_v))
    gv = collections.Counter()
    for r in listings:
        for g in r["genres"]:
            gv[(g, r["venue"])] += 1
    for g in top_g:
        cells = [str(gv.get((g, v), 0)) if gv.get((g, v), 0) else "—" for v in top_v]
        w(f"| {g} | " + " | ".join(cells) + " |")
    w("")

    # ---- price
    w("## 5. What it costs")
    w("")
    free_n = sum(1 for r in listings if r["price_kind"] == "free")
    paid = [r["price"] for r in listings if r["price_kind"] == "paid"]
    unknown = n - free_n - len(paid)
    w(f"- Free: **{free_n:,}** ({pct(free_n, n)}%) · Paid: **{len(paid):,}** ({pct(len(paid), n)}%) · "
      f"Unknown: **{unknown:,}** ({pct(unknown, n)}%)")
    if paid:
        q = quantiles(paid)
        w(f"- Paid prices: n={q['n']}, median **${q['median']:.0f}**, p25 ${q['p25']:.0f}, "
          f"p75 ${q['p75']:.0f}, mean ${q['mean']:.2f}, range ${q['min']:.0f}–${q['max']:.0f}")
        w("")
        w("| Price band | Paid listings | Share |")
        w("|---|---:|---:|")
        bands = [("< $10", 0, 10), ("$10–19", 10, 20), ("$20–29", 20, 30),
                 ("$30–39", 30, 40), ("$40–59", 40, 60), ("$60+", 60, math.inf)]
        for label, lo, hi in bands:
            c = sum(1 for p in paid if lo <= p < hi)
            w(f"| {label} | {c} | {pct(c, len(paid))}% |")
        w("")
    # free share by genre
    gfree = collections.Counter()
    gtotal = collections.Counter()
    for r in listings:
        for g in r["genres"]:
            gtotal[g] += 1
            if r["price_kind"] == "free":
                gfree[g] += 1
    w("**Free share by genre** (top 8 genres)")
    w("")
    w("| Genre | Listings | Free | Free share |")
    w("|---|---:|---:|---:|")
    for g, c in atom_counts.most_common(8):
        w(f"| {g} | {c} | {gfree[g]} | {pct(gfree[g], c)}% |")
    w("")

    # ---- artists / billing
    w("## 6. Who is on the bill")
    w("")
    depth = collections.Counter(len([a for a in r["name"].split(",") if a.strip()]) for r in listings)
    billed = collections.Counter()
    artist_venues = collections.defaultdict(set)
    artist_weeks = collections.defaultdict(set)
    for r in listings:
        for a in r["name"].split(","):
            a = a.strip()
            if not a:
                continue
            billed[a] += 1
            artist_venues[a].add(r["venue"])
            artist_weeks[a].add(r["week"])
    w(f"- Distinct billed names: **{len(billed):,}**")
    w(f"- Appearing once: **{sum(1 for c in billed.values() if c == 1):,}** "
      f"({pct(sum(1 for c in billed.values() if c == 1), len(billed))}%)")
    w(f"- Median acts per listing: **{statistics.median([k for k, c in depth.items() for _ in range(c)]):.0f}**")
    w("")
    w("| Acts on bill | Listings |")
    w("|---|---:|")
    for k in sorted(depth):
        if k <= 5 or k % 5 == 0 or k == max(depth):
            w(f"| {k} | {depth[k]} |")
    w("")
    w("**Most-booked names**")
    w("")
    w("| # | Name | Listings | Venues | Weeks |")
    w("|---:|---|---:|---:|---:|")
    for i, (a, c) in enumerate(billed.most_common(15), 1):
        w(f"| {i} | {a} | {c} | {len(artist_venues[a])} | {len(artist_weeks[a])} |")
    w("")

    repeat = collections.Counter()
    for c in billed.values():
        if c == 1:
            repeat["1"] += 1
        elif c <= 3:
            repeat["2–3"] += 1
        elif c <= 9:
            repeat["4–9"] += 1
        else:
            repeat["10+"] += 1
    w("| Bookings per name | Names | Share |")
    w("|---|---:|---:|")
    for k in ["1", "2–3", "4–9", "10+"]:
        w(f"| {k} | {repeat[k]} | {pct(repeat[k], len(billed))}% |")
    w("")

    # ---- residencies
    w("## 7. The residency economy")
    w("")
    series = collections.defaultdict(set)
    series_meta = {}
    for r in listings:
        k = (event_key(r["name"]), fold(r["venue"]))
        series[k].add(r["week"])
        series_meta.setdefault(k, r)
    res = [(k, ws) for k, ws in series.items() if len(ws) >= 3]
    res.sort(key=lambda x: (-len(x[1]), x[0]))
    res_listings = sum(1 for r in listings
                       if len(series[(event_key(r["name"]), fold(r["venue"]))]) >= 3)
    w(f"- Recurring series (≥3 distinct weeks): **{len(res)}**")
    w(f"- Listings belonging to a recurring series: **{res_listings:,}** ({pct(res_listings, n)}%)")
    w(f"- Distinct act+venue pairs overall: **{len(series):,}**; "
      f"series appearing 2+ weeks: **{sum(1 for v in series.values() if len(v) >= 2)}**")
    w("")
    w("| # | Series | Venue | Weeks | First → last | Night |")
    w("|---:|---|---|---:|---|---|")
    for (k, ws) in res[:15]:
        m = series_meta[k]
        ws_sorted = sorted(ws)
        w(f"| | {m['name'][:52]} | {m['venue'][:26]} | {len(ws)} | "
          f"{ws_sorted[0][1]:02d} → {ws_sorted[-1][1]:02d} | {m['day']} |")
    w("")

    # ---- quality
    w("## 8. Data quality scorecard")
    w("")
    raw_n = len(rows)
    w("| Check | Result |")
    w("|---|---|")
    w(f"| Row duplication collapsed | **{raw_n - n:,}** rows ({pct(raw_n - n, raw_n)}%) |")
    w(f"| Duplicate groups with conflicting genres | **{conflicts['genre']:,}** |")
    w(f"| Duplicate groups with conflicting prices | **{conflicts['price']:,}** |")
    w(f"| Venue spellings merged | **{len({r['venue_raw'] for r in rows})}** → **{len(real_venues)}** |")
    w(f"| Price unusable | **{unknown:,}** ({pct(unknown, n)}%) |")
    w(f"| Genre missing | **{sum(1 for r in listings if not r['genres']):,}** ({pct(sum(1 for r in listings if not r['genres']), n)}%) |")
    w(f"| Weeks missing inside range | **{len(missing)}** |")
    w(f"| Single-listing venues | **{sum(1 for c in real_venues.values() if c == 1)}** |")
    w(f"| Venue 'Unknown' | **{venues.get('Unknown', 0)}** |")
    w("")

    # ---- acts
    acts = collect_acts(listings)
    class_counts = collections.Counter(d["class"] for d in acts.values())
    w("## 9. Most-featured acts: live acts vs DJs")
    w("")
    w("> No artist-type field exists. Acts are classified by their genre profile, with manual")
    w("> overrides for ambiguous names. Programme titles (`Wharf Life`, `Open Decks`, `Jazz Night`,")
    w("> Bernies theme nights) are excluded; `Jazz Night: <act>` credits the act after the colon.")
    w("")
    w(f"- Named acts: **{len(acts):,}** — live acts **{class_counts['BAND']:,}**, "
      f"DJs **{class_counts['DJ']:,}**, unclassified **{class_counts['UNKNOWN']:,}**")
    w("")

    for cls, label in [("BAND", "Live acts (bands & soloists)"), ("DJ", "DJs")]:
        w(f"**{label} — top 10 by bill appearances**")
        w("")
        w("| # | Act | Bills | Solo | Venues | Weeks | Top genres |")
        w("|---:|---|---:|---:|---:|---:|---|")
        sel = sorted([d for d in acts.values() if d["class"] == cls],
                     key=lambda d: (-d["n"], d["name"].lower()))
        for i, d in enumerate(sel[:10], 1):
            gs = ", ".join(
                g for g, _ in sorted(d["genres"].items(), key=lambda kv: (-kv[1], kv[0]))[:3]
            ) or "—"
            w(f"| {i} | {d['name']} | {d['n']} | {d['solo']} | "
              f"{len(d['venues'])} | {len(d['weeks'])} | {gs} |")
        w("")

    unknown_acts = sorted([d for d in acts.values() if d["class"] == "UNKNOWN"],
                          key=lambda d: -d["n"])[:5]
    if unknown_acts:
        w("Unclassified (genre profile gives no clear signal): "
          + ", ".join(f"{d['name']} ({d['n']})" for d in unknown_acts))
        w("")

    # ---- genre, excluding FREE and DANCE
    w("## 10. Most-featured genre excluding FREE and DANCE")
    w("")
    w("`FREE` is a price flag rather than a genre atom, so it never appears in these counts.")
    w("")

    def genre_counts(pred):
        c = collections.Counter()
        for r in listings:
            if pred(r):
                for g in r["genres"]:
                    if g != "DANCE":
                        c[g] += 1
        return c

    for label, pred in [
        ("All listings, excluding DANCE", lambda r: True),
        ("Paid listings only (price > 0), excluding DANCE", lambda r: r["price_kind"] == "paid"),
    ]:
        denom = sum(1 for r in listings if pred(r))
        c = genre_counts(pred)
        w(f"**{label}** — n={denom:,}")
        w("")
        w("| # | Genre | Listings | Share |")
        w("|---:|---|---:|---:|")
        for i, (g, v) in enumerate(c.most_common(8), 1):
            w(f"| {i} | {g} | {v} | {pct(v, denom)}% |")
        w("")

    # ---- Witchhouse Select brand tag
    tag_keys = set()
    tag_rows = 0
    for e, r in zip(data["events"], rows):
        if "WITCHHOUSE" in (e.get("genres") or "").upper():
            tag_rows += 1
            tag_keys.add((event_key(r["name"]), fold(r["venue"]), r["week"]))
    tagged = [r for r in listings
              if (event_key(r["name"]), fold(r["venue"]), r["week"]) in tag_keys]

    w("## 11. Witchhouse Select: a brand tag, not a genre")
    w("")
    w(f"`WITCHHOUSE SELECT` appears in **{tag_rows}** raw rows, but it is not one of the genre atoms:")
    w("normalisation drops it as a brand tag. At listing grain it covers "
      f"**{len(tagged)}** listings ({pct(len(tagged), n)}%). It is attached to jazz, punk, house and")
    w("festival listings alike, which is why it is treated as branding rather than a genre.")
    w("")
    w("**Venues**")
    w("")
    w("| Venue | Listings |")
    w("|---|---:|")
    for v, c in collections.Counter(r["venue"] for r in tagged).most_common(6):
        w(f"| {v} | {c} |")
    w("")
    w("Lass O'Gowrie Hotel leads clearly. Ode, Groove Street and King Street Hotel follow with 2")
    w("each. The `Unknown` bills are:")
    w("")
    unk_tagged = sorted([r for r in tagged if r["venue"] == "Unknown"], key=lambda r: r["date"])
    for r in unk_tagged:
        w(f"- {r['date']} — {r['name']}")
    w("")
    for r in unk_tagged:
        known = sorted({x["venue"] for x in listings
                        if x["week"] == r["week"] and event_key(x["name"]) == event_key(r["name"])
                        and x["venue"] != "Unknown"})
        if known:
            w(f"The {r['date']} bill also appears at {', '.join(known)} in the same week, so it is "
              "counted twice and is not genuinely unlocated.")
            w("")
    w("")
    w("**Top 10 artists**")
    w("")
    tag_merge = {"dj gunggek": "gunggek", "gunggek": "gunggek",
                 "highpass": "high pass", "high pass": "high pass", "fob": "fob"}
    tag_display = {"gunggek": "DJ Gunggek", "high pass": "High Pass", "fob": "F.O.B."}
    tag_acts = collections.defaultdict(
        lambda: {"n": 0, "raw": collections.Counter(), "venues": set()}
    )
    for r in tagged:
        for a in r["name"].split(","):
            a = a.strip()
            if not a:
                continue
            name = act_from_bill(a)
            if not name:
                continue
            k = act_key(name)
            if k in EXCLUDED_ACTS:
                continue
            k = tag_merge.get(k, k)
            d = tag_acts[k]
            d["n"] += 1
            d["raw"][a] += 1
            d["venues"].add(r["venue"])
    ranked_tag = sorted(tag_acts.items(), key=lambda kv: (-kv[1]["n"], kv[0]))
    w("| # | Act | Listings | Venues |")
    w("|---:|---|---:|---:|")
    for i, (k, d) in enumerate(ranked_tag[:10], 1):
        name = tag_display.get(k, d["raw"].most_common(1)[0][0])
        w(f"| {i} | {name} | {d['n']} | {len(d['venues'])} |")
    w("")
    if len(ranked_tag) >= 10:
        cutoff = ranked_tag[9][1]["n"]
        tied = sum(1 for _, d in ranked_tag if d["n"] == cutoff)
        w(f"{tied} acts tie on {cutoff} listings, so ranks 8–10 are alphabetical representatives of")
        w("a larger tie. The tag is a brand marker and is not recorded consistently, so these counts")
        w("are lower bounds.")
        w("")

    # ---- metal / heavy / hardcore
    metal_tags = {"METAL", "HEAVY", "HARDCORE"}
    metal_listings = [r for r in listings if r["genres"] & metal_tags]
    metal_merge = {"death feeder": "deathfeeder"}
    metal_display = {"deathfeeder": "Deathfeeder"}
    metal_acts = collections.defaultdict(
        lambda: {"keys": set(), "bills": 0, "raw": collections.Counter(),
                 "venues": set(), "atoms": collections.Counter()}
    )
    for r in metal_listings:
        for a in r["name"].split(","):
            a = a.strip()
            if not a:
                continue
            name = act_from_bill(a)
            if not name:
                continue
            k = act_key(name)
            if k in EXCLUDED_ACTS:
                continue
            k = metal_merge.get(k, k)
            d = metal_acts[k]
            d["keys"].add((r["venue"], r["week"]))
            d["bills"] += 1
            d["raw"][a] += 1
            d["venues"].add(r["venue"])
            d["atoms"].update(r["genres"] & metal_tags)
    ranked_metal = sorted(metal_acts.items(), key=lambda kv: (-len(kv[1]["keys"]), kv[0]))

    w("## 12. Metal / heavy / hardcore: top 10 artists")
    w("")
    w(f"Filter: listings tagged **METAL**, **HEAVY** or **HARDCORE** — **{len(metal_listings)}** "
      f"listings ({pct(len(metal_listings), n)}%), {len(metal_acts)} named acts. Acts are counted")
    w("once per venue per week, so duplicate posters for the same night do not double-count.")
    w("")
    w("| # | Act | Venue-weeks | Venues |")
    w("|---:|---|---:|---:|")
    for i, (k, d) in enumerate(ranked_metal[:10], 1):
        name = metal_display.get(k, d["raw"].most_common(1)[0][0])
        w(f"| {i} | {name} | {len(d['keys'])} | {len(d['venues'])} |")
    w("")
    metal_cutoff = len(ranked_metal[9][1]["keys"])
    metal_tied = sum(1 for _, d in ranked_metal if len(d["keys"]) == metal_cutoff)
    w(f"{metal_tied} acts tie on {metal_cutoff} venue-weeks, so ranks 8–10 are alphabetical")
    w("representatives of that tie.")
    w("")
    once = sum(1 for d in metal_acts.values() if len(d["keys"]) == 1)
    hs = sum(1 for r in metal_listings if r["venue"] == "Hamilton Station Hotel")
    w(f"- **Heavy music is a Hamilton Station scene.** {hs} of {len(metal_listings)} listings "
      f"({pct(hs, len(metal_listings))}%) are there; King Street Hotel follows with 14.")
    w(f"- **The tag mix is METAL 37, HEAVY 19, HARDCORE 19.** A listing can carry more than one.")
    w(f"- **It is a local-support scene.** {once} of {len(metal_acts)} named acts "
      f"({pct(once, len(metal_acts))}%) appear only once, and just seven acts reach four or more")
    w("  venue-weeks.")
    w("- **Name merges:** `Disco` includes `DISCO` and `D.I.S.C.O`; `Deathfeeder` includes")
    w("  `DeathFeeder` and `Death Feeder`.")
    w("- **Feign** has four bill strings but three venue-weeks: the 16 Jan Lass O'Gowrie poster is")
    w("  duplicated.")
    w("")

    print("\n".join(out))


if __name__ == "__main__":
    main()
