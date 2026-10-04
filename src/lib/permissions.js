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
// Rôles opérationnels liés à une station (uniquement les clés de ROLE_LABELS).
export const OPERATIONNELS = ["gerant", "pompiste", "lavage", "boutique", "stock", "maintenance", "comptable", "commercial", "client_pro"];
export const ROLES_COCKPIT_RESEAU = ["admin", "superviseur", "directeur", "comptable"];
export const ROLES_CORRECTION_DESCENTE = ["gerant", "admin", "superviseur", "directeur"];

// ── Grille par entité : { entite: { action: [rôles] } } ─────────────────────
const ENTITES = {
  rapport: {
    soumettre: ["admin", "gerant"],
    valider: ["admin", "superviseur", "directeur"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  vente: {
    creer: ["admin", "gerant", "superviseur", "directeur", "pompiste", "boutique", "stock"],
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
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable", "stock"],
    ajuster: ["admin", "gerant", "superviseur", "directeur", "stock"],
    inventaire: ["admin", "gerant", "superviseur", "directeur", "stock"],
  },
  produit: {
    gerer: ["admin", "gerant", "superviseur", "directeur", "stock"],
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
    gerer: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  achat: {
    creer: ["admin", "gerant", "superviseur", "directeur"],
    valider: ["admin", "gerant", "superviseur", "directeur"],
    recevoir: ["admin", "gerant", "superviseur", "directeur", "stock"],
  },
  depense: {
    declarer: ["admin", "gerant", "superviseur", "directeur", "comptable"],
    valider: ["admin", "superviseur", "directeur"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "comptable"],
  },
  maintenance: {
    creer: ["admin", "gerant", "superviseur", "directeur", "maintenance"],
    planifier: ["admin", "superviseur", "directeur", "maintenance"],
    resoudre: ["admin", "superviseur", "directeur", "maintenance"],
  },
  incident: {
    creer: ["admin", "gerant", "superviseur", "directeur", "maintenance", "pompiste"],
    resoudre: ["admin", "superviseur", "directeur", "maintenance"],
  },
  fidelite: {
    consulter: ["admin", "gerant", "superviseur", "directeur", "commercial", "pompiste", "boutique", "lavage"],
    crediter: ["admin", "gerant", "superviseur", "directeur", "commercial", "pompiste", "boutique", "lavage"],
    debiter: ["admin", "gerant", "superviseur", "directeur", "commercial"],
    gerer: ["admin", "gerant", "superviseur", "directeur"],
  },
  depotage: {
    creer: ["admin", "gerant", "superviseur", "directeur", "stock"],
    consulter: ["admin", "gerant", "superviseur", "directeur", "stock", "comptable"],
    valider: ["admin", "gerant", "superviseur", "directeur"],
  },
  lavage: {
    creer: ["admin", "gerant", "superviseur", "directeur", "lavage"],
    annuler: ["admin", "gerant", "superviseur", "directeur"],
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

export function peutAgirProfil(profil, entite, action, scope = null) {
  return peutAgir(profil?.role, entite, action, scope, profil?.station_id || null);
}

// ── Suppression des rapports (§6.8) ─────────────────────────────────────────
export function peutSupprimerRapport(role, statut, station, roleScope) {
  if (statut !== "BROUILLON" && statut !== "REJETE") return false;
  if (DIRECTION.includes(role)) return true;
  return role === "gerant" && (!roleScope || station === roleScope);
}

export function peutSoumettreRapport(role) {
  return peutAgir(role, "rapport", "soumettre");
}

export function peutValiderRapport(role) {
  return peutAgir(role, "rapport", "valider");
}

export function peutCorrigerDescente(role, statut) {
  if (statut !== "TERMINEE") return true;
  return ROLES_CORRECTION_DESCENTE.includes(role);
}

// ── Accès aux routes UI selon le rôle ───────────────────────────────────────
const ROUTES = {
  "/": ["admin", "gerant", "superviseur", "directeur", "comptable", "pompiste", "stock", "maintenance", "commercial", "lavage", "boutique", "client_pro"],
  "/historique": ["admin", "gerant", "superviseur", "directeur", "comptable"],
  "/rapport": ["admin", "gerant", "superviseur", "directeur"],
  "/gerant": ["admin", "gerant", "superviseur", "directeur"],
  "/bilan-site": ["admin", "gerant", "superviseur", "directeur", "comptable"],
  "/stocks": ["admin", "gerant", "superviseur", "directeur", "comptable", "stock"],
  "/fournisseurs": ["admin", "gerant", "superviseur", "directeur", "comptable"],
  "/depenses": ["admin", "gerant", "superviseur", "directeur", "comptable"],
  "/pistolets": ["admin", "gerant", "superviseur", "directeur"],
  "/pompistes": ["admin", "gerant", "superviseur", "directeur"],
  "/cuves": ["admin", "gerant", "superviseur", "directeur", "stock"],
  "/descente": ["admin", "gerant", "superviseur", "directeur", "pompiste"],
  "/lavage": ["admin", "gerant", "superviseur", "directeur", "lavage"],
  "/boutique": ["admin", "gerant", "superviseur", "directeur", "boutique", "stock"],
  "/maintenance": ["admin", "gerant", "superviseur", "directeur", "maintenance", "pompiste"],
  "/incidents": ["admin", "gerant", "superviseur", "directeur", "maintenance", "pompiste"],
  "/clients-pro": ["admin", "gerant", "superviseur", "directeur", "commercial", "comptable", "client_pro"],
  "/finance": ["admin", "superviseur", "directeur", "comptable"],
  "/parametres": ["admin", "directeur", "superviseur"],
  "/fidelite": ["admin", "gerant", "superviseur", "directeur", "commercial", "pompiste", "boutique", "lavage"],
};

export function rolesRoute(role, route) {
  return (ROUTES[route] || []).includes(role);
}

/** Visibilité menu : le cockpit réseau n'est pas proposé aux métiers terrain (ils passent par HomeRouter). */
export function peutVoirNav(role, route) {
  if (route === "/") return ROLES_COCKPIT_RESEAU.includes(role);
  if (route === "/incidents") return false;
  return rolesRoute(role, route);
}
