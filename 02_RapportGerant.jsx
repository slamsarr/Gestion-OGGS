// =====================================================================
//  OGSS RÉSEAU — Module 1 : Rapport journalier gérant
//  React (mobile-first) — calculs identiques au journal Excel source
//  Persistance brouillon : window.storage (à remplacer par Dexie/IndexedDB
//  + Supabase dans le PWA de production — voir 03_ARCHITECTURE.md §4)
//  Export Excel : SheetJS, mise en page identique au bloc journalier source
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

// ---------- Référentiel (Module 6 — normalement chargé depuis Supabase) ----------
const STATIONS = [
  { code: "HANN", nom: "Star Energy Hann Mariste", gerant: "Gérant Hann" },
  { code: "NDIAKHIRATE", nom: "Star Energy Ndiakhirate", gerant: "Gérant Ndiakhirate" },
];
const PRIX_CARBURANT = [ // historique des prix officiels — le prix du jour dépend de la date
  { date: "2026-01-01", GASOIL: 680, SUPER: 920 },
  { date: "2026-08-15", GASOIL: 755, SUPER: 990 },
];
const PISTOLETS = [
  ...[1, 2, 3, 4].map((i) => ({ code: `gasoil${i}`, produit: "GASOIL" })),
  ...[1, 2, 3, 4].map((i) => ({ code: `super${i}`, produit: "SUPER" })),
];
const LUBRIFIANTS = [
  ["5W40 5L", 29000], ["5W30 5L", 33000], ["10W40 5L", 18000], ["VRAC", 2200],
  ["15W40 5L", 15000], ["20w50 5L", 13500], ["SAE50 5L", 13000], ["SAE50 1L", 2800],
  ["SOLEX", 800], ["WIN'S", 2500], ["ATF 70", 3200], ["4 TEMPS", 3000],
  ["CEPSA GLACIOL 5L", 5000], ["STAR GLACIOL 1L", 1000], ["CEPSA LAVE GLACE", 1500],
  ["80W90 (HUILE BOITE)", 2500], ["GRAISSE", 3500], ["CEPSA ATF 2000S 1L", 3500],
  ["15W40 1L", 3000], ["20W50 1L", 2700], ["5W30 1L", 6600],
].map(([nom, prix]) => ({ nom, prix, seuil: 5 }));
const GAZ = [
  { nom: "LOBBOU GAZ 9KG", prix: 4290, cout: 4175 },
  { nom: "GAZ 3 KGS", prix: 1305, cout: 1269 },
  { nom: "GAZ 6 KGS", prix: 2885, cout: 2800 },
  { nom: "GAZ 12 KGS", prix: 6250, cout: 6022 },
];
const COUPURES = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50];
const CATEGORIES_DEPENSE = ["Transport", "Entretien", "Fournitures", "Repas", "Recharge gaz", "Bon client (crédit)", "Avance salaire", "Autre"];
const SEUIL_ECART = 5000;        // alerte écart de caisse (FCFA)
const SAUT_INDEX_MAX = 20000;    // volume max plausible par pistolet et par jour (L)

// Index fin du 10/09/2026 (dernier bloc du fichier source) : servent d'index départ
const INDEX_VEILLE = { gasoil1: 989304, gasoil2: 742849, gasoil3: 957092, gasoil4: 2214211, super1: 1029228, super2: 1342323, super3: 1491719, super4: 1161191 };
const STOCK_VEILLE = { "5W30 5L": 1, "10W40 5L": 15, "WIN'S": 16, "4 TEMPS": 24, "STAR GLACIOL 1L": 17, "80W90 (HUILE BOITE)": 20, "GRAISSE": 18, "5W30 1L": 68 };

// ---------- Utilitaires ----------
const n = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? 0 : +v);
const F = (v) => Math.round(n(v)).toLocaleString("fr-FR");
const fmtDate = (iso) => iso.split("-").reverse().join("/");
const prixDuJour = (produit, dateISO) =>
  [...PRIX_CARBURANT].reverse().find((p) => p.date <= dateISO)?.[produit] ?? PRIX_CARBURANT[0][produit];

