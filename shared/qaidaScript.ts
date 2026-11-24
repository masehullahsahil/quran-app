/**
 * The Qaida course is written in the Indo-Pak script.
 *
 * A Noorani Qaida prepares a learner to read the Indo-Pak mushaf, so the course
 * uses that mushaf's conventions. Study and Read keep the Uthmani text from
 * Quran.com; only the Qaida is Indo-Pak, and the bridge lesson at the end of the
 * course shows the two side by side.
 *
 * The mapping below was not written from memory. Every row was checked against
 * two digital Indo-Pak mushaf texts, counting how often each codepoint occurs:
 *
 *  - IP-A: the Naskh Nastaleeq Indo-Pak text published by QuranWBW for Quran.com
 *    (Madinah version 9.6, checked by its authors word by word against the King
 *    Fahd Complex's printed Nastaleeq mushaf), from github.com/marwan/indopak-quran-text;
 *  - IP-B: DigitalKhatt's 15-line Indo-Pak mushaf text (Tarteel), the text the
 *    bundled DigitalKhatt IndoPak font was built to render, from
 *    github.com/DigitalKhatt/digitalkhatt.org.
 *
 * The two agree on every row except Yeh, where IP-A uses Farsi Yeh (U+06CC) and
 * IP-B uses Arabic Yeh (U+064A). The course follows IP-B for Yeh: the bundled
 * font has no Farsi Yeh glyph, and it draws Arabic Yeh dotless at the end of a
 * word, which is how the Indo-Pak mushaf prints it. See docs/qaida-curriculum.md.
 *
 * Quoted Quranic words are not converted by rule. Each is copied from the
 * reference at its own surah:ayah (INDOPAK_QURAN_WORDS) and was confirmed in
 * both texts.
 *
 * Like the rest of the course, this is AI-drafted and needs a qualified
 * teacher's review.
 */

export type ScriptMappingRow = {
  /** What the course data used before. */
  from: string;
  /** What the Indo-Pak course uses now. */
  to: string;
  /** Codepoints, for the docs table. */
  fromCodepoints: string;
  toCodepoints: string;
  /** What the references showed. */
  evidence: string;
};

/** The mapping used for the conversion. Rendered into docs/qaida-curriculum.md. */
export const INDOPAK_MAPPING: readonly ScriptMappingRow[] = [
  {
    from: "ي Yeh", to: "ي Yeh (unchanged)", fromCodepoints: "U+064A", toCodepoints: "U+064A",
    evidence: "IP-B: 24,816× U+064A, 0× U+06CC. IP-A uses U+06CC instead (24,415×, 0× U+064A). The references disagree; the course follows IP-B because the bundled font has no U+06CC and renders U+064A in the Indo-Pak (dotless final) form.",
  },
  {
    from: "ى Alef Maksura at the end of a word", to: "ي after a standing fatha (ـٰي)", fromCodepoints: "U+0649", toCodepoints: "U+0670 U+064A",
    evidence: "IP-B: 1,441 words end ٰي against 34 ending ٰى; IP-A writes them ٰی. Both use U+0649 only as the dotless seat of a hamzah (ىِٕ), which the course does not show.",
  },
  {
    from: "ك Kaf", to: "ك Kaf (unchanged)", fromCodepoints: "U+0643", toCodepoints: "U+0643",
    evidence: "IP-A 10,496×, IP-B 10,504× U+0643; Keheh U+06A9 0× in both. The Indo-Pak shape is the font's, not a different codepoint.",
  },
  {
    from: "ه Heh", to: "ه Heh (unchanged)", fromCodepoints: "U+0647", toCodepoints: "U+0647",
    evidence: "IP-A 14,850×, IP-B 14,967× U+0647; Heh Goal U+06C1 and Heh Doachashmee U+06BE 0× in both.",
  },
  {
    from: "أ Alef with hamza above (word-initial)", to: "ا carrying the vowel (اَ اُ)", fromCodepoints: "U+0623", toCodepoints: "U+0627 + U+064E/U+064F",
    evidence: "IP-A 2× (both خَطَأً, not word-initial), IP-B 0×. e.g. اَحَدٌ (112:1), اَنْعَمْتَ (1:7).",
  },
  {
    from: "إ Alef with hamza below", to: "ا carrying kasra (اِ)", fromCodepoints: "U+0625", toCodepoints: "U+0627 U+0650",
    evidence: "0× in both. e.g. اِيَّاكَ (1:5), اِنَّ (103:2).",
  },
  {
    from: "ٱ Alef wasla", to: "ا (bare when continuing; carries its vowel at the start of an ayah)", fromCodepoints: "U+0671", toCodepoints: "U+0627",
    evidence: "0× in both. e.g. اَلْحَمْدُ (1:2, ayah start), اِهْدِنَا (1:6), الرَّحْمٰنِ (1:1).",
  },
  {
    from: "ة Teh marbuta", to: "ة (unchanged)", fromCodepoints: "U+0629", toCodepoints: "U+0629",
    evidence: "IP-A 2,344×, IP-B 2,475×; U+06C3 0× in both. e.g. هُمَزَةٍ (104:1).",
  },
  {
    from: "fatha + small alif (ـَٰ)", to: "standing fatha alone (ـٰ)", fromCodepoints: "U+064E U+0670", toCodepoints: "U+0670",
    evidence: "Both: ذٰلِكَ (2:2), الرَّحْمٰنِ (1:1), اللّٰهِ (1:1). U+0670 is the same codepoint in both scripts; Indo-Pak writes it without the fatha.",
  },
  {
    from: "madd waw / ya with no mark (ـُو ـِي)", to: "madd waw / ya carrying sukoon (ـُوْ ـِيْ)", fromCodepoints: "U+064F U+0648 / U+0650 U+064A", toCodepoints: "U+064F U+0648 U+0652 / U+0650 U+064A U+0652",
    evidence: "Both: الرَّحِيْمِ (1:1), الدِّيْنِ (1:4), نَسْتَعِيْنُ (1:5). Alif madd stays bare (بَا).",
  },
  {
    from: "ؤ ئ ء hamzah and its seats", to: "unchanged", fromCodepoints: "U+0624 U+0626 U+0621", toCodepoints: "U+0624 U+0626 U+0621",
    evidence: "IP-A uses the precomposed forms (706×, 244×, 1,714×); IP-B writes ؤ ئ as a base letter + U+0654. The course keeps the precomposed forms, which the font renders and Unicode normalisation (NFC) produces.",
  },
  {
    from: "small alif ـٰ, standing kasra ـٖ, inverted damma ـٗ", to: "unchanged", fromCodepoints: "U+0670 U+0656 U+0657", toCodepoints: "U+0670 U+0656 U+0657",
    evidence: "Used by both (U+0656 993×, U+0657 1,257× in each).",
  },
  {
    from: "sukoon, tanween, maddah", to: "unchanged", fromCodepoints: "U+0652 U+064B-U+064D U+0653", toCodepoints: "U+0652 U+064B-U+064D U+0653",
    evidence: "Round sukoon U+0652 in both (the Uthmani U+06E1 form is not used for sukoon).",
  },
];

