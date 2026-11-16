# Research data analysis — what the posters actually show

Source: `researchData/events.json` — the single merged, de-duplicated corpus (1,388 events from 286 images)

Window: 2026-01-07 → 2026-11-15, across 43 ISO weeks with data

Grain used throughout: **1,388 listings** (bill + venue + ISO week). The per-date dumps were consolidated
into `researchData/events.json` and removed on 2026-11-14; the June 2026 batch was merged in on 2026-11-16.

Reproduce: `python3 scripts/research-data-analysis.py researchData/events.json`

Last refreshed: 2026-11-16 — June 2026 (W23–W26) added to the corpus

Method, caveats and the investigation behind the cleaning: [`research-data-methodology.md`](./research-data-methodology.md)

> **Promoter pass — 2026-11-14, corpus refreshed 2026-11-16.** The poster re-extraction added
> promoter/venue findings. Every dump was merged and de-duplicated into **`researchData/events.json`**:
> **1,388 events**, of which **166** carry a promoter. The June 2026 batch (W23–W26, recovered from 20
> retrospective posters) was merged in on 2026-11-16. Promoter rankings are in [§13](#13-promoters).

> **June 2026 batch.** The 20 June posters are described in
> [`research-data-methodology.md`](./research-data-methodology.md) and traced file-by-file in
> [`../researchData/june-2026-sources.json`](../researchData/june-2026-sources.json). Their weekday is in
> the filename and their date is the file creation date; both were read from each poster's highlighted
> tab. They represent June 2026 and only June 2026.

## Direct answers

| Question | Answer |
| --- | --- |
| Most-featured live act (band/soloist) | **Rhodes** — 21 bills across 8 venues and 19 weeks (§9) |
| Most-featured DJ | **Beam** and **DJ Qyto** — 9 bills each (§9) |
| Most-featured genre excluding FREE and DANCE | **ROCK** — 274 listings (19.7%); still first among paid listings at 67 (18.6%) (§10) |
| Venue with the most `WITCHHOUSE SELECT` listings | **Lass O'Gowrie Hotel** — 10 of 41 (§11) |
| Most-featured metal/heavy/hardcore act | **Disco (7 venue-weeks), Fat Monica (6)** (§12) |

Breeze and Bellicanta's are excluded from the act ranking: 23 of Breeze's 31 bills come from the
event title `Jazz Night: Breeze`, and all 16 of Bellicanta's bills are one weekly solo residency at
Theydy's. Both measure a residency listing rather than band bookings. Raw billed strings (1,922) are
not the same as named acts (1,757) — see §9 for the difference.

---

## Definitions used

| Term | Meaning |
| --- | --- |
| **Row** | One event as extracted from one poster image; 1,388 after merging and de-duplication. |
| **Listing** | A unique bill/event title + venue + ISO week. Same bill/venue in different weeks is **not** a duplicate. |
| **Series** | The same bill/event title + venue appearing in 2+ weeks. A **residency** is 3+ weeks. |
| **Artist residency** | The same individual artist + venue appearing in 3+ distinct weeks (act-level table in §7). |
| **Free** | Price parsed as `0` or the `FREE` tag was present. |
| **Unknown price** | Anything unparseable (`"undefined"`, `""`, `"N/A"`, `"Unknown"`, …) — never coerced to 0. |
| **Day** | The day tab the listing came from (Wed–Sun), not the event's calendar date. |

All timestamps were converted to `Australia/Sydney` before grouping. `venueName` was canonicalised
from 120 raw spellings to 89 venues. `lngLat` and `venueAddress` are present in the merged file but are
not used here, so this analysis makes **no geographic claims**.

---

## Snapshot

| Metric | Value |
| --- | --- |
| Number of acts | 1,757 |
| Canonical venues | 89 (from 120 spellings) |
| Active weeks | 43 of 45 in range — 2 missing |
| Busiest week | 2026-W38, 64 listings (14–20 Sep 2026) |
| Listings per active week | median 34 (range 1–64) |
| Free / paid / unknown | **63.5% / 25.9% / 10.6%** |
| Median paid price | **$27** (p25 $15, p75 $40) |
| Names billed exactly once | **75.8%** |

---

## 1. Rhythm: a Thursday–Sunday scene

```
Sat  ████████████████████████████████████  394  28.4%
Fri  ██████████████████████████████████    372  26.8%
Sun  ███████████████████████████           297  21.4%
Thu  █████████████████                     190  13.7%
Wed  ████████████                          135   9.7%
```

| Day | Listings | Share | Free | Paid | Unknown | Median paid (n) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Wed | 135 | 9.7% | 122 | 7 | 6 | $40 (7) |
| Thu | 190 | 13.7% | 125 | 57 | 8 | $10 (57) |
| Fri | 372 | 26.8% | 213 | 106 | 53 | $26 (106) |
| Sat | 394 | 28.4% | 192 | 155 | 47 | $28 (155) |
| Sun | 297 | 21.4% | 229 | 35 | 33 | $34 (35) |

**Findings**

- **90% of listings sit on Thursday–Sunday.** Wednesday is a minor night.
- **Saturday and Friday are effectively tied** (394 vs 372). At listing grain the weekend is balanced.
- **Sunday is the free night**: 77.1% free versus 48.7% on Saturday. It is the third-busiest night,
  not a wind-down.
- **Saturday carries most of the paid market** (155 paid listings, 43% of all paid listings).
- Wednesday's $40 median rests on **7 paid listings** — not a number to quote.

---

## 2. Coverage: two missing weeks and one catch-up spike

| Measure | Value |
| --- | --- |
| Active weeks | 43 |
| Missing weeks inside range | **2** — 2026-W18, W39 |
| Median listings per active week | 34 (mean 32) |
| Median distinct venues per week | 16 |
| Busiest week | 2026-W38, 64 listings (14–20 Sep 2026) |

`W23–W26` — the whole of June — is **no longer missing**. It was recovered on 2026-11-16 from 20
posters in `~/Downloads/june/`, copied into `~/Downloads` as `<weekday>(n).jpg` with the poster's own
weekday in the filename and its own date as the file creation date. All 144 June listings fall on
3–28 June, and 20 distinct poster dates produced them. The provenance is in
`researchData/june-2026-sources.json` and the note in the methodology.

`W18` (early May) and `W39` (late September) are still missing. `W38` at 64 listings is a catch-up
batch (about 2× median), not a festival week — the June recovery did not change that peak.

`W43–W45` are thin rather than empty: the late re-extraction recovered 4, 6 and 1 listings for those
weeks. W46 is the 11 Nov drop. Treat those tail weeks as partial coverage, not a real decline.

**Implication:** any month-over-month or "scene growth" trend from this data is an artefact. Weekly
volume is usable only to describe poster coverage.

---

## 3. Concentration: five venues are half the scene

| Measure | Value |
| --- | --- |
| Canonical venues | 89 |
| Venues needed for 50% of listings | **5** |
| Venues needed for 80% | **12** |
| Top 10 share | **75.6%** |
| HHI | 746 → equivalent to ~13 equal-sized venues |
| Gini | 0.806 |
| Venues with a single listing | 43 |

| # | Venue | Listings | Share | Weeks active | Free | Paid | Unknown | Median paid |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Lass O'Gowrie Hotel | 202 | 14.6% | 43 | 125 | 63 | 14 | $25 |
| 2 | Hamilton Station Hotel | 182 | 13.2% | 42 | 104 | 64 | 14 | $25 |
| 3 | Maru Hi-Fi | 142 | 10.3% | 40 | 142 | 0 | 0 | — |
| 4 | The Oak | 110 | 8.0% | 40 | 102 | 1 | 7 | $15 |
| 5 | King Street Hotel | 91 | 6.6% | 40 | 18 | 62 | 11 | $47 |
| 6 | Bernies Bar | 81 | 5.9% | 40 | 67 | 5 | 9 | $10 |
| 7 | Stag & Hunter Hotel | 76 | 5.5% | 38 | 25 | 39 | 12 | $34 |
| 8 | The Ori | 70 | 5.1% | 29 | 68 | 0 | 2 | — |
| 9 | The Beauford Hotel | 49 | 3.6% | 36 | 19 | 0 | 30 | — |
| 10 | Croatian Club | 40 | 2.9% | 24 | 13 | 24 | 3 | $15 |
| 11 | The Underground | 39 | 2.8% | 37 | 2 | 37 | 0 | $10 |
| 12 | Queens Wharf Hotel | 38 | 2.8% | 38 | 38 | 0 | 0 | — |
| 13 | Gallipoli House | 31 | 2.2% | 18 | 2 | 3 | 26 | $12 |
| 14 | Charlies Rooftop | 25 | 1.8% | 24 | 23 | 2 | 0 | $27 |
| 15 | Theydy's | 19 | 1.4% | 18 | 17 | 2 | 0 | $12 |

**Findings**

- The top three venues alone produce **38.1%** of all listings, and the top five cross half (52.7%).
- They are also the most *intensive*: Lass O'Gowrie averages **4.7 listings per active week**,
  Hamilton Station 4.3, Maru Hi-Fi 3.5. Most venues average 1–2.
- The long tail is thin but real: 43 of 89 venues appear exactly once in ten months.
- `Top 10 = 75.6%` is measured against the 1,379 listings at named venues. Nine rows carry the
  literal venue `Unknown`; they are excluded from the ranking and the denominator.

---

## 4. Genre is venue-shaped, not scene-shaped

| Measure | Value |
| --- | --- |
| Listings with a genre | 1,360 (98.0%) |
| Distinct genre atoms | 52 |
| Genres per tagged listing | 1.37 (34.1% multi-genre) |

| # | Genre | Listings | Share of tagged |
| ---: | --- | ---: | ---: |
| 1 | ROCK | 274 | 20.1% |
| 2 | DANCE | 193 | 14.2% |
| 3 | JAZZ | 157 | 11.5% |
| 4 | INDIE | 144 | 10.6% |
| 5 | VINYL | 141 | 10.4% |
| 6 | PUNK | 118 | 8.7% |
| 7 | ACOUSTIC | 115 | 8.5% |
| 8 | LGBTQIA+ | 91 | 6.7% |
| 9 | ALT | 67 | 4.9% |
| 10 | TECHNO | 56 | 4.1% |
| 11 | COUNTRY | 47 | 3.5% |
| 12 | BLUES | 47 | 3.5% |
| 13 | HOUSE | 45 | 3.3% |
| 14 | METAL | 41 | 3.0% |
| 15 | DJ | 41 | 3.0% |

**Venue specialisation** (share of that venue's tagged listings in its top genre):

| Venue | Top genre | Share |
| --- | --- | ---: |
| Bernies Bar | DANCE / LGBTQIA+ | 100.0% |
| The Underground | JAZZ | 100.0% |
| Queens Wharf Hotel | DANCE | 94.7% |
| The Beauford Hotel | ROCK | 73.5% |
| The Oak | VINYL | 57.9% |
| Maru Hi-Fi | VINYL | 47.7% |
| Hamilton Station Hotel | ROCK | 39.8% |
| The Ori | ACOUSTIC | 37.9% |

**Pairings are mostly one venue's signature, not a scene-wide blend:**

| Pair | Listings | Concentration |
| --- | ---: | --- |
| DANCE + LGBTQIA+ | 91 | 89.0% at Bernies Bar |
| INDIE + ROCK | 52 | spread across 9 venues |
| PUNK + ROCK | 42 | spread across 12 venues |
| HOUSE + TECHNO | 22 | 81.8% at Lass O'Gowrie |
| ROCK + VINYL | 19 | 100% at The Oak |
| DANCE + TECHNO | 18 | 100% at Gallipoli House |

**Findings**

- Rock leads the raw count, but **venue identity explains more than the scene-wide mix**: Bernies is
  a dance/LGBTQIA+ room, The Underground is jazz, Maru and The Oak are vinyl, The Beauford is rock.
- Only **INDIE+ROCK** and **PUNK+ROCK** behave as genuinely scene-wide combinations.
- A single "what does Newcastle sound like" breakdown would average across rooms that barely overlap.
  The venue × genre split is the more informative view.

---

## 5. Price: two-thirds free, paid concentrated in three rooms

| Measure | Value |
| --- | --- |
| Free | 881 (63.5%) |
| Paid | 360 (25.9%) |
| Unknown | 147 (10.6%) |
| Paid median | $27 (p25 $15, p75 $40) |
| Paid mean | $31.89 |
| Paid range | $5–$124 |

| Price band | Paid listings | Share |
| --- | ---: | ---: |
| < $10 | 5 | 1.4% |
| $10–19 | 103 | 28.6% |
| $20–29 | 90 | 25.0% |
| $30–39 | 68 | 18.9% |
| $40–59 | 54 | 15.0% |
| $60+ | 40 | 11.1% |

**Free share by genre**

| Genre | Listings | Free | Free share |
| --- | ---: | ---: | ---: |
| ROCK | 274 | 157 | 57.3% |
| DANCE | 193 | 136 | 70.5% |
| JAZZ | 157 | 117 | 74.5% |
| INDIE | 144 | 80 | 55.6% |
| VINYL | 141 | 137 | **97.2%** |
| PUNK | 118 | 62 | **52.5%** |
| ACOUSTIC | 115 | 96 | 83.5% |
| LGBTQIA+ | 91 | 70 | 76.9% |

**Findings**

- **63.5% of listings are free.** The paid market is not spread evenly: King Street Hotel ($47 median,
  62 paid listings), Stag & Hunter ($34, 39), Hamilton Station ($25, 64), Lass O'Gowrie ($25, 63),
  Croatian Club ($15, 24) and The Underground ($10, 37) account for most paid entries.
- **Entire rooms are free**: Maru Hi-Fi (142/142), Queens Wharf (38/38), The Ori (68 of 70),
  The Oak (102 of 110).
- **Vinyl and acoustic are the free end** (97.2% and 83.5%); **punk and rock are the paid end**
  (52.5% and 57.3% free).
- **$60+ is a real tier** — 40 paid listings (11.1% of paid), so the distribution has a long right tail
  rather than clustering under $30.
- **147 prices (10.6%) are unknown** and are excluded from every paid statistic. The paid median is
  therefore a median of *known* prices, not of the whole scene.

---

## 6. Bills and names: a long tail with a small permanent core

| Measure | Value |
| --- | --- |
| Distinct billed names | 1,922 |
| Billed exactly once | **1,457 (75.8%)** |
| Billed 2–3 times | 316 (16.4%) |
| Billed 4–9 times | 130 (6.8%) |
| Billed 10+ times | 19 (1.0%) |
| Median acts per listing | 1 |

These are raw bill strings; after removing programme titles, merging spelling variants and dropping
the two residency acts, §9 counts 1,757 named acts.

| Acts on bill | Listings |
| --- | ---: |
| 1 | 714 |
| 2 | 179 |
| 3 | 242 |
| 4 | 106 |
| 5 | 52 |
| 6–9 | 73 |
| 10+ | 22 |

**Most-billed entries**

| # | Name | Listings | Venues | Weeks |
| ---: | --- | ---: | ---: | ---: |
| 1 | Jazz Night | 39 | 2 | 34 |
| 2 | Wharf Life | 38 | 1 | 38 |
| 3 | BYO Vinyl Night | 38 | 2 | 38 |
| 4 | Open Decks | 37 | 2 | 37 |
| 5 | Jazz Night: Breeze | 23 | 1 | 23 |
| 6 | Rhodes | 21 | 8 | 19 |
| 7 | Sunday Club | 19 | 1 | 19 |
| 8 | Lvl 1 District Saturdays | 18 | 1 | 18 |
| 9 | Rose White | 16 | 8 | 16 |
| 10 | Bellicanta's | 16 | 1 | 16 |

**Findings**

- **The long tail dominates:** three-quarters of billed names appear once in ten months.
- **Half the listings are single-act bills** (714 of 1,388); the median bill has one name.
  Three-act bills are the second mode (242), then four (106).
- **Two different populations sit in the same column.** Wharf Life (38 listings, 1 venue),
  BYO Vinyl Night (38, 1) and Open Decks (37, 2) are weekly fixtures — the second Open Decks venue is
  a single Bar Romeo listing, not a second residency. Rhodes (21 listings across
  **8 venues**), Rose White (16 across **8**), Gauze (12 across **9**) and Trophy Wyfe (11 across **6**)
  are touring acts. The first group is programming; the second is a booking circuit.
- **Caveat:** `eventName` mixes artists and named nights ("Jazz Night", "Open Decks", "Sunday Club"),
  so this table ranks *bill entries*, not artist identities. There is no artist ID in the data.

---

## 7. Residencies: 34 recurring bills, 130 artist-venue runs

| Series length | Series |
| --- | ---: |
| 1 week only | 990 |
| 2 weeks | 37 |
| 3+ weeks | **34** |

| Measure | Value |
| --- | --- |
| Distinct bill+venue pairs | 1,061 |
| Series reappearing in 2+ weeks | 71 |
| Residencies (3+ weeks) | 34 |
| Listings belonging to a residency | 324 (23.3%) |

| Series | Venue | Weeks | Night |
| --- | --- | ---: | --- |
| Wharf Life | Queens Wharf Hotel | 38 | Sun |
| BYO Vinyl Night | Maru Hi-Fi | 37 | Thu |
| Open Decks | Lass O'Gowrie Hotel | 36 | Wed |
| Jazz Night | The Underground | 24 | Thu |
| Jazz Night: Breeze | Lass O'Gowrie Hotel | 23 | Thu |
| Sunday Club | Charlies Rooftop | 19 | Sun |
| Lvl 1 District Saturdays | Gallipoli House | 18 | Sat |
| Bellicanta's | Theydy's | 16 | Wed |
| Jazz Night | Lass O'Gowrie Hotel | 15 | Thu |
| Vinyl Night | Maru Hi-Fi | 11 | Sun |

**Top artist residencies at a venue** (act-level; 3+ distinct weeks)

Programme titles are excluded. `Jazz Night: Breeze` credits Breeze; Bellicanta's is excluded. **130** artist-venue series
reach 3+ weeks. *Total* is the number of distinct weeks the artist appeared at that venue;
*Genre* is their most common tag there.

| Artist | Venue | Total | Genre |
|---|---|---:|---|
| Breeze | Lass O'Gowrie Hotel | 23 | JAZZ |
| PC Dysco | The Oak | 12 | VINYL |
| Bardvarkk | Lass O'Gowrie Hotel | 9 | PUNK |
| Rick A Mortis | The Oak | 9 | VINYL |
| Rose White | Lass O'Gowrie Hotel | 9 | ALT |
| LauraPanic | Hamilton Station Hotel | 8 | PUNK |
| Beam | Lass O'Gowrie Hotel | 7 | TECHNO |
| Black Tiger | The Oak | 7 | VINYL |
| Anunnaki | The Beauford Hotel | 6 | ROCK |
| Breeze | The Oak | 6 | JAZZ |
| DJ Qyto | Lass O'Gowrie Hotel | 6 | DANCE |
| Lello | Lass O'Gowrie Hotel | 6 | TECHNO |
| Michael Dowell | Lass O'Gowrie Hotel | 6 | TECHNO |
| Nico | The Oak | 6 | ROCK |

**Findings**

- **The scene is a stable weekly grid plus a large one-off layer.** 990 of 1,061 bill+venue pairs appear
  in only one week, yet 34 series account for almost a quarter of all listings.
- **Three series run essentially every week:** Wharf Life (38 of 43), BYO Vinyl Night (37) and
  Open Decks (36). Jazz Night adds two sequential runs — 24 weeks at The Underground and 15 at
  Lass O'Gowrie — appearing in 34 distinct weeks under the same name.
- **The same name can be two different runs.** "Jazz Night" at Lass O'Gowrie (W02–W16) and at The
  Underground (W03–W46) are sequential venue-specific series, not one touring night.
- **Artist-level residencies are led by Breeze** (23 weeks at Lass O'Gowrie, plus 6 at The Oak).
  PC Dysco's 12 weeks at The Oak is the next longest; the rest of the table are 9 weeks or fewer.
- The Wednesday and Sunday nights in the list are what keep those low-volume days alive.

---

## 8. Data quality scorecard

| Check | Result |
| --- | --- |
| Rows collapsed in dedupe | 0 (0.0%) — the input file is already de-duplicated |
| Duplicate groups with conflicting genres | 0 |
| Duplicate groups with conflicting prices | 0 |
| Venue spellings merged | 120 → 89 |
| Price unusable | 147 (10.6%) |
| Genre missing | 28 (2.0%) |
| Weeks missing inside range | 2 |
| Single-listing venues | 43 |
| Venue literally `Unknown` | 9 |

- **Genre missing is 28, not 11:** rows with no genre at all, plus rows whose only tag was `FREE` —
  lifted out as a price flag, leaving no genre behind.
- **The 10.6% unknown price rate is the main analysis risk.** It is not random: The Beauford has 30
  unknown prices out of 49, so its free-vs-paid split is mostly inference.
- **Duplicate removal happened upstream.** The merged file already collapsed ids, date+event groups,
  venue clusters and near-identical bills, so this pass sees no same-week duplicates or conflicts.
  See `scripts/merge-research-data.py` and `scripts/dedupe-events.py`.

---

## 9. Most-featured acts: live acts vs DJs

There is **no artist-type field** in the data, so this split is derived: each billed name is
classified by the genres it appears under (electronic/techno/house/DJ/vinyl → DJ; rock/punk/jazz/
acoustic/indie → live act), with manual overrides where the genre mix is misleading. Names that are
programme titles (`Wharf Life`, `Open Decks`, `BYO Vinyl Night`, `Jazz Night`, Bernies theme nights)
are excluded; `Jazz Night: <act>` is credited to the act after the colon.

**Breeze and Bellicanta's are excluded from the ranking.** 23 of Breeze's 31 bills come from the
recurring event title `Jazz Night: Breeze`, and Bellicanta's 16 bills are a single weekly solo
residency at Theydy's. Both counts measure a residency listing rather than band bookings. Breeze's
remaining 8 standalone jazz bills fall outside the top 10; Bellicanta's has no bills outside the
residency.

After removing programme titles, spelling variants and the two excluded acts: **1,757 named acts** —
1,218 live acts, 465 DJs, 74 unclassified.

**Live acts (bands & soloists) — top 10 by bill appearances**

| # | Act | Bills | Venues | Weeks | Event genres |
|---:|---|---:|---:|---:|---|
| 1 | Rhodes | 21 | 8 | 19 | ROCK |
| 2 | S.M.D | 16 | 6 | 14 | PUNK |
| 3 | Bardvarkk | 14 | 3 | 13 | PUNK |
| 4 | Charlie Farmer | 12 | 9 | 11 | ROCK |
| 5 | Gauze | 12 | 9 | 10 | PUNK |
| 6 | LauraPanic | 12 | 4 | 11 | PUNK |
| 7 | Iryss | 11 | 4 | 11 | ROCK |
| 8 | The Janes | 11 | 5 | 11 | INDIE |
| 9 | Trophy Wyfe | 11 | 6 | 10 | ROCK |
| 10 | Portrait Of A Lady | 10 | 5 | 10 | ROCK |

**DJs — top 10 by bill appearances**

| # | Act | Bills | Venues | Weeks | Top genres |
|---:|---|---:|---:|---:|---|
| 1 | Beam | 9 | 3 | 9 | HOUSE, TECHNO, BASS |
| 2 | DJ Qyto | 9 | 4 | 9 | TECHNO, HOUSE, AFROBEATS |
| 3 | High Pass | 8 | 5 | 8 | TECHNO, ALT, ELECTRONIC |
| 4 | JYC | 8 | 4 | 7 | HOUSE, VINYL, BASS |
| 5 | Lello | 8 | 3 | 8 | HOUSE, TECHNO, BASS |
| 6 | 2Lulu | 7 | 3 | 7 | HOUSE, TECHNO, FUNK |
| 7 | DJ Gunggek | 7 | 4 | 7 | HOUSE, ELECTRONIC, TECHNO |
| 8 | Homebody | 7 | 4 | 6 | ELECTRONIC, HOUSE, BREAKS |
| 9 | Michael Dowell | 7 | 2 | 7 | HOUSE, TECHNO, BASS |
| 10 | Shuvcheck | 7 | 2 | 7 | TECHNO, HOUSE, ALT |

`PC Dysco`, `Rick A Mortis` and `Black Tiger` are left out of the DJ standings: they are The Oak's
in-house vinyl selectors, billed alongside the bands every week rather than as headlining DJs. They
still appear in the artist-residency table (§7).

Unclassified (genre profile gives no clear signal): Rose White (16), High Andies (4), Zeal.H (3), The Pins (3), Tyson O'Brien (2)

**Findings**

- **Rhodes is the most-featured live act** — 21 bills across 8 venues and 19 weeks. Gauze (12 bills
  across 9 venues) and Charlie Farmer (12 across 9) are similarly itinerant, the signature of a
  support-circuit band rather than a resident.
- **Volume is not the same as headlining.** Bardvarkk reaches 14 bills and Trophy Wyfe 11, while
  Portrait Of A Lady's 10 bills span 5 venues. None is a single-room residency.
- **The band circuit is wider than the DJ circuit.** The leading live acts reach 8–9 venues; the
  leading DJs reach 2–5. Live music tours; dance programming stays in its room.
- **No DJ exceeds 9 bills.** The Oak's three vinyl selectors — PC Dysco (12 appearances), Rick A
  Mortis (9) and Black Tiger (7) — are excluded from the standings: they are billed alongside the
  bands every week, often last, and may be reading the room between sets rather than headlining.
  With them removed the dance programming is spread thin, and the leading names are event- and
  room-linked rather than city-wide draws.
- **The biggest DJ programming is event-branded, not artist-branded.** `Wharf Life` (38 weeks) and
  `Open Decks` (36) are excluded as programme titles; no named DJ comes close to those runs. DJ
  culture here is a night, not a roster.
- **Rose White is the one material omission**: 16 bills across 8 venues, mixing electronic, punk and
  alt line-ups. There is no defensible way to call them band or DJ from this data, so they are
  reported as unclassified rather than forced into a bucket.

---

## 10. Most-featured genre excluding FREE and DANCE

`FREE` is a price flag in this dataset, not a genre atom, so it never enters the genre counts.
Excluding `DANCE`:

| # | Genre | Listings | Share of all 1,388 |
| ---: | --- | ---: | ---: |
| 1 | **ROCK** | 274 | **19.7%** |
| 2 | JAZZ | 157 | 11.3% |
| 3 | INDIE | 144 | 10.4% |
| 4 | VINYL | 141 | 10.2% |
| 5 | PUNK | 118 | 8.5% |
| 6 | ACOUSTIC | 115 | 8.3% |
| 7 | LGBTQIA+ | 91 | 6.6% |
| 8 | ALT | 67 | 4.8% |

If "not free" is read literally as **paid listings only** (price > 0), the ranking changes at the
top of the tail but not the winner:

| # | Genre | Paid listings | Share of 360 |
| ---: | --- | ---: | ---: |
| 1 | **ROCK** | 67 | **18.6%** |
| 2 | PUNK | 47 | 13.1% |
| 3 | INDIE | 40 | 11.1% |
| 4 | JAZZ | 39 | 10.8% |
| 5 | HOUSE | 34 | 9.4% |
| 6 | TECHNO | 32 | 8.9% |
| 7 | METAL | 27 | 7.5% |
| 8 | ALT | 26 | 7.2% |

**Findings**

- **ROCK is the answer either way** — 274 listings overall (19.7%), and 67 of 360 paid listings
  (18.6%).
- **Removing free events promotes PUNK and METAL and demotes VINYL and ACOUSTIC.** Vinyl is 97.2%
  free and acoustic 83.5%, so they almost vanish from a paid-only view (VINYL falls out of the top
  eight entirely); punk (52.5% free) and metal move up.
- **DANCE was the second-largest atom overall (193 listings), so excluding it is what makes rock
  look dominant.** Rock leads on its own merits, but the gap is 274 vs 157 once dance is removed —
  not the 274 vs 193 it would be with dance included.

---

## 11. Witchhouse Select: a brand tag, not a genre

`WITCHHOUSE SELECT` appears in **41** raw rows, but it is not one of the genre atoms:
normalisation drops it as a brand tag. At listing grain it covers **41** listings (3.0%). It is attached to jazz, punk, house and
festival listings alike, which is why it is treated as branding rather than a genre.

**Venues**

| Venue | Listings |
|---|---:|
| Lass O'Gowrie Hotel | 10 |
| Unknown | 4 |
| Meantime | 2 |
| King Street Hotel | 2 |
| Bar On The Hill | 2 |
| Hamilton Station Hotel | 2 |

Lass O'Gowrie Hotel leads clearly; the remaining venues are one-offs. The `Unknown` bills are:

- 2026-01-31 — Jaie Gon, Precious Metal, Shuvcheck, Assembler Code
- 2026-04-26 — Reptant, Cqllum, Oliver, Ross Mvnro
- 2026-05-15 — 2Gruvy2Hard
- 2026-10-17 — Hannah D, Ari Kiko, DJ Gunggek


**Artists with the most `WITCHHOUSE SELECT` bills**

Artists with 2+ tagged bills. Counts are lower bounds because the tag is not recorded consistently.

| Artist | Total | Venues |
|---|---:|---:|
| DJ Gunggek | 5 | 5 |
| Kev Sev | 4 | 3 |
| High Pass | 3 | 3 |
| Krisp | 3 | 2 |
| Michael Dowell | 3 | 2 |
| Mozz | 3 | 2 |
| Rose White | 3 | 3 |
| Spaenk | 3 | 2 |
| Assembler Code | 2 | 2 |
| Charlie Farmer | 2 | 2 |
| Chow Chow Disco | 2 | 2 |
| DJ Qyto | 2 | 1 |
| EEJ | 2 | 2 |
| Forward Fox | 2 | 1 |
| Red C | 2 | 2 |
| Shuvcheck | 2 | 2 |
| Splak! | 2 | 2 |
| Weldo | 2 | 2 |

---

## 12. Metal / heavy / hardcore: top 10 artists

Filter: listings tagged **METAL**, **HEAVY** or **HARDCORE** — **80** listings (5.8%), 224 named acts. Acts are counted
once per venue per week, so duplicate posters for the same night do not double-count.

| # | Act | Venue-weeks | Venues |
|---:|---|---:|---:|
| 1 | Disco | 7 | 2 |
| 2 | Fat Monica | 6 | 3 |
| 3 | Deathfeeder | 5 | 2 |
| 4 | Exyle | 5 | 3 |
| 5 | Fatal Excuse | 4 | 1 |
| 6 | Latest God | 4 | 2 |
| 7 | Phantom | 4 | 2 |
| 8 | Exsister | 3 | 2 |
| 9 | Feign | 3 | 3 |
| 10 | Torment | 3 | 2 |

7 acts tie on 3 venue-weeks, so ranks 8–10 are alphabetical
representatives of that tie.

- **Heavy music is a Hamilton Station scene.** 45 of 80 listings (56.2%) are there; King Street Hotel follows with 14.
- **The tag mix is METAL 41, HEAVY 21, HARDCORE 20.** A listing can carry more than one.
- **It is a local-support scene.** 182 of 224 named acts (81.2%) appear only once, and just seven acts reach four or more
  venue-weeks.
- **Name merges:** `Disco` includes `DISCO` and `D.I.S.C.O`; `Deathfeeder` includes
  `DeathFeeder` and `Death Feeder`.
- **Feign** has four bill strings but three venue-weeks: the 16 Jan Lass O'Gowrie poster is
  duplicated.

---

## 13. Promoters

Basis: `researchData/events.json`, the single merged file produced from every `events-*.json` dump.
Duplicates are collapsed by id, then by `(eventDateTime, eventName)`, then clustered by venue so
spelling drift and leaked promoter prefixes do not create separate events (`Grindhouse - Croatian Club
Side Room` / `Croatian Club` / `Croatian Wickham Sports Club` are one row; so are `The Oak` /
`The Oak Hotel` and `Ori Hotel` / `The Oriental Hotel`). A final pass collapses the same bill on the
same night at the same venue when the names differ only by a truncated tail or one misspelled word;
it also folds the same bill at the same venue a day or two apart, and a one-off bill that appears
exactly twice a week apart, while leaving weekly residencies alone.
Result: **1,388 events**, of which **166** carry an `eventPromoters` value across **111** distinct
strings (123 distinct names after splitting multi-promoter rows on commas). Before the 2026-11-14
poster pass only **4** rows had a promoter; the June 2026 batch added 5 more.

`New Annual` (6) and `Great Southern Nights` (11) lead the raw counts but are excluded from the table:
they are festival/council program brands rather than independent promoters. `Full Send Friday` (3) is
excluded for the same reason — it is Hamilton Station's weekly heavy night, not an outside promoter.
Removing them leaves the independent promoters with 3+ events:

| # | Promoter | Events |
| ---: | --- | ---: |
| 1 | Kova Events | 10 |
| 2 | Bad Behaviour | 6 |
| 3 | 2Gruvy2Hard | 6 |
| 4 | Odyssey | 5 |
| 5 | Sirocco | 5 |
| 6 | C.T. | 4 |
| 7 | Made On Sunday | 4 |
| 8 | Groove Street | 3 |
| 9 | New Brain Communications | 3 |
| 10 | Destroy All Lines | 3 |
| 11 | Ode | 3 |
| 12 | Powder Your Nose | 3 |
| 13 | Shenanigans | 3 |

`Made On Sunday`, `2Gruvy2Hard` and `Sirocco` are counted at the brand level: they also appear as
event titles (after-parties, self-titled nights), which adds to the rows where the promoter field is
filled in.

The `#` column is list position: six promoters tie on 3 events. A further 13 names are credited twice
(Grindhouse, Grindhead Records, The Ori, Yours & Owls, Thanks For Coming, Maru Hi-Fi among them) and
the rest once.

**Findings**

- **Promoter disclosure is the exception, not the rule:** 166 of 1,388 events (12.0%). Most posters do
  not name a promoter at all, so these counts are a floor, not a ranking of who runs the most gigs.
- **Concentration is low.** The largest independent promoter has 10 events across ten months, and only
  after folding `Kova` into `Kova Events`; the next is Bad Behaviour with 6. This is a venue-led scene,
  consistent with §3 (five venues = half of all listings), not a promoter-led one.
- **`Kova` and `Kova Events` are the same operator.** The canonical alias lives in the applier and the
  merge script; `C.T` and `C.T.` are folded to `C.T.` (4 events).
- **De-duplication moves the promoter counts.** Collapsing the three 16 Oct Grindhouse rows removed
  two duplicate credits, and merging the three `Dr Sure's Unusual Practice` rows did the same for
  New Brain Communications (4 → 3).
- Some values are venues or event brands rather than promoters (`The Ori`, `Maru Hi-Fi`, `Full Send Friday`), so read the list as "who is credited on the poster".

Re-run: `npm run recheck` (re-extract) → `npm run apply-recheck` (fold findings in) →
`python3 scripts/merge-research-data.py path/to/new-dumps/*.json > researchData/events.json` →
`python3 scripts/dedupe-events.py researchData/events.json --out researchData/events.json`.
The per-date dumps were consolidated into `researchData/events.json` and removed on 2026-11-14;
the June 2026 batch was merged in on 2026-11-16.

---

## Corrections to earlier raw-row estimates

> The table below documents the first analysis pass on the 17 Oct dump. The current consolidated
> corpus is **1,388 listings** from 286 images; the Snapshot and §1–§12 carry the refreshed figures.

The first pass worked on raw rows. At listing grain, several figures move:

| Metric | Raw rows | Listing grain |
| --- | ---: | ---: |
| Listings | 1,275 | **1,260** |
| Act+venue pairs | 980 | **958** |
| Recurring series | 364 | **77 (2+ weeks), 28 (3+ weeks)** |
| Names billed once | 822 of 1,744 (47%) | **1,287 of 1,738 (74%)** |
| Free share of priced | 70.5% | **71.0%** |

- **Listings fell by 15** because canonicalising 143 venue spellings to 78 made some rows collapse
  that had previously been distinct.
- **"364 recurring series" was inflated.** That count was repeated `(name, venue)` pairs *including
  same-week duplicates*. Real recurrence is 77 series, of which 28 are residencies.
- **The one-off rate rose from 47% to 74%** because within-week duplicates were artificially
  increasing repeat counts.
- **The free share is stable** (~71% of priced listings), which is the most reassuring number here.

---

## What this analysis supports

**Supported:**
- Share of listings by day tab, venue, genre and price bracket.
- Venue concentration and relative intensity (listings per active week).
- Venue-level programming identity (genre specialisation, free vs paid character).
- Price distribution among known prices, and the free/paid/unknown split.
- Residency structure and the size of the one-off layer.
- Billing depth and the long-tail/repeat split among bill entries.
- A live-act vs DJ split, with the caveat that it is inferred from genre and manually overridden for
  ambiguous names (Rose White, 16 bills, is left unclassified).

**Not supported:**
- Absolute event counts ("1,388 events happened") — the unit is a listing, not an event.
- Any calendar claim ("what's on this Friday") — the timestamp is the day tab and save week.
- Month-over-month trends — two weeks inside the range are missing (W18 and W39), and W43–W45 are
  only partially covered.
- Geography, distance or neighbourhood analysis — coordinates are present but not used as reliable
  location data here.
- Artist identity or "top artist" claims — `eventName` mixes artists and named nights, with no ID.
  The bands-vs-DJs ranking in section 9 is the closest defensible reading, and it is heuristic.
- Weekly capacity or attendance — the data records advertising, not ticket sales.

---

## Summary

1. **The usable unit is a listing, not a row.** The merged corpus now holds 1,388 events from
   286 images, which equal 1,388 listings at (bill, venue, ISO week).
2. **It is a Thursday–Sunday scene.** 90% of listings sit on those four days; Saturday and Friday are
   tied (394 vs 372), and Sunday is a strong third (297) rather than a quiet night.
3. **Five venues are half the scene.** Lass O'Gowrie (202), Hamilton Station (182), Maru Hi-Fi (142),
   The Oak (110) and King Street (91) produce 52.7% of listings; 5 venues reach 50% and 12 reach 80%,
   with the top ten accounting for 75.6%.
4. **Genre is a property of the room, not the city.** Bernies is 100% dance/LGBTQIA+, The Underground
   100% jazz, The Oak 58% vinyl, The Beauford 74% rock. Only indie+rock and punk+rock appear across
   many venues.
5. **Nearly two-thirds of listings are free (63.5%).** Where money is charged, it concentrates in King
   Street ($47 median), Stag & Hunter ($34), Hamilton Station ($25) and Lass O'Gowrie ($25). Vinyl
   (97.2% free) and acoustic (83.5%) are the free end; punk (52.5%) and rock (57.3%) the paid end.
6. **Bills are short and names are mostly one-off.** Half of all listings are single-act (714), and
   75.8% of the 1,922 raw billed strings appear exactly once; only 19 appear 10+ times.
7. **A small permanent core carries the scene.** 34 residencies cover 23.3% of listings, led by Wharf
   Life (38 weeks), BYO Vinyl Night (37) and Open Decks (36); the other 990 bill+venue pairs appear once.
8. **The data is honest about its gaps.** Two weeks inside the range are missing (W18 and W39),
   W43–W45 are only partially covered, 10.6% of prices are unparseable, and W38 is a catch-up spike.
   June 2026 (W23–W26) is no longer a gap: it was recovered from 20 retrospective posters whose dates
   live in their file creation dates — so this still supports a portrait of the scene, not a time
   series, and not any geographic or calendar-specific claim.
9. **The most-featured live act is Rhodes (21 bills across 8 venues and 19 weeks)**, followed by S.M.D
   (16) and Bardvarkk (14). Breeze and Bellicanta's were excluded because their counts come from
   residency listings (`Jazz Night: Breeze` and the weekly Bellicanta's show), not band bookings.
10. **Beam and DJ Qyto top the DJ standings at 9 bills each.** The Oak's vinyl selectors — PC
    Dysco (12 appearances), Rick A Mortis (9) and Black Tiger (7) — are excluded from the DJ
    ranking. No named DJ exceeds 9 bills because the biggest dance programming is event-branded
    (`Wharf Life`, `Open Decks`).
11. **Excluding FREE and DANCE, ROCK is the leading genre** — 274 listings (19.7%), and still first
    among paid listings at 67 (18.6%); PUNK is second on paid listings (47).
12. **`WITCHHOUSE SELECT` is a brand tag, not a genre.** It appears in 41 raw rows / 41 listings
    (3.0%), most often at Lass O'Gowrie Hotel (10); DJ Gunggek leads the tagged bills with 5, then
    Kev Sev with 4.
13. **Heavy music is concentrated at Hamilton Station.** 45 of 80 metal/heavy/hardcore listings (56%)
    are there; Disco leads the artists with 7 venue-weeks and Fat Monica has 6, while 81.2% of the
    224 acts appear only once.
14. **Promoters are disclosed on only 12.0% of events.** The corpus holds 1,388 events, of which 166
    carry a promoter; excluding the `New Annual` and `Great Southern Nights` program brands,
    **Kova Events leads with 10** (after folding in the `Kova` variant), then Bad Behaviour with 6,
    Odyssey with 5, and **C.T. with 4** after folding `C.T` / `C.T.` together (§13).

### Witchhouse Select tables

**Venues with the most `WITCHHOUSE SELECT` listings**

| Venue | Listings |
| --- | ---: |
| Lass O'Gowrie Hotel | 10 |
| Unknown | 4 |
| Meantime | 2 |
| King Street Hotel | 2 |
| Bar On The Hill | 2 |
| Hamilton Station Hotel | 2 |

**Artists with the most `WITCHHOUSE SELECT` bills**

| Artist | Total | Venues |
|---|---:|---:|
| DJ Gunggek | 5 | 5 |
| Kev Sev | 4 | 3 |
| High Pass | 3 | 3 |
| Krisp | 3 | 2 |
| Michael Dowell | 3 | 2 |
| Mozz | 3 | 2 |
| Rose White | 3 | 3 |
| Spaenk | 3 | 2 |
| Assembler Code | 2 | 2 |
| Charlie Farmer | 2 | 2 |
| Chow Chow Disco | 2 | 2 |
| DJ Qyto | 2 | 1 |
| EEJ | 2 | 2 |
| Forward Fox | 2 | 1 |
| Red C | 2 | 2 |
| Shuvcheck | 2 | 2 |
| Splak! | 2 | 2 |
| Weldo | 2 | 2 |

Full detail, including the four `Unknown` bills, is in §11.
