import { ScrapedEvent } from "../../scrappers/types";

export type PromptInjectionResult = {
  detected: boolean;
  matches: string[];
};

const INSTRUCTION_NOUNS = "(?:instructions?|rules|prompts?|guidelines?|directives?)";

const QUALIFIERS = "(?:(?:all|any|some|your|previous|above|prior|earlier)\\s+)*";

export const PROMPT_INJECTION_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "instruction override",
    regex: new RegExp(`(?:ignore|disregard|forget|skip)\\s+${QUALIFIERS}${INSTRUCTION_NOUNS}`, "gi"),
  },
  {
    label: "instruction override",
    regex: new RegExp(`override\\s+(?:your\\s+)?${INSTRUCTION_NOUNS}`, "gi"),
  },
  {
    label: "instruction override",
    regex: new RegExp(`(?:do[\\s']not|dont)\\s+follow\\s+(?:the\\s+)?(?:above|previous|given|any|your)\\s+(?:instructions?|rules|prompts?)`, "gi"),
  },
  { label: "instruction override", regex: /ignore\s+(?:all\s+)?(?:everything|what\s+i\s+said)/gi },
  {
    label: "new instructions",
    regex: new RegExp(`new\\s+(?:set\\s+of\\s+)?${INSTRUCTION_NOUNS}`, "gi"),
  },
  { label: "role hijack", regex: /(?:you\s+are\s+now|from\s+now\s+on\s+you)\s+(?:a|an|the)?\s*/gi },
  { label: "role hijack", regex: /^\s*(?:system|developer|assistant|user)\s*[:：]/gim },
  { label: "role hijack", regex: /act\s+as\s+(?:an?\s+)?(?:developer|system|assistant|unrestricted|uncensored|an?\s+ai\s+without)/gi },
  { label: "template injection", regex: /\{\{\s*(?:system|user|assistant|role)\s*\}\}/gi },
  { label: "chat token", regex: /<\|im_start\|>/gi },
  { label: "chat token", regex: /<\|im_end\|>/gi },
  { label: "sys tag", regex: /<<\s*SYS\s*>>/gi },
  { label: "sys tag", regex: /<\s*\/\s*SYS\s*>/gi },
  { label: "instruction tag", regex: /\[\s*(?:[/\\]|escape)?\s*INST\s*\]/gi },
  { label: "spoof tag", regex: /<\s*\/?\s*(?:system|developer|assistant|user)\s*>/gi },
  {
    label: "prompt leak",
    regex: /(?:show|print|reveal|display|output|repeat|leak)\s+(?:your|the|my)\s+(?:system\s+)?(?:prompt|instructions?|rules)/gi,
  },
  {
    label: "prompt leak",
    regex: /what\s+is\s+(?:in\s+|inside\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules)/gi,
  },
  { label: "prompt leak", regex: /expose\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules)/gi },
  { label: "jailbreak", regex: /jailbreak/gi },
  {
    label: "restriction removal",
    regex: /you\s+(?:have|should\s+have)\s+no\s+(?:rules|restrictions?|limits?|filters?)|ignore\s+(?:all\s+)?(?:safety|filter)/gi,
  },
];

export const detectPromptInjection = (text: string): PromptInjectionResult => {
  if (!text || typeof text !== "string") return { detected: false, matches: [] };

  const matches: string[] = [];

  for (const { label, regex } of PROMPT_INJECTION_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(text) && !matches.includes(label)) {
      matches.push(label);
    }
  }

  return { detected: matches.length > 0, matches };
};

const COPY_FIELDS: (keyof ScrapedEvent)[] = [
  "eventName",
  "venueLocation",
  "venueAddress",
  "eventPromoters",
  "eventDescription",
  "venueName",
  "genres",
];

export const inspectEventCopy = (event: ScrapedEvent): PromptInjectionResult => {
  const copy = COPY_FIELDS.map((field) => {
    const value = event[field];
    return typeof value === "string" ? value : "";
  })
    .filter(Boolean)
    .join("\n");

  return detectPromptInjection(copy);
};