import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  getMembreFidelite,
  saveMembreFidelite,
  crediterPointsFidelite,
  listTransactionsFidelite,
  listRecompensesFidelite,
  calculerPointsFidelite,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Loading } from "../components/ui";

const PALIERS = [
  { nom: "Bronze", min: 0, max: 499, color: "#CD7F32", badge: "bg-amber-100 text-amber-900 border-amber-300" },
  { nom: "Silver", min: 500, max: 1499, color: "#9CA3AF", badge: "bg-slate-100 text-slate-800 border-slate-300" },
  { nom: "Gold", min: 1500, max: 3999, color: "#F59E0B", badge: "bg-yellow-100 text-yellow-900 border-yellow-400" },
  { nom: "Platine", min: 4000, max: Infinity, color: "#6366F1", badge: "bg-indigo-100 text-indigo-900 border-indigo-300" },
];

const WALLETS = [
  { id: "WAVE", label: "Wave", icon: "🐧", color: "bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100" },
  { id: "OM", label: "Orange Money", icon: "🟧", color: "bg-orange-50 text-orange-800 border-orange-300 hover:bg-orange-100" },
  { id: "PETROSEN", label: "Paiement Petrosen", icon: "⛽", color: "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100" },
  { id: "CB", label: "Carte Bancaire", icon: "💳", color: "bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100" },
  { id: "ESPECES", label: "Espèces", icon: "💵", color: "bg-green-50 text-green-800 border-green-300 hover:bg-green-100" },
  { id: "CODE_ELECTRONIQUE", label: "Code Électronique", icon: "📟", color: "bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100" },
  { id: "TICKETS", label: "Ticket Valeur", icon: "🎫", color: "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100" },
];

