#!/usr/bin/env python3
"""Tests for the research-data merge heuristics.

Run with: python3 scripts/merge-research-data.test.py
"""

import unittest
from importlib.machinery import SourceFileLoader

merge = SourceFileLoader(
    "merge_research_data", "scripts/merge-research-data.py"
).load_module()


def event(name, venue, when="2026-01-01T00:00:00.000Z", **fields):
    row = {
        "id": f"{name}|{venue}|{when}",
        "eventDateTime": when,
        "eventName": name,
        "venueName": venue,
    }
    row.update(fields)
    return row


class SimilarVenueTest(unittest.TestCase):
    def test_folds_spelling_drift(self):
        for left, right in [
            ("The Oak", "The Oak Hotel"),
            ("Ori Hotel", "The Oriental Hotel"),
            ("Croatian Club", "Croatian Club Side Room"),
            ("Lass O'Gowrie", "Lass O'Gowrie Hotel"),
            ("Bernies Bar", "Bernie's Bar"),
        ]:
            with self.subTest(pair=(left, right)):
                self.assertTrue(
                    merge.similar_venue(merge.venue_key(left), merge.venue_key(right))
                )

    def test_keeps_different_venues_apart(self):
        for left, right in [
            ("Lass O'Gowrie Hotel", "The Underground"),
            ("Bar On The Hill", "Croatian Club"),
            ("King Street Hotel", "Mad Poet"),
        ]:
            with self.subTest(pair=(left, right)):
                self.assertFalse(
                    merge.similar_venue(merge.venue_key(left), merge.venue_key(right))
                )


class ClusterRowsTest(unittest.TestCase):
    def test_collapses_promoter_prefixed_venue(self):
        rows = [
            event("Line-up", "Grindhouse - Croatian Club Side Room"),
            event("Line-up", "Croatian Club", venueAddress="39-41 Hannel St"),
            event("Line-up", "Croatian Wickham Sports Club"),
        ]
        self.assertEqual(len(merge.cluster_rows(rows)), 1)

    def test_keeps_same_event_at_two_venues(self):
        rows = [
            event("Jazz Night", "Lass O'Gowrie Hotel"),
            event("Jazz Night", "The Underground"),
        ]
        self.assertEqual(len(merge.cluster_rows(rows)), 2)

    def test_unknown_venue_joins_the_only_real_venue(self):
        rows = [
            event("Bigelow", "Foundations"),
            event("Bigelow", "Unknown"),
        ]
        self.assertEqual(len(merge.cluster_rows(rows)), 1)

    def test_unknown_venue_stays_alone_with_two_real_venues(self):
        rows = [
            event("Night", "King Street Hotel"),
            event("Night", "The Underground"),
            event("Night", "Unknown"),
        ]
        self.assertEqual(len(merge.cluster_rows(rows)), 3)


