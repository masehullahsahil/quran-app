/**
 * Reads which Unicode codepoints a WOFF2 font maps to glyphs.
 *
 * Used by the Qaida script tests to prove the bundled Indo-Pak font can draw
 * every codepoint the course uses, without adding a font library. Node only
 * (it uses zlib's Brotli). Reads the format-4 and format-12 cmap subtables,
 * which is what Arabic fonts carry; cmap is never transformed in WOFF2, so
 * only the table directory needs decoding.
 */
import { brotliDecompressSync } from "node:zlib";

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

function readBase128(buf: Buffer, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[offset + i];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new Error("bad UIntBase128");
}

export function woff2Codepoints(woff2: Buffer): Set<number> {
  if (woff2.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  const numTables = woff2.readUInt16BE(12);
  const totalCompressedSize = woff2.readUInt32BE(20);
  let offset = 48;
  const tables: Array<{ tag: string; length: number }> = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = woff2[offset];
    offset += 1;
    let tag: string;
    if ((flags & 0x3f) === 0x3f) {
      tag = woff2.toString("latin1", offset, offset + 4);
      offset += 4;
    } else {
      tag = KNOWN_TAGS[flags & 0x3f];
    }
    const transform = (flags >> 6) & 0x03;
    let origLength: number;
    [origLength, offset] = readBase128(woff2, offset);
    let length = origLength;
    const transformed = tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
    if (transformed) [length, offset] = readBase128(woff2, offset);
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(woff2.subarray(offset, offset + totalCompressedSize));
  let position = 0;
  let cmap: Buffer | null = null;
  for (const table of tables) {
    if (table.tag === "cmap") cmap = data.subarray(position, position + table.length);
    position += table.length;
  }
  if (!cmap) throw new Error("no cmap table");
  return cmapCodepoints(cmap);
}

function cmapCodepoints(cmap: Buffer): Set<number> {
  const out = new Set<number>();
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i += 1) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const at = ranges + s * 2 + rangeOffset + (c - start) * 2;
            glyph = cmap.readUInt16BE(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g += 1) {
        const base = sub + 16 + g * 12;
        const start = cmap.readUInt32BE(base);
        const end = cmap.readUInt32BE(base + 4);
        for (let c = start; c <= end; c += 1) out.add(c);
      }
    }
  }
  return out;
}
