import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listDescentes,
  listRemboursementsEcarts,
  saveRemboursementEcart,
  deleteRemboursementEcart,
  loadReferentiel,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { exporterCsv } from "../lib/exportExcel";
import { Loading } from "../components/ui";
import { normalizeDescente } from "./DescentePompiste";

export default function SuiviEcarts() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || "Station Hann Maristes";

  const [loading, setLoading] = useState(true);
  const [descentes, setDescentes] = useState([]);
  const [remboursements, setRemboursements] = useState([]);
  const [ref, setRef] = useState(null);

  // Filtres
  const [activeTab, setActiveTab] = useState("operateurs"); // "operateurs" | "journal" | "historique"
  const [filterActivite, setFilterActivite] = useState("TOUTES"); // TOUTES | CARBURANT | LAVAGE | BOUTIQUE | ENTRETIEN
  const [filterStatut, setFilterStatut] = useState("TOUS"); // TOUS | NON_SOLDE | SOLDE
  const [searchOperateur, setSearchOperateur] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  // Modal Remboursement
  const [modalOpen, setModalOpen] = useState(false);
  const [savingRemb, setSavingRemb] = useState(false);
  const [rembForm, setRembForm] = useState({
    operateur_id: "",
    operateur_nom: "",
    role_operateur: "pompiste",
    activite: "CARBURANT",
    montant: "",
    mode_paiement: "ESPECES",
    date: todayISO(),
    motif: "",
    reference: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [des, rembs, referentiel] = await Promise.all([
        listDescentes(stationId).catch(() => []),
        listRemboursementsEcarts(stationId).catch(() => []),
        loadReferentiel().catch(() => null),
      ]);
      setDescentes((des || []).map(normalizeDescente).filter(Boolean));
      setRemboursements(rembs || []);
      setRef(referentiel);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  // Ouvrir le modal pré-rempli pour un opérateur
  const openModalForOperateur = (op) => {
    setRembForm({
      operateur_id: op.id || "",
      operateur_nom: op.nom || "",
      role_operateur: op.role || "pompiste",
      activite: op.activite || "CARBURANT",
      montant: op.resteDu > 0 ? String(op.resteDu) : "",
      mode_paiement: "ESPECES",
      date: todayISO(),
      motif: `Régularisation manquant ${op.nom}`,
      reference: "",
    });
    setModalOpen(true);
  };

  const handleSaveRemboursement = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const mt = n(rembForm.montant);
    if (!rembForm.operateur_nom.trim()) {
      alert("Veuillez saisir le nom de l'opérateur.");
      return;
    }
    if (mt <= 0) {
      alert("Veuillez saisir un montant valide (> 0).");
      return;
    }

    setSavingRemb(true);
    try {
      await saveRemboursementEcart({
        station_id: stationId,
        date: rembForm.date || todayISO(),
        operateur_id: rembForm.operateur_id || rembForm.operateur_nom.toLowerCase().replace(/\s+/g, "_"),
        operateur_nom: rembForm.operateur_nom.trim(),
        role_operateur: rembForm.role_operateur,
        activite: rembForm.activite,
        montant: mt,
        mode_paiement: rembForm.mode_paiement,
        motif: rembForm.motif,
        reference: rembForm.reference,
      });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setSavingRemb(false);
    }
  };

  const handleDeleteRemboursement = async (id) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet enregistrement de remboursement ?")) return;
    try {
      await deleteRemboursementEcart(id);
      await loadData();
    } catch (err) {
      alert("Erreur lors de la suppression : " + err.message);
    }
  };

  // ────────────────── ANALYSE DES ÉCARTS PAR OPÉRATEUR ──────────────────
  const ecartsParOperateur = useMemo(() => {
    const map = new Map();

    // 1. Écarts constatés sur les descentes de carburant
    for (const d of descentes) {
      if (dateDebut && d.date < dateDebut) continue;
      if (dateFin && d.date > dateFin) continue;

      const pNom = d.pompiste_nom || d.pompiste || "Pompiste non identifié";
      const pId = d.pompiste_id || pNom.toLowerCase().replace(/\s+/g, "_");

      if (!map.has(pId)) {
        map.set(pId, {
          id: pId,
          nom: pNom,
          role: "pompiste",
          activite: "CARBURANT",
          nbQuarts: 0,
          nbEcarts: 0,
          totalManquants: 0, // montants négatifs cumulés
          totalExcedents: 0, // montants positifs cumulés
          totalRembourse: 0,
          detailsEcarts: [],
        });
      }

      const op = map.get(pId);
      op.nbQuarts += 1;

      // Calcul écart de la descente
      let caTheorique = 0;
      for (const p of d.pompes || []) {
        const ideb = n(p.index_debut ?? p.index_depart ?? 0);
        const ifin = n(p.index_fin ?? 0);
        const vol = n(p.volume_vendu ?? (ifin >= ideb ? ifin - ideb : 0));
        const pu = n(p.prix_unitaire ?? 0);
        caTheorique += n(p.montant ?? vol * pu);
      }
      for (const l of d.lubrifiants_lignes || []) {
        caTheorique += n(l.total ?? n(l.qte) * n(l.prix_unitaire));
      }

      const enc = d.encaissements || {};
      const totJustifie =
        n(d.especes ?? enc.especes) +
        n(d.wave ?? enc.wave) +
        n(d.orange_money ?? d.om ?? enc.orange_money ?? enc.om) +
        n(d.carte_bancaire ?? d.cb ?? d.tpe ?? enc.carte_bancaire ?? enc.cb) +
        n(d.cheques ?? enc.cheques) +
        n(d.bons ?? d.credits ?? enc.bons ?? enc.credits) +
        n(d.tickets ?? enc.tickets) +
        n(d.petrosen ?? enc.petrosen) +
        n(d.code_electronique ?? enc.code_electronique) +
        n(d.autre ?? enc.autre) +
        n(d.depenses ?? enc.depenses) +
        n(d.remise_cuve ?? enc.remise_cuve);

      const ecart = totJustifie - caTheorique;

      if (Math.abs(ecart) > 50) {
        op.nbEcarts += 1;
        if (ecart < 0) {
          op.totalManquants += Math.abs(ecart);
        } else {
          op.totalExcedents += ecart;
        }
        op.detailsEcarts.push({
          date: d.date,
          activite: "CARBURANT",
          caTheorique,
          totJustifie,
          ecart,
          descenteId: d.id,
        });
      }
    }

    // 2. Associer les remboursements enregistrés
    for (const r of remboursements) {
      if (dateDebut && r.date < dateDebut) continue;
      if (dateFin && r.date > dateFin) continue;

      const rNom = r.operateur_nom || "Opérateur";
      const rId = r.operateur_id || rNom.toLowerCase().replace(/\s+/g, "_");

      if (!map.has(rId)) {
        map.set(rId, {
          id: rId,
          nom: rNom,
          role: r.role_operateur || "opérateur",
          activite: r.activite || "CARBURANT",
          nbQuarts: 0,
          nbEcarts: 0,
          totalManquants: 0,
          totalExcedents: 0,
          totalRembourse: 0,
          detailsEcarts: [],
        });
      }

      const op = map.get(rId);
      op.totalRembourse += n(r.montant || 0);
    }

    // Calcul reste dû et statut
    const list = Array.from(map.values()).map((op) => {
      const resteDu = Math.max(0, op.totalManquants - op.totalRembourse);
      const solde = resteDu === 0;
      return {
        ...op,
        resteDu,
        solde,
      };
    });

    return list.sort((a, b) => b.resteDu - a.resteDu);
  }, [descentes, remboursements, dateDebut, dateFin]);

  // Filtrage de la liste opérateurs
  const operateursFiltres = useMemo(() => {
    return ecartsParOperateur.filter((op) => {
      if (filterActivite !== "TOUTES" && op.activite !== filterActivite) return false;
      if (filterStatut === "NON_SOLDE" && op.resteDu <= 0) return false;
      if (filterStatut === "SOLDE" && op.resteDu > 0) return false;
      if (searchOperateur && !op.nom.toLowerCase().includes(searchOperateur.toLowerCase())) return false;
      return true;
    });
  }, [ecartsParOperateur, filterActivite, filterStatut, searchOperateur]);

  // Filtrage du journal des remboursements
  const journalRemboursementsFiltre = useMemo(() => {
    return remboursements.filter((r) => {
      if (dateDebut && r.date < dateDebut) return false;
      if (dateFin && r.date > dateFin) return false;
      if (filterActivite !== "TOUTES" && r.activite !== filterActivite) return false;
      if (searchOperateur && !r.operateur_nom.toLowerCase().includes(searchOperateur.toLowerCase())) return false;
      return true;
    });
  }, [remboursements, dateDebut, dateFin, filterActivite, searchOperateur]);

  // KPIs Généraux
  const kpis = useMemo(() => {
    let totManquants = 0;
    let totExcedents = 0;
    let totRembourse = 0;

    for (const op of ecartsParOperateur) {
      totManquants += op.totalManquants;
      totExcedents += op.totalExcedents;
      totRembourse += op.totalRembourse;
    }

    const resteDuGlobal = Math.max(0, totManquants - totRembourse);

    return {
      totManquants,
      totExcedents,
      totRembourse,
      resteDuGlobal,
      tauxRecouvrement: totManquants > 0 ? Math.min(100, Math.round((totRembourse / totManquants) * 100)) : 100,
    };
  }, [ecartsParOperateur]);

  // Export Excel
  const handleExportJournal = () => {
    const entetes = ["Date", "Opérateur", "Rôle", "Activité", "Mode Règlement", "Montant (FCFA)", "Motif", "Référence"];
    const lignes = journalRemboursementsFiltre.map((r) => [
      r.date,
      r.operateur_nom,
      r.role_operateur,
      r.activite,
      r.mode_paiement,
      r.montant,
      r.motif || "",
      r.reference || "",
    ]);
    exporterCsv(`JOURNAL_REMBOURSEMENTS_ECARTS_${stationId}_${todayISO()}.xlsx`, [entetes, ...lignes]);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-5 pb-12">
      {/* ── EN-TÊTE DE LA PAGE ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b gap-3" style={{ borderColor: T.line }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <span>⚖️</span>
              <span>Suivi des Écarts &amp; Remboursements Opérateurs</span>
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
              Station {stationNom}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Tableau de bord financier pour le suivi des manquants, excédents et encaissements des remboursements opérateurs
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportJournal}
            className="px-3 py-2 rounded-lg border text-xs font-bold text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 shadow-2xs"
            style={{ borderColor: T.line }}
          >
            <span>📥</span>
            <span>Exporter Excel</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRembForm({
                operateur_id: "",
                operateur_nom: "",
                role_operateur: "pompiste",
                activite: "CARBURANT",
                montant: "",
                mode_paiement: "ESPECES",
                date: todayISO(),
                motif: "",
                reference: "",
              });
              setModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span>➕</span>
            <span>Enregistrer un Remboursement</span>
          </button>
        </div>
      </div>

      {/* ── 4 GRANDS INDICATEURS CLÉS (KPIS) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border bg-rose-50/70 border-rose-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center justify-between">
            <span>🔴 Total Manquants Constatés</span>
          </div>
          <div className="text-xl font-black font-mono text-rose-950 tabular">
            {F(kpis.totManquants)} F CFA
          </div>
          <div className="text-[10px] text-rose-700">
            Déficits constatés sur les caisses
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-emerald-50/70 border-emerald-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
            <span>🟢 Total Remboursé</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
              {kpis.tauxRecouvrement}%
            </span>
          </div>
          <div className="text-xl font-black font-mono text-emerald-950 tabular">
            {F(kpis.totRembourse)} F CFA
          </div>
          <div className="text-[10px] text-emerald-700">
            {remboursements.length} versement(s) encaissé(s)
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-amber-50/80 border-amber-300 shadow-2xs space-y-1 ring-1 ring-amber-300">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center justify-between">
            <span>⚠️ Reste Dû aux Caisses</span>
          </div>
          <div className="text-xl font-black font-mono text-amber-950 tabular">
            {F(kpis.resteDuGlobal)} F CFA
          </div>
          <div className="text-[10px] text-amber-800 font-semibold">
            {kpis.resteDuGlobal === 0 ? "✓ Toutes les créances sont soldées" : "Créances opérateurs à recouvrer"}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-blue-50/70 border-blue-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center justify-between">
            <span>🔵 Excédents Constatés</span>
          </div>
          <div className="text-xl font-black font-mono text-blue-950 tabular">
            {F(kpis.totExcedents)} F CFA
          </div>
          <div className="text-[10px] text-blue-700">
            Surplus versés en caisse
          </div>
        </div>
      </div>

      {/* ── BARRE DE FILTRES ET RECHERCHE ── */}
      <div className="bg-white p-3.5 rounded-xl border shadow-2xs flex flex-wrap items-center gap-3 text-xs" style={{ borderColor: T.line }}>
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchOperateur}
            onChange={(e) => setSearchOperateur(e.target.value)}
            placeholder="🔍 Rechercher un opérateur par nom..."
            className="w-full border rounded-lg p-2 bg-gray-50 text-gray-900 border-gray-300"
          />
        </div>

        <div>
          <select
            value={filterActivite}
            onChange={(e) => setFilterActivite(e.target.value)}
            className="border rounded-lg p-2 font-semibold bg-white text-gray-900 border-gray-300"
          >
            <option value="TOUTES">Toutes Activités</option>
            <option value="CARBURANT">⛽ Carburant</option>
            <option value="LAVAGE">🚿 Lavage</option>
            <option value="BOUTIQUE">🏪 Boutique</option>
            <option value="ENTRETIEN">🔧 Entretien</option>
          </select>
        </div>

        <div>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="border rounded-lg p-2 font-semibold bg-white text-gray-900 border-gray-300"
          >
            <option value="TOUS">Tous Statuts</option>
            <option value="NON_SOLDE">🔴 Avec Reste Dû (&gt; 0)</option>
            <option value="SOLDE">🟢 Soldés (0 F)</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 font-medium">Période :</span>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="border rounded-lg p-1.5 bg-white text-gray-900 border-gray-300"
          />
          <span className="text-gray-400">à</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="border rounded-lg p-1.5 bg-white text-gray-900 border-gray-300"
          />
          {(dateDebut || dateFin) && (
            <button
              type="button"
              onClick={() => { setDateDebut(""); setDateFin(""); }}
              className="text-gray-500 hover:text-gray-800 font-bold px-1.5 py-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── ONGLETS DE NAVIGATION ── */}
      <div className="flex border-b text-xs font-bold" style={{ borderColor: T.line }}>
        <button
          type="button"
          onClick={() => setActiveTab("operateurs")}
          className={`py-2 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "operateurs"
              ? "border-teal-700 text-teal-800 font-black bg-teal-50/50"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <span>👥 Situation par Opérateur</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-200 text-gray-800 font-bold">
            {operateursFiltres.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("journal")}
          className={`py-2 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "journal"
              ? "border-teal-700 text-teal-800 font-black bg-teal-50/50"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <span>💵 Journal des Remboursements</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-200 text-gray-800 font-bold">
            {journalRemboursementsFiltre.length}
          </span>
        </button>
      </div>

      {/* ── VUE 1 : SITUATION PAR OPÉRATEUR ── */}
      {activeTab === "operateurs" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: T.line }}>
          {operateursFiltres.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              Aucun opérateur correspondant aux critères de recherche.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b text-gray-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Opérateur</th>
                    <th className="py-2.5 px-3 text-left">Rôle / Activité</th>
                    <th className="py-2.5 px-3 text-center">Quarts avec Écart</th>
                    <th className="py-2.5 px-3 text-right">Manquants Constatés</th>
                    <th className="py-2.5 px-3 text-right">Total Remboursé</th>
                    <th className="py-2.5 px-3 text-right font-black text-amber-900">Reste Dû</th>
                    <th className="py-2.5 px-3 text-center">Statut</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {operateursFiltres.map((op) => (
                    <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 font-bold text-gray-900">
                        {op.nom}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        <span className="capitalize">{op.role}</span> · <span className="font-semibold text-gray-800">{op.activite}</span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono tabular text-gray-700">
                        {op.nbEcarts} / {op.nbQuarts}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular font-bold text-rose-700">
                        {op.totalManquants > 0 ? `-${F(op.totalManquants)} F` : "0 F"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular font-bold text-emerald-700">
                        {op.totalRembourse > 0 ? `+${F(op.totalRembourse)} F` : "0 F"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular font-black text-sm">
                        <span className={op.resteDu > 0 ? "text-amber-950 font-black" : "text-gray-400"}>
                          {F(op.resteDu)} F
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {op.resteDu === 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Soldé
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            Déficit en cours
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => openModalForOperateur(op)}
                          className="px-2.5 py-1 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] shadow-2xs transition-colors"
                        >
                          Rembourser
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── VUE 2 : JOURNAL CHRONOLOGIQUE DES REMBOURSEMENTS ── */}
      {activeTab === "journal" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: T.line }}>
          {journalRemboursementsFiltre.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              Aucun remboursement enregistré pour les filtres sélectionnés.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b text-gray-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Date</th>
                    <th className="py-2.5 px-3 text-left">Opérateur</th>
                    <th className="py-2.5 px-3 text-left">Rôle &amp; Activité</th>
                    <th className="py-2.5 px-3 text-left">Mode de Règlement</th>
                    <th className="py-2.5 px-3 text-left">Motif / Référence</th>
                    <th className="py-2.5 px-3 text-right font-black text-teal-900">Montant Encaissé</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {journalRemboursementsFiltre.map((remb) => (
                    <tr key={remb.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 font-mono text-gray-900 font-bold whitespace-nowrap">
                        {fmtDate(remb.date)}
                      </td>
                      <td className="py-2 px-3 font-bold text-gray-900">
                        {remb.operateur_nom}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        <span className="capitalize">{remb.role_operateur}</span> · <span className="font-semibold text-gray-800">{remb.activite}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          remb.mode_paiement === "ESPECES" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                          remb.mode_paiement === "WAVE" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                          remb.mode_paiement === "OM" ? "bg-orange-100 text-orange-800 border border-orange-200" :
                          "bg-purple-100 text-purple-800 border border-purple-200"
                        }`}>
                          {remb.mode_paiement}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-600 max-w-xs truncate">
                        {remb.motif || "Régularisation écart"} {remb.reference ? `(Réf: ${remb.reference})` : ""}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-emerald-700 tabular text-sm">
                        +{F(remb.montant)} F
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRemboursement(remb.id)}
                          className="text-rose-600 hover:text-rose-800 font-bold text-xs p-1 rounded hover:bg-rose-50"
                          title="Supprimer ce versement"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL D'ENREGISTREMENT DE REMBOURSEMENT ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3"
          onClick={() => {
            if (savingRemb) return;
            setModalOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-teal-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Entête */}
            <div className="p-4 bg-teal-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm flex items-center gap-1.5">
                  <span>⚖️</span>
                  <span>Enregistrer un Remboursement d'Écart</span>
                </h3>
                <p className="text-[11px] text-teal-200 mt-0.5">
                  Régularisation du manquant opérateur et mise à jour des caisses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-white hover:text-teal-200 font-bold text-lg w-7 h-7 rounded flex items-center justify-center hover:bg-teal-700/50"
              >
                ✕
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSaveRemboursement} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Nom de l'Opérateur *
                  </label>
                  <input
                    type="text"
                    value={rembForm.operateur_nom}
                    onChange={(e) => setRembForm({ ...rembForm, operateur_nom: e.target.value })}
                    placeholder="ex: Mamadou Diallo"
                    className="w-full border rounded-lg p-2 font-semibold bg-white text-gray-900 border-gray-300 focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Rôle de l'Opérateur
                  </label>
                  <select
                    value={rembForm.role_operateur}
                    onChange={(e) => setRembForm({ ...rembForm, role_operateur: e.target.value })}
                    className="w-full border rounded-lg p-2 font-bold bg-white text-gray-900 border-gray-300"
                  >
                    <option value="pompiste">⛽ Pompiste</option>
                    <option value="laveur">🚿 Laveur</option>
                    <option value="caissier">🏪 Caissier Boutique</option>
                    <option value="technicien">🔧 Technicien / Atelier</option>
                    <option value="autre">👤 Autre</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Activité Concernée
                  </label>
                  <select
                    value={rembForm.activite}
                    onChange={(e) => setRembForm({ ...rembForm, activite: e.target.value })}
                    className="w-full border rounded-lg p-2 font-bold bg-white text-gray-900 border-gray-300"
                  >
                    <option value="CARBURANT">⛽ Carburant</option>
                    <option value="LAVAGE">🚿 Lavage</option>
                    <option value="BOUTIQUE">🏪 Boutique & Gaz</option>
                    <option value="ENTRETIEN">🔧 Entretien & Vidange</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Date du Remboursement
                  </label>
                  <input
                    type="date"
                    value={rembForm.date}
                    onChange={(e) => setRembForm({ ...rembForm, date: e.target.value })}
                    className="w-full border rounded-lg p-2 font-bold bg-white text-gray-900 border-gray-300"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Mode d'Encaissement *
                  </label>
                  <select
                    value={rembForm.mode_paiement}
                    onChange={(e) => setRembForm({ ...rembForm, mode_paiement: e.target.value })}
                    className="w-full border rounded-lg p-2 font-bold bg-white text-gray-900 border-gray-300"
                  >
                    <option value="ESPECES">💵 Espèces (Cash)</option>
                    <option value="WAVE">📱 Wave</option>
                    <option value="OM">📱 Orange Money</option>
                    <option value="CB">💳 Carte Bancaire / TPE</option>
                    <option value="CHEQUE">🏦 Chèque</option>
                    <option value="VIREMENT">💳 Virement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teal-900 uppercase mb-1">
                    Montant Remboursé (FCFA) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={rembForm.montant}
                    onChange={(e) => setRembForm({ ...rembForm, montant: e.target.value })}
                    placeholder="0"
                    className="w-full border-2 border-teal-500 rounded-lg p-2 font-black text-teal-950 bg-teal-50/60 tabular"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  N° Quittance / Reçu / Référence
                </label>
                <input
                  type="text"
                  value={rembForm.reference}
                  onChange={(e) => setRembForm({ ...rembForm, reference: e.target.value })}
                  placeholder="ex: REC-2026-004, Trf Wave"
                  className="w-full border rounded-lg p-2 bg-white text-gray-900 border-gray-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Motif / Observations
                </label>
                <input
                  type="text"
                  value={rembForm.motif}
                  onChange={(e) => setRembForm({ ...rembForm, motif: e.target.value })}
                  placeholder="ex: Régularisation manquant quart nuit du 29/10"
                  className="w-full border rounded-lg p-2 bg-white text-gray-900 border-gray-300"
                />
              </div>

              {rembForm.mode_paiement === "ESPECES" && n(rembForm.montant) > 0 && (
                <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-300 text-teal-900 text-[11px] flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <span>
                    Ce remboursement en <strong>Espèces (+{F(n(rembForm.montant))} F)</strong> intègre directement la trésorerie disponible de la station.
                  </span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border text-gray-700 font-bold hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingRemb}
                  className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-xs transition-colors disabled:opacity-50"
                >
                  {savingRemb ? "Enregistrement..." : "✓ Valider le Remboursement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
