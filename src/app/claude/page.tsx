"use client";

import { ClaudeVideoGenerator } from "@/components/claude-video-generator";

export default function ClaudePage() {
  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <ClaudeVideoGenerator />
    </main>
  );
}
