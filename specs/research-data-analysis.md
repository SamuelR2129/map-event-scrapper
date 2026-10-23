# Research data analysis — what the posters actually show

Source: `researchData/events-2026-10-17.json` (1,743 rows from 245 images)
Window: 2026-01-07 → 2026-10-18, across 35 ISO weeks with data
Grain used below: **1,225 listings** (act + venue + ISO week)
Reproduce: `python3 scripts/research-data-analysis.py`
Method, caveats and the investigation behind the cleaning: [`research-data-methodology.md`](./research-data-methodology.md)

## Direct answers

| Question | Answer |
| --- | --- |
| Most-featured live act (band/soloist) | **Rhodes** — 19 bills across 7 venues and 17 weeks (§9) |
| Most-featured DJ | **PC Dysco** — 11 bills, all at The Oak (§9) |
| Most-featured genre excluding FREE and DANCE | **ROCK** — 242 listings (19.8%); still first among paid listings at 58 (18.2%) (§10) |
| Venue with the most `WITCHHOUSE SELECT` listings | **Lass O'Gowrie Hotel** — 9 of 37 (§11) |
| Most-featured metal/heavy/hardcore act | **Disco and Fat Monica** — 6 venue-weeks each (§12) |

Breeze and Bellicanta's are excluded from the act ranking: 18 of Breeze's 25 bills come from the
event title `Jazz Night: Breeze`, and all 13 of Bellicanta's bills are one weekly solo residency at
Theydy's. Both measure a residency listing rather than band bookings. Raw billed strings (1,699) are
not the same as named acts (1,555) — see §9 for the difference.

---

## Definitions used

| Term | Meaning |
| --- | --- |
| **Row** | One event as extracted from one poster image (1,743 of them). |
| **Listing** | A unique act + venue + ISO week. Same act/venue in different weeks is **not** a duplicate. |
| **Series** | The same act + venue appearing in 2+ weeks. A **residency** is 3+ weeks. |
| **Free** | Price parsed as `0` or the `FREE` tag was present. |
| **Unknown price** | Anything unparseable (`"undefined"`, `""`, `"N/A"`, `"Unknown"`, …) — never coerced to 0. |
| **Day** | The day tab the listing came from (Wed–Sun), not the event's calendar date. |

All timestamps were converted to `Australia/Sydney` before grouping. `venueName` was canonicalised
from 140 raw spellings to 75 venues; `lngLat` and `venueAddress` had already been removed, so this
analysis makes **no geographic claims**.

---

## Snapshot

| Metric | Value |
| --- | --- |
| Raw rows | 1,743 |
| Listings after dedupe | **1,225** (518 rows collapsed, 29.7%) |
| Distinct act+venue pairs | 929 |
| Canonical venues | 75 (from 140 spellings) |
| Active weeks | 35 of 41 in range — 6 missing |
| Listings per active week | median 33 (range 26–65) |
| Free / paid / unknown | **64.0% / 26.0% / 10.0%** |
| Median paid price | **$25** (p25 $15, p75 $40) |
| Names billed exactly once | **74.2%** |
| Recurring series (3+ weeks) | 27, covering 22.3% of listings |

---

## 1. Rhythm: a Thursday–Sunday scene

```
Sat  ████████████████████████████████████  345  28.2%
Fri  ███████████████████████████████████   334  27.3%
Sun  ███████████████████████████           260  21.2%
Thu  ██████████████████                    173  14.1%
Wed  ███████████                           113   9.2%
```

| Day | Listings | Share | Free | Paid | Unknown | Median paid (n) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Wed | 113 | 9.2% | 103 | 7 | 3 | $40 (7) |
| Thu | 173 | 14.1% | 114 | 53 | 6 | $10 (53) |
| Fri | 334 | 27.3% | 189 | 99 | 46 | $25 (99) |
| Sat | 345 | 28.2% | 178 | 126 | 41 | $26 (126) |
| Sun | 260 | 21.2% | 200 | 33 | 27 | $33 (33) |

**Findings**

- **91% of listings sit on Thursday–Sunday.** Wednesday is a minor night.
- **Saturday and Friday are effectively tied** (345 vs 334). The raw file made Friday look dominant
  because of duplicate rows; at listing grain the weekend is balanced.
