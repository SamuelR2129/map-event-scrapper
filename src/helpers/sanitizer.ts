import { ScrapedEvent } from "../scrappers/types";

// Preserve newlines (normalize CRLF -> LF) and escape HTML characters safely.
function escapeHtml(input: string): string {
  if (typeof input !== "string") return input;

  // Properly escape the main HTML-special characters.
  // Note: we intentionally do NOT remove newlines.
  return input
    .replace(/</g, "") // escape < to avoid injection
    .replace(/>/g, "") // escape >
    .replace(/"/g, ""); // escape double quote
}

// Simple blacklist-based sanitizer for SQL-like keywords.
// NOTE: This is a last-resort filter — prefer parameterized queries or ORM bindings.
function sqlSanitizer(input: string) {
  if (typeof input !== "string") return input;

  const blacklist: RegExp[] = [
    /(\b)(select|insert|update|delete|drop|alter|truncate|exec|union|create|replace|grant|revoke)(\b)/gi, // SQL keywords
    /--/g, // SQL comment syntax
    /;/g, // statement delimiter
    /"/g, // double quotes
    /\\(?!n)/g, // backslashes except \n (this preserves actual newline escapes)
    /\bOR\b/gi, // OR
    /\bAND\b/gi, // AND
  ];

  let sanitized = input;
  for (const pattern of blacklist) {
    sanitized = sanitized.replace(pattern, "");
  }

  return sanitized.trim();
}

function aiPromptSanitizer(input: string) {
  if (typeof input !== "string") return input;

  const blacklist = [
    /ignore\s+(previous|above|all|your)\s+(instructions|rules|prompts?)/gi, // Instruction override attempts
    /disregard\s+(previous|above|all|your)\s+(instructions|rules|prompts?)/gi, // Instruction override attempts
    /forget\s+(previous|above|all|your)\s+(instructions|rules|prompts?)/gi, // Instruction override attempts
    /new\s+(instructions|rules|prompt)/gi, // Injection of new instructions
    /system\s*:?\s*you\s+are/gi, // System role hijacking
    /assistant\s*:?\s*you\s+are/gi, // Assistant role hijacking
    /\[INST\]/gi, // Instruction tags used in some models
    /\[\/INST\]/gi, // Instruction tags used in some models
    /<<SYS>>/gi, // System tags used in some models
    /<\/SYS>/gi, // System tags used in some models
    /<\|im_start\|>/gi, // ChatML format tags
    /<\|im_end\|>/gi, // ChatML format tags
    /\{\{system\}\}/gi, // Template injection attempts
    /\{\{user\}\}/gi, // Template injection attempts
    /\{\{assistant\}\}/gi, // Template injection attempts
  ];

  let sanitized = input;
  for (const pattern of blacklist) {
    sanitized = sanitized.replace(pattern, "");
  }

  return sanitized.trim();
}

function sanitize(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  let trimmed = value.trim();
  if (!trimmed) return;

  // Apply all sanitizers in sequence
  trimmed = escapeHtml(trimmed);
  trimmed = sqlSanitizer(trimmed);
  trimmed = aiPromptSanitizer(trimmed);

  return trimmed;
}

function sanitizeNumberArray(arr: unknown) {
  if (!Array.isArray(arr)) return;
  return arr.map(Number).filter((n) => Number.isFinite(n));
}

function sanitizeUrl(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    console.error(`Dangerous url - ${trimmed}`);
  }

  return undefined;
}

export function sanitizeEvents(event: ScrapedEvent): ScrapedEvent {
  return {
    id: sanitize(event.id),
    eventName: sanitize(event.eventName),
    venueLocation: sanitize(event.venueLocation),
    lngLat: sanitizeNumberArray(event.lngLat),
    venueName: sanitize(event.venueName),
    venueAddress: sanitize(event.venueAddress),
    eventStartTime: sanitize(event.eventStartTime),
    eventEndTime: sanitize(event.eventEndTime),
    eventLink: sanitizeUrl(event.eventLink),
    eventPromoters: sanitize(event.eventPromoters),
    eventDescription: sanitize(event.eventDescription),
    ticketLink: sanitizeUrl(event.ticketLink),
    ticketCost: sanitize(event.ticketCost),
    eventDateTime: sanitize(event.eventDateTime),
    socialLink: sanitizeUrl(event.socialLink),
    genres: sanitize(event.genres),
    eventBannerImage: sanitizeUrl(event.eventBannerImage),
    source: event.source,
    localTimeZone: event.localTimeZone,
  };
}
