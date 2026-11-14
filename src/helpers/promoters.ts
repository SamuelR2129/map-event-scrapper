/**
 * The witchhouse weekly cards render each event as two lines: a headline (the
 * lineup, or a night name when there is no lineup) and a meta line in the form
 * `[Promoter -] Venue [- $Price]`.
 *
 * Segments are separated by " - " (space, hyphen, space), so hyphenated names
 * such as "Maru Hi-Fi", "The Lock-Up" and "2Gruvy2Hard" stay in one piece.
 *
 * The vision model is told the same rule, but a missed segment silently lands
 * in `venueName` (e.g. "Bad Behaviour - Lass O'Gowrie"), so repair it here.
 */

export type PromoterVenueInput = {
  venueName?: string;
  eventPromoters?: string;
};

export type PromoterVenueResult = {
  venueName?: string;
  eventPromoters?: string;
};

const SEGMENT_SEPARATOR = " - ";

/** "$33", "A$58.65", "33.00", "FREE" — a trailing segment that is a price, not a venue. */
const PRICE_SEGMENT = /^(?:a?\$?\s*\d+(?:[.,]\d+)?|free)$/i;

/**
 * Names the vision model sometimes puts in the venue slot that are actually
 * promoters. Bare "Ode", "Sirocco" and "Made On Sunday" leave the venue unknown;
 * "Sirocco Meantime" means Sirocco at Meantime. "The Ode" and "The Ode Bar"
 * are real venues and are left alone.
 */
const PROMOTER_ONLY_VENUES: Record<
  string,
  { promoter: string; venue?: string }
> = {
  ode: { promoter: "Ode" },
  sirocco: { promoter: "Sirocco" },
  "sirocco meantime": { promoter: "Sirocco", venue: "Meantime" },
  "made on sunday": { promoter: "Made On Sunday" },
};

/** A comma on the left of the separator means it is a lineup, not a promoter. */
const hasComma = (value: string) => value.includes(",");

const clean = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function normalisePromoterAndVenue({
  venueName,
  eventPromoters,
}: PromoterVenueInput): PromoterVenueResult {
  let nextVenue = clean(venueName);
  let nextPromoter = clean(eventPromoters);

  if (nextVenue?.includes(SEGMENT_SEPARATOR)) {
    const segments = nextVenue
      .split(SEGMENT_SEPARATOR)
      .map((segment) => segment.trim())
      .filter(Boolean);

    // "Danny's Pizza - $15" -> ["Danny's Pizza"]
    if (segments.length > 1 && PRICE_SEGMENT.test(segments[segments.length - 1])) {
      segments.pop();
    }

    // "Bad Behaviour - Lass O'Gowrie" -> promoter + venue.
    // "Primitive Moth, Grindhouse - Croatian Sports Club" is left alone.
    if (segments.length > 1 && !hasComma(segments[0])) {
      nextVenue = segments[segments.length - 1];
      nextPromoter ??= segments[0];
    } else {
      nextVenue = segments.join(SEGMENT_SEPARATOR);
    }
  }

  if (nextPromoter && nextVenue && nextPromoter.toLowerCase() === nextVenue.toLowerCase()) {
    nextPromoter = undefined;
  }

  // "Sirocco" is a promoter, not a venue; "Sirocco Meantime" is Sirocco at Meantime.
  const promoterOnly = nextVenue
    ? PROMOTER_ONLY_VENUES[nextVenue.toLowerCase()]
    : undefined;
  if (promoterOnly) {
    nextPromoter ??= promoterOnly.promoter;
    nextVenue = promoterOnly.venue ?? "Unknown";
  }

  return { venueName: nextVenue, eventPromoters: nextPromoter };
}
