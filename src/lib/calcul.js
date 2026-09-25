export const T = {
  petrol: "#4A1559", // Star Energy Deep Purple / Brand Primary
  purple: "#56216C", // Star Purple
  orange: "#FA5200", // Star Dynamic Orange Energy
  gold: "#FA5200",   // Star Dynamic Orange Accent
  green: "#76A628",  // Star Station Canopy Green
  lime: "#82B82C",   // Star Vivid Lime
  magenta: "#B51772",// Star Ribbon Magenta
  ink: "#1D1024",    // Deep Star Ink
  paper: "#F7FAF4",  // Fresh clean light background
  line: "#E1E7DB",   // Soft harmonious border
  ok: "#76A628",     // Star Canopy Green
  alert: "#DC2626",  // Red alert
  muted: "#6B7280",  // Slate text
};

export const COUPURES = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50];
export const SEUIL_ECART = 5000;
export const SAUT_INDEX_MAX = 20000;

export const INDEX_VEILLE = {
  gasoil1: 989304, gasoil2: 742849, gasoil3: 957092, gasoil4: 2214211,
  super1: 1029228, super2: 1342323, super3: 1491719, super4: 1161191,
};
export const STOCK_VEILLE = {
  "5W30 5L": 1, "10W40 5L": 15, "WIN'S": 16, "4 TEMPS": 24,
  "STAR GLACIOL 1L": 17, "80W90 (HUILE BOITE)": 20, GRAISSE: 18, "5W30 1L": 68,
};

export const n = (v) => (v === "" || v === null || v === undefined || Number.isNaN(+v) ? 0 : +v);
export const F = (v) => Math.round(n(v)).toLocaleString("fr-FR");
export const fmtDate = (iso) => (iso || "").split("-").reverse().join("/");
export const todayISO = () => new Date().toISOString().slice(0, 10);

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function prixDuJour(prixList, produit, dateISO) {
  const rows = [...prixList].filter((p) => p.produit === produit && p.date_effet <= dateISO).sort((a, b) => (a.date_effet < b.date_effet ? 1 : -1));
  return rows[0]?.prix_vente ?? 0;
}

export function rapportVide(ref, stationCode, date, gerantNom) {
  const pistolets = {};
  for (const p of ref.pistolets.filter((x) => x.station_code === stationCode || !x.station_code)) {
    pistolets[p.code] = { depart: INDEX_VEILLE[p.code] ?? 0, fin: "" };
  }
  if (Object.keys(pistolets).length === 0) {
    for (const code of Object.keys(INDEX_VEILLE)) pistolets[code] = { depart: INDEX_VEILLE[code], fin: "" };
  }
  const lubrifiants = {};
  for (const l of ref.lubrifiants) {
    lubrifiants[l.designation] = { debut: STOCK_VEILLE[l.designation] ?? 0, reception: "", vendu: "", code: l.code, prix: l.prix_vente };
  }
  const gaz = {};
  for (const g of ref.gaz) {
    gaz[g.designation] = { present: 0, livraison: "", vendu: "", code: g.code, prix: g.prix_vente, cout: g.cout_achat || 0 };
  }
  return {
    station: stationCode,
    date,
    statut: "BROUILLON",
    gerant: gerantNom || "",
    pistolets,
    lubrifiants,
    gaz,
    lavage: "",
    tickets: "",
    remboursement: "",
    depots: "",
    depenses: [],
    delestages: [],
    reglements: [],
    versements: ["", "", "", "", ""],
    coupures: Object.fromEntries(COUPURES.map((c) => [c, ""])),
    commentaire: "",
    motifRejet: "",
    client_uuid: uuid(),
    id: uuid(),
  };
}

