/** Dev helper: renders sample printed + digital ticket PDFs to a folder (no database needed). */
import { writeFile } from "node:fs/promises";
import { physicalSheetPdf, digitalTicketPdf, type PdfTicket } from "../src/lib/pdf";
import { newManualCode, newQrToken } from "../src/lib/tokens";

const out = process.argv[2] ?? ".";
const base: Omit<PdfTicket, "serial" | "qrToken" | "manualCode"> = {
  eventName: "ONDA", theme: "Brazilian Night", themeColor: "#009c3b", venue: "Tropical Bar",
  startsAt: new Date("2026-12-03T19:00:00Z"), endsAt: new Date("2026-12-04T01:00:00Z"), category: "General", priceMillimes: 25000, kind: "PHYSICAL",
};
const t = (i: number, extra: Partial<PdfTicket> = {}): PdfTicket => ({ ...base, serial: `E98B-B003-${String(i).padStart(4, "0")}`, qrToken: newQrToken(), manualCode: newManualCode(), ...extra });
(async () => {
  await writeFile(`${out}/sample-sheet.pdf`, await physicalSheetPdf([t(1), t(2, { category: "VIP", priceMillimes: 60500 }), t(3, { theme: "Retro Disco Fever", themeColor: "#e1102a" })], { label: "Batch B003" }));
  await writeFile(`${out}/sample-digital.pdf`, await digitalTicketPdf(t(4, { kind: "DIGITAL", serial: "E98B-D-42CE5DD6", holderName: "Amira Ben Salah" })));
  console.log("written to", out);
})();
