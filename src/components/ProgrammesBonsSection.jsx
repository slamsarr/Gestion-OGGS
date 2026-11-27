import { useState, useMemo } from "react";
import { F, fmtDate, n, T } from "../lib/calcul";
import { badgeStatutProgramme, calculerSyntheseProgramme } from "../lib/programmes-bons";

export default function ProgrammesBonsSection({
  programmes = [],
  client = null,
  consommations = [],
  isManager = false,
  onOpenDemande,
  onOpenInstruction,
  onActiverDirect,
}) {
  const [filterStatut, setFilterStatut] = useState("TOUS");
  const [expandedProgId, setExpandedProgId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filtrage
  const programmesFiltres = useMemo(() => {
    return programmes.filter((p) => {
      if (filterStatut !== "TOUS" && p.statut !== filterStatut) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = (p.numero_programme || "").toLowerCase();
        const obj = (p.objet_demande || "").toLowerCase();
        const cl = (p.client_nom || "").toLowerCase();
        return num.includes(q) || obj.includes(q) || cl.includes(q);
      }
      return true;
    });
  }, [programmes, filterStatut, searchQuery]);

  // Statistiques consolidées
  const stats = useMemo(() => {
    let totAutorise = 0;
    let totConsomme = 0;
    let nbTrans = 0;
    let nbPassages = 0;
    let nbActifs = 0;

    programmes.forEach((p) => {
      const s = p.synthese || calculerSyntheseProgramme(p);
      totAutorise += s.total_autorise_l;
      totConsomme += s.total_consomme_l;
      nbTrans += s.nb_transporteurs;
      nbPassages += s.nb_passages;
      if (p.statut === "ACTIF") nbActifs++;
    });

    const restant = Math.max(0, totAutorise - totConsomme);
    const pct = totAutorise > 0 ? Number(((totConsomme / totAutorise) * 100).toFixed(1)) : 0;

    return {
      totAutorise,
      totConsomme,
      restant,
      pct,
      nbTrans,
      nbPassages,
      nbActifs,
    };
  }, [programmes]);

  return (
    <div className="space-y-4 text-xs">
      {/* ── KPI & TABLEAU DE BORD DE SUIVI EN DIRECT ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-slate-50 border rounded-xl border-gray-200 shadow-2xs">
          <span className="text-[10px] text-gray-500 uppercase block font-bold">1. Volume Total Autorisé</span>
          <strong className="text-gray-900 text-sm font-black tabular">{F(stats.totAutorise)} L</strong>
          <span className="text-[10px] text-gray-400 block mt-0.5">{stats.nbActifs} programme(s) actif(s)</span>
        </div>

        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-blue-900 uppercase block font-bold">2. Litres Consommés à la Pompe</span>
          <strong className="text-blue-950 text-sm font-black tabular">{F(stats.totConsomme)} L</strong>
          <span className="text-[10px] text-blue-700 block mt-0.5">{stats.pct}% de consommation</span>
        </div>

        <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-emerald-900 uppercase block font-bold">3. Solde Restant Disponible</span>
          <strong className="text-emerald-800 text-sm font-black tabular">{F(stats.restant)} L</strong>
          <span className="text-[10px] text-emerald-700 block mt-0.5">Enveloppe utilisable</span>
        </div>

        <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-purple-900 uppercase block font-bold">4. Activité Flotte</span>
          <strong className="text-purple-950 text-sm font-black tabular">{stats.nbPassages} Passages</strong>
          <span className="text-[10px] text-purple-700 block mt-0.5">{stats.nbTrans} transporteur(s) habilité(s)</span>
        </div>
      </div>

      {/* Barre d'action et filtres */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenDemande}
            className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 font-black text-slate-950 text-xs shadow-xs flex items-center gap-1.5 transition"
          >
            <span>➕ Demander un Programme de Bons</span>
          </button>

          <input
            type="search"
            placeholder="Rechercher programme, N°..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs w-44 bg-white"
          />
        </div>

        {/* Filtre de statuts */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {["TOUS", "ACTIF", "EN_ATTENTE", "INFO_DEMANDEE", "A_CORRIGER", "EPUISE", "SUSPENDU", "CLOTURE"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatut(st)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${
                filterStatut === st
                  ? "bg-gray-900 text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {st === "TOUS" ? "Tous" : st}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des programmes */}
      {programmesFiltres.length === 0 ? (
        <div className="border border-dashed rounded-2xl p-8 text-center bg-gray-50/50 space-y-2">
          <span className="text-3xl block">⛽</span>
          <p className="font-bold text-gray-800 text-sm">Aucun programme de bons trouvé.</p>
          <p className="text-gray-500 text-[11px] max-w-md mx-auto">
            {client
              ? `Le compte ${client.nom_entreprise} ne possède aucun programme correspondant aux filtres. Cliquez sur « Demander un Programme » pour formuler une nouvelle demande.`
              : "Aucun programme de bons enregistré sur cette sélection."}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onOpenDemande}
              className="px-4 py-2 rounded-xl bg-blue-900 text-white font-bold text-xs inline-flex items-center gap-1.5"
            >
              <span>➕ Formuler une première demande</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {programmesFiltres.map((p) => {
            const synthese = p.synthese || calculerSyntheseProgramme(p);
            const badge = badgeStatutProgramme(p.statut);
            const isExpanded = expandedProgId === p.id;
            const consoProg = consommations.filter((c) => c.programme_id === p.id);

            return (
              <div
                key={p.id}
                className="bg-white border rounded-2xl p-4 shadow-sm hover:border-blue-300 transition-all space-y-3"
              >
                {/* Ligne d'entête */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-sm text-blue-950 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                        {p.numero_programme}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-mono">
                        {p.produit}
                      </span>
                      <span className="text-[10px] text-gray-500 font-semibold">
                        {p.mode_gestion === "PLAFONDS_INDIVIDUELS" ? "Plafonds individuels" : "Volume global partagé"}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-gray-900 mt-1">
                      {p.objet_demande || "Programme de bons de carburant"}
                    </h3>
                    <div className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                      <span>Client : <strong className="text-gray-800">{p.client_nom}</strong></span>
                      <span>·</span>
                      <span>Validité : <strong>{fmtDate(p.date_debut)} → {fmtDate(p.date_fin)}</strong></span>
                      {p.demandeur_nom && (
                        <>
                          <span>·</span>
                          <span>Demandeur : <em>{p.demandeur_nom}</em></span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions rapides */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => onOpenInstruction(p)}
                        className="px-3 py-1.5 rounded-xl bg-blue-950 text-white font-bold text-xs hover:bg-black transition flex items-center gap-1 shadow-2xs"
                        title="Examiner, valider ou ajuster le programme"
                      >
                        <span>⚖️ Gérer / Valider</span>
                      </button>
                    )}

                    {isManager && p.statut === "VALIDE" && (
                      <button
                        type="button"
                        onClick={() => onActiverDirect(p.id)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition"
                      >
                        🟢 Activer
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedProgId(isExpanded ? null : p.id)}
                      className="px-3 py-1.5 rounded-xl border border-gray-300 bg-gray-50 text-gray-800 font-bold text-xs hover:bg-gray-100 transition"
                    >
                      {isExpanded ? "▲ Masquer Détail" : "▼ Détail & Flotte"}
                    </button>
                  </div>
                </div>

                {/* Synthèse volumétrique & Barre de consommation */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 bg-slate-50 rounded-lg border border-gray-200">
                    <span className="text-[10px] text-gray-500 uppercase block font-semibold">Total Autorisé</span>
                    <strong className="text-gray-900 text-sm font-black tabular">{F(synthese.total_autorise_l)} L</strong>
                  </div>
                  <div className="p-2 bg-blue-50/50 rounded-lg border border-blue-200">
                    <span className="text-[10px] text-blue-900 uppercase block font-semibold">Consommé à ce jour</span>
                    <strong className="text-blue-950 text-sm font-black tabular">{F(synthese.total_consomme_l)} L</strong>
                  </div>
                  <div className="p-2 bg-emerald-50/50 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-emerald-900 uppercase block font-semibold">Solde Restant</span>
                    <strong className={`text-sm font-black tabular ${synthese.volume_restant_l <= 0 ? "text-purple-700" : "text-emerald-800"}`}>
                      {F(synthese.volume_restant_l)} L
                    </strong>
                  </div>
                  <div className="p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-[10px] text-gray-500 uppercase block font-semibold">Flotte &amp; Passages</span>
                    <strong className="text-gray-900 text-sm font-black tabular">
                      {synthese.nb_transporteurs} véh. / {synthese.nb_passages} serv.
                    </strong>
                  </div>
                </div>

                {/* Jauge de progression */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-gray-600">
                    <span>Avancement de consommation du programme :</span>
                    <span className="font-mono font-bold text-blue-950">{synthese.pct_consommation}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        synthese.pct_consommation >= 100
                          ? "bg-purple-600"
                          : synthese.pct_consommation >= 80
                          ? "bg-amber-500"
                          : "bg-emerald-600"
                      }`}
                      style={{ width: `${Math.min(100, synthese.pct_consommation)}%` }}
                    />
                  </div>
                </div>

                {/* Conditions particulières / Remarques */}
                {p.conditions_particulieres && (
                  <div className="p-2 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-950">
                    <strong>Conditions d'approvisionnement :</strong> {p.conditions_particulieres}
                  </div>
                )}

                {/* ── VOLET DÉROULANT : DÉTAIL TRANSPORTEURS & JOURNAL DES DISTRIBUTIONS ── */}
                {isExpanded && (
                  <div className="pt-3 border-t space-y-4 animate-in fade-in duration-200">
                    {/* Tableau des transporteurs habilités */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-xs text-gray-900 uppercase tracking-wider">
                          Transporteurs &amp; Véhicules Autorisés sur ce Programme ({synthese.transporteurs.length}) :
                        </span>
                      </div>

                      <div className="overflow-x-auto border rounded-xl">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 text-gray-700">
                            <tr>
                              <th className="p-2 text-left">Immatriculation</th>
                              <th className="p-2 text-left">Chauffeur</th>
                              <th className="p-2 text-left">Téléphone</th>
                              <th className="p-2 text-left">Type Véhicule</th>
                              <th className="p-2 text-right">Quota Alloué</th>
                              <th className="p-2 text-right">Consommé</th>
                              <th className="p-2 text-right">Solde Restant</th>
                              <th className="p-2 text-center">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {synthese.transporteurs.map((t, tIdx) => (
                              <tr key={t.id || tIdx} className="hover:bg-gray-50">
                                <td className="p-2 font-mono font-bold text-gray-900">{t.immatriculation || "--"}</td>
                                <td className="p-2 font-semibold">{t.nom_prenom || "--"}</td>
                                <td className="p-2 font-mono text-gray-600">{t.telephone || "—"}</td>
                                <td className="p-2 text-gray-600">{t.type_vehicule || "CAMION"}</td>
                                <td className="p-2 text-right font-black tabular text-blue-950">
                                  {p.mode_gestion === "PLAFONDS_INDIVIDUELS" ? `${F(t.volume_alloue_l)} L` : "Global"}
                                </td>
                                <td className="p-2 text-right font-bold tabular text-blue-900">
                                  {F(t.volume_consomme_l)} L
                                </td>
                                <td className="p-2 text-right font-black tabular text-emerald-800">
                                  {p.mode_gestion === "PLAFONDS_INDIVIDUELS" ? `${F(t.volume_restant_l)} L` : `${F(synthese.volume_restant_l)} L`}
                                </td>
                                <td className="p-2 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    t.actif !== false ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                  }`}>
                                    {t.actif !== false ? "✓ Habilité" : "Suspendu"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Journal des passages réels à la pompe */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-xs text-gray-900 uppercase tracking-wider">
                          Historique des Consommations Réelles à la Pompe ({consoProg.length} passage{consoProg.length > 1 ? "s" : ""}) :
                        </span>
                        <span className="text-[10px] text-gray-500 italic">
                          Données issues de la distribution réelle aux pompes
                        </span>
                      </div>

                      {consoProg.length === 0 ? (
                        <p className="text-gray-400 py-4 text-center italic bg-gray-50 rounded-xl border border-dashed">
                          Aucune prise de carburant enregistrée à ce jour pour ce programme.
                        </p>
                      ) : (
                        <div className="overflow-x-auto border rounded-xl">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 text-gray-700">
                              <tr>
                                <th className="p-2 text-left">Date</th>
                                <th className="p-2 text-left">Véhicule</th>
                                <th className="p-2 text-left">Chauffeur</th>
                                <th className="p-2 text-left">Pompiste</th>
                                <th className="p-2 text-left">N° Bon</th>
                                <th className="p-2 text-right">Litres Servis</th>
                                <th className="p-2 text-right">Solde Restant Après</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {consoProg.map((c, cIdx) => (
                                <tr key={c.id || cIdx} className="hover:bg-gray-50">
                                  <td className="p-2 font-medium">{fmtDate(c.date)}</td>
                                  <td className="p-2 font-mono font-bold text-gray-900">{c.immatriculation || "--"}</td>
                                  <td className="p-2">{c.transporteur_nom || "--"}</td>
                                  <td className="p-2 text-gray-600">{c.pompiste_nom || "--"}</td>
                                  <td className="p-2 font-mono font-bold text-blue-900">{c.numero_bon || "--"}</td>
                                  <td className="p-2 text-right font-black tabular text-blue-950 text-sm">
                                    {F(c.volume_litres)} L
                                  </td>
                                  <td className="p-2 text-right font-black tabular text-emerald-800">
                                    {F(c.solde_apres_l)} L
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