export function calculer(r, ref) {
  const prixList = ref.prix || [];
  const pGO = prixDuJour(prixList, "GASOIL", r.date);
  const pSU = prixDuJour(prixList, "SUPER", r.date);
  const defs = ref.pistolets?.length
    ? ref.pistolets.filter((p) => !p.station_code || p.station_code === r.station)
    : [
        ...[1, 2, 3, 4].map((i) => ({ code: `gasoil${i}`, produit: "GASOIL" })),
        ...[1, 2, 3, 4].map((i) => ({ code: `super${i}`, produit: "SUPER" })),
      ];
  const pist = defs.map((p) => {
    const row = r.pistolets[p.code] || { depart: 0, fin: "" };
    const prix = p.produit === "GASOIL" ? pGO : pSU;
    const rawVolume = row.fin === "" ? 0 : n(row.fin) - n(row.depart);
    const anomalie = row.fin !== "" && (rawVolume < 0 ? "Index fin < index départ" : rawVolume > SAUT_INDEX_MAX ? "Saut d'index suspect" : "");
    const volume = anomalie ? 0 : rawVolume;
    const valeur = anomalie ? 0 : volume * prix;
    return { ...p, depart: n(row.depart), fin: n(row.fin), prix, volume, valeur, anomalie };
  });

  const errorPist = pist.some((p) => p.anomalie);
  const volGO = errorPist ? 0 : pist.filter((p) => p.produit === "GASOIL").reduce((s, p) => s + p.volume, 0);
  const volSU = errorPist ? 0 : pist.filter((p) => p.produit === "SUPER").reduce((s, p) => s + p.volume, 0);
  const caCarburant = errorPist ? null : volGO * pGO + volSU * pSU;

  const lub = (ref.lubrifiants || []).map((l) => {
    const x = r.lubrifiants[l.designation] || { debut: 0, reception: "", vendu: "" };
    const stockFin = n(x.debut) + n(x.reception) - n(x.vendu);
    return {
      ...l, nom: l.designation, prix: l.prix_vente, seuil: l.seuil_alerte ?? 5,
      debut: n(x.debut), reception: n(x.reception), vendu: n(x.vendu), stockFin,
      valeurVente: n(x.vendu) * l.prix_vente, valeurStock: stockFin * l.prix_vente,
      bas: stockFin < (l.seuil_alerte ?? 5) && (n(x.debut) > 0 || n(x.vendu) > 0),
    };
  });
  const caLub = lub.reduce((s, l) => s + l.valeurVente, 0);
  const valeurStockLub = lub.reduce((s, l) => s + l.valeurStock, 0);

  const gaz = (ref.gaz || []).map((g) => {
    const x = r.gaz[g.designation] || { present: 0, livraison: "", vendu: "" };
    const restant = n(x.present) + n(x.livraison) - n(x.vendu);
    return {
      ...g, nom: g.designation, prix: g.prix_vente, cout: g.cout_achat || 0,
      present: n(x.present), livraison: n(x.livraison), vendu: n(x.vendu), restant,
      valeurVente: n(x.vendu) * g.prix_vente, marge: n(x.vendu) * (g.prix_vente - (g.cout_achat || 0)),
    };
  });
  const caGaz = gaz.reduce((s, g) => s + g.valeurVente, 0);
  const margeGaz = gaz.reduce((s, g) => s + g.marge, 0);

  const lavage = n(r.lavage), boutique = n(r.boutique), tickets = n(r.tickets), remboursement = n(r.remboursement), depots = n(r.depots);
  const depenses = (r.depenses || []).reduce((s, d) => s + n(d.montant), 0);
  const totalDelestages = (r.delestages || []).reduce((s, d) => s + n(d.montant), 0);
  const caTotal = errorPist ? null : (caCarburant ?? 0) + caLub + caGaz + lavage + boutique + depots + remboursement;
  const aVerser = caTotal === null ? null : caTotal - tickets - depenses;
  const bis = (r.versements || []).reduce((s, v) => s + n(v), 0);
  const totalCoupures = COUPURES.reduce((s, c) => s + c * n(r.coupures?.[c]), 0);
  const ecart = caTotal === null ? null : bis + depenses + tickets - caTotal;
  const netBis = bis - totalCoupures;
  const ventilation = { carburant: bis - caLub - lavage - boutique - caGaz, lubrifiant: caLub, lavage, boutique, gaz: caGaz };
  return { pGO, pSU, pist, volGO, volSU, caCarburant, lub, caLub, valeurStockLub, gaz, caGaz, margeGaz, lavage, boutique, tickets, remboursement, depots, depenses, totalDelestages, caTotal, aVerser, bis, totalCoupures, ecart, netBis, ventilation };
}

