
import { NextRequest } from "next/server";
import { generateScriptWithClaude, refineScriptWithClaude } from "@/server/claude/generate-script";
import { ok, unauthorized, error } from "@/server/http";
import { withApiError } from "@/server/errors";
import { authenticateApiRequest } from "@/server/api-user";

// POST /api/claude/generate
// Body: { prompt, durationSeconds?, language?, contentTone?, mustHave?, avoid? }
export const POST = withApiError(async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  if (!process.env.ANTHROPIC_API_KEY) {
    return error("CONFIG_ERROR", "ANTHROPIC_API_KEY is not configured", 500);
  }

  const body = await req.json();
  const {
    prompt,
    durationSeconds = 30,
    language = "en",
    contentTone = "engaging",
    mustHave,
    avoid,
  } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return error("VALIDATION_ERROR", "prompt is required", 400);
  }

  const result = await generateScriptWithClaude(
    prompt.trim(),
    Number(durationSeconds) || 30,
    language,
    contentTone,
    mustHave,
    avoid
  );

  return ok(result);
}, "Failed to generate script with Claude");

// POST /api/claude/refine
// Body: { script, instructions, durationSeconds? }
export const PUT = withApiError(async function PUT(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  if (!process.env.ANTHROPIC_API_KEY) {
    return error("CONFIG_ERROR", "ANTHROPIC_API_KEY is not configured", 500);
  }

  const body = await req.json();
  const { script, instructions, durationSeconds = 30 } = body;

  if (!script || !instructions) {
    return error("VALIDATION_ERROR", "script and instructions are required", 400);
  }

  const refined = await refineScriptWithClaude(script, instructions, Number(durationSeconds) || 30);
  return ok({ script: refined });
}, "Failed to refine script with Claude");