class MergeSimilarEventsTest(unittest.TestCase):
    def test_collapses_truncated_lineup(self):
        merged = merge.merge_similar_events(
            [
                event("Mi-Sex, Krisp, Triplespeak, Nite-Rite", "Stag & Hunter Hotel"),
                event("Mi-Sex, Krisp", "Stag & Hunter Hotel"),
            ]
        )
        self.assertEqual(len(merged), 1)
        self.assertTrue(merged[0]["eventName"].startswith("Mi-Sex, Krisp, Triplespeak"))

    def test_collapses_truncated_lineup_with_numbers(self):
        merged = merge.merge_similar_events(
            [
                event(
                    "Adam Newling, Chain Daisy, Ella Day, Angela Rose, Love & Rent, Space-44, Cult Artists",
                    "Lass O'Gowrie",
                ),
                event(
                    "Adam Newling, Chain Daisy, Ella Day, Angela Rose",
                    "Lass O'Gowrie",
                ),
            ]
        )
        self.assertEqual(len(merged), 1)

    def test_collapses_one_word_typo(self):
        merged = merge.merge_similar_events(
            [
                event("Fermento: Sunset Aperitivo Session", "Earp Distillery"),
                event("Fermento: Sunset Apertivo Session", "Earp Distillery"),
            ]
        )
        self.assertEqual(len(merged), 1)

    def test_keeps_different_bills_on_the_same_night(self):
        merged = merge.merge_similar_events(
            [
                event("Jazz Night: Breeze", "The Underground"),
                event("Jazz Night: Bellicanta's", "The Underground"),
            ]
        )
        self.assertEqual(len(merged), 2)

    def test_keeps_a_weekly_residency(self):
        merged = merge.merge_similar_events(
            [
                event("Sunday Club", "Charlies Rooftop", "2026-01-04T00:00:00.000Z"),
                event("Sunday Club", "Charlies Rooftop", "2026-01-11T00:00:00.000Z"),
            ]
        )
        self.assertEqual(len(merged), 2)

    def test_keeps_weekly_vinyl_nights_apart(self):
        merged = merge.merge_similar_events(
            [
                event("Vinyl Night", "Maru Hi-Fi", "2026-08-01T00:00:00.000Z"),
                event("BYO Vinyl Night", "Maru Hi-Fi", "2026-08-05T00:00:00.000Z"),
                event("Vinyl Night", "Maru Hi-Fi", "2026-08-08T00:00:00.000Z"),
                event("BYO Vinyl Night", "Maru Hi-Fi", "2026-08-12T00:00:00.000Z"),
            ]
        )
        self.assertEqual(len(merged), 4)

    def test_collapses_a_one_off_bill_reposted_a_week_later(self):
        merged = merge.merge_similar_events(
            [
                event(
                    "Beans On Toast, Will Varley",
                    "Hamilton Station Hotel",
                    "2026-01-10T00:00:00.000Z",
                ),
                event(
                    "Beans On Toast, Will Varley",
                    "Hamilton Station Hotel",
                    "2026-01-17T00:00:00.000Z",
                ),
            ]
        )
        self.assertEqual(len(merged), 1)

    def test_collapses_the_same_bill_a_day_apart(self):
        merged = merge.merge_similar_events(
            [
                event(
                    "Long Distance, Statik, Deep Sea Treehouse",
                    "Hamilton Station Hotel",
                    "2026-04-08T00:00:00.000Z",
                ),
                event(
                    "Long Distance, Statik, Deep Sea Treehouse",
                    "Hamilton Station Hotel",
                    "2026-04-09T00:00:00.000Z",
                ),
            ]
        )
        self.assertEqual(len(merged), 1)

    def test_keeps_numbered_days_apart(self):
        merged = merge.merge_similar_events(
            [
                event(
                    "Frequency Forest Day 2",
                    "Maitland Showground",
                    "2026-09-18T00:00:00.000Z",
                ),
                event(
                    "Frequency Forest Day 3",
                    "Maitland Showground",
                    "2026-09-19T00:00:00.000Z",
                ),
            ]
        )
        self.assertEqual(len(merged), 2)

    def test_collapses_abbreviated_act(self):
        merged = merge.merge_similar_events(
            [
                event("Laurien, IV, Pheromones, T.P.S", "Stag & Hunter"),
                event("Laurien, IV, Pheromones, Ten Pack Screwdriver", "Stag & Hunter"),
            ]
        )
        self.assertEqual(len(merged), 1)
        self.assertIn("Ten Pack Screwdriver", merged[0]["eventName"])

    def test_collapses_generic_title_against_titled_night(self):
        merged = merge.merge_similar_events(
            [
                event("Jazz Night", "The Underground"),
                event("Jazz Night: Jeremy Borthwick, House Band", "The Underground"),
            ]
        )
        self.assertEqual(len(merged), 1)

    def test_collapses_misread_venue_on_the_same_night(self):
        merged = merge.merge_similar_events(
            [
                event("Other Show", "Bar On The Hill", "2026-03-01T00:00:00.000Z"),
                event("Another Show", "Bar On The Hill", "2026-03-02T00:00:00.000Z"),
                event(
                    "Amity Affliction, In Hearts Wake, Redhook",
                    "Croation Club Wickham",
                    "2026-02-25T00:00:00.000Z",
                    ticketCost="87.00",
                    genres="METAL",
                ),
                event(
                    "Amity Affliction, In Hearts Wake, Redhook",
                    "Bar On The Hill",
                    "2026-02-25T00:00:00.000Z",
                    ticketCost="87.00",
                    genres="METAL",
                ),
            ]
        )
        self.assertEqual(len(merged), 3)
        amity = [row for row in merged if row["eventName"].startswith("Amity")]
        self.assertEqual(len(amity), 1)
        self.assertEqual(amity[0]["venueName"], "Bar On The Hill")

    def test_keeps_two_different_shows_at_two_venues(self):
        merged = merge.merge_similar_events(
            [
                event(
                    "Hottest 100 Party",
                    "The Prince",
                    "2026-01-23T00:00:00.000Z",
                    ticketCost="0.00",
                    genres="DANCE",
                ),
                event(
                    "GABS & Hottest 100 Party",
                    "Shout Brewing",
                    "2026-01-23T00:00:00.000Z",
                    ticketCost="0.00",
                    genres="NONE",
                ),
            ]
        )
        self.assertEqual(len(merged), 2)

    def test_merges_promoter_and_address_from_both_copies(self):
        merged = merge.merge_similar_events(
            [
                event(
                    "Glycerine, The Ben-Jammins, Reigan Stewart",
                    "Beauford Hotel",
                    eventPromoters="Beauford",
                ),
                event(
                    "Glycerine, The Ben-Jammins, Reigen Stewart",
                    "Beauford Hotel",
                    venueAddress="1 Smith St",
                ),
            ]
        )
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].get("eventPromoters"), "Beauford")
        self.assertEqual(merged[0].get("venueAddress"), "1 Smith St")


class PromoterTest(unittest.TestCase):
    def test_folds_kova_alias(self):
        self.assertEqual(
            merge.canonicalise_promoters("Kova, Kova Events, Thanks For Coming"),
            "Kova Events, Thanks For Coming",
        )

    def test_treats_sirocco_as_a_promoter(self):
        self.assertEqual(merge.split_venue("Sirocco"), ("Unknown", "Sirocco"))
        self.assertEqual(merge.split_venue("Sirocco Meantime"), ("Meantime", "Sirocco"))
        self.assertEqual(merge.split_venue("Odyssey - Sirocco"), ("Unknown", "Odyssey"))

    def test_treats_ode_as_a_promoter(self):
        self.assertEqual(merge.split_venue("Ode"), ("Unknown", "Ode"))
        self.assertEqual(merge.split_venue("The Ode"), ("The Ode", None))
        self.assertEqual(merge.split_venue("The Ode Bar"), ("The Ode Bar", None))

    def test_treats_made_on_sunday_as_a_promoter(self):
        self.assertEqual(
            merge.split_venue("Made On Sunday"), ("Unknown", "Made On Sunday")
        )

    def test_folds_the_ct_punctuation_variant(self):
        self.assertEqual(merge.canonicalise_promoters("C.T, C.T."), "C.T.")


if __name__ == "__main__":
    unittest.main()