export function controler(r, c) {
  const e = [];
  c.pist.forEach((p) => p.anomalie && e.push(`${p.code} : ${p.anomalie}`));
  if (c.pist.every((p) => p.fin === 0)) e.push("Aucun index fin saisi");
  if (c.bis === 0) e.push("Aucun versement saisi");
  if (Math.abs(c.ecart) > SEUIL_ECART) e.push(`Écart de caisse ${F(c.ecart)} F au-delà du seuil (${F(SEUIL_ECART)} F)`);
  if (c.totalCoupures > c.bis) e.push("Le détail des coupures dépasse les versements");
  (r.depenses || []).forEach((d, i) => (!d.libelle || n(d.montant) <= 0) && e.push(`Dépense n°${i + 1} incomplète`));
  const ticketsReglements = (r.reglements || []).filter((x) => x.mode === "TICKET").reduce((s, x) => s + n(x.montant), 0);
  if (ticketsReglements > 0 && Math.abs(ticketsReglements - c.tickets) > 0) e.push(`Total tickets détaillés (${F(ticketsReglements)} F) différent du champ tickets (${F(c.tickets)} F)`);
  c.lub.forEach((l) => l.stockFin < 0 && e.push(`Stock négatif : ${l.nom}`));
  return e;
}

export function ecrireSyscohada(r, c, stationNom) {
  const date = fmtDate(r.date);
  const rows = [
    ["Date", "Journal", "Compte", "Libellé", "Débit", "Crédit", "Pièce", "Station"],
    [date, "VT", "571", "Ventes carburant", c.caCarburant, "", r.id, stationNom],
    [date, "VT", "7011", "Ventes carburant", "", c.caCarburant, r.id, stationNom],
    [date, "VT", "571", "Ventes lubrifiants", c.caLub, "", r.id, stationNom],
    [date, "VT", "7011", "Ventes lubrifiants", "", c.caLub, r.id, stationNom],
    [date, "VT", "571", "Ventes gaz", c.caGaz, "", r.id, stationNom],
    [date, "VT", "7011", "Ventes gaz", "", c.caGaz, r.id, stationNom],
    [date, "VT", "571", "Lavage", c.lavage, "", r.id, stationNom],
    [date, "VT", "7061", "Lavage", "", c.lavage, r.id, stationNom],
    ...(c.boutique > 0 ? [
      [date, "VT", "571", "Ventes boutique", c.boutique, "", r.id, stationNom],
      [date, "VT", "7012", "Ventes boutique", "", c.boutique, r.id, stationNom],
    ] : []),
    [date, "OD", "4111", "Tickets / bons", c.tickets, "", r.id, stationNom],
    [date, "OD", "571", "Tickets / bons", "", c.tickets, r.id, stationNom],
  ];
  for (const d of r.depenses || []) {
    rows.push([date, "CA", d.compte || "6588", d.libelle, n(d.montant), "", r.id, stationNom]);
    rows.push([date, "CA", "571", d.libelle, "", n(d.montant), r.id, stationNom]);
  }
  rows.push([date, "BQ", "521", "Versements banque", c.bis, "", r.id, stationNom]);
  rows.push([date, "BQ", "571", "Versements banque", "", c.bis, r.id, stationNom]);
  if (c.ecart !== 0) {
    const compte = c.ecart > 0 ? "758" : "658";
    rows.push([date, "OD", compte, "Écart de caisse", c.ecart > 0 ? 0 : Math.abs(c.ecart), c.ecart > 0 ? c.ecart : 0, r.id, stationNom]);
    rows.push([date, "OD", "571", "Écart de caisse", c.ecart > 0 ? c.ecart : 0, c.ecart > 0 ? 0 : Math.abs(c.ecart), r.id, stationNom]);
  }
  return rows;
}
