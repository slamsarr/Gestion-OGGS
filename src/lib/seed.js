export const SEED_STATIONS = [
  { id: "st-hann", code: "HANN", nom: "Star Energy Hann Mariste", localisation: "Hann, Dakar", nb_pistolets: 8, actif: true },
  { id: "st-ndia", code: "NDIAKHIRATE", nom: "Star Energy Ndiakhirate", localisation: "Ndiakhirate, Rufisque", nb_pistolets: 8, actif: true },
];

export const SEED_PRIX = [
  { produit: "GASOIL", prix_vente: 680, prix_achat: 665.5, date_effet: "2026-01-01" },
  { produit: "SUPER", prix_vente: 920, prix_achat: 905.5, date_effet: "2026-01-01" },
  { produit: "GASOIL", prix_vente: 755, prix_achat: 740.5, date_effet: "2026-08-15" },
  { produit: "SUPER", prix_vente: 990, prix_achat: 975.5, date_effet: "2026-08-15" },
];

export const PISTOLET_DEFS = [
  ["gasoil1", "GASOIL", 1], ["gasoil2", "GASOIL", 2], ["gasoil3", "GASOIL", 3], ["gasoil4", "GASOIL", 4],
  ["super1", "SUPER", 5], ["super2", "SUPER", 6], ["super3", "SUPER", 7], ["super4", "SUPER", 8],
];

export const SEED_PRODUITS = [
  ["LUB-5W40-5L", "5W40 5L", "LUBRIFIANT", "bidon", 29000, null, 1],
  ["LUB-5W30-5L", "5W30 5L", "LUBRIFIANT", "bidon", 33000, null, 2],
  ["LUB-10W40-5L", "10W40 5L", "LUBRIFIANT", "bidon", 18000, null, 3],
  ["LUB-VRAC", "VRAC", "LUBRIFIANT", "L", 2200, null, 4],
  ["LUB-15W40-5L", "15W40 5L", "LUBRIFIANT", "bidon", 15000, null, 5],
  ["LUB-20W50-5L", "20w50 5L", "LUBRIFIANT", "bidon", 13500, null, 6],
  ["LUB-SAE50-5L", "SAE50 5L", "LUBRIFIANT", "bidon", 13000, null, 7],
  ["LUB-SAE50-1L", "SAE50 1L", "LUBRIFIANT", "bidon", 2800, null, 8],
  ["LUB-SOLEX", "SOLEX", "LUBRIFIANT", "unité", 800, null, 9],
  ["LUB-WINS", "WIN'S", "LUBRIFIANT", "unité", 2500, null, 10],
  ["LUB-ATF70", "ATF 70", "LUBRIFIANT", "bidon", 3200, null, 11],
  ["LUB-4T", "4 TEMPS", "LUBRIFIANT", "bidon", 3000, null, 12],
  ["LUB-CEPSA-GLACIOL-5L", "CEPSA GLACIOL 5L", "LUBRIFIANT", "bidon", 5000, null, 13],
  ["LUB-STAR-GLACIOL-1L", "STAR GLACIOL 1L", "LUBRIFIANT", "bidon", 1000, null, 14],
  ["LUB-LAVE-GLACE", "CEPSA LAVE GLACE", "LUBRIFIANT", "bidon", 1500, null, 15],
  ["LUB-80W90", "80W90 (HUILE BOITE)", "LUBRIFIANT", "L", 2500, null, 16],
  ["LUB-GRAISSE", "GRAISSE", "LUBRIFIANT", "unité", 3500, null, 17],
  ["LUB-ATF2000S-1L", "CEPSA ATF 2000S 1L", "LUBRIFIANT", "bidon", 3500, null, 18],
  ["LUB-15W40-1L", "15W40 1L", "LUBRIFIANT", "bidon", 3000, null, 19],
  ["LUB-20W50-1L", "20W50 1L", "LUBRIFIANT", "bidon", 2700, null, 20],
  ["LUB-5W30-1L", "5W30 1L", "LUBRIFIANT", "bidon", 6600, null, 21],
  ["ACC-ACIDE", "ACIDE", "ACCESSOIRE", "unité", 400, null, 22],
  ["ACC-EAU-DIST", "EAU DISTILLEE", "ACCESSOIRE", "unité", 200, null, 23],
  ["GAZ-9KG", "LOBBOU GAZ 9KG", "GAZ", "bouteille", 4290, 4175, 30],
  ["GAZ-3KG", "GAZ 3 KGS", "GAZ", "bouteille", 1305, 1269, 31],
  ["GAZ-6KG", "GAZ 6 KGS", "GAZ", "bouteille", 2885, 2800, 32],
  ["GAZ-12KG", "GAZ 12 KGS", "GAZ", "bouteille", 6250, 6022, 33],
];

