import fs from 'fs';
import path from 'path';

const baseDir = path.resolve('supabase');
const files = [
  'schema.sql',
  'admin_role_migration.sql',
  'vague1b_vague2_migration.sql',
  'multi_pompes_migration.sql',
  'fidelite_migration.sql',
  'prefs_migration.sql',
  'rapports_depotage_migration.sql',
  'remboursements_ecarts_migration.sql'
];

let masterSql = `-- =====================================================================
-- FUELOS / STAR ENERGY SÉNÉGAL — INSTALLATION COMPLÈTE BASE SUPABASE
-- Script unique pour nouveau projet Supabase
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query > Run
-- Date : 2026-11-05
-- =====================================================================

`;

for (const file of files) {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    masterSql += `\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`;
    masterSql += `-- FICHIER : ${file}\n`;
    masterSql += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n`;
    let content = fs.readFileSync(filePath, 'utf-8');
    // Remplacer les alter type role_utilisateur add value car enum déjà complet au début
    content = content.replace(/^alter type role_utilisateur add value.*$/gm, (m) => `-- (Déjà présent dans l'enum initial) ${m}`);
    masterSql += content;
    masterSql += `\n\n`;
  }
}

const outputPath = path.join(baseDir, '00_SETUP_COMPLET_NOUVEAU_PROJET.sql');
fs.writeFileSync(outputPath, masterSql, 'utf-8');
console.log(`Script master créé avec succès : ${outputPath} (${masterSql.length} caractères)`);
