import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel } from "../lib/api";
import { db } from "../lib/db";
import { F, fmtDate, T, todayISO } from "../lib/calcul";
import { Section, Loading } from "../components/ui";

export default function PrixCarburant() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || `Station ${stationId}`;

  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [prices, setPrices] = useState({
    gasoil: { vente: 0, achat: 0, marge: 0 },
    super: { vente: 0, achat: 0, marge: 0 }
  });
  const [historique, setHistorique] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      
      // Charger les prix actuels depuis IndexedDB
      const currentPrices = await db.referentiel.get("prix_carburant") || {
        gasoil: { vente: 850, achat: 720, marge: 130 },
        super: { vente: 920, achat: 780, marge: 140 }
      };
      setPrices(currentPrices);
      
      // Charger l'historique depuis IndexedDB
      const hist = await db.referentiel.get("historique_prix") || [];
      setHistorique(hist);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculerMarge = (vente, achat) => {
    return Math.round(vente - achat);
  };

  const handlePriceChange = (produit, type, value) => {
    const numValue = parseFloat(value) || 0;
    setPrices(prev => {
      const newPrices = { ...prev };
      newPrices[produit][type] = numValue;
      
      // Recalculer la marge automatiquement
      if (type === "vente" || type === "achat") {
        newPrices[produit].marge = calculerMarge(newPrices[produit].vente, newPrices[produit].achat);
      }
      
      return newPrices;
    });
  };

  const sauvegarderPrix = async () => {
    try {
      // Enregistrer dans l'historique
      const newEntry = {
        date: todayISO(),
        gasoil: { ...prices.gasoil },
        super: { ...prices.super },
        station_id: stationId
      };
      
      const newHistorique = [newEntry, ...historique];
      setHistorique(newHistorique);
      
      // Sauvegarder dans IndexedDB
      await db.referentiel.put(prices, "prix_carburant");
      await db.referentiel.put(newHistorique, "historique_prix");
      
      alert("✅ Prix sauvegardés avec succès !");
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      alert("❌ Erreur lors de la sauvegarde des prix");
    }
  };

  // Calculer l'impact financier sur une journée type
  const calculerImpact = () => {
    // Volume moyen par jour (ex: 5000L GASOIL, 4000L SUPER)
    const volumeMoyen = { gasoil: 5000, super: 4000 };
    
    const margeGasoil = prices.gasoil.marge * volumeMoyen.gasoil;
    const margeSuper = prices.super.marge * volumeMoyen.super;
    const margeTotale = margeGasoil + margeSuper;
    
    return {
      gasoil: margeGasoil,
      super: margeSuper,
      total: margeTotale
    };
  };

  const impact = useMemo(calculerImpact, [prices]);

  if (loading) return <Loading label="Chargement des prix carburant..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>
          Barème de Prix Carburant
        </h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Configuration des prix et marges — {stationNom}
        </p>
      </div>

      {/* Prix actuels */}
      <Section titre="💰 Prix Actuels (F/L)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* GASOIL */}
          <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: T.line }}>
            <h3 className="text-sm font-bold text-gray-800 uppercase mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600"></span>
              GASOIL
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Prix de Vente (F/L)</label>
                <input
                  type="number"
                  value={prices.gasoil.vente}
                  onChange={(e) => handlePriceChange("gasoil", "vente", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-lg font-bold tabular bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Prix d'Achat (F/L)</label>
                <input
                  type="number"
                  value={prices.gasoil.achat}
                  onChange={(e) => handlePriceChange("gasoil", "achat", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-lg font-bold tabular bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">Marge Théorique</div>
                <div className="text-2xl font-black text-emerald-900 tabular">{F(prices.gasoil.marge)} F/L</div>
              </div>
            </div>
          </div>

          {/* SUPER */}
          <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: T.line }}>
            <h3 className="text-sm font-bold text-gray-800 uppercase mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-600"></span>
              SUPER
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Prix de Vente (F/L)</label>
                <input
                  type="number"
                  value={prices.super.vente}
                  onChange={(e) => handlePriceChange("super", "vente", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-lg font-bold tabular bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Prix d'Achat (F/L)</label>
                <input
                  type="number"
                  value={prices.super.achat}
                  onChange={(e) => handlePriceChange("super", "achat", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-lg font-bold tabular bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">Marge Théorique</div>
                <div className="text-2xl font-black text-emerald-900 tabular">{F(prices.super.marge)} F/L</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={sauvegarderPrix}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors shadow-md"
          >
            💾 Sauvegarder les Prix
          </button>
        </div>
      </Section>

      {/* Simulation d'impact */}
      <Section titre="📊 Simulation d'Impact (Volume Moyen Journalier)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="text-[10px] font-bold text-blue-700 uppercase">Marge GASOIL</div>
            <div className="text-lg font-black text-blue-900 tabular">{F(impact.gasoil)} F</div>
            <div className="text-[10px] text-blue-600">pour 5 000L/jour</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl">
            <div className="text-[10px] font-bold text-purple-700 uppercase">Marge SUPER</div>
            <div className="text-lg font-black text-purple-900 tabular">{F(impact.super)} F</div>
            <div className="text-[10px] text-purple-600">pour 4 000L/jour</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Marge Totale</div>
            <div className="text-lg font-black text-emerald-900 tabular">{F(impact.total)} F</div>
            <div className="text-[10px] text-emerald-600">par jour estimé</div>
          </div>
        </div>
      </Section>

      {/* Historique */}
      <Section titre={`📜 Historique des Prix (${historique.length} changement(s))`}>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="mb-4 text-xs text-blue-600 hover:underline"
        >
          {showHistory ? "Masquer l'historique" : "Afficher l'historique"}
        </button>

        {showHistory && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                <tr>
                  <th className="py-2.5 px-3 text-left">Date</th>
                  <th className="py-2.5 px-3 text-right">GASOIL Vente</th>
                  <th className="py-2.5 px-3 text-right">GASOIL Achat</th>
                  <th className="py-2.5 px-3 text-right">GASOIL Marge</th>
                  <th className="py-2.5 px-3 text-right">SUPER Vente</th>
                  <th className="py-2.5 px-3 text-right">SUPER Achat</th>
                  <th className="py-2.5 px-3 text-right">SUPER Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: T.line }}>
                {historique.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3">{fmtDate(entry.date)}</td>
                    <td className="py-2.5 px-3 text-right tabular">{F(entry.gasoil.vente)} F</td>
                    <td className="py-2.5 px-3 text-right tabular">{F(entry.gasoil.achat)} F</td>
                    <td className="py-2.5 px-3 text-right tabular font-bold text-emerald-700">{F(entry.gasoil.marge)} F</td>
                    <td className="py-2.5 px-3 text-right tabular">{F(entry.super.vente)} F</td>
                    <td className="py-2.5 px-3 text-right tabular">{F(entry.super.achat)} F</td>
                    <td className="py-2.5 px-3 text-right tabular font-bold text-emerald-700">{F(entry.super.marge)} F</td>
                  </tr>
                ))}
                {historique.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-500 text-xs">
                      Aucun historique disponible
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
