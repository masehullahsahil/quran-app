import express from "express";
import { evaluate, type EvaluateInput } from "./evaluator";

const app=express(); app.use(express.json({limit:"20mb"}));
app.post("/v1/evaluate",async(req,res)=>{const started=Date.now(); const input=req.body as Partial<EvaluateInput>; if(typeof input.audioBase64!=="string"||typeof input.mimeType!=="string"||typeof input.expectedArabic!=="string"||!Number.isInteger(input.surah)||!Number.isInteger(input.ayah)) return res.status(400).json({error:"invalid_request"}); const result=await evaluate(input as EvaluateInput); console.info(JSON.stringify({event:"quran_acoustic_evaluation",requestDurationMs:Date.now()-started,audioDurationMs:result.measurements?.audioDurationMs??null,preprocessingResult:result.measurements?"usable":"rejected",alignmentConfidence:result.measurements?.alignmentConfidence??0,alignedWords:result.measurements?.words.length??0,abstentionReason:result.status==="abstained"?"insufficient_reliable_evidence":null,findingsReturned:result.findings.length})); res.json(result);});
const port=Number(process.env.PORT||4317); app.listen(port,()=>console.info(`[quran-acoustic] listening on http://localhost:${port}`));
