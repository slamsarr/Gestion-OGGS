import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { listDescentes, loadReferentiel } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Loading } from "../components/ui";

export default function JournalIndex() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const stationNom = profil?.stations?.nom || `Station ${stationId}`;

  const [loading, setLoading] = useState(true);
  const [descentes, setDescentes] = useState([]);
  const [ref, setRef] = useState(null);
  const [dateDebut, setDateDebut] = useState(todayISO());
  const [dateFin, setDateFin] = useState(todayISO());
  const [selectedPompe, setSelectedPompe] = useState("ALL");
  const [selectedPompiste, setSelectedPompiste] = useState("ALL");

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    try {
      const [r, dList] = await Promise.all([
        loadReferentiel().catch(() => null),
        listDescentes(stationId).catch(() => []),
      ]);
      setRef(r);
      setDescentes(dList || []);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  // Journal d'index unifié (style JOURNAL Excel)
  const journal = useMemo(() => {
    // Filtrer par période
    let filtered = descentes.filter((d) => {
      const dateDescente = d.date;
      return dateDescente >= dateDebut && dateDescente <= dateFin;
    });

    // Filtrer par pompe
    if (selectedPompe !== "ALL") {
      filtered = filtered.filter((d) => d.pistolet === selectedPompe);
    }

    // Filtrer par pompiste
    if (selectedPompiste !== "ALL") {
      filtered = filtered.filter((d) => d.pompiste_nom === selectedPompiste);
    }

    // Trier par date puis par pompiste
    filtered.sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.pompiste_nom || "").localeCompare(b.pompiste_nom || "");
    });

    // Calculer le cumul par pompe
    const cumulParPompe = {};
    filtered.forEach((d) => {
      const pompe = d.pistolet || "inconnu";
      if (!cumulParPompe[pompe]) {
        cumulParPompe[pompe] = { volume: 0, valeur: 0 };
      }
      cumulParPompe[pompe].volume += n(d.volume_litres || 0);
      cumulParPompe[pompe].valeur += n(d.montant || 0);
    });

    // Enrichir avec le cumul
    return filtered.map((d) => {
      const pompe = d.pistolet || "inconnu";
      return {
        ...d,
        cumul_volume: cumulParPompe[pompe]?.volume || 0,
        cumul_valeur: cumulParPompe[pompe]?.valeur || 0
      };
    });
  }, [descentes, dateDebut, dateFin, selectedPompe, selectedPompiste]);

  // Liste des pompes disponibles
  const pompes = useMemo(() => {
    const poms = new Set();
    descentes.forEach((d) => {
      if (d.pistolet) poms.add(d.pistolet);
    });
    return Array.from(poms).sort();
  }, [descentes]);

  // Liste des pompistes disponibles
  const pompistes = useMemo(() => {
    const poms = new Set();
    descentes.forEach((d) => {
      if (d.pompiste_nom) poms.add(d.pompiste_nom);
    });
    return Array.from(poms).sort();
  }, [descentes]);

  // Statistiques globales
  const stats = useMemo(() => {
    const totalVolume = journal.reduce((s, d) => s + n(d.volume_litres || 0), 0);
    const totalValeur = journal.reduce((s, d) => s + n(d.montant || 0), 0);
    const totalDescentes = journal.length;
    const nbPompes = pompes.length;
    const nbPompistes = pompistes.length;

    return { totalVolume, totalValeur, totalDescentes, nbPompes, nbPompistes };
  }, [journal, pompes, pompistes]);

  if (loading) return <Loading label="Chargement du journal d'index..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>
          Journal d'Index Global
        </h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Traçabilité complète des index pompistes — {stationNom}
        </p>
      </div>

      {/* Statistiques globales */}
      <Section titre="📊 Statistiques du Journal">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-3 bg-blue-50 rounded-xl">
            <div className="text-[10px] font-bold text-blue-700 uppercase">Volume Total</div>
            <div className="text-lg font-black text-blue-900 tabular">{F(stats.totalVolume)} L</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl">
            <div className="text-[10px] font-bold text-emerald-700 uppercase">Valeur Totale</div>
            <div className="text-lg font-black text-emerald-900 tabular">{F(stats.totalValeur)} F</div>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl">
            <div className="text-[10px] font-bold text-purple-700 uppercase">Descentes</div>
            <div className="text-lg font-black text-purple-900 tabular">{stats.totalDescentes}</div>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl">
            <div className="text-[10px] font-bold text-amber-700 uppercase">Pompes</div>
            <div className="text-lg font-black text-amber-900 tabular">{stats.nbPompes}</div>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl">
            <div className="text-[10px] font-bold text-rose-700 uppercase">Pompistes</div>
            <div className="text-lg font-black text-rose-900 tabular">{stats.nbPompistes}</div>
          </div>
        </div>
      </Section>

      {/* Filtres */}
      <Section titre="🔍 Filtres">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Pompe</label>
            <select
              value={selectedPompe}
              onChange={(e) => setSelectedPompe(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              <option value="ALL">Toutes les pompes</option>
              {pompes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Pompiste</label>
            <select
              value={selectedPompiste}
              onChange={(e) => setSelectedPompiste(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              <option value="ALL">Tous les pompistes</option>
              {pompistes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* Journal d'index */}
      <Section titre={`📋 Journal d'Index (${journal.length} entrée(s))`}>
        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
              <tr>
                <th className="py-2.5 px-3 text-left">Date</th>
                <th className="py-2.5 px-3 text-left">Pompiste</th>
                <th className="py-2.5 px-3 text-left">Pompe</th>
                <th className="py-2.5 px-3 text-right">Index Départ</th>
                <th className="py-2.5 px-3 text-right">Index Fin</th>
                <th className="py-2.5 px-3 text-right">Volume</th>
                <th className="py-2.5 px-3 text-right">Valeur</th>
                <th className="py-2.5 px-3 text-right">Cumul Vol</th>
                <th className="py-2.5 px-3 text-right">Cumul Val</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: T.line }}>
              {journal.map((d, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="py-2.5 px-3 font-mono text-xs">{fmtDate(d.date)}</td>
                  <td className="py-2.5 px-3 font-bold text-gray-900">{d.pompiste_nom || "—"}</td>
                  <td className="py-2.5 px-3">{d.pistolet || "—"}</td>
                  <td className="py-2.5 px-3 text-right tabular">{F(d.index_depart)}</td>
                  <td className="py-2.5 px-3 text-right tabular">{F(d.index_fin)}</td>
                  <td className="py-2.5 px-3 text-right tabular font-bold text-blue-700">{F(d.volume_litres || 0)} L</td>
                  <td className="py-2.5 px-3 text-right tabular font-bold text-emerald-700">{F(d.montant || 0)} F</td>
                  <td className="py-2.5 px-3 text-right tabular text-gray-600">{F(d.cumul_volume)} L</td>
                  <td className="py-2.5 px-3 text-right tabular text-gray-600">{F(d.cumul_valeur)} F</td>
                </tr>
              ))}
              {journal.length === 0 && (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-gray-500 text-xs">
                    Aucune entrée pour la période sélectionnée
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
