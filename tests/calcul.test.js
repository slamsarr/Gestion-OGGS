import { describe, it, expect } from "vitest";
import { n, F, fmtDate, todayISO, uuid, prixDuJour, rapportVide, calculer, controler, ecrireSyscohada, COUPURES } from "../src/lib/calcul.js";
import { referentielFromSeed } from "../src/lib/seed.js";

describe("Helpers", () => {
  it("n() coerce les valeurs numériques", () => {
    expect(n(null)).toBe(0);
    expect(n(undefined)).toBe(0);
    expect(n("")).toBe(0);
    expect(n("abc")).toBe(0);
    expect(n("42")).toBe(42);
    expect(n(3.14)).toBe(3.14);
    expect(n(0)).toBe(0);
  });

  it("F() formate les nombres au format FR", () => {
    expect(typeof F(1234567)).toBe("string");
    // Le format FR utilise un séparateur de milliers
    const formatted = F(1234567);
    expect(formatted.replace(/\s/g, "")).toContain("1234567");
  });

  it("F() gère les valeurs null/undefined/NaN", () => {
    expect(F(null)).toBe("0");
    expect(F(undefined)).toBe("0");
    expect(F("")).toBe("0");
  });

  it("fmtDate() formate une date ISO", () => {
    const d = fmtDate("2026-01-15");
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(0);
  });

  it("todayISO() retourne une date au format YYYY-MM-DD", () => {
    const today = todayISO();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uuid() génère des identifiants uniques", () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(10);
  });
});

describe("COUPURES", () => {
  it("contient les coupures FCFA standard", () => {
    expect(COUPURES).toContain(10000);
    expect(COUPURES).toContain(5000);
    expect(COUPURES).toContain(2000);
    expect(COUPURES).toContain(1000);
    expect(COUPURES).toContain(500);
    expect(COUPURES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Référentiel", () => {
  const ref = referentielFromSeed();

  it("contient des stations", () => {
    expect(ref.stations.length).toBeGreaterThanOrEqual(2);
    expect(ref.stations[0]).toHaveProperty("code");
    expect(ref.stations[0]).toHaveProperty("nom");
  });

  it("contient des prix", () => {
    expect(ref.prix.length).toBeGreaterThanOrEqual(2);
    const gasoil = ref.prix.find((p) => p.produit === "GASOIL");
    const superP = ref.prix.find((p) => p.produit === "SUPER");
    expect(gasoil).toBeDefined();
    expect(superP).toBeDefined();
    expect(gasoil.prix_vente).toBeGreaterThan(0);
  });

  it("contient des pistolets", () => {
    expect(ref.pistolets.length).toBeGreaterThanOrEqual(4);
    expect(ref.pistolets[0]).toHaveProperty("code");
    expect(ref.pistolets[0]).toHaveProperty("produit");
  });

  it("contient des produits/lubrifiants/gaz", () => {
    expect(ref.produits.length).toBeGreaterThan(0);
  });

  it("contient des catégories de dépense", () => {
    expect(ref.categories.length).toBeGreaterThan(0);
    expect(ref.categories[0]).toHaveProperty("libelle");
  });

  it("contient des clients crédit", () => {
    expect(ref.clients.length).toBeGreaterThan(0);
    expect(ref.clients[0]).toHaveProperty("code");
    expect(ref.clients[0]).toHaveProperty("nom");
  });

  it("contient des cuves avec capacité", () => {
    expect(ref.cuves.length).toBeGreaterThan(0);
    expect(ref.cuves[0]).toHaveProperty("station_id");
    expect(ref.cuves[0]).toHaveProperty("produit");
    expect(ref.cuves[0]).toHaveProperty("capacite_l");
    expect(ref.cuves[0].capacite_l).toBeGreaterThan(1000);
    const gasoil = ref.cuves.filter((c) => c.produit === "GASOIL" || c.produit === "GO");
    expect(gasoil.length).toBeGreaterThan(0);
  });
});

describe("prixDuJour", () => {
  const ref = referentielFromSeed();

  it("retourne le prix GO et SU pour une date", () => {
    expect(prixDuJour(ref.prix, "GASOIL", "2026-09-14")).toBe(755);
    expect(prixDuJour(ref.prix, "SUPER", "2026-09-14")).toBe(990);
  });

  it("utilise le prix le plus récent avant la date", () => {
    const prix = [
      { produit: "GASOIL", prix_vente: 700, date_effet: "2026-01-01" },
      { produit: "GASOIL", prix_vente: 755, date_effet: "2026-06-01" },
      { produit: "SUPER", prix_vente: 900, date_effet: "2026-01-01" },
      { produit: "SUPER", prix_vente: 990, date_effet: "2026-06-01" },
    ];
    expect(prixDuJour(prix, "GASOIL", "2026-09-01")).toBe(755);
    expect(prixDuJour(prix, "SUPER", "2026-09-01")).toBe(990);
  });

  it("retourne 0 si aucun tarif applicable", () => {
    expect(prixDuJour([], "GASOIL", "2026-09-01")).toBe(0);
  });
});

describe("rapportVide", () => {
  const ref = referentielFromSeed();

  it("crée un rapport avec la bonne structure", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test Gérant");
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("station", "HANN");
    expect(r).toHaveProperty("date", "2026-09-14");
    expect(r).toHaveProperty("gerant", "Test Gérant");
    expect(r).toHaveProperty("statut", "BROUILLON");
    expect(r).toHaveProperty("pistolets");
    expect(r).toHaveProperty("lubrifiants");
    expect(r).toHaveProperty("gaz");
    expect(r).toHaveProperty("depenses");
    expect(r).toHaveProperty("versements");
    expect(r).toHaveProperty("coupures");
  });

  it("initialise les versements à un tableau de 5 zéros", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "X");
    expect(r.versements).toHaveLength(5);
    expect(r.versements.every((v) => v === 0 || v === "")).toBe(true);
  });

  it("initialise les pistolets pour la station", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "X");
    const pistKeys = Object.keys(r.pistolets);
    expect(pistKeys.length).toBeGreaterThan(0);
  });

  it("initialise les règlements non-espèces à un tableau vide", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "X");
    expect(r.reglements).toEqual([]);
  });
});