const rapportVide = (station, date) => ({
  station, date, statut: "BROUILLON", gerant: STATIONS.find((s) => s.code === station)?.gerant ?? "",
  pistolets: Object.fromEntries(PISTOLETS.map((p) => [p.code, { depart: INDEX_VEILLE[p.code] ?? 0, fin: "" }])),
  lubrifiants: Object.fromEntries(LUBRIFIANTS.map((l) => [l.nom, { debut: STOCK_VEILLE[l.nom] ?? 0, reception: "", vendu: "" }])),
  gaz: Object.fromEntries(GAZ.map((g) => [g.nom, { present: 0, livraison: "", vendu: "" }])),
  lavage: "", tickets: "", remboursement: "", depots: "",
  depenses: [], versements: ["", "", "", "", ""],
  coupures: Object.fromEntries(COUPURES.map((c) => [c, ""])),
  commentaire: "", motifRejet: "",
});

// ---------- Moteur de calcul (== formules du journal) ----------
function calculer(r) {
  const pGO = prixDuJour("GASOIL", r.date), pSU = prixDuJour("SUPER", r.date);
  const pist = PISTOLETS.map((p) => {
    const { depart, fin } = r.pistolets[p.code];
    const prix = p.produit === "GASOIL" ? pGO : pSU;
    const volume = fin === "" ? 0 : n(fin) - n(depart);
    const anomalie = fin !== "" && (volume < 0 ? "Index fin < index départ" : volume > SAUT_INDEX_MAX ? "Saut d'index suspect" : "");
    return { ...p, depart: n(depart), fin: n(fin), prix, volume, valeur: volume * prix, anomalie };
  });
  const volGO = pist.filter((p) => p.produit === "GASOIL").reduce((s, p) => s + p.volume, 0);
  const volSU = pist.filter((p) => p.produit === "SUPER").reduce((s, p) => s + p.volume, 0);
  const caCarburant = volGO * pGO + volSU * pSU;

  const lub = LUBRIFIANTS.map((l) => {
    const x = r.lubrifiants[l.nom];
    const stockFin = n(x.debut) + n(x.reception) - n(x.vendu);
    return { ...l, debut: n(x.debut), reception: n(x.reception), vendu: n(x.vendu), stockFin, valeurVente: n(x.vendu) * l.prix, valeurStock: stockFin * l.prix, bas: stockFin < l.seuil && (n(x.debut) > 0 || n(x.vendu) > 0) };
  });
  const caLub = lub.reduce((s, l) => s + l.valeurVente, 0);
  const valeurStockLub = lub.reduce((s, l) => s + l.valeurStock, 0);

  const gaz = GAZ.map((g) => {
    const x = r.gaz[g.nom];
    return { ...g, present: n(x.present), livraison: n(x.livraison), vendu: n(x.vendu), restant: n(x.present) + n(x.livraison) - n(x.vendu), valeurVente: n(x.vendu) * g.prix, marge: n(x.vendu) * (g.prix - g.cout) };
  });
  const caGaz = gaz.reduce((s, g) => s + g.valeurVente, 0);
  const margeGaz = gaz.reduce((s, g) => s + g.marge, 0);

  const lavage = n(r.lavage), tickets = n(r.tickets), remboursement = n(r.remboursement), depots = n(r.depots);
  const depenses = r.depenses.reduce((s, d) => s + n(d.montant), 0);
  const caTotal = caCarburant + caLub + caGaz + lavage + depots + remboursement;   // D27
  const aVerser = caTotal - tickets - depenses;                                    // J29
  const bis = r.versements.reduce((s, v) => s + n(v), 0);                          // B34
  const totalCoupures = COUPURES.reduce((s, c) => s + c * n(r.coupures[c]), 0);    // C42
  const ecart = bis + depenses + tickets - caTotal;                                // L28
  const netBis = bis - totalCoupures;                                              // B35
  const ventilation = { carburant: bis - caLub - lavage - caGaz, lubrifiant: caLub, lavage, gaz: caGaz }; // N33..N36
  return { pGO, pSU, pist, volGO, volSU, caCarburant, lub, caLub, valeurStockLub, gaz, caGaz, margeGaz, lavage, tickets, remboursement, depots, depenses, caTotal, aVerser, bis, totalCoupures, ecart, netBis, ventilation };
}

// ---------- Contrôles avant soumission ----------
function controler(r, c) {
  const e = [];
  c.pist.forEach((p) => p.anomalie && e.push(`${p.code} : ${p.anomalie}`));
  if (c.pist.every((p) => p.fin === 0)) e.push("Aucun index fin saisi");
  if (c.bis === 0) e.push("Aucun versement saisi");
  if (Math.abs(c.ecart) > SEUIL_ECART) e.push(`Écart de caisse ${F(c.ecart)} F au-delà du seuil (${F(SEUIL_ECART)} F)`);
  if (c.totalCoupures > c.bis) e.push("Le détail des coupures dépasse les versements");
  r.depenses.forEach((d, i) => (!d.libelle || n(d.montant) <= 0) && e.push(`Dépense n°${i + 1} incomplète`));
  return e;
}

