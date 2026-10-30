import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listDescentes,
  listPrestationsLavage,
  listVentesBoutique,
  listDepenses,
  listPrestationsEntretien,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { nombreEnLettres } from "../lib/facturation";
import { Loading } from "../components/ui";
import { normalizeDescente } from "./DescentePompiste";

/** Formate une date ISO en ajoutant ou retirant des jours */
function shiftDate(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BilanJournalierSite() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || "Station Hann Maristes";

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("synthese"); // synthese | pompistes | lavage | boutique | entretien | depenses

  const [descentes, setDescentes] = useState([]);
  const [lavages, setLavages] = useState([]);
  const [ventesB, setVentesB] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [entretiens, setEntretiens] = useState([]);

  const loadAll = async (d) => {
    setLoading(true);
    try {
      const [des, lav, vb, dep, ent] = await Promise.all([
        listDescentes(stationId, d).catch(() => []),
        listPrestationsLavage(stationId, d).catch(() => []),
        listVentesBoutique(stationId, d).catch(() => []),
        listDepenses(stationId, d).catch(() => []),
        listPrestationsEntretien(stationId, d).catch(() => []),
      ]);
      setDescentes((des || []).map(normalizeDescente).filter(Boolean));
      setLavages(lav || []);
      setVentesB(vb || []);
      setDepenses(dep || []);
      setEntretiens(ent || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(date);
  }, [date, stationId]);

  // ────────────────── 1. SYNTHÈSE CUMULÉE DES POMPES (PAR PISTOLET) ──────────────────
  const synthesePompes = useMemo(() => {
    const map = {};
    for (const d of descentes) {
      const pNom = d.pompiste_nom || d.pompiste || "Pompiste";
      for (const p of d.pompes || []) {
        const code = p.pistolet_code || p.code || p.id || "Pompe";
        if (!map[code]) {
          map[code] = {
            code,
            produit: p.produit || "GASOIL",
            index_depart: n(p.index_debut ?? p.index_depart ?? 0),
            index_fin: n(p.index_fin ?? 0),
            volume_vendu: 0,
            prix_unitaire: n(p.prix_unitaire ?? 0),
            montant: 0,
            pompistes: new Set(),
          };
        }
        const cur = map[code];
        const ideb = n(p.index_debut ?? p.index_depart ?? 0);
        const ifin = n(p.index_fin ?? 0);
        if (ideb > 0 && (cur.index_depart === 0 || ideb < cur.index_depart)) {
          cur.index_depart = ideb;
        }
        if (ifin > cur.index_fin) {
          cur.index_fin = ifin;
        }
        if (n(p.prix_unitaire) > 0) {
          cur.prix_unitaire = n(p.prix_unitaire);
        }
        const vol = n(p.volume_vendu ?? (ifin >= ideb ? ifin - ideb : 0));
        cur.volume_vendu += vol;
        cur.montant += n(p.montant ?? vol * (cur.prix_unitaire || 0));
        cur.pompistes.add(pNom);
      }
    }
    return Object.values(map)
      .map((item) => ({
        ...item,
        pompistesStr: Array.from(item.pompistes).join(", "),
      }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [descentes]);

  // ────────────────── 2. CALCULS POMPISTES (CARBURANT) ──────────────────
  const pompistesStats = useMemo(() => {
    return descentes.map((d) => {
      const totalPompes = (d.pompes || []).reduce((s, p) => s + n(p.volume_vendu), 0);
      const caCarburant = (d.pompes || []).reduce(
        (s, p) => s + n(p.volume_vendu) * n(p.prix_unitaire),
        0
      );
      const caLub = n(d.total_lubrifiants) || 0;
      const remiseCuve = n(d.remise_cuve_valeur) || 0;
      const totalTheorique = caCarburant + caLub - remiseCuve;

      const enc = d.encaissements || {};
      const especes = n(enc.especes) || 0;
      const wave = n(enc.wave) || 0;
      const om = n(enc.om) || 0;
      const cb = n(enc.cb) || 0;
      const petrosen = n(enc.petrosen) || 0;
      const codeElec = n(enc.code_electronique) || 0;
      const tickets = n(enc.tickets) || 0;
      const credits = n(enc.credits) || 0;
      const depensesPompiste = n(d.depenses_valeur ?? d.depenses_montant ?? d.depenses) || 0;
      const totalVerse =
        especes + wave + om + cb + petrosen + codeElec + tickets + credits + depensesPompiste;
      const ecart = totalVerse - totalTheorique;

      return {
        d,
        pompiste: d.pompiste_nom || d.pompiste || "—",
        date: d.date,
        produit: (d.pompes || []).map((p) => p.produit || "—").join(", "),
        volume: totalPompes,
        caCarburant,
        caLub,
        remiseCuve,
        depenses: depensesPompiste,
        depensesMotif: d.depenses_motif || "",
        totalTheorique,
        especes,
        wave,
        om,
        cb,
        petrosen,
        codeElec,
        tickets,
        credits,
        totalVerse,
        ecart,
      };
    });
  }, [descentes]);

  const totPompes = useMemo(
    () =>
      pompistesStats.reduce(
        (acc, p) => ({
          volume: acc.volume + p.volume,
          caCarburant: acc.caCarburant + p.caCarburant,
          caLub: acc.caLub + p.caLub,
          remiseCuve: acc.remiseCuve + p.remiseCuve,
          depenses: acc.depenses + p.depenses,
          totalTheorique: acc.totalTheorique + p.totalTheorique,
          especes: acc.especes + p.especes,
          wave: acc.wave + p.wave,
          om: acc.om + p.om,
          cb: acc.cb + p.cb,
          petrosen: acc.petrosen + p.petrosen,
          codeElec: acc.codeElec + p.codeElec,
          tickets: acc.tickets + p.tickets,
          credits: acc.credits + p.credits,
          totalVerse: acc.totalVerse + p.totalVerse,
          ecart: acc.ecart + p.ecart,
        }),
        {
          volume: 0,
          caCarburant: 0,
          caLub: 0,
          remiseCuve: 0,
          depenses: 0,
          totalTheorique: 0,
          especes: 0,
          wave: 0,
          om: 0,
          cb: 0,
          petrosen: 0,
          codeElec: 0,
          tickets: 0,
          credits: 0,
          totalVerse: 0,
          ecart: 0,
        }
      ),
    [pompistesStats]
  );

  // ────────────────── 3. CALCULS LAVAGE ──────────────────
  const totLavage = useMemo(() => {
    const ca = lavages.reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0);
    const especes = lavages
      .filter((l) => (l.mode_paiement || "ESPECES") === "ESPECES")
      .reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0);
    const wave = lavages
      .filter((l) => l.mode_paiement === "WAVE")
      .reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0);
    const om = lavages
      .filter((l) => l.mode_paiement === "OM")
      .reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0);
    const credit = lavages
      .filter((l) => l.mode_paiement === "CREDIT")
      .reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0);

    return {
      nb: lavages.length,
      ca,
      especes,
      wave,
      om,
      credit,
      digitaux: wave + om,
    };
  }, [lavages]);

  // ────────────────── 4. CALCULS BOUTIQUE ──────────────────
  const totBoutique = useMemo(() => {
    const ca = ventesB.reduce((s, v) => s + n(v.montant_total || v.total || 0), 0);
    const especes = ventesB
      .filter((v) => (v.mode_paiement || "ESPECES") === "ESPECES")
      .reduce((s, v) => s + n(v.montant_total || v.total || 0), 0);
    const wave = ventesB
      .filter((v) => v.mode_paiement === "WAVE")
      .reduce((s, v) => s + n(v.montant_total || v.total || 0), 0);
    const om = ventesB
      .filter((v) => v.mode_paiement === "OM")
      .reduce((s, v) => s + n(v.montant_total || v.total || 0), 0);
    const cb = ventesB
      .filter((v) => ["CB", "CARTE", "TPE"].includes(v.mode_paiement))
      .reduce((s, v) => s + n(v.montant_total || v.total || 0), 0);
    const credit = ventesB
      .filter((v) => v.mode_paiement === "CREDIT")
      .reduce((s, v) => s + n(v.montant_total || v.total || 0), 0);

    return {
      nb: ventesB.length,
      ca,
      especes,
      wave,
      om,
      cb,
      credit,
      digitaux: wave + om + cb,
    };
  }, [ventesB]);

  // ────────────────── 5. CALCULS ENTRETIEN & STAR CARE ──────────────────
  const totEntretien = useMemo(() => {
    const ca = entretiens.reduce((s, e) => s + n(e.montant_total || e.montant || 0), 0);
    const especes = entretiens
      .filter((e) => (e.mode_paiement || "ESPECES") === "ESPECES")
      .reduce((s, e) => s + n(e.montant_total || e.montant || 0), 0);
    const wave = entretiens
      .filter((e) => e.mode_paiement === "WAVE")
      .reduce((s, e) => s + n(e.montant_total || e.montant || 0), 0);
    const om = entretiens
      .filter((e) => e.mode_paiement === "OM")
      .reduce((s, e) => s + n(e.montant_total || e.montant || 0), 0);
    const cb = entretiens
      .filter((e) => ["TPE", "CB", "CARTE"].includes(e.mode_paiement))
      .reduce((s, e) => s + n(e.montant_total || e.montant || 0), 0);
    const credit = entretiens
      .filter((e) => ["CREDIT", "BON_CARBURANT"].includes(e.mode_paiement))
      .reduce((s, e) => s + n(e.montant_total || e.montant || 0), 0);

    return {
      nb: entretiens.length,
      ca,
      especes,
      wave,
      om,
      cb,
      credit,
      digitaux: wave + om + cb,
    };
  }, [entretiens]);

  // ────────────────── 6. CALCULS DÉPENSES CAISSE STATION ──────────────────
  const totDepenses = useMemo(() => {
    const total = depenses.reduce((s, d) => s + n(d.montant || 0), 0);
    const especes = depenses
      .filter((d) => (d.mode_paiement || "ESPECES") === "ESPECES")
      .reduce((s, d) => s + n(d.montant || 0), 0);
    const autres = total - especes;
    return {
      nb: depenses.length,
      total,
      especes,
      autres,
    };
  }, [depenses]);

  // ────────────────── 7. SYNTHÈSE TOTALE DU CHIFFRE D'AFFAIRES & ESPÈCES BANQUE ──────────────────
  const caBrutCarburant = totPompes.caCarburant + totPompes.caLub;
  const caBrutLavage = totLavage.ca;
  const caBrutBoutique = totBoutique.ca;
  const caBrutEntretien = totEntretien.ca;
  const caGlobalSite = caBrutCarburant + caBrutLavage + caBrutBoutique + caBrutEntretien;

  // Espèces nettes encaissées par chaque activité
  const especesCarburant = totPompes.especes;
  const especesLavage = totLavage.especes;
  const especesBoutique = totBoutique.especes;
  const especesEntretien = totEntretien.especes;

  // Cumul brut des espèces collectées avant dépenses de caisse centrale
  const totalEspecesCollectees =
    especesCarburant + especesLavage + especesBoutique + especesEntretien;

  // Dépenses de la station payées en espèces
  const depensesEspecesStation = totDepenses.especes;

  // MONTANT TOTAL DU DÉPÔT EN BANQUE À FAIRE (ESPÈCES NETTES)
  const netBanqueDepot = Math.max(0, totalEspecesCollectees - depensesEspecesStation);

  const TABS = [
    { id: "synthese", label: "📊 Synthèse Jour", count: null },
    { id: "pompistes", label: "⛽ Pompistes & Pompes", count: descentes.length },
    { id: "lavage", label: "🚿 Lavage", count: lavages.length },
    { id: "boutique", label: "🏪 Boutique", count: ventesB.length },
    { id: "entretien", label: "🔧 Entretien & Vidange", count: entretiens.length },
    { id: "depenses", label: "💸 Dépenses", count: depenses.length },
  ];

  const KPI = ({ label, value, color = "text-gray-900", sub, bg = "bg-white", border = "border-gray-200" }) => (
    <div
      className={`${bg} rounded-xl border ${border} p-3.5 shadow-xs text-center flex flex-col items-center justify-center gap-0.5`}
    >
      <div className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-black tabular leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 font-medium">{sub}</div>}
    </div>
  );

  if (loading) return <Loading label="Chargement du Bilan Journalier Site..." />;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b" style={{ borderColor: T.line }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📑</span>
            <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
              Bilan Journalier du Site
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
              Clôture Quotidienne
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: T.muted }}>
            Vue consolidée de toutes les opérations du site : pompistes, lavage, boutique, dépenses
          </p>
        </div>

        {/* Sélecteur de date avec navigation J-1 / J+1 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDate(shiftDate(date, -1))}
            className="p-2 rounded-lg border font-bold text-gray-700 hover:bg-gray-100"
            style={{ borderColor: T.line }}
          >
            ◀
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs border rounded-lg p-2 font-semibold"
            style={{ borderColor: T.line }}
          />
          <button
            type="button"
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= todayISO()}
            className="p-2 rounded-lg border font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            style={{ borderColor: T.line }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs px-3 py-2 rounded-lg font-bold text-gray-900 shadow-xs hover:opacity-90"
            style={{ background: T.gold }}
          >
            🖨️ Imprimer
          </button>
        </div>
      </div>

      {/* Date affichée */}
      <div className="text-center mb-4">
        <span className="text-base font-bold text-gray-800">
          {fmtDate(date)}{" "}
          {date === todayISO() && (
            <span className="text-xs font-normal text-emerald-600 ml-2 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              ● Aujourd'hui (temps réel)
            </span>
          )}
        </span>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all flex items-center gap-1 ${
              tab === t.id ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                  tab === t.id ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ────── ONGLET 1 : SYNTHÈSE JOUR (VUE EXÉCUTIVE CONSOLIDÉE) ────── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {tab === "synthese" && (
        <div className="space-y-5">
          {/* GRANDS INDICATEURS HAUT DE PAGE */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <KPI
              label="CA Global Site"
              value={`${F(caGlobalSite)} F`}
              color="text-indigo-950"
              sub="Toutes activités réunies"
              bg="bg-indigo-50/50"
              border="border-indigo-100"
            />
            <KPI
              label="Volume Carburant"
              value={`${F(totPompes.volume)} L`}
              color="text-blue-900"
              sub={`${descentes.length} pompiste(s) en service`}
              bg="bg-blue-50/50"
              border="border-blue-100"
            />
            <KPI
              label="Total Espèces Collectées"
              value={`${F(totalEspecesCollectees)} F`}
              color="text-emerald-800"
              sub="Carb + Lav + Bout + Ent"
              bg="bg-emerald-50/60"
              border="border-emerald-200"
            />
            <KPI
              label="Dépenses Caisse (-)"
              value={`-${F(depensesEspecesStation)} F`}
              color="text-rose-700"
              sub={`${totDepenses.nb} dépense(s) déduite(s)`}
              bg="bg-rose-50/50"
              border="border-rose-200"
            />
            <KPI
              label="🏆 DÉPÔT BANQUE NET"
              value={`${F(netBanqueDepot)} F`}
              color="text-amber-950"
              sub="Espèces à verser en banque"
              bg="bg-gradient-to-br from-amber-100 to-amber-200"
              border="border-2 border-amber-400"
            />
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* SECTION 1 : ACTIVITÉ CARBURANT & POMPISTES (INDEX POMPES & CA) */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b gap-2" style={{ borderColor: T.line }}>
              <div>
                <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <span>⛽ 1. Activité Carburant — Synthèse Cumulée des Pompes &amp; Pompistes</span>
                </h2>
                <p className="text-xs text-gray-500">
                  Relevé des index de départ et de fin par pistolet, litrage total vendu et ventilation des encaissements
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg">
                  {synthesePompes.length} pistolet(s) actif(s)
                </span>
                <span className="text-xs font-bold px-3 py-1 bg-gray-100 text-gray-800 rounded-lg">
                  {descentes.length} quart(s) pompiste(s)
                </span>
              </div>
            </div>

            {/* A. TABLEAU DES INDEX POMPES / PISTOLETS */}
            {synthesePompes.length === 0 ? (
              <div className="p-6 border rounded-xl bg-gray-50 text-center text-xs text-gray-500">
                Aucune descente pompiste enregistrée pour le {fmtDate(date)}.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-xl" style={{ borderColor: T.line }}>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b text-gray-600 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Pistolet / Pompe</th>
                      <th className="py-2.5 px-3 text-left">Carburant</th>
                      <th className="py-2.5 px-3 text-right">Index Départ</th>
                      <th className="py-2.5 px-3 text-right">Index Fin</th>
                      <th className="py-2.5 px-3 text-right font-black text-blue-900">Volume Vendu (L)</th>
                      <th className="py-2.5 px-3 text-right">Prix/L (F)</th>
                      <th className="py-2.5 px-3 text-right font-black text-gray-900">CA Carburant Brut (F)</th>
                      <th className="py-2.5 px-3 text-left">Pompiste(s)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {synthesePompes.map((pompe) => (
                      <tr key={pompe.code} className="hover:bg-blue-50/40 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-gray-900">
                          {pompe.code}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pompe.produit === "SUPER"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-blue-100 text-blue-900 border border-blue-300"
                            }`}
                          >
                            {pompe.produit}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular text-gray-700">
                          {F(pompe.index_depart)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular text-gray-700">
                          {F(pompe.index_fin)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black tabular text-blue-900 bg-blue-50/50">
                          {F(pompe.volume_vendu)} L
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular text-gray-600">
                          {F(pompe.prix_unitaire)} F
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold tabular text-gray-900">
                          {F(pompe.montant)} F
                        </td>
                        <td className="py-2 px-3 text-gray-600 text-[11px] truncate max-w-xs">
                          {pompe.pompistesStr || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 bg-slate-100/80 font-black text-gray-900">
                    <tr>
                      <td colSpan={4} className="py-2.5 px-3 uppercase text-[11px] text-gray-700">
                        TOTAL INDEX POMPES CARBURANT
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm tabular text-blue-900">
                        {F(totPompes.volume)} L
                      </td>
                      <td></td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm tabular text-gray-950">
                        {F(totPompes.caCarburant)} F
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* B. BILAN FINANCIER & MODES D'ENCAISSEMENT POMPISTES */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-1">
              {/* Carte 1 : Du brut au théorique */}
              <div className="p-3.5 rounded-xl border bg-slate-50 space-y-2 text-xs" style={{ borderColor: T.line }}>
                <div className="font-bold text-gray-900 uppercase text-[11px] tracking-wide pb-1 border-b">
                  Calcul du Chiffre d'Affaires Théorique Pompistes
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Vente Carburant (Index pompes) :</span>
                  <span className="font-bold tabular text-gray-900">{F(totPompes.caCarburant)} F</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">(+) Vente Lubrifiants Pompiste :</span>
                  <span className="font-bold tabular text-amber-700">+{F(totPompes.caLub)} F</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">(-) Remises en Cuve Déduites :</span>
                  <span className="font-bold tabular text-rose-700">-{F(totPompes.remiseCuve)} F</span>
                </div>
                <div className="border-t pt-1.5 flex justify-between items-center font-black text-sm text-indigo-950">
                  <span>TOTAL THÉORIQUE POMPISTES :</span>
                  <span className="tabular">{F(totPompes.totalTheorique)} F</span>
                </div>
              </div>

              {/* Carte 2 : Ventilation détaillée des encaissements */}
              <div className="p-3.5 rounded-xl border bg-slate-50 space-y-2 text-xs" style={{ borderColor: T.line }}>
                <div className="font-bold text-gray-900 uppercase text-[11px] tracking-wide pb-1 border-b">
                  Cumul des Encaissements Pompistes par Mode
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {[
                    { label: "💵 Espèces Remises", val: totPompes.especes, color: "text-emerald-800 font-black" },
                    { label: "📱 Wave", val: totPompes.wave, color: "text-blue-700" },
                    { label: "📱 Orange Money", val: totPompes.om, color: "text-orange-700" },
                    { label: "💳 Carte Bancaire (CB)", val: totPompes.cb, color: "text-indigo-700" },
                    { label: "🛢️ Paiement Petrosen", val: totPompes.petrosen, color: "text-gray-700" },
                    { label: "📟 Code Électronique", val: totPompes.codeElec, color: "text-purple-700" },
                    { label: "🎫 Tickets Valeur", val: totPompes.tickets, color: "text-teal-700" },
                    { label: "📋 Bons & Crédits Clients", val: totPompes.credits, color: "text-amber-800" },
                    { label: "💸 Dépenses Pompistes Déduites", val: totPompes.depenses, color: "text-rose-700" },
                  ]
                    .filter((m) => m.val > 0)
                    .map((m) => (
                      <div key={m.label} className="flex justify-between items-center">
                        <span className="text-gray-600">{m.label} :</span>
                        <span className={`font-mono tabular ${m.color}`}>{F(m.val)} F</span>
                      </div>
                    ))}
                </div>
                <div className="border-t pt-1.5 flex justify-between items-center font-black text-sm text-gray-900">
                  <span>TOTAL JUSTIFIÉ / VERSÉ :</span>
                  <span className="tabular text-blue-900">{F(totPompes.totalVerse)} F</span>
                </div>
              </div>

              {/* Carte 3 : Rapprochement & Net Espèces Carburant */}
              <div className="p-3.5 rounded-xl border bg-emerald-50/50 space-y-3 text-xs border-emerald-200">
                <div className="font-bold text-emerald-950 uppercase text-[11px] tracking-wide pb-1 border-b border-emerald-200 flex justify-between items-center">
                  <span>Net Espèces Carburant</span>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-extrabold px-2 py-0.5 rounded-full">
                    Caisse Pompistes
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-gray-700">
                    <span>Espèces déclarées pompistes :</span>
                    <strong className="font-mono text-emerald-900 tabular text-sm">{F(totPompes.especes)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Écart de caisse pompistes :</span>
                    <strong
                      className={`font-mono tabular ${
                        totPompes.ecart === 0
                          ? "text-emerald-700"
                          : totPompes.ecart > 0
                          ? "text-blue-700"
                          : "text-rose-700"
                      }`}
                    >
                      {totPompes.ecart > 0 ? "+" : ""}
                      {F(totPompes.ecart)} F
                    </strong>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-emerald-300 text-center shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-gray-500 mb-0.5">
                    Chiffre d'Affaires Net en Espèces (Carburant)
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-800 tabular">
                    {F(especesCarburant)} F CFA
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-1">
                    Versement cash disponible pour la banque
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* SECTION 2 : AUTRES ACTIVITÉS (LAVAGE, BOUTIQUE, ENTRETIEN) */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>🏪 2. Synthèse des Autres Activités de la Station</span>
              </h2>
              <span className="text-xs text-gray-500">
                Lavage, Boutique / Gaz &amp; Entretien Atelier (Star Care)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* ACTIVITÉ A : LAVAGE AUTO */}
              <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3" style={{ borderColor: T.line }}>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: T.line }}>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-950">
                    <span className="text-base">🚿</span>
                    <span>Lavage Automobile</span>
                  </div>
                  <span className="text-[10px] font-bold bg-cyan-100 text-cyan-900 px-2 py-0.5 rounded-full">
                    {totLavage.nb} prestation(s)
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Chiffre d'affaires brut :</span>
                    <strong className="text-gray-900 font-mono tabular">{F(totLavage.ca)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Paiements Wave / OM :</span>
                    <strong className="text-blue-700 font-mono tabular">{F(totLavage.digitaux)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Crédits / Bons lavage :</span>
                    <strong className="text-amber-800 font-mono tabular">{F(totLavage.credit)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Dépenses propres :</span>
                    <strong className="text-gray-400 font-mono tabular">0 F</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-cyan-50 border border-cyan-200 text-center">
                  <div className="text-[10px] uppercase font-bold text-cyan-900">
                    Net en Espèces (Lavage)
                  </div>
                  <div className="text-lg font-black font-mono text-cyan-950 tabular">
                    {F(especesLavage)} F CFA
                  </div>
                </div>
              </div>

              {/* ACTIVITÉ B : BOUTIQUE & GAZ */}
              <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3" style={{ borderColor: T.line }}>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: T.line }}>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-purple-950">
                    <span className="text-base">🏪</span>
                    <span>Boutique &amp; Gaz</span>
                  </div>
                  <span className="text-[10px] font-bold bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
                    {totBoutique.nb} vente(s)
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Chiffre d'affaires brut :</span>
                    <strong className="text-gray-900 font-mono tabular">{F(totBoutique.ca)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Paiements Digitaux (Wave/OM/CB) :</span>
                    <strong className="text-blue-700 font-mono tabular">{F(totBoutique.digitaux)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Crédits accordés :</span>
                    <strong className="text-amber-800 font-mono tabular">{F(totBoutique.credit)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Dépenses propres :</span>
                    <strong className="text-gray-400 font-mono tabular">0 F</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-center">
                  <div className="text-[10px] uppercase font-bold text-purple-900">
                    Net en Espèces (Boutique)
                  </div>
                  <div className="text-lg font-black font-mono text-purple-950 tabular">
                    {F(especesBoutique)} F CFA
                  </div>
                </div>
              </div>

              {/* ACTIVITÉ C : ENTRETIEN & VIDANGE STAR CARE */}
              <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3" style={{ borderColor: T.line }}>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: T.line }}>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                    <span className="text-base">🔧</span>
                    <span>Entretien &amp; Star Care</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                    {totEntretien.nb} intervention(s)
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Chiffre d'affaires brut :</span>
                    <strong className="text-gray-900 font-mono tabular">{F(totEntretien.ca)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Paiements Digitaux / TPE :</span>
                    <strong className="text-blue-700 font-mono tabular">{F(totEntretien.digitaux)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Bons &amp; Crédits pro :</span>
                    <strong className="text-amber-800 font-mono tabular">{F(totEntretien.credit)} F</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Dépenses propres :</span>
                    <strong className="text-gray-400 font-mono tabular">0 F</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-center">
                  <div className="text-[10px] uppercase font-bold text-amber-950">
                    Net en Espèces (Entretien)
                  </div>
                  <div className="text-lg font-black font-mono text-amber-950 tabular">
                    {F(especesEntretien)} F CFA
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* SECTION 3 : DÉPENSES DE CAISSE DE LA STATION */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: T.line }}>
              <div>
                <h2 className="text-sm font-black text-rose-950 flex items-center gap-2">
                  <span>💸 3. Dépenses de la Caisse Station (Gérance)</span>
                </h2>
                <p className="text-xs text-gray-500">
                  Dépenses payées directement sur les espèces collectées avant versement en banque
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-rose-50 text-rose-900 border border-rose-200 rounded-lg">
                {totDepenses.nb} dépense(s) ({F(totDepenses.total)} F au total)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-rose-950 uppercase text-[10.5px]">
                    Dépenses Décaissées en ESPÈCES (-)
                  </div>
                  <div className="text-[11px] text-rose-800">
                    Déduites directement du versement bancaire
                  </div>
                </div>
                <div className="text-lg font-black font-mono text-rose-900 tabular">
                  -{F(depensesEspecesStation)} F
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 border flex items-center justify-between">
                <div>
                  <div className="font-bold text-gray-700 uppercase text-[10.5px]">
                    Dépenses Payées par Autres Modes
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Wave, Virement, Chèque (sans impact espèces caisse)
                  </div>
                </div>
                <div className="text-lg font-black font-mono text-gray-900 tabular">
                  {F(totDepenses.autres)} F
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* SECTION 4 : CUMUL FINAL DU NET EN ESPÈCES & DÉPÔT EN BANQUE */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl space-y-4 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
              <div>
                <h2 className="text-base font-black text-amber-400 flex items-center gap-2">
                  <span>🏦 4. Récapitulatif Consolidé &amp; Dépôt en Banque à Effectuer</span>
                </h2>
                <p className="text-xs text-gray-400">
                  Cumul des chiffres d'affaires nets en espèces de toutes les activités de la station
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-lg">
                Clôture de Caisse Journalière
              </span>
            </div>

            {/* GRAND TABLEAU RÉCAPITULATIF CROISÉ TOUTES ACTIVITÉS */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-gray-400 uppercase text-[10px] font-bold">
                    <th className="py-2.5 px-3 text-left">Activité de la Station</th>
                    <th className="py-2.5 px-3 text-right">CA Brut Total</th>
                    <th className="py-2.5 px-3 text-right">Digitaux (Wave/OM/CB)</th>
                    <th className="py-2.5 px-3 text-right">Bons &amp; Crédits</th>
                    <th className="py-2.5 px-3 text-right">Dépenses Directes</th>
                    <th className="py-2.5 px-3 text-right font-black text-amber-400 bg-slate-900">
                      NET EN ESPÈCES
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-semibold text-gray-200 flex items-center gap-2">
                      <span>⛽</span> <span>Carburant &amp; Pompes</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-300">
                      {F(caBrutCarburant)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-blue-400">
                      {F(totPompes.wave + totPompes.om + totPompes.cb + totPompes.codeElec)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-amber-400">
                      {F(totPompes.credits + totPompes.tickets + totPompes.petrosen)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-rose-400">
                      -{F(totPompes.depenses)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black tabular text-emerald-400 bg-slate-900">
                      {F(especesCarburant)} F
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-semibold text-gray-200 flex items-center gap-2">
                      <span>🚿</span> <span>Lavage Auto</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-300">
                      {F(caBrutLavage)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-blue-400">
                      {F(totLavage.digitaux)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-amber-400">
                      {F(totLavage.credit)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-500">
                      —
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black tabular text-cyan-400 bg-slate-900">
                      {F(especesLavage)} F
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-semibold text-gray-200 flex items-center gap-2">
                      <span>🏪</span> <span>Boutique &amp; Gaz</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-300">
                      {F(caBrutBoutique)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-blue-400">
                      {F(totBoutique.digitaux)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-amber-400">
                      {F(totBoutique.credit)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-500">
                      —
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black tabular text-purple-400 bg-slate-900">
                      {F(especesBoutique)} F
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-semibold text-gray-200 flex items-center gap-2">
                      <span>🔧</span> <span>Entretien &amp; Vidange (Star Care)</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-300">
                      {F(caBrutEntretien)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-blue-400">
                      {F(totEntretien.digitaux)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-amber-400">
                      {F(totEntretien.credit)} F
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular text-gray-500">
                      —
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black tabular text-amber-300 bg-slate-900">
                      {F(especesEntretien)} F
                    </td>
                  </tr>
                </tbody>

                <tfoot className="border-t-2 border-slate-700 bg-slate-900/90 font-bold">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3 uppercase text-gray-300">
                      SOUS-TOTAL ESPÈCES COLLECTÉES (TOUTES ACTIVITÉS)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm font-black tabular text-emerald-400 bg-slate-900">
                      {F(totalEspecesCollectees)} F CFA
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="py-2 px-3 text-rose-400 font-semibold italic">
                      (-) Dépenses Décaissées sur la Caisse Station (Espèces)
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm font-black tabular text-rose-400 bg-slate-900">
                      -{F(depensesEspecesStation)} F CFA
                    </td>
                  </tr>
                  <tr className="bg-amber-500/20 text-white border-t border-amber-500/50">
                    <td colSpan={5} className="py-3 px-3 uppercase text-amber-300 font-black text-sm tracking-wide">
                      🏆 TOTAL DU CHIFFRE D'AFFAIRES NET EN ESPÈCES À DÉPOSER EN BANQUE
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xl font-black tabular text-amber-300 bg-slate-900">
                      {F(netBanqueDepot)} F CFA
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* BORDEREAU DE VERSEMENT OFFICIEL BANCAIRE */}
            <div className="bg-white text-gray-900 rounded-xl p-4 border-2 border-amber-400 shadow-md space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-gray-200 gap-2">
                <div>
                  <div className="text-xs uppercase font-black text-blue-950 tracking-wider">
                    STAR ENERGY SÉNÉGAL · STATION {stationNom.toUpperCase()}
                  </div>
                  <div className="text-sm font-black text-gray-900">
                    BORDEREAU OFFICIEL DE VERSEMENT BANCAIRE EN ESPÈCES
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div>Date du versement : <strong className="font-mono">{fmtDate(date)}</strong></div>
                  <div className="text-[10px] text-gray-500">Document interne certifié FuelOS</div>
                </div>
              </div>

              {/* Détail montants */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs py-1">
                <div className="p-2 bg-gray-50 rounded border">
                  <div className="text-[10px] text-gray-500">Espèces Carburant :</div>
                  <div className="font-bold font-mono text-gray-900">{F(especesCarburant)} F</div>
                </div>
                <div className="p-2 bg-gray-50 rounded border">
                  <div className="text-[10px] text-gray-500">Espèces Lavage :</div>
                  <div className="font-bold font-mono text-gray-900">{F(especesLavage)} F</div>
                </div>
                <div className="p-2 bg-gray-50 rounded border">
                  <div className="text-[10px] text-gray-500">Espèces Boutique :</div>
                  <div className="font-bold font-mono text-gray-900">{F(especesBoutique)} F</div>
                </div>
                <div className="p-2 bg-gray-50 rounded border">
                  <div className="text-[10px] text-gray-500">Espèces Entretien :</div>
                  <div className="font-bold font-mono text-gray-900">{F(especesEntretien)} F</div>
                </div>
              </div>

              {/* Montant en toutes lettres */}
              <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-300">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700 uppercase">Montant Net en Chiffres :</span>
                  <span className="text-lg font-black font-mono text-amber-950 tabular">
                    {F(netBanqueDepot)} FRANCS CFA
                  </span>
                </div>
                <div className="text-xs text-gray-700 mt-1 italic">
                  <strong>Arrêté le présent versement à la somme de :</strong>{" "}
                  <span className="font-bold text-gray-900 underline uppercase">
                    {netBanqueDepot > 0 ? `${nombreEnLettres(netBanqueDepot)} Francs CFA` : "Zéro Franc CFA"}
                  </span>
                </div>
              </div>

              {/* Cadre de signatures */}
              <div className="grid grid-cols-2 gap-4 pt-2 text-xs text-center">
                <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg min-h-[75px] flex flex-col justify-between">
                  <span className="font-bold text-gray-600 uppercase text-[10px]">
                    Signature &amp; Cachet du Gérant de Station
                  </span>
                  <span className="text-[10px] text-gray-400">Date : {date}</span>
                </div>
                <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg min-h-[75px] flex flex-col justify-between">
                  <span className="font-bold text-gray-600 uppercase text-[10px]">
                    Accusé de Réception / Visa de la Banque
                  </span>
                  <span className="text-[10px] text-gray-400">Signature caissier banque</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────── ONGLET POMPISTES ────── */}
      {tab === "pompistes" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
            Descentes Pompistes du {fmtDate(date)} ({descentes.length})
          </h2>
          {descentes.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucune descente enregistrée pour cette date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2.5">Pompiste</th>
                    <th className="pb-2.5">Produit(s)</th>
                    <th className="pb-2.5 text-right">Vol. (L)</th>
                    <th className="pb-2.5 text-right">CA Carburant</th>
                    <th className="pb-2.5 text-right">Lubrifiants</th>
                    <th className="pb-2.5 text-right">Remise Cuve</th>
                    <th className="pb-2.5 text-right">Dépenses</th>
                    <th className="pb-2.5 text-right">Théorique</th>
                    <th className="pb-2.5 text-right">Versé</th>
                    <th className="pb-2.5 text-right">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {pompistesStats.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 font-semibold text-gray-900">{p.pompiste}</td>
                      <td className="py-2 text-gray-600 text-[11px]">{p.produit}</td>
                      <td className="py-2 text-right tabular font-bold text-blue-900">{F(p.volume)}</td>
                      <td className="py-2 text-right tabular">{F(p.caCarburant)}</td>
                      <td className="py-2 text-right tabular text-amber-700">{p.caLub > 0 ? F(p.caLub) : "—"}</td>
                      <td className="py-2 text-right tabular text-rose-700">{p.remiseCuve > 0 ? `-${F(p.remiseCuve)}` : "—"}</td>
                      <td className="py-2 text-right tabular text-rose-700" title={p.depensesMotif || undefined}>
                        {p.depenses > 0 ? F(p.depenses) : "—"}
                      </td>
                      <td className="py-2 text-right tabular font-semibold">{F(p.totalTheorique)}</td>
                      <td className="py-2 text-right tabular font-semibold text-blue-900">{F(p.totalVerse)}</td>
                      <td className={`py-2 text-right tabular font-bold ${p.ecart === 0 ? "text-gray-500" : p.ecart > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {p.ecart > 0 ? "+" : ""}{F(p.ecart)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2" style={{ borderColor: T.line }}>
                  <tr className="bg-gray-50 font-black">
                    <td className="py-2.5 text-gray-900 uppercase">TOTAL</td>
                    <td></td>
                    <td className="py-2.5 text-right tabular text-blue-900">{F(totPompes.volume)}</td>
                    <td className="py-2.5 text-right tabular">{F(totPompes.caCarburant)}</td>
                    <td className="py-2.5 text-right tabular text-amber-700">{F(totPompes.caLub)}</td>
                    <td className="py-2.5 text-right tabular text-rose-700">{totPompes.remiseCuve > 0 ? `-${F(totPompes.remiseCuve)}` : "—"}</td>
                    <td className="py-2.5 text-right tabular text-rose-700">{totPompes.depenses > 0 ? F(totPompes.depenses) : "—"}</td>
                    <td className="py-2.5 text-right tabular" style={{ color: T.petrol }}>{F(totPompes.totalTheorique)}</td>
                    <td className="py-2.5 text-right tabular text-blue-900">{F(totPompes.totalVerse)}</td>
                    <td className={`py-2.5 text-right tabular ${totPompes.ecart > 0 ? "text-emerald-700" : totPompes.ecart < 0 ? "text-rose-700" : "text-gray-500"}`}>
                      {totPompes.ecart > 0 ? "+" : ""}{F(totPompes.ecart)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Détail modes de paiement pompistes */}
          {descentes.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-xl border text-xs" style={{ borderColor: T.line }}>
              <div className="font-bold text-gray-700 mb-2 uppercase text-[11px]">Détail Encaissements Pompistes par Mode</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Espèces", val: totPompes.especes },
                  { label: "Wave", val: totPompes.wave },
                  { label: "Orange Money", val: totPompes.om },
                  { label: "Carte Bancaire", val: totPompes.cb },
                  { label: "Petrosen", val: totPompes.petrosen },
                  { label: "Code Électronique", val: totPompes.codeElec },
                  { label: "Tickets", val: totPompes.tickets },
                  { label: "Crédit / Bon", val: totPompes.credits },
                  { label: "Dépenses Pompiste", val: totPompes.depenses },
                ]
                  .filter((m) => m.val > 0)
                  .map((m) => (
                    <div key={m.label} className="flex justify-between p-1.5 bg-white rounded border" style={{ borderColor: T.line }}>
                      <span className="text-gray-600">{m.label}</span>
                      <span className="font-bold tabular text-gray-900">{F(m.val)} F</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────── ONGLET LAVAGE ────── */}
      {tab === "lavage" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
              Prestations Lavage du {fmtDate(date)} ({lavages.length})
            </h2>
            <div className="text-sm font-black text-cyan-800 bg-cyan-50 px-3 py-1 rounded-lg border border-cyan-200">
              CA Lavage : {F(totLavage.ca)} F
            </div>
          </div>
          {lavages.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucune prestation de lavage pour cette date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Référence / Véhicule</th>
                    <th className="pb-2">Type Prestation</th>
                    <th className="pb-2">Mode Paiement</th>
                    <th className="pb-2 text-right">Montant</th>
                    <th className="pb-2 text-right">Opérateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {lavages.map((l, i) => (
                    <tr key={l.id || i} className="hover:bg-gray-50">
                      <td className="py-2 font-mono text-gray-700">{l.immatriculation || l.reference || `LAV-${i + 1}`}</td>
                      <td className="py-2 text-gray-700">{l.type_prestation || l.prestation || "Lavage"}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          l.mode_paiement === "ESPECES" ? "bg-green-100 text-green-800" :
                          l.mode_paiement === "CREDIT" ? "bg-yellow-100 text-yellow-800" :
                          "bg-blue-100 text-blue-800"
                        }`}>
                          {l.mode_paiement || "ESPECES"}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold tabular text-cyan-900">{F(n(l.montant_total || l.montant || 0))} F</td>
                      <td className="py-2 text-right text-gray-500">{l.operateur || l.employe || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────── ONGLET BOUTIQUE ────── */}
      {tab === "boutique" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
              Ventes Boutique du {fmtDate(date)} ({ventesB.length})
            </h2>
            <div className="text-sm font-black text-purple-800 bg-purple-50 px-3 py-1 rounded-lg border border-purple-200">
              CA Boutique : {F(totBoutique.ca)} F
            </div>
          </div>
          {ventesB.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucune vente boutique pour cette date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Articles vendus</th>
                    <th className="pb-2">Mode Paiement</th>
                    <th className="pb-2 text-right">Montant</th>
                    <th className="pb-2 text-right">Caissier</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {ventesB.map((v, i) => (
                    <tr key={v.id || i} className="hover:bg-gray-50">
                      <td className="py-2 text-gray-700">
                        {Array.isArray(v.lignes) && v.lignes.length > 0
                          ? v.lignes.map((l) => `${l.designation || l.nom || l.code} ×${l.quantite || 1}`).join(", ")
                          : v.libelle || v.description || `Vente #${i + 1}`}
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          v.mode_paiement === "ESPECES" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {v.mode_paiement || "ESPECES"}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold tabular text-purple-900">
                        {F(n(v.montant_total || v.total || 0))} F
                      </td>
                      <td className="py-2 text-right text-gray-500">{v.caissier || v.operateur || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────── ONGLET ENTRETIEN ────── */}
      {tab === "entretien" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
              Interventions Entretien &amp; Vidange (Star Care) du {fmtDate(date)} ({entretiens.length})
            </h2>
            <div className="text-sm font-black text-amber-900 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
              CA Entretien : {F(totEntretien.ca)} F
            </div>
          </div>
          {entretiens.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">
              Aucune intervention d'entretien enregistrée pour cette date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Véhicule / Client</th>
                    <th className="pb-2">Services &amp; Pièces</th>
                    <th className="pb-2">Mode Paiement</th>
                    <th className="pb-2">Statut</th>
                    <th className="pb-2 text-right">Montant</th>
                    <th className="pb-2 text-right">Mécanicien / Opérateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {entretiens.map((e, i) => (
                    <tr key={e.id || i} className="hover:bg-gray-50">
                      <td className="py-2">
                        <div className="font-mono font-bold text-gray-900">{e.immatriculation || "Véhicule"}</div>
                        <div className="text-[10px] text-gray-500">{e.client_nom || e.marque_modele || "—"}</div>
                      </td>
                      <td className="py-2 text-gray-700 max-w-xs truncate">
                        {(e.services || []).map((s) => s.nom || s.service_nom).join(", ") || e.type_prestation || "Entretien"}
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            (e.mode_paiement || "ESPECES") === "ESPECES"
                              ? "bg-green-100 text-green-800"
                              : ["CREDIT", "BON_CARBURANT"].includes(e.mode_paiement)
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {e.mode_paiement || "ESPECES"}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                          {e.statut || "TERMINE"}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold tabular text-amber-950">
                        {F(n(e.montant_total || e.montant || 0))} F
                      </td>
                      <td className="py-2 text-right text-gray-500">{e.operateur_nom || e.technicien_nom || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────── ONGLET DÉPENSES ────── */}
      {tab === "depenses" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
              Dépenses du {fmtDate(date)} ({depenses.length})
            </h2>
            <div className="text-sm font-black text-rose-800 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200">
              Total Dépenses : {F(totDepenses.total)} F
            </div>
          </div>
          {depenses.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucune dépense enregistrée pour cette date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Catégorie</th>
                    <th className="pb-2">Libellé</th>
                    <th className="pb-2">Mode Paiement</th>
                    <th className="pb-2 text-right">Montant</th>
                    <th className="pb-2 text-right">Créé par</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {depenses.map((dep, i) => (
                    <tr key={dep.id || i} className="hover:bg-gray-50">
                      <td className="py-2 text-gray-600">{dep.categorie_code || dep.categorie || "—"}</td>
                      <td className="py-2 font-medium text-gray-900">{dep.libelle || "—"}</td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">
                          {dep.mode_paiement || "ESPECES"}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold tabular text-rose-900">{F(n(dep.montant || 0))} F</td>
                      <td className="py-2 text-right text-gray-500">{dep.cree_par || dep.operateur || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2" style={{ borderColor: T.line }}>
                  <tr className="font-black bg-rose-50">
                    <td colSpan={3} className="py-2.5 text-rose-900 uppercase">TOTAL DÉPENSES</td>
                    <td className="py-2.5 text-right tabular text-rose-900 text-sm">{F(totDepenses.total)} F</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
