# Claude AI Video Generator Integration

This module integrates Anthropic Claude into YumCut for AI-powered video script and scene generation.

## Setup

1. Get your Claude API key from https://console.anthropic.com
2. Add it to your .env file: ANTHROPIC_API_KEY=your_key_here

## Usage

Claude is used to:
- Generate video scripts from a topic or prompt
- Create scene descriptions for each video segment
- Write captions and subtitles
- Suggest hashtags for Instagram & TikTok

## Example

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateVideoScript(topic, duration = 30) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Create a ${duration}-second vertical video script for TikTok/Instagram Reels about: ${topic}.
        
Format the response as JSON with:
- title: catchy video title
- hook: first 3 seconds attention grabber
- scenes: array of scenes with (duration_seconds, narration, visual_description)
- caption: Instagram/TikTok caption with emojis
- hashtags: array of 10 relevant hashtags`,
      },
    ],
  });

  return JSON.parse(response.content[0].text);
}

export async function generateSceneIdeas(script) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Given this video script: ${JSON.stringify(script)}, 
        suggest 3 visual style options (realistic, animated, cinematic) with color palette and mood.`,
      },
    ],
  });

  return response.content[0].text;
}
```
