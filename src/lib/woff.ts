import { inflateSync } from "node:zlib";

/**
 * WOFF 1.0 → TrueType/OpenType (sfnt). PDF viewers cannot read WOFF, so fonts shipped as
 * WOFF (e.g. @fontsource) are unpacked before being embedded in a PDF.
 */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const src = Buffer.from(woff.buffer, woff.byteOffset, woff.byteLength);
  if (src.toString("ascii", 0, 4) !== "wOFF") throw new Error("Not a WOFF 1.0 font");
  const flavor = src.readUInt32BE(4);
  const numTables = src.readUInt16BE(12);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const o = 44 + i * 20;
    const tag = src.toString("latin1", o, o + 4);
    const offset = src.readUInt32BE(o + 4), compLength = src.readUInt32BE(o + 8), origLength = src.readUInt32BE(o + 12), checksum = src.readUInt32BE(o + 16);
    const raw = src.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : raw;
    if (data.length !== origLength) throw new Error(`WOFF table ${tag} has the wrong length`);
    return { tag, checksum, data };
  }).sort((a, b) => (a.tag < b.tag ? -1 : 1));

  const pad4 = (n: number) => (n + 3) & ~3;
  const headerLen = 12 + numTables * 16;
  const total = headerLen + tables.reduce((s, t) => s + pad4(t.data.length), 0);
  const out = Buffer.alloc(total);
  let pow = 1, log = 0;
  while (pow * 2 <= numTables) { pow *= 2; log++; }
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(pow * 16, 6);
  out.writeUInt16BE(log, 8);
  out.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = headerLen;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    out.write(t.tag, r, 4, "latin1");
    out.writeUInt32BE(t.checksum, r + 4);
    out.writeUInt32BE(offset, r + 8);
    out.writeUInt32BE(t.data.length, r + 12);
    t.data.copy(out, offset);
    offset += pad4(t.data.length);
  });
  return new Uint8Array(out);
}