// ---------- Export Excel : même disposition que le bloc journalier source ----------
function exporterExcel(r, c) {
  const S = STATIONS.find((s) => s.code === r.station);
  const g = Array.from({ length: 42 }, () => Array(17).fill(null));
  const put = (cell, v) => { const col = cell.charCodeAt(0) - 65, row = +cell.slice(1) - 1; g[row][col] = v; };
  put("A1", `STATION SERVICES STAR ENERGY ${S.nom.toUpperCase()}`); put("E1", fmtDate(r.date)); put("H1", fmtDate(r.date));
  put("I1", " LUBRIFIANTS"); put("M1", "RECEPTION"); put("N1", "STOCK DEBUT"); put("O1", "STOCK FIN"); put("P1", "VALEURS STOCK");
  put("A2", fmtDate(r.date)); ["B2:index départ", "C2:index fin", "D2:volumes", "E2:valeurs", "F2:CUMUL VOLUMES", "G2:MONTANT"].forEach((s) => put(...s.split(":")));
  put("H2", c.volGO + c.volSU);
  c.pist.forEach((p, i) => { const row = 3 + i; put(`A${row}`, p.code); put(`B${row}`, p.depart); put(`C${row}`, p.fin); put(`D${row}`, p.volume); put(`E${row}`, p.valeur); });
  put("F3", c.volGO); put("G3", c.volGO * c.pGO); put("H4", "GASOIL"); put("F7", c.volSU); put("G7", c.volSU * c.pSU); put("H8", "SUPER"); put("G11", c.caCarburant);
  c.lub.forEach((l, i) => { const row = 2 + i; put(`I${row}`, l.nom); put(`J${row}`, l.vendu); put(`K${row}`, l.valeurVente); put(`M${row}`, l.reception || null); put(`N${row}`, l.debut); put(`O${row}`, l.stockFin); put(`P${row}`, l.valeurStock); });
  put("Q22", c.valeurStockLub);
  put("A22", "GAZ"); put("B22", "STOCK P"); put("C22", "LIVRAISON"); put("D22", "STOCK RESTANT");
  c.gaz.forEach((x, i) => { const row = 23 + i; put(`A${row}`, x.nom); put(`B${row}`, x.present); put(`C${row}`, x.livraison); put(`D${row}`, x.restant); put(`I${row}`, x.nom); put(`J${row}`, x.vendu); put(`K${row}`, x.valeurVente); });
  put("C27", "C.A.TOTAL"); put("D27", c.caTotal); put("E27", "TICKETS"); put("F27", c.tickets); put("G27", "DEPENSES"); put("H27", c.depenses);
  put("I27", "lavage"); put("K27", c.lavage); put("J28", "TOTAL"); put("K28", c.caLub + c.caGaz + c.lavage); put("L28", c.ecart);
  put("I29", "A VERSER"); put("J29", c.aVerser); put("I30", "BIS"); put("J30", c.bis); put("K30", c.bis + c.depenses + c.tickets);
  r.versements.forEach((v, i) => { put(`A${29 + i}`, `VERSEMENT ${i + 1}`); put(`B${29 + i}`, n(v)); });
  put("A34", "BIS"); put("B34", c.bis); put("A35", "NET BIS"); put("B35", c.netBis);
  put("C32", "MONTANTS"); put("D32", "BILLETS"); put("E32", "TOTAL");
  COUPURES.forEach((cp, i) => { put(`C${33 + i}`, cp * n(r.coupures[cp])); put(`D${33 + i}`, cp); put(`E${33 + i}`, n(r.coupures[cp])); });
  put("C42", c.totalCoupures);
  put("A38", "DETAILLE VERSEMENT BANQUE"); put("A39", "V.TOTALES"); put("B39", c.bis); put("A40", "CARBURANT"); put("B40", c.ventilation.carburant);
  put("A41", "LUBRIFIANT"); put("B41", c.caLub); put("A42", "LAVAGE"); put("B42", c.lavage);
  put("M40", "VENTE GAZ"); put("N40", "MARGE"); put("M41", c.caGaz); put("N41", c.margeGaz);
  const ws = XLSX.utils.aoa_to_sheet(g);
  const wsDep = XLSX.utils.aoa_to_sheet([["DATE", "CATEGORIE", "LIBELLE", "MONTANT"], ...r.depenses.map((d) => [fmtDate(r.date), d.categorie, d.libelle, n(d.montant)])]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "JOURNAL"); XLSX.utils.book_append_sheet(wb, wsDep, "DEPENSES");
  XLSX.writeFile(wb, `JOURNAL_${r.station}_${fmtDate(r.date).replaceAll("/", "_")}.xlsx`);
}