/**
 * Each Quranic word the course quotes, as the course used to write it and as
 * both Indo-Pak references write it at its surah:ayah.
 */
export const INDOPAK_QURAN_WORDS: Readonly<Record<string, { indoPak: string; reference: string }>> = {
  "الٓمٓ": { indoPak: "الٓمّٓ", reference: "2:1" },
  "كٓهيعٓصٓ": { indoPak: "كٓهٰيٰعٓصٓ", reference: "19:1" },
  "طه": { indoPak: "طٰهٰ", reference: "20:1" },
  "طسٓمٓ": { indoPak: "طٰسٓمّٓ", reference: "26:1" },
  "يسٓ": { indoPak: "يٰسٓ", reference: "36:1" },
  "حمٓ": { indoPak: "حٰمٓ", reference: "40:1" },
  "صٓ": { indoPak: "صٓ", reference: "38:1" },
  "قٓ": { indoPak: "قٓ", reference: "50:1" },
  "نٓ": { indoPak: "نٓ", reference: "68:1" },
  "هُوَ": { indoPak: "هُوَ", reference: "112:1" },
  "أَحَدٌ": { indoPak: "اَحَدٌ", reference: "112:1" },
  "ذَٰلِكَ": { indoPak: "ذٰلِكَ", reference: "2:2" },
  "قُرَيْشٍ": { indoPak: "قُرَيْشٍ", reference: "106:1" },
  "قُلْ": { indoPak: "قُلْ", reference: "112:1" },
  "أَنْعَمْتَ": { indoPak: "اَنْعَمْتَ", reference: "1:7" },
  "رَبِّ": { indoPak: "رَبِّ", reference: "1:2" },
  "إِيَّاكَ": { indoPak: "اِيَّاكَ", reference: "1:5" },
  "إِنَّ": { indoPak: "اِنَّ", reference: "103:2" },
  "الْحَمْدُ": { indoPak: "اَلْحَمْدُ", reference: "1:2" },
  "الصِّرَاطَ": { indoPak: "الصِّرَاطَ", reference: "1:6" },
  "الرَّحِيمِ": { indoPak: "الرَّحِيْمِ", reference: "1:1" },
  "الْعَالَمِينَ": { indoPak: "الْعٰلَمِيْنَ", reference: "1:2" },
  "الدِّينِ": { indoPak: "الدِّيْنِ", reference: "1:4" },
  "اهْدِنَا": { indoPak: "اِهْدِنَا", reference: "1:6" },
  "الرَّحْمَٰنِ": { indoPak: "الرَّحْمٰنِ", reference: "1:1" },
  "الْفَلَقِ": { indoPak: "الْفَلَقِ", reference: "113:1" },
  "هُمَزَةٍ": { indoPak: "هُمَزَةٍ", reference: "104:1" },
  "بِسْمِ": { indoPak: "بِسْمِ", reference: "1:1" },
  "اللَّهِ": { indoPak: "اللّٰهِ", reference: "1:1" },
  "لِلَّهِ": { indoPak: "لِلّٰهِ", reference: "1:2" },
  "نَسْتَعِينُ": { indoPak: "نَسْتَعِيْنُ", reference: "1:5" },
  "نَعْبُدُ": { indoPak: "نَعْبُدُ", reference: "1:5" },
  // In Indo-Pak, 1:4 is written with a standing fatha (مٰلِكِ), not a full alif.
  "مَالِكِ": { indoPak: "مٰلِكِ", reference: "1:4" },
  // Quoted for the first time in the Indo-Pak course (both references agree).
  "صِرَاطَ": { indoPak: "صِرَاطَ", reference: "1:7" },
  "عَلَى": { indoPak: "عَلٰي", reference: "2:5" },
};

