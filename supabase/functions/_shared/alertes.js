/** Logique partagée des alertes « rapport manquant / brouillon ». */

export function dateHierISO(now = new Date()) {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function evaluerRapportsManquants(stations, rapports) {
  const par = new Map((rapports || []).map((r) => [r.station_id, r.statut]));
  const actives = (stations || []).filter((s) => s.actif !== false);
  const manquantes = actives.filter((s) => !par.has(s.id));
  const brouillons = actives.filter((s) => par.get(s.id) === "BROUILLON");
  return { manquantes, brouillons };
}

export function composerMessageAlerte(dateHier, manquantes, brouillons) {
  const alertes = [];
  if (manquantes.length > 0) {
    alertes.push(`Rapport MANQUANT pour ${dateHier} : ${manquantes.map((s) => s.nom || s.code).join(", ")}`);
  }
  if (brouillons.length > 0) {
    alertes.push(`Rapport en BROUILLON (non soumis) : ${brouillons.map((s) => s.nom || s.code).join(", ")}`);
  }
  return alertes.join("\n");
}
