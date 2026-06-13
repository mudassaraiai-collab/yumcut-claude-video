# Claude AI Setup Guide for YumCut

## Quick Start

### 1. Get your Anthropic API Key
Visit: https://console.anthropic.com/settings/keys
Create a key and copy it.

### 2. Add to your .env file
ANTHROPIC_API_KEY=sk-ant-your-key-here

### 3. Install the Anthropic SDK
npm install @anthropic-ai/sdk

### 4. Claude API Endpoint

POST /api/claude/generate

Body:
{
  "prompt": "5 restaurant supply chain tips that save costs",
  "durationSeconds": 30,
  "contentTone": "professional",
  "mustHave": "call to action",
  "avoid": "jargon"
}

Response:
{
  "data": {
    "title": "Cut Supply Chain Costs by 20%",
    "script": "Are you overpaying your suppliers? Here are 5 proven tips...",
    "caption": "Stop wasting money on supply chain inefficiencies!",
    "hashtags": ["restaurantowner", "supplychaintips", "foodbusiness"]
  }
}

### 5. Use the UI Component

import { ClaudeVideoGenerator } from "@/components/claude-video-generator";

export default function Page() {
  return <ClaudeVideoGenerator />;
}

## Files Added
- src/server/claude/generate-script.ts - Core Claude integration
- src/app/api/claude/generate/route.ts - API endpoints (POST=generate, PUT=refine)
- src/components/claude-video-generator.tsx - Ready-to-use UI component
