import { test, expect } from "@playwright/test";
import { normalisePromoterAndVenue } from "./promoters";

test.describe("normalisePromoterAndVenue", () => {
  test("splits a promoter out of the meta line", () => {
    expect(normalisePromoterAndVenue({ venueName: "Bad Behaviour - Lass O'Gowrie" })).toEqual({
      venueName: "Lass O'Gowrie",
      eventPromoters: "Bad Behaviour",
    });

    expect(normalisePromoterAndVenue({ venueName: "2gruvy2hard - Unknown" })).toEqual({
      venueName: "Unknown",
      eventPromoters: "2gruvy2hard",
    });

    expect(normalisePromoterAndVenue({ venueName: "Black Roos - Croatian Club" })).toEqual({
      venueName: "Croatian Club",
      eventPromoters: "Black Roos",
    });
  });

  test("drops a trailing price before splitting", () => {
    expect(
      normalisePromoterAndVenue({ venueName: "Bad Behaviour - Lass O'Gowrie - $32" }),
    ).toEqual({ venueName: "Lass O'Gowrie", eventPromoters: "Bad Behaviour" });

    expect(normalisePromoterAndVenue({ venueName: "Danny's Pizza - $15" })).toEqual({
      venueName: "Danny's Pizza",
      eventPromoters: undefined,
    });

    expect(normalisePromoterAndVenue({ venueName: "The Ori - FREE" })).toEqual({
      venueName: "The Ori",
      eventPromoters: undefined,
    });
  });

  test("leaves hyphenated venue names intact", () => {
    for (const venueName of ["Maru Hi-Fi", "The Lock-Up", "2Gruvy2Hard", "The Oak"]) {
      expect(normalisePromoterAndVenue({ venueName })).toEqual({
        venueName,
        eventPromoters: undefined,
      });
    }
  });

  test("does not treat a lineup as a promoter", () => {
    const venueName = "Primitive Moth, Grindhouse - Croatian Sports Club";
    expect(normalisePromoterAndVenue({ venueName })).toEqual({
      venueName,
      eventPromoters: undefined,
    });
  });

  test("keeps a promoter the model already returned", () => {
    expect(
      normalisePromoterAndVenue({
        venueName: "Bad Behaviour - Lass O'Gowrie",
        eventPromoters: "Bad Behaviour",
      }),
    ).toEqual({ venueName: "Lass O'Gowrie", eventPromoters: "Bad Behaviour" });

    expect(
      normalisePromoterAndVenue({ venueName: "The Oak", eventPromoters: "Weird!" }),
    ).toEqual({ venueName: "The Oak", eventPromoters: "Weird!" });
  });

  test("drops a promoter that is the venue", () => {
    expect(
      normalisePromoterAndVenue({ venueName: "The Oak", eventPromoters: " the oak " }),
    ).toEqual({ venueName: "The Oak", eventPromoters: undefined });
  });

  test("treats Sirocco as a promoter, not a venue", () => {
    expect(normalisePromoterAndVenue({ venueName: "Sirocco" })).toEqual({
      venueName: "Unknown",
      eventPromoters: "Sirocco",
    });

    expect(normalisePromoterAndVenue({ venueName: "Sirocco Meantime" })).toEqual({
      venueName: "Meantime",
      eventPromoters: "Sirocco",
    });

    expect(
      normalisePromoterAndVenue({ venueName: "Sirocco", eventPromoters: "Sirocco" }),
    ).toEqual({ venueName: "Unknown", eventPromoters: "Sirocco" });
  });

  test("treats Ode as a promoter but keeps The Ode as a venue", () => {
    expect(normalisePromoterAndVenue({ venueName: "Ode" })).toEqual({
      venueName: "Unknown",
      eventPromoters: "Ode",
    });

    expect(normalisePromoterAndVenue({ venueName: "The Ode" })).toEqual({
      venueName: "The Ode",
      eventPromoters: undefined,
    });

    expect(normalisePromoterAndVenue({ venueName: "The Ode Bar" })).toEqual({
      venueName: "The Ode Bar",
      eventPromoters: undefined,
    });
  });

  test("treats Made On Sunday as a promoter", () => {
    expect(normalisePromoterAndVenue({ venueName: "Made On Sunday" })).toEqual({
      venueName: "Unknown",
      eventPromoters: "Made On Sunday",
    });
  });

  test("trims whitespace and ignores empty values", () => {
    expect(
      normalisePromoterAndVenue({
        venueName: "  Bad Behaviour - Lass O'Gowrie  ",
        eventPromoters: "   ",
      }),
    ).toEqual({ venueName: "Lass O'Gowrie", eventPromoters: "Bad Behaviour" });

    expect(normalisePromoterAndVenue({ venueName: "", eventPromoters: "" })).toEqual({
      venueName: undefined,
      eventPromoters: undefined,
    });
  });
});
