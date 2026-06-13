import type { Metadata } from "next";
import { LegoKidsTemplate } from "@/components/templates/lego-kids-template";

export const metadata: Metadata = {
  title: "Kids Lego Video Maker | YumCut",
  description: "Make fun animated-style Lego videos for kids in one click. Claude writes the script, YumCut makes the video.",
};

export default function LegoPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-yellow-50 to-white py-10 px-4">
      <LegoKidsTemplate />
    </main>
  );
}
