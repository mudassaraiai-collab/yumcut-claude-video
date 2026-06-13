"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GeneratedScript {
  title: string;
  script: string;
  caption: string;
  hashtags: string[];
}

type Step = "form" | "generated" | "creating" | "done";

export function ClaudeVideoGenerator() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(30);
  const [tone, setTone] = useState("engaging");
  const [mustHave, setMustHave] = useState("");
  const [avoid, setAvoid] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [result, setResult] = useState<GeneratedScript | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setStep("form");
    setError(null);
    setResult(null);

    // Show loading state inside form
    const btn = document.getElementById("gen-btn");
    if (btn) btn.textContent = "Generating with Claude...";

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
      setStep("generated");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      if (btn) btn.textContent = "✨ Generate Script";
    }
  };

  const createVideo = async () => {
    if (!result) return;
    setStep("creating");
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawScript: result.script,
          useExactTextAsScript: true,
          durationSeconds: duration,
          contentTone: tone,
          captionsEnabled: true,
          watermarkEnabled: false,
          includeDefaultMusic: true,
          addOverlay: true,
          includeCallToAction: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create video project");
      setProjectId(data.data?.id);
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to create video");
      setStep("generated");
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setStep("form");
    setResult(null);
    setProjectId(null);
    setError(null);
    setPrompt("");
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <span>✨</span> Claude Video Generator
        </h2>
        <p className="text-sm text-muted-foreground">
          Type your idea → Claude writes the script → YumCut makes the video. One flow.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 text-xs">
        {[
          { key: "form", label: "1. Your idea" },
          { key: "generated", label: "2. Script ready" },
          { key: "creating", label: "3. Making video" },
          { key: "done", label: "4. Done!" },
        ].map((s, i, arr) => (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={`font-medium px-2 py-0.5 rounded-full ${
                step === s.key
                  ? "bg-primary text-primary-foreground"
                  : ["generated", "creating", "done"].indexOf(step) > ["generated", "creating", "done"].indexOf(s.key) - 1 &&
                    s.key !== "form"
                  ? "bg-green-100 text-green-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* STEP 1: Form */}
      {step === "form" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Video topic or idea *</label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
              placeholder="e.g. 5 restaurant supply chain tips that cut costs by 20%"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Duration</label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={15}>15s – TikTok short</option>
                <option value={30}>30s – Reels standard</option>
                <option value={60}>60s – Long form</option>
                <option value={90}>90s – Extended</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Tone</label>
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
                placeholder="e.g. call to action"
                value={mustHave}
                onChange={(e) => setMustHave(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Avoid (optional)</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. competitor names"
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
              />
            </div>
          </div>

          <button
            id="gen-btn"
            onClick={generate}
            disabled={!prompt.trim()}
            className="w-full rounded-md bg-primary text-primary-foreground py-2.5 px-4 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            ✨ Generate Script with Claude
          </button>
        </div>
      )}

      {/* STEP 2: Script generated */}
      {step === "generated" && result && (
        <div className="space-y-4">
          <div className="border rounded-lg p-5 bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{result.title}</h3>
              <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">{duration}s</span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Script</label>
                <button onClick={() => copy(result.script, "script")} className="text-xs text-primary hover:underline">
                  {copied === "script" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="bg-background rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {result.script}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Caption</label>
                <button onClick={() => copy(result.caption, "caption")} className="text-xs text-primary hover:underline">
                  {copied === "caption" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="bg-background rounded-md border p-3 text-sm">{result.caption}</div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hashtags</label>
                <button onClick={() => copy(result.hashtags.map((h) => `#${h}`).join(" "), "tags")} className="text-xs text-primary hover:underline">
                  {copied === "tags" ? "Copied!" : "Copy all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.hashtags.map((tag) => (
                  <span key={tag} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-md border border-input bg-background py-2.5 px-4 text-sm font-medium hover:bg-muted transition-colors"
            >
              ← Start over
            </button>
            <button
              onClick={createVideo}
              className="flex-[2] rounded-md bg-green-600 text-white py-2.5 px-4 text-sm font-bold hover:bg-green-700 transition-colors"
            >
              🎬 Create Video Now
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Creating video */}
      {step === "creating" && (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl animate-bounce">🎬</div>
          <h3 className="text-lg font-semibold">YumCut is making your video...</h3>
          <p className="text-sm text-muted-foreground">
            This takes a minute. We're generating images, voiceover, captions and assembling everything into a 9:16 video.
          </p>
          <div className="flex justify-center gap-1 pt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full bg-primary animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === "done" && result && (
        <div className="space-y-6">
          <div className="text-center py-8 space-y-3">
            <div className="text-5xl">🎉</div>
            <h3 className="text-xl font-bold">Your video is being created!</h3>
            <p className="text-sm text-muted-foreground">
              YumCut is processing your video. It will appear in your projects when ready.
            </p>
          </div>

          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ready to post</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Caption</p>
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm">{result.caption}</p>
                <button onClick={() => copy(result.caption, "done-caption")} className="text-xs text-primary hover:underline shrink-0">
                  {copied === "done-caption" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Hashtags</p>
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm text-primary">{result.hashtags.map((h) => `#${h}`).join(" ")}</p>
                <button onClick={() => copy(result.hashtags.map((h) => `#${h}`).join(" "), "done-tags")} className="text-xs text-primary hover:underline shrink-0">
                  {copied === "done-tags" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-md border border-input bg-background py-2.5 px-4 text-sm font-medium hover:bg-muted transition-colors"
            >
              Make another video
            </button>
            {projectId && (
              <button
                onClick={() => router.push(`/project/${projectId}`)}
                className="flex-1 rounded-md bg-primary text-primary-foreground py-2.5 px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                View project →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
