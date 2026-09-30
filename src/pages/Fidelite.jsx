import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import {
  listMembresFidelite,
  getMembreFidelite,
  saveMembreFidelite,
  crediterPointsFidelite,
  utiliserPointsFidelite,
  listTransactionsFidelite,
  listRecompensesFidelite,
  calculerPointsFidelite,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Loading } from "../components/ui";
import { peutAgirProfil } from "../lib/permissions";

const PALIERS = [
  { nom: "Bronze", min: 0, max: 499, color: "#CD7F32", bg: "bg-amber-100 text-amber-900 border-amber-300" },
  { nom: "Silver", min: 500, max: 1499, color: "#9CA3AF", bg: "bg-slate-100 text-slate-800 border-slate-300" },
  { nom: "Gold", min: 1500, max: 3999, color: "#F59E0B", bg: "bg-yellow-100 text-yellow-900 border-yellow-400" },
  { nom: "Platine", min: 4000, max: Infinity, color: "#6366F1", bg: "bg-indigo-100 text-indigo-900 border-indigo-300" },
];

const WALLETS = [
  { id: "WAVE", label: "Wave", icon: "🐧", bg: "bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100" },
  { id: "OM", label: "Orange Money", icon: "🟧", bg: "bg-orange-50 text-orange-900 border-orange-300 hover:bg-orange-100" },
  { id: "PETROSEN", label: "Paiement Petrosen", icon: "⛽", bg: "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100" },
  { id: "CB", label: "Carte Bancaire", icon: "💳", bg: "bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100" },
  { id: "ESPECES", label: "Espèces", icon: "💵", bg: "bg-green-50 text-green-900 border-green-300 hover:bg-green-100" },
  { id: "CODE_ELECTRONIQUE", label: "Code Électronique", icon: "📟", bg: "bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100" },
  { id: "TICKETS", label: "Ticket Valeur", icon: "🎫", bg: "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100" },
];

