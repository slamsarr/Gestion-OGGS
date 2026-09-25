// RBAC complet conforme §6 — rôles du cahier des charges.
// Chaque entité expose : une liste de rôles autorisés + un périmètre de station.
// `peutAgir(role, entite, action, scope)` est le point de contrôle central.

export const ROLE_LABELS = {
  admin: "Administrateur",
  gerant: "Gérant",
  directeur: "Directeur",
  comptable: "Comptable",
  pompiste: "Pompiste",
  lavage: "Agent de Lavage",
  boutique: "Vendeur Boutique",
  stock: "Responsable Stock",
  maintenance: "Technicien Maintenance",
  superviseur: "Superviseur",
  commercial: "Commercial",
  client_pro: "Client Professionnel",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS);

// Rôles « direction » : voient toutes les stations.
export const DIRECTION = ["admin", "directeur", "superviseur"];
// Rôles opérationnels liés à une station.
export const OPERATIONNELS = ["gerant", "pompiste", "lavage", "boutique", "stock", "maintenance", "comptable", "commercial"];

// ── Grille par entité : { entite: { action: [rôles] } } ─────────────────────
const ENTITES = {
  rapport: {
    soumettre: ["admin", "gerant"],
    valider: ["admin", "superviseur", "directeur"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  vente: {
    creer: ["admin", "gerant", "superviseur", "directeur", "pompiste"],
    annuler: ["admin", "gerant", "superviseur", "directeur", "comptable"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable", "commercial"],
  },
  paiement: {
    creer: ["admin", "gerant", "superviseur", "directeur", "comptable", "pompiste"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  caisse: {
    ouvrir: ["admin", "gerant", "superviseur", "directeur"],
    payer: ["admin", "gerant", "superviseur", "directeur", "comptable"],
    clore: ["admin", "gerant", "superviseur", "directeur", "comptable"],
    controler: ["admin", "superviseur", "directeur", "comptable"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  stock: {
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable", "magasinier", "resp_stock"],
    ajuster: ["admin", "gerant", "superviseur", "directeur", "resp_stock"],
    inventaire: ["admin", "gerant", "superviseur", "directeur", "resp_stock", "magasinier"],
  },
  produit: {
    gerer: ["admin", "gerant", "superviseur", "directeur", "magasinier"],
  },
  client_pro: {
    creer: ["admin", "gerant", "superviseur", "directeur", "commercial"],
    modifier: ["admin", "gerant", "superviseur", "directeur", "commercial"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "commercial", "comptable", "client_pro"],
  },
  credit: {
    accorder: ["admin", "gerant", "superviseur", "directeur"],
    encaisser: ["admin", "gerant", "superviseur", "directeur", "comptable"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable", "commercial", "client_pro"],
  },
  fournisseur: {
    gerer: ["admin", "gerant", "superviseur", "directeur", "resp_achats"],
  },
  achat: {
    creer: ["admin", "gerant", "superviseur", "directeur", "resp_achats"],
    valider: ["admin", "gerant", "superviseur", "directeur"],
    recevoir: ["admin", "gerant", "superviseur", "directeur", "magasinier", "resp_stock"],
  },
  depense: {
    declarer: ["admin", "gerant", "superviseur", "directeur", "comptable"],
    valider: ["admin", "superviseur", "directeur"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  maintenance: {
    creer: ["admin", "gerant", "superviseur", "directeur", "resp_maint"],
    planifier: ["admin", "superviseur", "directeur", "resp_maint"],
    resoudre: ["admin", "superviseur", "directeur", "resp_maint"],
  },
  incident: {
    creer: ["admin", "gerant", "superviseur", "directeur", "resp_maint", "pompiste"],
    resoudre: ["admin", "superviseur", "directeur", "resp_maint"],
  },
  fidelite: {
    consulter: ["admin", "gerant", "superviseur", "directeur", "commercial", "pompiste", "boutique", "lavage"],
    crediter: ["admin", "gerant", "superviseur", "directeur", "commercial", "pompiste", "boutique", "lavage"],
    debiter: ["admin", "gerant", "superviseur", "directeur", "commercial"],
    gerer: ["admin", "gerant", "superviseur", "directeur"],
  },
  depotage: {
    creer: ["admin", "gerant", "superviseur", "directeur", "resp_stock", "stock"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "resp_stock", "stock", "comptable"],
    valider: ["admin", "gerant", "superviseur", "directeur"],
  },
};

export function peutAgir(role, entite, action, scope = null, roleScope = null) {
  const grille = ENTITES[entite];
  if (!grille || !grille[action]) return false;
  if (!grille[action].includes(role)) return false;
  if (DIRECTION.includes(role)) return true;
  if (OPERATIONNELS.includes(role) && roleScope && scope && roleScope !== scope) return false;
  return true;
}

// ── Suppression des rapports (§6.8) ─────────────────────────────────────────
export function peutSupprimerRapport(role, statut, station, roleScope) {
  if (statut !== "BROUILLON" && statut !== "REJETE") return false;
  if (DIRECTION.includes(role)) return true;
  return role === "gerant" && (!roleScope || station === roleScope);
}

export function peutSoumettreRapport(role) {
  return role === "admin" || role === "gerant";
}

export function peutValiderRapport(role) {
  return role === "admin" || role === "superviseur" || role === "directeur";
}

// ── Accès aux routes UI selon le rôle ───────────────────────────────────────
const ROUTES = {
  "/": ["admin", "gerant", "superviseur", "directeur", "comptable", "pompiste", "magasinier", "resp_stock", "stock", "resp_achats", "resp_maint", "maintenance", "commercial", "lavage", "boutique"],
  "/historique": ["admin", "gerant", "superviseur", "directeur", "comptable"],
  "/rapport": ["admin", "gerant", "superviseur", "directeur"],
  "/stocks": ["admin", "gerant", "superviseur", "directeur", "comptable", "magasinier", "resp_stock", "stock"],
  "/achats": ["admin", "gerant", "superviseur", "directeur", "resp_achats"],
  "/fournisseurs": ["admin", "gerant", "superviseur", "directeur", "resp_achats", "comptable"],
  "/depenses": ["admin", "gerant", "superviseur", "directeur", "comptable"],
  "/pistolets": ["admin", "gerant", "superviseur", "directeur"],
  "/pompistes": ["admin", "gerant", "superviseur", "directeur"],
  "/cuves": ["admin", "gerant", "superviseur", "directeur", "stock", "resp_stock"],
  "/descente": ["admin", "gerant", "superviseur", "directeur", "pompiste"],
  "/lavage": ["admin", "gerant", "superviseur", "directeur", "lavage"],
  "/boutique": ["admin", "gerant", "superviseur", "directeur", "boutique", "stock", "resp_stock"],
  "/maintenance": ["admin", "gerant", "superviseur", "directeur", "resp_maint", "maintenance"],
  "/incidents": ["admin", "gerant", "superviseur", "directeur", "resp_maint", "maintenance", "pompiste"],
  "/clients-pro": ["admin", "gerant", "superviseur", "directeur", "commercial", "comptable", "client_pro"],
  "/finance": ["admin", "superviseur", "directeur", "comptable"],
  "/parametres": ["admin", "directeur"],
  "/espace-client": ["client_pro"],
  "/fidelite": ["admin", "gerant", "superviseur", "directeur", "commercial", "pompiste", "boutique", "lavage"],
};

export function rolesRoute(role, route) {
  return (ROUTES[route] || []).includes(role);
}
