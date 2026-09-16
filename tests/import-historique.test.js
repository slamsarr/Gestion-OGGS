import { describe, it, expect } from "vitest";
import { extraireRapports, parseBlock, parseJournalOgss, cellToISO, excelSerialToISO } from "../scripts/lib/parse-journal-excel.js";

describe("cellToISO / excelSerialToISO", () => {
  it("parse une date FR", () => {
    expect(cellToISO("14/09/2026")).toBe("2026-09-14");
  });
  it("parse un serial Excel", () => {
    expect(excelSerialToISO(46279)).toBe("2026-09-14");
    expect(excelSerialToISO(45948)).toBe("2025-10-18");
  });
});

describe("parseBlock", () => {
  it("extrait pistolets, versements et CA", () => {
    const r = parseBlock("2026-09-14", [
      ["gasoil1", 10000, 10500],
      ["super1", 20000, 20100],
      ["VERSEMENT 1", 500000],
      ["C.A. TOTAL", 700000],
      ["A VERSER", 650000],
    ], "HANN");
    expect(r.pistolets.GASOIL1).toEqual({ depart: 10000, fin: 10500 });
    expect(r.versements[0]).toBe(500000);
    expect(r.ca_total).toBe(700000);
    expect(r.a_verser).toBe(650000);
  });
});

describe("extraireRapports", () => {
  it("découpe un historique par dates en colonne A", () => {
    const sheets = [{
      name: "HISTO",
      data: [
        ["01/09/2026"],
        ["gasoil1", 10, 20],
        ["VERSEMENT 1", 1000],
        ["15/09/2026"],
        ["gasoil1", 20, 40],
        ["VERSEMENT 1", 2000],
      ],
    }];
    const list = extraireRapports(sheets, "HANN");
    expect(list).toHaveLength(2);
    expect(list[0].date).toBe("2026-09-01");
    expect(list[1].date).toBe("2026-09-15");
    expect(list[1].versements[0]).toBe(2000);
  });

  it("parse une feuille JOURNAL OGSS + DEPENSES", () => {
    const sheets = [
      {
        name: "JOURNAL",
        data: [
          ["STATION SERVICES STAR ENERGY HANN", "", "", "", "14/09/2026"],
          ["14/09/2026", "index départ", "index fin"],
          ["gasoil1", 1000, 1100],
          ["super1", 2000, 2050],
          ...Array.from({ length: 24 }, () => []),
          ["VERSEMENT 1", 800000],
          ["VERSEMENT 2", 0],
          ["", "", "C.A.TOTAL", 900000],
        ],
      },
      {
        name: "DEPENSES",
        data: [
          ["DATE", "CATEGORIE", "LIBELLE", "MONTANT"],
          ["14/09/2026", "Transport", "Taxi", 5000],
        ],
      },
    ];
    const list = extraireRapports(sheets, "HANN");
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe("2026-09-14");
    expect(list[0].pistolets.GASOIL1.fin).toBe(1100);
    expect(list[0].depenses[0].montant).toBe(5000);
  });
});

describe("parseJournalOgss", () => {
  it("retourne null si aucune date", () => {
    expect(parseJournalOgss([["sans date"]], "HANN")).toBeNull();
  });
});
