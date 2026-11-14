#!/usr/bin/env python3
"""Tests for the (eventName, eventDateTime) de-duplication script.

Run with: python3 scripts/dedupe-events.test.py
"""

import unittest
from importlib.machinery import SourceFileLoader

dedupe_events = SourceFileLoader(
    "dedupe_events", "scripts/dedupe-events.py"
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


class DedupeTest(unittest.TestCase):
    def test_collapses_same_name_time_and_venue(self):
        rows = [
            event("Big Night", "The Oak", ticketCost="10.00"),
            event("Big Night", "The Oak", genres="ROCK", lngLat=[151.0, -32.0]),
        ]
        result, removed = dedupe_events.dedupe(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(removed, 1)
        self.assertEqual(result[0]["ticketCost"], "10.00")
        self.assertEqual(result[0]["genres"], "ROCK")
        self.assertEqual(result[0]["lngLat"], [151.0, -32.0])

    def test_keeps_same_name_time_at_two_venues(self):
        rows = [
            event("Jazz Night", "Lass O'Gowrie Hotel", ticketCost="0.00"),
            event("Jazz Night", "The Underground", ticketCost="10.00"),
        ]
        result, removed = dedupe_events.dedupe(rows)
        self.assertEqual(len(result), 2)
        self.assertEqual(removed, 0)

    def test_strict_collapses_across_venues(self):
        rows = [
            event("Jazz Night", "Lass O'Gowrie Hotel", ticketCost="0.00"),
            event("Jazz Night", "The Underground", ticketCost="10.00"),
        ]
        result, removed = dedupe_events.dedupe(rows, strict=True)
        self.assertEqual(len(result), 1)
        self.assertEqual(removed, 1)

    def test_blank_venue_joins_the_only_named_venue(self):
        rows = [
            event("Big Night", "Unknown"),
            event("Big Night", "The Oak", venueAddress="1 Smith St"),
        ]
        result, removed = dedupe_events.dedupe(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(removed, 1)
        self.assertEqual(result[0]["venueName"], "The Oak")

    def test_blank_venue_stays_with_two_named_venues(self):
        rows = [
            event("Night", "Unknown"),
            event("Night", "The Oak"),
            event("Night", "The Underground"),
        ]
        result, removed = dedupe_events.dedupe(rows)
        self.assertEqual(len(result), 3)
        self.assertEqual(removed, 0)

    def test_unions_promoters(self):
        rows = [
            event("Big Night", "The Oak", eventPromoters="Kova Events"),
            event("Big Night", "The Oak", eventPromoters="Thanks For Coming"),
        ]
        result, _ = dedupe_events.dedupe(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["eventPromoters"], "Kova Events, Thanks For Coming")

    def test_does_not_merge_different_timestamps(self):
        rows = [
            event("Big Night", "The Oak", "2026-01-01T00:00:00.000Z"),
            event("Big Night", "The Oak", "2026-01-02T00:00:00.000Z"),
        ]
        result, removed = dedupe_events.dedupe(rows)
        self.assertEqual(len(result), 2)
        self.assertEqual(removed, 0)


if __name__ == "__main__":
    unittest.main()
