import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listJaugesCuves,
  saveJaugeCuve,
  listLivraisons,
  saveLivraison,
  listDescentes,
  saveRapportDepotage,
  listRapportsDepotage,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Loading } from "../components/ui";

export default function CuvesCarburant() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";

  const [ref, setRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jauge"); // jauge | depotage | rapports | ecarts
  const [msg, setMsg] = useState({ text: "", type: "ok" });

  // Jauge physique & Rapprochement quotidien
  const [date, setDate] = useState(todayISO());
  const [produitCuve, setProduitCuve] = useState("GASOIL");
  const [stockPhysique, setStockPhysique] = useState("");
  const [hauteurCm, setHauteurCm] = useState("");
  const [jauges, setJauges] = useState([]);
  const [descentes, setDescentes] = useState([]);
  const [livraisons, setLivraisons] = useState([]);
  const [rapportsDepotage, setRapportsDepotage] = useState([]);

  // ── Formulaire Rapport de Dépotage Complet ──
  const [depotageForm, setDepotageForm] = useState({
    date: todayISO(),
    heure_debut: "10:00",
    heure_fin: "11:15",
    produit: "GASOIL",
    cuve_id: "",
    numero_bl: "",
    fournisseur: "TOTAL Energies Marketing",
    transporteur: "STT Carburants Sénégal",
    immatriculation_camion: "",
    nom_chauffeur: "",
    numero_permis: "",
    volume_bl: "",
    // Sécurité & Qualité
    prise_de_terre_branchee: true,
    extincteurs_en_place: true,
    moteur_coupe_cales: true,
    scelles_conformes: true,
    numeros_scelles: "",
    test_eau_fond_cuve: false, // false = pas d'eau (conforme)
    test_eau_camion: false, // false = absence d'eau
    densite_mesuree: "0.835",
    temperature_c: "28",
    // Jauges avant / après
    jauge_avant_cm: "",
    jauge_avant_litres: "",
    jauge_apres_cm: "",
    jauge_apres_litres: "",
    volume_decharge_reel: "",
    index_camion_avant: "",
    index_camion_apres: "",
    responsable_reception: profil?.nom_complet || "Chef de Station",
    observations: "",
  });

  // Modal Visualisation & Impression Procès-Verbal
  const [pvModal, setPvModal] = useState(null);

  const flash = (text, type = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "ok" }), 4500);
  };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const [j, l, des, rap] = await Promise.all([
        listJaugesCuves(stationId),
        listLivraisons(stationId).catch(() => []),
        listDescentes(stationId).catch(() => []),
        listRapportsDepotage(stationId).catch(() => []),
      ]);
      setJauges(j || []);
      setLivraisons(l || []);
      setDescentes(des || []);
      setRapportsDepotage(rap || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  // Cuves référentiel
  const cuves = (ref?.cuves || []).filter((c) => !stationId || c.station_id === stationId);
  const cuveGasoil = cuves.find((c) => c.produit === "GASOIL") || { id: "cuve-gasoil-1", produit: "GASOIL", capacite_l: 30000 };
  const cuveSuper = cuves.find((c) => c.produit === "SUPER") || { id: "cuve-super-1", produit: "SUPER", capacite_l: 20000 };

  // Dernières jauges
  const lastJaugeGasoil = jauges.find((j) => j.produit === "GASOIL") || { volume_physique: 0, date: todayISO() };
  const lastJaugeSuper = jauges.find((j) => j.produit === "SUPER") || { volume_physique: 0, date: todayISO() };

  // Consommation estimée
  const computeConsoJour = (prod) => {
    const prodDes = descentes.filter((d) => (d.produit || "").toUpperCase() === prod);
    if (prodDes.length === 0) return prod === "GASOIL" ? 2500 : 1800;
    const totalVendu = prodDes.reduce((sum, d) => sum + (n(d.volume_vendu) || 0), 0);
    const uniqueDates = new Set(prodDes.map((d) => d.date)).size || 1;
    return Math.max(100, Math.round(totalVendu / uniqueDates));
  };

  const consoJourGasoil = computeConsoJour("GASOIL");
  const consoJourSuper = computeConsoJour("SUPER");
  const autonomieGasoil = lastJaugeGasoil.volume_physique > 0 ? (lastJaugeGasoil.volume_physique / consoJourGasoil).toFixed(1) : 0;
  const autonomieSuper = lastJaugeSuper.volume_physique > 0 ? (lastJaugeSuper.volume_physique / consoJourSuper).toFixed(1) : 0;

  const capaciteActive = produitCuve === "GASOIL" ? cuveGasoil.capacite_l : cuveSuper.capacite_l;
  const stockTheoriqueEstime = produitCuve === "GASOIL" ? lastJaugeGasoil.volume_physique : lastJaugeSuper.volume_physique;
  const ecartCuve = stockPhysique !== "" ? n(stockPhysique) - stockTheoriqueEstime : 0;
  const tauxCoulagePct = stockPhysique !== "" && stockTheoriqueEstime > 0 ? (ecartCuve / stockTheoriqueEstime) * 100 : 0;
  const toleranceRespectee = Math.abs(tauxCoulagePct) <= 0.3;

  // Calculs en temps réel pour le dépotage en cours
  const cuveDepotage = depotageForm.produit === "GASOIL" ? cuveGasoil : cuveSuper;
  const stockAvantCuve = depotageForm.jauge_avant_litres !== "" ? n(depotageForm.jauge_avant_litres) : (depotageForm.produit === "GASOIL" ? lastJaugeGasoil.volume_physique : lastJaugeSuper.volume_physique);
  const creuxDisponible = Math.max(0, cuveDepotage.capacite_l - stockAvantCuve);
  const volumeBlNum = n(depotageForm.volume_bl) || 0;
  const risqueDebordement = volumeBlNum > 0 && volumeBlNum > creuxDisponible;

  // Calcul volume réel dépoté & écart
  const volumeReelDepote = useMemo(() => {
    if (depotageForm.volume_decharge_reel !== "") return n(depotageForm.volume_decharge_reel);
    if (depotageForm.jauge_apres_litres !== "" && depotageForm.jauge_avant_litres !== "") {
      return Math.max(0, n(depotageForm.jauge_apres_litres) - n(depotageForm.jauge_avant_litres));
    }
    return 0;
  }, [depotageForm.volume_decharge_reel, depotageForm.jauge_apres_litres, depotageForm.jauge_avant_litres]);

  const ecartDepotageLitres = volumeReelDepote > 0 ? volumeReelDepote - volumeBlNum : 0;
  const ecartDepotagePct = volumeBlNum > 0 && volumeReelDepote > 0 ? (ecartDepotageLitres / volumeBlNum) * 100 : 0;
  // Tolérance réglementaire standard dépotage pétrolier : ±0.20%
  const toleranceDepotageOk = Math.abs(ecartDepotagePct) <= 0.20;

  // Pré-remplir la jauge avant avec la dernière jauge
  const handlePreRemplirJaugeAvant = () => {
    const last = depotageForm.produit === "GASOIL" ? lastJaugeGasoil : lastJaugeSuper;
    setDepotageForm((prev) => ({
      ...prev,
      jauge_avant_litres: last.volume_physique || 0,
      jauge_avant_cm: last.hauteur_cm || "",
    }));
    flash("Jauge avant pré-remplie avec le stock mesuré précédent !");
  };

  const handleEnregistrerJauge = async (e) => {
    e.preventDefault();
    if (!stockPhysique) return flash("Veuillez saisir le volume physique mesuré", "err");

    const payload = {
      station_id: stationId,
      date,
      produit: produitCuve,
      hauteur_cm: n(hauteurCm),
      volume_physique: n(stockPhysique),
      stock_theorique: stockTheoriqueEstime,
      ecart_litres: ecartCuve,
      operateur: profil?.nom_complet || "Responsable Stock",
    };

    const res = await saveJaugeCuve(payload);
    if (res.ok) {
      flash("Jauge physique enregistrée et rapprochement effectué !", "ok");
      setStockPhysique("");
      setHauteurCm("");
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement de la jauge", "err");
    }
  };

  const handleValiderDepotage = async (e) => {
    e.preventDefault();
    if (!depotageForm.numero_bl.trim()) return flash("Le numéro de Bon de Livraison (BL) est obligatoire", "err");
    if (!depotageForm.volume_bl || n(depotageForm.volume_bl) <= 0) return flash("Le volume du BL doit être supérieur à zéro", "err");
    if (!depotageForm.jauge_apres_litres || n(depotageForm.jauge_apres_litres) <= 0) {
      return flash("Veuillez saisir la jauge mesurée après dépotage", "err");
    }

    if (risqueDebordement && !window.confirm("⚠️ ATTENTION : Le volume BL dépasse le creux disponible de la cuve ! Risque de débordement. Confirmez-vous quand même la saisie ?")) {
      return;
    }

    const payload = {
      ...depotageForm,
      station_id: stationId,
      cuve_id: cuveDepotage.id,
      volume_bl: volumeBlNum,
      volume_decharge_reel: volumeReelDepote,
      ecart_litres: ecartDepotageLitres,
      ecart_pourcentage: Number(ecartDepotagePct.toFixed(2)),
      conformite_ecart: toleranceDepotageOk,
      statut: toleranceDepotageOk ? "CONFORME" : ecartDepotageLitres < 0 ? "LITIGE" : "BONI",
    };

    const res = await saveRapportDepotage(payload);
    if (res.ok) {
      flash(`✅ Rapport de dépotage N° ${res.rapport.numero_bl} validé avec succès !`, "ok");
      setPvModal(res.rapport);
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement du rapport de dépotage", "err");
    }
  };

  const pctGasoil = Math.min(100, Math.round((lastJaugeGasoil.volume_physique / cuveGasoil.capacite_l) * 100));
  const pctSuper = Math.min(100, Math.round((lastJaugeSuper.volume_physique / cuveSuper.capacite_l) * 100));

  if (loading) return <Loading label="Chargement des Cuves & Dépotages..." />;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3">
      {/* En-tête de page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b" style={{ borderColor: T.line }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛢️</span>
            <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
              Cuves, Dépotages & Stocks Carburant
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-200">
              Rapprochement Pétrolier
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: T.muted }}>
            Jauges physiques, contrôle anti-débordement, PV de dépotage citerne et tolérances de transport
          </p>
        </div>

        {/* Boutons d'onglets */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab("jauge")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "jauge" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            📏 Jauge Quotidienne
          </button>
          <button
            type="button"
            onClick={() => setTab("depotage")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "depotage" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            🚚 Nouveau Dépotage (PV)
          </button>
          <button
            type="button"
            onClick={() => setTab("rapports")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "rapports" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            📄 Rapports de Dépotage ({rapportsDepotage.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("ecarts")}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              tab === "ecarts" ? "bg-amber-400 text-gray-900 shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            style={{ borderColor: T.line }}
          >
            📊 Historique Jauges ({jauges.length})
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

      {/* Visualisation graphique des Cuves */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Cuve Gasoil */}
        <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-gray-800">🛢️ Cuve 1 : GASOIL</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800">
              Capacité : {F(cuveGasoil.capacite_l)} L
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden my-2 border">
            <div
              className="h-full rounded-full transition-all flex items-center justify-end px-2"
              style={{
                width: `${Math.max(pctGasoil, 5)}%`,
                background: pctGasoil < 15 ? "#EF4444" : pctGasoil < 30 ? "#F59E0B" : "#3B82F6",
              }}
            >
              <span className="text-[10px] font-bold text-white tabular">{pctGasoil}%</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-600 mt-2">
            <span>Stock actuel : <strong>{F(lastJaugeGasoil.volume_physique)} L</strong></span>
            <span>Creux disponible : <strong className="text-emerald-700">{F(cuveGasoil.capacite_l - lastJaugeGasoil.volume_physique)} L</strong></span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1 flex justify-between">
            <span>Conso moy : ~{F(consoJourGasoil)} L/j</span>
            <span>Autonomie : <strong>~{autonomieGasoil} j</strong></span>
          </div>
        </div>

        {/* Cuve Super */}
        <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-gray-800">🛢️ Cuve 2 : SUPER CARBURANT</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">
              Capacité : {F(cuveSuper.capacite_l)} L
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden my-2 border">
            <div
              className="h-full rounded-full transition-all flex items-center justify-end px-2"
              style={{
                width: `${Math.max(pctSuper, 5)}%`,
                background: pctSuper < 15 ? "#EF4444" : pctSuper < 30 ? "#F59E0B" : "#10B981",
              }}
            >
              <span className="text-[10px] font-bold text-white tabular">{pctSuper}%</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-600 mt-2">
            <span>Stock actuel : <strong>{F(lastJaugeSuper.volume_physique)} L</strong></span>
            <span>Creux disponible : <strong className="text-emerald-700">{F(cuveSuper.capacite_l - lastJaugeSuper.volume_physique)} L</strong></span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1 flex justify-between">
            <span>Conso moy : ~{F(consoJourSuper)} L/j</span>
            <span>Autonomie : <strong>~{autonomieSuper} j</strong></span>
          </div>
        </div>
      </div>

      {/* ────────────────── ONGLET 1 : JAUGE QUOTIDIENNE ────────────────── */}
      {tab === "jauge" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
                Enregistrement de la Jauge Physique Quotidienne
              </h2>
              <form onSubmit={handleEnregistrerJauge} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date de la mesure</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Produit de la cuve</label>
                    <select
                      value={produitCuve}
                      onChange={(e) => setProduitCuve(e.target.value)}
                      className="w-full text-xs border rounded p-2 bg-white"
                      style={{ borderColor: T.line }}
                    >
                      <option value="GASOIL">Cuve 1 — GASOIL</option>
                      <option value="SUPER">Cuve 2 — SUPER</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Hauteur à la latte (cm)</label>
                    <input
                      type="number"
                      placeholder="ex: 185"
                      value={hauteurCm}
                      onChange={(e) => setHauteurCm(e.target.value)}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Volume physique lu au barème (Litres) *</label>
                    <input
                      type="number"
                      placeholder="ex: 18500"
                      value={stockPhysique}
                      onChange={(e) => setStockPhysique(e.target.value)}
                      className="w-full text-xs border rounded p-2 font-bold"
                      style={{ borderColor: T.line }}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90 mt-2"
                  style={{ background: T.gold }}
                >
                  ✓ Enregistrer la Jauge & Valider le Rapprochement
                </button>
              </form>
            </div>
          </div>

          {/* Rapprochement & Coulage */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>Bilan de Coulage & Écart</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b" style={{ borderColor: T.line }}>
                  <span className="text-gray-500">Capacité cuve :</span>
                  <span className="font-bold tabular">{F(capaciteActive)} L</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: T.line }}>
                  <span className="text-gray-500">Stock théorique :</span>
                  <span className="font-bold tabular">{F(stockTheoriqueEstime)} L</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: T.line }}>
                  <span className="text-gray-500">Stock physique saisi :</span>
                  <span className="font-bold text-blue-900 tabular">{stockPhysique ? F(n(stockPhysique)) : "--"} L</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-800">ÉCART (COULAGE) :</span>
                    <span className={`text-base font-extrabold tabular ${ecartCuve >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {ecartCuve > 0 ? "+" : ""}{stockPhysique ? F(ecartCuve) : 0} L
                    </span>
                  </div>
                  {stockPhysique && (
                    <div className="mt-2 p-2 rounded border bg-gray-50 text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Taux de coulage constaté :</span>
                        <strong className={`tabular ${toleranceRespectee ? "text-green-700" : "text-red-600"}`}>
                          {tauxCoulagePct > 0 ? "+" : ""}{tauxCoulagePct.toFixed(2)} %
                        </strong>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Tolérance admise :</span>
                        <span className="font-semibold">± 0.30 %</span>
                      </div>
                      <div className="pt-1">
                        {toleranceRespectee ? (
                          <div className="text-emerald-700 font-semibold flex items-center gap-1">
                            <span>✅ Conforme (dans la tolérance)</span>
                          </div>
                        ) : (
                          <div className="text-red-700 font-bold">
                            <span>🚨 Coulage Anormal (&gt; ±0.3%)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── ONGLET 2 : NOUVEAU DÉPOTAGE (PV COMPLET) ────────────────── */}
      {tab === "depotage" && (
        <form onSubmit={handleValiderDepotage} className="space-y-4">
          {/* Bloc 1 : Identification de la livraison */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🚚</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  1. Identification du Convoi & Bon de Livraison
                </h2>
              </div>
              <span className="text-[11px] text-gray-500">Procès-Verbal de Réception Citerne</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Date de dépotage *</label>
                <input
                  type="date"
                  value={depotageForm.date}
                  onChange={(e) => setDepotageForm({ ...depotageForm, date: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Heure Début</label>
                <input
                  type="time"
                  value={depotageForm.heure_debut}
                  onChange={(e) => setDepotageForm({ ...depotageForm, heure_debut: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Heure Fin</label>
                <input
                  type="time"
                  value={depotageForm.heure_fin}
                  onChange={(e) => setDepotageForm({ ...depotageForm, heure_fin: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Produit à dépoter *</label>
                <select
                  value={depotageForm.produit}
                  onChange={(e) => setDepotageForm({ ...depotageForm, produit: e.target.value })}
                  className="w-full text-xs border rounded p-2 bg-white font-bold"
                  style={{ borderColor: T.line }}
                >
                  <option value="GASOIL">GASOIL (Cuve 1 - 30 000 L)</option>
                  <option value="SUPER">SUPER (Cuve 2 - 20 000 L)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">N° Bon de Livraison (BL) *</label>
                <input
                  type="text"
                  placeholder="ex: BL-2026-8891"
                  value={depotageForm.numero_bl}
                  onChange={(e) => setDepotageForm({ ...depotageForm, numero_bl: e.target.value })}
                  className="w-full text-xs border rounded p-2 uppercase font-semibold"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Volume déclaré BL (Litres) *</label>
                <input
                  type="number"
                  placeholder="ex: 15000"
                  value={depotageForm.volume_bl}
                  onChange={(e) => setDepotageForm({ ...depotageForm, volume_bl: e.target.value })}
                  className="w-full text-xs border rounded p-2 font-black text-blue-900 bg-blue-50/50"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Fournisseur</label>
                <input
                  type="text"
                  list="fournisseurs-list"
                  placeholder="ex: TOTAL, VIVO, SAR..."
                  value={depotageForm.fournisseur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, fournisseur: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
                <datalist id="fournisseurs-list">
                  {(ref?.fournisseurs || []).map((f) => (
                    <option key={f.code || f.id} value={f.nom_fournisseur || f.code}>
                      {f.nom_fournisseur || f.code}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Société Transporteur</label>
                <input
                  type="text"
                  placeholder="ex: STT Sénégal"
                  value={depotageForm.transporteur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, transporteur: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Immatriculation Camion</label>
                <input
                  type="text"
                  placeholder="ex: DK-4402-A"
                  value={depotageForm.immatriculation_camion}
                  onChange={(e) => setDepotageForm({ ...depotageForm, immatriculation_camion: e.target.value })}
                  className="w-full text-xs border rounded p-2 uppercase"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nom du Chauffeur</label>
                <input
                  type="text"
                  placeholder="ex: Mamadou Ndiaye"
                  value={depotageForm.nom_chauffeur}
                  onChange={(e) => setDepotageForm({ ...depotageForm, nom_chauffeur: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">N° Permis Chauffeur</label>
                <input
                  type="text"
                  placeholder="ex: P-99120"
                  value={depotageForm.numero_permis}
                  onChange={(e) => setDepotageForm({ ...depotageForm, numero_permis: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>
          </div>

          {/* Bloc 2 : Sécurité, Conformité Scellés & Contrôle Anti-Débordement */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🛡️</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  2. Contrôles de Sécurité & Test Anti-Débordement
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-amber-700">Checklist Préalable Obligatoire</span>
            </div>

            {/* Alerte Anti-Débordement Dynamique */}
            <div
              className={`p-3.5 rounded-xl border mb-3 transition-all ${
                risqueDebordement
                  ? "bg-red-50 border-red-300 text-red-900"
                  : "bg-emerald-50 border-emerald-300 text-emerald-900"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <span>{risqueDebordement ? "🚨 ALERTE RISQUE DÉBORDEMENT CUVE !" : "✅ CREUX CUVE VÉRIFIÉ & CONFORME"}</span>
                </div>
                <span className="text-xs font-mono font-bold">
                  Creux libre : {F(creuxDisponible)} L
                </span>
              </div>
              <div className="text-[11px] mt-1 space-y-0.5">
                <div>
                  Capacité cuve ({depotageForm.produit}) : <strong>{F(cuveDepotage.capacite_l)} L</strong> | Stock avant dépotage : <strong>{F(stockAvantCuve)} L</strong>
                </div>
                {risqueDebordement ? (
                  <div className="text-red-700 font-extrabold mt-1">
                    Le volume BL ({F(volumeBlNum)} L) dépasse l'espace disponible de {F(volumeBlNum - creuxDisponible)} Litres !
                    Ne pas décharger la totalité de la citerne sans fractionnement.
                  </div>
                ) : (
                  <div className="text-emerald-800">
                    Le volume BL ({F(volumeBlNum)} L) s'insère parfaitement dans le creux disponible ({F(creuxDisponible)} L). Marge résiduelle : {F(creuxDisponible - volumeBlNum)} L.
                  </div>
                )}
              </div>
            </div>

            {/* Checklist Sécurité */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-gray-50/70 p-3 rounded-lg border" style={{ borderColor: T.line }}>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={depotageForm.prise_de_terre_branchee}
                  onChange={(e) => setDepotageForm({ ...depotageForm, prise_de_terre_branchee: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>Prise de terre reliée au camion</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={depotageForm.extincteurs_en_place}
                  onChange={(e) => setDepotageForm({ ...depotageForm, extincteurs_en_place: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>Extincteurs à poudre (9kg/50kg) prêts</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={depotageForm.moteur_coupe_cales}
                  onChange={(e) => setDepotageForm({ ...depotageForm, moteur_coupe_cales: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>Moteur coupé & Cales de roue posées</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={depotageForm.scelles_conformes}
                  onChange={(e) => setDepotageForm({ ...depotageForm, scelles_conformes: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>Plombs & Scellés intacts / conformes</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={!depotageForm.test_eau_camion}
                  onChange={(e) => setDepotageForm({ ...depotageForm, test_eau_camion: !e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>Test pâte à eau citerne négatif (sans eau)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={!depotageForm.test_eau_fond_cuve}
                  onChange={(e) => setDepotageForm({ ...depotageForm, test_eau_fond_cuve: !e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>Fond de cuve vérifié (sans eau)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">N° des Scellés / Plombs notés sur BL</label>
                <input
                  type="text"
                  placeholder="ex: SC-99182, SC-99183"
                  value={depotageForm.numeros_scelles}
                  onChange={(e) => setDepotageForm({ ...depotageForm, numeros_scelles: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Densité mesurée à l'hydromètre</label>
                <input
                  type="text"
                  placeholder="ex: 0.835"
                  value={depotageForm.densite_mesuree}
                  onChange={(e) => setDepotageForm({ ...depotageForm, densite_mesuree: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Température du produit (°C)</label>
                <input
                  type="text"
                  placeholder="ex: 28"
                  value={depotageForm.temperature_c}
                  onChange={(e) => setDepotageForm({ ...depotageForm, temperature_c: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>
          </div>

          {/* Bloc 3 : Mesures Volumétriques (Avant / Après) & Calcul d'écart */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between pb-2 border-b mb-3" style={{ borderColor: T.line }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📏</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  3. Mesures Volumétriques & Rapprochement de Dépotage
                </h2>
              </div>
              <button
                type="button"
                onClick={handlePreRemplirJaugeAvant}
                className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
              >
                Pré-remplir Jauge Avant ({F(stockAvantCuve)} L)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Jauge Avant */}
              <div className="p-3 bg-gray-50/70 rounded-xl border" style={{ borderColor: T.line }}>
                <h3 className="text-xs font-bold text-gray-700 mb-2">JAUGE CUVE AVANT DÉPOTAGE</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Hauteur (cm)</label>
                    <input
                      type="number"
                      placeholder="ex: 80"
                      value={depotageForm.jauge_avant_cm}
                      onChange={(e) => setDepotageForm({ ...depotageForm, jauge_avant_cm: e.target.value })}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Volume en cuve (L) *</label>
                    <input
                      type="number"
                      placeholder="ex: 8000"
                      value={depotageForm.jauge_avant_litres}
                      onChange={(e) => setDepotageForm({ ...depotageForm, jauge_avant_litres: e.target.value })}
                      className="w-full text-xs border rounded p-2 font-bold"
                      style={{ borderColor: T.line }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Jauge Après */}
              <div className="p-3 bg-gray-50/70 rounded-xl border" style={{ borderColor: T.line }}>
                <h3 className="text-xs font-bold text-gray-700 mb-2">JAUGE CUVE APRÈS DÉPOTAGE (REPOS 15 MIN)</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Hauteur (cm)</label>
                    <input
                      type="number"
                      placeholder="ex: 230"
                      value={depotageForm.jauge_apres_cm}
                      onChange={(e) => setDepotageForm({ ...depotageForm, jauge_apres_cm: e.target.value })}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Volume en cuve (L) *</label>
                    <input
                      type="number"
                      placeholder="ex: 22980"
                      value={depotageForm.jauge_apres_litres}
                      onChange={(e) => setDepotageForm({ ...depotageForm, jauge_apres_litres: e.target.value })}
                      className="w-full text-xs border rounded p-2 font-bold text-blue-900 bg-white"
                      style={{ borderColor: T.line }}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bilan du Dépotage Calculé */}
            <div className="mt-4 p-4 rounded-xl border bg-slate-900 text-white shadow-inner">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Volume Facturé (BL)</div>
                  <div className="text-lg font-black text-amber-400 tabular">{F(volumeBlNum)} L</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Volume Réel Reçu</div>
                  <div className="text-lg font-black text-emerald-400 tabular">{F(volumeReelDepote)} L</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Écart Net (L)</div>
                  <div className={`text-lg font-black tabular ${ecartDepotageLitres >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {ecartDepotageLitres > 0 ? "+" : ""}{F(ecartDepotageLitres)} L
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase">Taux d'Écart (%)</div>
                  <div className={`text-lg font-black tabular ${toleranceDepotageOk ? "text-emerald-400" : "text-rose-400"}`}>
                    {ecartDepotagePct > 0 ? "+" : ""}{ecartDepotagePct.toFixed(2)} %
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-700/80 flex flex-col sm:flex-row justify-between items-center text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Statut de conformité :</span>
                  <span
                    className={`font-extrabold px-2 py-0.5 rounded text-[11px] ${
                      toleranceDepotageOk
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                        : ecartDepotageLitres < 0
                        ? "bg-rose-950 text-rose-300 border border-rose-700"
                        : "bg-blue-950 text-blue-300 border border-blue-700"
                    }`}
                  >
                    {toleranceDepotageOk
                      ? "✓ CONFORME (Tolérance admissible standard ±0.20% respectée)"
                      : ecartDepotageLitres < 0
                      ? "🚨 LITIGE MANQUANT (> -0.20% tolérance) — Signaler au fournisseur"
                      : "ℹ️ BONI CONSTATÉ (> +0.20%)"}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-1 sm:mt-0">
                  Tolérance admissible : ± {F(Math.round(volumeBlNum * 0.002))} L
                </div>
              </div>
            </div>

            {/* Observations & Signataires */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Responsable Réception (Visa Gérant)</label>
                <input
                  type="text"
                  value={depotageForm.responsable_reception}
                  onChange={(e) => setDepotageForm({ ...depotageForm, responsable_reception: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Observations / Réserves éventuelles</label>
                <input
                  type="text"
                  placeholder="ex: Scellés intacts, dépotage effectué sans anomalie."
                  value={depotageForm.observations}
                  onChange={(e) => setDepotageForm({ ...depotageForm, observations: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl text-xs font-bold text-gray-900 shadow-md transition-all hover:opacity-95 mt-4 flex items-center justify-center gap-2"
              style={{ background: T.gold }}
            >
              <span>📄 Valider le Dépotage & Générer le Procès-Verbal Officiel</span>
            </button>
          </div>
        </form>
      )}

      {/* ────────────────── ONGLET 3 : RAPPORTS DE DÉPOTAGE (HISTORIQUE) ────────────────── */}
      {tab === "rapports" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: T.petrol }}>
                Procès-Verbaux de Dépotage Citerne ({rapportsDepotage.length})
              </h2>
              <p className="text-xs text-gray-500">Archives des réceptions camions et contrôle des écarts fournisseurs</p>
            </div>
            <button
              type="button"
              onClick={() => setTab("depotage")}
              className="text-xs px-3 py-1.5 rounded-lg font-bold text-gray-900 shadow-xs hover:opacity-90"
              style={{ background: T.gold }}
            >
              + Nouveau Dépotage
            </button>
          </div>

          {rapportsDepotage.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Aucun rapport de dépotage archivé.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2.5">Date & Heures</th>
                    <th className="pb-2.5">N° BL</th>
                    <th className="pb-2.5">Produit</th>
                    <th className="pb-2.5">Camion & Chauffeur</th>
                    <th className="pb-2.5 text-right">Volume BL</th>
                    <th className="pb-2.5 text-right">Volume Reçu</th>
                    <th className="pb-2.5 text-right">Écart Net</th>
                    <th className="pb-2.5 text-center">Statut</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {rapportsDepotage.map((r) => {
                    const isConforme = r.conformite_ecart || Math.abs(r.ecart_pourcentage || 0) <= 0.20;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5">
                          <div className="font-semibold text-gray-900">{fmtDate(r.date)}</div>
                          <div className="text-[10px] text-gray-400">{r.heure_debut || "--"} → {r.heure_fin || "--"}</div>
                        </td>
                        <td className="py-2.5 font-bold font-mono text-gray-800">{r.numero_bl}</td>
                        <td className="py-2.5 font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              r.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {r.produit}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="text-gray-900 font-semibold">{r.immatriculation_camion || "--"}</div>
                          <div className="text-[10px] text-gray-500">{r.nom_chauffeur || r.fournisseur}</div>
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular">{F(r.volume_bl)} L</td>
                        <td className="py-2.5 text-right font-bold text-blue-900 tabular">{F(r.volume_decharge_reel)} L</td>
                        <td className={`py-2.5 text-right font-extrabold tabular ${r.ecart_litres >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {r.ecart_litres > 0 ? "+" : ""}{F(r.ecart_litres)} L
                          <div className="text-[10px] text-gray-400">{r.ecart_pourcentage > 0 ? "+" : ""}{r.ecart_pourcentage}%</div>
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              isConforme
                                ? "bg-emerald-100 text-emerald-800"
                                : r.ecart_litres < 0
                                ? "bg-rose-100 text-rose-800 font-extrabold"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {isConforme ? "✓ Conforme" : r.ecart_litres < 0 ? "⚠️ Litige" : "Boni"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setPvModal(r)}
                            className="text-xs px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-300 font-semibold hover:bg-amber-100"
                          >
                            📄 Voir PV
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── ONGLET 4 : HISTORIQUE DES JAUGES ────────────────── */}
      {tab === "ecarts" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
            Historique des Rapprochements Physiques / Théoriques
          </h3>
          {jauges.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">Aucune jauge enregistrée pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left" style={{ borderColor: T.line }}>
                    <th className="pb-2">Date / Opérateur</th>
                    <th className="pb-2">Produit</th>
                    <th className="pb-2 text-right">Hauteur (cm)</th>
                    <th className="pb-2 text-right">Volume Mesuré</th>
                    <th className="pb-2 text-right">Stock Théorique</th>
                    <th className="pb-2 text-right">Écart (Coulage)</th>
                    <th className="pb-2 text-center">Tolérance (±0.3%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {jauges.map((j) => {
                    const taux = j.stock_theorique > 0 ? (j.ecart_litres / j.stock_theorique) * 100 : 0;
                    const okTol = Math.abs(taux) <= 0.3;
                    return (
                      <tr key={j.id} className="hover:bg-gray-50">
                        <td className="py-2.5">
                          <div className="font-semibold">{fmtDate(j.date)}</div>
                          <div className="text-[10px] text-gray-400">{j.operateur}</div>
                        </td>
                        <td className="py-2.5 font-bold text-gray-800">{j.produit}</td>
                        <td className="py-2.5 text-right tabular text-gray-500">{j.hauteur_cm ? `${j.hauteur_cm} cm` : "--"}</td>
                        <td className="py-2.5 text-right tabular font-bold text-blue-900">{F(j.volume_physique)} L</td>
                        <td className="py-2.5 text-right tabular text-gray-600">{F(j.stock_theorique)} L</td>
                        <td className={`py-2.5 text-right tabular font-bold ${j.ecart_litres >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {j.ecart_litres > 0 ? "+" : ""}{F(j.ecart_litres)} L
                          <div className="text-[10px] text-gray-400">{taux > 0 ? "+" : ""}{taux.toFixed(2)}%</div>
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              okTol ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800 font-bold"
                            }`}
                          >
                            {okTol ? "✓ Conforme" : "⚠️ Hors norme"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── MODAL PROCÈS-VERBAL IMPRIMABLE (A4) ────────────────── */}
      {pvModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border my-6 text-gray-900" style={{ borderColor: T.line }}>
            {/* Barre d'action supérieure */}
            <div className="flex justify-between items-center pb-3 border-b mb-4" style={{ borderColor: T.line }}>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Procès-Verbal de Dépotage Citerne (Document Légal)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 rounded bg-gray-900 text-white text-xs font-bold hover:bg-black flex items-center gap-1"
                >
                  🖨️ Imprimer PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPvModal(null)}
                  className="text-gray-400 hover:text-gray-600 font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document Imprimable */}
            <div className="border p-5 rounded-xl space-y-4 print:border-none print:p-0">
              {/* En-tête officiel STAR ENERGY */}
              <div className="flex justify-between items-start border-b pb-4" style={{ borderColor: T.line }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white p-1 shadow-xs border border-amber-400 shrink-0 flex items-center justify-center">
                    <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#56216C] uppercase tracking-widest flex items-center gap-1.5">
                      <span>STAR ENERGY SÉNÉGAL</span>
                      <span className="text-[9px] text-amber-700 italic font-semibold">« Li nio ko mom ! »</span>
                    </div>
                    <h2 className="text-base font-black text-gray-900 mt-0.5">
                      PROCÈS-VERBAL DE RÉCEPTION & DÉPOTAGE
                    </h2>
                    <div className="text-xs text-gray-600">
                      Station : <strong>{profil?.station_nom || "Station Hann Maristes"}</strong> (Code: {stationId})
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-300">
                    N° BL : {pvModal.numero_bl}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">Date : {fmtDate(pvModal.date)}</div>
                  <div className="text-[10px] text-gray-400">Heure : {pvModal.heure_debut} - {pvModal.heure_fin}</div>
                </div>
              </div>

              {/* Tableau Véhicule & Fournisseur */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">CONVOI & TRANSPORTEUR</span>
                  <div>Fournisseur : <strong>{pvModal.fournisseur}</strong></div>
                  <div>Transporteur : <strong>{pvModal.transporteur || "--"}</strong></div>
                  <div>Camion Citerne : <strong className="font-mono">{pvModal.immatriculation_camion || "--"}</strong></div>
                  <div>Chauffeur : <strong>{pvModal.nom_chauffeur || "--"}</strong> (Permis: {pvModal.numero_permis || "--"})</div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">SÉCURITÉ & CONTRÔLE QUALITÉ</span>
                  <div>Mise à la terre : <strong>{pvModal.prise_de_terre_branchee ? "✓ Conforme" : "Non"}</strong></div>
                  <div>Extincteurs : <strong>{pvModal.extincteurs_en_place ? "✓ En position" : "Non"}</strong></div>
                  <div>Test eau citerne : <strong>{pvModal.test_eau_camion ? "Présence eau" : "✓ Négatif (Pur)"}</strong></div>
                  <div>Scellés / Plombs : <strong>{pvModal.scelles_conformes ? "✓ Intacts" : "Rompue"}</strong> ({pvModal.numeros_scelles || "Vérifiés"})</div>
                </div>
              </div>

              {/* Rapprochement Volumétrique */}
              <div>
                <span className="text-[11px] font-bold text-gray-800 uppercase tracking-wider block mb-1.5">
                  Bilan Quantitatif & Tolérances Pétrolières ({pvModal.produit})
                </span>
                <table className="w-full text-xs border" style={{ borderColor: T.line }}>
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-2 text-left">Paramètre Volumétrique</th>
                      <th className="p-2 text-right">Mesure (Litres)</th>
                      <th className="p-2 text-right">Observation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: T.line }}>
                    <tr>
                      <td className="p-2 text-gray-700">Volume Facturé / Consigné sur le BL</td>
                      <td className="p-2 text-right font-bold tabular">{F(pvModal.volume_bl)} L</td>
                      <td className="p-2 text-right text-gray-500">Document d'expédition</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-gray-700">Stock Cuve Avant Dépotage</td>
                      <td className="p-2 text-right tabular">{F(pvModal.jauge_avant_litres)} L</td>
                      <td className="p-2 text-right text-gray-500">{pvModal.jauge_avant_cm ? `${pvModal.jauge_avant_cm} cm` : "--"}</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-gray-700">Stock Cuve Après Dépotage (Repos 15 min)</td>
                      <td className="p-2 text-right tabular font-semibold">{F(pvModal.jauge_apres_litres)} L</td>
                      <td className="p-2 text-right text-gray-500">{pvModal.jauge_apres_cm ? `${pvModal.jauge_apres_cm} cm` : "--"}</td>
                    </tr>
                    <tr className="bg-amber-50/50">
                      <td className="p-2 font-bold text-gray-900">Volume Réellement Réceptionné (Déchargé)</td>
                      <td className="p-2 text-right font-black text-blue-900 tabular text-sm">{F(pvModal.volume_decharge_reel)} L</td>
                      <td className="p-2 text-right font-medium text-blue-800">Variation nette cuve</td>
                    </tr>
                    <tr className={pvModal.ecart_litres >= 0 ? "bg-emerald-50/70" : "bg-rose-50/70"}>
                      <td className="p-2 font-black text-gray-900">ÉCART CONSTATÉ (RÉEL - BL)</td>
                      <td className={`p-2 text-right font-black tabular text-sm ${pvModal.ecart_litres >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
                        {pvModal.ecart_litres > 0 ? "+" : ""}{F(pvModal.ecart_litres)} L ({pvModal.ecart_pourcentage > 0 ? "+" : ""}{pvModal.ecart_pourcentage}%)
                      </td>
                      <td className="p-2 text-right font-bold">
                        {Math.abs(pvModal.ecart_pourcentage || 0) <= 0.20 ? "✓ Tolérance ±0.20% OK" : "🚨 Écart hors tolérance"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Réserves & Signatures */}
              <div className="pt-2 text-xs">
                <div className="text-[11px] text-gray-600 mb-4">
                  <strong>Réserves / Observations :</strong> {pvModal.observations || "Dépotage réalisé conformément aux procédures de sécurité. Aucune fuite constatée."}
                </div>

                <div className="grid grid-cols-2 gap-8 pt-4 border-t" style={{ borderColor: T.line }}>
                  <div className="text-center p-3 border rounded-lg bg-gray-50/50">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                      VISA CHAUFFEUR LIVREUR
                    </span>
                    <div className="text-xs font-bold text-gray-800 mt-2">{pvModal.nom_chauffeur || "Le Chauffeur"}</div>
                    <div className="h-12 flex items-center justify-center text-gray-300 italic text-[11px]">
                      (Signature précédée de la mention "Lu et approuvé")
                    </div>
                  </div>

                  <div className="text-center p-3 border rounded-lg bg-gray-50/50">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                      VISA GÉRANT / CHEF DE STATION
                    </span>
                    <div className="text-xs font-bold text-gray-800 mt-2">{pvModal.responsable_reception || "Le Gérant"}</div>
                    <div className="h-12 flex items-center justify-center text-gray-300 italic text-[11px]">
                      (Cachet station et visa de réception)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bouton de Partage Rapide WhatsApp */}
            <div className="mt-4 flex gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `*RAPPORT DE DÉPOTAGE CARBURANT*\nStation: ${profil?.station_nom || "Hann Maristes"}\nDate: ${pvModal.date}\nN° BL: ${pvModal.numero_bl}\nProduit: ${pvModal.produit}\nVolume BL: ${F(pvModal.volume_bl)} L\nVolume Reçu: ${F(pvModal.volume_decharge_reel)} L\nÉcart: ${pvModal.ecart_litres > 0 ? "+" : ""}${F(pvModal.ecart_litres)} L (${pvModal.ecart_pourcentage}%)\nStatut: ${pvModal.statut}\nVisa: ${pvModal.responsable_reception}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold text-center hover:bg-emerald-700 flex items-center justify-center gap-1.5"
              >
                <span>📱 Partager le résumé du PV sur WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}