const MARK = "ً-ْٰ";

/**
 * Converts teaching Arabic (syllables, drill rows, letters, marks) to the
 * Indo-Pak conventions in INDOPAK_MAPPING. Quoted Quran words are looked up in
 * INDOPAK_QURAN_WORDS instead; this rule set never invents a Quran spelling.
 */
export function toIndoPak(text: string): string {
  const quoted = INDOPAK_QURAN_WORDS[text];
  if (quoted) return quoted.indoPak;
  return text
    .split(/(\s+)/)
    .map((token) => (INDOPAK_QURAN_WORDS[token] ? INDOPAK_QURAN_WORDS[token].indoPak : convertToken(token)))
    .join("")
    .normalize("NFC");
}

function convertToken(token: string): string {
  return token
    .normalize("NFC")
    .replace(/أ/g, "ا") // أ → ا (its vowel stays on the alif)
    .replace(/إ/g, "ا") // إ → ا
    .replace(/ٱ/g, "ا") // ٱ → ا
    .replace(/َ(ّ?)ٰ/g, "$1ٰ") // fatha + small alif → standing fatha
    .replace(/ى/g, "ي") // final alif maksura → yeh
    .replace(new RegExp(`\\u064F\\u0648(?![${MARK}])`, "g"), "ُوْ") // madd waw takes sukoon
    .replace(new RegExp(`\\u0650\\u064A(?![${MARK}])`, "g"), "ِيْ"); // madd ya takes sukoon
}

/** One way a string still uses the old script, for tests and audits. */
export type OldScriptFinding = { codepoint: string; why: string };

/**
 * What in a piece of Qaida Arabic still follows the old conventions. Empty
 * means it uses only the Indo-Pak forms in INDOPAK_MAPPING.
 */
export function oldScriptFindings(text: string): OldScriptFinding[] {
  const findings: OldScriptFinding[] = [];
  const t = text.normalize("NFC");
  if (/أ/.test(t)) findings.push({ codepoint: "U+0623", why: "alef with hamza above (Indo-Pak writes ا with its vowel)" });
  if (/إ/.test(t)) findings.push({ codepoint: "U+0625", why: "alef with hamza below (Indo-Pak writes اِ)" });
  if (/ٱ/.test(t)) findings.push({ codepoint: "U+0671", why: "alef wasla (Indo-Pak writes a plain alif)" });
  if (/ى(?!ٕ)/.test(t)) findings.push({ codepoint: "U+0649", why: "alef maksura (Indo-Pak writes ي after a standing fatha)" });
  if (/َّ?ٰ/.test(t)) findings.push({ codepoint: "U+064E U+0670", why: "fatha before a small alif (Indo-Pak writes the standing fatha alone)" });
  if (new RegExp(`\\u064F\\u0648(?![${MARK}])`).test(t)) findings.push({ codepoint: "U+0648", why: "madd waw without sukoon" });
  if (new RegExp(`\\u0650\\u064A(?![${MARK}])`).test(t)) findings.push({ codepoint: "U+064A", why: "madd ya without sukoon" });
  if (/[یکہھے]/.test(t)) findings.push({ codepoint: "U+06CC/06A9/06C1/06BE/06D2", why: "Urdu letter forms the references do not use for the Quran" });
  if (/[ۡۥۦ]/.test(t)) findings.push({ codepoint: "U+06E1/06E5/06E6", why: "Uthmani-only marks (dotless-head sukoon, small waw, small ya)" });
  return findings;
}

/** Arabic runs inside a string of English or other prose. */
export function arabicRuns(text: string): string[] {
  return text.match(/[ؐ-ؚؠ-ٰٟ-ۓۖ-ۭـ]+(?:\s+[ؐ-ؚؠ-ٰٟ-ۓۖ-ۭـ]+)*/g) ?? [];
}