describe("calculer", () => {
  const ref = referentielFromSeed();

  it("calcule volumes et CA pour un rapport avec des index", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    // Simulate pistolets data
    const pistCodes = Object.keys(r.pistolets);
    pistCodes.forEach((code) => {
      r.pistolets[code] = { depart: 10000, fin: 10500 };
    });
    r.lavage = 5000;
    r.versements = [500000, 200000, 0, 0, 0];

    const c = calculer(r, ref);
    expect(c).toHaveProperty("volGO");
    expect(c).toHaveProperty("volSU");
    expect(c).toHaveProperty("caTotal");
    expect(c).toHaveProperty("aVerser");
    expect(c).toHaveProperty("ecart");
    expect(c).toHaveProperty("bis");
    expect(c.volGO + c.volSU).toBeGreaterThan(0);
    expect(c.caTotal).toBeGreaterThan(0);
    expect(c.bis).toBe(700000);
  });

  it("retourne un CA de 0 pour un rapport vide", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    const c = calculer(r, ref);
    expect(c.volGO).toBe(0);
    expect(c.volSU).toBe(0);
  });

  it("calcule correctement les dépenses", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.depenses = [
      { categorie: "Transport", libelle: "Taxi", montant: 5000 },
      { categorie: "Entretien", libelle: "Nettoyage", montant: 10000 },
    ];
    const c = calculer(r, ref);
    expect(c.depenses).toBe(15000);
  });

  it("arrête les calculs si un index fin est inférieur à l'index départ", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.pistolets["gasoil1"] = { depart: 10000, fin: 9000 }; // Erreur
    const c = calculer(r, ref);
    expect(c.pist.find((p) => p.code === "gasoil1").anomalie).toBe("Index fin < index départ");
    expect(c.pist.find((p) => p.code === "gasoil1").volume).toBe(0);
    expect(c.pist.find((p) => p.code === "gasoil1").valeur).toBe(0);
    expect(c.caCarburant).toBe(null);
    expect(c.caTotal).toBe(null);
    expect(c.ecart).toBe(null);
  });

  it("calcule le NET BIS (versements - coupures)", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.versements = [100000, 0, 0, 0, 0];
    r.coupures = { 10000: 5, 5000: 10 };
    const c = calculer(r, ref);
    expect(c.bis).toBe(100000);
    expect(c.totalCoupures).toBe(100000);
    expect(c.netBis).toBe(0);
  });
});

