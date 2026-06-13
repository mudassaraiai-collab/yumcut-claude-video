
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ClaudeScriptResult {
  script: string;
  title: string;
  caption: string;
  hashtags: string[];
}

export async function generateScriptWithClaude(
  prompt: string,
  durationSeconds: number = 30,
  language: string = "en",
  contentTone: string = "engaging",
  mustHave?: string,
  avoid?: string
): Promise<ClaudeScriptResult> {
  const systemPrompt = `You are an expert short-form video scriptwriter for TikTok and Instagram Reels.
You write punchy, engaging vertical video scripts optimised for ${durationSeconds}-second videos.
Tone: ${contentTone}. Language: ${language}.
Always respond with valid JSON only — no markdown, no explanation.`;

  const userPrompt = `Create a ${durationSeconds}-second TikTok/Instagram Reels video script about: "${prompt}".
${mustHave ? `Must include: ${mustHave}` : ""}
${avoid ? `Avoid: ${avoid}` : ""}

Respond ONLY with this JSON structure:
{
  "title": "Short catchy title (max 8 words)",
  "script": "The full narration text optimised for ${durationSeconds} seconds of speech. No stage directions, just the words to say.",
  "caption": "Instagram/TikTok caption with emojis (max 150 chars)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10"]
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean) as ClaudeScriptResult;

  return parsed;
}

export async function refineScriptWithClaude(
  script: string,
  instructions: string,
  durationSeconds: number = 30
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Refine this ${durationSeconds}-second video script based on these instructions: "${instructions}".

Original script:
${script}

Return ONLY the refined script text. No explanation, no JSON, just the script words.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text.trim() : script;
}

