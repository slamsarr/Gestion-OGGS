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

export const SEED_CLIENTS_PRO = [
  ["CP-ITS", "ITS (transport)"],
  ["CP-JOUKADAR", "Joukadar / DMJ"],
  ["CP-RETBA", "Retba / Team Dir CTT / Provale"],
  ["CP-ICONS", "Icons SA / FADSR"],
  ["CP-TAXI-SN", "Taxi / Artisans (parking)"],
];

export const SEED_VEHICULES = {
  "CP-ITS": [
    ["SD-4501-AA", "MERCEDES", "ACTROS", "CAMION", "GASOIL"],
    ["SD-4502-AB", "MERCEDES", "ACTROS", "CAMION", "GASOIL"],
  ],
  "CP-JOUKADAR": [["SD-1203-AC", "IVECO", "682", "CAMION", "GASOIL"]],
  "CP-RETBA": [["SD-8804-AD", "SCANIA", "P360", "CAMION", "GASOIL"]],
  "CP-ICONS": [["SD-2301-AE", "TOYOTA", "LAND CRUISER", "PICKUP", "SUPER"]],
  "CP-TAXI-SN": [
    ["SD-7712-AF", "TOYOTA", "COROLLA", "TAXI", "SUPER"],
    ["SD-7719-AG", "HYUNDAI", "I10", "TAXI", "SUPER"],
  ],
};

export const SEED_FOURNISSEURS = [
  { code: "FR-TOTAL", nom: "TOTAL Energies Marketing", tel: "33 823 66 66", email: "contact@total.sn" },
  { code: "FR-VIVO", nom: "VIVO Energy Sénégal", tel: "33 849 00 00", email: "vivo@vivoenergy.sn" },
  { code: "FR-PETROSEN", nom: "Société Africaine de Raffinage (SAR)", tel: "33 859 55 55", email: "contact@sar.sn" },
  { code: "FR-RADIOB", nom: "Radiob (4X4)", tel: "33 821 00 79", email: "dakar@radiob.com" },
];

export const SEED_CATEGORIES_DEPENSES = [
  ["ENTRETIEN", "Entretien", "VARIABLE", "6242"],
  ["TRANSPORT", "Transport", "VARIABLE", "6241"],
  ["FOURNITURES", "Fournitures", "VARIABLE", "6047"],
  ["REPAS", "Repas", "VARIABLE", "6281"],
  ["RECHARGE_GAZ", "Recharge gaz", "VARIABLE", "6011"],
  ["SALAIRE_AVANCE", "Avance salaire", "FIXE", "4211"],
  ["LOCATION", "Location", "FIXE", "6135"],
  ["UTILITE_ELECTRICITE", "Électricité", "FIXE", "6063"],
  ["AUTRE", "Autre", "VARIABLE", "6588"],
];

export const SEED_EQUIPEMENTS = [
  ["DISTRIBUTEUR", "Distributeur carburant"],
  ["CUVE", "Citerne de stockage"],
  ["GROUPE_ELECTROGENE", "Groupe électrogène"],
  ["COMPRESSEUR", "Compresseur à air"],
  ["CLIMATISATION", "Climatisation bureau"],
  ["POMPE", "Pompe / kit manomètre"],
];

export const SEED_MAINTENANCE_TYPES = [
  ["PREVENTIVE", "Maintenance préventive"],
  ["CURATIVE", "Maintenance curative"],
  ["CONSTAT", "Constat technique"],
];

