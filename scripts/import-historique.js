#!/usr/bin/env node
/**
 * Import de l'historique des rapports depuis un journal Excel OGSS.
 *
 * Usage :
 *   node scripts/import-historique.js chemin/vers/journal.xlsx [--station HANN] [--dry-run] [--gerant UUID]
 *
 * Variables d'environnement :
 *   SUPABASE_URL ou VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (recommandé) ou VITE_SUPABASE_ANON_KEY
 *   IMPORT_GERANT_ID  — profil utilisé si --gerant n'est pas fourni
 */
import XLSX from "xlsx";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { extraireRapports } from "./lib/parse-journal-excel.js";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes("--dry-run");
const STATION = opt("--station") || "HANN";
const GERANT_OPT = opt("--gerant") || process.env.IMPORT_GERANT_ID;
const FILE = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--station" && args[i - 1] !== "--gerant");

if (FILE && !fs.existsSync(FILE)) {
  console.error(`Fichier introuvable : ${FILE}`);
  process.exit(1);
}

if (!FILE) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  Import historique OGSS — Journal Excel → Supabase   ║
╠══════════════════════════════════════════════════════╣
║  Usage :                                             ║
║    node scripts/import-historique.js fichier.xlsx    ║
║                                                      ║
║  Options :                                           ║
║    --station CODE  Station (défaut: HANN)            ║
║    --gerant UUID   profils.id (gérant)               ║
║    --dry-run       Simuler sans écrire               ║
╚══════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

function lireClasseur(file) {
  const wb = XLSX.readFile(file);
  return wb.SheetNames.map((name) => ({
    name,
    data: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }),
  }));
}

async function resoudreStation(supabase, code) {
  const { data, error } = await supabase.from("stations").select("id, code, nom").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Station inconnue : ${code}`);
  return data;
}

async function resoudreGerant(supabase, stationId) {
  if (GERANT_OPT) return GERANT_OPT;
  const { data } = await supabase
    .from("profils")
    .select("id")
    .eq("station_id", stationId)
    .eq("role", "gerant")
    .eq("actif", true)
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;
  const { data: admin } = await supabase.from("profils").select("id").in("role", ["directeur", "superviseur"]).limit(1).maybeSingle();
  if (admin?.id) return admin.id;
  throw new Error("Aucun profil gérant/directeur trouvé. Passez --gerant UUID.");
}

async function main() {
  console.log(`Lecture de ${FILE}...`);
  const sheets = lireClasseur(FILE);
  for (const s of sheets) console.log(`  Feuille : ${s.name}`);
  const rapports = extraireRapports(sheets, STATION);
  console.log(`\n${rapports.length} rapport(s) détectés pour ${STATION}`);

  if (rapports.length > 0) {
    console.log(`Période : ${rapports[0].date} → ${rapports[rapports.length - 1].date}`);
    console.log(`CA total déclaré : ${rapports.reduce((s, r) => s + r.ca_total, 0).toLocaleString("fr-FR")} F`);
  }

  const outFile = FILE.replace(/\.xlsx?$/i, "_import.json");

  if (DRY_RUN) {
    fs.writeFileSync(outFile, JSON.stringify(rapports, null, 2), "utf-8");
    console.log(`\nDry-run — JSON : ${outFile}`);
    return;
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.log("\nVariables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes — export JSON.");
    fs.writeFileSync(outFile, JSON.stringify(rapports, null, 2), "utf-8");
    console.log(`Résultat : ${outFile}`);
    return;
  }

  const supabase = createClient(url, key);
  const station = await resoudreStation(supabase, STATION);
  const gerantId = await resoudreGerant(supabase, station.id);

  let ok = 0;
  let fail = 0;
  for (const r of rapports) {
    const row = {
      station_id: station.id,
      date_rapport: r.date,
      gerant_id: gerantId,
      statut: r.statut,
      ca_lavage: r.lavage,
      tickets: r.tickets,
      depenses: r.depenses.reduce((s, d) => s + (d.montant || 0), 0),
      remboursement: r.remboursement,
      depots: r.depots,
      ca_total: r.ca_total || null,
      a_verser: r.a_verser || null,
      total_versements: r.total_versements,
      ecart_caisse: r.ecart_caisse || null,
      commentaire: r.commentaire,
      payload: r,
    };
    const { error } = await supabase.from("rapports_journaliers").upsert(row, { onConflict: "station_id,date_rapport" });
    if (error) {
      console.error(`  ${r.date}: ${error.message}`);
      fail++;
    } else ok++;
  }
  console.log(`\n${ok} rapport(s) upsertés, ${fail} erreur(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
