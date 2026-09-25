import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listMembresFidelite,
  saveMembreFidelite,
  crediterPointsFidelite,
  utiliserPointsFidelite,
  listTransactionsFidelite,
  listRecompensesFidelite,
  calculerPointsFidelite,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Loading } from "../components/ui";

const PALIERS = [
  { nom: "Bronze", min: 0, max: 499, color: "#CD7F32", bg: "bg-amber-100 text-amber-900 border-amber-300" },
  { nom: "Silver", min: 500, max: 1499, color: "#9CA3AF", bg: "bg-slate-100 text-slate-800 border-slate-300" },
  { nom: "Gold", min: 1500, max: 3999, color: "#F59E0B", bg: "bg-yellow-100 text-yellow-900 border-yellow-400" },
  { nom: "Platine", min: 4000, max: Infinity, color: "#6366F1", bg: "bg-indigo-100 text-indigo-900 border-indigo-300" },
];

export default function Fidelite() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("guichet"); // guichet | adherents | catalogue | historique
  const [msg, setMsg] = useState({ text: "", type: "ok" });

  const [membres, setMembres] = useState([]);
  const [recompenses, setRecompenses] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Recherche Guichet
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembre, setSelectedMembre] = useState(null);

  // Formulaire Crédit de points
  const [creditType, setCreditType] = useState("CARBURANT_LITRES"); // CARBURANT_LITRES | CARBURANT_MONTANT | LAVAGE | BOUTIQUE | MANUEL
  const [creditValeur, setCreditValeur] = useState("");
  const [creditRefPiece, setCreditRefPiece] = useState("");
  const [creditNotes, setCreditNotes] = useState("");

  // Modal Nouveau Membre
  const [showModalNewMembre, setShowModalNewMembre] = useState(false);
  const [newMembreForm, setNewMembreForm] = useState({
    nom: "",
    telephone: "",
    email: "",
    immatriculation: "",
    carburant_prefere: "GASOIL",
    numero_carte: "",
    points_solde: 50, // 50 points de bienvenue offerts !
  });

  // Modal Carte Virtuelle
  const [showCardModal, setShowCardModal] = useState(null);

  const flash = (text, type = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "ok" }), 4000);
  };

  const loadData = async () => {
    try {
      const [m, r, t] = await Promise.all([
        listMembresFidelite(stationId),
        listRecompensesFidelite(),
        listTransactionsFidelite(null, stationId),
      ]);
      setMembres(m || []);
      setRecompenses(r || []);
      setTransactions(t || []);
      if (selectedMembre) {
        const refreshed = (m || []).find((x) => x.id === selectedMembre.id);
        if (refreshed) setSelectedMembre(refreshed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  // Points calculés en direct pour le crédit
  const pointsCalcules = useMemo(() => {
    if (!creditValeur || n(creditValeur) <= 0) return 0;
    if (creditType === "MANUEL") return Math.round(n(creditValeur));
    return calculerPointsFidelite(creditType, n(creditValeur));
  }, [creditType, creditValeur]);

  // Recherche adhérents filtrés
  const filteredMembres = useMemo(() => {
    if (!searchQuery.trim()) return membres;
    const q = searchQuery.toLowerCase().trim();
    return membres.filter(
      (m) =>
        (m.nom && m.nom.toLowerCase().includes(q)) ||
        (m.telephone && m.telephone.includes(q)) ||
        (m.numero_carte && m.numero_carte.toLowerCase().includes(q)) ||
        (m.immatriculation && m.immatriculation.toLowerCase().includes(q))
    );
  }, [membres, searchQuery]);

  // Total KPIs
  const stats = useMemo(() => {
    const totalAdherents = membres.length;
    const totalPointsActifs = membres.reduce((sum, m) => sum + (n(m.points_solde) || 0), 0);
    const totalRecompensesUtilisees = transactions.filter((t) => t.sens === "DEBIT").length;
    const adherentsPlatine = membres.filter((m) => m.statut_palier === "Platine").length;
    return { totalAdherents, totalPointsActifs, totalRecompensesUtilisees, adherentsPlatine };
  }, [membres, transactions]);

  const handleSelectMembre = (m) => {
    setSelectedMembre(m);
    setCreditValeur("");
    setCreditRefPiece("");
    setCreditNotes("");
  };

  const handleCrediterPoints = async (e) => {
    e.preventDefault();
    if (!selectedMembre) return flash("Veuillez d'abord sélectionner un adhérent", "err");
    if (pointsCalcules <= 0) return flash("Nombre de points à créditer invalide", "err");

    const res = await crediterPointsFidelite({
      membre_id: selectedMembre.id,
      station_id: stationId,
      type_operation: creditType.startsWith("CARBURANT") ? "CARBURANT" : creditType,
      montant: creditType === "CARBURANT_MONTANT" || creditType === "LAVAGE" || creditType === "BOUTIQUE" ? n(creditValeur) : null,
      points: pointsCalcules,
      reference_piece: creditRefPiece.trim() || `Passage en station (${creditType})`,
      notes: creditNotes.trim(),
      created_by: profil?.nom_complet || "Pompiste / Guichet",
    });

    if (res.ok) {
      flash(`🎉 +${pointsCalcules} points crédités à ${selectedMembre.nom} ! Nouveau solde : ${res.nouveau_solde} pts`, "ok");
      setCreditValeur("");
      setCreditRefPiece("");
      setCreditNotes("");
      loadData();
    } else {
      flash(res.error || "Erreur lors du crédit de points", "err");
    }
  };

  const handleDebiterRecompense = async (rec) => {
    if (!selectedMembre) return flash("Veuillez sélectionner un adhérent", "err");
    if ((n(selectedMembre.points_solde) || 0) < rec.points_requis) {
      return flash(`Solde insuffisant pour cette récompense (${rec.points_requis} pts requis)`, "err");
    }

    if (!window.confirm(`Confirmer l'échange de la récompense "${rec.titre}" contre ${rec.points_requis} points pour ${selectedMembre.nom} ?`)) {
      return;
    }

    const res = await utiliserPointsFidelite({
      membre_id: selectedMembre.id,
      recompense_id: rec.id,
      station_id: stationId,
      points_deduits: rec.points_requis,
      notes: `Échange au guichet : ${rec.titre}`,
      created_by: profil?.nom_complet || "Guichet",
    });

    if (res.ok) {
      flash(`🎁 Récompense accordée : "${rec.titre}" (-${rec.points_requis} pts). Solde restant : ${res.nouveau_solde} pts`, "ok");
      loadData();
    } else {
      flash(res.error || "Erreur lors de l'échange de récompense", "err");
    }
  };

  const handleCreateMembre = async (e) => {
    e.preventDefault();
    if (!newMembreForm.nom.trim() || !newMembreForm.telephone.trim()) {
      return flash("Le nom et le numéro de téléphone sont obligatoires", "err");
    }

    const res = await saveMembreFidelite({
      ...newMembreForm,
      station_id: stationId,
    });

    if (res.ok) {
      flash(`✅ Adhérent ${res.membre.nom} inscrit avec succès ! Carte N° ${res.membre.numero_carte}`, "ok");
      setShowModalNewMembre(false);
      setNewMembreForm({
        nom: "",
        telephone: "",
        email: "",
        immatriculation: "",
        carburant_prefere: "GASOIL",
        numero_carte: "",
        points_solde: 50,
      });
      loadData();
      setSelectedMembre(res.membre);
    } else {
      flash("Erreur lors de l'enregistrement de l'adhérent", "err");
    }
  };

  if (loading) return <Loading label="Chargement du Programme de Fidélité..." />;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b" style={{ borderColor: T.line }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎁</span>
            <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
              Programme de Fidélité Clients
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Station Carburant & Services
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: T.muted }}>
            Cartes d'adhésion, cumul de points (Carburant, Lavage, Boutique) et catalogue de récompenses
          </p>
        </div>

        {/* Boutons d'onglets */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab("guichet")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "guichet" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            ⚡ Guichet Express
          </button>
          <button
            type="button"
            onClick={() => setTab("adherents")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "adherents" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            👥 Adhérents ({membres.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("catalogue")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "catalogue" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            🏆 Récompenses ({recompenses.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("historique")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "historique" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            📋 Transactions ({transactions.length})
          </button>
        </div>
      </div>

      {/* Message Flash */}
      {msg.text && (
        <div
          className={`mb-4 p-3 text-xs rounded-lg font-medium border flex items-center justify-between shadow-sm animate-fade-in ${
            msg.type === "err" ? "bg-red-50 text-red-800 border-red-200" : "bg-emerald-50 text-emerald-900 border-emerald-200"
          }`}
        >
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg({ text: "", type: "ok" })} className="text-gray-400 hover:text-gray-600 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Cartes KPI Réseau Fidélité */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white p-3.5 rounded-xl border shadow-xs" style={{ borderColor: T.line }}>
          <div className="text-[11px] font-medium text-gray-500">Membres Inscrits</div>
          <div className="text-xl font-extrabold text-gray-900 mt-1 tabular">{F(stats.totalAdherents)}</div>
          <div className="text-[10px] text-emerald-600 mt-1">Actifs en station</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border shadow-xs" style={{ borderColor: T.line }}>
          <div className="text-[11px] font-medium text-gray-500">Points en Circulation</div>
          <div className="text-xl font-extrabold text-amber-600 mt-1 tabular">{F(stats.totalPointsActifs)} pts</div>
          <div className="text-[10px] text-gray-400 mt-1">Soldes clients cumulés</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border shadow-xs" style={{ borderColor: T.line }}>
          <div className="text-[11px] font-medium text-gray-500">Récompenses Échangées</div>
          <div className="text-xl font-extrabold text-indigo-700 mt-1 tabular">{stats.totalRecompensesUtilisees}</div>
          <div className="text-[10px] text-indigo-500 mt-1">Avantages distribués</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border shadow-xs" style={{ borderColor: T.line }}>
          <div className="text-[11px] font-medium text-gray-500">Membres VIP Platine</div>
          <div className="text-xl font-extrabold text-purple-700 mt-1 tabular">{stats.adherentsPlatine}</div>
          <div className="text-[10px] text-purple-500 mt-1">&ge; 4 000 pts cumulés</div>
        </div>
      </div>

      {/* ────────────────── ONGLET 1 : GUICHET EXPRESS ────────────────── */}
      {tab === "guichet" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Colonne Gauche : Sélection Adhérent */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  🔍 1. Rechercher un Adhérent
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModalNewMembre(true)}
                  className="text-[11px] font-bold text-amber-800 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200"
                >
                  + Nouveau Client
                </button>
              </div>

              <div className="relative mb-3">
                <input
                  type="text"
                  placeholder="Tapez nom, téléphone (ex: 77...), n° carte..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs border rounded-lg p-2.5 pl-8 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  style={{ borderColor: T.line }}
                />
                <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">🔎</span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Liste défilante des résultats */}
              <div className="max-h-72 overflow-y-auto space-y-1.5 divide-y divide-gray-100 pr-1">
                {filteredMembres.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400">
                    Aucun adhérent trouvé.
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowModalNewMembre(true)}
                        className="text-xs text-amber-700 font-bold underline"
                      >
                        Créer une carte pour ce client
                      </button>
                    </div>
                  </div>
                ) : (
                  filteredMembres.map((m) => {
                    const isSelected = selectedMembre?.id === m.id;
                    const palierInfo = PALIERS.find((p) => p.nom === m.statut_palier) || PALIERS[0];
                    return (
                      <div
                        key={m.id}
                        onClick={() => handleSelectMembre(m)}
                        className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-amber-50 border-amber-400 border shadow-xs"
                            : "hover:bg-gray-50 border border-transparent"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-gray-900 truncate">{m.nom}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded border font-bold ${palierInfo.bg}`}>
                              {m.statut_palier || "Bronze"}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 flex gap-2">
                            <span>📞 {m.telephone || "--"}</span>
                            <span>💳 {m.numero_carte}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-extrabold text-amber-700 tabular">
                            {F(m.points_solde)} <span className="text-[10px] font-normal">pts</span>
                          </div>
                          <div className="text-[9px] text-gray-400">Cumul : {F(m.points_cumules)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Carte Visuelle de l'adhérent sélectionné */}
            {selectedMembre && (
              <div className="bg-gradient-to-tr from-[#25082E] via-[#431454] to-[#1E0624] text-white rounded-xl p-4 shadow-lg border-2 border-amber-500/50 relative overflow-hidden">
                <div className="absolute right-[-20px] top-[-20px] w-28 h-28 bg-amber-400/10 rounded-full blur-xl pointer-events-none" />
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-white p-0.5 shadow-sm border border-amber-400 shrink-0 flex items-center justify-center">
                      <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <div className="text-[10px] tracking-widest uppercase text-amber-400 font-bold">
                        STAR ENERGY • CARTE PRIVILÈGE
                      </div>
                      <div className="text-base font-extrabold text-white mt-0.5">{selectedMembre.nom}</div>
                      <div className="text-xs text-purple-200">📞 {selectedMembre.telephone}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase border ${
                        selectedMembre.statut_palier === "Platine"
                          ? "bg-purple-900/80 text-purple-200 border-purple-400"
                          : selectedMembre.statut_palier === "Gold"
                          ? "bg-amber-900/80 text-amber-200 border-amber-400"
                          : selectedMembre.statut_palier === "Silver"
                          ? "bg-slate-700 text-slate-200 border-slate-400"
                          : "bg-amber-950/80 text-amber-300 border-amber-600"
                      }`}
                    >
                      {selectedMembre.statut_palier || "Bronze"}
                    </span>
                  </div>
                </div>

                <div className="my-3 pt-3 border-t border-purple-900/80 flex justify-between items-end">
                  <div>
                    <div className="text-[10px] text-purple-300">NUMÉRO ADHÉRENT</div>
                    <div className="text-xs font-mono font-bold tracking-wider text-amber-200">
                      {selectedMembre.numero_carte}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-purple-300">SOLDE DISPONIBLE</div>
                    <div className="text-2xl font-black text-amber-400 tabular">
                      {F(selectedMembre.points_solde)}{" "}
                      <span className="text-xs font-normal text-white">pts</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-purple-900/80 flex justify-between items-center text-[10px] text-purple-200">
                  <span>Adhérent depuis : {fmtDate(selectedMembre.date_adhesion || todayISO())}</span>
                  <button
                    type="button"
                    onClick={() => setShowCardModal(selectedMembre)}
                    className="text-amber-400 hover:text-amber-300 underline font-semibold"
                  >
                    Afficher la carte complète 🪪
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Colonne Droite : Crédit Direct & Catalogue d'échange */}
          <div className="lg:col-span-7 space-y-4">
            {/* Formulaire de Crédit Rapide */}
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 flex items-center justify-between">
                <span>⭐ 2. Créditer des Points de Fidélité</span>
                {selectedMembre && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Pour : {selectedMembre.nom}
                  </span>
                )}
              </h2>

              {!selectedMembre ? (
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-6 text-center text-xs text-amber-900">
                  <div className="text-2xl mb-1">👈</div>
                  <strong>Sélectionnez un adhérent à gauche</strong> pour créditer des points ou échanger une récompense.
                </div>
              ) : (
                <form onSubmit={handleCrediterPoints} className="space-y-3">
                  {/* Choix du barème métier */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">
                      Type d'opération & Barème de calcul :
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setCreditType("CARBURANT_LITRES")}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          creditType === "CARBURANT_LITRES"
                            ? "border-amber-500 bg-amber-50/80 font-bold text-amber-950 ring-1 ring-amber-400"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-base">⛽ Carburant</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">1 Litre = 1 pt</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreditType("CARBURANT_MONTANT")}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          creditType === "CARBURANT_MONTANT"
                            ? "border-amber-500 bg-amber-50/80 font-bold text-amber-950 ring-1 ring-amber-400"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-base">💵 Carburant (F)</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">1 000 F = 10 pts</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreditType("LAVAGE")}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          creditType === "LAVAGE"
                            ? "border-amber-500 bg-amber-50/80 font-bold text-amber-950 ring-1 ring-amber-400"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-base">🚿 Lavage Auto</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">1 000 F = 15 pts</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreditType("BOUTIQUE")}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          creditType === "BOUTIQUE"
                            ? "border-amber-500 bg-amber-50/80 font-bold text-amber-950 ring-1 ring-amber-400"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-base">🛒 Boutique / Huile</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">1 000 F = 10 pts</div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {creditType === "CARBURANT_LITRES" ? "Volume servi (Litres) *" : "Montant d'achat (FCFA) *"}
                      </label>
                      <input
                        type="number"
                        placeholder={creditType === "CARBURANT_LITRES" ? "ex: 45" : "ex: 15000"}
                        value={creditValeur}
                        onChange={(e) => setCreditValeur(e.target.value)}
                        className="w-full text-sm font-bold border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-400"
                        style={{ borderColor: T.line }}
                        required
                        min="1"
                        step={creditType === "CARBURANT_LITRES" ? "0.1" : "1"}
                      />
                    </div>

                    <div className="bg-amber-50/60 rounded-lg p-2.5 border border-amber-200 flex flex-col justify-center">
                      <div className="text-[10px] font-bold text-amber-900 uppercase">Points calculés :</div>
                      <div className="text-2xl font-black text-amber-700 tabular">
                        +{F(pointsCalcules)} <span className="text-xs font-semibold text-amber-900">points</span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Nouveau solde prévu : {F((n(selectedMembre.points_solde) || 0) + pointsCalcules)} pts
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">N° Ticket / Reçu (optionnel)</label>
                      <input
                        type="text"
                        placeholder="ex: TK-10492"
                        value={creditRefPiece}
                        onChange={(e) => setCreditRefPiece(e.target.value)}
                        className="w-full text-xs border rounded-lg p-2"
                        style={{ borderColor: T.line }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Commentaires / Pistolet</label>
                      <input
                        type="text"
                        placeholder="ex: Plein Gasoil Pompe 2"
                        value={creditNotes}
                        onChange={(e) => setCreditNotes(e.target.value)}
                        className="w-full text-xs border rounded-lg p-2"
                        style={{ borderColor: T.line }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={pointsCalcules <= 0}
                    className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-1.5"
                    style={{ background: T.gold }}
                  >
                    <span>✓ Valider le Crédit (+{pointsCalcules} pts)</span>
                  </button>
                </form>
              )}
            </div>

            {/* Échange Rapide de Récompenses pour l'Adhérent */}
            {selectedMembre && (
              <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 flex items-center justify-between">
                  <span>🏆 3. Échanger des Récompenses Immédiates</span>
                  <span className="text-[11px] text-gray-500 font-normal">
                    Solde actuel : <strong className="text-amber-700 font-bold">{F(selectedMembre.points_solde)} pts</strong>
                  </span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {recompenses.map((rec) => {
                    const peutDebiter = (n(selectedMembre.points_solde) || 0) >= rec.points_requis;
                    return (
                      <div
                        key={rec.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                          peutDebiter ? "bg-white hover:border-amber-400 hover:shadow-xs" : "bg-gray-50/60 opacity-60"
                        }`}
                        style={{ borderColor: T.line }}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="text-xs font-bold text-gray-900">{rec.titre}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{rec.description}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 tabular">
                              {rec.points_requis} pts
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t flex items-center justify-between" style={{ borderColor: T.line }}>
                          <span className="text-[10px] text-gray-400 capitalize">{rec.categorie}</span>
                          <button
                            type="button"
                            onClick={() => handleDebiterRecompense(rec)}
                            disabled={!peutDebiter}
                            className={`text-xs px-2.5 py-1 rounded font-bold transition-all ${
                              peutDebiter
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                : "bg-gray-200 text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            {peutDebiter ? "Offrir ✓" : "Points manquants"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── ONGLET 2 : RÉPERTOIRE ADHÉRENTS ────────────────── */}
      {tab === "adherents" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
                Répertoire des Adhérents Fidélité ({filteredMembres.length})
              </h2>
              <p className="text-xs text-gray-500">Cartes de fidélité émises, soldes et historique d'activité</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Filtrer par nom, téléphone, carte..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs border rounded-lg px-3 py-1.5"
                style={{ borderColor: T.line }}
              />
              <button
                type="button"
                onClick={() => setShowModalNewMembre(true)}
                className="text-xs px-3 py-1.5 rounded-lg font-bold text-gray-900 shadow-xs hover:opacity-90"
                style={{ background: T.gold }}
              >
                + Adhérer un Client
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                  <th className="pb-2.5">Adhérent & Téléphone</th>
                  <th className="pb-2.5">N° Carte</th>
                  <th className="pb-2.5 text-center">Palier</th>
                  <th className="pb-2.5 text-right">Solde Actuel</th>
                  <th className="pb-2.5 text-right">Points Cumulés</th>
                  <th className="pb-2.5 text-center">Véhicule</th>
                  <th className="pb-2.5 text-center">Dernier Passage</th>
                  <th className="pb-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: T.line }}>
                {filteredMembres.map((m) => {
                  const palierInfo = PALIERS.find((p) => p.nom === m.statut_palier) || PALIERS[0];
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5">
                        <div className="font-bold text-gray-900">{m.nom}</div>
                        <div className="text-[11px] text-gray-500">📞 {m.telephone || "--"}</div>
                      </td>
                      <td className="py-2.5 font-mono text-xs font-semibold text-gray-700">{m.numero_carte}</td>
                      <td className="py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${palierInfo.bg}`}>
                          {m.statut_palier || "Bronze"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-amber-700 tabular text-sm">
                        {F(m.points_solde)} pts
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-600 tabular">{F(m.points_cumules)} pts</td>
                      <td className="py-2.5 text-center text-[11px] text-gray-600">
                        {m.immatriculation ? <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{m.immatriculation}</span> : "--"}
                      </td>
                      <td className="py-2.5 text-center text-gray-500 text-[11px]">
                        {m.date_derniere_visite ? fmtDate(m.date_derniere_visite) : "Nouveau"}
                      </td>
                      <td className="py-2.5 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMembre(m);
                            setTab("guichet");
                          }}
                          className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-900 border border-amber-300 font-semibold hover:bg-amber-100"
                        >
                          ⚡ Guichet
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCardModal(m)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800 hover:bg-gray-200"
                          title="Voir la carte"
                        >
                          🪪
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────── ONGLET 3 : CATALOGUE DES RÉCOMPENSES ────────────────── */}
      {tab === "catalogue" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="mb-4">
            <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
              Catalogue des Avantages & Cadeaux Station
            </h2>
            <p className="text-xs text-gray-500">
              Grille des récompenses échangeables contre les points de fidélité
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recompenses.map((rec) => (
              <div
                key={rec.id}
                className="bg-gray-50/60 rounded-xl border p-4 flex flex-col justify-between hover:border-amber-400 hover:shadow-xs transition-all"
                style={{ borderColor: T.line }}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-xl">
                      {rec.categorie === "carburant" ? "⛽" : rec.categorie === "lavage" ? "🚿" : rec.categorie === "boutique" ? "🛒" : "🎁"}
                    </span>
                    <span className="text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 tabular">
                      {rec.points_requis} points
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-gray-900">{rec.titre}</h3>
                  <p className="text-[11px] text-gray-600 mt-1">{rec.description}</p>
                </div>

                <div className="mt-4 pt-2 border-t flex justify-between items-center text-[10px] text-gray-400" style={{ borderColor: T.line }}>
                  <span className="capitalize">Catégorie : {rec.categorie}</span>
                  <span className="text-emerald-700 font-semibold">✓ Disponible en station</span>
                </div>
              </div>
            ))}
          </div>

          {/* Guide des Paliers */}
          <div className="mt-6 p-4 rounded-xl border bg-linear-to-r from-amber-50/50 via-white to-amber-50/50" style={{ borderColor: T.line }}>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
              ⭐ Grille des Paliers & Avantages VIP
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              {PALIERS.map((p) => (
                <div key={p.nom} className={`p-2.5 rounded-lg border ${p.bg}`}>
                  <div className="font-extrabold text-sm">{p.nom}</div>
                  <div className="text-[11px] mt-0.5">
                    {p.max === Infinity ? `À partir de ${F(p.min)} pts` : `${F(p.min)} à ${F(p.max)} pts`}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">
                    {p.nom === "Platine"
                      ? "Service prioritaire + Café offert + Double points lavage"
                      : p.nom === "Gold"
                      ? "Check pression offert + Réductions boutique"
                      : p.nom === "Silver"
                      ? "Cumul accéléré sur carburant"
                      : "Points de bienvenue + Accès au catalogue"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── ONGLET 4 : HISTORIQUE DES TRANSACTIONS ────────────────── */}
      {tab === "historique" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="mb-4">
            <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
              Historique des Mouvements de Points ({transactions.length})
            </h2>
            <p className="text-xs text-gray-500">Journal d'audit de chaque crédit et débit de fidélité</p>
          </div>

          {transactions.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucune transaction enregistrée.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Date & Heure</th>
                    <th className="pb-2">Adhérent</th>
                    <th className="pb-2">Opération</th>
                    <th className="pb-2 text-right">Points</th>
                    <th className="pb-2 text-right">Solde Après</th>
                    <th className="pb-2">Réf / Pièce</th>
                    <th className="pb-2 text-right">Opérateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {transactions.map((tx) => {
                    const m = membres.find((x) => x.id === tx.membre_id);
                    const isCredit = tx.sens === "CREDIT" || tx.points > 0;
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                        <td className="py-2.5 font-bold text-gray-900">{m ? m.nom : "Adhérent"}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isCredit ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
                            }`}
                          >
                            {tx.type_operation}
                          </span>
                        </td>
                        <td className={`py-2.5 text-right font-extrabold tabular ${isCredit ? "text-emerald-700" : "text-indigo-700"}`}>
                          {isCredit ? "+" : ""}{tx.points} pts
                        </td>
                        <td className="py-2.5 text-right font-semibold text-gray-700 tabular">{tx.solde_apres} pts</td>
                        <td className="py-2.5 text-gray-500 text-[11px]">{tx.reference_piece || tx.notes || "--"}</td>
                        <td className="py-2.5 text-right text-gray-400 text-[10px]">{tx.created_by || "Guichet"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL : NOUVEL ADHÉRENT */}
      {showModalNewMembre && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border" style={{ borderColor: T.line }}>
            <div className="flex justify-between items-center pb-3 border-b mb-4" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h3 className="font-bold text-sm text-gray-900">Nouvelle Adhésion Fidélité</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModalNewMembre(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMembre} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nom & Prénom *</label>
                <input
                  type="text"
                  placeholder="ex: Amadou Diallo"
                  value={newMembreForm.nom}
                  onChange={(e) => setNewMembreForm({ ...newMembreForm, nom: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2.5"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Téléphone *</label>
                  <input
                    type="tel"
                    placeholder="ex: 77 123 45 67"
                    value={newMembreForm.telephone}
                    onChange={(e) => setNewMembreForm({ ...newMembreForm, telephone: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5"
                    style={{ borderColor: T.line }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Immatriculation</label>
                  <input
                    type="text"
                    placeholder="ex: DK-1234-AZ"
                    value={newMembreForm.immatriculation}
                    onChange={(e) => setNewMembreForm({ ...newMembreForm, immatriculation: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5 uppercase"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Carburant habituel</label>
                  <select
                    value={newMembreForm.carburant_prefere}
                    onChange={(e) => setNewMembreForm({ ...newMembreForm, carburant_prefere: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white"
                    style={{ borderColor: T.line }}
                  >
                    <option value="GASOIL">GASOIL</option>
                    <option value="SUPER">SUPER</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Points offerts (Bienvenue)</label>
                  <input
                    type="number"
                    value={newMembreForm.points_solde}
                    onChange={(e) => setNewMembreForm({ ...newMembreForm, points_solde: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5 font-bold text-amber-700 bg-amber-50"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  N° de Carte personnalisé (ou laisser vide pour auto-génération)
                </label>
                <input
                  type="text"
                  placeholder="ex: FID-2026-XXXX"
                  value={newMembreForm.numero_carte}
                  onChange={(e) => setNewMembreForm({ ...newMembreForm, numero_carte: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2 font-mono text-gray-600"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowModalNewMembre(false)}
                  className="w-1/2 py-2.5 rounded-lg border text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  style={{ borderColor: T.line }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm hover:opacity-95"
                  style={{ background: T.gold }}
                >
                  ✓ Créer la Carte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL : CARTE PHYSIQUE / DIGITALE IMPRIMABLE */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border" style={{ borderColor: T.line }}>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Carte Adhérent Digitale</h4>
              <button
                type="button"
                onClick={() => setShowCardModal(null)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Carte Visuelle Haute Définition STAR ENERGY */}
            <div className="bg-gradient-to-tr from-[#25082E] via-[#431454] to-[#1E0624] text-white rounded-xl p-5 shadow-xl border-2 border-amber-500/60 relative overflow-hidden aspect-8/5 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white p-0.5 shadow-sm border border-amber-400 shrink-0 flex items-center justify-center">
                    <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[10px] tracking-widest text-amber-400 font-extrabold uppercase">
                      STAR ENERGY SÉNÉGAL
                    </div>
                    <div className="text-sm font-extrabold text-white mt-1">{showCardModal.nom}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 uppercase shadow-xs">
                    {showCardModal.statut_palier || "Bronze"}
                  </span>
                </div>
              </div>

              {/* Simulation Code-Barre / QR */}
              <div className="my-2 p-2 bg-white rounded-lg flex items-center justify-center shadow-inner">
                <div className="font-mono text-gray-900 font-extrabold tracking-widest text-sm">
                  ||||| {showCardModal.numero_carte} |||||
                </div>
              </div>

              <div className="flex justify-between items-end text-[10px]">
                <div>
                  <span className="text-amber-200/80 block text-[8px] uppercase tracking-wider font-semibold">TÉLÉPHONE</span>
                  <span className="font-bold text-gray-100">{showCardModal.telephone}</span>
                  <span className="block text-[9px] text-amber-300 italic mt-0.5">Li nio ko mom !</span>
                </div>
                <div className="text-right">
                  <span className="text-amber-200/80 block text-[8px] uppercase tracking-wider font-semibold">SOLDE ACTUEL</span>
                  <span className="font-black text-amber-400 text-base">{F(showCardModal.points_solde)} pts</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-black flex items-center justify-center gap-1.5"
              >
                <span>🖨️ Imprimer la Carte</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
