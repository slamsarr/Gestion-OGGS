import * as XLSX from "xlsx";
import { COUPURES, F, fmtDate, n } from "./calcul";

export function exporterExcel(r, c, stations) {
  const S = stations.find((s) => s.code === r.station) || { nom: r.station };
  const g = Array.from({ length: 42 }, () => Array(17).fill(null));
  const put = (cell, v) => {
    const col = cell.charCodeAt(0) - 65;
    const row = +cell.slice(1) - 1;
    g[row][col] = v;
  };
  put("A1", `STATION SERVICES STAR ENERGY ${S.nom.toUpperCase()}`);
  put("E1", fmtDate(r.date));
  put("H1", fmtDate(r.date));
  put("I1", " LUBRIFIANTS");
  put("M1", "RECEPTION");
  put("N1", "STOCK DEBUT");
  put("O1", "STOCK FIN");
  put("P1", "VALEURS STOCK");
  put("A2", fmtDate(r.date));
  ["B2:index départ", "C2:index fin", "D2:volumes", "E2:valeurs", "F2:CUMUL VOLUMES", "G2:MONTANT"].forEach((s) => put(...s.split(":")));
  put("H2", c.volGO + c.volSU);
  c.pist.forEach((p, i) => {
    const row = 3 + i;
    put(`A${row}`, p.code);
    put(`B${row}`, p.depart);
    put(`C${row}`, p.fin);
    put(`D${row}`, p.volume);
    put(`E${row}`, p.valeur);
  });
  put("F3", c.volGO);
  put("G3", c.volGO * c.pGO);
  put("H4", "GASOIL");
  put("F7", c.volSU);
  put("G7", c.volSU * c.pSU);
  put("H8", "SUPER");
  put("G11", c.caCarburant);
  c.lub.forEach((l, i) => {
    const row = 2 + i;
    put(`I${row}`, l.nom);
    put(`J${row}`, l.vendu);
    put(`K${row}`, l.valeurVente);
    put(`M${row}`, l.reception || null);
    put(`N${row}`, l.debut);
    put(`O${row}`, l.stockFin);
    put(`P${row}`, l.valeurStock);
  });
  put("Q22", c.valeurStockLub);
  put("A22", "GAZ");
  put("B22", "STOCK P");
  put("C22", "LIVRAISON");
  put("D22", "STOCK RESTANT");
  c.gaz.forEach((x, i) => {
    const row = 23 + i;
    put(`A${row}`, x.nom);
    put(`B${row}`, x.present);
    put(`C${row}`, x.livraison);
    put(`D${row}`, x.restant);
    put(`I${row}`, x.nom);
    put(`J${row}`, x.vendu);
    put(`K${row}`, x.valeurVente);
  });
  put("C27", "C.A.TOTAL");
  put("D27", c.caTotal);
  put("E27", "TICKETS");
  put("F27", c.tickets);
  put("G27", "DEPENSES");
  put("H27", c.depenses);
  put("I27", "lavage");
  put("K27", c.lavage);
  put("J28", "TOTAL");
  put("K28", c.caLub + c.caGaz + c.lavage);
  put("L28", c.ecart);
  put("I29", "A VERSER");
  put("J29", c.aVerser);
  put("I30", "BIS");
  put("J30", c.bis);
  put("K30", c.bis + c.depenses + c.tickets);
  r.versements.forEach((v, i) => {
    put(`A${29 + i}`, `VERSEMENT ${i + 1}`);
    put(`B${29 + i}`, n(v));
  });
  put("A34", "BIS");
  put("B34", c.bis);
  put("A35", "NET BIS");
  put("B35", c.netBis);
  put("C32", "MONTANTS");
  put("D32", "BILLETS");
  put("E32", "TOTAL");
  COUPURES.forEach((cp, i) => {
    put(`C${33 + i}`, cp * n(r.coupures?.[cp]));
    put(`D${33 + i}`, cp);
    put(`E${33 + i}`, n(r.coupures?.[cp]));
  });
  put("C42", c.totalCoupures);
  put("A38", "DETAILLE VERSEMENT BANQUE");
  put("A39", "V.TOTALES");
  put("B39", c.bis);
  put("A40", "CARBURANT");
  put("B40", c.ventilation.carburant);
  put("A41", "LUBRIFIANT");
  put("B41", c.caLub);
  put("A42", "LAVAGE");
  put("B42", c.lavage);
  put("M40", "VENTE GAZ");
  put("N40", "MARGE");
  put("M41", c.caGaz);
  put("N41", c.margeGaz);
  const ws = XLSX.utils.aoa_to_sheet(g);
  const wsDep = XLSX.utils.aoa_to_sheet([
    ["DATE", "CATEGORIE", "LIBELLE", "MONTANT"],
    ...r.depenses.map((d) => [fmtDate(r.date), d.categorie, d.libelle, n(d.montant)]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "JOURNAL");
  XLSX.utils.book_append_sheet(wb, wsDep, "DEPENSES");
  XLSX.writeFile(wb, `JOURNAL_${r.station}_${fmtDate(r.date).replaceAll("/", "_")}.xlsx`);
}

export function exporterCsv(filename, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "EXPORT");
  XLSX.writeFile(wb, filename);
}

export { F };
