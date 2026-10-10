import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { listTousBonsStation, loadReferentiel } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Loading } from "../components/ui";

export default function ComptesClientsB2B() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || `Station ${stationId}`;

  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [tousBons, setTousBons] = useState([]);
  const [selectedClient, setSelectedClient] = useState("ALL");
  const [dateDebut, setDateDebut] = useState(todayISO());
  const [dateFin, setDateFin] = useState(todayISO());

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    try {
      const [r, bList] = await Promise.all([
        loadReferentiel().catch(() => null),
        listTousBonsStation(stationId).catch(() => []),
      ]);
      setRef(r);
      setTousBons(bList || []);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  // Regrouper les bons par client (comme dans CREANCES_CLIENTS Excel)
  const comptesClients = useMemo(() => {
    const comptes = {};
    
    tousBons.forEach((bon) => {
      const clientCode = bon.client_code || "DIVERS";
      const clientNom = bon.client_nom || "Divers";
      
      if (!comptes[clientCode]) {
        comptes[clientCode] = {
          code: clientCode,
          nom: clientNom,
          consommation: 0,
          reglements: 0,
          solde: 0,
          volume_du: 0,
          nb_operations: 0,
          derniere_operation: null,
          bons: []
        };
      }
      
      const reste = n(bon.reste_a_payer ?? bon.montant);
      const regle = n(bon.montant) - reste;
      
      comptes[clientCode].consommation += n(bon.montant);
      comptes[clientCode].reglements += regle;
      comptes[clientCode].solde += reste;
      comptes[clientCode].volume_du += n(bon.volume_litres || 0);
      comptes[clientCode].nb_operations += 1;
      
      if (!comptes[clientCode].derniere_operation || new Date(bon.date) > new Date(comptes[clientCode].derniere_operation)) {
        comptes[clientCode].derniere_operation = bon.date;
      }
      
      comptes[clientCode].bons.push(bon);
    });

    // Calculer le taux de recouvrement
    Object.values(comptes).forEach((compte) => {
      compte.taux_recouvrement = compte.consommation > 0 
        ? Math.round((compte.reglements / compte.consommation) * 100) 
        : 0;
    });

    return Object.values(comptes);
  }, [tousBons]);

  // Filtrer par période
  const comptesFiltres = useMemo(() => {
    return comptesClients.map((compte) => {
      const bonsFiltres = compte.bons.filter((bon) => {
        const dateBon = bon.date;
        return dateBon >= dateDebut && dateBon <= dateFin;
      });

      // Recalculer pour la période
      const consommation = bonsFiltres.reduce((sum, b) => sum + n(b.montant), 0);
      const reglements = bonsFiltres.reduce((sum, b) => sum + (n(b.montant) - n(b.reste_a_payer ?? b.montant)), 0);
      const solde = bonsFiltres.reduce((sum, b) => sum + n(b.reste_a_payer ?? b.montant), 0);
      const volume = bonsFiltres.reduce((sum, b) => sum + n(b.volume_litres || 0), 0);

      return {
        ...compte,
        consommation_periode: consommation,
        reglements_periode: reglements,
        solde_periode: solde,
        volume_periode: volume,
        nb_operations_periode: bonsFiltres.length,
        taux_recouvrement_periode: consommation > 0 ? Math.round((reglements / consommation) * 100) : 0,
        bons_periode: bonsFiltres
      };
    });
  }, [comptesClients, dateDebut, dateFin]);

  // Client sélectionné
  const clientSelectionne = useMemo(() => {
    if (selectedClient === "ALL") return null;
    return comptesFiltres.find((c) => c.code === selectedClient);
  }, [selectedClient, comptesFiltres]);

  if (loading) return <Loading label="Chargement des comptes clients..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>
          Comptes Clients B2B
        </h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Suivi individuel des comptes clients professionnels — {stationNom}
        </p>
      </div>

      {/* Résumé global */}
      <Section titre="📊 Synthèse des Comptes" aside={`${comptesFiltres.length} client(s)`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-blue-50 rounded-xl">
            <div className="text-[10px] font-bold text-blue-700 uppercase">Consommation Totale</div>
            <div className="text-lg font-black text-blue-900 tabular">
              {F(comptesFiltres.reduce((s, c) => s + c.consommation_periode, 0))} F
            </div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Règlements</div>
            <div className="text-lg font-black text-emerald-900 tabular">
              {F(comptesFiltres.reduce((s, c) => s + c.reglements_periode, 0))} F
            </div>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl">
            <div className="text-[10px] font-bold text-rose-700 uppercase">Créances Restantes</div>
            <div className="text-lg font-black text-rose-900 tabular">
              {F(comptesFiltres.reduce((s, c) => s + c.solde_periode, 0))} F
            </div>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl">
            <div className="text-[10px] font-bold text-purple-700 uppercase">Taux Recouvrement</div>
            <div className="text-lg font-black text-purple-900 tabular">
              {comptesFiltres.reduce((s, c) => s + c.consommation_periode, 0) > 0
                ? Math.round(
                    (comptesFiltres.reduce((s, c) => s + c.reglements_periode, 0) / 
                     comptesFiltres.reduce((s, c) => s + c.consommation_periode, 0)) * 100
                  ) + "%"
                : "0%"}
            </div>
          </div>
        </div>
      </Section>

      {/* Filtres */}
      <Section titre="🔍 Filtres">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Client</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              <option value="ALL">Tous les clients</option>
              {comptesFiltres.map((c) => (
                <option key={c.code} value={c.code}>{c.nom} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Date début</label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Date fin</label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            />
          </div>
        </div>
      </Section>

      {/* Liste des comptes */}
      {!clientSelectionne && (
        <Section titre="📋 Liste des Comptes Clients">
          <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                <tr>
                  <th className="py-2.5 px-3 text-left">Client</th>
                  <th className="py-2.5 px-3 text-right">Consommation</th>
                  <th className="py-2.5 px-3 text-right">Règlements</th>
                  <th className="py-2.5 px-3 text-right">Solde</th>
                  <th className="py-2.5 px-3 text-right">Volume Dû</th>
                  <th className="py-2.5 px-3 text-right">Taux Recouvrement</th>
                  <th className="py-2.5 px-3 text-center">Opérations</th>
                  <th className="py-2.5 px-3 text-left">Dernière Opération</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: T.line }}>
                {comptesFiltres.map((compte) => (
                  <tr 
                    key={compte.code} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedClient(compte.code)}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-gray-900">{compte.nom}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{compte.code}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular font-bold text-gray-900">
                      {F(compte.consommation_periode)} F
                    </td>
                    <td className="py-2.5 px-3 text-right tabular text-emerald-700">
                      {F(compte.reglements_periode)} F
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular font-black ${compte.solde_periode > 0 ? "text-rose-700" : "text-gray-400"}`}>
                      {F(compte.solde_periode)} F
                    </td>
                    <td className="py-2.5 px-3 text-right tabular text-gray-700">
                      {F(compte.volume_periode)} L
                    </td>
                    <td className="py-2.5 px-3 text-right tabular">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        compte.taux_recouvrement_periode >= 80 ? "bg-emerald-100 text-emerald-800" :
                        compte.taux_recouvrement_periode >= 50 ? "bg-amber-100 text-amber-800" :
                        "bg-rose-100 text-rose-800"
                      }`}>
                        {compte.taux_recouvrement_periode}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {compte.nb_operations_periode}
                    </td>
                    <td className="py-2.5 px-3 text-[10px] text-gray-500">
                      {compte.derniere_operation ? fmtDate(compte.derniere_operation) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Détail du client sélectionné */}
      {clientSelectionne && (
        <Section titre={`📊 Détail du Compte: ${clientSelectionne.nom}`}>
          <button
            onClick={() => setSelectedClient("ALL")}
            className="mb-4 text-xs text-blue-600 hover:underline"
          >
            ← Retour à la liste
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="text-[10px] font-bold text-blue-700 uppercase">Consommation</div>
              <div className="text-2xl font-black text-blue-900 tabular">{F(clientSelectionne.consommation_periode)} F</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Règlements</div>
              <div className="text-2xl font-black text-emerald-900 tabular">{F(clientSelectionne.reglements_periode)} F</div>
            </div>
            <div className="p-4 bg-rose-50 rounded-xl">
              <div className="text-[10px] font-bold text-rose-700 uppercase">Solde (Créance)</div>
              <div className="text-2xl font-black text-rose-900 tabular">{F(clientSelectionne.solde_periode)} F</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-purple-50 rounded-xl">
              <div className="text-[10px] font-bold text-purple-700 uppercase">Volume Dû</div>
              <div className="text-2xl font-black text-purple-900 tabular">{F(clientSelectionne.volume_periode)} L</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl">
              <div className="text-[10px] font-bold text-amber-700 uppercase">Taux Recouvrement</div>
              <div className="text-2xl font-black text-amber-900 tabular">{clientSelectionne.taux_recouvrement_periode}%</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-[10px] font-bold text-gray-700 uppercase">Opérations</div>
              <div className="text-2xl font-black text-gray-900 tabular">{clientSelectionne.nb_operations_periode}</div>
            </div>
          </div>

          {/* Historique des bons */}
          <h3 className="text-sm font-bold text-gray-800 uppercase mb-3">Historique des Bons de Carburant</h3>
          <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                <tr>
                  <th className="py-2.5 px-3 text-left">Date</th>
                  <th className="py-2.5 px-3 text-left">N° Bon</th>
                  <th className="py-2.5 px-3 text-left">Véhicule</th>
                  <th className="py-2.5 px-3 text-right">Volume</th>
                  <th className="py-2.5 px-3 text-right">Montant</th>
                  <th className="py-2.5 px-3 text-right">Reste Dû</th>
                  <th className="py-2.5 px-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: T.line }}>
                {clientSelectionne.bons_periode.map((bon, idx) => {
                  const reste = n(bon.reste_a_payer ?? bon.montant);
                  const isSolde = reste <= 0;
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3">{fmtDate(bon.date)}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{bon.numero_bon || bon.id?.slice(0, 8)}</td>
                      <td className="py-2.5 px-3">{bon.immatriculation || "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular">{F(bon.volume_litres || 0)} L</td>
                      <td className="py-2.5 px-3 text-right tabular font-bold">{F(bon.montant)} F</td>
                      <td className={`py-2.5 px-3 text-right tabular font-black ${reste > 0 ? "text-rose-700" : "text-gray-400"}`}>
                        {F(reste)} F
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isSolde ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}>
                          {isSolde ? "✓ Soldé" : "🔴 Impayé"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