// ---------- UI ----------
const T = { petrol: "#0E3A56", ink: "#16232B", paper: "#F3F6F8", line: "#D5DEE4", gold: "#F2B90C", ok: "#1D8F5B", alert: "#C8391E", muted: "#5B6B76" };
const STATUTS = { BROUILLON: ["Brouillon", T.muted], SOUMIS: ["Soumis — en attente", "#B7791F"], VALIDE: ["Validé", T.ok], REJETE: ["Rejeté", T.alert] };

function Num({ value, onChange, disabled, placeholder = "0", w = "w-24", right = true, big }) {
  return (
    <input type="text" inputMode="decimal" value={value} disabled={disabled} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ""))}
      className={`${w} ${right ? "text-right" : ""} ${big ? "text-lg py-2" : "py-1"} px-2 rounded border bg-white disabled:bg-transparent disabled:border-transparent disabled:text-inherit focus:outline-none focus:ring-2`}
      style={{ borderColor: T.line, fontVariantNumeric: "tabular-nums", "--tw-ring-color": T.gold }} />
  );
}
const Row = ({ children, className = "" }) => <div className={`flex items-center justify-between gap-2 py-2 border-b ${className}`} style={{ borderColor: T.line }}>{children}</div>;
const Section = ({ titre, aside, children }) => (
  <section className="mb-5">
    <div className="flex items-baseline justify-between mb-1"><h2 className="text-base font-semibold" style={{ color: T.petrol }}>{titre}</h2>{aside && <span className="text-sm" style={{ color: T.muted }}>{aside}</span>}</div>
    <div className="bg-white rounded-lg px-3" style={{ border: `1px solid ${T.line}` }}>{children}</div>
  </section>
);
const Alerte = ({ children }) => <div className="text-sm rounded px-3 py-2 my-2" style={{ background: "#FBEAE5", color: T.alert }}>{children}</div>;

