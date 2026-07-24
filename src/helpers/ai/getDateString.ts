import { DateTime } from "luxon";
import { googleGenClient } from "../../apis/geminiAiApi";
import { z } from "zod";

// 1. Define the Zod Schema for TypeScript type inference
const DateTimeResponseSchema = z.object({
  isoDate: z.string().describe("The parsed date and time in ISO 8601 format (e.g., 2026-10-12T14:30:00)"),
  isValid: z.boolean().describe("Whether the AI was able to successfully identify a date"),
  confidence: z.number().min(0).max(1).describe("Confidence score of the extraction"),
  timezoneUsed: z.string().optional().describe("The timezone detected, e.g., 'AEST'"),
});

// 2. Derive the TypeScript Type from the Schema
export type DateTimeResponse = z.infer<typeof DateTimeResponseSchema>;

// 3. OpenAPI-compatible JSON Schema for the Google GenAI response schema (no $schema, no additionalProperties)
const dateTimeJsonSchema = {
  type: "object",
  properties: {
    isoDate: { type: "string", description: "The parsed date and time in ISO 8601 format (e.g., 2026-10-12T14:30:00)" },
    isValid: { type: "boolean", description: "Whether the AI was able to successfully identify a date" },
    confidence: { type: "number", description: "Confidence score of the extraction" },
    timezoneUsed: { type: "string", description: "The timezone detected, e.g., 'AEST'" },
  },
  required: ["isoDate", "isValid", "confidence"],
};

export const aiGetDateTime = async (date: string) => {
  const prompt = [
    {
      text: `
    Extract the date and time from this string: "${date}".
    The current year is 2026. 
    Return ONLY the result in ISO 8601 format (YYYY-MM-DDTHH:mm:ss). 
    If a timezone like AEST or AEDT is mentioned, include the offset.
    Do not include any conversational text.
    Return it in this structure:
    z.object({
      isoDate: z.string().describe("The parsed date and time in ISO 8601 format (e.g., 2026-10-12T14:30:00)"),
      isValid: z.boolean().describe("Whether the AI was able to successfully identify a date"),
      confidence: z.number().min(0).max(1).describe("Confidence score of the extraction"),
      timezoneUsed: z.string().optional().describe("The timezone detected, e.g., 'AEST'"),
    })
  `,
    },
  ];

  try {
    const aiRes = await googleGenClient<DateTimeResponse>(prompt, dateTimeJsonSchema);
    if (!aiRes) throw Error("aiRes is null, no response.text returned by ai api");

    console.log("aiGetDateTime", aiRes);

    if (!aiRes.isValid) {
      throw new Error(`AI could not determine a valid date. ${date}`);
    }

    return DateTime.fromISO(aiRes.isoDate);
  } catch (err) {
    console.warn("aiGetDateTime couldnt get the date", err);
    return;
  }
};