export const SEED_CATEGORIES = [
  ["TRANSPORT", "Transport", "VARIABLE", "6241"],
  ["ENTRETIEN", "Entretien", "VARIABLE", "6242"],
  ["FOURNITURES", "Fournitures", "VARIABLE", "6047"],
  ["REPAS", "Repas", "VARIABLE", "6281"],
  ["RECHARGE_GAZ", "Recharge gaz", "VARIABLE", "6011"],
  ["BON_CLIENT", "Bon client (crédit)", "AVANCE_CLIENT", "4111"],
  ["SALAIRE_AVANCE", "Avance salaire", "FIXE", "4211"],
  ["AUTRE", "Autre", "VARIABLE", "6588"],
];

export const SEED_CLIENTS = [
  ["ITS", "ITS (transport)"],
  ["JOUKADAR", "Joukadar / DMJ"],
  ["MBEYE", "Mamour Beye"],
  ["ONDIAYE", "O. Ndiaye — Sté de transport"],
  ["ICONS", "Icons SA / FADSR"],
  ["RETBA", "Retba / Team Dir CTT / Provale"],
];

export const SEED_CUVES = [
  ["GASOIL", 30000],
  ["SUPER", 20000],
];

export const SEED_REGLEMENTS = ["TICKET", "CARTE_STAR", "PLATEFORME_PETROSEN", "ORANGE_MONEY", "WAVE", "TPE", "CREDIT_CLIENT"];

export const DEMO_USERS = [
  { id: "u-admin", email: "admin@ogss.demo", password: "Admin2026!", nom_complet: "Administrateur OGSS", role: "admin", station_id: null },
  { id: "u-gerant-hann", email: "gerant.hann@ogss.demo", password: "Hann2026!", nom_complet: "Gérant Hann", role: "gerant", station_id: "st-hann" },
  { id: "u-gerant-ndia", email: "gerant.ndia@ogss.demo", password: "Ndia2026!", nom_complet: "Gérant Ndiakhirate", role: "gerant", station_id: "st-ndia" },
  { id: "u-super", email: "superviseur@ogss.demo", password: "Super2026!", nom_complet: "Superviseur réseau", role: "superviseur", station_id: null },
  { id: "u-dir", email: "directeur@ogss.demo", password: "Dir2026!", nom_complet: "Directeur OGSS", role: "directeur", station_id: null },
  { id: "u-compta", email: "comptable@ogss.demo", password: "Compta2026!", nom_complet: "Comptable OGSS", role: "comptable", station_id: null },
];

export function referentielFromSeed() {
  const pistolets = [];
  for (const st of SEED_STATIONS) {
    for (const [code, produit, ordre] of PISTOLET_DEFS) {
      pistolets.push({ id: `${st.id}-${code}`, station_id: st.id, station_code: st.code, code, produit, ordre, actif: true });
    }
  }
  const produits = SEED_PRODUITS.map(([code, designation, famille, unite, prix_vente, cout_achat, ordre]) => ({
    id: code, code, designation, famille, unite, prix_vente, cout_achat, seuil_alerte: 5, ordre, actif: true,
  }));
  return {
    stations: SEED_STATIONS,
    prix: SEED_PRIX,
    pistolets,
    produits,
    lubrifiants: produits.filter((p) => p.famille === "LUBRIFIANT" || p.famille === "ACCESSOIRE"),
    gaz: produits.filter((p) => p.famille === "GAZ"),
    categories: SEED_CATEGORIES.map(([code, libelle, nature, compte_syscohada]) => ({ code, libelle, nature, compte_syscohada })),
    clients: SEED_CLIENTS.map(([code, nom]) => ({ code, nom, plafond: 0, actif: true })),
    cuves: SEED_STATIONS.flatMap((st) =>
      SEED_CUVES.map(([produit, capacite_l]) => ({ id: `${st.id}-cuve-${produit.toLowerCase()}`, station_id: st.id, produit, capacite_l }))
    ),
  };
}
