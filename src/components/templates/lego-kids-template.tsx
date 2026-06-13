"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  {
    label: "🏰 Lego Castle",
    prompt: "Step by step kids guide to building a Lego Castle set, fun and energetic for children aged 4-10",
    mustHave: "knights, towers, castle walls, high five at the end",
  },
  {
    label: "🚗 Lego City",
    prompt: "Step by step kids guide to building a Lego City set with cars and buildings, fun for kids aged 4-10",
    mustHave: "cars, roads, buildings, police station, high five at the end",
  },
  {
    label: "🚀 Lego Space",
    prompt: "Step by step kids guide to building a Lego Space rocket, fun and energetic for children aged 4-10",
    mustHave: "rockets, astronauts, stars, blast off moment, high five at the end",
  },
  {
    label: "🏠 Lego Friends",
    prompt: "Step by step kids guide to building a Lego Friends playhouse, fun for kids aged 4-10",
    mustHave: "colourful bricks, friends characters, playhouse, high five at the end",
  },
  {
    label: "⚙️ Lego Technic",
    prompt: "Step by step kids guide to building a Lego Technic car, fun for children aged 6-10",
    mustHave: "gears, wheels, engine parts, wow moment, high five at the end",
  },
];

type Step = "pick" | "generating" | "review" | "creating" | "done";

interface ScriptResult {
  title: string;
  script: string;
  caption: string;
  hashtags: string[];
}

export function LegoKidsTemplate() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<(typeof PRESETS)[0] | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const activePrompt = selected?.prompt || customPrompt;
  const activeMustHave = selected?.mustHave || "encouragement for kids, high five at the end";

  const generate = async () => {
    if (!activePrompt.trim()) return;
    setStep("generating");
    setError(null);

    try {
      const res = await fetch("/api/claude/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activePrompt,
          durationSeconds: 60,
          contentTone: "engaging",
          mustHave: activeMustHave,
          avoid: "complex words, long sentences, anything scary or negative",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Generation failed");
      setResult(data.data);
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("pick");
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
          durationSeconds: 60,
          contentTone: "engaging",
          captionsEnabled: true,
          watermarkEnabled: false,
          includeDefaultMusic: true,
          addOverlay: true,
          includeCallToAction: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create video");
      setProjectId(data.data?.id);
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to create video");
      setStep("review");
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setStep("pick");
    setSelected(null);
    setCustomPrompt("");
    setResult(null);
    setProjectId(null);
    setError(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-yellow-400 via-red-400 to-blue-500 p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🧱</span>
          <div>
            <h2 className="text-2xl font-bold">Kids Lego Video Maker</h2>
            <p className="text-sm opacity-90">
              One click → Claude writes the script → YumCut makes the video
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* STEP 1: Pick a preset */}
      {step === "pick" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold mb-3">Pick a Lego set type:</h3>
            <div className="grid grid-cols-1 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => { setSelected(preset); setCustomPrompt(""); }}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    selected?.label === preset.label
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-input hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1 font-medium">Or describe your own Lego set:</p>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. Lego Harry Potter Hogwarts castle for kids aged 6-10"
              value={customPrompt}
              onChange={(e) => { setCustomPrompt(e.target.value); setSelected(null); }}
            />
          </div>

          <button
            onClick={generate}
            disabled={!activePrompt.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-yellow-400 to-red-500 text-white py-3 px-4 text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity shadow-md"
          >
            ✨ Generate Kids Script with Claude
          </button>
        </div>
      )}

      {/* STEP 2: Generating */}
      {step === "generating" && (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl animate-bounce">🧱</div>
          <h3 className="text-lg font-semibold">Claude is writing the script...</h3>
          <p className="text-sm text-muted-foreground">Making it fun and perfect for kids!</p>
          <div className="flex justify-center gap-1 pt-2">
            {[0,1,2].map((i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: Review script */}
      {step === "review" && result && (
        <div className="space-y-4">
          <div className="border-2 border-yellow-300 rounded-xl p-5 bg-yellow-50/50 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎬</span>
              <h3 className="font-bold text-lg">{result.title}</h3>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">60s Script</label>
                <button onClick={() => copy(result.script, "script")} className="text-xs text-primary hover:underline">
                  {copied === "script" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="bg-white rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {result.script}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caption</label>
                <button onClick={() => copy(result.caption, "caption")} className="text-xs text-primary hover:underline">
                  {copied === "caption" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="bg-white rounded-lg border p-3 text-sm">{result.caption}</div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hashtags</label>
                <button onClick={() => copy(result.hashtags.map((h) => `#${h}`).join(" "), "tags")} className="text-xs text-primary hover:underline">
                  {copied === "tags" ? "Copied!" : "Copy all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.hashtags.map((tag) => (
                  <span key={tag} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 rounded-lg border border-input bg-background py-2.5 px-4 text-sm font-medium hover:bg-muted transition-colors">
              ← Pick different set
            </button>
            <button
              onClick={createVideo}
              className="flex-[2] rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2.5 px-4 text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
            >
              🎬 Make the Video Now!
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Creating */}
      {step === "creating" && (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl animate-spin">⚙️</div>
          <h3 className="text-lg font-semibold">YumCut is building your video!</h3>
          <p className="text-sm text-muted-foreground">Generating images, voiceover and captions...</p>
          <div className="flex justify-center gap-1 pt-2">
            {[0,1,2].map((i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* STEP 5: Done */}
      {step === "done" && result && (
        <div className="space-y-6">
          <div className="text-center py-8 space-y-3">
            <div className="text-6xl">🎉</div>
            <h3 className="text-2xl font-bold">Video is being made!</h3>
            <p className="text-sm text-muted-foreground">Your kids Lego video will be ready in your projects shortly.</p>
          </div>

          <div className="border-2 border-green-200 rounded-xl p-4 bg-green-50/50 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Copy & paste when posting</p>
            <div className="flex justify-between items-start gap-2">
              <p className="text-sm">{result.caption}</p>
              <button onClick={() => copy(result.caption, "done-caption")} className="text-xs text-primary hover:underline shrink-0">
                {copied === "done-caption" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex justify-between items-start gap-2">
              <p className="text-xs text-yellow-700">{result.hashtags.map((h) => `#${h}`).join(" ")}</p>
              <button onClick={() => copy(result.hashtags.map((h) => `#${h}`).join(" "), "done-tags")} className="text-xs text-primary hover:underline shrink-0">
                {copied === "done-tags" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 rounded-lg border border-input bg-background py-2.5 px-4 text-sm font-medium hover:bg-mug transition-colors">
              Make another 🧱
            </button>
            {projectId && (
              <button onClick={() => router.push(`/project/${projectId}`)} className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 px-4 text-sm font-bold hover:bg-primary/90 transition-colors">
                View video →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