describe("controler", () => {
  const ref = referentielFromSeed();

  it("retourne un tableau d'erreurs", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    const c = calculer(r, ref);
    const err = controler(r, c);
    expect(Array.isArray(err)).toBe(true);
  });

  it("détecte un dépense sans montant", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.depenses = [{ categorie: "Transport", libelle: "", montant: "" }];
    const c = calculer(r, ref);
    const err = controler(r, c);
    expect(err.length).toBeGreaterThan(0);
  });

  it("alerte quand le total tickets détaillés diffère du champ tickets", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.versements = [100000, 0, 0, 0, 0];
    r.tickets = 20000;
    r.reglements = [{ mode: "TICKET", montant: 25000 }];
    const c = calculer(r, ref);
    const err = controler(r, c);
    expect(err.some((e) => e.includes("tickets détaillés"))).toBe(true);
  });

  it("accepte des règlements tickets cohérents avec le champ tickets", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.versements = [100000, 0, 0, 0, 0];
    r.tickets = 25000;
    r.reglements = [{ mode: "TICKET", montant: 25000 }];
    const c = calculer(r, ref);
    const err = controler(r, c);
    expect(err.some((e) => e.includes("tickets détaillés"))).toBe(false);
  });

  it("ignore les règlements non-tickets dans le contrôle des tickets", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.versements = [100000, 0, 0, 0, 0];
    r.tickets = 20000;
    r.reglements = [{ mode: "VISA", montant: 50000 }, { mode: "CREDIT_CLIENT", montant: 80000 }];
    const c = calculer(r, ref);
    const err = controler(r, c);
    expect(err.some((e) => e.includes("tickets détaillés"))).toBe(false);
  });
});

describe("ecrireSyscohada", () => {
  const ref = referentielFromSeed();

  it("génère des écritures comptables", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test");
    r.pistolets = {};
    Object.keys(rapportVide(ref, "HANN", "2026-09-14", "X").pistolets).forEach((code) => {
      r.pistolets[code] = { depart: 10000, fin: 10500 };
    });
    r.lavage = 5000;
    r.versements = [500000, 0, 0, 0, 0];
    const c = calculer(r, ref);
    const rows = ecrireSyscohada(r, c, "HANN");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(1); // header + at least 1 row
    // First row should be header
    expect(rows[0]).toContain("Date");
    expect(rows[0]).toContain("Compte");
  });
});

import { genererWorkbookExcel, genererWorkbookCsv } from "../src/lib/exportExcel.js";

describe("Extractions et Exports Excel / CSV", () => {
  const ref = referentielFromSeed();

  it("génère le classeur Excel du journal de caisse avec toutes les feuilles et données", () => {
    const r = rapportVide(ref, "HANN", "2026-09-14", "Test Gérant");
    Object.keys(r.pistolets).forEach((code) => {
      r.pistolets[code] = { depart: 1000, fin: 1200 };
    });
    r.versements = [200000, 0, 0, 0, 0];
    r.depenses = [{ categorie: "Fournitures", libelle: "Papier", montant: 5000 }];
    const c = calculer(r, ref);

    const wb = genererWorkbookExcel(r, c, ref.stations);
    expect(wb).toBeDefined();
    expect(wb.SheetNames).toContain("JOURNAL");
    expect(wb.SheetNames).toContain("DEPENSES");

    const sheetJournal = wb.Sheets["JOURNAL"];
    expect(sheetJournal).toBeDefined();
    // A1 doit contenir le nom de la station
    expect(sheetJournal["A1"]?.v).toContain("HANN");

    const sheetDep = wb.Sheets["DEPENSES"];
    expect(sheetDep).toBeDefined();
    expect(sheetDep["A1"]?.v).toBe("DATE");
    expect(sheetDep["C2"]?.v).toBe("Papier");
    expect(sheetDep["D2"]?.v).toBe(5000);
  });

  it("génère le classeur des écritures SYSCOHADA pour l'extraction comptable", () => {
    const rows = [
      ["Date", "Journal", "Compte", "Libellé", "Débit", "Crédit", "Pièce", "Station"],
      ["14/09/2026", "VT", "571", "Ventes carburant", 150000, "", "rap-1", "HANN"],
      ["14/09/2026", "VT", "7011", "Ventes carburant", "", 150000, "rap-1", "HANN"],
    ];
    const wb = genererWorkbookCsv(rows);
    expect(wb).toBeDefined();
    expect(wb.SheetNames).toContain("EXPORT");
    const sheet = wb.Sheets["EXPORT"];
    expect(sheet["A1"]?.v).toBe("Date");
    expect(sheet["C1"]?.v).toBe("Compte");
    expect(sheet["C2"]?.v).toBe("571");
    expect(sheet["E2"]?.v).toBe(150000);
  });
});

