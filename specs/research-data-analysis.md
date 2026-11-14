# Research data analysis — what the posters actually show

Source: `researchData/events.json` — the single merged, de-duplicated corpus (1,245 events from 266 images)
Window: 2026-01-07 → 2026-11-15, across 39 ISO weeks with data
Grain used throughout: **1,245 listings** (act + venue + ISO week). The four per-date dumps were consolidated
into `researchData/events.json` and removed on 2026-11-14.
Reproduce: `python3 scripts/research-data-analysis.py researchData/events.json`
Last refreshed: 2026-11-14 — refreshed against the consolidated single-file corpus
Method, caveats and the investigation behind the cleaning: [`research-data-methodology.md`](./research-data-methodology.md)

> **Promoter pass — 2026-11-14.** The poster re-extraction added promoter/venue findings. All four
> event dumps were merged and de-duplicated into **`researchData/events.json`**: **1,245 events**,
> of which **159** carry a promoter, and the per-date dumps were then removed. Promoter rankings are in
> [§13](#13-promoters). Every section below now uses the consolidated file.

## Direct answers

| Question | Answer |
| --- | --- |
| Most-featured live act (band/soloist) | **Rhodes** — 20 bills across 8 venues and 18 weeks (§9) |
| Most-featured DJ | **PC Dysco** — 11 bills, all at The Oak (§9) |
| Most-featured genre excluding FREE and DANCE | **ROCK** — 238 listings (19.1%); still first among paid listings at 60 (18.0%) (§10) |
| Venue with the most `WITCHHOUSE SELECT` listings | **Lass O'Gowrie Hotel** — 10 of 37 (§11) |
| Most-featured metal/heavy/hardcore act | **Disco (7 venue-weeks), Fat Monica (6)** (§12) |

Breeze and Bellicanta's are excluded from the act ranking: 19 of Breeze's 26 bills come from the
event title `Jazz Night: Breeze`, and all 14 of Bellicanta's bills are one weekly solo residency at
Theydy's. Both measure a residency listing rather than band bookings. Raw billed strings (1,783) are
not the same as named acts (1,631) — see §9 for the difference.

---

## Definitions used

| Term | Meaning |
| --- | --- |
| **Row** | One event as extracted from one poster image; 1,245 after merging and de-duplication. |
| **Listing** | A unique act + venue + ISO week. Same act/venue in different weeks is **not** a duplicate. |
| **Series** | The same act + venue appearing in 2+ weeks. A **residency** is 3+ weeks. |
| **Free** | Price parsed as `0` or the `FREE` tag was present. |
| **Unknown price** | Anything unparseable (`"undefined"`, `""`, `"N/A"`, `"Unknown"`, …) — never coerced to 0. |
| **Day** | The day tab the listing came from (Wed–Sun), not the event's calendar date. |

All timestamps were converted to `Australia/Sydney` before grouping. `venueName` was canonicalised
from 117 raw spellings to 86 venues. `lngLat` and `venueAddress` are present in the merged file but are
not used here, so this analysis makes **no geographic claims**.

---

## Snapshot

| Metric | Value |
| --- | --- |
| Rows in merged file | 1,245 |
| Listings after same-week dedupe | **1,245** (0 rows collapsed — the file is already de-duplicated) |
| Distinct act+venue pairs | 961 |
| Canonical venues | 86 (from 117 spellings) |
| Active weeks | 39 of 45 in range — 6 missing |
| Listings per active week | median 33 (range 1–64) |
| Free / paid / unknown | **63.0% / 26.7% / 10.3%** |
| Median paid price | **$25** (p25 $15, p75 $39) |
| Names billed exactly once | **76.0%** |
| Recurring series (3+ weeks) | 27, covering 22.0% of listings |

---

## 1. Rhythm: a Thursday–Sunday scene

```
Sat  ████████████████████████████████████  355  28.5%
Fri  ██████████████████████████████████    339  27.2%
Sun  ██████████████████████████            262  21.0%
Thu  █████████████████                     173  13.9%
Wed  ████████████                          116   9.3%
```

| Day | Listings | Share | Free | Paid | Unknown | Median paid (n) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Wed | 116 | 9.3% | 105 | 7 | 4 | $40 (7) |
| Thu | 173 | 13.9% | 114 | 52 | 7 | $10 (52) |
| Fri | 339 | 27.2% | 189 | 102 | 48 | $25 (102) |
| Sat | 355 | 28.5% | 172 | 141 | 42 | $25 (141) |
| Sun | 262 | 21.0% | 204 | 31 | 27 | $33 (31) |

**Findings**

- **91% of listings sit on Thursday–Sunday.** Wednesday is a minor night.
- **Saturday and Friday are effectively tied** (355 vs 339). At listing grain the weekend is balanced.
- **Sunday is the free night**: 77.9% free versus 48.5% on Saturday. It is the third-busiest night,
  not a wind-down.
- **Saturday carries most of the paid market** (141 paid listings, 42% of all paid listings).
- Wednesday's $40 median rests on **7 paid listings** — not a number to quote.

---

## 2. Coverage: six missing weeks and one catch-up spike

| Measure | Value |
| --- | --- |
| Active weeks | 39 |
| Missing weeks inside range | **6** — 2026-W18, W23, W24, W25, W26, W39 |
| Median listings per active week | 33 (mean 32) |
| Median distinct venues per week | 16 |
| Busiest week | 2026-W38, 64 listings |
| Quietest week | 2026-W45, 1 listing (partial); 2026-W41, 23 for a full week |

`W23–W26` is the whole of June. There are **no source images** for June either, so this is a capture
gap, not a collapse in the scene. `W18` (early May) and `W39` (late September) are also missing.
`W38` at 64 listings is a catch-up batch (about 2× median), not a festival week.

`W43–W45` are thin rather than empty: the late re-extraction recovered 4, 6 and 1 listings for those
weeks. W46 is the 11 Nov drop. Treat those tail weeks as partial coverage, not a real decline.

**Implication:** any month-over-month or "scene growth" trend from this data is an artefact. Weekly
volume is usable only to describe poster coverage.

---

## 3. Concentration: five venues are half the scene

| Measure | Value |
| --- | --- |
| Canonical venues | 86 |
| Venues needed for 50% of listings | **5** |
| Venues needed for 80% | **12** |
| Top 10 share | **76.3%** |
| HHI | 753 → equivalent to ~13 equal-sized venues |
| Gini | 0.801 |
| Venues with a single listing | 43 |

| # | Venue | Listings | Share | Weeks active | Free | Paid | Unknown | Median paid | Top night |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Lass O'Gowrie Hotel | 182 | 14.7% | 39 | 112 | 57 | 13 | $25 | Sat |
| 2 | Hamilton Station Hotel | 165 | 13.3% | 38 | 93 | 62 | 10 | $25 | Fri |
| 3 | Maru Hi-Fi | 127 | 10.3% | 36 | 127 | 0 | 0 | — | Thu |
| 4 | The Oak | 98 | 7.9% | 36 | 90 | 1 | 7 | $15 | Fri |
| 5 | King Street Hotel | 81 | 6.5% | 36 | 13 | 57 | 11 | $45 | Fri |
| 6 | Bernies Bar | 73 | 5.9% | 36 | 61 | 5 | 7 | $10 | Fri |
| 7 | The Ori | 68 | 5.5% | 27 | 66 | 0 | 2 | — | Fri |
| 8 | Stag & Hunter Hotel | 66 | 5.3% | 34 | 22 | 34 | 10 | $34 | Fri |
| 9 | The Beauford Hotel | 45 | 3.6% | 34 | 19 | 0 | 26 | — | Fri |
| 10 | Croatian Club | 40 | 3.2% | 24 | 13 | 24 | 3 | $15 | Sat |
| 11 | The Underground | 35 | 2.8% | 33 | 2 | 33 | 0 | $10 | Thu |
| 12 | Queens Wharf Hotel | 35 | 2.8% | 35 | 35 | 0 | 0 | — | Sun |
| 13 | Gallipoli House | 28 | 2.3% | 15 | 2 | 3 | 23 | $12 | Sat |
| 14 | Charlies Rooftop | 22 | 1.8% | 21 | 20 | 2 | 0 | $27 | Sun |
| 15 | Theydy's | 16 | 1.3% | 15 | 14 | 2 | 0 | $12 | Wed |

**Findings**

- The top three venues alone produce **38.3%** of all listings, and the top five cross half (52.7%).
- They are also the most *intensive*: Lass O'Gowrie averages **4.7 listings per active week**,
  Hamilton Station 4.3, Maru Hi-Fi 3.5. Most venues average 1–2.
- The long tail is thin but real: 43 of 86 venues appear exactly once in ten months.
- `Top 10 = 76.3%` is measured against the 1,238 listings at named venues. Seven rows carry the
  literal venue `Unknown`; they are excluded from the ranking and the denominator.

---

## 4. Genre is venue-shaped, not scene-shaped

| Measure | Value |
| --- | --- |
| Listings with a genre | 1,223 (98.2%) |
| Distinct genre atoms | 51 |
| Genres per tagged listing | 1.36 (33.9% multi-genre) |

| # | Genre | Listings | Share of tagged |
| ---: | --- | ---: | ---: |
| 1 | ROCK | 238 | 19.5% |
| 2 | DANCE | 172 | 14.1% |
| 3 | JAZZ | 137 | 11.2% |
| 4 | VINYL | 130 | 10.6% |
| 5 | INDIE | 129 | 10.5% |
| 6 | PUNK | 107 | 8.7% |
| 7 | ACOUSTIC | 103 | 8.4% |
| 8 | LGBTQIA+ | 81 | 6.6% |
| 9 | ALT | 62 | 5.1% |
| 10 | TECHNO | 51 | 4.2% |
| 11 | BLUES | 42 | 3.4% |
| 12 | HOUSE | 41 | 3.4% |
| 13 | COUNTRY | 39 | 3.2% |
| 14 | METAL | 37 | 3.0% |
| 15 | DJ | 37 | 3.0% |

**Venue specialisation** (share of that venue's tagged listings in its top genre):

| Venue | Top genre | Share |
| --- | --- | ---: |
| Bernies Bar | DANCE / LGBTQIA+ | 100.0% |
| The Underground | JAZZ | 100.0% |
| Queens Wharf Hotel | DANCE | 94.3% |
| The Beauford Hotel | ROCK | 73.3% |
| The Oak | VINYL | 56.7% |
| Maru Hi-Fi | VINYL | 51.3% |
| Hamilton Station Hotel | ROCK | 39.0% |
| The Ori | ACOUSTIC | 38.5% |

**Pairings are mostly one venue's signature, not a scene-wide blend:**

| Pair | Listings | Concentration |
| --- | ---: | --- |
| DANCE + LGBTQIA+ | 81 | 90.1% at Bernies Bar |
| INDIE + ROCK | 44 | spread across 9 venues |
| PUNK + ROCK | 35 | spread across 12 venues |
| HOUSE + TECHNO | 21 | 85.7% at Lass O'Gowrie |
| ROCK + VINYL | 17 | 100% at The Oak |
| DANCE + TECHNO | 15 | 100% at Gallipoli House |

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
| Free | 784 (63.0%) |
| Paid | 333 (26.7%) |
| Unknown | 128 (10.3%) |
| Paid median | $25 (p25 $15, p75 $39) |
| Paid mean | $31.43 |
| Paid range | $5–$124 |

| Price band | Paid listings | Share |
| --- | ---: | ---: |
| < $10 | 5 | 1.5% |
| $10–19 | 97 | 29.1% |
| $20–29 | 85 | 25.5% |
| $30–39 | 64 | 19.2% |
| $40–59 | 46 | 13.8% |
| $60+ | 36 | 10.8% |

**Free share by genre**

| Genre | Listings | Free | Free share |
| --- | ---: | ---: | ---: |
| ROCK | 238 | 135 | 56.7% |
| DANCE | 172 | 121 | 70.3% |
| JAZZ | 137 | 101 | 73.7% |
| VINYL | 130 | 126 | **96.9%** |
| INDIE | 129 | 72 | 55.8% |
| PUNK | 107 | 55 | **51.4%** |
| ACOUSTIC | 103 | 86 | 83.5% |
| LGBTQIA+ | 81 | 62 | 76.5% |

**Findings**

- **63% of listings are free.** The paid market is not spread evenly: King Street Hotel ($45 median,
  57 paid listings), Stag & Hunter ($34, 34), Hamilton Station ($25, 62), Lass O'Gowrie ($25, 57),
  Croatian Club ($15, 24) and The Underground ($10, 33) account for most paid entries.
- **Entire rooms are free**: Maru Hi-Fi (127/127), Queens Wharf (35/35), The Ori (66 of 68),
  The Oak (90 of 98).
- **Vinyl and acoustic are the free end** (96.9% and 83.5%); **punk and rock are the paid end**
  (51.4% and 56.7% free).
- **$60+ is a real tier** — 36 paid listings (10.8% of paid), so the distribution has a long right tail
  rather than clustering under $30.
- **128 prices (10.3%) are unknown** and are excluded from every paid statistic. The paid median is
  therefore a median of *known* prices, not of the whole scene.

---

## 6. Bills and names: a long tail with a small permanent core

| Measure | Value |
| --- | --- |
| Distinct billed names | 1,783 |
| Billed exactly once | **1,355 (76.0%)** |
| Billed 2–3 times | 294 (16.5%) |
| Billed 4–9 times | 119 (6.7%) |
| Billed 10+ times | 15 (0.8%) |
| Median acts per listing | 1 |

These are raw bill strings; after removing programme titles, merging spelling variants and dropping
the two residency acts, §9 counts 1,631 named acts.

| Acts on bill | Listings |
| --- | ---: |
| 1 | 637 |
| 2 | 156 |
| 3 | 217 |
| 4 | 100 |
| 5 | 47 |
| 6–9 | 67 |
| 10+ | 21 |

**Most-billed entries**

| # | Name | Listings | Venues | Weeks |
| ---: | --- | ---: | ---: | ---: |
| 1 | Wharf Life | 35 | 1 | 35 |
| 2 | Jazz Night | 35 | 2 | 30 |
| 3 | BYO Vinyl Night | 34 | 1 | 34 |
| 4 | Open Decks | 33 | 2 | 33 |
| 5 | Rhodes | 20 | 8 | 18 |
| 6 | Jazz Night: Breeze | 19 | 1 | 19 |
| 7 | Rose White | 16 | 8 | 16 |
| 8 | Sunday Club | 16 | 1 | 16 |
| 9 | Lvl 1 District Saturdays | 15 | 1 | 15 |
| 10 | Bellicanta's | 14 | 1 | 14 |

**Findings**

- **The long tail dominates:** three-quarters of billed names appear once in ten months.
- **Half the listings are single-act bills** (637 of 1,245); the median bill has one name.
  Three-act bills are the second mode (217), then four (100).
- **Two different populations sit in the same column.** Wharf Life (35 listings, 1 venue),
  BYO Vinyl Night (34, 1) and Open Decks (33, 2) are weekly fixtures — the second Open Decks venue is
  a single Bar Romeo listing, not a second residency. Rhodes (20 listings across
  **8 venues**), Rose White (16 across **8**), Gauze (9 across **8**) and Trophy Wyfe (11 across **6**)
  are touring acts. The first group is programming; the second is a booking circuit.
- **Caveat:** `eventName` mixes artists and named nights ("Jazz Night", "Open Decks", "Sunday Club"),
  so this table ranks *bill entries*, not artist identities. There is no artist ID in the data.

---

## 7. Residencies: 27 series carry 22% of listings

| Series length | Series |
| --- | ---: |
| 1 week only | 897 |
| 2 weeks | 37 |
| 3+ weeks | **27** |

| Measure | Value |
| --- | --- |
| Distinct act+venue pairs | 961 |
| Series reappearing in 2+ weeks | 64 |
| Residencies (3+ weeks) | 27 |
| Listings belonging to a residency | 274 (22.0%) |

| Series | Venue | Weeks | Night |
| --- | --- | ---: | --- |
| Wharf Life | Queens Wharf Hotel | 35 | Sun |
| BYO Vinyl Night | Maru Hi-Fi | 34 | Thu |
| Open Decks | Lass O'Gowrie Hotel | 32 | Wed |
| Jazz Night | The Underground | 20 | Thu |
| Jazz Night: Breeze | Lass O'Gowrie Hotel | 19 | Thu |
| Sunday Club | Charlies Rooftop | 16 | Sun |
| Jazz Night | Lass O'Gowrie Hotel | 15 | Thu |
| Lvl 1 District Saturdays | Gallipoli House | 15 | Sat |
| Bellicanta's | Theydy's | 14 | Wed |
| Vinyl Night | Maru Hi-Fi | 11 | Sun |

**Findings**

- **The scene is a stable weekly grid plus a large one-off layer.** 897 of 961 act+venue pairs appear
  in only one week, yet 27 series account for almost a quarter of all listings.
- **Three series run essentially every week:** Wharf Life (35 of 39), BYO Vinyl Night (34) and
  Open Decks (32). Jazz Night adds two sequential runs — 20 weeks at The Underground and 15 at
  Lass O'Gowrie — appearing in 30 distinct weeks under the same name.
- **The same name can be two different runs.** "Jazz Night" at Lass O'Gowrie (W02–W16) and at The
  Underground (W03–W46) are sequential venue-specific series, not one touring night.
- The Wednesday and Sunday nights in the list are what keep those low-volume days alive.

---

## 8. Data quality scorecard

| Check | Result |
| --- | --- |
| Rows collapsed in dedupe | 0 (0.0%) — the input file is already de-duplicated |
| Duplicate groups with conflicting genres | 0 |
| Duplicate groups with conflicting prices | 0 |
| Venue spellings merged | 117 → 86 |
| Price unusable | 128 (10.3%) |
| Genre missing | 22 (1.8%) |
| Weeks missing inside range | 6 |
| Single-listing venues | 43 |
| Venue literally `Unknown` | 7 |

- **Genre missing is 22, not 11:** rows with no genre at all, plus rows whose only tag was `FREE` —
  lifted out as a price flag, leaving no genre behind.
- **The 10% unknown price rate is the main analysis risk.** It is not random: The Beauford has 26
  unknown prices out of 45, so its free-vs-paid split is mostly inference.
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

**Breeze and Bellicanta's are excluded from the ranking.** 19 of Breeze's 26 bills come from the
recurring event title `Jazz Night: Breeze`, and Bellicanta's 14 bills are a single weekly solo
residency at Theydy's. Both counts measure a residency listing rather than band bookings. Breeze's
remaining 7 standalone jazz bills fall outside the top 10; Bellicanta's has no bills outside the
residency.

After removing programme titles, spelling variants and the two excluded acts: **1,631 named acts** —
1,123 live acts, 444 DJs, 64 unclassified.

**Live acts (bands & soloists) — top 10 by bill appearances**

| # | Act | Bills | Solo | Venues | Weeks | Top genres |
|---:|---|---:|---:|---:|---:|---|
| 1 | Rhodes | 20 | 0 | 8 | 18 | ROCK, INDIE, FUNK |
| 2 | S.M.D | 16 | 0 | 6 | 14 | PUNK, ROCK, BLUES |
| 3 | Bardvarkk | 13 | 0 | 3 | 12 | PUNK, ROCK, ALT |
| 4 | Charlie Farmer | 11 | 0 | 8 | 10 | ROCK, ALT, INDIE |
| 5 | Trophy Wyfe | 11 | 0 | 6 | 10 | ROCK, PUNK, INDIE |
| 6 | LauraPanic | 10 | 0 | 3 | 9 | PUNK, ROCK, ALT |
| 7 | Adam Miller | 9 | 9 | 5 | 9 | ACOUSTIC, JAZZ |
| 8 | Aunty Alan | 9 | 2 | 6 | 8 | ACOUSTIC, ROCK, ALT |
| 9 | Cormac Grant | 9 | 3 | 5 | 9 | ACOUSTIC, INDIE, ALT |
| 10 | Gauze | 9 | 0 | 8 | 8 | PUNK, ROCK, ALT |

**DJs — top 10 by bill appearances**

| # | Act | Bills | Solo | Venues | Weeks | Top genres |
|---:|---|---:|---:|---:|---:|---|
| 1 | PC Dysco | 11 | 3 | 1 | 11 | VINYL, ROCK, INDIE |
| 2 | Beam | 9 | 0 | 3 | 9 | HOUSE, TECHNO, BASS |
| 3 | DJ Qyto | 9 | 0 | 4 | 9 | TECHNO, HOUSE, AFROBEATS |
| 4 | Rick A Mortis | 9 | 0 | 1 | 9 | VINYL, ALT, COUNTRY |
| 5 | Black Tiger | 8 | 2 | 1 | 7 | VINYL, ALT, JAZZ |
| 6 | High Pass | 8 | 0 | 5 | 8 | TECHNO, ALT, ELECTRONIC |
| 7 | Lello | 8 | 0 | 3 | 8 | HOUSE, TECHNO, BASS |
| 8 | DJ Gunggek | 7 | 0 | 4 | 7 | HOUSE, ELECTRONIC, TECHNO |
| 9 | Homebody | 7 | 0 | 4 | 6 | ELECTRONIC, HOUSE, BREAKS |
| 10 | JYC | 7 | 3 | 4 | 6 | HOUSE, VINYL, TECHNO |

Unclassified (genre profile gives no clear signal): Rose White (16), The Pins (3), Tyson O'Brien (2), Stacie Fields (2), Chris G (2)

**Findings**

- **Rhodes is the most-featured live act** — 20 bills across 8 venues and 18 weeks. Gauze (9 bills
  across 8 venues) and Charlie Farmer (11 across 8) are similarly itinerant, the signature of a
  support-circuit band rather than a resident.
- **Volume is not the same as headlining.** Bardvarkk and Trophy Wyfe reach 13 and 11 bills but
  appear entirely in support slots (0 solo bills), while Adam Miller's 9 bills are all solo sets.
- **Solo acts look different from bands.** Adam Miller plays 9 solo bills across 5 venues; Rhodes
  plays 20 bills across 8 venues as a band. Neither pattern is a single-room residency.
- **No DJ exceeds 11 bills**, and three of the top five DJs are vinyl selectors tied to The Oak
  (PC Dysco, Rick A Mortis, Black Tiger). Their definition as "DJ" is a judgement call: they are
  billed alongside bands, often last, and may be reading the room between sets rather than
  headlining.
- **The biggest DJ programming is event-branded, not artist-branded.** `Wharf Life` (35 weeks) and
  `Open Decks` (32) are excluded as programme titles; no named DJ comes close to those runs. DJ
  culture here is a night, not a roster.
- **Rose White is the one material omission**: 16 bills across 8 venues, mixing electronic, punk and
  alt line-ups. There is no defensible way to call them band or DJ from this data, so they are
  reported as unclassified rather than forced into a bucket.

---

## 10. Most-featured genre excluding FREE and DANCE

`FREE` is a price flag in this dataset, not a genre atom, so it never enters the genre counts.
Excluding `DANCE`:

| # | Genre | Listings | Share of all 1,245 |
| ---: | --- | ---: | ---: |
| 1 | **ROCK** | 238 | **19.1%** |
| 2 | JAZZ | 137 | 11.0% |
| 3 | VINYL | 130 | 10.4% |
| 4 | INDIE | 129 | 10.4% |
| 5 | PUNK | 107 | 8.6% |
| 6 | ACOUSTIC | 103 | 8.3% |
| 7 | LGBTQIA+ | 81 | 6.5% |
| 8 | ALT | 62 | 5.0% |

If "not free" is read literally as **paid listings only** (price > 0), the ranking changes at the
top of the tail but not the winner:

| # | Genre | Paid listings | Share of 333 |
| ---: | --- | ---: | ---: |
| 1 | **ROCK** | 60 | **18.0%** |
| 2 | PUNK | 43 | 12.9% |
| 3 | INDIE | 35 | 10.5% |
| 4 | JAZZ | 35 | 10.5% |
| 5 | HOUSE | 31 | 9.3% |
| 6 | TECHNO | 30 | 9.0% |
| 7 | METAL | 26 | 7.8% |
| 8 | ALT | 25 | 7.5% |

**Findings**

- **ROCK is the answer either way** — 238 listings overall (19.1%), and 60 of 333 paid listings
  (18.0%).
- **Removing free events promotes PUNK and METAL and demotes VINYL and ACOUSTIC.** Vinyl is 96.9%
  free and acoustic 83.5%, so they almost vanish from a paid-only view (VINYL falls out of the top
  eight entirely); punk (51.4% free) and metal move up.
- **DANCE was the second-largest atom overall (172 listings), so excluding it is what makes rock
  look dominant.** Rock leads on its own merits, but the gap is 238 vs 137 once dance is removed —
  not the 238 vs 172 it would be with dance included.

---

## 11. Witchhouse Select: a brand tag, not a genre

`WITCHHOUSE SELECT` appears in **37** raw rows, but it is not one of the genre atoms:
normalisation drops it as a brand tag. At listing grain it covers **37** listings (3.0%). It is attached to jazz, punk, house and
festival listings alike, which is why it is treated as branding rather than a genre.

**Venues**

| Venue | Listings |
|---|---:|
| Lass O'Gowrie Hotel | 10 |
| Unknown | 3 |
| King Street Hotel | 2 |
| The Prince | 1 |
| Impulse Response | 1 |
| Maru Hi-Fi | 1 |

Lass O'Gowrie Hotel leads clearly; the remaining venues are one-offs. The `Unknown` bills are:

- 2026-01-31 — Jaie Gon, Precious Metal, Shuvcheck, Assembler Code
- 2026-04-26 — Reptant, Cqllum, Oliver, Ross Mvnro
- 2026-05-15 — 2Gruvy2Hard


**Top 10 artists**

| # | Act | Listings | Venues |
|---:|---|---:|---:|
| 1 | DJ Gunggek | 5 | 5 |
| 2 | Kev Sev | 4 | 3 |
| 3 | High Pass | 3 | 3 |
| 4 | Krisp | 3 | 2 |
| 5 | Michael Dowell | 3 | 2 |
| 6 | Mozz | 3 | 2 |
| 7 | Rose White | 3 | 3 |
| 8 | Assembler Code | 2 | 2 |
| 9 | Charlie Farmer | 2 | 2 |
| 10 | Chow Chow Disco | 2 | 2 |

9 acts tie on 2 listings, so ranks 8–10 are alphabetical representatives of
a larger tie. The tag is a brand marker and is not recorded consistently, so these counts
are lower bounds.

---

## 12. Metal / heavy / hardcore: top 10 artists

Filter: listings tagged **METAL**, **HEAVY** or **HARDCORE** — **72** listings (5.8%), 206 named acts. Acts are counted
once per venue per week, so duplicate posters for the same night do not double-count.

| # | Act | Venue-weeks | Venues |
|---:|---|---:|---:|
| 1 | Disco | 7 | 2 |
| 2 | Fat Monica | 6 | 3 |
| 3 | Deathfeeder | 5 | 2 |
| 4 | Exyle | 5 | 3 |
| 5 | Fatal Excuse | 4 | 1 |
| 6 | Latest God | 4 | 2 |
| 7 | Feign | 3 | 3 |
| 8 | Phantom | 3 | 2 |
| 9 | Torment | 3 | 2 |
| 10 | Virescent | 3 | 2 |

7 acts tie on 3 venue-weeks, so ranks 8–10 are alphabetical
representatives of that tie.

- **Heavy music is a Hamilton Station scene.** 41 of 72 listings (56.9%) are there; King Street Hotel follows with 14.
- **The tag mix is METAL 37, HEAVY 18, HARDCORE 19.** A listing can carry more than one.
- **It is a local-support scene.** 172 of 206 named acts (83.5%) appear only once, and just seven acts reach four or more
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
Result: **1,245 events**, of which **159** carry an `eventPromoters` value across **122** distinct
strings (splitting multi-promoter rows on commas). Before the 2026-11-14 poster pass only **4** rows had
a promoter.

`New Annual` (6) and `Great Southern Nights` (11) lead the raw counts but are excluded from the table:
they are festival/council program brands rather than independent promoters. Removing them leaves:

| # | Promoter | Events |
| ---: | --- | ---: |
| 1 | Kova Events | 10 |
| 2 | Odyssey | 5 |
| 2 | Bad Behaviour | 5 |
| 4 | Groove Street | 3 |
| 4 | 2Gruvy2Hard | 3 |
| 4 | New Brain Communications | 3 |
| 4 | Destroy All Lines | 3 |
| 4 | C.T. | 3 |
| 4 | Powder Your Nose | 3 |

Ranks 4–9 are a six-way tie at 3 events. Seventeen promoters follow on 2 events, including Grindhouse,
Grindhead Records, The Ori, Yours & Owls and Thanks For Coming.

**Findings**

- **Promoter disclosure is the exception, not the rule:** 159 of 1,245 events (12.8%). Most posters do
  not name a promoter at all, so these counts are a floor, not a ranking of who runs the most gigs.
- **Concentration is low.** The largest independent promoter has 10 events across ten months, and only
  after folding `Kova` into `Kova Events`; the next is 5. This is a venue-led scene, consistent with §3
  (five venues = half of all listings), not a promoter-led one.
- **`Kova` and `Kova Events` are the same operator.** The canonical alias lives in the applier and the
  merge script; `C.T.` / `C.T` (4 combined) still differ only in punctuation and are not folded.
- **De-duplication moves the promoter counts.** Collapsing the three 16 Oct Grindhouse rows removed
  two duplicate credits, and merging the three `Dr Sure's Unusual Practice` rows did the same for
  New Brain Communications (4 → 3).
- Some values are venues or event brands rather than promoters (`The Ori`, `Maru Hi-Fi`,
  `Full Send Friday`, `Made On Sunday`), so read the list as "who is credited on the poster".

Re-run: `npm run recheck` (re-extract) → `npm run apply-recheck` (fold findings in) →
`python3 scripts/merge-research-data.py path/to/new-dumps/*.json > researchData/events.json` →
`python3 scripts/dedupe-events.py researchData/events.json --out researchData/events.json`.
The per-date dumps were consolidated into `researchData/events.json` and removed on 2026-11-14.

---

## Corrections to earlier raw-row estimates

> The table below documents the first analysis pass on the 17 Oct dump. The current consolidated
> corpus is **1,245 listings**; the Snapshot and §1–§12 carry the refreshed figures.

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
- Absolute event counts ("1,245 events happened") — the unit is a listing, not an event.
- Any calendar claim ("what's on this Friday") — the timestamp is the day tab and save week.
- Month-over-month trends — six weeks are missing, including all of June plus W18 and W39, and
  W43–W45 are only partially covered.
- Geography, distance or neighbourhood analysis — coordinates are present but not used as reliable
  location data here.
- Artist identity or "top artist" claims — `eventName` mixes artists and named nights, with no ID.
  The bands-vs-DJs ranking in section 9 is the closest defensible reading, and it is heuristic.
- Weekly capacity or attendance — the data records advertising, not ticket sales.

---

## Summary

1. **The usable unit is a listing, not a row.** The four dumps held 1,941 rows; merging and
   de-duplication left 1,245 events, which equal 1,245 listings at (act, venue, ISO week) —
   35.9% of the raw rows were duplicate or near-duplicate.
2. **It is a Thursday–Sunday scene.** 91% of listings sit on those four days; Saturday and Friday are
   tied (355 vs 339), and Sunday is a strong third (262) rather than a quiet night.
3. **Five venues are half the scene.** Lass O'Gowrie (182), Hamilton Station (165), Maru Hi-Fi (127),
   The Oak (98) and King Street (81) produce 52.7% of listings; 5 venues reach 50% and 12 reach 80%,
   with the top ten accounting for 76.3%.
4. **Genre is a property of the room, not the city.** Bernies is 100% dance/LGBTQIA+, The Underground
   100% jazz, The Oak 57% vinyl, The Beauford 73% rock. Only indie+rock and punk+rock appear across
   many venues.
5. **Nearly two-thirds of listings are free (63%).** Where money is charged, it concentrates in King
   Street ($45 median), Stag & Hunter ($34), Hamilton Station ($25) and Lass O'Gowrie ($25). Vinyl and
   acoustic are the free end; punk and rock the paid end.
6. **Bills are short and names are mostly one-off.** Half of all listings are single-act, and 76.0% of
   the 1,783 raw billed strings appear exactly once; only 15 appear 10+ times.
7. **A small permanent core carries the scene.** 27 residencies cover 22.0% of listings, led by Wharf
   Life (35 weeks), BYO Vinyl Night (34) and Open Decks (32); the other 897 act+venue pairs appear once.
8. **The data is honest about its gaps.** Six weeks are missing (all of June plus W18 and W39),
   W43–W45 are only partially covered, 10.3% of prices are unparseable, and W38 is a catch-up spike —
   so this supports a portrait of the scene, not a time series, and not any geographic or
   calendar-specific claim.
9. **The most-featured live act is Rhodes (20 bills across 8 venues and 18 weeks)**, followed by S.M.D
   (16) and Bardvarkk (13). Breeze and Bellicanta's were excluded because their counts come from
   residency listings (`Jazz Night: Breeze` and the weekly Bellicanta's show), not band bookings.
10. **The most-featured DJ is PC Dysco (11 bills, all at The Oak)**, followed by Beam, DJ Qyto and
    Rick A Mortis (9 each). No named DJ exceeds 11 bills because the biggest dance programming is
    event-branded (`Wharf Life`, `Open Decks`).
11. **Excluding FREE and DANCE, ROCK is the leading genre** — 238 listings (19.1%), and still first
    among paid listings at 60 (18.0%); PUNK is second on paid listings (43).
12. **`WITCHHOUSE SELECT` is a brand tag, not a genre.** It appears in 37 raw rows / 37 listings
    (3.0%), most often at Lass O'Gowrie Hotel (10); DJ Gunggek leads the tagged bills with 5, then
    Kev Sev with 4.
13. **Heavy music is concentrated at Hamilton Station.** 41 of 72 metal/heavy/hardcore listings (57%)
    are there; Disco leads the artists with 7 venue-weeks and Fat Monica has 6, while 83.5% of the
    206 acts appear only once.
14. **Promoters are disclosed on only 12.8% of events.** After merging and de-duplicating the four dumps
    into 1,245 events (the per-date dumps were then removed), 159 carry a promoter; excluding the
    `New Annual` and `Great Southern Nights` program brands, **Kova Events leads with 10** (after folding
    in the `Kova` variant), then Odyssey and Bad Behaviour with 5 each (§13).

### Witchhouse Select tables

**Venues with the most `WITCHHOUSE SELECT` listings**

| Venue | Listings |
| --- | ---: |
| Lass O'Gowrie Hotel | 10 |
| Unknown | 3 |
| King Street Hotel | 2 |
| The Prince | 1 |
| Impulse Response | 1 |
| Maru Hi-Fi | 1 |

**Top 10 artists on `WITCHHOUSE SELECT` bills**

| # | Act | Listings | Venues |
| ---: | --- | ---: | ---: |
| 1 | DJ Gunggek | 5 | 5 |
| 2 | Kev Sev | 4 | 3 |
| 3 | High Pass | 3 | 3 |
| 4 | Krisp | 3 | 2 |
| 5 | Michael Dowell | 3 | 2 |
| 6 | Mozz | 3 | 2 |
| 7 | Rose White | 3 | 3 |
| 8 | Assembler Code | 2 | 2 |
| 9 | Charlie Farmer | 2 | 2 |
| 10 | Chow Chow Disco | 2 | 2 |

Full detail, including the three `Unknown` bills, is in §11.