export default function EspaceClientFidelite() {
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const clientIdFromUrl = paramId || searchParams.get("client") || searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [membre, setMembre] = useState(null);
  const [recompenses, setRecompenses] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [msg, setMsg] = useState({ text: "", type: "ok" });

  // Mode inscription (première visite)
  const [showEnrollement, setShowEnrollement] = useState(false);
  const [enrollementForm, setEnrollementForm] = useState({
    nom: "",
    telephone: "",
    immatriculation: "",
    carburant_prefere: "GASOIL",
  });

  // Modal Paiement / Simulation passage
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState("WAVE");
  const [paymentType, setPaymentType] = useState("CARBURANT_MONTANT");
  const [paymentMontant, setPaymentMontant] = useState("10000");
  const [paymentRef, setPaymentRef] = useState("");
  const [celebration, setCelebration] = useState(null);

  const flash = (text, type = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "ok" }), 4500);
  };

  const loadClientData = async (targetId) => {
    setLoading(true);
    try {
      const recs = await listRecompensesFidelite().catch(() => []);
      setRecompenses(recs || []);

      const searchKey = targetId || localStorage.getItem("star_energy_fid_client_id") || "mem-1";
      const found = await getMembreFidelite(searchKey);

      if (found) {
        setMembre(found);
        localStorage.setItem("star_energy_fid_client_id", found.id);
        const txs = await listTransactionsFidelite(found.id).catch(() => []);
        setTransactions(txs || []);
        setShowEnrollement(false);
      } else {
        setMembre(null);
        setShowEnrollement(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClientData(clientIdFromUrl);
  }, [clientIdFromUrl]);

  // Points calculés en direct pour le paiement
  const pointsSimules = useMemo(() => {
    const val = n(paymentMontant) || 0;
    if (val <= 0) return 0;
    return calculerPointsFidelite(paymentType, val);
  }, [paymentType, paymentMontant]);

  // Palier actuel & progression
  const palierActuel = useMemo(() => {
    if (!membre) return PALIERS[0];
    const cumules = n(membre.points_cumules) || n(membre.points_solde) || 0;
    return (
      PALIERS.slice().reverse().find((p) => cumules >= p.min) || PALIERS[0]
    );
  }, [membre]);

  const prochainPalier = useMemo(() => {
    const idx = PALIERS.findIndex((p) => p.nom === palierActuel.nom);
    return idx < PALIERS.length - 1 ? PALIERS[idx + 1] : null;
  }, [palierActuel]);

  const pointsPourProchainPalier = useMemo(() => {
    if (!prochainPalier || !membre) return 0;
    const cumules = n(membre.points_cumules) || 0;
    return Math.max(0, prochainPalier.min - cumules);
  }, [prochainPalier, membre]);

  // Prochaine récompense accessible
  const prochaineRecompense = useMemo(() => {
    if (!membre || recompenses.length === 0) return null;
    const solde = n(membre.points_solde) || 0;
    const accessibles = recompenses.filter((r) => r.points_requis <= solde);
    const nonAccessibles = recompenses
      .filter((r) => r.points_requis > solde)
      .sort((a, b) => a.points_requis - b.points_requis);

    return {
      disponibles: accessibles,
      suivante: nonAccessibles[0] || null,
      pointsManquants: nonAccessibles[0] ? nonAccessibles[0].points_requis - solde : 0,
    };
  }, [membre, recompenses]);

  // ── INSCRIRE UN NOUVEAU CLIENT (Première visite) ──
  const handleEnrollerClient = async (e) => {
    e.preventDefault();
    if (!enrollementForm.nom.trim() || !enrollementForm.telephone.trim()) {
      return flash("Veuillez renseigner au moins votre nom et votre numéro de téléphone", "err");
    }

    const res = await saveMembreFidelite({
      ...enrollementForm,
      points_solde: 100, // 100 points de bienvenue offerts !
      points_cumules: 100,
      points_derniere_transaction: 100,
    });

    if (res.ok) {
      localStorage.setItem("star_energy_fid_client_id", res.membre.id);
      setMembre(res.membre);
      setShowEnrollement(false);
      flash(`🎉 Bienvenue ${res.membre.nom} ! Votre carte privilège a été créée avec 100 points offerts !`, "ok");
      const txs = await listTransactionsFidelite(res.membre.id).catch(() => []);
      setTransactions(txs || []);
    } else {
      flash("Erreur lors de la création de votre profil. Veuillez réessayer.", "err");
    }
  };

  // ── VALIDER UN PAIEMENT & CRÉDITER LES POINTS AUTOMATIQUEMENT ──
  const handleValiderPaiement = async (e) => {
    e.preventDefault();
    if (!membre) return;
    if (pointsSimules <= 0) return flash("Veuillez saisir un montant valide", "err");

    const montantNum = n(paymentMontant);
    const res = await crediterPointsFidelite({
      membre_id: membre.id,
      station_id: membre.station_id || "st-hann",
      type_operation: paymentType.startsWith("CARBURANT") ? "CARBURANT" : paymentType,
      montant: montantNum,
      points: pointsSimules,
      mode_paiement: selectedWallet,
      reference_piece: paymentRef.trim() || `Paiement ${selectedWallet} (${paymentType})`,
      notes: `Règlement par ${selectedWallet} - Véhicule : ${membre.immatriculation || "N/A"}`,
      created_by: `Borne Client (${selectedWallet})`,
    });

    if (res.ok) {
      setMembre(res.membre);
      setShowPaymentModal(false);
      setPaymentMontant("");
      setPaymentRef("");
      setCelebration({
        pointsGagnes: pointsSimules,
        nouveauSolde: res.nouveau_solde,
        montant: montantNum,
        wallet: selectedWallet,
        date: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      });
      loadClientData(res.membre.id);
    } else {
      flash(res.error || "Erreur lors de l'enregistrement de la transaction", "err");
    }
  };

  if (loading) return <Loading label="Chargement de votre Espace Fidélité..." />;

  // URL du QR Code (encode le lien d'accès direct au profil)
  const qrUrl = membre
    ? `${window.location.origin}/espace-fidelite?client=${membre.id}`
    : `${window.location.origin}/espace-fidelite?nouveau=1`;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-6 px-3 sm:px-6">
      <div className="max-w-xl mx-auto space-y-5">
        {/* En-tête officiel STAR ENERGY */}
        <div className="flex items-center justify-between border-b border-purple-900/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white p-1 shadow-md border border-amber-400 shrink-0 flex items-center justify-center">
              <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-[10px] tracking-widest uppercase font-extrabold text-amber-400">
                STAR ENERGY SÉNÉGAL
              </div>
              <h1 className="text-base font-black text-white">Espace Fidélité & Privilège</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/fidelite"
              className="text-[11px] font-semibold text-purple-300 hover:text-white bg-purple-950/80 px-2.5 py-1 rounded-lg border border-purple-800"
            >
              Mode Guichet 🔐
            </Link>
          </div>
        </div>

        {/* Message Flash */}
        {msg.text && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold border flex justify-between items-center animate-fade-in ${
              msg.type === "err" ? "bg-rose-950/80 border-rose-800 text-rose-200" : "bg-emerald-950/80 border-emerald-800 text-emerald-200"
            }`}
          >
            <span>{msg.text}</span>
            <button type="button" onClick={() => setMsg({ text: "", type: "ok" })} className="text-white ml-2">
              ✕
            </button>
          </div>
        )}

        {/* ────────── ÉCRAN 1 : FORMULAIRE D'AUTO-ENRÔLEMENT (PREMIÈRE VISITE) ────────── */}
        {showEnrollement && (
          <div className="bg-gradient-to-b from-[#2A0932] to-[#1E0624] rounded-2xl p-5 border-2 border-amber-500 shadow-2xl space-y-4 animate-fade-in">
            <div className="text-center space-y-1">
              <span className="text-3xl">🎁</span>
              <h2 className="text-lg font-black text-amber-400">Rejoindre le Programme Privilège</h2>
              <p className="text-xs text-purple-200">
                Créez votre profil en 30 secondes et recevez <strong className="text-amber-300">100 points de bienvenue offerts</strong> !
              </p>
            </div>

            <form onSubmit={handleEnrollerClient} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Nom et Prénom *
                </label>
                <input
                  type="text"
                  placeholder="ex: Mamadou Ndiaye"
                  value={enrollementForm.nom}
                  onChange={(e) => setEnrollementForm({ ...enrollementForm, nom: e.target.value })}
                  className="w-full text-xs rounded-xl p-3 bg-purple-950/60 border border-purple-800 text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-purple-200 mb-1">
                    Numéro de Téléphone *
                  </label>
                  <input
                    type="tel"
                    placeholder="ex: 77 123 45 67"
                    value={enrollementForm.telephone}
                    onChange={(e) => setEnrollementForm({ ...enrollementForm, telephone: e.target.value })}
                    className="w-full text-xs rounded-xl p-3 bg-purple-950/60 border border-purple-800 text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-purple-200 mb-1">
                    Matricule du Véhicule *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: DK-4501-BB"
                    value={enrollementForm.immatriculation}
                    onChange={(e) => setEnrollementForm({ ...enrollementForm, immatriculation: e.target.value.toUpperCase() })}
                    className="w-full text-xs rounded-xl p-3 bg-purple-950/60 border border-purple-800 text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono uppercase"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Carburant Habituel
                </label>
                <select
                  value={enrollementForm.carburant_prefere}
                  onChange={(e) => setEnrollementForm({ ...enrollementForm, carburant_prefere: e.target.value })}
                  className="w-full text-xs rounded-xl p-3 bg-purple-950 border border-purple-800 text-white font-bold"
                >
                  <option value="GASOIL">Gasoil</option>
                  <option value="SUPER">Super Carburant</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl font-black text-xs text-slate-950 shadow-lg transition-all hover:opacity-95 flex items-center justify-center gap-2 mt-2"
                style={{ background: T.gold }}
              >
                <span>✨ Activer ma Carte & Obtenir mon QR Code Personnel</span>
              </button>
            </form>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setShowEnrollement(false);
                  loadClientData("mem-1");
                }}
                className="text-xs text-purple-300 hover:text-white underline"
              >
                Déjà adhérent ? Charger une démo (Cheikh Ndiaye)
              </button>
            </div>
          </div>
        )}

        {/* ────────── ÉCRAN 2 : ESPACE CLIENT CONNECTÉ ────────── */}
        {membre && !showEnrollement && (
          <div className="space-y-4 animate-fade-in">
            {/* CARTE PRIVILÈGE VIRTUELLE AVEC QR CODE PERSONNEL */}
            <div className="bg-gradient-to-tr from-[#25082E] via-[#431454] to-[#1E0624] text-white rounded-2xl p-5 shadow-2xl border-2 border-amber-500/70 relative overflow-hidden">
              <div className="absolute right-[-30px] top-[-30px] w-36 h-36 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

              {/* Ligne 1 : En-tête Carte */}
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl overflow-hidden bg-white p-0.5 shadow-sm border border-amber-400 shrink-0 flex items-center justify-center">
                    <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[9px] tracking-widest uppercase text-amber-400 font-extrabold">
                      CARTE PRIVILÈGE CLIENT
                    </div>
                    <div className="text-base font-black text-white">{membre.nom}</div>
                    <div className="text-[11px] text-purple-200 flex items-center gap-2 mt-0.5 font-mono">
                      <span>📞 {membre.telephone}</span>
                      {membre.immatriculation && <span>🚗 {membre.immatriculation}</span>}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-block text-[10px] font-black px-2.5 py-1 rounded-md uppercase border ${palierActuel.badge}`}
                  >
                    {palierActuel.nom}
                  </span>
                  <div className="text-[9px] text-purple-300 mt-1 font-mono">
                    N° {membre.numero_carte}
                  </div>
                </div>
              </div>

              {/* Ligne 2 : GRAND AFFICHAGE DU SOLDE (Mis en avant) */}
              <div className="my-4 p-4 rounded-xl bg-purple-950/80 border border-purple-800/80 text-center shadow-inner relative">
                <div className="text-[10px] uppercase font-bold text-purple-300 tracking-wider">
                  SOLDE DISPONIBLE
                </div>
                <div className="text-3xl sm:text-4xl font-black text-amber-400 tabular my-0.5">
                  {F(membre.points_solde)}{" "}
                  <span className="text-base font-bold text-white">points</span>
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center justify-center gap-1">
                  <span>✨</span>
                  <span>Valeur fidélité : {F((n(membre.points_solde) || 0) * 10)} FCFA de réduction</span>
                </div>

                {membre.points_derniere_transaction > 0 && (
                  <div className="mt-2 text-[10px] text-amber-200 bg-amber-950/50 py-1 px-2 rounded-md inline-block border border-amber-700/50">
                    ⚡ Dernière transaction : <strong>+{F(membre.points_derniere_transaction)} pts</strong> gagnés
                  </div>
                )}
              </div>

              {/* Ligne 3 : QR CODE PERSONNEL POUR IDENTIFICATION EN CAISSE */}
              <div className="p-3 bg-white rounded-xl text-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                <div className="p-1.5 bg-white rounded-lg border border-gray-200 shrink-0">
                  <QRCodeSVG
                    value={`STARFID:${membre.id}`}
                    size={110}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <div className="text-[11px] font-bold text-gray-900 uppercase">
                    Votre QR Code Personnel
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    Présentez ce QR Code au pompiste ou au guichet à chaque visite pour être identifié et cumuler vos points.
                  </p>
                  <div className="mt-1 text-[10px] font-mono font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded inline-block">
                    Code : {membre.numero_carte}
                  </div>
                </div>
              </div>

              {/* Ligne 4 : Barre de Progression vers le Prochain Palier */}
              {prochainPalier && (
                <div className="mt-4 pt-3 border-t border-purple-900/80">
                  <div className="flex justify-between text-[11px] text-purple-200 mb-1">
                    <span>
                      Progression vers le statut <strong>{prochainPalier.nom}</strong>
                    </span>
                    <span className="font-bold text-amber-300">
                      Plus que {F(pointsPourProchainPalier)} pts
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-purple-950 overflow-hidden border border-purple-800">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(((n(membre.points_cumules) || 0) / prochainPalier.min) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* BOUTON D'ACTION PRINCIPAL : SIMULER / ENCAISSER PASSAGE AVEC WALLET */}
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>Passage en Station & Choix du Wallet</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Règle de cumul : <strong>1 000 FCFA = 10 points</strong> crédités automatiquement
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-black text-xs text-slate-950 shadow-md transition-all hover:opacity-95 flex items-center justify-center gap-1.5 shrink-0"
                style={{ background: T.gold }}
              >
                <span>💳 Sélectionner Wallet & Payer</span>
              </button>
            </div>

            {/* ALERTE DE CÉLÉBRATION (APRÈS PAIEMENT) */}
            {celebration && (
              <div className="bg-emerald-950/90 border-2 border-emerald-500 text-emerald-100 rounded-2xl p-4 shadow-xl animate-bounce-short">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎉</span>
                    <div>
                      <div className="text-xs font-black uppercase text-emerald-300">
                        Paiement Réussi & Points Crédités !
                      </div>
                      <div className="text-sm font-bold text-white">
                        +{F(celebration.pointsGagnes)} points ajoutés à votre compte
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCelebration(null)}
                    className="text-emerald-400 hover:text-white font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 text-xs border-t border-emerald-800/80 pt-2 flex justify-between">
                  <span>Moyen : <strong>{celebration.wallet}</strong> ({F(celebration.montant)} F)</span>
                  <span className="text-amber-300 font-extrabold">Nouveau Solde : {F(celebration.nouveauSolde)} pts</span>
                </div>
              </div>
            )}

            {/* RÉCOMPENSES & AVANTAGES DISPONIBLES */}
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏆</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Avantages & Récompenses Disponibles
                  </h3>
                </div>
                {prochaineRecompense?.suivante && (
                  <span className="text-[10px] text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800">
                    Prochaine : dans {prochaineRecompense.pointsManquants} pts
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {recompenses.map((rec) => {
                  const solde = n(membre.points_solde) || 0;
                  const accessible = solde >= rec.points_requis;

                  return (
                    <div
                      key={rec.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                        accessible
                          ? "bg-purple-950/50 border-purple-600 text-white"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 opacity-70"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <span>{rec.categorie === "LAVAGE" ? "🚿" : rec.categorie === "CARBURANT" ? "⛽" : "🛒"}</span>
                          <span className={accessible ? "text-white" : "text-slate-300"}>{rec.titre}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{rec.description}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-black px-2 py-0.5 rounded border ${
                            accessible
                              ? "bg-amber-400 text-slate-950 border-amber-300"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {rec.points_requis} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* HISTORIQUE RÉCENT DES TRANSACTIONS */}
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Historique de vos Passages ({transactions.length})
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400">Total cumulé : {F(membre.points_cumules)} pts</span>
              </div>

              {transactions.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  Aucun passage enregistré pour le moment.
                </div>
              ) : (
                <div className="divide-y divide-slate-700 text-xs">
                  {transactions.slice(0, 5).map((tx) => {
                    const isCredit = tx.sens === "CREDIT" || tx.points > 0;
                    return (
                      <div key={tx.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-white">
                            {tx.type_operation} {tx.mode_paiement ? `• ${tx.mode_paiement}` : ""}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {fmtDate(tx.created_at)} {tx.montant ? `• ${F(tx.montant)} FCFA` : ""}
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`font-black text-xs tabular ${
                              isCredit ? "text-emerald-400" : "text-purple-400"
                            }`}
                          >
                            {isCredit ? "+" : ""}{tx.points} pts
                          </span>
                          <div className="text-[10px] text-slate-400">Solde : {tx.solde_apres} pts</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PIED DE CARTE & ACTIONS CLIENT */}
            <div className="pt-2 flex flex-wrap gap-2 justify-between items-center text-xs text-slate-400">
              <button
                type="button"
                onClick={() => window.print()}
                className="text-slate-300 hover:text-white underline flex items-center gap-1"
              >
                <span>🖨️ Imprimer ma carte</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEnrollement(true);
                  setMembre(null);
                }}
                className="text-amber-400 hover:text-amber-300 underline"
              >
                + Enregistrer un autre client
              </button>
            </div>
          </div>
        )}

        {/* ────────── MODAL : SÉLECTION WALLET & PAIEMENT EN STATION ────────── */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
            <div className="bg-slate-900 rounded-2xl max-w-md w-full p-5 border-2 border-amber-500 shadow-2xl text-white space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💳</span>
                  <div>
                    <h3 className="font-bold text-sm text-white">Sélection du Wallet & Paiement</h3>
                    <p className="text-[10px] text-slate-400">Passage en station pour {membre?.nom}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleValiderPaiement} className="space-y-3.5">
                {/* 1. Choix de la prestation */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Prestation effectuée :
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPaymentType("CARBURANT_MONTANT")}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        paymentType === "CARBURANT_MONTANT"
                          ? "bg-amber-400 text-slate-950 font-bold border-amber-300"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      ⛽ Carburant
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType("LAVAGE")}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        paymentType === "LAVAGE"
                          ? "bg-amber-400 text-slate-950 font-bold border-amber-300"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      🚿 Lavage
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType("BOUTIQUE")}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        paymentType === "BOUTIQUE"
                          ? "bg-amber-400 text-slate-950 font-bold border-amber-300"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      🛒 Boutique
                    </button>
                  </div>
                </div>

                {/* 2. Choix du Wallet / Moyen de paiement */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Sélectionnez votre moyen de paiement (Wallet) :
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {WALLETS.map((w) => {
                      const isSelected = selectedWallet === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSelectedWallet(w.id)}
                          className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
                            isSelected
                              ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black border-amber-300 ring-2 ring-amber-400"
                              : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          <span className="text-base">{w.icon}</span>
                          <span className="truncate">{w.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Montant du paiement & calcul auto des points */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Montant à payer (FCFA) *
                    </label>
                    <input
                      type="number"
                      value={paymentMontant}
                      onChange={(e) => setPaymentMontant(e.target.value)}
                      placeholder="ex: 10000"
                      className="w-full text-sm font-bold rounded-xl p-2.5 bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      required
                      min="100"
                      step="500"
                    />
                  </div>

                  <div className="bg-purple-950/80 rounded-xl p-2.5 border border-purple-800 flex flex-col justify-center text-center">
                    <span className="text-[10px] uppercase font-bold text-purple-300">Points à créditer</span>
                    <strong className="text-xl font-black text-amber-400 tabular">
                      +{F(pointsSimules)} pts
                    </strong>
                    <span className="text-[9px] text-slate-400">1 000 F = 10 pts</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Référence de transaction / N° Ticket (optionnel)
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="ex: WV-992019 ou TK-129"
                    className="w-full text-xs rounded-xl p-2 bg-slate-800 border border-slate-700 text-white"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="w-1/3 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 py-2.5 rounded-xl text-xs font-black text-slate-950 shadow-md transition-all hover:opacity-95 flex items-center justify-center gap-1.5"
                    style={{ background: T.gold }}
                  >
                    <span>✓ Confirmer & Créditer (+{pointsSimules} pts)</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
