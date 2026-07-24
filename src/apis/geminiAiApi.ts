import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

type Prompt = {
  inlineData?: {
    mimeType: string;
    data: string; // base64ImageFile;
  };
  text?: string;
}[];

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_KEY });

export const googleGenClient = async <T>(prompt: Prompt, responseSchema: Record<string, any>): Promise<T | null> => {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: { role: "user", parts: prompt },
    config: {
      responseMimeType: "application/json",
      responseSchema,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MEDIUM,
      },
      tools: [{ googleSearch: {} }],
    },
  });

  if (response.text) {
    // Note: With 3.1, the output is often cleaner when using schema,
    // but a standard JSON.parse still works perfectly.
    const parsedContent: T = JSON.parse(response.text);
    return parsedContent;
  }

  return null;
};