- **Sunday is the free night**: 76.9% free versus 51.6% on Saturday. It is the third-busiest night,
  not a wind-down.
- **Saturday carries most of the paid market** (126 paid listings, 40% of all paid listings).
- Wednesday's $40 median rests on **7 paid listings** — not a number to quote.

---

## 2. Coverage: six missing weeks and one catch-up spike

| Measure | Value |
| --- | --- |
| Active weeks | 35 |
| Missing weeks inside range | **6** — 2026-W18, W23, W24, W25, W26, W39 |
| Median listings per active week | 33 (mean 35) |
| Median distinct venues per week | 16 |
| Busiest week | 2026-W38, 65 listings |
| Quietest week | 2026-W41, 26 listings |

`W23–W26` is the whole of June. There are **no source images** for June either, so this is a capture
gap, not a collapse in the scene. `W38` at 65 listings is a catch-up batch (about 2× median), not a
festival week.

**Implication:** any month-over-month or "scene growth" trend from this data is an artefact. Weekly
volume is usable only to describe poster coverage.

---

## 3. Concentration: five venues are half the scene

| Measure | Value |
| --- | --- |
| Canonical venues | 75 |
| Venues needed for 50% of listings | **5** |
| Venues needed for 80% | **12** |
| Top 10 share | **76.6%** |
| HHI | 757 → equivalent to ~13 equal-sized venues |
| Gini | 0.787 |
| Venues with a single listing | 32 |

| # | Venue | Listings | Share | Weeks active | Free | Paid | Unknown | Median paid | Top night |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Lass O'Gowrie Hotel | 176 | 14.4% | 35 | 115 | 51 | 10 | $25 | Fri |
| 2 | Hamilton Station Hotel | 161 | 13.1% | 35 | 91 | 60 | 10 | $25 | Fri |
| 3 | Maru Hi-Fi | 128 | 10.5% | 35 | 128 | 0 | 0 | — | Thu |
| 4 | The Oak | 97 | 7.9% | 35 | 91 | 1 | 5 | $15 | Fri |
| 5 | King Street Hotel | 81 | 6.6% | 34 | 14 | 55 | 12 | $49 | Fri |
| 6 | The Ori | 74 | 6.0% | 27 | 72 | 0 | 2 | — | Sat |
| 7 | Bernies Bar | 73 | 6.0% | 35 | 62 | 5 | 6 | $10 | Sat |
| 8 | Stag & Hunter Hotel | 67 | 5.5% | 34 | 24 | 33 | 10 | $34 | Fri |
| 9 | The Beauford Hotel | 45 | 3.7% | 33 | 19 | 0 | 26 | — | Fri |
| 10 | Croatian Club | 36 | 2.9% | 22 | 12 | 22 | 2 | $18 | Sat |
| 11 | The Underground | 36 | 2.9% | 32 | 3 | 33 | 0 | $10 | Thu |
| 12 | Queens Wharf Hotel | 34 | 2.8% | 34 | 34 | 0 | 0 | — | Sun |

**Findings**

- The top three venues alone produce **38%** of all listings, and the top five cross half (52.5%).
- They are also the most *intensive*: Lass O'Gowrie averages **5.0 listings per active week**,
  Hamilton Station 4.6, Maru Hi-Fi 3.7. Most venues average 1–2.
- The long tail is thin but real: 32 of 75 venues appear exactly once in ten months.
- `Top 10 = 76.6%` is measured against all 1,225 listings. Six rows carry the literal venue
  `Unknown`; they are excluded from the ranking but included in the denominator, so the shares in
  the table sum to 99.5%.

---

## 4. Genre is venue-shaped, not scene-shaped

| Measure | Value |
| --- | --- |
| Listings with a genre | 1,208 (98.6%) |
| Distinct genre atoms | 53 |
| Genres per tagged listing | 1.36 (33.5% multi-genre) |

