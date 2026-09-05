import { describe, expect, it } from "vitest";
import { alignKnownWords } from "./alignment";
import { MAX_DURATION_MS, preprocessAudio, SAMPLE_RATE } from "./audio";
import { evaluate } from "./evaluator";
import type { PhonemeEvaluator } from "./phoneme";

function wav(parts: Array<{ durationMs:number; amplitude:number; frequency?:number }>, sampleRate=8_000, channels=1) {
  const samples=parts.flatMap(part=>Array.from({length:Math.round(part.durationMs*sampleRate/1000)},(_,i)=>part.amplitude*Math.sin(2*Math.PI*(part.frequency??220)*i/sampleRate)));
  const data=Buffer.alloc(samples.length*channels*2); samples.forEach((s,i)=>{for(let c=0;c<channels;c++)data.writeInt16LE(Math.round(s*32767),(i*channels+c)*2);});
  const out=Buffer.alloc(44+data.length); out.write("RIFF",0); out.writeUInt32LE(36+data.length,4); out.write("WAVEfmt ",8); out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(channels,22); out.writeUInt32LE(sampleRate,24); out.writeUInt32LE(sampleRate*channels*2,28); out.writeUInt16LE(channels*2,32); out.writeUInt16LE(16,34); out.write("data",36); out.writeUInt32LE(data.length,40); data.copy(out,44); return out;
}
const request=(audio:Buffer)=>({audioBase64:audio.toString("base64"),mimeType:"audio/wav",expectedArabic:"بِسْمِ اللَّهِ",surah:1,ayah:1,learningLevel:"tajweed" as const});

describe("acoustic evaluator prototype",()=>{
  it("safely abstains on empty and silence-only audio",async()=>{expect((await evaluate(request(Buffer.alloc(0)))).status).toBe("abstained"); expect((await evaluate(request(wav([{durationMs:1000,amplitude:0}])))).status).toBe("abstained");});
  it("rejects excessive duration",async()=>{await expect(preprocessAudio(wav([{durationMs:MAX_DURATION_MS+20,amplitude:.1}],100),"audio/wav")).rejects.toThrow("duration_exceeded");});
  it("converts stereo 8 kHz WAV to normalized mono 16 kHz",async()=>{const pcm=await preprocessAudio(wav([{durationMs:500,amplitude:.1}],8_000,2),"audio/wav"); expect(pcm.sampleRate).toBe(SAMPLE_RATE); expect(pcm.samples.length).toBe(8_000); expect(Math.max(...pcm.samples)).toBeGreaterThan(.8);});
  it("keeps word timestamps ordered and confidence bounded",()=>{const result=alignKnownWords("أ ب ج",[{startMs:100,endMs:500,meanEnergy:.2},{startMs:900,endMs:1500,meanEnergy:.2}],.9); expect(result.words).toHaveLength(3); result.words.forEach((word,i)=>{expect(word.confidence).toBeGreaterThanOrEqual(0);expect(word.confidence).toBeLessThanOrEqual(1);if(i)expect(word.startMs).toBeGreaterThanOrEqual(result.words[i-1].endMs);});});
  it("detects a controlled long internal pause and returns the app contract",async()=>{const result=await evaluate(request(wav([{durationMs:500,amplitude:.3},{durationMs:1100,amplitude:0},{durationMs:500,amplitude:.3}]))); expect(result.status).toBe("available"); expect(result.findings[0]).toMatchObject({kind:"pause",wordIndex:1}); expect(result.confidence).toBeGreaterThanOrEqual(.75);});
  it("does not turn low-confidence alignment into a correction",async()=>{const result=await evaluate(request(wav([{durationMs:80,amplitude:.03},{durationMs:1100,amplitude:0},{durationMs:80,amplitude:.03}]))); expect(result.findings).toEqual([]); expect(result.status).toBe("abstained");});
  it("never promotes stub phoneme metadata to a finding",async()=>{const stub:PhonemeEvaluator={evaluate:async()=>[{wordIndex:1,confusionPairId:"qaf-kaf",confidence:1,modelBacked:false}]}; const result=await evaluate(request(wav([{durationMs:1000,amplitude:.3}])),stub); expect(result.findings.some(f=>f.kind==="phoneme")).toBe(false);});
});