export default function RapportGerant() {
  const [role, setRole] = useState("gerant");
  const [station, setStation] = useState("HANN");
  const [date, setDate] = useState("2026-09-13");
  const [r, setR] = useState(() => rapportVide("HANN", "2026-09-13"));
  const [onglet, setOnglet] = useState("carburant");
  const [msg, setMsg] = useState("");
  const [charge, setCharge] = useState(false);
  const cle = `ogss:rapport:${station}:${date}`;
  const c = useMemo(() => calculer(r), [r]);
  const erreurs = useMemo(() => controler(r, c), [r, c]);
  const verrou = r.statut === "VALIDE" || r.statut === "SOUMIS" || role !== "gerant";

  useEffect(() => { // chargement du brouillon (persistance locale)
    let actif = true;
    (async () => {
      setCharge(false);
      try { const res = await window.storage.get(cle); if (actif && res?.value) { setR(JSON.parse(res.value)); setCharge(true); return; } } catch (_) {}
      if (actif) { setR(rapportVide(station, date)); setCharge(true); }
    })();
    return () => { actif = false; };
  }, [cle]);

  const sauver = async (rap, texte) => {
    try { await window.storage.set(cle, JSON.stringify(rap)); setMsg(texte ?? "Brouillon enregistré sur l'appareil"); }
    catch { setMsg("Enregistrement local impossible — réessayez"); }
    setTimeout(() => setMsg(""), 2500);
  };
  const up = (patch) => setR((x) => ({ ...x, ...patch }));
  const upIn = (bloc, k, champ, v) => setR((x) => ({ ...x, [bloc]: { ...x[bloc], [k]: { ...x[bloc][k], [champ]: v } } }));
  const changerStatut = async (statut, extra = {}) => { const rap = { ...r, statut, ...extra }; setR(rap); await sauver(rap, `Rapport ${STATUTS[statut][0].toLowerCase()}`); };

  const onglets = [["carburant", "Carburant"], ["lubrifiants", "Lubrifiants"], ["gaz", "Gaz"], ["cloture", "Clôture"], ["recap", "Récap"]];
  const [stLbl, stCol] = STATUTS[r.statut];

  return (
    <div className="min-h-screen pb-24" style={{ background: T.paper, color: T.ink, fontFamily: "'Source Sans 3', 'Segoe UI', system-ui, sans-serif" }}>
      {/* En-tête */}
      <header className="sticky top-0 z-20 px-4 pt-3 pb-2" style={{ background: T.petrol, color: "white" }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between text-xs opacity-80">
            <span>OGSS Réseau — Rapport gérant</span>
            <label className="flex items-center gap-1">Vue
              <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-transparent border rounded px-1" style={{ borderColor: "rgba(255,255,255,.4)" }}>
                <option value="gerant" style={{ color: T.ink }}>Gérant</option><option value="superviseur" style={{ color: T.ink }}>Superviseur</option>
              </select></label>
          </div>
          <div className="flex items-end justify-between mt-1 gap-2">
            <div>
              <select value={station} onChange={(e) => setStation(e.target.value)} className="bg-transparent text-lg font-semibold -ml-1" style={{ color: "white" }}>
                {STATIONS.map((s) => <option key={s.code} value={s.code} style={{ color: T.ink }}>{s.nom}</option>)}
              </select>
              <div className="flex items-center gap-2 text-sm">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent border rounded px-1" style={{ borderColor: "rgba(255,255,255,.4)", colorScheme: "dark" }} />
                <span className="opacity-80">GO {c.pGO} F · Super {c.pSU} F</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-80">À verser</div>
              <div className="text-2xl font-bold leading-none" style={{ color: T.gold, fontVariantNumeric: "tabular-nums" }}>{F(c.aVerser)}</div>
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "white", color: stCol }}>{stLbl}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4">
        {msg && <div className="text-sm rounded px-3 py-2 mb-3" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}
        {r.statut === "REJETE" && r.motifRejet && <Alerte>Rejeté par le superviseur : {r.motifRejet}</Alerte>}
        {!charge ? <p className="text-sm" style={{ color: T.muted }}>Chargement du rapport…</p> : <>

        {onglet === "carburant" && (
          <>
            {["GASOIL", "SUPER"].map((prod) => (
              <Section key={prod} titre={prod === "GASOIL" ? "Gasoil" : "Super"} aside={`${F(prod === "GASOIL" ? c.volGO : c.volSU)} L · ${F((prod === "GASOIL" ? c.volGO : c.volSU) * (prod === "GASOIL" ? c.pGO : c.pSU))} F`}>
                <div className="grid grid-cols-12 text-xs py-1 border-b" style={{ color: T.muted, borderColor: T.line }}><span className="col-span-3">Pistolet</span><span className="col-span-3 text-right">Départ</span><span className="col-span-3 text-right">Fin</span><span className="col-span-3 text-right">Litres</span></div>
                {c.pist.filter((p) => p.produit === prod).map((p) => (
                  <div key={p.code}>
                    <div className="grid grid-cols-12 items-center gap-1 py-1.5 border-b" style={{ borderColor: T.line }}>
                      <span className="col-span-3 font-medium">{p.code}</span>
                      <span className="col-span-3 text-right text-sm" style={{ color: T.muted, fontVariantNumeric: "tabular-nums" }}>{F(p.depart)}</span>
                      <div className="col-span-3 flex justify-end"><Num value={r.pistolets[p.code].fin} disabled={verrou} onChange={(v) => upIn("pistolets", p.code, "fin", v)} w="w-full" /></div>
                      <span className="col-span-3 text-right font-semibold" style={{ color: p.anomalie ? T.alert : T.ink, fontVariantNumeric: "tabular-nums" }}>{p.fin ? F(p.volume) : "—"}</span>
                    </div>
                    {p.anomalie && <Alerte>{p.code} — {p.anomalie}</Alerte>}
                  </div>
                ))}
              </Section>
            ))}
            <p className="text-sm" style={{ color: T.muted }}>L'index départ est repris automatiquement de l'index fin de la veille. Volume = fin − départ ; valeur = volume × prix du jour.</p>
          </>
        )}

        {onglet === "lubrifiants" && (
          <Section titre="Lubrifiants" aside={`${F(c.caLub)} F vendus`}>
            <div className="grid grid-cols-12 text-xs py-1 border-b" style={{ color: T.muted, borderColor: T.line }}><span className="col-span-4">Référence</span><span className="col-span-2 text-right">Début</span><span className="col-span-2 text-right">Reçu</span><span className="col-span-2 text-right">Vendu</span><span className="col-span-2 text-right">Fin</span></div>
            {c.lub.map((l) => (
              <div key={l.nom} className="grid grid-cols-12 items-center gap-1 py-1.5 border-b" style={{ borderColor: T.line }}>
                <div className="col-span-4"><div className="text-sm font-medium leading-tight">{l.nom}</div><div className="text-xs" style={{ color: T.muted }}>{F(l.prix)} F</div></div>
                <div className="col-span-2 flex justify-end"><Num value={r.lubrifiants[l.nom].debut} disabled={verrou} onChange={(v) => upIn("lubrifiants", l.nom, "debut", v)} w="w-full" /></div>
                <div className="col-span-2 flex justify-end"><Num value={r.lubrifiants[l.nom].reception} disabled={verrou} placeholder="" onChange={(v) => upIn("lubrifiants", l.nom, "reception", v)} w="w-full" /></div>
                <div className="col-span-2 flex justify-end"><Num value={r.lubrifiants[l.nom].vendu} disabled={verrou} placeholder="" onChange={(v) => upIn("lubrifiants", l.nom, "vendu", v)} w="w-full" /></div>
                <span className="col-span-2 text-right font-semibold" style={{ color: l.stockFin < 0 ? T.alert : l.bas ? "#B7791F" : T.ink }}>{F(l.stockFin)}</span>
              </div>
            ))}
            <Row className="border-0 font-semibold"><span>Valeur du stock fin</span><span>{F(c.valeurStockLub)} F</span></Row>
          </Section>
        )}

        {onglet === "gaz" && (
          <Section titre="Gaz butane" aside={`${F(c.caGaz)} F · marge ${F(c.margeGaz)} F`}>
            <div className="grid grid-cols-12 text-xs py-1 border-b" style={{ color: T.muted, borderColor: T.line }}><span className="col-span-4">Format</span><span className="col-span-2 text-right">Présent</span><span className="col-span-2 text-right">Livré</span><span className="col-span-2 text-right">Vendu</span><span className="col-span-2 text-right">Restant</span></div>
            {c.gaz.map((g) => (
              <div key={g.nom} className="grid grid-cols-12 items-center gap-1 py-1.5 border-b" style={{ borderColor: T.line }}>
                <div className="col-span-4"><div className="text-sm font-medium">{g.nom}</div><div className="text-xs" style={{ color: T.muted }}>{F(g.prix)} F</div></div>
                <div className="col-span-2 flex justify-end"><Num value={r.gaz[g.nom].present} disabled={verrou} onChange={(v) => upIn("gaz", g.nom, "present", v)} w="w-full" /></div>
                <div className="col-span-2 flex justify-end"><Num value={r.gaz[g.nom].livraison} disabled={verrou} placeholder="" onChange={(v) => upIn("gaz", g.nom, "livraison", v)} w="w-full" /></div>
                <div className="col-span-2 flex justify-end"><Num value={r.gaz[g.nom].vendu} disabled={verrou} placeholder="" onChange={(v) => upIn("gaz", g.nom, "vendu", v)} w="w-full" /></div>
                <span className="col-span-2 text-right font-semibold" style={{ color: g.restant < 0 ? T.alert : T.ink }}>{F(g.restant)}</span>
              </div>
            ))}
          </Section>
        )}

        {onglet === "cloture" && (
          <>
            <Section titre="Autres recettes et règlements">
              <Row><span>Lavage</span><Num big value={r.lavage} disabled={verrou} onChange={(v) => up({ lavage: v })} /></Row>
              <Row><span>Tickets / bons carburant</span><Num big value={r.tickets} disabled={verrou} onChange={(v) => up({ tickets: v })} /></Row>
              <Row><span>Dépôts clients</span><Num value={r.depots} disabled={verrou} onChange={(v) => up({ depots: v })} /></Row>
              <Row className="border-0"><span>Remboursements</span><Num value={r.remboursement} disabled={verrou} onChange={(v) => up({ remboursement: v })} /></Row>
            </Section>

            <Section titre="Dépenses" aside={`${F(c.depenses)} F`}>
              {r.depenses.length === 0 && <p className="text-sm py-2" style={{ color: T.muted }}>Aucune dépense saisie.</p>}
              {r.depenses.map((d, i) => (
                <div key={i} className="py-2 border-b" style={{ borderColor: T.line }}>
                  <div className="flex gap-2 mb-1">
                    <select value={d.categorie} disabled={verrou} onChange={(e) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, categorie: e.target.value } : x) })} className="flex-1 rounded border px-2 py-1 bg-white text-sm" style={{ borderColor: T.line }}>
                      {CATEGORIES_DEPENSE.map((k) => <option key={k}>{k}</option>)}</select>
                    <Num value={d.montant} disabled={verrou} onChange={(v) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, montant: v } : x) })} />
                    {!verrou && <button onClick={() => up({ depenses: r.depenses.filter((_, j) => j !== i) })} className="px-2 rounded" style={{ color: T.alert }} aria-label="Supprimer">✕</button>}
                  </div>
                  <input value={d.libelle} disabled={verrou} placeholder="Libellé (ex. Bon pour Mamour Beye, transport gérant)" onChange={(e) => up({ depenses: r.depenses.map((x, j) => j === i ? { ...x, libelle: e.target.value } : x) })} className="w-full rounded border px-2 py-1 text-sm bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: T.line }} />
                </div>
              ))}
              {!verrou && <button onClick={() => up({ depenses: [...r.depenses, { categorie: "Transport", libelle: "", montant: "" }] })} className="w-full py-2 my-2 rounded text-sm font-medium" style={{ border: `1px dashed ${T.petrol}`, color: T.petrol }}>+ Ajouter une dépense</button>}
            </Section>

            <Section titre="Versements espèces" aside={`BIS ${F(c.bis)} F`}>
              {r.versements.map((v, i) => (
                <Row key={i} className={i === 4 ? "border-0" : ""}><span>Versement {i + 1}</span><Num big value={v} disabled={verrou} placeholder="" onChange={(x) => up({ versements: r.versements.map((y, j) => j === i ? x : y) })} /></Row>
              ))}
            </Section>

            <Section titre="Détail versement banque (coupures)" aside={`${F(c.totalCoupures)} F`}>
              <div className="grid grid-cols-3 gap-2 py-2">
                {COUPURES.map((cp) => (
                  <label key={cp} className="rounded p-2" style={{ background: T.paper }}>
                    <div className="text-xs" style={{ color: T.muted }}>{F(cp)} F</div>
                    <Num value={r.coupures[cp]} disabled={verrou} placeholder="" onChange={(v) => up({ coupures: { ...r.coupures, [cp]: v } })} w="w-full" right={false} />
                    <div className="text-xs text-right" style={{ color: T.muted }}>{F(cp * n(r.coupures[cp]))}</div>
                  </label>
                ))}
              </div>
              <Row className="border-0"><span>NET BIS (versements − coupures)</span><span className="font-semibold">{F(c.netBis)} F</span></Row>
            </Section>
          </>
        )}

        {onglet === "recap" && (
          <>
            {/* Bordereau de clôture — l'élément mémorable : un bordereau de caisse */}
            <div className="bg-white rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              <div className="px-4 py-3" style={{ background: T.petrol, color: "white" }}>
                <div className="text-xs opacity-80">Bordereau de clôture</div>
                <div className="font-semibold">{STATIONS.find((s) => s.code === station)?.nom} — {fmtDate(date)}</div>
                <div className="text-xs opacity-80">Gérant : {r.gerant}</div>
              </div>
              <div className="px-4 py-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                <Row><span>Gasoil {F(c.volGO)} L × {c.pGO}</span><span>{F(c.volGO * c.pGO)}</span></Row>
                <Row><span>Super {F(c.volSU)} L × {c.pSU}</span><span>{F(c.volSU * c.pSU)}</span></Row>
                <Row><span>Lubrifiants</span><span>{F(c.caLub)}</span></Row>
                <Row><span>Gaz</span><span>{F(c.caGaz)}</span></Row>
                <Row><span>Lavage</span><span>{F(c.lavage)}</span></Row>
                {(c.depots > 0 || c.remboursement > 0) && <Row><span>Dépôts + remboursements</span><span>{F(c.depots + c.remboursement)}</span></Row>}
                <Row className="font-bold text-base"><span>C.A. TOTAL</span><span>{F(c.caTotal)}</span></Row>
                <Row><span>− Tickets</span><span>{F(c.tickets)}</span></Row>
                <Row><span>− Dépenses</span><span>{F(c.depenses)}</span></Row>
                <Row className="font-bold text-lg" ><span>À VERSER</span><span style={{ color: T.petrol }}>{F(c.aVerser)}</span></Row>
                <Row><span>Versements (BIS)</span><span>{F(c.bis)}</span></Row>
                <Row className="font-semibold border-0"><span>Écart de caisse</span>
                  <span className="px-2 rounded" style={{ background: Math.abs(c.ecart) > SEUIL_ECART ? "#FBEAE5" : "#E3F4EA", color: Math.abs(c.ecart) > SEUIL_ECART ? T.alert : T.ok }}>{c.ecart > 0 ? "+" : ""}{F(c.ecart)}</span></Row>
              </div>
              <div className="px-4 py-2 text-sm border-t" style={{ borderColor: T.line, background: T.paper }}>
                <div className="flex justify-between"><span>Ventilation versement</span><span style={{ color: T.muted }}>Carburant {F(c.ventilation.carburant)} · Lub {F(c.caLub)} · Lavage {F(c.lavage)} · Gaz {F(c.caGaz)}</span></div>
                <div className="flex justify-between mt-1"><span>Coupures comptées</span><span>{F(c.totalCoupures)} — NET BIS {F(c.netBis)}</span></div>
              </div>
            </div>

            {erreurs.length > 0 && r.statut === "BROUILLON" && (
              <div className="mt-4 rounded-lg px-3 py-2" style={{ background: "#FBEAE5", color: T.alert }}>
                <div className="font-semibold text-sm mb-1">À corriger avant soumission</div>
                <ul className="text-sm list-disc pl-5">{erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}

            <textarea value={r.commentaire} disabled={verrou} onChange={(e) => up({ commentaire: e.target.value })} placeholder="Commentaire du gérant (incident, panne, explication d'écart…)" className="w-full mt-4 rounded border p-2 text-sm bg-white disabled:bg-transparent" rows={2} style={{ borderColor: T.line }} />

            <div className="mt-4 grid gap-2">
              {role === "gerant" && (r.statut === "BROUILLON" || r.statut === "REJETE") && <>
                <button onClick={() => sauver(r)} className="py-3 rounded-lg font-medium" style={{ border: `1px solid ${T.petrol}`, color: T.petrol, background: "white" }}>Enregistrer le brouillon</button>
                <button disabled={erreurs.length > 0} onClick={() => changerStatut("SOUMIS", { soumisLe: new Date().toISOString() })} className="py-3 rounded-lg font-semibold disabled:opacity-40" style={{ background: T.gold, color: T.ink }}>Soumettre au superviseur</button>
              </>}
              {role === "superviseur" && r.statut === "SOUMIS" && <>
                <button onClick={() => changerStatut("VALIDE", { valideLe: new Date().toISOString() })} className="py-3 rounded-lg font-semibold" style={{ background: T.ok, color: "white" }}>Valider le rapport</button>
                <button onClick={() => { const m = prompt("Motif du rejet ?"); if (m) changerStatut("REJETE", { motifRejet: m }); }} className="py-3 rounded-lg font-medium" style={{ border: `1px solid ${T.alert}`, color: T.alert, background: "white" }}>Rejeter avec motif</button>
              </>}
              <button onClick={() => exporterExcel(r, c)} className="py-3 rounded-lg font-medium" style={{ border: `1px solid ${T.line}`, background: "white" }}>Exporter au format journal Excel</button>
              {role === "gerant" && r.statut === "BROUILLON" && <button onClick={() => { if (confirm("Réinitialiser la saisie du jour ?")) setR(rapportVide(station, date)); }} className="py-2 text-sm" style={{ color: T.muted }}>Réinitialiser</button>}
            </div>
          </>
        )}
        </>}
      </main>

      {/* Barre d'onglets mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="max-w-md mx-auto grid grid-cols-5">
          {onglets.map(([k, lbl]) => (
            <button key={k} onClick={() => setOnglet(k)} className="py-3 text-sm relative" style={{ color: onglet === k ? T.petrol : T.muted, fontWeight: onglet === k ? 600 : 400 }}>
              {lbl}{onglet === k && <span className="absolute top-0 left-1/4 right-1/4 h-0.5" style={{ background: T.gold }} />}
              {k === "recap" && erreurs.length > 0 && r.statut === "BROUILLON" && <span className="absolute top-2 right-3 w-2 h-2 rounded-full" style={{ background: T.alert }} />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
