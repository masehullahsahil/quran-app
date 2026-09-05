import { QURAN_PRONUNCIATION_CONFUSIONS } from "../../shared/quranAcoustic";
import type { PcmAudio, WordTiming } from "./types";

export type PhonemeObservation = { wordIndex: number; confusionPairId: (typeof QURAN_PRONUNCIATION_CONFUSIONS)[number]["id"]; confidence: number; modelBacked: boolean };
export interface PhonemeEvaluator { evaluate(input: { audio: PcmAudio; words: WordTiming[] }): Promise<PhonemeObservation[]>; }
/** Deliberately emits nothing until a validated acoustic model is installed. */
export class AbstainingPhonemeEvaluator implements PhonemeEvaluator { async evaluate(): Promise<PhonemeObservation[]> { return []; } }