| # | Genre | Listings | Share of tagged |
| ---: | --- | ---: | ---: |
| 1 | ROCK | 242 | 20.0% |
| 2 | DANCE | 169 | 14.0% |
| 3 | JAZZ | 136 | 11.3% |
| 4 | VINYL | 131 | 10.8% |
| 5 | INDIE | 127 | 10.5% |
| 6 | ACOUSTIC | 106 | 8.8% |
| 7 | PUNK | 104 | 8.6% |
| 8 | LGBTQIA+ | 80 | 6.6% |
| 9 | ALT | 63 | 5.2% |
| 10 | TECHNO | 48 | 4.0% |
| 11 | BLUES | 42 | 3.5% |
| 12 | HOUSE | 38 | 3.1% |
| 13 | DJ | 38 | 3.1% |
| 14 | METAL | 37 | 3.1% |
| 15 | COUNTRY | 32 | 2.6% |

**Venue specialisation** (share of that venue's tagged listings in its top genre):

| Venue | Top genre | Share |
| --- | --- | ---: |
| Bernies Bar | DANCE | 100.0% |
| The Underground | JAZZ | 100.0% |
| Queens Wharf Hotel | DANCE | 94.1% |
| The Beauford Hotel | ROCK | 73.3% |
| The Oak | VINYL | 58.3% |
| Maru Hi-Fi | VINYL | 50.0% |
| Hamilton Station Hotel | ROCK | 40.0% |
| The Ori | ACOUSTIC | 36.6% |

**Pairings are mostly one venue's signature, not a scene-wide blend:**

| Pair | Listings | Concentration |
| --- | ---: | --- |
| DANCE + LGBTQIA+ | 80 | 91.2% at Bernies Bar |
| INDIE + ROCK | 47 | spread across 10 venues |
| PUNK + ROCK | 35 | spread across 12 venues |
| HOUSE + TECHNO | 19 | 89.5% at Lass O'Gowrie |
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
| Free | 784 (64.0%) |
| Paid | 318 (26.0%) |
| Unknown | 123 (10.0%) |
| Paid median | $25 (p25 $15, p75 $40) |
| Paid mean | $32.02 |
| Paid range | $5–$124 |

| Price band | Paid listings | Share |
| --- | ---: | ---: |
| < $10 | 3 | 0.9% |
| $10–19 | 94 | 29.6% |
| $20–29 | 79 | 24.8% |
| $30–39 | 60 | 18.9% |
| $40–59 | 46 | 14.5% |
| $60+ | 36 | 11.3% |

**Free share by genre**

| Genre | Listings | Free | Free share |
| --- | ---: | ---: | ---: |
| ROCK | 242 | 136 | 56.2% |
| DANCE | 169 | 121 | 71.6% |
| JAZZ | 136 | 100 | 73.5% |
| VINYL | 131 | 127 | **96.9%** |
| INDIE | 127 | 73 | 57.5% |
| ACOUSTIC | 106 | 89 | 84.0% |
| PUNK | 104 | 55 | **52.9%** |
| LGBTQIA+ | 80 | 64 | 80.0% |

**Findings**

- **64% of listings are free.** The paid market is not spread evenly: King Street Hotel ($49 median,
  55 paid listings), Stag & Hunter ($34, 33), Hamilton Station ($25, 60), Lass O'Gowrie ($25, 51),
  Croatian Club ($18, 22) and The Underground ($10, 33) account for most paid entries.
- **Entire rooms are free**: Maru Hi-Fi (128/128), Queens Wharf (34/34), The Ori (72 free of 74),
  The Oak (91 of 97).
- **Vinyl and acoustic are the free end** (96.9% and 84.0%); **punk and rock are the paid end**
  (52.9% and 56.2% free).
- **$60+ is a real tier** — 36 paid listings (11.3% of paid), so the distribution has a long right tail
  rather than clustering under $30.
- **123 prices (10%) are unknown** and are excluded from every paid statistic. The paid median is
  therefore a median of *known* prices, not of the whole scene.

---

## 6. Bills and names: a long tail with a small permanent core

| Measure | Value |
| --- | --- |
| Distinct billed names | 1,699 |
| Billed exactly once | **1,260 (74.2%)** |
| Billed 2–3 times | 312 (18.4%) |
| Billed 4–9 times | 109 (6.4%) |
| Billed 10+ times | 18 (1.1%) |
| Median acts per listing | 1 |

These are raw bill strings; after removing programme titles, merging spelling variants and dropping
the two residency acts, §9 counts 1,555 named acts.

| Acts on bill | Listings |
| --- | ---: |
| 1 | 625 |
| 2 | 158 |
| 3 | 214 |
| 4 | 100 |
| 5 | 50 |
| 6–9 | 63 |
| 10+ | 15 |

**Most-billed entries**

| # | Name | Listings | Venues | Weeks |
| ---: | --- | ---: | ---: | ---: |
| 1 | Jazz Night | 35 | 2 | 30 |
| 2 | Wharf Life | 34 | 1 | 34 |
| 3 | BYO Vinyl Night | 33 | 1 | 33 |
| 4 | Open Decks | 33 | 1 | 33 |
| 5 | Rhodes | 19 | 7 | 17 |
| 6 | Jazz Night: Breeze | 18 | 1 | 18 |
| 7 | Rose White | 16 | 8 | 16 |
| 8 | Sunday Club | 16 | 1 | 16 |
| 9 | Lvl 1 District Saturdays | 15 | 1 | 15 |
| 10 | Bardvarkk | 13 | 3 | 12 |

**Findings**

- **The long tail dominates:** three-quarters of billed names appear once in ten months.
- **Half the listings are single-act bills** (625 of 1,225); the median bill has one name.
  Three-act bills are the second mode (214), then four (100).
- **Two different populations sit in the same column.** Wharf Life (34 listings, 1 venue),
  BYO Vinyl Night (33, 1) and Open Decks (33, 1) are weekly fixtures. Rhodes (19 listings across
  **7 venues**), Rose White (16 across **8**), Gauze (11 across **9**) and Trophy Wyfe (11 across **7**)
  are touring acts. The first group is programming; the second is a booking circuit.
- **Caveat:** `eventName` mixes artists and named nights ("Jazz Night", "Open Decks", "Sunday Club"),
  so this table ranks *bill entries*, not artist identities. There is no artist ID in the data.

---

## 7. Residencies: 27 series carry 22% of listings

| Series length | Series |
| --- | ---: |
| 1 week only | 852 |
| 2 weeks | 50 |
| 3+ weeks | **27** |

| Measure | Value |
| --- | --- |
| Distinct act+venue pairs | 929 |
| Series reappearing in 2+ weeks | 77 |
| Residencies (3+ weeks) | 27 |
| Listings belonging to a residency | 273 (22.3%) |

| Series | Venue | Weeks | Night |
| --- | --- | ---: | --- |
| Wharf Life | Queens Wharf Hotel | 34 | Sun |
| BYO Vinyl Night | Maru Hi-Fi | 33 | Thu |
| Open Decks | Lass O'Gowrie Hotel | 33 | Wed |
| Jazz Night | The Underground | 20 | Thu |
| Jazz Night: Breeze | Lass O'Gowrie Hotel | 18 | Thu |
| Sunday Club | Charlies Rooftop | 16 | Sun |
| Jazz Night | Lass O'Gowrie Hotel | 15 | Thu |
| Lvl 1 District Saturdays | Gallipoli House | 15 | Sat |
| Bellicanta's | Theydy's | 13 | Wed |
| Vinyl Night | Maru Hi-Fi | 11 | Sun |

**Findings**

- **The scene is a stable weekly grid plus a large one-off layer.** 852 of 929 act+venue pairs appear
  in only one week, yet 27 series account for almost a quarter of all listings.
- **Three series run essentially every week:** Wharf Life (34 of 35), BYO Vinyl Night (33) and
  Open Decks (33). Jazz Night adds two sequential runs — 20 weeks at The Underground and 15 at
  Lass O'Gowrie — appearing in 30 distinct weeks under the same name.
- **The same name can be two different runs.** "Jazz Night" at Lass O'Gowrie (W02–W16) and at The
  Underground (W03–W40) are sequential venue-specific series, not one touring night.
- The Wednesday and Sunday nights in the list are what keep those low-volume days alive.

---

## 8. Data quality scorecard

| Check | Result |
| --- | --- |
| Rows collapsed in dedupe | 518 (29.7%) |
| Duplicate groups with conflicting genres | 13 |
| Duplicate groups with conflicting prices | 1 |
| Venue spellings merged | 140 → 75 |
| Price unusable | 123 (10.0%) |
| Genre missing | 17 (1.4%) |
| Weeks missing inside range | 6 |
| Single-listing venues | 32 |
| Venue literally `Unknown` | 6 |

- **Genre missing is 17, not 11:** 11 rows had no genre, and 6 more contained only `FREE`, which is
  lifted out as a price flag and leaves no genre behind.
- **The 10% unknown price rate is the main analysis risk.** It is not random: The Beauford has 26
  unknown prices out of 45, so its free-vs-paid split is mostly inference.
- **Dedupe conflicts are rare** (13 genre, 1 price), which suggests the duplicate rows were failing on
  address/coordinates — now removed — rather than on the fields used here.

---

## 9. Most-featured acts: live acts vs DJs

There is **no artist-type field** in the data, so this split is derived: each billed name is
classified by the genres it appears under (electronic/techno/house/DJ/vinyl → DJ; rock/punk/jazz/
acoustic/indie → live act), with manual overrides where the genre mix is misleading. Names that are
programme titles (`Wharf Life`, `Open Decks`, `BYO Vinyl Night`, `Jazz Night`, Bernies theme nights)
are excluded; `Jazz Night: <act>` is credited to the act after the colon.

**Breeze and Bellicanta's are excluded from the ranking.** 18 of Breeze's 25 bills come from the
recurring event title `Jazz Night: Breeze`, and Bellicanta's 13 bills are a single weekly solo
residency at Theydy's. Both counts measure a residency listing rather than band bookings. Breeze's
remaining 7 standalone jazz bills fall outside the top 10; Bellicanta's has no bills outside the
residency.

After removing programme titles, spelling variants and the two excluded acts: **1,555 named acts** —
1,089 live acts, 413 DJs, 53 unclassified.

**Live acts (bands & soloists) — top 10 by bill appearances**

| # | Act | Bills | Solo | Venues | Weeks | Top genres |
|---:|---|---:|---:|---:|---:|---|
| 1 | Rhodes | 19 | 0 | 7 | 17 | ROCK, INDIE, FUNK |
| 2 | S.M.D | 15 | 0 | 6 | 13 | PUNK, ROCK, BLUES |
| 3 | Bardvarkk | 13 | 0 | 3 | 12 | PUNK, ROCK, ALT |
| 4 | Gauze | 11 | 0 | 9 | 8 | PUNK, ROCK, ALT |
| 5 | Trophy Wyfe | 11 | 0 | 7 | 10 | ROCK, PUNK, INDIE |
| 6 | Adam Miller | 10 | 10 | 5 | 9 | ACOUSTIC, JAZZ |
| 7 | Charlie Farmer | 10 | 0 | 8 | 9 | ROCK, INDIE, PSYCH |
| 8 | Cormac Grant | 10 | 3 | 4 | 9 | ACOUSTIC, FOLK, INDIE |
| 9 | LauraPanic | 10 | 0 | 3 | 9 | PUNK, ROCK, ALT |
| 10 | Laurien | 10 | 0 | 6 | 6 | ROCK, INDIE, ALT |

**DJs — top 10 by bill appearances**

| # | Act | Bills | Solo | Venues | Weeks | Top genres |
|---:|---|---:|---:|---:|---:|---|
| 1 | PC Dysco | 11 | 3 | 1 | 11 | VINYL, ROCK, INDIE |
| 2 | DJ Qyto | 9 | 0 | 4 | 9 | HOUSE, TECHNO, AFROBEATS |
| 3 | Rick A Mortis | 9 | 0 | 1 | 9 | VINYL, ALT, COUNTRY |
| 4 | Black Tiger | 8 | 2 | 1 | 7 | VINYL, ALT, JAZZ |
| 5 | High Pass | 8 | 0 | 5 | 8 | TECHNO, ALT, ELECTRONIC |
| 6 | Beam | 7 | 0 | 1 | 7 | TECHNO, HOUSE, BASS |
| 7 | JYC | 7 | 3 | 4 | 6 | HOUSE, VINYL, TECHNO |
| 8 | Lello | 7 | 0 | 2 | 7 | TECHNO, HOUSE, BASS |
| 9 | DJ Gunggek | 6 | 0 | 3 | 6 | HOUSE, ELECTRONIC, TECHNO |
| 10 | Homebody | 6 | 0 | 3 | 5 | ELECTRONIC, BREAKS, HOUSE |

Unclassified (genre profile gives no clear signal): Rose White (16), The Pins (3), Fringe Feast (2), DJ Surian (2), Alexander Ireland & The Glowing Union (2)

**Findings**

- **Rhodes is the most-featured live act** — 19 bills across 7 venues and 17 weeks. Gauze (11 bills
  across 9 venues) and Charlie Farmer (10 across 8) are similarly itinerant, the signature of a
  support-circuit band rather than a resident.
- **Volume is not the same as headlining.** Bardvarkk and Trophy Wyfe reach 13 and 11 bills but
  appear entirely in support slots (0 solo bills), while Adam Miller's 10 bills are all solo sets.
- **Solo acts look different from bands.** Adam Miller plays 10 solo bills across 5 venues; Rhodes
  plays 19 bills across 7 venues as a band. Neither pattern is a single-room residency.
- **No DJ exceeds 11 bills**, and the top three DJs are all vinyl selectors tied to The Oak
  (PC Dysco, Rick A Mortis, Black Tiger). Their definition as "DJ" is a judgement call: they are
  billed alongside bands, often last, and may be reading the room between sets rather than
  headlining.
- **The biggest DJ programming is event-branded, not artist-branded.** `Wharf Life` (34 weeks) and
  `Open Decks` (33) are excluded as programme titles; no named DJ comes close to those runs. DJ
  culture here is a night, not a roster.
- **Rose White is the one material omission**: 16 bills across 8 venues, mixing electronic, punk and
  alt line-ups. There is no defensible way to call them band or DJ from this data, so they are
  reported as unclassified rather than forced into a bucket.

---

## 10. Most-featured genre excluding FREE and DANCE

`FREE` is a price flag in this dataset, not a genre atom, so it never enters the genre counts.
Excluding `DANCE`:

| # | Genre | Listings | Share of all 1,225 |
| ---: | --- | ---: | ---: |
| 1 | **ROCK** | 242 | **19.8%** |
| 2 | JAZZ | 136 | 11.1% |
| 3 | VINYL | 131 | 10.7% |
| 4 | INDIE | 127 | 10.4% |
| 5 | ACOUSTIC | 106 | 8.7% |
| 6 | PUNK | 104 | 8.5% |
| 7 | LGBTQIA+ | 80 | 6.5% |
| 8 | ALT | 63 | 5.1% |

If "not free" is read literally as **paid listings only** (price > 0), the ranking changes at the
top of the tail but not the winner:

| # | Genre | Paid listings | Share of 318 |
| ---: | --- | ---: | ---: |
| 1 | **ROCK** | 58 | **18.2%** |
| 2 | PUNK | 41 | 12.9% |
| 3 | JAZZ | 35 | 11.0% |
| 4 | INDIE | 32 | 10.1% |
| 5 | HOUSE | 30 | 9.4% |
| 6 | TECHNO | 28 | 8.8% |
| 7 | METAL | 27 | 8.5% |
| 8 | ALT | 23 | 7.2% |

**Findings**

- **ROCK is the answer either way** — 242 listings overall (19.8%), and 58 of 318 paid listings
  (18.2%).
- **Removing free events promotes PUNK and METAL and demotes VINYL and ACOUSTIC.** Vinyl is 96.9%
  free and acoustic 84.0%, so they almost vanish from a paid-only view (VINYL falls out of the top
  eight entirely); punk (52.9% free) and metal move up.
- **DANCE was the second-largest atom overall (169 listings), so excluding it is what makes rock
  look dominant.** Rock leads on its own merits, but the gap is 242 vs 136 once dance is removed —
  not the 242 vs 169 it would be with dance included.

---

## 11. Witchhouse Select: a brand tag, not a genre

`WITCHHOUSE SELECT` appears in **56** raw rows, but it is not one of the genre atoms:
normalisation drops it as a brand tag. At listing grain it covers **37** listings (3.0%). It is attached to jazz, punk, house and
festival listings alike, which is why it is treated as branding rather than a genre.

**Venues**

| Venue | Listings |
|---|---:|
| Lass O'Gowrie Hotel | 9 |
| Unknown | 4 |
| Ode | 2 |
| Groove Street | 2 |
| King Street Hotel | 2 |
| The Prince | 1 |

Lass O'Gowrie Hotel leads clearly. Ode, Groove Street and King Street Hotel follow with 2
each. The `Unknown` bills are:

- 2026-01-31 — Jaie Gon, Precious Metal, Shuvcheck, Assembler Code
- 2026-04-26 — Reptant, Cqllum, Oliver, Ross Mvnro
- 2026-05-15 — 2Gruvy2Hard
- 2026-09-05 — Hand Modelz, Gauze, Poal, Laurien, F.O.B.

The 2026-09-05 bill also appears at Orb in the same week, so it is counted twice and is not genuinely unlocated.


**Top 10 artists**

| # | Act | Listings | Venues |
|---:|---|---:|---:|
| 1 | DJ Gunggek | 4 | 4 |
| 2 | High Pass | 3 | 3 |
| 3 | Kev Sev | 3 | 3 |
| 4 | Krisp | 3 | 2 |
| 5 | Laurien | 3 | 3 |
| 6 | Mozz | 3 | 2 |
| 7 | Rose White | 3 | 3 |
| 8 | Assembler Code | 2 | 2 |
| 9 | Chow Chow Disco | 2 | 2 |
| 10 | Claire O'Brien | 2 | 2 |

13 acts tie on 2 listings, so ranks 8–10 are alphabetical representatives of
a larger tie. The tag is a brand marker and is not recorded consistently, so these counts
are lower bounds.

---

## 12. Metal / heavy / hardcore: top 10 artists

Filter: listings tagged **METAL**, **HEAVY** or **HARDCORE** — **73** listings (6.0%), 204 named acts. Acts are counted
once per venue per week, so duplicate posters for the same night do not double-count.

| # | Act | Venue-weeks | Venues |
|---:|---|---:|---:|
| 1 | Disco | 6 | 2 |
| 2 | Fat Monica | 6 | 3 |
| 3 | Deathfeeder | 5 | 2 |
| 4 | Fatal Excuse | 5 | 1 |
| 5 | Exyle | 4 | 3 |
| 6 | Latest God | 4 | 2 |
| 7 | Where The Devil | 4 | 1 |
| 8 | Cutthroat | 3 | 1 |
| 9 | Feign | 3 | 3 |
| 10 | Russian Novel | 3 | 2 |

6 acts tie on 3 venue-weeks, so ranks 8–10 are alphabetical
representatives of that tie.

- **Heavy music is a Hamilton Station scene.** 40 of 73 listings (54.8%) are there; King Street Hotel follows with 14.
- **The tag mix is METAL 37, HEAVY 19, HARDCORE 19.** A listing can carry more than one.
- **It is a local-support scene.** 165 of 204 named acts (80.9%) appear only once, and just seven acts reach four or more
  venue-weeks.
- **Name merges:** `Disco` includes `DISCO` and `D.I.S.C.O`; `Deathfeeder` includes
  `DeathFeeder` and `Death Feeder`.
- **Feign** has four bill strings but three venue-weeks: the 16 Jan Lass O'Gowrie poster is
  duplicated.

---

## Corrections to earlier raw-row estimates

The first pass worked on raw rows. At listing grain, several figures move:

| Metric | Raw rows | Listing grain |
| --- | ---: | ---: |
| Listings | 1,239 | **1,225** |
| Act+venue pairs | 950 | **929** |
| Recurring series | 365 | **77 (2+ weeks), 27 (3+ weeks)** |
| Names billed once | 792 of 1,705 (46%) | **1,260 of 1,699 (74%)** |
| Free share of priced | 70.6% | **71.1%** |

- **Listings fell by 14** because canonicalising 140 venue spellings to 75 made some rows collapse
  that had previously been distinct.
- **"365 recurring series" was inflated.** That count was repeated `(name, venue)` pairs *including
  same-week duplicates*. Real recurrence is 77 series, of which 27 are residencies.
- **The one-off rate rose from 46% to 74%** because within-week duplicates were artificially
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
- Absolute event counts ("1,743 events happened") — the unit is a listing, not an event.
- Any calendar claim ("what's on this Friday") — the timestamp is the day tab and save week.
- Month-over-month trends — six missing weeks, including all of June.
- Geography, distance or neighbourhood analysis — coordinates were removed as unreliable.
- Artist identity or "top artist" claims — `eventName` mixes artists and named nights, with no ID.
  The bands-vs-DJs ranking in section 9 is the closest defensible reading, and it is heuristic.
- Weekly capacity or attendance — the data records advertising, not ticket sales.

---

## Summary

1. **The usable unit is a listing, not a row.** 1,743 raw rows collapse to 1,225 listings after
   dedupe at (act, venue, ISO week) — 29.7% of the file is duplication.
2. **It is a Thursday–Sunday scene.** 91% of listings sit on those four days; Saturday and Friday are
   tied (345 vs 334), and Sunday is a strong third (260) rather than a quiet night.
3. **Five venues are half the scene.** Lass O'Gowrie (176), Hamilton Station (161), Maru Hi-Fi (128),
   The Oak (97) and King Street (81) produce 52.5% of listings; 5 venues reach 50% and 12 reach 80%,
   with the top ten accounting for 76.6%.
4. **Genre is a property of the room, not the city.** Bernies is 100% dance, The Underground 100% jazz,
   The Oak 58% vinyl, The Beauford 73% rock. Only indie+rock and punk+rock appear across many venues.
5. **Two-thirds of listings are free (64%).** Where money is charged, it concentrates in King Street
   ($49 median), Stag & Hunter ($34), Hamilton Station and Lass O'Gowrie ($25). Vinyl and acoustic are
   the free end; punk and rock the paid end.
6. **Bills are short and names are mostly one-off.** Half of all listings are single-act, and 74.2% of
   the 1,699 raw billed strings appear exactly once; only 18 appear 10+ times.
7. **A small permanent core carries the scene.** 27 residencies cover 22.3% of listings, led by Wharf
   Life (34 weeks), BYO Vinyl Night (33) and Open Decks (33); the other 852 act+venue pairs appear once.
8. **The data is honest about its gaps.** Six weeks are missing (all of June plus W18 and W39), 10% of
   prices are unparseable, and W38 is a catch-up spike — so this supports a portrait of the scene, not
   a time series, and not any geographic or calendar-specific claim.
9. **The most-featured live act is Rhodes (19 bills across 7 venues and 17 weeks)**, followed by S.M.D
   (15) and Bardvarkk (13). Breeze and Bellicanta's were excluded because their counts come from
   residency listings (`Jazz Night: Breeze` and the weekly Bellicanta's show), not band bookings.
10. **The most-featured DJ is PC Dysco (11 bills, all at The Oak)**, followed by Rick A Mortis (9) and
    DJ Qyto (9). No named DJ exceeds 11 bills because the biggest dance programming is event-branded
    (`Wharf Life`, `Open Decks`).
11. **Excluding FREE and DANCE, ROCK is the leading genre** — 242 listings (19.8%), and still first
    among paid listings at 58 (18.2%); PUNK is second on paid listings (41).
12. **`WITCHHOUSE SELECT` is a brand tag, not a genre.** It appears in 56 raw rows / 37 listings
    (3.0%), most often at Lass O'Gowrie Hotel (9); DJ Gunggek leads the tagged bills with 4.
13. **Heavy music is concentrated at Hamilton Station.** 40 of 73 metal/heavy/hardcore listings (55%)
    are there; Disco and Fat Monica lead the artists with 6 venue-weeks each, and 81% of the 204 acts
    appear only once.

### Witchhouse Select tables

**Venues with the most `WITCHHOUSE SELECT` listings**

| Venue | Listings |
| --- | ---: |
| Lass O'Gowrie Hotel | 9 |
| Unknown | 4 |
| Ode | 2 |
| Groove Street | 2 |
| King Street Hotel | 2 |

**Top 10 artists on `WITCHHOUSE SELECT` bills**

| # | Act | Listings | Venues |
| ---: | --- | ---: | ---: |
| 1 | DJ Gunggek | 4 | 4 |
| 2 | High Pass | 3 | 3 |
| 3 | Kev Sev | 3 | 3 |
| 4 | Krisp | 3 | 2 |
| 5 | Laurien | 3 | 3 |
| 6 | Mozz | 3 | 2 |
| 7 | Rose White | 3 | 3 |
| 8 | Assembler Code | 2 | 2 |
| 9 | Chow Chow Disco | 2 | 2 |
| 10 | Claire O'Brien | 2 | 2 |

Full detail, including the four `Unknown` bills, is in §11.
