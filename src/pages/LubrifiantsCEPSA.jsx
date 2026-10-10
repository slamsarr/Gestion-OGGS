import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel } from "../lib/api";
import { db } from "../lib/db";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Loading } from "../components/ui";

export default function LubrifiantsCEPSA() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || `Station ${stationId}`;

  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddMouvement, setShowAddMouvement] = useState(false);
  
  const [stockForm, setStockForm] = useState({
    code: "",
    libelle: "",
    capacité: 0,
    stock_actuel: 0,
    prix_unitaire: 0,
    fournisseur: ""
  });
  
  const [mouvementForm, setMouvementForm] = useState({
    produit_code: "",
    type: "VENTE",
    quantite: 0,
    prix_unitaire: 0,
    date_mouvement: todayISO(),
    client: "",
    facture: ""
  });

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      
      // Charger les stocks lubrifiants depuis IndexedDB
      const stocksData = await db.lubrifiants.toArray() || [];
      setStocks(stocksData);
      
      // Charger les mouvements depuis IndexedDB
      const mouvementsData = await db.mouvements_lubrifiants.toArray() || [];
      setMouvements(mouvementsData);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  const sauvegarderStock = async () => {
    try {
      const newStock = {
        ...stockForm,
        id: uuid(),
        station_id: stationId,
        capacité: n(stockForm.capacité),
        stock_actuel: n(stockForm.stock_actuel),
        prix_unitaire: n(stockForm.prix_unitaire),
        date_creation: todayISO()
      };
      
      await db.lubrifiants.add(newStock);
      setStocks([...stocks, newStock]);
      setStockForm({
        code: "",
        libelle: "",
        capacité: 0,
        stock_actuel: 0,
        prix_unitaire: 0,
        fournisseur: ""
      });
      setShowAddStock(false);
      alert("✅ Stock lubrifiant ajouté !");
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      alert("❌ Erreur lors de la sauvegarde");
    }
  };

  const sauvegarderMouvement = async () => {
    try {
      const stock = stocks.find((s) => s.code === mouvementForm.produit_code);
      if (!stock) return alert("Produit introuvable");
      
      const quantite = n(mouvementForm.quantite);
      
      // Vérifier le stock pour les ventes
      if (mouvementForm.type === "VENTE" && quantite > stock.stock_actuel) {
        return alert("❌ Stock insuffisant");
      }
      
      const newMouvement = {
        ...mouvementForm,
        id: uuid(),
        station_id: stationId,
        quantite: quantite,
        prix_unitaire: n(mouvementForm.prix_unitaire),
        valeur_total: quantite * n(mouvementForm.prix_unitaire)
      };
      
      await db.mouvements_lubrifiants.add(newMouvement);
      
      // Mettre à jour le stock
      const nouveauStock = mouvementForm.type === "VENTE" 
        ? stock.stock_actuel - quantite
        : stock.stock_actuel + quantite;
      
      await db.lubrifiants.update(stock.id, { stock_actuel: nouveauStock });
      
      setMouvements([...mouvements, newMouvement]);
      setStocks(stocks.map((s) => s.id === stock.id ? { ...s, stock_actuel: nouveauStock } : s));
      
      setMouvementForm({
        produit_code: "",
        type: "VENTE",
        quantite: 0,
        prix_unitaire: 0,
        date_mouvement: todayISO(),
        client: "",
        facture: ""
      });
      setShowAddMouvement(false);
      alert("✅ Mouvement enregistré !");
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      alert("❌ Erreur lors de la sauvegarde");
    }
  };

  // Calculer la valorisation totale des stocks
  const valorisationTotale = useMemo(() => {
    return stocks.reduce((sum, s) => sum + (s.stock_actuel * s.prix_unitaire), 0);
  }, [stocks]);

  // Mouvements récents
  const mouvementsRecents = useMemo(() => {
    return mouvements
      .sort((a, b) => b.date_mouvement.localeCompare(a.date_mouvement))
      .slice(0, 10);
  }, [mouvements]);

  // Alertes sur stocks bas
  const alertesStocks = useMemo(() => {
    return stocks.filter((s) => {
      const pourcentage = s.capacité > 0 ? (s.stock_actuel / s.capacité) * 100 : 0;
      return pourcentage < 20;
    });
  }, [stocks]);

  if (loading) return <Loading label="Chargement des lubrifiants CEPSA..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>
          Gestion des Lubrifiants CEPSA
        </h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Suivi des stocks, ventes et réceptions — {stationNom}
        </p>
      </div>

      {/* KPIs globaux */}
      <Section titre="📊 Synthèse des Stocks">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="text-[10px] font-bold text-blue-700 uppercase">Produits</div>
            <div className="text-2xl font-black text-blue-900 tabular">{stocks.length}</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Valorisation Totale</div>
            <div className="text-2xl font-black text-emerald-900 tabular">{F(valorisationTotale)} F</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl">
            <div className="text-[10px] font-bold text-purple-700 uppercase">Mouvements</div>
            <div className="text-2xl font-black text-purple-900 tabular">{mouvements.length}</div>
          </div>
          <div className="p-4 bg-rose-50 rounded-xl">
            <div className="text-[10px] font-bold text-rose-700 uppercase">Alertes Stock Bas</div>
            <div className="text-2xl font-black text-rose-900 tabular">{alertesStocks.length}</div>
          </div>
        </div>
      </Section>

      {/* Alertes stocks bas */}
      {alertesStocks.length > 0 && (
        <Section titre="⚠️ Alertes Stock Bas" aside={`${alertesStocks.length} produit(s)`}>
          <div className="space-y-2">
            {alertesStocks.map((s) => {
              const pourcentage = s.capacité > 0 ? Math.round((s.stock_actuel / s.capacité) * 100) : 0;
              return (
                <div key={s.id} className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <div className="font-bold text-rose-900 text-sm">{s.libelle}</div>
                  <div className="text-xs text-rose-700">
                    Stock: {F(s.stock_actuel)} / {F(s.capacité)} ({pourcentage}%)
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Liste des stocks */}
      <Section titre="📦 Stocks Lubrifiants" aside={`${stocks.length} produit(s)`}>
        <div className="mb-4">
          <button
            onClick={() => setShowAddStock(!showAddStock)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors shadow-md"
          >
            + Ajouter un produit
          </button>
        </div>

        {showAddStock && (
          <div className="mb-4 p-4 bg-white rounded-xl border shadow-sm" style={{ borderColor: T.line }}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Nouveau produit lubrifiant</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Code</label>
                <input
                  value={stockForm.code}
                  onChange={(e) => setStockForm({ ...stockForm, code: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Libellé</label>
                <input
                  value={stockForm.libelle}
                  onChange={(e) => setStockForm({ ...stockForm, libelle: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Capacité (L)</label>
                <input
                  type="number"
                  value={stockForm.capacité}
                  onChange={(e) => setStockForm({ ...stockForm, capacité: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Stock Actuel (L)</label>
                <input
                  type="number"
                  value={stockForm.stock_actuel}
                  onChange={(e) => setStockForm({ ...stockForm, stock_actuel: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Prix Unitaire (F/L)</label>
                <input
                  type="number"
                  value={stockForm.prix_unitaire}
                  onChange={(e) => setStockForm({ ...stockForm, prix_unitaire: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Fournisseur</label>
                <input
                  value={stockForm.fournisseur}
                  onChange={(e) => setStockForm({ ...stockForm, fournisseur: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={sauvegarderStock}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
              >
                Sauvegarder
              </button>
              <button
                onClick={() => setShowAddStock(false)}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
              <tr>
                <th className="py-2.5 px-3 text-left">Produit</th>
                <th className="py-2.5 px-3 text-right">Stock Actuel</th>
                <th className="py-2.5 px-3 text-right">Capacité</th>
                <th className="py-2.5 px-3 text-right">%</th>
                <th className="py-2.5 px-3 text-right">Prix Unitaire</th>
                <th className="py-2.5 px-3 text-right">Valorisation</th>
                <th className="py-2.5 px-3 text-left">Fournisseur</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: T.line }}>
              {stocks.map((s) => {
                const pourcentage = s.capacité > 0 ? Math.round((s.stock_actuel / s.capacité) * 100) : 0;
                const valorisation = s.stock_actuel * s.prix_unitaire;
                const estBas = pourcentage < 20;
                return (
                  <tr key={s.id} className={`hover:bg-gray-50 ${estBas ? "bg-rose-50" : ""}`}>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-gray-900">{s.libelle}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{s.code}</div>
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular font-bold ${estBas ? "text-rose-700" : "text-blue-700"}`}>
                      {F(s.stock_actuel)} L
                    </td>
                    <td className="py-2.5 px-3 text-right tabular text-gray-600">{F(s.capacité)} L</td>
                    <td className="py-2.5 px-3 text-right tabular">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        pourcentage >= 80 ? "bg-emerald-100 text-emerald-800" :
                        pourcentage >= 50 ? "bg-amber-100 text-amber-800" :
                        "bg-rose-100 text-rose-800"
                      }`}>
                        {pourcentage}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular">{F(s.prix_unitaire)} F/L</td>
                    <td className="py-2.5 px-3 text-right tabular font-bold text-emerald-700">{F(valorisation)} F</td>
                    <td className="py-2.5 px-3 text-gray-600">{s.fournisseur || "—"}</td>
                  </tr>
                );
              })}
              {stocks.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-500 text-xs">
                    Aucun produit lubrifiant enregistré
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Mouvements */}
      <Section titre="📝 Mouvements Récents" aside={`${mouvements.length} total`}>
        <div className="mb-4">
          <button
            onClick={() => setShowAddMouvement(!showAddMouvement)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors shadow-md"
          >
            + Nouveau mouvement
          </button>
        </div>

        {showAddMouvement && (
          <div className="mb-4 p-4 bg-white rounded-xl border shadow-sm" style={{ borderColor: T.line }}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Nouveau mouvement lubrifiant</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Produit</label>
                <select
                  value={mouvementForm.produit_code}
                  onChange={(e) => setMouvementForm({ ...mouvementForm, produit_code: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                >
                  <option value="">— choisir —</option>
                  {stocks.map((s) => (
                    <option key={s.code} value={s.code}>{s.libelle}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Type</label>
                <select
                  value={mouvementForm.type}
                  onChange={(e) => setMouvementForm({ ...mouvementForm, type: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                >
                  <option value="VENTE">Vente</option>
                  <option value="RECEPTION">Réception</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Quantité (L)</label>
                <input
                  type="number"
                  value={mouvementForm.quantite}
                  onChange={(e) => setMouvementForm({ ...mouvementForm, quantite: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Prix Unitaire (F/L)</label>
                <input
                  type="number"
                  value={mouvementForm.prix_unitaire}
                  onChange={(e) => setMouvementForm({ ...mouvementForm, prix_unitaire: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Date</label>
                <input
                  type="date"
                  value={mouvementForm.date_mouvement}
                  onChange={(e) => setMouvementForm({ ...mouvementForm, date_mouvement: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Client</label>
                <input
                  value={mouvementForm.client}
                  onChange={(e) => setMouvementForm({ ...mouvementForm, client: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={sauvegarderMouvement}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors"
              >
                Enregistrer
              </button>
              <button
                onClick={() => setShowAddMouvement(false)}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
              <tr>
                <th className="py-2.5 px-3 text-left">Date</th>
                <th className="py-2.5 px-3 text-left">Produit</th>
                <th className="py-2.5 px-3 text-center">Type</th>
                <th className="py-2.5 px-3 text-right">Quantité</th>
                <th className="py-2.5 px-3 text-right">Prix Unitaire</th>
                <th className="py-2.5 px-3 text-right">Valeur Totale</th>
                <th className="py-2.5 px-3 text-left">Client</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: T.line }}>
              {mouvementsRecents.map((m) => {
                const produit = stocks.find((s) => s.code === m.produit_code);
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-mono text-xs">{fmtDate(m.date_mouvement)}</td>
                    <td className="py-2.5 px-3 font-bold text-gray-900">{produit?.libelle || m.produit_code}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.type === "VENTE" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {m.type}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular font-bold ${m.type === "VENTE" ? "text-blue-700" : "text-emerald-700"}`}>
                      {F(m.quantite)} L
                    </td>
                    <td className="py-2.5 px-3 text-right tabular">{F(m.prix_unitaire)} F/L</td>
                    <td className="py-2.5 px-3 text-right tabular font-bold text-gray-900">{F(m.valeur_total)} F</td>
                    <td className="py-2.5 px-3 text-gray-600">{m.client || "—"}</td>
                  </tr>
                );
              })}
              {mouvements.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-500 text-xs">
                    Aucun mouvement enregistré
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
