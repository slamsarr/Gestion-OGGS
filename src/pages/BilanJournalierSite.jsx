import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listDescentes,
  listPrestationsLavage,
  listVentesBoutique,
  listDepenses,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
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

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("synthese"); // synthese | pompistes | lavage | boutique | depenses

  const [descentes, setDescentes] = useState([]);
  const [lavages, setLavages] = useState([]);
  const [ventesB, setVentesB] = useState([]);
  const [depenses, setDepenses] = useState([]);

  const loadAll = async (d) => {
    setLoading(true);
    try {
      const [des, lav, vb, dep] = await Promise.all([
        listDescentes(stationId, d).catch(() => []),
        listPrestationsLavage(stationId, d).catch(() => []),
        listVentesBoutique(stationId, d).catch(() => []),
        listDepenses(stationId, d).catch(() => []),
      ]);
      setDescentes((des || []).map(normalizeDescente).filter(Boolean));
      setLavages(lav || []);
      setVentesB(vb || []);
      setDepenses(dep || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(date);
  }, [date, stationId]);

  // ────────────────── CALCULS POMPISTES ──────────────────
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
      const totalVerse = especes + wave + om + cb + petrosen + codeElec + tickets + credits + depensesPompiste;
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
          volume: 0, caCarburant: 0, caLub: 0, remiseCuve: 0, depenses: 0,
          totalTheorique: 0, especes: 0, wave: 0, om: 0, cb: 0,
          petrosen: 0, codeElec: 0, tickets: 0, credits: 0,
          totalVerse: 0, ecart: 0,
        }
      ),
    [pompistesStats]
  );

  // ────────────────── CALCULS LAVAGE ──────────────────
  const totLavage = useMemo(
    () => ({
      nb: lavages.length,
      ca: lavages.reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0),
      especes: lavages.filter((l) => l.mode_paiement === "ESPECES").reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0),
      mobile: lavages.filter((l) => ["WAVE", "OM"].includes(l.mode_paiement)).reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0),
      credit: lavages.filter((l) => l.mode_paiement === "CREDIT").reduce((s, l) => s + n(l.montant_total || l.montant || 0), 0),
    }),
    [lavages]
  );

  // ────────────────── CALCULS BOUTIQUE ──────────────────
  const totBoutique = useMemo(
    () => ({
      nb: ventesB.length,
      ca: ventesB.reduce((s, v) => s + n(v.montant_total || v.total || 0), 0),
      especes: ventesB.filter((v) => v.mode_paiement === "ESPECES").reduce((s, v) => s + n(v.montant_total || v.total || 0), 0),
      mobile: ventesB.filter((v) => ["WAVE", "OM"].includes(v.mode_paiement)).reduce((s, v) => s + n(v.montant_total || v.total || 0), 0),
    }),
    [ventesB]
  );

  // ────────────────── CALCULS DÉPENSES ──────────────────
  const totDepenses = useMemo(
    () => ({
      nb: depenses.length,
      total: depenses.reduce((s, d) => s + n(d.montant || 0), 0),
    }),
    [depenses]
  );

  // ────────────────── KPIs GLOBAUX ──────────────────
  const caGlobalSite = totPompes.caCarburant + totPompes.caLub + totLavage.ca + totBoutique.ca;
  const especes_global = totPompes.especes + totLavage.especes + totBoutique.especes;
  const mobile_global = totPompes.wave + totPompes.om + totLavage.mobile + totBoutique.mobile;
  const cb_global = totPompes.cb;
  const petrosen_global = totPompes.petrosen;
  const codeElec_global = totPompes.codeElec;
  const tickets_global = totPompes.tickets;
  const credits_global = totPompes.credits;
  const ecart_global = totPompes.ecart;
  const netBanque = especes_global - totDepenses.total;

  const TABS = [
    { id: "synthese", label: "📊 Synthèse Jour", count: null },
    { id: "pompistes", label: "⛽ Pompistes", count: descentes.length },
    { id: "lavage", label: "🚿 Lavage", count: lavages.length },
    { id: "boutique", label: "🏪 Boutique", count: ventesB.length },
    { id: "depenses", label: "💸 Dépenses", count: depenses.length },
  ];

  const KPI = ({ label, value, color = "text-gray-900", sub }) => (
    <div className="bg-white rounded-xl border p-3 shadow-xs text-center flex flex-col items-center justify-center gap-0.5" style={{ borderColor: T.line }}>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={`text-lg font-black tabular leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
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

      {/* ────── ONGLET SYNTHÈSE ────── */}
      {tab === "synthese" && (
        <div className="space-y-4">
          {/* KPIs Principaux */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="CA Global Site" value={`${F(caGlobalSite)} F`} color="text-indigo-900" sub="Carburant + Lub + Lavage + Boutique" />
            <KPI label="Volume Carburant" value={`${F(totPompes.volume)} L`} color="text-blue-900" sub={`${descentes.length} pompiste(s)`} />
            <KPI label="Net Caisse Espèces" value={`${F(netBanque)} F`} color={netBanque >= 0 ? "text-emerald-700" : "text-rose-700"} sub={`Espèces − Dépenses`} />
            <KPI
              label="Écart Caisse Pompistes"
              value={`${totPompes.ecart >= 0 ? "+" : ""}${F(totPompes.ecart)} F`}
              color={Math.abs(totPompes.ecart) < 1000 ? "text-emerald-700" : "text-rose-700"}
              sub="Versé vs Théorique"
            />
          </div>

          {/* Détail CA par activité */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
              Répartition du CA par Activité
            </h2>
            <div className="space-y-2 text-xs">
              {[
                { label: "⛽ Carburant (pompistes)", value: totPompes.caCarburant, color: "bg-blue-500" },
                { label: "🛢️ Lubrifiants (pompistes)", value: totPompes.caLub, color: "bg-amber-500" },
                { label: "🚿 Lavage", value: totLavage.ca, color: "bg-cyan-500" },
                { label: "🏪 Boutique", value: totBoutique.ca, color: "bg-purple-500" },
              ].map((item) => {
                const pct = caGlobalSite > 0 ? (item.value / caGlobalSite) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="font-bold tabular">{F(item.value)} F ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Récapitulatif Modes de Paiement */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
              Réconciliation des Modes de Paiement
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500" style={{ borderColor: T.line }}>
                    <th className="pb-2 text-left">Mode de Paiement</th>
                    <th className="pb-2 text-right">Pompistes</th>
                    <th className="pb-2 text-right">Lavage</th>
                    <th className="pb-2 text-right">Boutique</th>
                    <th className="pb-2 text-right font-black text-gray-900">TOTAL SITE</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {[
                    { label: "💵 Espèces", pompe: totPompes.especes, lav: totLavage.especes, bou: totBoutique.especes },
                    { label: "📱 Wave", pompe: totPompes.wave, lav: lavages.filter(l => l.mode_paiement === "WAVE").reduce((s,l) => s + n(l.montant_total||l.montant||0), 0), bou: ventesB.filter(v => v.mode_paiement === "WAVE").reduce((s,v) => s + n(v.montant_total||v.total||0), 0) },
                    { label: "📱 Orange Money", pompe: totPompes.om, lav: lavages.filter(l => l.mode_paiement === "OM").reduce((s,l) => s + n(l.montant_total||l.montant||0), 0), bou: ventesB.filter(v => v.mode_paiement === "OM").reduce((s,v) => s + n(v.montant_total||v.total||0), 0) },
                    { label: "💳 Carte Bancaire", pompe: totPompes.cb, lav: 0, bou: 0 },
                    { label: "🛢️ Paiement Petrosen", pompe: totPompes.petrosen, lav: 0, bou: 0 },
                    { label: "📟 Code Électronique", pompe: totPompes.codeElec, lav: 0, bou: 0 },
                    { label: "🎫 Tickets", pompe: totPompes.tickets, lav: 0, bou: 0 },
                    { label: "📋 Crédit / Bon", pompe: totPompes.credits, lav: totLavage.credit, bou: 0 },
                    { label: "💸 Dépenses Pompiste (Justif.)", pompe: totPompes.depenses, lav: 0, bou: 0 },
                  ].map((row) => {
                    const total = row.pompe + row.lav + row.bou;
                    if (total === 0) return null;
                    return (
                      <tr key={row.label} className="hover:bg-gray-50">
                        <td className="py-2 font-medium text-gray-800">{row.label}</td>
                        <td className="py-2 text-right tabular text-gray-600">{row.pompe > 0 ? `${F(row.pompe)} F` : "—"}</td>
                        <td className="py-2 text-right tabular text-gray-600">{row.lav > 0 ? `${F(row.lav)} F` : "—"}</td>
                        <td className="py-2 text-right tabular text-gray-600">{row.bou > 0 ? `${F(row.bou)} F` : "—"}</td>
                        <td className="py-2 text-right tabular font-black text-gray-900">{F(total)} F</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2" style={{ borderColor: T.line }}>
                  <tr className="bg-gray-50">
                    <td className="py-2.5 font-black text-gray-900 uppercase">TOTAL JUSTIFIÉ / ENCAISSÉ</td>
                    <td className="py-2.5 text-right font-black text-blue-900 tabular">{F(totPompes.totalVerse)} F</td>
                    <td className="py-2.5 text-right font-black text-blue-900 tabular">{F(totLavage.ca)} F</td>
                    <td className="py-2.5 text-right font-black text-blue-900 tabular">{F(totBoutique.ca)} F</td>
                    <td className="py-2.5 text-right font-black text-lg tabular" style={{ color: T.petrol }}>
                      {F(totPompes.totalVerse + totLavage.ca + totBoutique.ca)} F
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Bilan Caisse Journalier */}
          <div className="bg-slate-900 rounded-xl p-4 text-white">
            <h2 className="text-sm font-black text-amber-400 mb-3">BILAN CAISSE FINAL DU SITE</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-xl bg-slate-800">
                <div className="text-[10px] text-gray-400 uppercase mb-1">Total Espèces Site</div>
                <div className="text-2xl font-black text-amber-400 tabular">{F(especes_global)} F</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800">
                <div className="text-[10px] text-gray-400 uppercase mb-1">(-) Dépenses Caisse Centrale</div>
                <div className="text-2xl font-black text-rose-400 tabular">-{F(totDepenses.total)} F</div>
                <div className="text-[11px] text-gray-500">{totDepenses.nb} dépense(s)</div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/50">
                <div className="text-[10px] text-amber-300 uppercase mb-1">NET À DÉPOSER EN BANQUE</div>
                <div className={`text-2xl font-black tabular ${netBanque >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {F(netBanque)} F
                </div>
              </div>
            </div>

            {/* Résumé écart pompistes */}
            <div className="mt-4 pt-3 border-t border-slate-700 text-xs flex flex-wrap gap-4 text-gray-400">
              <span>
                Écart caisse pompistes :{" "}
                <strong className={totPompes.ecart === 0 ? "text-emerald-400" : Math.abs(totPompes.ecart) < 5000 ? "text-amber-400" : "text-rose-400"}>
                  {totPompes.ecart >= 0 ? "+" : ""}{F(totPompes.ecart)} F
                </strong>
              </span>
              <span>Remises cuves déduites : <strong className="text-amber-400">{F(totPompes.remiseCuve)} F</strong></span>
              <span>Dépenses pompistes : <strong className="text-rose-400">{F(totPompes.depenses)} F</strong></span>
              <span>Paiements électroniques : <strong className="text-blue-400">{F(mobile_global + cb_global + petrosen_global + codeElec_global + tickets_global)} F</strong></span>
              <span>Crédit accordé : <strong className="text-yellow-400">{F(credits_global + totLavage.credit)} F</strong></span>
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