/** Modal de Scan Caméra avec fallback Douchette */
function CameraScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let html5QrCode = null;
    let isMounted = true;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode("qr-reader-element");
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (isMounted) {
              onScanSuccess(decodedText);
              html5QrCode.stop().catch(() => {}).then(() => html5QrCode.clear());
            }
          },
          () => {}
        );
      } catch (err) {
        if (isMounted) {
          setCameraError("Caméra inaccessible ou refusée. Utilisez la saisie ou la douchette ci-dessous.");
        }
      }
    };

    const t = setTimeout(startScanner, 150);

    return () => {
      clearTimeout(t);
      isMounted = false;
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(() => {}).then(() => html5QrCode.clear());
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border text-gray-900 space-y-3">
        <div className="flex justify-between items-center pb-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <h3 className="font-bold text-sm text-gray-900">Scanner le QR Code Client</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Orientez la caméra vers le QR Code personnel présenté par le client.
        </p>

        {/* Lecteur Vidéo */}
        <div className="relative bg-slate-950 rounded-xl overflow-hidden min-h-[220px] flex items-center justify-center border border-gray-300">
          <div id="qr-reader-element" className="w-full h-full" />
          {cameraError && (
            <div className="p-3 text-center text-xs text-amber-200 bg-slate-900/90 absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span>⚠️ {cameraError}</span>
            </div>
          )}
        </div>

        {/* Fallback Saisie / Douchette */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) onScanSuccess(manualCode.trim());
          }}
          className="pt-2 border-t space-y-2"
        >
          <label className="block text-[11px] font-semibold text-gray-700">
            Saisie directe / Lecteur douchette laser :
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="ex: FID-1001, 77 123 45 67, DK-5512-AB..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              autoFocus
              className="flex-1 text-xs border rounded-lg p-2 focus:ring-1 focus:ring-amber-500 font-mono"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-amber-400 text-gray-950 text-xs font-bold rounded-lg hover:bg-amber-500"
            >
              OK
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            Fonctionne avec les douchettes USB ou Bluetooth sans configuration.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function Fidelite() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const peutCrediter = peutAgirProfil(profil, "fidelite", "crediter");
  const peutDebiter = peutAgirProfil(profil, "fidelite", "debiter");
  const peutGererMembres = peutAgirProfil(profil, "fidelite", "gerer");

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("guichet"); // guichet | adherents | borne | catalogue | historique
  const [msg, setMsg] = useState({ text: "", type: "ok" });

  const [membres, setMembres] = useState([]);
  const [recompenses, setRecompenses] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Recherche Guichet
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembre, setSelectedMembre] = useState(null);

  // Scanner Modal
  const [showScannerModal, setShowScannerModal] = useState(false);

  // Formulaire Crédit de points & Choix Wallet
  const [selectedWallet, setSelectedWallet] = useState("WAVE");
  const [creditType, setCreditType] = useState("CARBURANT_MONTANT"); // CARBURANT_LITRES | CARBURANT_MONTANT | LAVAGE | BOUTIQUE | MANUEL
  const [creditValeur, setCreditValeur] = useState("10000");
  const [creditRefPiece, setCreditRefPiece] = useState("");
  const [creditNotes, setCreditNotes] = useState("");

  // Modal Célébration après encaissement
  const [celebrationModal, setCelebrationModal] = useState(null);

  // Modal Nouveau Membre
  const [showModalNewMembre, setShowModalNewMembre] = useState(false);
  const [newMembreForm, setNewMembreForm] = useState({
    nom: "",
    telephone: "",
    email: "",
    immatriculation: "",
    carburant_prefere: "GASOIL",
    numero_carte: "",
    points_solde: 100, // 100 points de bienvenue offerts !
  });

  // Modal Carte Virtuelle
  const [showCardModal, setShowCardModal] = useState(null);

  const flash = (text, type = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "ok" }), 4500);
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
    setCreditRefPiece("");
    setCreditNotes("");
  };

  // Traitement du scan QR Code (par caméra ou douchette)
  const handleScanSuccess = async (code) => {
    if (!code || !code.trim()) return;
    const found = await getMembreFidelite(code.trim());
    if (found) {
      handleSelectMembre(found);
      setShowScannerModal(false);
      flash(`✅ Client identifié : ${found.nom || found.nom_complet} (${F(found.points_solde)} pts)`, "ok");
    } else {
      flash(`Aucun client trouvé pour le code scanné : "${code}"`, "err");
    }
  };

  // Validation du crédit de points lors du paiement
  const handleCrediterPoints = async (e) => {
    e.preventDefault();
    if (!peutCrediter) return flash("Tu n'as pas le droit de créditer des points.", "err");
    if (!selectedMembre) return flash("Veuillez d'abord sélectionner un adhérent", "err");
    if (pointsCalcules <= 0) return flash("Nombre de points à créditer invalide", "err");

    const montantNum = creditType === "CARBURANT_LITRES" ? null : n(creditValeur);
    const res = await crediterPointsFidelite({
      membre_id: selectedMembre.id,
      station_id: stationId,
      type_operation: creditType.startsWith("CARBURANT") ? "CARBURANT" : creditType,
      montant: montantNum,
      points: pointsCalcules,
      mode_paiement: selectedWallet,
      reference_piece: creditRefPiece.trim() || `Paiement ${selectedWallet} (${creditType})`,
      notes: creditNotes.trim() || `Règlement ${selectedWallet}`,
      created_by: profil?.nom_complet || "Pompiste / Guichet",
    });

    if (res.ok) {
      setCelebrationModal({
        membre: selectedMembre,
        pointsGagnes: pointsCalcules,
        nouveauSolde: res.nouveau_solde,
        montant: montantNum,
        wallet: selectedWallet,
        date: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      });
      setSelectedMembre(res.membre);
      setCreditValeur("");
      setCreditRefPiece("");
      setCreditNotes("");
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      loadData();
    } else {
      flash(res.error || "Erreur lors du crédit de points", "err");
    }
  };

  const handleDebiterRecompense = async (rec) => {
    if (!peutDebiter) return flash("Tu n'as pas le droit d'échanger des points (débit).", "err");
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
    if (!peutGererMembres && !peutCrediter) return flash("Tu n'as pas le droit de créer un adhérent.", "err");
    if (!newMembreForm.nom.trim() || !newMembreForm.telephone.trim()) {
      return flash("Le nom et le numéro de téléphone sont obligatoires", "err");
    }

    const res = await saveMembreFidelite({
      ...newMembreForm,
      station_id: stationId,
    });

    if (res.ok) {
      flash(`✅ Adhérent ${res.membre.nom} inscrit avec succès ! Carte N° ${res.membre.numero_carte} (+${res.membre.points_solde} pts offerts)`, "ok");
      setShowModalNewMembre(false);
      setNewMembreForm({
        nom: "",
        telephone: "",
        email: "",
        immatriculation: "",
        carburant_prefere: "GASOIL",
        numero_carte: "",
        points_solde: 100,
      });
      loadData();
      setSelectedMembre(res.membre);
    } else {
      flash("Erreur lors de l'enregistrement de l'adhérent", "err");
    }
  };

  if (loading) return <Loading label="Chargement du Programme de Fidélité..." />;

  // URL de la borne station pour QR Code
  const borneQrUrl = `${window.location.origin}/espace-fidelite?nouveau=1&station=${stationId}`;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b" style={{ borderColor: T.line }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎁</span>
            <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
              Programme de Fidélité — Parcours Client
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
              QR Code & Multi-Wallets
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: T.muted }}>
            Scan QR Code personnel → Identification client → Choix du wallet → Crédit automatique des points (1 000 F = 10 pts)
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
            ⚡ Guichet & Scan QR
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
            onClick={() => setTab("borne")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "borne" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            📲 Borne & Affiche QR Station
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

      {/* ────────────────── ONGLET 1 : GUICHET EXPRESS & SCANNER QR ────────────────── */}
      {tab === "guichet" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Colonne Gauche : Identification Client (Scan / Recherche) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <span>📷</span>
                  <span>1. Scanner ou Rechercher Client</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModalNewMembre(true)}
                  className="text-[11px] font-bold text-amber-800 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200"
                >
                  + Nouveau Client
                </button>
              </div>

              {/* Bouton Grand Format : Scanner Caméra QR */}
              <button
                type="button"
                onClick={() => setShowScannerModal(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 mb-3 border border-purple-700"
              >
                <span className="text-lg">📷</span>
                <span>Scanner le QR Code Personnel (Caméra / Douchette)</span>
              </button>

              <div className="relative mb-3">
                <input
                  type="text"
                  placeholder="Tapez nom, téléphone, n° carte, matricule..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs border rounded-lg p-2.5 pl-8 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
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
              <div className="max-h-64 overflow-y-auto space-y-1.5 divide-y divide-gray-100 pr-1">
                {filteredMembres.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400">
                    Aucun adhérent trouvé.
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowModalNewMembre(true)}
                        className="text-xs text-amber-700 font-bold underline"
                      >
                        Créer une carte pour ce client (+100 pts)
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
                          <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-2">
                            <span>📞 {m.telephone || "--"}</span>
                            {m.immatriculation && <span>🚗 {m.immatriculation}</span>}
                            <span className="font-mono text-[10px]">💳 {m.numero_carte}</span>
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

            {/* Carte Visuelle Haute Définition de l'adhérent sélectionné */}
            {selectedMembre && (
              <div className="bg-gradient-to-tr from-[#25082E] via-[#431454] to-[#1E0624] text-white rounded-xl p-4 shadow-lg border-2 border-amber-500/60 relative overflow-hidden">
                <div className="absolute right-[-20px] top-[-20px] w-28 h-28 bg-amber-400/10 rounded-full blur-xl pointer-events-none" />

                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-white p-0.5 shadow-sm border border-amber-400 shrink-0 flex items-center justify-center">
                      <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <div className="text-[9px] tracking-widest uppercase text-amber-400 font-bold">
                        STAR ENERGY • CARTE PRIVILÈGE
                      </div>
                      <div className="text-base font-extrabold text-white mt-0.5">{selectedMembre.nom}</div>
                      <div className="text-xs text-purple-200">📞 {selectedMembre.telephone}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase border ${
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

                {/* QR Code et Code Adhérent */}
                <div className="my-2.5 p-2.5 bg-white rounded-lg text-slate-900 flex items-center justify-between gap-3 shadow-sm">
                  <div className="p-1 bg-white rounded shrink-0">
                    <QRCodeSVG value={`STARFID:${selectedMembre.id}`} size={64} level="M" />
                  </div>
                  <div className="text-right flex-1">
                    <div className="text-[10px] text-gray-500 uppercase font-semibold">Numéro Adhérent</div>
                    <div className="font-mono text-xs font-bold text-purple-900">{selectedMembre.numero_carte}</div>
                    {selectedMembre.immatriculation && (
                      <div className="text-[10px] font-mono text-gray-600 mt-0.5">Véhicule : {selectedMembre.immatriculation}</div>
                    )}
                  </div>
                </div>

                {/* GRAND AFFICHAGE DU SOLDE */}
                <div className="pt-2 border-t border-purple-900/80 flex justify-between items-end">
                  <div>
                    <span className="text-[10px] text-purple-300">STATUT CARBURANT</span>
                    <div className="text-xs font-bold text-amber-200">{selectedMembre.carburant_prefere || "GASOIL"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-purple-300 uppercase">SOLDE DISPONIBLE</div>
                    <div className="text-2xl font-black text-amber-400 tabular leading-none">
                      {F(selectedMembre.points_solde)}{" "}
                      <span className="text-xs font-normal text-white">pts</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-purple-900/80 flex justify-between items-center text-[10px] text-purple-200">
                  <a
                    href={`/espace-fidelite?client=${selectedMembre.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline font-semibold flex items-center gap-1"
                  >
                    <span>Ouvrir l'Espace Client ↗</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowCardModal(selectedMembre)}
                    className="text-white hover:text-amber-300 underline"
                  >
                    Agrandir Carte 🪪
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Colonne Droite : Parcours Enregistrement Transaction & Choix Wallet */}
          <div className="lg:col-span-7 space-y-4">
            {/* Formulaire de Crédit / Encaissement */}
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: T.line }}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <span>💳</span>
                  <span>2. Règlement & Crédit Automatique de Points</span>
                </h2>
                {selectedMembre && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Pour : {selectedMembre.nom}
                  </span>
                )}
              </div>

              {!selectedMembre ? (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-8 text-center text-xs text-amber-900">
                  <div className="text-3xl mb-2">👈</div>
                  <strong className="text-sm">Veuillez d'abord identifier un client</strong>
                  <p className="text-xs text-amber-800 mt-1 max-w-sm mx-auto">
                    Scannez son QR Code personnel à gauche ou recherchez-le par son numéro de téléphone ou matricule.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowScannerModal(true)}
                    className="mt-3 px-4 py-2 bg-amber-400 text-gray-950 font-bold rounded-lg hover:bg-amber-500 shadow-sm"
                  >
                    📷 Lancer le Scanner QR
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCrediterPoints} className="space-y-3.5">
                  {/* BANNER SOLDE ACTUEL DU CLIENT */}
                  <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">SOLDE DE POINTS ACTUEL</div>
                      <div className="text-xl font-black text-amber-400 tabular">
                        {F(selectedMembre.points_solde)} points
                      </div>
                      <div className="text-[10px] text-gray-300">
                        Véhicule : <strong className="font-mono">{selectedMembre.immatriculation || "Non renseigné"}</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-900 text-amber-300 border border-purple-700">
                        Statut {selectedMembre.statut_palier || "Bronze"}
                      </span>
                      <div className="text-[10px] text-emerald-400 mt-1">1 000 F = 10 pts</div>
                    </div>
                  </div>

                  {/* 1. Sélection de la Prestation */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Type de Prestation :
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setCreditType("CARBURANT_MONTANT")}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          creditType === "CARBURANT_MONTANT"
                            ? "border-amber-500 bg-amber-50/80 font-bold text-amber-950 ring-1 ring-amber-400"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-sm">⛽ Carburant (F)</div>
                        <div className="text-[10px] text-gray-500">1 000 F = 10 pts</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreditType("CARBURANT_LITRES")}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          creditType === "CARBURANT_LITRES"
                            ? "border-amber-500 bg-amber-50/80 font-bold text-amber-950 ring-1 ring-amber-400"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-sm">📏 Carburant (L)</div>
                        <div className="text-[10px] text-gray-500">1 Litre = 1 pt</div>
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
                        <div className="text-sm">🚿 Lavage Auto</div>
                        <div className="text-[10px] text-gray-500">1 000 F = 15 pts</div>
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
                        <div className="text-sm">🛒 Boutique / Huile</div>
                        <div className="text-[10px] text-gray-500">1 000 F = 10 pts</div>
                      </button>
                    </div>
                  </div>

                  {/* 2. Sélection du Wallet / Mode de Paiement */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Moyen de Paiement / Wallet choisi par le client :
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {WALLETS.map((w) => {
                        const isSelected = selectedWallet === w.id;
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setSelectedWallet(w.id)}
                            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              isSelected
                                ? "bg-amber-400 text-gray-950 font-bold border-amber-500 ring-2 ring-amber-300"
                                : `${w.bg}`
                            }`}
                          >
                            <span>{w.icon}</span>
                            <span className="truncate">{w.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Montant ou Volume & Points calculés */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {creditType === "CARBURANT_LITRES" ? "Volume servi (Litres) *" : "Montant réglé (FCFA) *"}
                      </label>
                      <input
                        type="number"
                        placeholder={creditType === "CARBURANT_LITRES" ? "ex: 45" : "ex: 15000"}
                        value={creditValeur}
                        onChange={(e) => setCreditValeur(e.target.value)}
                        className="w-full text-sm font-bold border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-400 bg-gray-50"
                        style={{ borderColor: T.line }}
                        required
                        min="1"
                        step={creditType === "CARBURANT_LITRES" ? "0.1" : "500"}
                      />
                    </div>

                    <div className="bg-amber-50/70 rounded-lg p-2.5 border border-amber-200 flex flex-col justify-center text-center">
                      <div className="text-[10px] font-bold text-amber-900 uppercase">Points à créditer :</div>
                      <div className="text-2xl font-black text-amber-700 tabular">
                        +{F(pointsCalcules)} <span className="text-xs font-semibold text-amber-900">points</span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Nouveau solde prévu : <strong>{F((n(selectedMembre.points_solde) || 0) + pointsCalcules)} pts</strong>
                      </div>
                    </div>
                  </div>

                  {/* 4. Référence & Pistolet */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">N° Reçu / Réf Transaction</label>
                      <input
                        type="text"
                        placeholder="ex: WV-992019 ou TK-10492"
                        value={creditRefPiece}
                        onChange={(e) => setCreditRefPiece(e.target.value)}
                        className="w-full text-xs border rounded-lg p-2 font-mono"
                        style={{ borderColor: T.line }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Pompe / Pistolet / Notes</label>
                      <input
                        type="text"
                        placeholder="ex: Pompe 1 Gasoil"
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
                    className="w-full py-3 rounded-xl text-xs font-bold text-gray-900 shadow-md transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                    style={{ background: T.gold }}
                  >
                    <span>✓ Valider le Règlement ({selectedWallet}) & Créditer (+{pointsCalcules} pts)</span>
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
                    const pointsSuffisants = (n(selectedMembre.points_solde) || 0) >= rec.points_requis;
                    const peutOffrir = peutDebiter && pointsSuffisants;
                    return (
                      <div
                        key={rec.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                          peutOffrir ? "bg-white hover:border-amber-400 hover:shadow-xs" : "bg-gray-50/60 opacity-60"
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
                            disabled={!peutOffrir}
                            className={`text-xs px-2.5 py-1 rounded font-bold transition-all ${
                              peutOffrir
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                : "bg-gray-200 text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            {!peutDebiter ? "Non autorisé" : pointsSuffisants ? "Offrir ✓" : "Points manquants"}
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

      {/* ────────────────── ONGLET 3 : BORNE & AFFICHE QR STATION ────────────────── */}
      {tab === "borne" && (
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: T.line }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
                Borne & Affiche QR Code de la Station (Auto-Enrôlement)
              </h2>
              <p className="text-xs text-gray-500">
                Affiche prête à imprimer pour la piste ou la caisse : le client flashe ce QR Code pour créer son profil et consulter ses points
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-bold hover:bg-black flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>🖨️ Imprimer l'Affiche Borne (A4)</span>
            </button>
          </div>

          {/* Affiche imprimable Grand Format */}
          <div className="max-w-md mx-auto p-6 rounded-2xl border-4 border-amber-500 bg-gradient-to-b from-[#2A0932] via-[#3B0E47] to-[#1E0624] text-white text-center shadow-xl space-y-4 print:border-black print:text-black">
            <div className="flex items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white p-1 shadow-sm border border-amber-400 shrink-0 flex items-center justify-center">
                <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <div className="text-[10px] tracking-widest uppercase font-extrabold text-amber-400">
                  STAR ENERGY SÉNÉGAL
                </div>
                <div className="text-xs text-purple-200 italic font-semibold">« Li nio ko mom ! »</div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">
                PROGRAMME DE FIDÉLITÉ PRIVILÈGE
              </h3>
              <p className="text-xs text-amber-300 font-bold mt-1">
                Scannez ce QR Code avec votre smartphone
              </p>
            </div>

            {/* QR Code géant */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-2xl border-2 border-amber-400">
              <QRCodeSVG
                value={borneQrUrl}
                size={180}
                level="H"
                includeMargin={false}
              />
            </div>

            <div className="space-y-1.5 text-xs text-purple-100">
              <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-800 text-amber-300 font-bold">
                🎁 100 POINTS DE BIENVENUE OFFERTS À L'INSCRIPTION !
              </div>
              <div className="text-[11px] text-gray-300">
                1. Scannez le QR Code → 2. Indiquez Nom & Matricule → 3. Cumulez à chaque passage (1 000 F = 10 pts)
              </div>
              <div className="text-[10px] text-purple-300 font-mono pt-1">
                Station : {profil?.station_nom || "Hann Maristes"} • Lien direct : {window.location.origin}/espace-fidelite
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── ONGLET 4 : CATALOGUE DES RÉCOMPENSES ────────────────── */}
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
          <div className="mt-6 p-4 rounded-xl border bg-gradient-to-r from-amber-50/50 via-white to-amber-50/50" style={{ borderColor: T.line }}>
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

      {/* ────────────────── ONGLET 5 : HISTORIQUE DES TRANSACTIONS ────────────────── */}
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
                    <th className="pb-2">Moyen / Wallet</th>
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
                        <td className="py-2.5 text-gray-700 font-medium">
                          {tx.mode_paiement || "—"}
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

      {/* ────────────────── MODAL SCANNER QR CODE ────────────────── */}
      <CameraScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* ────────────────── MODAL CÉLÉBRATION DE PAIEMENT ────────────────── */}
      {celebrationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border-2 border-emerald-500 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 text-3xl flex items-center justify-center mx-auto shadow-inner">
              ✓
            </div>

            <div>
              <div className="text-xs uppercase font-extrabold text-emerald-600 tracking-wider">
                Transaction Confirmée !
              </div>
              <h3 className="text-lg font-black text-gray-900 mt-0.5">
                +{F(celebrationModal.pointsGagnes)} points crédités !
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Client : <strong>{celebrationModal.membre?.nom}</strong>
              </p>
            </div>

            {/* Encadré Nouveau Solde */}
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-1">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold block">
                NOUVEAU SOLDE DE POINTS
              </span>
              <div className="text-3xl font-black text-amber-400 tabular">
                {F(celebrationModal.nouveauSolde)} <span className="text-sm font-normal text-white">pts</span>
              </div>
              <div className="text-[11px] text-emerald-400">
                Règlement par <strong>{celebrationModal.wallet}</strong>
                {celebrationModal.montant ? ` (${F(celebrationModal.montant)} FCFA)` : ""}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCelebrationModal(null)}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-gray-900 text-white hover:bg-black shadow-md"
              >
                Terminer & Retour au Guichet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL NOUVEL ADHÉRENT ────────────────── */}
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
                    className="w-full text-xs border rounded-lg p-2.5 font-mono"
                    style={{ borderColor: T.line }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Matricule Véhicule *</label>
                  <input
                    type="text"
                    placeholder="ex: DK-1234-AZ"
                    value={newMembreForm.immatriculation}
                    onChange={(e) => setNewMembreForm({ ...newMembreForm, immatriculation: e.target.value.toUpperCase() })}
                    className="w-full text-xs border rounded-lg p-2.5 uppercase font-mono"
                    style={{ borderColor: T.line }}
                    required
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
                  ✓ Créer la Carte (+100 pts)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── MODAL CARTE VIRTUELLE AVEC QR CODE RÉEL ────────────────── */}
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
            <div className="bg-gradient-to-tr from-[#25082E] via-[#431454] to-[#1E0624] text-white rounded-2xl p-5 shadow-xl border-2 border-amber-500/60 relative overflow-hidden flex flex-col justify-between space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white p-0.5 shadow-sm border border-amber-400 shrink-0 flex items-center justify-center">
                    <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[9px] tracking-widest text-amber-400 font-extrabold uppercase">
                      STAR ENERGY SÉNÉGAL
                    </div>
                    <div className="text-sm font-extrabold text-white mt-0.5">{showCardModal.nom}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 uppercase shadow-xs">
                    {showCardModal.statut_palier || "Bronze"}
                  </span>
                </div>
              </div>

              {/* QR Code SVG Réel & Scannable */}
              <div className="p-3 bg-white rounded-xl flex items-center justify-center shadow-inner">
                <QRCodeSVG
                  value={`STARFID:${showCardModal.id}`}
                  size={120}
                  level="H"
                />
              </div>

              <div className="flex justify-between items-end text-[10px]">
                <div>
                  <span className="text-amber-200/80 block text-[8px] uppercase tracking-wider font-semibold">TÉLÉPHONE & VÉHICULE</span>
                  <span className="font-bold text-gray-100">{showCardModal.telephone}</span>
                  {showCardModal.immatriculation && (
                    <span className="block font-mono text-amber-300 font-semibold">{showCardModal.immatriculation}</span>
                  )}
                  <span className="block text-[9px] text-amber-300 italic mt-0.5">Li nio ko mom !</span>
                </div>
                <div className="text-right">
                  <span className="text-amber-200/80 block text-[8px] uppercase tracking-wider font-semibold">SOLDE ACTUEL</span>
                  <span className="font-black text-amber-400 text-lg leading-tight">{F(showCardModal.points_solde)} pts</span>
                  <span className="text-[9px] font-mono text-purple-300 block">{showCardModal.numero_carte}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <a
                href={`/espace-fidelite?client=${showCardModal.id}`}
                target="_blank"
                rel="noreferrer"
                className="w-1/2 py-2 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-500 text-center flex items-center justify-center gap-1"
              >
                <span>Espace Client ↗</span>
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="w-1/2 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-black flex items-center justify-center gap-1.5"
              >
                <span>🖨️ Imprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
