import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  listDescentes,
  listTousBonsStation,
  listPrestationsLavage,
  listVentesBoutique,
  listJaugesCuves,
  listCollaborateurs,
  stocksTheoriques,
  listPrestationsEntretien,
  listDepenses,
  updateDescente,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { ROLE_LABELS, peutAgirProfil } from "../lib/permissions";
import { Section, Row, Num, Loading } from "../components/ui";
import { construireHistoire } from "../lib/histoireQuotidienne";
import HistoireQuotidienne from "../components/HistoireQuotidienne";
import { normalizeDescente } from "./DescentePompiste";

export default function TableauBordGerant() {
  const { profil } = useAuth();
  const navigate = useNavigate();
  const stationId = profil?.station_id || "st-hann";
  const stationCode = profil?.stations?.code || stationId.replace("st-", "").toUpperCase();
  const stationNom = profil?.stations?.nom || `Station ${stationCode}`;

  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [activeTab, setActiveTab] = useState("tableau_bord"); // tableau_bord | descentes | bons | services | cuves | equipe | alertes
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok");

  // Données de la station
  const [descentes, setDescentes] = useState([]);
  const [tousBons, setTousBons] = useState([]);
  const [lavages, setLavages] = useState([]);
  const [ventesBoutique, setVentesBoutique] = useState([]);
  const [jauges, setJauges] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [stocksStation, setStocksStation] = useState([]);
  const [entretiensJour, setEntretiensJour] = useState([]);
  const [lavagesV, setLavagesV] = useState([]);
  const [ventesBoutiqueV, setVentesBoutiqueV] = useState([]);
  const [afficherHistoire, setAfficherHistoire] = useState(true);
  const [histoire, setHistoire] = useState(null);

  // Filtres
  const [pompisteFiltre, setPompisteFiltre] = useState("TOUS"); // TOUS | id_pompiste
  const [filtreBon, setFiltreBon] = useState("TOUS"); // TOUS | IMPAYES | REGLES
  const [searchBon, setSearchBon] = useState("");
  const [depensesJour, setDepensesJour] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [validatingId, setValidatingId] = useState(null);

  const flash = (text, type = "ok") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  };

  const loadStationData = async () => {
    try {
      const hier = new Date(date); hier.setDate(hier.getDate() - 1);
      const hierISO = hier.toISOString().slice(0, 10);
      const septJours = new Date(date); septJours.setDate(septJours.getDate() - 7);
      const septJoursISO = septJours.toISOString().slice(0, 10);
      const [r, dList, bList, lList, vList, jList, cList, stocks, ent,
             lHier, vHier, lTous, vTous, descTous, descHier, depList] = await Promise.all([
        loadReferentiel().catch(() => null),
        listDescentes(stationId, date).catch(() => []),
        listTousBonsStation(stationId).catch(() => []),
        listPrestationsLavage(stationId, date).catch(() => []),
        listVentesBoutique(stationId, date).catch(() => []),
        listJaugesCuves(stationId, date).catch(() => []),
        listCollaborateurs(stationId).catch(() => []),
        stocksTheoriques(null).catch(() => []),
        listPrestationsEntretien(stationId, date).catch(() => []),
        listPrestationsLavage(stationId, hierISO).catch(() => []),
        listVentesBoutique(stationId, hierISO).catch(() => []),
        listPrestationsLavage(stationId, undefined).then(tous => tous.filter(x => {
          const d = x.date; return d && d >= septJoursISO && d <= date;
        })).catch(() => []),
        listVentesBoutique(stationId, undefined).then(tous => tous.filter(x => {
          const d = x.date; return d && d >= septJoursISO && d <= date;
        })).catch(() => []),
        listDescentes(stationId, undefined).then(tous => tous.filter(x => {
          const d = x.date; return d && d >= septJoursISO && d <= date;
        })).catch(() => []),
        listDescentes(stationId, hierISO).catch(() => []),
        listDepenses(stationId, date).catch(() => []),
      ]);
      setRef(r);
      const dListNorm = (dList || []).map(normalizeDescente).filter(Boolean);
      setDescentes(dListNorm);
      setTousBons(bList || []);
      setLavages(lList || []);
      setVentesBoutique(vList || []);
      setJauges(jList || []);
      setEquipe(cList || []);
      const stocksFiltres = (stocks || []).filter(s => s.station === stationCode || s.station === stationId);
      setStocksStation(stocksFiltres);
      setEntretiensJour(ent || []);
      setLavagesV(lHier || []);
      setVentesBoutiqueV(vHier || []);
      setDepensesJour(depList || []);
      setLastRefresh(new Date());

      // ── Construire l'histoire quotidienne — valeurs calculées LOCALEMENT ─────
      // Bug fix: ne pas utiliser les useMemo (pas encore à jour) mais les variables locales
      const caCarburantLocal = (dList || []).reduce((s, x) => s + (n(x.total_carburant) || n(x.montant_theorique) || 0), 0);
      const caLavageLocal = (lList || []).reduce((s, x) => s + n(x.montant_total), 0);
      const caBoutiqueLocal = (vList || []).reduce((s, x) => s + n(x.total_montant), 0);
      const caCarbV = (descHier || []).reduce((s, x) => s + (n(x.total_carburant) || n(x.montant_theorique) || 0), 0);
      const caCarbM7 = (descTous || []).reduce((s, x) => s + (n(x.total_carburant) || n(x.montant_theorique) || 0), 0) / Math.max(1, [...new Set((descTous || []).map(x => x.date))].length);
      const caLavV = (lHier || []).reduce((s, x) => s + n(x.montant_total), 0);
      const caLavM7 = (lTous || []).reduce((s, x) => s + n(x.montant_total), 0) / Math.max(1, [...new Set((lTous || []).map(x => x.date))].length);
      const caBoutV = (vHier || []).reduce((s, x) => s + n(x.total_montant), 0);
      const caBoutM7 = (vTous || []).reduce((s, x) => s + n(x.total_montant), 0) / Math.max(1, [...new Set((vTous || []).map(x => x.date))].length);
      const caEnt = (ent || []).reduce((s, e) => s + n(e.montant_total || (n(e.montant_services) + n(e.montant_produits)) || 0), 0);
      const volCarb = (dList || []).reduce((s, x) => s + (n(x.total_volume) || n(x.volume_vendu) || 0), 0);
      const bonsImpayesLocal = (bList || []).filter(b => n(b.reste_a_payer ?? b.montant) > 0);
      const totalResteBonsLocal = (bList || []).reduce((acc, b) => acc + n(b.reste_a_payer ?? b.montant), 0);

      const hist = construireHistoire({
        dateISO: date,
        stationNom: stationNom,
        stationCode,
        caCarburantJ: caCarburantLocal,
        caLavageJ: caLavageLocal,
        caBoutiqueJ: caBoutiqueLocal,
        caEntretienJ: caEnt,
        volumeCarburantJ: volCarb,
        nbLavagesJ: (lList || []).length,
        nbVentesBoutiqueJ: (vList || []).length,
        nbInterventionsEntretienJ: (ent || []).length,
        descentesJ: dList,
        caCarburantV: caCarbV,
        caLavageV: caLavV,
        caBoutiqueV: caBoutV,
        caCarburantM7: caCarbM7,
        caLavageM7: caLavM7,
        caBoutiqueM7: caBoutM7,
        stocks: stocksFiltres,
        ecartsDescente: (dList || []).map(x => ({ ecart: n(x.ecart), pompiste_nom: x.pompiste_nom, pompiste_id: x.pompiste_id })),
        bonsImpayes: bonsImpayesLocal,
        montantImpayes: totalResteBonsLocal,
        role: profil?.role,
        nomUtilisateur: profil?.nom_complet,
      });
      setHistoire(hist);

    } catch (err) {
      console.error("Erreur chargement données gérant:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStationData();
  }, [stationId, date]);


  // Totaux consolidés du jour
  const totalCarburantJour = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.total_carburant) || n(d.montant_theorique) || 0), 0);
  }, [descentes]);

  const totalLitresCarburant = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.total_volume) || n(d.volume_vendu) || 0), 0);
  }, [descentes]);

  const totalLubrifiantsJour = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.total_lubrifiants) || 0), 0);
  }, [descentes]);

  const totalLavageJour = useMemo(() => {
    return lavages.reduce((acc, l) => acc + (n(l.montant_total) || 0), 0);
  }, [lavages]);

  const totalBoutiqueJour = useMemo(() => {
    return ventesBoutique.reduce((acc, v) => acc + (n(v.total_montant) || 0), 0);
  }, [ventesBoutique]);

  const totalRecetteStation = totalCarburantJour + totalLubrifiantsJour + totalLavageJour + totalBoutiqueJour;

  const totalEcartDescentes = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.ecart) || 0), 0);
  }, [descentes]);

  // Statistiques Bons
  const bonsImpayes = useMemo(() => tousBons.filter((b) => n(b.reste_a_payer ?? b.montant) > 0), [tousBons]);
  const totalMontantBons = useMemo(() => tousBons.reduce((acc, b) => acc + n(b.montant), 0), [tousBons]);
  const totalResteBons = useMemo(() => tousBons.reduce((acc, b) => acc + n(b.reste_a_payer ?? b.montant), 0), [tousBons]);
  const totalLitresBons = useMemo(() => tousBons.reduce((acc, b) => acc + n(b.volume_litres || 0), 0), [tousBons]);

  const bonsFiltres = useMemo(() => {
    let list = tousBons;
    if (filtreBon === "IMPAYES") list = tousBons.filter((b) => n(b.reste_a_payer ?? b.montant) > 0);
    if (filtreBon === "REGLES") list = tousBons.filter((b) => n(b.reste_a_payer ?? b.montant) === 0);
    if (searchBon.trim()) {
      const q = searchBon.trim().toLowerCase();
      list = list.filter(b =>
        (b.client_nom || "").toLowerCase().includes(q) ||
        (b.client_code || "").toLowerCase().includes(q) ||
        (b.numero_bon || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tousBons, filtreBon, searchBon]);

  // Dépenses du jour
  const totalDepensesJour = useMemo(() => depensesJour.reduce((acc, d) => acc + n(d.montant), 0), [depensesJour]);

  // Tendances J-1 (données hier déjà stockées dans lavagesV / ventesBoutiqueV)
  const tendanceCarb = useMemo(() => {
    const hier = lavagesV; // Note: on n'a pas caCarbV en état, on l'estime depuis descentes hier = pas disponible ici
    // on retourne null si pas de référence
    return null; // sera calculé via des données séparées si nécessaire
  }, []);

  // ── SUPERVISION DESCENTES POMPISTES : FILTRE & ÉTAT RÉEL DE LA JOURNÉE ──
  const listePompistes = useMemo(() => {
    const map = new Map();
    // 1. Depuis le référentiel pompistes
    (ref?.pompistes || []).forEach((p) => {
      const key = p.code || p.id;
      if (key) {
        map.set(key, {
          id: p.id || p.code,
          code: p.code || p.id,
          nom: p.nom || p.nom_complet || p.code,
        });
      }
    });
    // 2. Depuis les collaborateurs de l'équipe (rôle pompiste)
    (equipe || [])
      .filter((e) => (e.role || "").toLowerCase() === "pompiste")
      .forEach((e) => {
        const key = e.id || e.code;
        if (key && !map.has(key)) {
          map.set(key, {
            id: e.id,
            code: e.code || e.id,
            nom: e.nom_complet || e.nom || e.identifiant || "Pompiste",
          });
        }
      });
    // 3. Depuis les descentes chargées pour le jour
    (descentes || []).forEach((d) => {
      const key = d.pompiste_id || d.pompiste_nom;
      if (key && !map.has(key)) {
        map.set(key, {
          id: d.pompiste_id || key,
          code: d.pompiste_id || key,
          nom: d.pompiste_nom || "Pompiste",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [ref, equipe, descentes]);

  const descentesFiltrees = useMemo(() => {
    if (pompisteFiltre === "TOUS") return descentes;
    return descentes.filter(
      (d) =>
        d.pompiste_id === pompisteFiltre ||
        d.pompiste_nom === pompisteFiltre ||
        d.pompiste === pompisteFiltre
    );
  }, [descentes, pompisteFiltre]);

  const pompisteSelectionne = useMemo(() => {
    if (pompisteFiltre === "TOUS") return null;
    return (
      listePompistes.find(
        (p) => p.id === pompisteFiltre || p.nom === pompisteFiltre || p.code === pompisteFiltre
      ) || { nom: pompisteFiltre, id: pompisteFiltre, code: pompisteFiltre }
    );
  }, [listePompistes, pompisteFiltre]);

  const etatReelPompiste = useMemo(() => {
    if (pompisteFiltre === "TOUS" || descentesFiltrees.length === 0) return null;
    let totalVolume = 0;
    let totalCarburant = 0;
    let totalLubrifiants = 0;
    let totalRemiseCuve = 0;
    let totalRemiseCuveLitres = 0;
    let totalDepenses = 0;
    let totalTheorique = 0;
    let especes = 0;
    let wave = 0;
    let om = 0;
    let cb = 0;
    let petrosen = 0;
    let codeElec = 0;
    let tickets = 0;
    let credits = 0;
    let autre = 0;
    let totalVerse = 0;
    let ecart = 0;
    const tousPompes = [];
    const tousBons = [];
    const tousLubs = [];
    const motifsDepenses = [];
    const motifsRemise = [];

    for (const d of descentesFiltrees) {
      const vol = n(d.total_volume || d.volume_vendu || 0);
      const carb = n(d.total_carburant || d.montant_theorique || 0);
      const lub = n(d.total_lubrifiants || 0);
      const rem = n(d.remise_cuve_valeur || d.remise_en_cuve || 0);
      const remLit = n(d.remise_cuve_litres || 0);
      const dep = n(d.depenses_valeur ?? d.depenses_montant ?? d.depense ?? d.depenses ?? 0);
      const theo = n(d.net_theorique ?? (carb + lub - rem));

      totalVolume += vol;
      totalCarburant += carb;
      totalLubrifiants += lub;
      totalRemiseCuve += rem;
      totalRemiseCuveLitres += remLit;
      totalDepenses += dep;
      totalTheorique += theo;

      const enc = d.encaissements || {};
      const espD = n(enc.especes ?? d.especes ?? 0);
      const wavD = n(enc.wave ?? 0);
      const omD = n(enc.om ?? enc.orange_money ?? d.mobile_money ?? 0);
      const cbD = n(enc.cb ?? enc.carte_bancaire ?? enc.tpe ?? d.carte_bancaire ?? 0);
      const petD = n(enc.petrosen ?? 0);
      const codD = n(enc.code_electronique ?? 0);
      const ticD = n(enc.tickets ?? 0);
      const creD = n(enc.credits ?? enc.credit_client ?? enc.bons ?? d.total_bons ?? 0);
      const autD = n(enc.autre ?? 0);
      const verD = n(d.total_encaisse ?? (espD + wavD + omD + cbD + petD + codD + ticD + creD + autD + dep));

      especes += espD;
      wave += wavD;
      om += omD;
      cb += cbD;
      petrosen += petD;
      codeElec += codD;
      tickets += ticD;
      credits += creD;
      autre += autD;
      totalVerse += verD;
      ecart += (verD - theo);

      (d.pompes || []).forEach((p) => tousPompes.push(p));
      (d.bons || []).forEach((b) => tousBons.push(b));
      (d.lubrifiants || []).forEach((l) => tousLubs.push(l));
      if (d.depenses_motif) motifsDepenses.push(d.depenses_motif);
      if (d.remise_cuve_motif) motifsRemise.push(d.remise_cuve_motif);
    }

    return {
      nbQuarts: descentesFiltrees.length,
      totalVolume,
      totalCarburant,
      totalLubrifiants,
      totalRemiseCuve,
      totalRemiseCuveLitres,
      motifsRemise: motifsRemise.filter(Boolean).join(" · "),
      totalDepenses,
      motifsDepenses: motifsDepenses.filter(Boolean).join(" · "),
      totalTheorique,
      especes,
      wave,
      om,
      cb,
      petrosen,
      codeElec,
      tickets,
      credits,
      autre,
      totalVerse,
      ecart,
      pompes: tousPompes,
      bons: tousBons,
      lubrifiants: tousLubs,
    };
  }, [descentesFiltrees, pompisteFiltre]);



  // Calculs pour correspondre au journal Excel BASE_JOURS
  const volumesGasoil = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.vol_gasoil) || 0), 0);
  }, [descentes]);

  const volumesSuper = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.vol_super) || 0), 0);
  }, [descentes]);

  const caGasoil = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.ca_gasoil) || 0), 0);
  }, [descentes]);

  const caSuper = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.ca_super) || 0), 0);
  }, [descentes]);

  // Modes de paiement (comme dans le journal)
  const totalEspeces = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.especes) || 0), 0);
  }, [descentes]);

  const totalMobileMoney = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.mobile_money) || 0), 0);
  }, [descentes]);

  const totalCarteBancaire = useMemo(() => {
    return descentes.reduce((acc, d) => acc + (n(d.carte_bancaire) || 0), 0);
  }, [descentes]);

  const totalVersements = useMemo(() => {
    return descentes.reduce((acc, d) => {
      const versements = Array.isArray(d.versements) ? d.versements.reduce((sum, v) => sum + n(v), 0) : 0;
      return acc + versements;
    }, 0);
  }, [descentes]);

  // Calcul des marges (comme dans BASE_JOURS)
  const prixVenteGO = ref?.prices?.gasoil_vente || 680;
  const prixAchatGO = ref?.prices?.gasoil_achat || 665.5;
  const prixVenteSUP = ref?.prices?.super_vente || 920;
  const prixAchatSUP = ref?.prices?.super_achat || 905.5;

  const margeTheorique = useMemo(() => {
    const margeGO = volumesGasoil * (prixVenteGO - prixAchatGO);
    const margeSUP = volumesSuper * (prixVenteSUP - prixAchatSUP);
    return margeGO + margeSUP;
  }, [volumesGasoil, volumesSuper, prixVenteGO, prixAchatGO, prixVenteSUP, prixAchatSUP]);

  // Contrôle de continuité des index (comme dans BASE_POMPISTES Excel)
  const alertesIndex = useMemo(() => {
    const alerts = [];
    
    // 1. Incohérence index fin < index départ (même quart)
    descentes.forEach((d) => {
      if (d.index_depart && d.index_fin && d.index_depart > d.index_fin) {
        alerts.push({
          type: "index_incoherent",
          pompiste: d.pompiste_nom,
          date: d.date,
          message: `Index fin < Index départ pour ${d.pompiste_nom} le ${fmtDate(d.date)}`,
          gravite: "critique"
        });
      }
    });

    // 2. Contrôle de continuité entre quarts (index fin quart N = index début quart N+1)
    // Regrouper par pompiste et pompe
    const pompesParPompiste = {};
    descentes.forEach((d) => {
      const key = `${d.pompiste_nom}_${d.pistolet || 'inconnu'}`;
      if (!pompesParPompiste[key]) {
        pompesParPompiste[key] = [];
      }
      pompesParPompiste[key].push({
        date: d.date,
        index_depart: d.index_depart,
        index_fin: d.index_fin,
        pompiste: d.pompiste_nom
      });
    });

    // Vérifier la continuité pour chaque pompiste/pompe
    Object.entries(pompesParPompiste).forEach(([key, records]) => {
      // Trier par date
      records.sort((a, b) => a.date.localeCompare(b.date));
      
      for (let i = 0; i < records.length - 1; i++) {
        const courant = records[i];
        const suivant = records[i + 1];
        
        if (courant.index_fin && suivant.index_depart) {
          const difference = Math.abs(courant.index_fin - suivant.index_depart);
          // Tolérance de 10 litres pour les ajustements de pompes
          if (difference > 10) {
            alerts.push({
              type: "continuite_brompee",
              pompiste: courant.pompiste,
              date_courant: courant.date,
              date_suivant: suivant.date,
              index_fin: courant.index_fin,
              index_debut_suivant: suivant.index_depart,
              difference,
              message: `Rupture de continuité pour ${courant.pompiste}: index fin ${courant.index_fin} ≠ index début suivant ${suivant.index_depart} (écart: ${difference}L)`,
              gravite: "moyenne"
            });
          }
        }
      }
    });

    return alerts;
  }, [descentes]);

  // Alertes de stock (comme dans CONTROLES)
  const alertesStock = useMemo(() => {
    const alerts = [];
    const seuilStockBas = 20; // Seuil configurable
    
    stocksStation.forEach((s) => {
      const stock = n(s.stock);
      const capacite = n(s.capacite);
      const pourcentage = capacite > 0 ? (stock / capacite) * 100 : 0;
      
      if (capacite > 0 && pourcentage < seuilStockBas) {
        alerts.push({
          type: "stock_bas",
          produit: s.produit,
          stock,
          capacite,
          pourcentage,
          message: `Stock ${s.produit} bas (${F(stock)}L / ${F(capacite)}L - ${Math.round(pourcentage)}%)`,
          gravite: pourcentage < 10 ? "critique" : "moyenne"
        });
      }
    });
    return alerts;
  }, [stocksStation]);

  // Alertes de caisse
  const alertesCaisse = useMemo(() => {
    const alerts = [];
    const seuilEcartCaisse = 5000; // Seuil configurable
    
    descentes.forEach((d) => {
      const ecart = n(d.ecart);
      if (Math.abs(ecart) > seuilEcartCaisse) {
        alerts.push({
          type: "ecart_caisse",
          pompiste: d.pompiste_nom,
          ecart,
          message: `Écart caisse élevé pour ${d.pompiste_nom}: ${F(ecart)} F`,
          gravite: Math.abs(ecart) > 20000 ? "critique" : "moyenne"
        });
      }
    });
    return alerts;
  }, [descentes]);

  // Alertes sur créances clients impayées
  const alertesCreances = useMemo(() => {
    const alerts = [];
    const seuilCreance = 100000; // Seuil configurable pour créances importantes
    
    bonsImpayes.forEach((b) => {
      const reste = n(b.reste_a_payer ?? b.montant);
      if (reste > seuilCreance) {
        alerts.push({
          type: "creance_importante",
          client: b.client_nom,
          numero_bon: b.numero_bon,
          reste,
          message: `Créance importante pour ${b.client_nom}: ${F(reste)} F (bon ${b.numero_bon})`,
          gravite: reste > 500000 ? "critique" : "moyenne"
        });
      }
    });
    return alerts;
  }, [bonsImpayes]);

  // Toutes les alertes consolidées — critiques en premier
  const toutesAlertes = useMemo(() => {
    const all = [...alertesIndex, ...alertesStock, ...alertesCaisse, ...alertesCreances];
    return all.sort((a, b) => {
      if (a.gravite === "critique" && b.gravite !== "critique") return -1;
      if (a.gravite !== "critique" && b.gravite === "critique") return 1;
      return 0;
    });
  }, [alertesIndex, alertesStock, alertesCaisse, alertesCreances]);

  const nbAlertesCritiques = useMemo(() => toutesAlertes.filter(a => a.gravite === "critique").length, [toutesAlertes]);



  if (loading) return <Loading label="Chargement du poste de commande Gérant..." />;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      {/* ── BANDEAU COCKPIT GÉRANT ── */}
      <div className="bg-gradient-to-br from-[#0B2545] via-[#103B6B] to-[#0D2D52] text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-blue-800/60 space-y-5">
        
        {/* Ligne 1 : Marque & Titre & Contrôles Temps */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="h-6 px-2.5 bg-white rounded-md flex items-center justify-center shadow-xs">
                <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-3.5 w-auto object-contain" />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500/90 text-white uppercase tracking-wider">
                DAMEL MANAGEMENT
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/10 text-amber-300 px-2 py-0.5 rounded-full border border-white/10">
                <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3 h-3 object-contain rounded-xs" />
                <span>Réseau Star Energy</span>
              </span>
            </div>

            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {stationNom}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950 uppercase tracking-wide shadow-xs">
                Poste Gérant
              </span>
            </div>
            <p className="text-xs text-blue-200/80 mt-1 font-medium">
              Supervision en direct : descentes pompistes, créances, carburant et services
            </p>
          </div>

          {/* Date & Actualisation & Action Clôture Prioritaire */}
          <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
            <div className="flex items-center gap-2 bg-black/25 px-3 py-2 rounded-xl border border-white/10 text-xs">
              <span className="text-blue-200 font-semibold">Date :</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-white font-bold outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => loadStationData()}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all flex items-center gap-1.5 border border-white/10 active:scale-95"
              title="Rafraîchir les données de la station"
            >
              <span>🔄</span>
              {lastRefresh && (
                <span className="text-[10px] text-blue-200 hidden sm:inline font-mono">
                  {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate(`/validation-cloture?station=${encodeURIComponent(stationCode)}&date=${encodeURIComponent(date)}`)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center gap-1.5"
              title="Validation de clôture journalière après vérification de cohérence"
            >
              <span>📋</span>
              <span>Clôture Officielle</span>
            </button>
          </div>
        </div>

        {/* Ligne 2 : Liens d'accès rapide aux modules complémentaires */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200/70">
            Modules rapides :
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate(`/clients-pro?tab=factures`)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/10 flex items-center gap-1.5"
            >
              <span>📄</span>
              <span>Facturation OHADA</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/comptes-clients-b2b")}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/10 flex items-center gap-1.5"
            >
              <span>🏢</span>
              <span>Comptes B2B</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/depenses")}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/10 flex items-center gap-1.5"
            >
              <span>💳</span>
              <span>Dépenses</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/gestion-quarts")}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/10 flex items-center gap-1.5"
            >
              <span>⏰</span>
              <span>Planning Quarts</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("equipe")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                activeTab === "equipe"
                  ? "bg-purple-600 text-white border-purple-400"
                  : "bg-white/10 hover:bg-white/20 text-white border-white/10"
              }`}
            >
              <span>👥</span>
              <span>Équipe ({equipe.length})</span>
            </button>
          </div>
        </div>

        {/* ── KPIs OPÉRATIONNELS DU SITE (Style BASE_JOURS Excel) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 pt-2">
          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs">
            <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">CA Total Jour</div>
            <div className="text-base sm:text-lg font-black text-white tabular mt-1">{F(totalRecetteStation)} F</div>
            <div className="text-[11px] text-blue-200/70 font-medium">Tous services</div>
          </div>

          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs">
            <div className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Volume GASOIL</div>
            <div className="text-base sm:text-lg font-black text-white tabular mt-1">{F(volumesGasoil)} L</div>
            <div className="text-[11px] text-blue-200 font-semibold">{F(caGasoil)} F</div>
          </div>

          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs">
            <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Volume SUPER</div>
            <div className="text-base sm:text-lg font-black text-white tabular mt-1">{F(volumesSuper)} L</div>
            <div className="text-[11px] text-emerald-200 font-semibold">{F(caSuper)} F</div>
          </div>

          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs">
            <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Marge Théorique</div>
            <div className="text-base sm:text-lg font-black text-white tabular mt-1">{F(margeTheorique)} F</div>
            <div className="text-[11px] text-purple-200/70 font-medium">Carburant</div>
          </div>

          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs">
            <div className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Créances Clients</div>
            <div className="text-base sm:text-lg font-black text-white tabular mt-1">{F(totalResteBons)} F</div>
            <div className="text-[11px] text-rose-300 font-bold">{bonsImpayes.length} bon(s)</div>
          </div>

          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs">
            <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Écart Caisse</div>
            <div className={`text-base sm:text-lg font-black tabular mt-1 ${totalEcartDescentes >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {totalEcartDescentes >= 0 ? "+" : ""}{F(totalEcartDescentes)} F
            </div>
            <div className="text-[11px] text-blue-200/70 font-medium">{descentes.length} descente(s)</div>
          </div>

          <div className="bg-white/[0.08] hover:bg-white/[0.12] transition-colors border border-white/10 p-3 rounded-xl backdrop-blur-xs col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold text-orange-300 uppercase tracking-wider">Dépenses Jour</div>
            <div className="text-base sm:text-lg font-black text-orange-200 tabular mt-1">{F(totalDepensesJour)} F</div>
            <div className="text-[11px] text-orange-300/80 font-medium">{depensesJour.length} opération(s)</div>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm font-bold shadow-xs flex items-center justify-between ${
            msgType === "error" ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"
          }`}
        >
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-base px-2">✕</button>
        </div>
      )}

      {/* ── HUB HISTOIRE QUOTIDIENNE GÉRANT 📰 */}
      {afficherHistoire && histoire && (
        <HistoireQuotidienne
          histoire={histoire}
          onFermer={() => setAfficherHistoire(false)}
        />
      )}
      {!afficherHistoire && histoire && (
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📰</span>
            <div>
              <div className="font-black text-indigo-900 text-sm">Briefing 1 minute — {stationNom}</div>
              <div className="text-xs text-slate-500">
                {histoire.nbHistoires} slides · {histoire.nbAlertes || 0} point(s) d'attention
              </div>
            </div>
          </div>
          <button
            onClick={() => setAfficherHistoire(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            🎬 Voir le briefing
          </button>
        </div>
      )}

      {/* ── NAVIGATION PAR ONGLETS ÉPURÉE ── */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
          <button
            onClick={() => setActiveTab("tableau_bord")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "tableau_bord"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>📊</span>
            <span>Tableau de Bord</span>
          </button>

          <button
            onClick={() => setActiveTab("descentes")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "descentes"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>⛽</span>
            <span>Descentes ({descentes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("bons")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "bons"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>🎫</span>
            <span>Bons Carburant ({tousBons.length})</span>
            {bonsImpayes.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {bonsImpayes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("services")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "services"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>🚿</span>
            <span>Lavage & Boutique ({lavages.length + ventesBoutique.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("cuves")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "cuves"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>🛢️</span>
            <span>Cuves & Jauges ({jauges.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("alertes")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "alertes"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>⚠️</span>
            <span>Alertes ({toutesAlertes.length})</span>
            {toutesAlertes.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {toutesAlertes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("equipe")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              activeTab === "equipe"
                ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <span>👥</span>
            <span>Équipe ({equipe.length})</span>
          </button>
        </div>
      </div>

      {/* ── TAB 0 : TABLEAU DE BORD (Style BASE_JOURS Excel) ── */}
      {activeTab === "tableau_bord" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: T.line }}>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">
              Synthèse Journalière — {fmtDate(date)}
            </h2>

            {/* Synthèse comme BASE_JOURS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-blue-50 rounded-xl">
                <div className="text-[10px] font-bold text-blue-700 uppercase">Volume GASOIL</div>
                <div className="text-lg font-black text-blue-900 tabular">{F(volumesGasoil)} L</div>
                <div className="text-xs text-blue-600">{F(caGasoil)} F</div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">Volume SUPER</div>
                <div className="text-lg font-black text-emerald-900 tabular">{F(volumesSuper)} L</div>
                <div className="text-xs text-emerald-600">{F(caSuper)} F</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl">
                <div className="text-[10px] font-bold text-purple-700 uppercase">Marge Théorique</div>
                <div className="text-lg font-black text-purple-900 tabular">{F(margeTheorique)} F</div>
                <div className="text-xs text-purple-600">Carburant</div>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl">
                <div className="text-[10px] font-bold text-amber-700 uppercase">Écart Caisse</div>
                <div className={`text-lg font-black tabular ${totalEcartDescentes >= 0 ? "text-emerald-900" : "text-rose-900"}`}>
                  {totalEcartDescentes >= 0 ? "+" : ""}{F(totalEcartDescentes)} F
                </div>
                <div className="text-xs text-amber-600">{descentes.length} descente(s)</div>
              </div>
            </div>

            {/* Modes de paiement */}
            <h3 className="text-xs font-bold text-gray-700 uppercase mb-3">Modes d'Encaissement</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-2 bg-gray-50 rounded-lg">
                <div className="text-[10px] text-gray-500">Espèces</div>
                <div className="font-bold text-gray-900">{F(totalEspeces)} F</div>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <div className="text-[10px] text-gray-500">Wave/O.Money</div>
                <div className="font-bold text-gray-900">{F(totalMobileMoney)} F</div>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <div className="text-[10px] text-gray-500">Carte Bancaire</div>
                <div className="font-bold text-gray-900">{F(totalCarteBancaire)} F</div>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <div className="text-[10px] text-gray-500">Bons Crédit</div>
                <div className="font-bold text-gray-900">{F(totalResteBons)} F</div>
              </div>
            </div>

            {/* Stocks cuves */}
            <h3 className="text-xs font-bold text-gray-700 uppercase mb-3">État des Stocks Cuves</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stocksStation.slice(0, 4).map((s) => {
                const stock = n(s.stock);
                const capacite = n(s.capacite);
                const pct = capacite > 0 ? Math.round((stock / capacite) * 100) : 0;
                return (
                  <div key={s.code} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-gray-900">{s.nom || s.code}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pct < 20 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div className={`h-full rounded-full ${pct < 20 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Stock: {F(stock)} L</span>
                      <span>Capacité: {F(capacite)} L</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB ALERTES ── */}
      {activeTab === "alertes" && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
            Contrôles et Alertes — {fmtDate(date)}
          </h2>

          {toutesAlertes.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-xs shadow-sm">
              <p className="font-bold text-gray-700 text-sm">✓ Aucune alerte détectée</p>
              <p className="text-gray-400 mt-1">Tous les indicateurs sont dans les normes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertesIndex.length > 0 && (
                <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: T.line }}>
                  <h3 className="text-xs font-bold text-rose-700 uppercase mb-3">⚠️ Incohérences d'Index ({alertesIndex.length})</h3>
                  {alertesIndex.map((alert, idx) => (
                    <div key={idx} className={`p-3 rounded-lg mb-2 ${alert.gravite === 'critique' ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
                      <div className="font-bold text-xs mb-1">
                        {alert.gravite === 'critique' ? '🔴 CRITIQUE' : '🟡 MOYENNE'} - {alert.pompiste}
                      </div>
                      <div className="text-xs text-gray-700">{alert.message}</div>
                      {alert.date_courant && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          Du {fmtDate(alert.date_courant)} au {fmtDate(alert.date_suivant)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {alertesStock.length > 0 && (
                <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: T.line }}>
                  <h3 className="text-xs font-bold text-amber-700 uppercase mb-3">📦 Stocks Bas ({alertesStock.length})</h3>
                  {alertesStock.map((alert, idx) => (
                    <div key={idx} className={`p-3 rounded-lg mb-2 ${alert.gravite === 'critique' ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
                      <div className="font-bold text-xs mb-1">
                        {alert.gravite === 'critique' ? '🔴 CRITIQUE' : '🟡 MOYENNE'}
                      </div>
                      <div className="text-xs text-gray-700">{alert.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {alertesCaisse.length > 0 && (
                <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: T.line }}>
                  <h3 className="text-xs font-bold text-purple-700 uppercase mb-3">💰 Écarts de Caisse ({alertesCaisse.length})</h3>
                  {alertesCaisse.map((alert, idx) => (
                    <div key={idx} className={`p-3 rounded-lg mb-2 ${alert.gravite === 'critique' ? 'bg-rose-50 border border-rose-200' : 'bg-purple-50 border border-purple-200'}`}>
                      <div className="font-bold text-xs mb-1">
                        {alert.gravite === 'critique' ? '🔴 CRITIQUE' : '🟡 MOYENNE'}
                      </div>
                      <div className="text-xs text-gray-700">{alert.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {alertesCreances.length > 0 && (
                <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: T.line }}>
                  <h3 className="text-xs font-bold text-blue-700 uppercase mb-3">📄 Créances Importantes ({alertesCreances.length})</h3>
                  {alertesCreances.map((alert, idx) => (
                    <div key={idx} className={`p-3 rounded-lg mb-2 ${alert.gravite === 'critique' ? 'bg-rose-50 border border-rose-200' : 'bg-blue-50 border border-blue-200'}`}>
                      <div className="font-bold text-xs mb-1">
                        {alert.gravite === 'critique' ? '🔴 CRITIQUE' : '🟡 MOYENNE'}
                      </div>
                      <div className="text-xs text-gray-700">{alert.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 1 : DESCENTES POMPISTES & ÉTAT RÉEL DU POMPISTE ── */}
      {activeTab === "descentes" && (
        <div className="space-y-4">
          {/* En-tête supervision & Sélecteur rapide */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b" style={{ borderColor: T.line }}>
            <div>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                <span>⛽ Supervision des Descentes &amp; État Réel des Pompistes</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-900">
                  {fmtDate(date)}
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Sélectionnez un pompiste pour consulter l'état réel et complet de sa journée (index, pompes, encaissements et écart).
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs text-gray-500 font-semibold">Pompiste :</span>
              <select
                value={pompisteFiltre}
                onChange={(e) => setPompisteFiltre(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs font-bold bg-white text-gray-900 border-gray-300 focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                <option value="TOUS">-- Tous les Pompistes ({descentes.length}) --</option>
                {listePompistes.map((p) => {
                  const count = descentes.filter(
                    (d) =>
                      d.pompiste_id === p.id ||
                      d.pompiste_nom === p.nom ||
                      d.pompiste === p.code ||
                      d.pompiste_id === p.code
                  ).length;
                  return (
                    <option key={p.id || p.code} value={p.id || p.nom}>
                      {p.nom} {count > 0 ? `(${count} descente${count > 1 ? "s" : ""})` : "(0 descente)"}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* SÉLECTEUR VISUEL RAPIDE DE POMPISTES (BOUTONS / BADGES HORIZONTAUX) */}
          <div className="bg-white p-3 rounded-2xl border shadow-xs space-y-2" style={{ borderColor: T.line }}>
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
              Pompistes en service à la station :
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setPompisteFiltre("TOUS")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  pompisteFiltre === "TOUS"
                    ? "bg-[#0B2545] text-white shadow-sm ring-1 ring-blue-900"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <span>👥</span>
                <span>Tous les Pompistes ({descentes.length})</span>
              </button>

              {listePompistes.map((p) => {
                const countDescentes = descentes.filter(
                  (d) =>
                    d.pompiste_id === p.id ||
                    d.pompiste_nom === p.nom ||
                    d.pompiste === p.code ||
                    d.pompiste_id === p.code
                ).length;
                const isSelected =
                  pompisteFiltre === p.id || pompisteFiltre === p.nom || pompisteFiltre === p.code;

                return (
                  <button
                    key={p.id || p.code}
                    type="button"
                    onClick={() => setPompisteFiltre(isSelected ? "TOUS" : (p.id || p.nom))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                      isSelected
                        ? "bg-amber-400 text-slate-950 border-amber-500 shadow-sm font-black ring-1 ring-amber-500"
                        : countDescentes > 0
                        ? "bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 opacity-70"
                    }`}
                  >
                    <span>{countDescentes > 0 ? "⛽" : "👤"}</span>
                    <span>{p.nom}</span>
                    {countDescentes > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                          isSelected ? "bg-slate-900 text-white" : "bg-emerald-600 text-white"
                        }`}
                      >
                        {countDescentes} quart{countDescentes > 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* CAS 1 : UN POMPISTE PARTICULIER EST SÉLECTIONNÉ */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {pompisteFiltre !== "TOUS" && (
            <div>
              {/* SOUS-CAS 1.A : Le pompiste n'a AUCUNE descente pour cette date */}
              {descentesFiltrees.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border text-center shadow-xs space-y-3" style={{ borderColor: T.line }}>
                  <div className="text-3xl">⚠️</div>
                  <h3 className="font-black text-sm text-gray-900">
                    Aucune descente enregistrée pour {pompisteSelectionne?.nom || pompisteFiltre} le {fmtDate(date)}
                  </h3>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    Ce collaborateur n'a pas encore de quart ou de descente clôturée pour cette date. Vous pouvez basculer vers un autre pompiste ou ouvrir le formulaire de descente.
                  </p>
                  <div className="pt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPompisteFiltre("TOUS")}
                      className="px-3.5 py-2 rounded-xl border text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                      style={{ borderColor: T.line }}
                    >
                      ← Voir tous les pompistes
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/descente")}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <span>➕</span>
                      <span>Saisir une Descente Pompiste</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* SOUS-CAS 1.B : ÉTAT RÉEL ET CONSOLIDÉ DE LA JOURNÉE DU POMPISTE */
                etatReelPompiste && (
                  <div className="space-y-4">
                    {/* CARTE MAÎTRESSE : ÉTAT RÉEL DU POMPISTE */}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white rounded-2xl p-5 shadow-xl border border-slate-800 space-y-4">
                      {/* En-tête Pompiste */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs uppercase font-extrabold text-amber-400 tracking-wider">
                              Fiche d'Évaluation Quotidienne · {fmtDate(date)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                              {etatReelPompiste.nbQuarts} quart{etatReelPompiste.nbQuarts > 1 ? "s" : ""} enregistré{etatReelPompiste.nbQuarts > 1 ? "s" : ""}
                            </span>
                          </div>
                          <h3 className="text-xl font-black text-white mt-0.5 flex items-center gap-2">
                            <span>👤</span>
                            <span>{pompisteSelectionne?.nom || pompisteFiltre}</span>
                          </h3>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPompisteFiltre("TOUS")}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white text-xs font-bold transition-colors"
                          >
                            ✕ Fermer filtre
                          </button>
                        </div>
                      </div>

                      {/* 4 GRANDS KPIS DE SA JOURNÉE */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] uppercase font-bold text-blue-300">Volume Total Carburant</div>
                          <div className="text-xl font-black font-mono text-white tabular mt-1">
                            {F(etatReelPompiste.totalVolume)} L
                          </div>
                          <div className="text-[11px] text-gray-400">Total distribué aux pompes</div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] uppercase font-bold text-amber-300">CA Carburant Brut</div>
                          <div className="text-xl font-black font-mono text-amber-300 tabular mt-1">
                            {F(etatReelPompiste.totalCarburant)} F
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {etatReelPompiste.totalLubrifiants > 0 ? `+ ${F(etatReelPompiste.totalLubrifiants)} F (Lubrifiants)` : "Sans lubrifiants"}
                          </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <div className="text-[10px] uppercase font-bold text-cyan-300">Total Théorique Net</div>
                          <div className="text-xl font-black font-mono text-cyan-200 tabular mt-1">
                            {F(etatReelPompiste.totalTheorique)} F
                          </div>
                          <div className="text-[11px] text-gray-400">Net exigible à justifier</div>
                        </div>

                        <div className={`border rounded-xl p-3 ${
                          etatReelPompiste.ecart === 0
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                            : etatReelPompiste.ecart > 0
                            ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                            : "bg-rose-500/20 border-rose-500/40 text-rose-300"
                        }`}>
                          <div className="text-[10px] uppercase font-black tracking-wider">
                            {etatReelPompiste.ecart === 0
                              ? "Caisse Équilibrée"
                              : etatReelPompiste.ecart > 0
                              ? "Excédent de Caisse (+)"
                              : "Déficit / Manquant (-)"}
                          </div>
                          <div className="text-xl font-black font-mono tabular mt-1">
                            {etatReelPompiste.ecart >= 0 ? "+" : ""}{F(etatReelPompiste.ecart)} F CFA
                          </div>
                          <div className="text-[11px] opacity-80">
                            Versé: {F(etatReelPompiste.totalVerse)} F
                          </div>
                        </div>
                      </div>

                      {/* SECTION A : TABLEAU DES POMPES & INDEX DE SA JOURNÉE */}
                      <div className="space-y-2 pt-1">
                        <div className="text-xs font-bold text-gray-300 uppercase tracking-wide flex items-center gap-1.5">
                          <span>⛽ Index &amp; Pistolets Tournés par le Pompiste</span>
                        </div>
                        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/70">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-gray-400 uppercase text-[10px] font-bold">
                                <th className="py-2.5 px-3 text-left">Pistolet / Caisse</th>
                                <th className="py-2.5 px-3 text-left">Produit</th>
                                <th className="py-2.5 px-3 text-right">Index Départ</th>
                                <th className="py-2.5 px-3 text-right">Index Fin</th>
                                <th className="py-2.5 px-3 text-right">Volume (L)</th>
                                <th className="py-2.5 px-3 text-right">Prix Unitaire</th>
                                <th className="py-2.5 px-3 text-right text-amber-400">Montant CA</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                              {etatReelPompiste.pompes.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-3 px-3 text-center text-gray-500 font-sans italic">
                                    Aucune pompe détaillée trouvée pour cette session.
                                  </td>
                                </tr>
                              ) : (
                                etatReelPompiste.pompes.map((p, idx) => {
                                  const vol = n(p.volume_vendu ?? (n(p.index_fin) >= n(p.index_debut) ? n(p.index_fin) - n(p.index_debut) : 0));
                                  const mt = n(p.montant ?? vol * n(p.prix_unitaire));
                                  return (
                                    <tr key={p.id || idx} className="hover:bg-slate-800/40">
                                      <td className="py-2 px-3 font-sans font-bold text-gray-200">
                                        {p.caisseId ? `${p.caisseId} · ` : ""}{p.pistolet_code || p.id || `P-${idx + 1}`}
                                      </td>
                                      <td className="py-2 px-3 font-sans">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          (p.produit || "").includes("GASOIL")
                                            ? "bg-blue-900/60 text-blue-300 border border-blue-700/50"
                                            : "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                                        }`}>
                                          {p.produit || "GASOIL"}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-right tabular text-gray-300">{F(n(p.index_debut))}</td>
                                      <td className="py-2 px-3 text-right tabular text-gray-200 font-bold">{F(n(p.index_fin))}</td>
                                      <td className="py-2 px-3 text-right tabular text-blue-300 font-bold">{F(vol)} L</td>
                                      <td className="py-2 px-3 text-right tabular text-gray-400">{F(n(p.prix_unitaire))} F</td>
                                      <td className="py-2 px-3 text-right tabular text-amber-300 font-bold">{F(mt)} F</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                            <tfoot className="border-t border-slate-700 bg-slate-900/90 font-bold">
                              <tr>
                                <td colSpan={4} className="py-2.5 px-3 uppercase text-gray-300 font-sans">
                                  TOTAL POMPES
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular text-blue-300 font-black">
                                  {F(etatReelPompiste.totalVolume)} L
                                </td>
                                <td></td>
                                <td className="py-2.5 px-3 text-right font-mono tabular text-amber-300 font-black">
                                  {F(etatReelPompiste.totalCarburant)} F CFA
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* SECTION B : DÉTAIL DES ENCAISSEMENTS PAR MODE */}
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-bold text-gray-300 uppercase tracking-wide flex items-center justify-between">
                          <span>💳 Ventilation Exhaustive de ses Encaissements Réels Reçus</span>
                          <span className="text-amber-400 font-mono text-sm">
                            Total Versé : {F(etatReelPompiste.totalVerse)} F CFA
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">💵 Espèces Remises</div>
                            <div className="text-base font-black font-mono text-emerald-400 tabular mt-1">
                              {F(etatReelPompiste.especes)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">📱 Wave</div>
                            <div className="text-base font-black font-mono text-blue-400 tabular mt-1">
                              {F(etatReelPompiste.wave)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">📱 Orange Money</div>
                            <div className="text-base font-black font-mono text-orange-400 tabular mt-1">
                              {F(etatReelPompiste.om)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">💳 Carte TPE / Bancaire</div>
                            <div className="text-base font-black font-mono text-indigo-400 tabular mt-1">
                              {F(etatReelPompiste.cb)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">📋 Bons &amp; Crédits</div>
                            <div className="text-base font-black font-mono text-amber-400 tabular mt-1">
                              {F(etatReelPompiste.credits)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">🎫 Tickets Valeur</div>
                            <div className="text-base font-black font-mono text-teal-400 tabular mt-1">
                              {F(etatReelPompiste.tickets)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">🛢️ Petrosen</div>
                            <div className="text-base font-black font-mono text-gray-300 tabular mt-1">
                              {F(etatReelPompiste.petrosen)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">📟 Code Électronique</div>
                            <div className="text-base font-black font-mono text-purple-400 tabular mt-1">
                              {F(etatReelPompiste.codeElec)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">🔄 Autre Paiement</div>
                            <div className="text-base font-black font-mono text-slate-300 tabular mt-1">
                              {F(etatReelPompiste.autre)} F
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                            <div className="text-[10px] text-gray-400 uppercase font-semibold">💸 Dépenses Pompiste</div>
                            <div className="text-base font-black font-mono text-rose-400 tabular mt-1">
                              {F(etatReelPompiste.totalDepenses)} F
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* SECTION C : LUBRIFIANTS, REMISES EN CUVE & DÉPENSES AVEC MOTIFS */}
                      {(etatReelPompiste.totalLubrifiants > 0 || etatReelPompiste.totalRemiseCuve > 0 || etatReelPompiste.totalDepenses > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                          {etatReelPompiste.totalLubrifiants > 0 && (
                            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                              <span className="text-[10px] uppercase font-bold text-amber-400">Ventes de Lubrifiants sur Piste</span>
                              <div className="font-mono font-bold text-amber-300 text-sm">+{F(etatReelPompiste.totalLubrifiants)} F</div>
                              <div className="text-[11px] text-gray-400">{etatReelPompiste.lubrifiants.length} produit(s) vendu(s)</div>
                            </div>
                          )}

                          {etatReelPompiste.totalRemiseCuve > 0 && (
                            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                              <span className="text-[10px] uppercase font-bold text-rose-400">Remise en Cuve (Étalonnage / Test)</span>
                              <div className="font-mono font-bold text-rose-300 text-sm">-{F(etatReelPompiste.totalRemiseCuve)} F</div>
                              <div className="text-[11px] text-gray-400">{etatReelPompiste.motifsRemise || "Test jauge"}</div>
                            </div>
                          )}

                          {etatReelPompiste.totalDepenses > 0 && (
                            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                              <span className="text-[10px] uppercase font-bold text-rose-400">Dépenses de Piste Justifiées</span>
                              <div className="font-mono font-bold text-rose-300 text-sm">-{F(etatReelPompiste.totalDepenses)} F</div>
                              <div className="text-[11px] text-gray-400 italic">Motif : {etatReelPompiste.motifsDepenses || "Dépense justifiée"}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SECTION D : LISTE DES BONS CLIENTS (SI PRÉSENTS) */}
                      {etatReelPompiste.bons.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                            📋 Détail des Bons de Carburant Acceptés ({etatReelPompiste.bons.length})
                          </div>
                          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/60">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-800 text-gray-400 uppercase text-[10px]">
                                  <th className="py-2 px-3 text-left">N° Bon</th>
                                  <th className="py-2 px-3 text-left">Client Débiteur</th>
                                  <th className="py-2 px-3 text-right">Volume</th>
                                  <th className="py-2 px-3 text-right text-amber-300">Montant</th>
                                  <th className="py-2 px-3 text-left">Observation</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-mono">
                                {etatReelPompiste.bons.map((b, idx) => (
                                  <tr key={b.id || idx}>
                                    <td className="py-1.5 px-3 font-bold text-white">{b.numero_bon || `BON-${idx + 1}`}</td>
                                    <td className="py-1.5 px-3 font-sans text-gray-300">{b.client_nom || b.client_code || "Client Pro"}</td>
                                    <td className="py-1.5 px-3 text-right tabular text-gray-400">{n(b.volume_litres)} L</td>
                                    <td className="py-1.5 px-3 text-right tabular text-amber-300 font-bold">{F(b.montant)} F</td>
                                    <td className="py-1.5 px-3 font-sans text-gray-500 italic text-[11px]">{b.observation || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* DÉTAIL DE CHAQUE SESSION / QUART DU POMPISTE */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                        Sessions / Quarts Individuels ({descentesFiltrees.length})
                      </div>
                      <div className="space-y-2">
                        {descentesFiltrees.map((d) => {
                          const isTerminee = d.statut === "TERMINEE";
                          const isValidee = d.statut === "VALIDEE";
                          const ecartVal = n(d.ecart);
                          const peutValider = peutAgirProfil(profil, "rapport", "valider") && isTerminee && !isValidee;

                          return (
                            <div key={d.id} className="bg-white rounded-xl border p-3 shadow-xs space-y-2" style={{ borderColor: T.line }}>
                              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b" style={{ borderColor: T.line }}>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                    {d.numero || d.id?.slice(0, 8)}
                                  </span>
                                  <span className="font-bold text-xs text-gray-900">
                                    {d.quart ? `Quart : ${d.quart}` : "Session de service"}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      isValidee
                                        ? "bg-blue-100 text-blue-800"
                                        : isTerminee
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-amber-100 text-amber-900"
                                    }`}
                                  >
                                    {isValidee ? "✓ Validée par gérant" : isTerminee ? "✓ Soumise par pompiste" : "🟡 En cours"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {peutValider && (
                                    <button
                                      type="button"
                                      disabled={validatingId === d.id}
                                      onClick={async () => {
                                        setValidatingId(d.id);
                                        try {
                                          await updateDescente(d.id, {
                                            statut: "VALIDEE",
                                            valide_par: profil?.id,
                                            valide_le: new Date().toISOString(),
                                          });
                                          flash(`Descente de ${d.pompiste_nom} validée ✓`);
                                          await loadStationData();
                                        } catch (e) {
                                          flash("Erreur lors de la validation", "error");
                                        } finally {
                                          setValidatingId(null);
                                        }
                                      }}
                                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold disabled:opacity-50 transition-colors shadow-2xs"
                                    >
                                      {validatingId === d.id ? "..." : "✓ Valider ce Quart"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/descente?id=${d.id}`)}
                                    className="px-2.5 py-1 rounded-lg border text-gray-700 hover:bg-gray-100 text-[11px] font-bold transition-colors"
                                    style={{ borderColor: T.line }}
                                  >
                                    🔍 Consulter / Modifier
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-3 text-xs">
                                <div>
                                  <span className="text-gray-500">Volume : </span>
                                  <strong className="font-mono text-gray-900">{F(d.total_volume || d.volume_vendu || 0)} L</strong>
                                </div>
                                <div>
                                  <span className="text-gray-500">CA Carburant : </span>
                                  <strong className="font-mono text-gray-900">{F(d.total_carburant || d.montant_theorique || 0)} F</strong>
                                </div>
                                <div>
                                  <span className="text-gray-500">Total Versé : </span>
                                  <strong className="font-mono text-blue-900">{F(d.total_encaisse || 0)} F</strong>
                                </div>
                                <div>
                                  <span className="text-gray-500">Écart Quart : </span>
                                  <strong className={`font-mono tabular ${ecartVal >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                                    {ecartVal >= 0 ? "+" : ""}{F(ecartVal)} F
                                  </strong>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* CAS 2 : TOUS LES POMPISTES SONT SÉLECTIONNÉS */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {pompisteFiltre === "TOUS" && (
            <div>
              {descentes.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-xs shadow-sm">
                  <p className="font-bold text-gray-700 text-sm">
                    Aucune descente pompiste enregistrée pour le {fmtDate(date)}.
                  </p>
                  <p className="text-gray-400 mt-1">
                    Dès qu'un pompiste démarre ou soumet son quart, il apparaîtra ici avec ses index et ses modes d'encaissement.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border shadow-sm divide-y" style={{ borderColor: T.line }}>
                  {descentes.map((d) => {
                    const isTerminee = d.statut === "TERMINEE";
                    const isValidee = d.statut === "VALIDEE";
                    const ecartVal = n(d.ecart);
                    const peutValider = peutAgirProfil(profil, "rapport", "valider") && isTerminee && !isValidee;

                    const enc = d.encaissements || {};
                    const espD = n(enc.especes ?? d.especes ?? 0);
                    const wavD = n(enc.wave ?? 0);
                    const omD = n(enc.om ?? enc.orange_money ?? d.mobile_money ?? 0);
                    const cbD = n(enc.cb ?? enc.carte_bancaire ?? enc.tpe ?? d.carte_bancaire ?? 0);
                    const petD = n(enc.petrosen ?? 0);
                    const codD = n(enc.code_electronique ?? 0);
                    const ticD = n(enc.tickets ?? 0);
                    const creD = n(enc.credits ?? enc.credit_client ?? enc.bons ?? d.total_bons ?? 0);
                    const autD = n(enc.autre ?? 0);
                    const depD = n(d.depenses_valeur ?? d.depenses_montant ?? d.depense ?? d.depenses ?? 0);

                    return (
                      <div key={d.id} className="p-4 hover:bg-gray-50/70 transition-colors">
                        {/* En-tête pompiste */}
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {d.numero || d.id?.slice(0, 8)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPompisteFiltre(d.pompiste_id || d.pompiste_nom)}
                              className="font-black text-sm text-blue-900 hover:underline flex items-center gap-1"
                              title="Cliquer pour voir l'état réel complet de sa journée"
                            >
                              <span>👤</span>
                              <span>{d.pompiste_nom || "Pompiste"}</span>
                            </button>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isValidee
                                  ? "bg-blue-100 text-blue-800"
                                  : isTerminee
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {isValidee ? "✓ Validée" : isTerminee ? "✓ Soumise" : "🟡 En cours"}
                            </span>
                            {d.quart && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                {d.quart}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPompisteFiltre(d.pompiste_id || d.pompiste_nom)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition-colors"
                            >
                              🔎 État Réel
                            </button>
                            {peutValider && (
                              <button
                                type="button"
                                disabled={validatingId === d.id}
                                onClick={async () => {
                                  setValidatingId(d.id);
                                  try {
                                    await updateDescente(d.id, {
                                      statut: "VALIDEE",
                                      valide_par: profil?.id,
                                      valide_le: new Date().toISOString(),
                                    });
                                    flash(`Descente de ${d.pompiste_nom} validée ✓`);
                                    await loadStationData();
                                  } catch (e) {
                                    flash("Erreur lors de la validation", "error");
                                  } finally {
                                    setValidatingId(null);
                                  }
                                }}
                                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold disabled:opacity-50 transition-colors"
                              >
                                {validatingId === d.id ? "..." : "✓ Valider"}
                              </button>
                            )}
                            <div className="text-right">
                              <div className="text-[10px] text-gray-400 font-bold uppercase">Écart Caisse</div>
                              <div
                                className={`font-black text-sm tabular ${
                                  ecartVal >= 0 ? "text-emerald-700" : "text-rose-600"
                                }`}
                              >
                                {ecartVal >= 0 ? "+" : ""}{F(ecartVal)} FCFA
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Détails index & pompes */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-xl mb-3">
                          <div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">Pompes / Pistolets</div>
                            <div className="font-semibold text-xs text-gray-800">
                              {(d.pompes && d.pompes.length > 0)
                                ? d.pompes.map((p) => p.pistolet_code).join(", ")
                                : d.pistolet_code || "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">Produit(s)</div>
                            <div className="font-bold text-xs text-blue-900">
                              {d.produit || (d.pompes && d.pompes.map((p) => p.produit).join(", ")) || "GASOIL"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">Volume Total</div>
                            <div className="font-mono text-sm font-bold text-gray-900">
                              {F(d.total_volume || d.volume_vendu || 0)} L
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase">CA Carburant</div>
                            <div className="font-mono text-sm font-bold text-amber-900">
                              {F(d.total_carburant || d.montant_theorique || 0)} F
                            </div>
                          </div>
                        </div>

                        {/* Modes d'encaissement exhaustifs */}
                        <div className="mb-2">
                          <div className="text-[10px] text-gray-500 font-bold uppercase mb-1.5">
                            Encaissements déclarés par mode :
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            {espD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                                💵 Espèces : {F(espD)} F
                              </span>
                            )}
                            {wavD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-semibold">
                                📱 Wave : {F(wavD)} F
                              </span>
                            )}
                            {omD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 font-semibold">
                                📱 OM : {F(omD)} F
                              </span>
                            )}
                            {cbD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-semibold">
                                💳 Carte TPE : {F(cbD)} F
                              </span>
                            )}
                            {creD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                                📋 Bons : {d.bons?.length || 1} bon(s) ({F(creD)} F)
                              </span>
                            )}
                            {ticD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 font-semibold">
                                🎫 Tickets : {F(ticD)} F
                              </span>
                            )}
                            {petD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-900 font-semibold">
                                🛢️ Petrosen : {F(petD)} F
                              </span>
                            )}
                            {codD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-semibold">
                                📟 Code Élec : {F(codD)} F
                              </span>
                            )}
                            {autD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                                🔄 Autre : {F(autD)} F
                              </span>
                            )}
                            {depD > 0 && (
                              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-semibold">
                                💸 Dépenses : {F(depD)} F
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-gray-900 text-white font-bold ml-auto font-mono">
                              Total : {F(d.total_encaisse || 0)} F
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2 : TOUS LES BONS DE CARBURANT DU SITE ── */}
      {activeTab === "bons" && (
        <div className="space-y-3">
          {/* Synthèse Bons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 bg-white border rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-gray-500 uppercase">Total Bons Saisis</div>
              <div className="text-lg font-black text-gray-900 tabular mt-0.5">{tousBons.length} bon(s)</div>
              <div className="text-[11px] text-gray-500">{F(totalMontantBons)} FCFA</div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-blue-700 uppercase">Volume Carburant</div>
              <div className="text-lg font-black text-blue-900 tabular mt-0.5">{F(totalLitresBons)} L</div>
              <div className="text-[11px] text-blue-600">Total litres distribués</div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-rose-700 uppercase">Reste Dû (Dette)</div>
              <div className="text-lg font-black text-rose-800 tabular mt-0.5">{F(totalResteBons)} FCFA</div>
              <div className="text-[11px] text-rose-600">{bonsImpayes.length} bon(s) à encaisser</div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Total Déjà Réglé</div>
              <div className="text-lg font-black text-emerald-800 tabular mt-0.5">{F(totalMontantBons - totalResteBons)} FCFA</div>
              <div className="text-[11px] text-emerald-600">Encaissements validés</div>
            </div>
          </div>

          {/* Filtres + recherche */}
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
            <span className="text-gray-500 font-bold">Filtrer :</span>
            <button
              onClick={() => setFiltreBon("TOUS")}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                filtreBon === "TOUS" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Tous ({tousBons.length})
            </button>
            <button
              onClick={() => setFiltreBon("IMPAYES")}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                filtreBon === "IMPAYES" ? "bg-rose-700 text-white" : "bg-rose-50 text-rose-800 hover:bg-rose-100"
              }`}
            >
              À Régler ({bonsImpayes.length})
            </button>
            <button
              onClick={() => setFiltreBon("REGLES")}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
                filtreBon === "REGLES" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              Soldés ({tousBons.length - bonsImpayes.length})
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <input
                type="search"
                placeholder="Rechercher client, n° bon..."
                value={searchBon}
                onChange={e => setSearchBon(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {searchBon && (
                <button onClick={() => setSearchBon("")} className="text-gray-400 hover:text-gray-700 text-xs font-bold">✕</button>
              )}
            </div>
          </div>

          {/* Table complète des Bons */}
          {bonsFiltres.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-500 text-xs shadow-sm">
              <p className="font-bold text-gray-700 text-sm">Aucun bon de carburant dans cette vue.</p>
              <p className="text-gray-400 mt-1">Les bons saisis par les pompistes lors des descentes de caisse apparaissent automatiquement ici.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                  <tr>
                    <th className="py-2.5 px-3 text-left">Date & Pompiste</th>
                    <th className="py-2.5 px-3 text-left">N° Bon</th>
                    <th className="py-2.5 px-3 text-left">Client Assigné</th>
                    <th className="py-2.5 px-3 text-left">Véhicule / Obs</th>
                    <th className="py-2.5 px-3 text-right">Volume (Litres)</th>
                    <th className="py-2.5 px-3 text-right">Montant Total</th>
                    <th className="py-2.5 px-3 text-right">Reste Dû</th>
                    <th className="py-2.5 px-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: T.line }}>
                  {bonsFiltres.map((b) => {
                    const reste = n(b.reste_a_payer ?? b.montant);
                    const isSolde = reste <= 0;
                    const isPartiel = n(b.montant_regle) > 0 && reste > 0;
                    const isDivers = !b.client_code || b.client_code === "DIVERS";

                    return (
                      <tr key={b.id} className={isSolde ? "hover:bg-gray-50" : isPartiel ? "bg-amber-50/40 hover:bg-amber-50" : "bg-rose-50/30 hover:bg-rose-50/60"}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900 tabular">{fmtDate(b.date)}</div>
                          <div className="text-[10px] text-gray-400">{b.pompiste_nom || "Pompiste"}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                          {b.numero_bon || b.id?.slice(0, 8)}
                        </td>
                        <td className="py-2.5 px-3">
                          {isDivers ? (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold text-[10px] inline-flex items-center gap-1">
                              ⚠️ Non attribué (Divers)
                            </span>
                          ) : (
                            <div>
                              <div className="font-bold text-gray-900">{b.client_nom || b.client_code}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{b.client_code}</div>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700">
                          <div className="font-medium">{b.immatriculation || "Véhicule client"}</div>
                          {b.observations && <div className="text-[10px] text-gray-400 italic">{b.observations}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular font-bold text-blue-900">
                          {n(b.volume_litres) > 0 ? `${F(b.volume_litres)} L` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular font-bold text-gray-900">
                          {F(b.montant)} F
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular font-black ${reste > 0 ? "text-rose-700" : "text-gray-400"}`}>
                          {F(reste)} F
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSolde
                                ? "bg-emerald-100 text-emerald-800"
                                : isPartiel
                                ? "bg-amber-100 text-amber-900"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {isSolde ? "✓ Soldé" : isPartiel ? "🟡 Partiel" : "🔴 Impayé"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isDivers && (
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px]">
                                Non attribué
                              </span>
                            )}
                            {reste > 0 && !isDivers && (
                              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px]">
                                À régler
                              </span>
                            )}
                          </div>
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

      {/* ── TAB 3 : SERVICES AUXILIAIRES (LAVAGE & BOUTIQUE) ── */}
      {activeTab === "services" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lavage Automobile */}
          <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-3" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                  <span>🚿 Lavage Automobile</span>
                </h3>
                <p className="text-[11px] text-gray-500">Recettes et prestations du jour</p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-blue-900 tabular">{F(totalLavageJour)} FCFA</span>
                <div className="text-[10px] text-gray-400">{lavages.length} véhicule(s) lavé(s)</div>
              </div>
            </div>

            {lavages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Aucune prestation de lavage enregistrée aujourd'hui.</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: T.line }}>
                {lavages.map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-900">{l.libelle_vehicule || l.type_vehicule} — {l.immatriculation}</div>
                      <div className="text-[10px] text-gray-400">Agent: {l.agent} · Mode: {l.mode_paiement}</div>
                    </div>
                    <div className="font-black text-gray-900 tabular">{F(l.montant_total)} F</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Boutique / Shop */}
          <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-3" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                  <span>🛒 Boutique & Shop Express</span>
                </h3>
                <p className="text-[11px] text-gray-500">Tickets de caisse et ventes du jour</p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-emerald-900 tabular">{F(totalBoutiqueJour)} FCFA</span>
                <div className="text-[10px] text-gray-400">{ventesBoutique.length} ticket(s) encaissé(s)</div>
              </div>
            </div>

            {ventesBoutique.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Aucune vente boutique enregistrée aujourd'hui.</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: T.line }}>
                {ventesBoutique.map((v) => (
                  <div key={v.id} className="py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-900">Ticket #{v.id?.slice(0, 8)} · {v.vendeur}</div>
                      <div className="text-[10px] text-gray-400">{v.lignes?.map((l) => `${l.quantite}x ${l.designation}`).join(", ")}</div>
                    </div>
                    <div className="font-black text-gray-900 tabular">{F(v.total_montant)} F</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4 : CUVES & JAUGES ── */}
      {activeTab === "cuves" && (
        <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-4" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h3 className="font-bold text-sm text-gray-900">État Volumétrique & Jaugeages Physiques</h3>
              <p className="text-xs text-gray-500">Rapprochement des jauges cuves et dépotages citernes (visualisation)</p>
            </div>
          </div>

          {/* Jaugeages physiques du jour */}
          {jauges.length > 0 && (
            <div className="mb-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">📏 Jaugeages physiques — {fmtDate(date)}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {jauges.map((j, idx) => {
                  const stk = n(j.niveau_litre || j.stock || j.niveau);
                  const cap = n(j.capacite) || 30000;
                  const pct = cap > 0 ? Math.min(100, Math.round((stk / cap) * 100)) : 0;
                  return (
                    <div key={j.id || idx} className="p-3 rounded-xl border bg-blue-50/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-gray-900">{j.nom_cuve || j.cuve_code || `Cuve ${idx + 1}`}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${(j.produit || "").includes("SUP") ? "bg-emerald-100 text-emerald-900" : "bg-blue-100 text-blue-900"}`}>
                          {j.produit || "GASOIL"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">Niveau jaugé :</span>
                          <span className="font-black text-gray-900 tabular">{F(stk)} L ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: pct < 20 ? "#DC2626" : pct < 40 ? "#D97706" : "#2563EB" }}
                          />
                        </div>
                        {j.heure_jauge && <div className="text-[10px] text-gray-500">Relevé à {j.heure_jauge}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stocks théoriques depuis les descentes */}
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">📊 Stocks Théoriques (calcul descentes)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(stocksStation.length > 0 ? stocksStation : (ref?.cuves || [
                { code: "CUV-GO-1", nom: "Cuve Gasoil 1", produit: "GASOIL", capacite: 30000, stock: 18500 },
                { code: "CUV-GO-2", nom: "Cuve Gasoil 2", produit: "GASOIL", capacite: 30000, stock: 14200 },
                { code: "CUV-SU-1", nom: "Cuve Super 1", produit: "SUPER", capacite: 20000, stock: 9800 },
              ])).map((c) => {
                const cap = n(c.capacite) || 30000;
                const stk = n(c.stock) || 0;
                const pct = cap > 0 ? Math.min(100, Math.round((stk / cap) * 100)) : 50;
                const creux = Math.max(0, cap - stk);

                return (
                  <div key={c.code} className="p-3 rounded-xl border bg-gray-50/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-gray-900">{c.nom || c.code}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.produit === "GASOIL" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"}`}>
                        {c.produit}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500">Stock actuel :</span>
                        <span className="font-black text-gray-900 tabular">{F(stk)} L ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct < 20 ? "#DC2626" : pct < 40 ? "#D97706" : c.produit === "GASOIL" ? "#2563EB" : "#059669",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Capacité: {F(cap)} L</span>
                        <span className="font-semibold text-amber-800">Creux: {F(creux)} L</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {jauges.length === 0 && stocksStation.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-4">
              Aucune donnée de jauge saisie pour le {fmtDate(date)}. Les valeurs affichées sont des données de référence.
            </p>
          )}
        </div>
      )}


      {/* ── TAB 5 : MON ÉQUIPE & COMPTES COLLABORATEURS ── */}
      {activeTab === "equipe" && (
        <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-4" style={{ borderColor: T.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: T.line }}>
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <span>👥 Équipe de la {stationNom}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-900">
                  {equipe.filter((e) => e.actif !== false).length} actif(s) sur {equipe.length}
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Pompistes, agents de lavage, vendeurs boutique et techniciens rattachés à votre site (visualisation).
              </p>
            </div>
            <button
              onClick={() => navigate("/configuration")}
              className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
              title="Gérer les collaborateurs dans la configuration"
            >
              <span>➕</span>
              <span className="hidden sm:inline">Nouveau Collaborateur</span>
              <span className="sm:hidden">Ajouter</span>
            </button>
          </div>

          {equipe.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">
              <p className="font-bold text-gray-700">Aucun collaborateur rattaché à cette station pour l'instant.</p>
              <p className="text-gray-400 mt-1 mb-4">Créez un compte pompiste, lavage ou boutique pour votre équipe.</p>
              <button
                onClick={() => navigate("/configuration")}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-md"
              >
                ➕ Créer un collaborateur
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-xl" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]" style={{ borderColor: T.line }}>
                  <tr>
                    <th className="py-2.5 px-3 text-left">Collaborateur</th>
                    <th className="py-2.5 px-3 text-left">Profil / Métier</th>
                    <th className="py-2.5 px-3 text-left">Email de Connexion</th>
                    <th className="py-2.5 px-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {equipe.map((u) => {
                    const isActif = u.actif !== false;
                    const roleIcon =
                      u.role === "pompiste" ? "⛽" :
                      u.role === "lavage" ? "🚿" :
                      u.role === "boutique" ? "🛍️" :
                      u.role === "stock" ? "📦" :
                      u.role === "maintenance" ? "🔧" :
                      u.role === "gerant" ? "📋" : "👤";

                    return (
                      <tr key={u.id} className={isActif ? "hover:bg-purple-50/20" : "bg-gray-50/70 opacity-75"}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900 flex items-center gap-1.5">
                            <span>{roleIcon}</span>
                            <span>{u.nom_complet}</span>
                          </div>
                          {u.telephone && <div className="text-[10px] text-gray-400">📞 {u.telephone}</div>}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700">
                          {u.email}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isActif
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-rose-100 text-rose-800 border-rose-200"
                            }`}
                          >
                            {isActif ? "Actif" : "Suspendu"}
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
