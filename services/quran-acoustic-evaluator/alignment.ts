import type { SpeechRegion, WordTiming } from "./types";

/** Energy/VAD-constrained word timing prototype; boundaries are never emitted outside observed speech. */
export function alignKnownWords(expectedArabic: string, regions: SpeechRegion[], qualityConfidence: number): { words: WordTiming[]; confidence: number; uncertainRegions: SpeechRegion[] } {
  const tokens = expectedArabic.trim().split(/\s+/).filter(Boolean); if (!tokens.length || !regions.length) return { words: [], confidence: 0, uncertainRegions: regions };
  const totalSpeech = regions.reduce((n, r) => n + r.endMs - r.startMs, 0), target = totalSpeech / tokens.length;
  const pointAt = (speechOffset: number, nextAtBoundary: boolean) => { let remaining = speechOffset; for (const r of regions) { const d = r.endMs-r.startMs; if (remaining < d || (!nextAtBoundary && remaining === d)) return r.startMs + remaining; remaining -= d; } return regions.at(-1)!.endMs; };
  const words = tokens.map((arabic, i) => {
    const oneRegionPerWord = regions.length === tokens.length;
    const startMs = Math.round(oneRegionPerWord ? regions[i].startMs : pointAt(i * target, true)), endMs = Math.max(startMs + 1, Math.round(oneRegionPerWord ? regions[i].endMs : pointAt((i + 1) * target, false)));
    const previousEnd = i ? Math.round(oneRegionPerWord ? regions[i-1].endMs : pointAt(i * target, false)) : 0, nextStart = i === tokens.length-1 ? regions.at(-1)!.endMs : Math.round(oneRegionPerWord ? regions[i+1].startMs : pointAt((i+1)*target,true));
    const covering = regions.filter(r => r.endMs > startMs && r.startMs < endMs); const energy = covering.reduce((n,r)=>n+r.meanEnergy,0)/Math.max(1,covering.length);
    const confidence = Math.max(0, Math.min(1, qualityConfidence * (totalSpeech >= tokens.length * 100 ? 0.9 : 0.55)));
    return { wordIndex: i+1, arabic, startMs, endMs, confidence, pauseBeforeMs: i ? Math.max(0,startMs-previousEnd) : Math.max(0,startMs), pauseAfterMs: Math.max(0,nextStart-endMs), meanEnergy: energy, voicedDurationMs: Math.round(target), unvoicedDurationMs: Math.max(0,endMs-startMs-Math.round(target)) };
  });
  // Replace quantile-adjacent pause values with real gaps between speech regions at each boundary.
  for (let i=0;i<words.length-1;i++) { const boundary=(words[i].endMs+words[i+1].startMs)/2; const gap=regions.find((r,j)=>j<regions.length-1 && r.endMs<=boundary && regions[j+1].startMs>=boundary); if(gap){const j=regions.indexOf(gap), pause=Math.round(regions[j+1].startMs-gap.endMs); words[i].pauseAfterMs=pause; words[i+1].pauseBeforeMs=pause;} }
  return { words, confidence: words.reduce((n,w)=>n+w.confidence,0)/words.length, uncertainRegions: regions.filter(r => r.endMs-r.startMs < 80) };
}
