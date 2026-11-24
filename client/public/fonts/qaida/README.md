# Qaida Indo-Pak font

`DigitalKhattIndoPak.woff2` is the font the Qaida course renders its Arabic in
(CSS family `"Qaida IndoPak"`, class `.qaida-arabic`). Study and Read do not use
it; they keep Amiri Quran for the Uthmani text.

| | |
|---|---|
| Font | DigitalKhatt IndoPak, Version 0.1 |
| Designer | Amine Anane |
| Copyright | © 2024-2025 Amine Anane; © 2024-2025 Tarteel Inc. |
| Licence | SIL Open Font License 1.1, no Reserved Font Name ([OFL.txt](./OFL.txt), copied from the upstream repository) |
| Based on | the 13-line "Quraan Al Majeed" Indo-Pak mushaf |
| Upstream source | https://github.com/DigitalKhatt/indopakfont (commit `23a0f34ed24e85fcf45e070616433d005ffca962`) |
| Compiled file taken from | https://github.com/DigitalKhatt/digitalkhatt.org, `ClientApp/src/assets/fonts/coretext/DigitalKhattIndoPak.ttf` (commit `4213fab9892774f74f7164c70a70dd84a14f0215`), SHA-256 `0e435ecd7e271ed5b2cf6b36ad60f945606d2c4649bc3f13048a75bfd6b40959` |
| Change made here | none to the glyphs, tables or names: the TTF was only repackaged as WOFF2 (fontTools, Brotli) for the web |

## What it covers

96 codepoints: the Arabic letters, harakat, tanween, sukoon, shaddah, the small
(standing) alif, standing kasra (U+0656), inverted damma (U+0657), maddah, hamza
marks and the Quranic stop marks. It encodes Yeh as U+064A and draws it dotless
at the end of a word, as the Indo-Pak mushaf prints it; it has no Farsi Yeh
(U+06CC). `shared/qaidaScript.test.ts` reads this file's character map and fails
if any Arabic in the Qaida course uses a codepoint it cannot draw.

## Updating it

Replace the WOFF2 with a newer upstream build, keep `OFL.txt` alongside it,
update the table above, and run `pnpm test`.
