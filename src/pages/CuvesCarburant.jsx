import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listJaugesCuves, saveJaugeCuve, listLivraisons, saveLivraison, listDescentes } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function CuvesCarburant() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const [ref, setRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jauge"); // jauge | reception | ecarts
  const [msg, setMsg] = useState("");

  // Jauge physique & Rapprochement
  const [date, setDate] = useState(todayISO());
  const [produitCuve, setProduitCuve] = useState("GASOIL");
  const [stockPhysique, setStockPhysique] = useState("");
  const [hauteurCm, setHauteurCm] = useState("");
  const [jauges, setJauges] = useState([]);
  const [descentes, setDescentes] = useState([]);

  // Réception livraison
  const [livraisons, setLivraisons] = useState([]);
  const [numBl, setNumBl] = useState("");
  const [volumeLivraison, setVolumeLivraison] = useState("");
  const [fournisseur, setFournisseur] = useState("TOTAL Energies Marketing");
  const [chauffeur, setChauffeur] = useState("");
  const [camion, setCamion] = useState("");

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      const [j, l, des] = await Promise.all([
        listJaugesCuves(stationId),
        listLivraisons(stationId).catch(() => []),
        listDescentes(stationId).catch(() => []),
      ]);
      setJauges(j || []);
      setLivraisons(l || []);
      setDescentes(des || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  if (loading) return <Loading label="Chargement des Cuves & Stocks..." />;

  // Capacité cuves définies dans le référentiel
  const cuves = (ref?.cuves || []).filter((c) => !stationId || c.station_id === stationId);
  const cuveGasoil = cuves.find((c) => c.produit === "GASOIL") || { produit: "GASOIL", capacite_l: 30000 };
  const cuveSuper = cuves.find((c) => c.produit === "SUPER") || { produit: "SUPER", capacite_l: 20000 };

  // Dernière jauge enregistrée pour chaque produit (ou 0 si aucune jauge)
  const lastJaugeGasoil = jauges.find((j) => j.produit === "GASOIL") || { volume_physique: 0, date: todayISO() };
  const lastJaugeSuper = jauges.find((j) => j.produit === "SUPER") || { volume_physique: 0, date: todayISO() };

  // Calcul de la consommation moyenne journalière (sur les descentes enregistrées)
  const computeConsoJour = (prod) => {
    const prodDes = descentes.filter((d) => (d.produit || "").toUpperCase() === prod);
    if (prodDes.length === 0) return prod === "GASOIL" ? 2500 : 1800; // estimation par défaut station
    const totalVendu = prodDes.reduce((sum, d) => sum + (n(d.volume_vendu) || 0), 0);
    const uniqueDates = new Set(prodDes.map((d) => d.date)).size || 1;
    return Math.max(100, Math.round(totalVendu / uniqueDates));
  };

  const consoJourGasoil = computeConsoJour("GASOIL");
  const consoJourSuper = computeConsoJour("SUPER");

  // Autonomie restante en jours
  const autonomieGasoil = lastJaugeGasoil.volume_physique > 0 ? (lastJaugeGasoil.volume_physique / consoJourGasoil).toFixed(1) : 0;
  const autonomieSuper = lastJaugeSuper.volume_physique > 0 ? (lastJaugeSuper.volume_physique / consoJourSuper).toFixed(1) : 0;

  // Stock théorique cuve sélectionnée
  const capaciteActive = produitCuve === "GASOIL" ? cuveGasoil.capacite_l : cuveSuper.capacite_l;
  const stockTheoriqueEstime = produitCuve === "GASOIL" ? lastJaugeGasoil.volume_physique : lastJaugeSuper.volume_physique;
  const consoActive = produitCuve === "GASOIL" ? consoJourGasoil : consoJourSuper;
  const ecartCuve = stockPhysique !== "" ? n(stockPhysique) - stockTheoriqueEstime : 0;
  
  // Taux de coulage par rapport au volume théorique / sorties
  const tauxCoulagePct = stockPhysique !== "" && stockTheoriqueEstime > 0 ? ((ecartCuve / stockTheoriqueEstime) * 100) : 0;
  // Tolérance pétrolière standard = +/- 0.3%
  const toleranceRespectee = Math.abs(tauxCoulagePct) <= 0.3;

  const handleEnregistrerJauge = async (e) => {
    e.preventDefault();
    if (!stockPhysique) return flash("Veuillez saisir le volume physique mesuré");

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
      flash("Jauge physique enregistrée et rapprochement effectué !");
      setStockPhysique("");
      setHauteurCm("");
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement de la jauge");
    }
  };

  const handleEnregistrerLivraison = async (e) => {
    e.preventDefault();
    if (!volumeLivraison || n(volumeLivraison) <= 0) return flash("Volume de livraison invalide");
    if (!numBl.trim()) return flash("Numéro de Bon de Livraison (BL) requis");

    const payload = {
      station_id: stationId,
      date_livraison: date,
      produit: produitCuve,
      volume_l: n(volumeLivraison),
      numero_bl: numBl.trim(),
      fournisseur,
      chauffeur,
      camion,
      date: date,
    };

    const res = await saveLivraison(payload);
    if (res.ok) {
      flash(`Livraison de ${F(payload.volume_l)} L de ${produitCuve} enregistrée !`);
      setVolumeLivraison("");
      setNumBl("");
      setChauffeur("");
      setCamion("");
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement de la livraison");
    }
  };

  const pctGasoil = Math.min(100, Math.round((lastJaugeGasoil.volume_physique / cuveGasoil.capacite_l) * 100));
  const pctSuper = Math.min(100, Math.round((lastJaugeSuper.volume_physique / cuveSuper.capacite_l) * 100));

  return (
    <div className="max-w-5xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
            🛢️ Cuves & Stocks Carburant
          </h1>
          <p className="text-xs" style={{ color: T.muted }}>
            Jauges physiques, réceptions citernes et contrôle des écarts de coulage
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("jauge")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "jauge" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            📏 Jauge & Rapprochement
          </button>
          <button
            type="button"
            onClick={() => setTab("reception")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "reception" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            🚚 Réception Citerne
          </button>
          <button
            type="button"
            onClick={() => setTab("ecarts")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "ecarts" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            📊 Historique Jauges ({jauges.length})
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-3 p-2.5 text-xs rounded font-medium" style={{ background: "#E3F4EA", color: T.ok }}>
          {msg}
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
            <span>Creux : <strong>{F(cuveGasoil.capacite_l - lastJaugeGasoil.volume_physique)} L</strong></span>
          </div>
          <div className="mt-2.5 pt-2 border-t flex flex-wrap items-center justify-between gap-1 text-[11px]" style={{ borderColor: T.line }}>
            <span className="text-gray-600">
              ⏱️ Autonomie : <strong className="text-gray-900">{autonomieGasoil} j</strong> (~{F(consoJourGasoil)} L/j)
            </span>
            {autonomieGasoil <= 2 || pctGasoil <= 20 ? (
              <span className="px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 animate-pulse">
                ⚠️ Réassort urgent ({F(cuveGasoil.capacite_l - lastJaugeGasoil.volume_physique)} L)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700">
                ✓ Stock opérationnel
              </span>
            )}
          </div>
        </div>

        {/* Cuve Super */}
        <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-gray-800">🛢️ Cuve 2 : SUPER</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800">
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
            <span>Creux : <strong>{F(cuveSuper.capacite_l - lastJaugeSuper.volume_physique)} L</strong></span>
          </div>
          <div className="mt-2.5 pt-2 border-t flex flex-wrap items-center justify-between gap-1 text-[11px]" style={{ borderColor: T.line }}>
            <span className="text-gray-600">
              ⏱️ Autonomie : <strong className="text-gray-900">{autonomieSuper} j</strong> (~{F(consoJourSuper)} L/j)
            </span>
            {autonomieSuper <= 2 || pctSuper <= 20 ? (
              <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 animate-pulse">
                ⚠️ Réassort conseillé ({F(cuveSuper.capacite_l - lastJaugeSuper.volume_physique)} L)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700">
                ✓ Stock opérationnel
              </span>
            )}
          </div>
        </div>
      </div>

      {/* VUE 1 : SAISIE JAUGE PHYSIQUE & RAPPROCHEMENT */}
      {tab === "jauge" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <form onSubmit={handleEnregistrerJauge} className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
                Saisie de Jauge Physique (Canne / Pige)
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date du relevé</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs border rounded p-2 bg-white"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cuve / Carburant</label>
                  <select
                    value={produitCuve}
                    onChange={(e) => setProduitCuve(e.target.value)}
                    className="w-full text-xs border rounded p-2 bg-white font-semibold"
                    style={{ borderColor: T.line }}
                  >
                    <option value="GASOIL">GASOIL (Cuve 1 - 30 000 L)</option>
                    <option value="SUPER">SUPER (Cuve 2 - 20 000 L)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hauteur à la canne (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="ex: 184.5"
                    value={hauteurCm}
                    onChange={(e) => setHauteurCm(e.target.value)}
                    className="w-full text-xs border rounded p-2"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-900 mb-1">Volume Physique Barémé (Litres) *</label>
                  <input
                    type="number"
                    placeholder="Volume mesuré en litres"
                    value={stockPhysique}
                    onChange={(e) => setStockPhysique(e.target.value)}
                    className="w-full text-xs border rounded p-2 font-bold text-blue-900"
                    style={{ borderColor: T.line }}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90"
                style={{ background: T.gold }}
              >
                ✓ Enregistrer la Jauge & Valider le Rapprochement
              </button>
            </form>
          </div>

          {/* Rapprochement en direct */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>Bilan de Coulage & Rapprochement</h3>
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
                        <strong className={`tabular ${Math.abs(tauxCoulagePct) <= 0.3 ? "text-green-700" : "text-red-600"}`}>
                          {tauxCoulagePct > 0 ? "+" : ""}{tauxCoulagePct.toFixed(2)} %
                        </strong>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Tolérance pétrolière admise :</span>
                        <span className="font-semibold">± 0.30 %</span>
                      </div>
                      <div className="pt-1">
                        {toleranceRespectee ? (
                          <div className="text-emerald-700 font-semibold flex items-center gap-1">
                            <span>✅ Conforme</span>
                            <span className="font-normal text-[10px] text-emerald-600">(écart d'évaporation/température dans les normes)</span>
                          </div>
                        ) : (
                          <div className="text-red-700 font-bold flex flex-col gap-0.5">
                            <span>🚨 Coulage Anormal (&gt; ±0.3%)</span>
                            <span className="font-normal text-[10px] text-red-600">
                              Vérifier étanchéité cuve, étalonnage pistolets ou fuite canalisation.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t mt-2 flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">Autonomie estimée :</span>
                  <span className="font-bold text-gray-800 tabular">
                    ~{produitCuve === "GASOIL" ? autonomieGasoil : autonomieSuper} jours
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VUE 2 : RÉCEPTION DE CITERNE LIVRAISON */}
      {tab === "reception" && (
        <div className="bg-white rounded-xl border p-4 shadow-sm max-w-2xl mx-auto" style={{ borderColor: T.line }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
            Enregistrement d'une Réception Camion-Citerne
          </h2>
          <form onSubmit={handleEnregistrerLivraison} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date de livraison</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Produit livré</label>
                <select
                  value={produitCuve}
                  onChange={(e) => setProduitCuve(e.target.value)}
                  className="w-full text-xs border rounded p-2 bg-white"
                  style={{ borderColor: T.line }}
                >
                  <option value="GASOIL">GASOIL (Cuve 1)</option>
                  <option value="SUPER">SUPER (Cuve 2)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">N° Bon de Livraison (BL) *</label>
                <input
                  type="text"
                  placeholder="ex: BL-2026-9912"
                  value={numBl}
                  onChange={(e) => setNumBl(e.target.value)}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Volume Livré (Litres) *</label>
                <input
                  type="number"
                  placeholder="ex: 15000"
                  value={volumeLivraison}
                  onChange={(e) => setVolumeLivraison(e.target.value)}
                  className="w-full text-xs border rounded p-2 font-bold"
                  style={{ borderColor: T.line }}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fournisseur</label>
                <input
                  type="text"
                  value={fournisseur}
                  onChange={(e) => setFournisseur(e.target.value)}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Immatriculation Camion</label>
                <input
                  type="text"
                  placeholder="ex: DK-4402-A"
                  value={camion}
                  onChange={(e) => setCamion(e.target.value)}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom Chauffeur</label>
                <input
                  type="text"
                  placeholder="ex: Mamadou N."
                  value={chauffeur}
                  onChange={(e) => setChauffeur(e.target.value)}
                  className="w-full text-xs border rounded p-2"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90 mt-2"
              style={{ background: T.gold }}
            >
              ✓ Valider la Réception & Mettre à jour le Stock
            </button>
          </form>
        </div>
      )}

      {/* VUE 3 : HISTORIQUE DES JAUGES */}
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
    </div>
  );
}