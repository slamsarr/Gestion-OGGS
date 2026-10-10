import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { listDescentes, listPrestationsLavage, listVentesBoutique, listDepenses, listTousBonsStation, loadReferentiel, saveRapport, getRapport } from "../lib/api";
import { F, fmtDate, n, T, todayISO, rapportVide } from "../lib/calcul";
import { Section, Loading } from "../components/ui";

export default function ValidationCloture() {
  const { profil } = useAuth();
  const navigate = useNavigate();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || `Station ${stationId}`;

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [ref, setRef] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [descentes, setDescentes] = useState([]);
  const [lavages, setLavages] = useState([]);
  const [ventesBoutique, setVentesBoutique] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [bons, setBons] = useState([]);
  const [coherenceVerifiee, setCoherenceVerifiee] = useState(false);
  const [alertes, setAlertes] = useState([]);

  useEffect(() => {
    loadData();
  }, [stationId, date]);

  const loadData = async () => {
    try {
      const [r, dList, lList, vList, dList2, bList] = await Promise.all([
        loadReferentiel().catch(() => null),
        listDescentes(stationId, date).catch(() => []),
        listPrestationsLavage(stationId, date).catch(() => []),
        listVentesBoutique(stationId, date).catch(() => []),
        listDepenses(stationId).catch(() => []),
        listTousBonsStation(stationId).catch(() => []),
      ]);
      setRef(r);
      setDescentes(dList || []);
      setLavages(lList || []);
      setVentesBoutique(vList || []);
      setDepenses(dList2 || []);
      setBons(bList || []);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  // Calculer les totaux
  const totalCarburant = useMemo(() => {
    return descentes.reduce((sum, d) => sum + (n(d.total_carburant) || n(d.montant_theorique) || 0), 0);
  }, [descentes]);

  const totalLubrifiants = useMemo(() => {
    return descentes.reduce((sum, d) => sum + (n(d.total_lubrifiants) || 0), 0);
  }, [descentes]);

  const totalLavage = useMemo(() => {
    return lavages.reduce((sum, l) => sum + (n(l.montant_total) || n(l.prix) || 0), 0);
  }, [lavages]);

  const totalBoutique = useMemo(() => {
    return ventesBoutique.reduce((sum, v) => sum + (n(v.total_montant) || 0), 0);
  }, [ventesBoutique]);

  const totalDepenses = useMemo(() => {
    return depenses.reduce((sum, d) => sum + n(d.montant), 0);
  }, [depenses]);

  const totalVersements = useMemo(() => {
    return descentes.reduce((sum, d) => {
      const versements = Array.isArray(d.versements) ? d.versements.reduce((s, v) => s + n(v), 0) : 0;
      return sum + versements;
    }, 0);
  }, [descentes]);

  const totalEcartCaisse = useMemo(() => {
    return descentes.reduce((sum, d) => sum + (n(d.ecart) || 0), 0);
  }, [descentes]);

  const totalCreances = useMemo(() => {
    return bons.reduce((sum, b) => sum + n(b.reste_a_payer ?? b.montant), 0);
  }, [bons]);

  const totalRecette = totalCarburant + totalLubrifiants + totalLavage + totalBoutique;
  const bis = totalRecette - totalDepenses;

  // Vérifier la cohérence
  const verifierCoherence = () => {
    const newAlertes = [];

    // 1. Vérifier que le total versements est cohérent avec le total à verser
    const totalAVerser = descentes.reduce((sum, d) => sum + n(d.a_verser || 0), 0);
    if (Math.abs(totalVersements - totalAVerser) > 1000) {
      newAlertes.push({
        type: "versement_incoherent",
        message: `Écart entre versements saisis (${F(totalVersements)} F) et total à verser (${F(totalAVerser)} F)`,
        gravite: "moyenne"
      });
    }

    // 2. Vérifier les écarts de caisse
    if (Math.abs(totalEcartCaisse) > 5000) {
      newAlertes.push({
        type: "ecart_important",
        message: `Écart de caisse important : ${F(totalEcartCaisse)} F`,
        gravite: Math.abs(totalEcartCaisse) > 20000 ? "critique" : "moyenne"
      });
    }

    // 3. Vérifier qu'il y a des descentes pompistes
    if (descentes.length === 0) {
      newAlertes.push({
        type: "pas_de_descentes",
        message: "Aucune descente pompiste enregistrée pour cette journée",
        gravite: "critique"
      });
    }

    // 4. Vérifier les créances importantes
    if (totalCreances > 100000) {
      newAlertes.push({
        type: "creances_elevees",
        message: `Créances clients élevées : ${F(totalCreances)} F`,
        gravite: "moyenne"
      });
    }

    setAlertes(newAlertes);
    setCoherenceVerifiee(newAlertes.filter(a => a.gravite === "critique").length === 0);
  };

  // Valider la clôture
  const validerCloture = async () => {
    setValidating(true);
    try {
      // Créer ou mettre à jour le rapport
      const existing = await getRapport(stationId, date);
      const rapport = existing || rapportVide(ref, stationId, date, profil?.nom_complet);
      
      // Mettre à jour le statut
      rapport.statut = "VALIDE";
      rapport.valide_par = profil?.nom_complet;
      rapport.date_validation = new Date().toISOString();
      
      // Sauvegarder
      await saveRapport(rapport, profil, ref);
      
      alert("✅ Clôture validée avec succès !");
      navigate("/gerant");
    } catch (err) {
      console.error("Erreur validation clôture:", err);
      alert("❌ Erreur lors de la validation : " + err.message);
    } finally {
      setValidating(false);
    }
  };

  if (loading) return <Loading label="Chargement des données de clôture..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>
          Validation de Clôture Officielle
        </h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Vérification et validation de la clôture journalière — {stationNom}
        </p>
      </div>

      {/* Sélection de la date */}
      <Section titre="📅 Sélection de la journée">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: T.muted }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-3 py-2 text-sm bg-white"
              style={{ borderColor: T.line }}
            />
          </div>
          <button
            onClick={loadData}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors shadow-md"
          >
            🔄 Charger les données
          </button>
        </div>
      </Section>

      {/* Résumé des opérations */}
      <Section titre="📊 Résumé des Opérations du Jour">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="text-xs font-bold text-blue-700 uppercase">Carburant</div>
            <div className="text-lg font-black text-blue-900 tabular">{F(totalCarburant)} F</div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl">
            <div className="text-xs font-bold text-emerald-700 uppercase">Lavage</div>
            <div className="text-lg font-black text-emerald-900 tabular">{F(totalLavage)} F</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl">
            <div className="text-xs font-bold text-purple-700 uppercase">Boutique</div>
            <div className="text-lg font-black text-purple-900 tabular">{F(totalBoutique)} F</div>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl">
            <div className="text-xs font-bold text-amber-700 uppercase">Lubrifiants</div>
            <div className="text-lg font-black text-amber-900 tabular">{F(totalLubrifiants)} F</div>
          </div>
        </div>
      </Section>

      {/* Dépenses et versements */}
      <Section titre="💰 Dépenses et Versements">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-rose-50 rounded-xl">
            <div className="text-xs font-bold text-rose-700 uppercase">Dépenses</div>
            <div className="text-lg font-black text-rose-900 tabular">{F(totalDepenses)} F</div>
          </div>
          <div className="p-4 bg-orange-50 rounded-xl">
            <div className="text-xs font-bold text-orange-700 uppercase">Versements</div>
            <div className="text-lg font-black text-orange-900 tabular">{F(totalVersements)} F</div>
 </div>
          <div className="p-4 bg-cyan-50 rounded-xl">
            <div className="text-xs font-bold text-cyan-700 uppercase">BIS</div>
            <div className="text-lg font-black text-cyan-900 tabular">{F(bis)} F</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="text-xs font-bold text-gray-700 uppercase">Écart Caisse</div>
            <div className={`text-lg font-black tabular ${totalEcartCaisse >= 0 ? "text-emerald-900" : "text-rose-900"}`}>
              {totalEcartCaisse >= 0 ? "+" : ""}{F(totalEcartCaisse)} F
            </div>
          </div>
        </div>
      </Section>

      {/* Créances clients */}
      <Section titre="📄 Créances Clients">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 rounded-xl">
            <div className="text-xs font-bold text-red-700 uppercase">Total Créances</div>
            <div className="text-lg font-black text-red-900 tabular">{F(totalCreances)} F</div>
          </div>
          <div className="p-4 bg-yellow-50 rounded-xl">
            <div className="text-xs font-bold text-yellow-700 uppercase">Bons Impayés</div>
            <div className="text-lg font-black text-yellow-900 tabular">{bons.filter(b => n(b.reste_a_payer ?? b.montant) > 0).length}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="text-xs font-bold text-gray-700 uppercase">Total Recette</div>
            <div className="text-lg font-black text-gray-900 tabular">{F(totalRecette)} F</div>
          </div>
        </div>
      </Section>

      {/* Bouton de vérification */}
      <Section titre="🔍 Vérification de Cohérence">
        <button
          onClick={verifierCoherence}
          className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-colors shadow-md"
        >
          🔍 Vérifier la cohérence des données
        </button>
      </Section>

      {/* Alertes */}
      {alertes.length > 0 && (
        <Section titre="⚠️ Alertes de Cohérence" aside={`${alertes.length} alerte(s)`}>
          <div className="space-y-2">
            {alertes.map((alert, idx) => (
              <div key={idx} className={`p-3 rounded-xl border ${
                alert.gravite === "critique" ? "bg-rose-50 border-rose-200" :
                alert.gravite === "moyenne" ? "bg-amber-50 border-amber-200" :
                "bg-blue-50 border-blue-200"
              }`}>
                <div className="font-bold text-sm mb-1">
                  {alert.gravite === "critique" ? "🔴 CRITIQUE" : "🟡 MOYENNE"}
                </div>
                <div className="text-sm text-gray-700">{alert.message}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Bouton de validation */}
      <Section titre="✅ Validation de Clôture">
        <div className="space-y-4">
          {!coherenceVerifiee && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-sm text-amber-900 font-semibold">
                ⚠️ Veuillez d'abord vérifier la cohérence des données avant de valider la clôture.
              </p>
            </div>
          )}
          
          {coherenceVerifiee && alertes.length > 0 && (
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
              <p className="text-sm text-rose-900 font-semibold">
                ⚠️ Des alertes de cohérence ont été détectées. Voulez-vous quand même valider la clôture ?
              </p>
            </div>
          )}

          {coherenceVerifiee && alertes.length === 0 && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <p className="text-sm text-emerald-900 font-semibold">
                ✓ Toutes les données sont cohérentes. Vous pouvez valider la clôture.
              </p>
            </div>
          )}

          <button
            onClick={validerCloture}
            disabled={!coherenceVerifiee || validating}
            className={`px-6 py-3 rounded-xl text-sm font-bold transition-colors shadow-md ${
              !coherenceVerifiee || validating
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {validating ? "⏳ Validation en cours..." : "✅ Valider la Clôture Officielle"}
          </button>
        </div>
      </Section>
    </div>
  );
}
