export const ROLE_LABELS = { admin: "Administrateur", gerant: "Gérant", superviseur: "Superviseur", directeur: "Directeur", comptable: "Comptable" };

export function peutSupprimerRapport(role, statut, station, stationScope) {
  if (statut !== "BROUILLON" && statut !== "REJETE") return false;
  if (role === "admin" || role === "directeur" || role === "superviseur") return true;
  const own = !stationScope || station === stationScope;
  return role === "gerant" && own;
}

export function peutSoumettreRapport(role) {
  return role === "gerant" || role === "admin";
}

export function peutValiderRapport(role) {
  return role === "admin" || role === "superviseur" || role === "directeur";
}

export function rolesRoute(role, route) {
  const ROUTES = {
    "/": ["admin", "gerant", "superviseur", "directeur", "comptable"],
    "/historique": ["admin", "gerant", "superviseur", "directeur", "comptable"],
    "/rapport": ["admin", "gerant", "superviseur", "directeur"],
    "/stocks": ["admin", "gerant", "superviseur", "directeur", "comptable"],
    "/finance": ["admin", "superviseur", "directeur", "comptable"],
    "/pistolets": ["admin", "superviseur", "directeur", "gerant"],
    "/pompistes": ["admin", "superviseur", "directeur", "gerant"],
    "/parametres": ["admin", "directeur"],
  };
  return (ROUTES[route] || []).includes(role);
}