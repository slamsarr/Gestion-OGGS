/**
 * Parse un journal Excel OGSS (blocs datés OU feuille JOURNAL exportée) vers des objets rapport.
 */

function valCell(row, col) {
  const v = row?.[col];
  if (v == null || v === "") return 0;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return parseFloat(String(v).replace(/[^\d.-]/g, "")) || 0;
}

export function excelSerialToISO(n) {
  const serial = Math.round(Number(n));
  if (!Number.isFinite(serial)) return null;
  // Systeme de dates Excel 1900 : le serial 25569 = 1970-01-01 UTC.
  return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
}

export function cellToISO(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) return excelSerialToISO(v);
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = s.match(/(\d{2})[/\-](\d{2})[/\-](\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return null;
}

function rapportBase(date, station) {
  return {
    id: `import-${station}-${date}`,
    station,
    date,
    gerant: "Import historique",
    statut: "VALIDE",
    pistolets: {},
    lubrifiants: {},
    gaz: {},
    depenses: [],
    versements: [0, 0, 0, 0, 0],
    coupures: {},
    lavage: 0,
    tickets: 0,
    depots: 0,
    remboursement: 0,
    commentaire: "Importé depuis le journal Excel historique",
    ca_total: 0,
    a_verser: 0,
    total_versements: 0,
    ecart_caisse: 0,
  };
}

function estCodePistolet(label) {
  return /^(p\d+|go\d+|su(?:p(?:er)?)?\d+|gasoil\s*\d+|super\s*\d+)$/i.test(label);
}

export function parseBlock(date, rows, station) {
  const rapport = rapportBase(date, station);

  for (const row of rows) {
    appliquerLigne(rapport, row);
  }

  finaliser(rapport);
  if (!estRapportNonVide(rapport)) return null;
  return rapport;
}

function appliquerLigne(rapport, row) {
  if (!row || !row.length) return;
  const label = String(row[0] || "").trim().toLowerCase();
  const val = (col) => valCell(row, col);

  if (estCodePistolet(label)) {
    const code = label.toUpperCase().replace(/\s/g, "");
    rapport.pistolets[code] = { depart: val(1), fin: val(2) };
    return;
  }

  if (/à\s*verser|^a\s+verser|a\s*verser/.test(label) && !label.includes("versement")) {
    rapport.a_verser = val(1) || val(2);
    return;
  }

  if (label.includes("versement") || /^verse(?:ment)?\s*\d/.test(label)) {
    const vIdx = label.match(/\d/);
    const idx = vIdx ? parseInt(vIdx[0], 10) - 1 : 0;
    if (idx >= 0 && idx < 5) rapport.versements[idx] = val(1);
    return;
  }

  if (label.includes("lavage")) {
    rapport.lavage = val(1) || val(2);
    return;
  }

  if (label.includes("ticket") || label.includes("bon")) {
    rapport.tickets = val(1) || val(2);
    return;
  }

  if (label.includes("dépense") || label.includes("depense")) {
    const montant = val(1) || val(2) || val(3);
    if (montant > 0) rapport.depenses.push({ categorie: "Divers", libelle: label, montant });
    return;
  }

  if (label.includes("total") && (label.includes("ca") || label.includes("c.a") || label.includes("chiffre"))) {
    rapport.ca_total = val(1) || val(2);
    return;
  }

  if (label.includes("écart") || label.includes("ecart")) {
    rapport.ecart_caisse = val(1) || val(2);
    return;
  }

}

function finaliser(rapport) {
  rapport.total_versements = rapport.versements.reduce((s, v) => s + v, 0);
}

function estRapportNonVide(rapport) {
  const hasPist = Object.keys(rapport.pistolets).length > 0;
  const hasVers = rapport.total_versements > 0;
  return hasPist || hasVers || rapport.ca_total > 0;
}

function extraireDateDansGrille(data, maxRows = 8) {
  for (const row of (data || []).slice(0, maxRows)) {
    for (const cell of row || []) {
      const iso = cellToISO(cell);
      if (iso) return iso;
    }
  }
  return null;
}

function estFeuilleJournalOgss(name, data) {
  if (String(name || "").toUpperCase().includes("JOURNAL")) return true;
  const head = (data || []).slice(0, 5).flat().map((c) => String(c || "").toLowerCase());
  return head.some((c) => c.includes("index départ") || c.includes("index depart"));
}

/** Feuille JOURNAL exportée par l’app (une date, pistolets en col. A). */
export function parseJournalOgss(data, station) {
  const date = extraireDateDansGrille(data);
  if (!date) return null;
  const rapport = rapportBase(date, station);

  for (const row of data || []) {
    appliquerLigne(rapport, row);
    const cells = (row || []).map((c) => String(c || "").trim().toLowerCase());
    for (let i = 0; i < cells.length; i++) {
      const lab = cells[i];
      const next = valCell(row, i + 1) || valCell(row, i + 2);
      if (lab === "lavage" || lab.includes("lavage")) rapport.lavage = rapport.lavage || next;
      if (lab.includes("ticket")) rapport.tickets = rapport.tickets || next;
      if (lab.includes("c.a.total") || lab === "ca total" || lab.includes("ca.total")) {
        rapport.ca_total = rapport.ca_total || valCell(row, i + 1);
      }
      if (lab.includes("a verser") || lab === "à verser") {
        rapport.a_verser = rapport.a_verser || valCell(row, i + 1);
      }
      if (lab.includes("depenses") || lab.includes("dépenses")) {
        const m = valCell(row, i + 1);
        if (m > 0 && rapport.depenses.length === 0) {
          rapport.depenses.push({ categorie: "Divers", libelle: "Dépenses journal", montant: m });
        }
      }
    }
  }

  finaliser(rapport);
  if (!estRapportNonVide(rapport)) return null;
  return rapport;
}

export function parseDepensesSheet(data) {
  const out = [];
  for (const row of (data || []).slice(1)) {
    const date = cellToISO(row?.[0]);
    const montant = valCell(row, 3) || valCell(row, 2);
    if (!date || montant <= 0) continue;
    out.push({
      date,
      categorie: String(row[1] || "Divers").trim() || "Divers",
      libelle: String(row[2] || row[1] || "Dépense").trim(),
      montant,
    });
  }
  return out;
}

function extraireBlocsDates(data, station) {
  const rapports = [];
  let currentDate = null;
  let blockRows = [];

  const flush = () => {
    if (currentDate && blockRows.length > 0) {
      const rapport = parseBlock(currentDate, blockRows, station);
      if (rapport) rapports.push(rapport);
    }
  };

  for (const row of data || []) {
    const firstCell = row?.[0];
    const dateMatch = cellToISO(firstCell);
    const onlyDate = dateMatch && String(firstCell || "").trim().length < 16;
    if (dateMatch && (onlyDate || String(firstCell).match(/(\d{2})[/\-](\d{2})[/\-](\d{4})/))) {
      flush();
      currentDate = dateMatch;
      blockRows = [];
      continue;
    }
    if (currentDate) blockRows.push(row);
  }
  flush();
  return rapports;
}

export function extraireRapports(sheets, station) {
  const parDate = new Map();
  const depenses = [];

  for (const { name, data } of sheets || []) {
    if (String(name || "").toUpperCase().includes("DEPENSE")) {
      depenses.push(...parseDepensesSheet(data));
      continue;
    }

    let list = extraireBlocsDates(data, station);
    if (list.length === 0 && estFeuilleJournalOgss(name, data)) {
      const one = parseJournalOgss(data, station);
      if (one) list = [one];
    }
    for (const r of list) parDate.set(r.date, r);
    void name;
  }

  for (const d of depenses) {
    const r = parDate.get(d.date);
    if (r) r.depenses.push({ categorie: d.categorie, libelle: d.libelle, montant: d.montant });
  }

  return [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