export const SEED_INCIDENT_MOTIFS = [
  ["FUITES", "Fuite détectée", "CRITIQUE"],
  ["POMPE_HS", "Pompe hors service", "HAUTE"],
  ["MARCHE_DEGRADE", "Marche dégradée", "MOYENNE"],
  ["ACCIDENT", "Accident", "CRITIQUE"],
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

export const SEED_TARIFS_LAVAGE = [
  { code: "MOTO", libelle: "Moto / Deux-roues", tarif: 1000 },
  { code: "BERLINE", libelle: "Voiture / Berline / Citadine", tarif: 2000 },
  { code: "4X4_SUV", libelle: "4x4 / SUV / Pick-up", tarif: 3000 },
  { code: "CAMION", libelle: "Camion / Minibus / Utilitaire", tarif: 5000 },
];

export const SEED_PRODUITS_BOUTIQUE = [
  { code: "EAU-KIRÈNE-1.5L", designation: "Eau Kirène 1.5L", categorie: "Boissons", prix_vente: 500, prix_achat: 350, stock: 48, seuil_alerte: 12 },
  { code: "COCA-33CL", designation: "Coca-Cola Canette 33cl", categorie: "Boissons", prix_vente: 600, prix_achat: 400, stock: 60, seuil_alerte: 15 },
  { code: "RED-BULL-250ML", designation: "Red Bull Canette 250ml", categorie: "Boissons", prix_vente: 1500, prix_achat: 1100, stock: 24, seuil_alerte: 6 },
  { code: "CAFE-TOUBA", designation: "Café Touba Sachet", categorie: "Alimentation", prix_vente: 250, prix_achat: 150, stock: 100, seuil_alerte: 20 },
  { code: "DESODORISANT-AUTO", designation: "Désodorisant Voiture Arbre Magique", categorie: "Accessoires", prix_vente: 1500, prix_achat: 800, stock: 30, seuil_alerte: 5 },
  { code: "CHIFFON-MICROFIBRE", designation: "Chiffon Microfibre Finition", categorie: "Accessoires", prix_vente: 1000, prix_achat: 500, stock: 25, seuil_alerte: 5 },
  { code: "HUILE-FREIN-DOT4", designation: "Liquide de frein DOT 4 (500ml)", categorie: "Entretien", prix_vente: 2500, prix_achat: 1600, stock: 18, seuil_alerte: 4 },
  { code: "LIQUIDE-REFROIDISSEMENT", designation: "Liquide de refroidissement 4L", categorie: "Entretien", prix_vente: 4500, prix_achat: 3000, stock: 12, seuil_alerte: 3 },
];

export const DEMO_USERS = [
  { id: "u-admin", email: "admin@ogss.demo", password: "Admin2026!", nom_complet: "Administrateur OGSS", role: "admin", station_id: null },
  { id: "u-gerant-hann", email: "gerant.hann@ogss.demo", password: "Hann2026!", nom_complet: "Gérant Hann", role: "gerant", station_id: "st-hann" },
  { id: "u-gerant-ndia", email: "gerant.ndia@ogss.demo", password: "Ndia2026!", nom_complet: "Gérant Ndiakhirate", role: "gerant", station_id: "st-ndia" },
  { id: "u-dir", email: "directeur@ogss.demo", password: "Dir2026!", nom_complet: "Directeur Général OGSS", role: "directeur", station_id: null },
  { id: "u-compta", email: "comptable@ogss.demo", password: "Compta2026!", nom_complet: "Comptable OGSS", role: "comptable", station_id: null },
  { id: "u-pompiste-hann", email: "pompiste@ogss.demo", password: "Pompe2026!", nom_complet: "Modou Fall (Pompiste)", role: "pompiste", station_id: "st-hann" },
  { id: "u-lavage-hann", email: "lavage@ogss.demo", password: "Lavage2026!", nom_complet: "Aliou Diop (Lavage)", role: "lavage", station_id: "st-hann" },
  { id: "u-boutique-hann", email: "boutique@ogss.demo", password: "Boutique2026!", nom_complet: "Fatou Ndiaye (Boutique)", role: "boutique", station_id: "st-hann" },
  { id: "u-stock-hann", email: "stock@ogss.demo", password: "Stock2026!", nom_complet: "Ibrahima Sarr (Resp. Stock)", role: "stock", station_id: "st-hann" },
  { id: "u-maint-hann", email: "maintenance@ogss.demo", password: "Maint2026!", nom_complet: "Cheikh Bâ (Technicien Maint.)", role: "maintenance", station_id: "st-hann" },
  { id: "u-super", email: "superviseur@ogss.demo", password: "Super2026!", nom_complet: "Superviseur Réseau", role: "superviseur", station_id: null },
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
    // ── §33 / §38 : nouveaux référentiels ──────────────────────────────────
    clients_pro: SEED_STATIONS.flatMap((st) =>
      SEED_CLIENTS_PRO.map(([code, societe, contact, tel, email_]) => ({
        code, nom_entreprise: societe, contact, telephone: tel, email: email_, station_id: st.id, plafond_credit: 0, actif: true,
      }))
    ),
    vehicules: SEED_CLIENTS_PRO.flatMap(([code, societe]) =>
      SEED_VEHICULES[code]?.map(([immat, marque, modele, type_, carburant]) => ({
        immatriculation: immat, client_code: code, marque, modele, type: type_, carburant, actif: true,
      })) || []
    ),
    fournisseurs: [...new Map(SEED_FOURNISSEURS.map((f) => [f.code, f])).values()].map(({ code, nom, tel, email_ }) => ({
      id: `fr-${code}`, code, nom_fournisseur: nom, telephone: tel, email: email_, actif: true,
    })),
    categories_depenses: SEED_CATEGORIES_DEPENSES.map(([code, libelle, nature, compte]) => ({ code, libelle, nature, compte_syscohada: compte })),
    equipements: SEED_STATIONS.flatMap((st) =>
      SEED_EQUIPEMENTS.map(([type_, libelle]) => ({ id: `${st.id}-${type_}`, station_id: st.id, type: type_, libelle, actif: true }))
    ),
    types_maintenance: SEED_MAINTENANCE_TYPES.map(([code, libelle]) => ({ code, libelle })),
    motifs_incidents: SEED_INCIDENT_MOTIFS.map(([code, libelle, priorite]) => ({ code, libelle, priorite })),
    tarifs_lavage: SEED_TARIFS_LAVAGE,
    produits_boutique: SEED_PRODUITS_BOUTIQUE,
  };
}
