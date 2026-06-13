
"use client";

import { useState } from "react";

interface GeneratedScript {
  title: string;
  script: string;
  caption: string;
  hashtags: string[];
}

export function ClaudeVideoGenerator() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(30);
  const [tone, setTone] = useState("engaging");
  const [mustHave, setMustHave] = useState("");
  const [avoid, setAvoid] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/claude/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          durationSeconds: duration,
          contentTone: tone,
          mustHave: mustHave || undefined,
          avoid: avoid || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Generation failed");
      setResult(data.data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">🎬 Claude Video Script Generator</h2>
        <p className="text-sm text-muted-foreground">
          Generate TikTok & Instagram Reels scripts powered by Claude AI
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Video topic or idea *</label>
          <textarea
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
            placeholder="e.g. 5 restaurant supply chain tips that save 20% costs"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Duration (seconds)</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              <option value={15}>15s (TikTok short)</option>
              <option value={30}>30s (Reels standard)</option>
              <option value={60}>60s (Long form)</option>
              <option value={90}>90s (Extended)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Content tone</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="engaging">Engaging</option>
              <option value="professional">Professional</option>
              <option value="funny">Funny</option>
              <option value="educational">Educational</option>
              <option value="inspirational">Inspirational</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Must include (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. call to action, brand name"
              value={mustHave}
              onChange={(e) => setMustHave(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Avoid (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. competitor names, slang"
              value={avoid}
              onChange={(e) => setAvoid(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full rounded-md bg-primary text-primary-foreground py-2 px-4 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {loading ? "Generating with Claude..." : "✨ Generate Script"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 border rounded-lg p-5 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{result.title}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {duration}s script
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Script</label>
              <button
                onClick={() => copy(result.script, "script")}
                className="text-xs text-primary hover:underline"
              >
                {copied === "script" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-background rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {result.script}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Caption</label>
              <button
                onClick={() => copy(result.caption, "caption")}
                className="text-xs text-primary hover:underline"
              >
                {copied === "caption" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-background rounded-md border p-3 text-sm">{result.caption}</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hashtags</label>
              <button
                onClick={() => copy(result.hashtags.map((h) => `#${h}`).join(" "), "hashtags")}
                className="text-xs text-primary hover:underline"
              >
                {copied === "hashtags" ? "Copied!" : "Copy all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

