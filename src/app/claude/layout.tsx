import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claude AI Video Generator | YumCut",
  description: "Generate TikTok and Instagram Reels scripts instantly using Claude AI. Get script, caption, and hashtags in one click.",
};

export default function ClaudeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
