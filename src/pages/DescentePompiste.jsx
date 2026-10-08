import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadReferentiel,
  createDescente,
  updateDescente,
  getDescente,
  listDescentes,
  indexVeille,
  saveOperationCredit,
  savePistolet,
} from "../lib/api";
import { F, fmtDate, n, T, todayISO, prixDuJour, uuid } from "../lib/calcul";
import { Section, Row, Num, Loading, InputComptable } from "../components/ui";
import { peutCorrigerDescente, ROLES_CORRECTION_DESCENTE, peutVoirToutesLesEntrees } from "../lib/permissions";

/** Normalisation défensive pour rétrocompatibilité avec les anciennes descentes mono-pompe */
export function normalizeDescente(d) {
  if (!d) return null;

  const pompes =
    Array.isArray(d.pompes) && d.pompes.length > 0
      ? d.pompes
      : d.pistolet_code
      ? [
          {
            id: d.pistolet_code || "p-1",
            caisseId: "C1",
            pistolet_code: d.pistolet_code,
            produit: d.produit || "GASOIL",
            index_debut: d.index_debut ?? 0,
            index_fin: d.index_fin ?? 0,
            volume_vendu: d.volume_vendu ?? 0,
            prix_unitaire: d.prix_unitaire ?? 0,
            montant: d.montant_theorique ?? 0,
          },
        ]
      : [];

  const bons = Array.isArray(d.bons)
    ? d.bons.map((b) => ({
        ...b,
        volume_litres: n(b.volume_litres ?? b.litres ?? b.volume ?? 0),
        montant: n(b.montant),
      }))
    : d.encaissements?.credit_client > 0
    ? [
        {
          id: "b-legacy",
          client_code: d.client_credit || "CLIENT",
          client_nom: d.client_nom || d.client_credit || "Client Professionnel",
          numero_bon: "BON-01",
          date: d.date,
          volume_litres: 0,
          montant: d.encaissements.credit_client,
          observation: d.commentaire || "",
        },
      ]
    : [];

  const totalVolume = d.total_volume ?? pompes.reduce((acc, p) => acc + n(p.volume_vendu), 0);
  const totalCarburant = d.total_carburant ?? pompes.reduce((acc, p) => acc + n(p.montant), 0);
  const lubrifiants = Array.isArray(d.lubrifiants) ? d.lubrifiants : [];
  const totalLubrifiants = d.total_lubrifiants ?? lubrifiants.reduce((acc, l) => acc + n(l.montant), 0);
  const totalCaisse = d.total_caisse ?? (totalCarburant + totalLubrifiants);
  const totalBons = d.total_bons ?? bons.reduce((acc, b) => acc + n(b.montant), 0);
  const totalBonsLitres = d.total_bons_litres ?? bons.reduce((acc, b) => acc + n(b.volume_litres), 0);
  const remiseCuveValeur = n(d.remise_cuve_valeur ?? d.remise_en_cuve);
  const remiseCuveLitres = n(d.remise_cuve_litres);
  const depensesValeur = n(d.depenses_valeur ?? d.depenses_montant ?? d.depense ?? d.depenses);
  const depensesMotif = d.depenses_motif || d.depense_motif || "";

  return {
    ...d,
    pompes,
    bons,
    lubrifiants,
    total_volume: totalVolume,
    total_carburant: totalCarburant,
    total_lubrifiants: totalLubrifiants,
    total_caisse: totalCaisse,
    total_bons: totalBons,
    total_bons_litres: totalBonsLitres,
    remise_cuve_valeur: remiseCuveValeur,
    remise_cuve_litres: remiseCuveLitres,
    remise_cuve_motif: d.remise_cuve_motif || "",
    remise_cuve_pistolet: d.remise_cuve_pistolet || "",
    depenses_valeur: depensesValeur,
    depenses_motif: depensesMotif,
    encaissements: {
      especes: n(d.encaissements?.especes),
      wave: n(d.encaissements?.wave),
      orange_money: n(d.encaissements?.orange_money),
      carte_bancaire: n(d.encaissements?.carte_bancaire),
      petrosen: n(d.encaissements?.petrosen),
      code_electronique: n(d.encaissements?.code_electronique),
      tickets: n(d.encaissements?.tickets),
      credit_client: totalBons,
      bons: totalBons,
      autre: n(d.encaissements?.autre),
    },
  };
}

export default function DescentePompiste() {
  const { profil } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const stationId = profil?.station_id || "st-hann";
  const stationCode = profil?.stations?.code || stationId.replace("st-", "").toUpperCase();
  const isManager = ROLES_CORRECTION_DESCENTE.includes(profil?.role);
  // Un pompiste ne peut voir que ses propres descentes ; le gérant et les profils avancés voient tout
  const canVoirTout = peutVoirToutesLesEntrees(profil?.role);
  const editIdFromUrl = searchParams.get("id");
  const [ref, setRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok"); // 'ok' | 'error'
  const [descentes, setDescentes] = useState([]);
  const [historiqueView, setHistoriqueView] = useState(false);
  const [ticketModal, setTicketModal] = useState(null);

  // Mode modification / correction d'une descente soumise
  const [editingDescenteId, setEditingDescenteId] = useState(null);

  // Date et Pompiste
  const [date, setDate] = useState(todayISO());
  const [pompisteId, setPompisteId] = useState(profil?.id || "");
  const [pompisteNom, setPompisteNom] = useState(profil?.nom_complet || "");

  // ── Multi-Pompes State ──
  // Chaque pompe = { id, caisseId: "C1", pistolet_code, produit, index_debut, index_fin, volume_vendu, prix_unitaire, montant }
  const [pompes, setPompes] = useState([]);

  // Modal Ajout Pompe
  const [showAddPompeModal, setShowAddPompeModal] = useState(false);
  const [selectedAddCode, setSelectedAddCode] = useState("");
  const [addIndexDebut, setAddIndexDebut] = useState("");
  const [addIndexFin, setAddIndexFin] = useState("");
  // Sous-option : déclarer un nouveau pistolet dans le référentiel physique
  const [isNewPhysicalPump, setIsNewPhysicalPump] = useState(false);
  const [newPhysicalCode, setNewPhysicalCode] = useState("");
  const [newPhysicalProduit, setNewPhysicalProduit] = useState("GASOIL");

  // ── Multi-Bons d'encaissement State ──
  // Chaque bon = { id, client_code, client_nom, numero_bon, date, montant, observation }
  const [bons, setBons] = useState([]);

  // Modal Ajout / Modification Bon
  const [showBonModal, setShowBonModal] = useState(false);
  const [editingBonId, setEditingBonId] = useState(null);
  const [bonClientCode, setBonClientCode] = useState("");
  const [bonNumero, setBonNumero] = useState("");
  const [bonDate, setBonDate] = useState(todayISO());
  const [bonProduit, setBonProduit] = useState("GASOIL");
  const [bonLitres, setBonLitres] = useState("");
  const [bonMontant, setBonMontant] = useState("");
  const [bonObservation, setBonObservation] = useState("");

  // ── Ventes de Lubrifiants State ──
  // Chaque ligne = { id, produit_code, libelle, quantite, prix_unitaire, montant }
  const [lubrifiants, setLubrifiants] = useState([]);
  const [showAddLubModal, setShowAddLubModal] = useState(false);
  const [selectedLubCode, setSelectedLubCode] = useState("");
  const [lubQuantite, setLubQuantite] = useState("1");
  const [lubPrixUnitaire, setLubPrixUnitaire] = useState("");

  // ── Remise en Cuve (Valeur Numéraire) State ──
  const [remiseCuveValeur, setRemiseCuveValeur] = useState("");
  const [remiseCuveLitres, setRemiseCuveLitres] = useState("");
  const [remiseCuveMotif, setRemiseCuveMotif] = useState("");
  const [remiseCuvePistolet, setRemiseCuvePistolet] = useState("");

  // ── Dépenses Pompiste (Justificatifs) State ──
  const [depensesValeur, setDepensesValeur] = useState("");
  const [depensesMotif, setDepensesMotif] = useState("");

  // ── Encaissements Reçus (Multi-modes) ──
  const [especes, setEspeces] = useState("");
  const [wave, setWave] = useState("");
  const [orangeMoney, setOrangeMoney] = useState("");
  const [carteBancaire, setCarteBancaire] = useState("");
  const [petrosen, setPetrosen] = useState("");
  const [codeElectronique, setCodeElectronique] = useState("");
  const [tickets, setTickets] = useState("");
  const [autrePaiement, setAutrePaiement] = useState("");
  const [commentaire, setCommentaire] = useState("");

  const flash = (t, type = "ok") => {
    setMsg(t);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  };

  // Chargement référentiel et descentes
  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      // Si le rôle est restreint (pompiste), on ne charge que les descentes de cet opérateur
      const operateurId = canVoirTout ? undefined : (profil?.id || undefined);
      const des = await listDescentes(stationId, undefined, operateurId);
      setDescentes((des || []).map(normalizeDescente));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  useEffect(() => {
    if (!editIdFromUrl) return undefined;
    let cancelled = false;
    (async () => {
      const d = await getDescente(editIdFromUrl);
      if (cancelled) return;
      if (d) handleEditerDescente(d);
      else flash("Descente introuvable. Elle a peut-être été supprimée.", "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [editIdFromUrl]);

  // Liste de tous les pistolets configurés pour cette station
  const pistList = useMemo(() => {
    return (ref?.pistolets || []).filter((p) => !stationId || p.station_id === stationId);
  }, [ref, stationId]);

  // Liste combinée et dédoublonnée des clients disponibles
  const clientsList = useMemo(() => {
    const map = new Map();
    (ref?.clients || []).forEach((c) => {
      if (c.code) map.set(c.code, { code: c.code, nom: c.nom || c.code });
    });
    (ref?.clients_pro || []).forEach((cp) => {
      if (cp.code && !map.has(cp.code)) {
        map.set(cp.code, { code: cp.code, nom: cp.nom_entreprise || cp.code });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [ref]);

  // Liste des lubrifiants disponibles pour vente sur piste
  const lubrifiantsList = useMemo(() => {
    const fromRef = (ref?.produits || []).filter((p) => p.categorie === "LUBRIFIANT" || p.type === "LUBRIFIANT" || String(p.code).startsWith("LUB-"));
    if (fromRef.length > 0) return fromRef;
    return [
      { code: "LUB-5W40-5L", nom: "5W40 5L", prix_vente: 29000 },
      { code: "LUB-5W30-5L", nom: "5W30 5L", prix_vente: 33000 },
      { code: "LUB-10W40-5L", nom: "10W40 5L", prix_vente: 18000 },
      { code: "LUB-15W40-5L", nom: "15W40 5L", prix_vente: 15000 },
      { code: "LUB-20W50-5L", nom: "20W50 5L", prix_vente: 13500 },
      { code: "LUB-SAE50-5L", nom: "SAE50 5L", prix_vente: 13000 },
      { code: "LUB-SAE50-1L", nom: "SAE50 1L", prix_vente: 2800 },
      { code: "LUB-15W40-1L", nom: "15W40 1L", prix_vente: 3000 },
      { code: "LUB-20W50-1L", nom: "20W50 1L", prix_vente: 2700 },
      { code: "LUB-VRAC", nom: "Huile Vrac 1L", prix_vente: 2200 },
      { code: "LUB-LAVE-GLACE", nom: "Lave Glace CEPSA", prix_vente: 1500 },
      { code: "LUB-CEPSA-GLACIOL-5L", nom: "CEPSA Glaciol 5L", prix_vente: 5000 },
      { code: "LUB-GRAISSE", nom: "Graisse Haute Pression", prix_vente: 3500 },
    ];
  }, [ref]);

  const openAddLubModal = () => {
    const first = lubrifiantsList[0];
    setSelectedLubCode(first?.code || "");
    setLubQuantite("1");
    setLubPrixUnitaire(first?.prix_vente != null ? first.prix_vente.toString() : "15000");
    setShowAddLubModal(true);
  };

  const handleSelectLubrifiant = (code) => {
    setSelectedLubCode(code);
    const item = lubrifiantsList.find((l) => l.code === code);
    if (item && item.prix_vente) {
      setLubPrixUnitaire(item.prix_vente.toString());
    }
  };

  const handleSaveLubrifiant = (e) => {
    e.preventDefault();
    if (!selectedLubCode) return flash("Veuillez choisir un lubrifiant", "error");
    const qte = n(lubQuantite);
    if (qte <= 0) return flash("La quantité doit être supérieure à zéro", "error");
    const pu = n(lubPrixUnitaire);
    if (pu <= 0) return flash("Le prix unitaire doit être supérieur à zéro", "error");

    const itemObj = lubrifiantsList.find((l) => l.code === selectedLubCode) || { nom: selectedLubCode };
    const nouveauLub = {
      id: uuid(),
      produit_code: selectedLubCode,
      libelle: itemObj.nom || itemObj.designation || selectedLubCode,
      quantite: qte,
      prix_unitaire: pu,
      montant: qte * pu,
    };

    setLubrifiants((prev) => [...prev, nouveauLub]);
    setShowAddLubModal(false);
    flash("Vente de lubrifiant ajoutée");
  };

  const handleSupprimerLubrifiant = (lubId) => {
    setLubrifiants((prev) => prev.filter((l) => l.id !== lubId));
    flash("Ligne de lubrifiant supprimée");
  };

  // ── GESTION DES POMPES & CAISSES ──

  const handleSelectAddCode = async (code) => {
    setSelectedAddCode(code);
    if (!code) return;
    try {
      const lastIdx = await indexVeille(stationCode, date, code);
      if (lastIdx != null) {
        setAddIndexDebut(lastIdx.toString());
      } else {
        setAddIndexDebut("");
      }
    } catch {
      setAddIndexDebut("");
    }
  };

  const openAddPompeModal = async () => {
    setSelectedAddCode("");
    setAddIndexDebut("");
    setAddIndexFin("");
    setIsNewPhysicalPump(false);
    setNewPhysicalCode("");
    setShowAddPompeModal(true);
  };

  const handleAjouterPompeSession = async (e) => {
    e.preventDefault();

    let targetCode = selectedAddCode;
    let targetProduit = "GASOIL";

    if (isNewPhysicalPump) {
      const cleanCode = newPhysicalCode.trim().toLowerCase().replace(/\s+/g, "");
      if (!cleanCode) return flash("Veuillez saisir le code de la nouvelle pompe", "error");

      const existant = pistList.find((p) => p.code.toLowerCase() === cleanCode);
      if (!existant) {
        const res = await savePistolet({
          station_id: stationId,
          station_code: stationCode,
          code: cleanCode,
          produit: newPhysicalProduit,
        });
        if (!res.ok) return flash("Erreur lors de la création de la pompe", "error");
        await loadData();
      }
      targetCode = cleanCode;
      targetProduit = newPhysicalProduit;
    } else {
      if (!targetCode) return flash("Veuillez sélectionner une pompe", "error");
      const found = pistList.find((p) => p.code === targetCode);
      if (found) targetProduit = found.produit;
    }

    if (pompes.some((p) => p.pistolet_code.toLowerCase() === targetCode.toLowerCase())) {
      return flash(`La pompe ${targetCode.toUpperCase()} est déjà présente dans votre session !`, "error");
    }

    const idxDeb = n(addIndexDebut);
    const idxFin = n(addIndexFin);
    if (addIndexFin !== "" && idxFin < idxDeb) {
      return flash("L'index de fin ne peut pas être inférieur à l'index de début", "error");
    }

    const prix = prixDuJour(ref?.prix || [], targetProduit, date) || 0;
    const vol = idxFin >= idxDeb && addIndexFin !== "" ? idxFin - idxDeb : 0;
    const montant = Math.round(vol * prix);

    const caisseNumero = pompes.length + 1;
    const nouvellePompe = {
      id: uuid(),
      caisseId: `C${caisseNumero}`,
      pistolet_code: targetCode,
      produit: targetProduit,
      index_debut: addIndexDebut,
      index_fin: addIndexFin,
      volume_vendu: vol,
      prix_unitaire: prix,
      montant: montant,
    };

    setPompes([...pompes, nouvellePompe]);
    setShowAddPompeModal(false);
    flash(`Pompe ${targetCode.toUpperCase()} (Caisse C${caisseNumero}) ajoutée à votre session !`);
  };

  const handleUpdatePompeField = (pompeId, field, value) => {
    setPompes((prev) =>
      prev.map((p) => {
        if (p.id !== pompeId) return p;
        const updated = { ...p, [field]: value };
        const deb = n(updated.index_debut);
        const fin = n(updated.index_fin);
        const vol = updated.index_fin !== "" && fin >= deb ? fin - deb : 0;
        const mt = Math.round(vol * n(updated.prix_unitaire));
        return {
          ...updated,
          volume_vendu: vol,
          montant: mt,
        };
      })
    );
  };

  const handleSupprimerPompeSession = (pompeId) => {
    const filtered = pompes.filter((p) => p.id !== pompeId);
    const reindexed = filtered.map((p, idx) => ({ ...p, caisseId: `C${idx + 1}` }));
    setPompes(reindexed);
    flash(reindexed.length === 0 ? "Aucune pompe en session. Choisissez vos pompes pour ce quart." : "Pompe retirée de la session");
  };

  // ── GESTION DES BONS D'ENCAISSEMENT ──

  const openAddBonModal = () => {
    setEditingBonId(null);
    setBonClientCode(clientsList[0]?.code || "");
    setBonNumero("");
    setBonDate(date);
    setBonProduit("GASOIL");
    setBonLitres("");
    setBonMontant("");
    setBonObservation("");
    setShowBonModal(true);
  };

  const openEditBonModal = (bon) => {
    setEditingBonId(bon.id);
    setBonClientCode(bon.client_code);
    setBonNumero(bon.numero_bon);
    setBonDate(bon.date || date);
    setBonProduit(bon.produit || "GASOIL");
    setBonLitres(bon.volume_litres != null && bon.volume_litres > 0 ? bon.volume_litres.toString() : "");
    setBonMontant(bon.montant?.toString() || "");
    setBonObservation(bon.observation || "");
    setShowBonModal(true);
  };

  const handleLitresChange = (litVal) => {
    setBonLitres(litVal);
    const lit = n(litVal);
    if (lit > 0) {
      const prix = prixDuJour(ref?.prix || [], bonProduit, bonDate || date) || 755;
      setBonMontant(Math.round(lit * prix).toString());
    }
  };

  const handleProduitChange = (prodVal) => {
    setBonProduit(prodVal);
    const lit = n(bonLitres);
    if (lit > 0) {
      const prix = prixDuJour(ref?.prix || [], prodVal, bonDate || date) || 755;
      setBonMontant(Math.round(lit * prix).toString());
    }
  };

  const handleSaveBon = (e) => {
    e.preventDefault();
    if (!bonClientCode) return flash("Veuillez sélectionner un client", "error");
    if (!bonNumero.trim()) return flash("Le numéro ou référence du bon est obligatoire", "error");
    const m = n(bonMontant);
    const lit = n(bonLitres);
    if (m <= 0 && lit <= 0) return flash("Veuillez renseigner le litrage ou le montant du bon", "error");

    const clientObj = clientsList.find((c) => c.code === bonClientCode) || { nom: bonClientCode };
    const prix = prixDuJour(ref?.prix || [], bonProduit, bonDate || date) || 755;
    const finalMontant = m > 0 ? m : Math.round(lit * prix);

    if (editingBonId) {
      setBons((prev) =>
        prev.map((b) =>
          b.id === editingBonId
            ? {
                ...b,
                client_code: bonClientCode,
                client_nom: clientObj.nom,
                numero_bon: bonNumero.trim().toUpperCase(),
                date: bonDate || date,
                produit: bonProduit,
                volume_litres: lit,
                montant: finalMontant,
                observation: bonObservation.trim(),
              }
            : b
        )
      );
      flash("Bon d'encaissement modifié avec succès");
    } else {
      const nouveauBon = {
        id: uuid(),
        client_code: bonClientCode,
        client_nom: clientObj.nom,
        numero_bon: bonNumero.trim().toUpperCase(),
        date: bonDate || date,
        produit: bonProduit,
        volume_litres: lit,
        montant: finalMontant,
        observation: bonObservation.trim(),
      };
      setBons([...bons, nouveauBon]);
      flash("Bon d'encaissement ajouté");
    }

    setShowBonModal(false);
  };

  const handleSupprimerBon = (bonId) => {
    setBons((prev) => prev.filter((b) => b.id !== bonId));
    flash("Bon d'encaissement supprimé");
  };

  // ── CHARGEMENT D'UNE DESCENTE POUR MODIFICATION / CORRECTION ──

  const handleEditerDescente = (d) => {
    const norm = normalizeDescente(d);
    if (!norm) return;

    if (!peutCorrigerDescente(profil?.role, norm.statut)) {
      return flash("Cette descente a déjà été clôturée et soumise. Les modifications sont verrouillées pour le pompiste.", "error");
    }

    setEditingDescenteId(norm.id);
    setDate(norm.date || todayISO());
    setPompisteId(norm.pompiste_id || profil?.id || "");
    setPompisteNom(norm.pompiste_nom || profil?.nom_complet || "");

    // Charger les pompes
    setPompes(
      (norm.pompes || []).map((p, idx) => ({
        id: p.id || uuid(),
        caisseId: p.caisseId || `C${idx + 1}`,
        pistolet_code: p.pistolet_code,
        produit: p.produit,
        index_debut: p.index_debut?.toString() ?? "",
        index_fin: p.index_fin?.toString() ?? "",
        volume_vendu: n(p.volume_vendu),
        prix_unitaire: n(p.prix_unitaire),
        montant: n(p.montant),
      }))
    );

    // Charger les bons
    setBons(
      (norm.bons || []).map((b) => ({
        id: b.id || uuid(),
        client_code: b.client_code,
        client_nom: b.client_nom,
        numero_bon: b.numero_bon,
        date: b.date || norm.date,
        produit: b.produit || "GASOIL",
        volume_litres: n(b.volume_litres || b.litres || 0),
        montant: n(b.montant),
        observation: b.observation || "",
      }))
    );

    // Charger les lubrifiants
    setLubrifiants(
      (norm.lubrifiants || []).map((l) => ({
        id: l.id || uuid(),
        produit_code: l.produit_code,
        libelle: l.libelle || l.produit_code,
        quantite: n(l.quantite) || 1,
        prix_unitaire: n(l.prix_unitaire) || 0,
        montant: n(l.montant) || 0,
      }))
    );

    // Charger la remise en cuve
    setRemiseCuveValeur(norm.remise_cuve_valeur != null && norm.remise_cuve_valeur > 0 ? norm.remise_cuve_valeur.toString() : "");
    setRemiseCuveLitres(norm.remise_cuve_litres != null && norm.remise_cuve_litres > 0 ? norm.remise_cuve_litres.toString() : "");
    setRemiseCuveMotif(norm.remise_cuve_motif || "");
    setRemiseCuvePistolet(norm.remise_cuve_pistolet || "");

    // Charger les dépenses pompiste
    setDepensesValeur(norm.depenses_valeur != null && norm.depenses_valeur > 0 ? norm.depenses_valeur.toString() : "");
    setDepensesMotif(norm.depenses_motif || "");

    // Charger les encaissements
    setEspeces(norm.encaissements?.especes != null ? norm.encaissements.especes.toString() : "");
    setWave(norm.encaissements?.wave != null ? norm.encaissements.wave.toString() : "");
    setOrangeMoney(norm.encaissements?.orange_money != null ? norm.encaissements.orange_money.toString() : "");
    setCarteBancaire(norm.encaissements?.carte_bancaire != null ? norm.encaissements.carte_bancaire.toString() : "");
    setPetrosen(norm.encaissements?.petrosen != null ? norm.encaissements.petrosen.toString() : "");
    setCodeElectronique(norm.encaissements?.code_electronique != null ? norm.encaissements.code_electronique.toString() : "");
    setTickets(norm.encaissements?.tickets != null ? norm.encaissements.tickets.toString() : "");
    setAutrePaiement(norm.encaissements?.autre != null ? norm.encaissements.autre.toString() : "");
    setCommentaire(norm.commentaire || "");

    setTicketModal(null);
    setHistoriqueView(false);
    flash(`Descente du ${fmtDate(norm.date)} chargée pour correction. Modifiez les champs puis validez.`);
  };

  /** Formulaire vierge pour un nouveau quart — le pompiste choisit ses pompes. */
  const resetFormForNewDescente = async (targetDate = todayISO()) => {
    setEditingDescenteId(null);
    if (searchParams.get("id")) setSearchParams({}, { replace: true });
    setHistoriqueView(false);
    setDate(targetDate);
    setPompisteId(profil?.id || "");
    setPompisteNom(profil?.nom_complet || "");
    setBons([]);
    setShowBonModal(false);
    setEditingBonId(null);
    setBonClientCode("");
    setBonNumero("");
    setBonDate(targetDate);
    setBonProduit("GASOIL");
    setBonLitres("");
    setBonMontant("");
    setBonObservation("");
    setLubrifiants([]);
    setShowAddLubModal(false);
    setSelectedLubCode("");
    setLubQuantite("1");
    setLubPrixUnitaire("");
    setRemiseCuveValeur("");
    setRemiseCuveLitres("");
    setRemiseCuveMotif("");
    setRemiseCuvePistolet("");
    setDepensesValeur("");
    setDepensesMotif("");
    setEspeces("");
    setWave("");
    setOrangeMoney("");
    setCarteBancaire("");
    setPetrosen("");
    setCodeElectronique("");
    setTickets("");
    setAutrePaiement("");
    setCommentaire("");
    setPompes([]);
    setShowAddPompeModal(false);
    setSelectedAddCode("");
    setAddIndexDebut("");
    setAddIndexFin("");
    setIsNewPhysicalPump(false);
    setNewPhysicalCode("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAnnulerModification = async () => {
    await resetFormForNewDescente();
    flash("Mode modification quitté. Nouvelle descente prête.");
  };

  // ── CALCULS GLOBAUX ──

  const totalVolumeVendu = pompes.reduce((acc, p) => acc + n(p.volume_vendu), 0);
  const totalCarburant = pompes.reduce((acc, p) => acc + n(p.montant), 0);
  const totalLubrifiants = lubrifiants.reduce((acc, l) => acc + n(l.montant), 0);
  const totalCaissePompiste = totalCarburant + totalLubrifiants;
  const totalBons = bons.reduce((acc, b) => acc + n(b.montant), 0);
  const totalBonsLitres = bons.reduce((acc, b) => acc + n(b.volume_litres), 0);
  const totalRemiseCuve = n(remiseCuveValeur);
  const totalDepensesPompiste = n(depensesValeur);
  const netTheoriqueAVerser = Math.max(0, totalCaissePompiste - totalRemiseCuve);
  const totalEncaisse =
    n(especes) +
    n(wave) +
    n(orangeMoney) +
    n(carteBancaire) +
    n(petrosen) +
    n(codeElectronique) +
    n(tickets) +
    totalBons +
    n(autrePaiement) +
    totalDepensesPompiste;
  const ecart = totalEncaisse - (totalCaissePompiste - totalRemiseCuve);

  // ── ASSISTANCE COMPTABLE (Aide à la saisie sans erreur) ──
  const handleAjusterSoldeEspeces = () => {
    const autres =
      n(wave) +
      n(orangeMoney) +
      n(carteBancaire) +
      n(petrosen) +
      n(codeElectronique) +
      n(tickets) +
      totalBons +
      n(autrePaiement) +
      totalDepensesPompiste;
    const resteEspeces = Math.max(0, netTheoriqueAVerser - autres);
    setEspeces(resteEspeces.toString());
    flash(`Aide comptable : Solde de ${F(resteEspeces)} FCFA automatiquement affecté aux Espèces.`);
  };

  // ── VALIDATION & ENREGISTREMENT ──

  const validerDescente = async (statut = "TERMINEE") => {
    if (pompes.length === 0) {
      return flash("Veuillez associer au moins une pompe à votre session", "error");
    }

    for (const p of pompes) {
      const deb = n(p.index_debut);
      const fin = n(p.index_fin);
      if (p.index_fin === "" || fin < deb) {
        return flash(
          `Caisse ${p.caisseId} (${p.pistolet_code.toUpperCase()}) : L'index de fin (${fin}) doit être supérieur ou égal à l'index de début (${deb})`,
          "error"
        );
      }
    }

    const payload = {
      station_id: stationId,
      date,
      pompiste_id: pompisteId || profil?.id,
      pompiste_nom: pompisteNom || profil?.nom_complet || "Pompiste",
      // Multi-pompes & Caisses
      pompes: pompes.map((p) => ({
        ...p,
        pistolet_code: p.pistolet_code,
        index_debut: n(p.index_debut),
        index_fin: n(p.index_fin),
        volume_vendu: n(p.volume_vendu),
        prix_unitaire: n(p.prix_unitaire),
        montant: n(p.montant),
      })),
      total_volume: totalVolumeVendu,
      total_carburant: totalCarburant,
      // Ventes de lubrifiants
      lubrifiants: lubrifiants.map((l) => ({
        ...l,
        quantite: n(l.quantite),
        prix_unitaire: n(l.prix_unitaire),
        montant: n(l.montant),
      })),
      total_lubrifiants: totalLubrifiants,
      total_caisse: totalCaissePompiste,
      // Remise en cuve (valeur numéraire)
      remise_cuve_valeur: totalRemiseCuve,
      remise_cuve_litres: n(remiseCuveLitres),
      remise_cuve_motif: remiseCuveMotif,
      remise_cuve_pistolet: remiseCuvePistolet,
      // Dépenses pompiste (justificatifs)
      depenses_valeur: totalDepensesPompiste,
      depenses_motif: depensesMotif.trim(),
      net_theorique: netTheoriqueAVerser,
      // Multi-bons
      bons: bons.map((b) => ({
        ...b,
        produit: b.produit || "GASOIL",
        volume_litres: n(b.volume_litres),
        montant: n(b.montant),
      })),
      total_bons: totalBons,
      total_bons_litres: totalBonsLitres,
      // Encaissements
      encaissements: {
        especes: n(especes),
        wave: n(wave),
        orange_money: n(orangeMoney),
        carte_bancaire: n(carteBancaire),
        petrosen: n(petrosen),
        code_electronique: n(codeElectronique),
        tickets: n(tickets),
        credit_client: totalBons,
        bons: totalBons,
        autre: n(autrePaiement),
      },
      total_encaisse: totalEncaisse,
      ecart: ecart,
      // Rétrocompatibilité mono-pompe
      pistolet_code: pompes[0]?.pistolet_code || "",
      produit: pompes[0]?.produit || "GASOIL",
      prix_unitaire: pompes[0]?.prix_unitaire || 0,
      index_debut: n(pompes[0]?.index_debut),
      index_fin: n(pompes[0]?.index_fin),
      volume_vendu: totalVolumeVendu,
      montant_theorique: totalCaissePompiste,
      commentaire,
      statut,
      maj_le: new Date().toISOString(),
    };

    const previous = editingDescenteId ? await getDescente(editingDescenteId) : null;
    const previousStatut = previous?.statut;
    const isFirstClosure = statut === "TERMINEE" && previousStatut !== "TERMINEE";

    if (isManager && previousStatut === "TERMINEE") {
      payload.corrige_par = profil?.nom_complet || "Gérant";
      payload.corrige_le = new Date().toISOString();
    }

    let res;
    if (editingDescenteId) {
      res = await updateDescente(editingDescenteId, payload);
    } else {
      payload.created_at = new Date().toISOString();
      res = await createDescente(payload);
    }

    if (res.ok) {
      const activeId = editingDescenteId || res.descente?.id;
      const savedRow = normalizeDescente({ ...payload, id: activeId });

      // Crédit client : uniquement à la première clôture (évite les doublons si le gérant corrige)
      const prevById = Object.fromEntries((previous?.bons || []).map((b) => [b.id, b]));
      for (const b of bons) {
        if (n(b.montant) <= 0 || !b.client_code || b.client_code === "DIVERS") continue;
        const ancien = prevById[b.id];
        const inedit = isFirstClosure || !ancien || !ancien.client_code || ancien.client_code === "DIVERS";
        if (!inedit) continue;
        try {
          const litStr = n(b.volume_litres) > 0 ? ` (${F(b.volume_litres)} L)` : "";
          const obsStr = b.observation ? " - " + b.observation : "";
          await saveOperationCredit({
            client_code: b.client_code,
            station_id: stationId,
            date_op: b.date || date,
            matricule: `Bon ${b.numero_bon}${litStr}${obsStr}`,
            volume_l: n(b.volume_litres),
            valeur_cons: n(b.montant),
            depot: 0,
          });
        } catch (err) {
          console.error("Erreur enregistrement crédit client pour bon:", b, err);
        }
      }

      if (statut === "TERMINEE") {
        flash(
          editingDescenteId && previousStatut === "TERMINEE"
            ? "Corrections enregistrées. Nouveau quart prêt pour saisie."
            : "Descente clôturée avec succès ! Ticket généré — formulaire réinitialisé pour le prochain quart."
        );
        setTicketModal(savedRow);
        await resetFormForNewDescente();
      } else {
        setEditingDescenteId(activeId);
        flash(
          editingDescenteId
            ? "Brouillon mis à jour. Reprenez la saisie ou clôturez le quart quand tout est prêt."
            : "Brouillon enregistré. Vous pouvez quitter et reprendre plus tard via « Mes descentes »."
        );
        setTicketModal(savedRow);
      }

      await loadData();
    } else {
      flash("Erreur lors de l'enregistrement de la descente", "error");
    }
  };

  // ── TICKET TEXTE WHATSAPP MULTI-POMPES & MULTI-BONS ──
  const buildTicketText = (d) => {
    const data = normalizeDescente(d);
    const dateStr = fmtDate(data.date);
    const heureStr = data.created_at
      ? new Date(data.created_at).toLocaleTimeString().slice(0, 5)
      : new Date().toLocaleTimeString().slice(0, 5);
    const pNom = data.pompiste_nom || profil?.nom_complet || "Pompiste";

    let pompesLines = "";
    (data.pompes || []).forEach((p) => {
      pompesLines += `\n🔹 *${p.caisseId} — Pompe ${(p.pistolet_code || "").toUpperCase()}* (${p.produit})
  • Index : ${p.index_debut} ➔ ${p.index_fin} (${F(p.volume_vendu)} L)
  • Caisse : *${F(p.montant)} FCFA*`;
    });

    let lubLines = "";
    if (data.lubrifiants && data.lubrifiants.length > 0) {
      lubLines = "\n\n🛢️ *VENTES DE LUBRIFIANTS :*";
      data.lubrifiants.forEach((l) => {
        lubLines += `\n  • ${l.libelle} (x${l.quantite}) : *${F(l.montant)} FCFA*`;
      });
      lubLines += `\n👉 *TOTAL LUBRIFIANTS :* *+${F(data.total_lubrifiants || 0)} FCFA*`;
    }

    let remiseLines = "";
    if (n(data.remise_cuve_valeur) > 0) {
      remiseLines = `\n🔄 *REMISE EN CUVE DÉDUITE :* *-${F(data.remise_cuve_valeur)} FCFA* (${F(data.remise_cuve_litres || 0)} L${data.remise_cuve_motif ? " - " + data.remise_cuve_motif : ""})`;
    }

    let bonsLines = "";
    if (data.bons && data.bons.length > 0) {
      bonsLines = "\n\n📝 *BONS D'ENCAISSEMENT CLIENTS :*";
      data.bons.forEach((b) => {
        const litText = n(b.volume_litres) > 0 ? ` (${F(b.volume_litres)} L)` : "";
        bonsLines += `\n  • ${b.client_nom || b.client_code} (N° ${b.numero_bon})${litText} : *${F(b.montant)} FCFA*`;
      });
      const totLitText = n(data.total_bons_litres) > 0 ? ` (${F(data.total_bons_litres)} L)` : "";
      bonsLines += `\n👉 *TOTAL BONS :* *${F(data.total_bons || data.encaissements?.credit_client || 0)} FCFA*${totLitText}`;
    }

    let depensesLines = "";
    if (n(data.depenses_valeur) > 0) {
      depensesLines = `\n• Dépenses Pompiste : ${F(data.depenses_valeur)} FCFA${data.depenses_motif ? " (" + data.depenses_motif + ")" : ""}`;
    }

    const netTheorique = data.net_theorique ?? Math.max(0, (data.total_caisse || 0) - (data.remise_cuve_valeur || 0));

    return `*⛽ TICKET DE PASSATION DE QUART — STATION ${stationCode}*
----------------------------------------
📅 *Date :* ${dateStr} à ${heureStr}
👤 *Pompiste :* ${pNom}
⛽ *Nombre de pompes gérées :* ${(data.pompes || []).length}
----------------------------------------
📊 *DÉTAIL DES CAISSES CARBURANT :*${pompesLines}
----------------------------------------
⛽ *Total Ventes Carburant :* *${F(data.total_carburant || data.total_caisse)} FCFA* (${F(data.total_volume || data.volume_vendu)} L)${lubLines}${remiseLines}
👉 *NET THÉORIQUE À VERSER :* *${F(netTheorique)} FCFA*
----------------------------------------
💵 *ENCAISSEMENTS & JUSTIFICATIFS REMIS :*
• Espèces (Cash)   : ${F(data.encaissements?.especes || 0)} FCFA
• Wave             : ${F(data.encaissements?.wave || 0)} FCFA
• Orange Money     : ${F(data.encaissements?.orange_money || 0)} FCFA
• Petrosen         : ${F(data.encaissements?.petrosen || 0)} FCFA
• Code Électronique: ${F(data.encaissements?.code_electronique || 0)} FCFA
• Tickets Carburant: ${F(data.encaissements?.tickets || 0)} FCFA
• Carte / TPE      : ${F(data.encaissements?.carte_bancaire || 0)} FCFA
• Bons Client Pro  : ${F(data.total_bons || data.encaissements?.credit_client || 0)} FCFA
• Autre            : ${F(data.encaissements?.autre || 0)} FCFA${depensesLines}${bonsLines}
👉 *TOTAL JUSTIFIÉ / ENCAISSÉ :* *${F(data.total_encaisse)} FCFA*
----------------------------------------
⚖️ *ÉCART DE CAISSE :* *${data.ecart >= 0 ? "+" : ""}${F(data.ecart)} FCFA* ${
      data.ecart === 0 ? "✅ (Conforme)" : data.ecart > 0 ? "🟢 (Excédent)" : "🚨 (MANQUANT)"
    }
----------------------------------------
✍️ *Passation de quart certifiée conforme*`;
  };

  const shareTicketWhatsApp = (d) => {
    const text = buildTicketText(d);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (loading) return <Loading label="Chargement de Ma Descente..." />;

  return (
    <div className="max-w-4xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
            ⛽ Ma Descente Pompiste — Multi-Pompes & Bons
          </h1>
          <p className="text-xs" style={{ color: T.muted }}>
            Gestion de plusieurs pompes (caisses C1, C2...) et enregistrement dynamique des bons d'encaissement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs border rounded px-2.5 py-1.5 bg-white font-medium shadow-xs"
            style={{ borderColor: T.line }}
          />
          <button
            type="button"
            onClick={() => setHistoriqueView(!historiqueView)}
            className="text-xs px-3 py-1.5 rounded border font-semibold transition-colors shadow-xs"
            style={{
              borderColor: T.line,
              background: historiqueView ? T.petrol : "white",
              color: historiqueView ? "white" : T.ink,
            }}
          >
            {historiqueView ? "← Saisie / Correction" : canVoirTout ? "📋 Toutes les descentes (" + descentes.length + ")" : "📋 Mes descentes (" + descentes.length + ")"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-3 p-2.5 text-xs rounded font-medium ${
            msgType === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          {msg}
        </div>
      )}

      {/* BANNIÈRE MODE MODIFICATION / CORRECTION D'UNE DESCENTE */}
      {editingDescenteId && !historiqueView && (
        <div className="p-3 mb-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✏️</span>
            <div>
              <span className="font-bold text-xs text-amber-900 block">
                Mode Correction / Modification de la Descente
              </span>
              <span className="text-[11px] text-amber-700">
                Vous corrigez la descente du {fmtDate(date)}. Modifiez les index, les bons ou les encaissements puis validez les corrections ci-dessous.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAnnulerModification}
            className="px-3 py-1 text-xs font-bold bg-white border border-amber-300 rounded-lg text-amber-900 hover:bg-amber-100 shadow-xs"
          >
            ✕ Quitter le mode correction
          </button>
        </div>
      )}

      {historiqueView ? (
        /* VUE HISTORIQUE */
        <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
            {canVoirTout ? "Toutes les descentes de la station" : "Mes descentes de quart enregistrées"}
          </h3>
          {descentes.length === 0 ? (
            <p className="text-xs py-6 text-center text-gray-500">Aucune descente enregistrée.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: T.line }}>
              {descentes.map((d) => (
                <div key={d.id || d.created_at} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-gray-900">
                      <span>{fmtDate(d.date)}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-blue-900">
                        {d.pompes?.length || 1} pompe(s) ({d.pompes?.map((p) => p.caisseId).join(", ") || "C1"})
                      </span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600 font-medium">{d.pompiste_nom || "Pompiste"}</span>
                      {d.statut && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            d.statut === "TERMINEE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {d.statut}
                        </span>
                      )}
                    </div>

                    <div className="text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        Volume Total : <strong>{F(d.total_volume || d.volume_vendu)} L</strong>
                      </span>
                      <span>
                        Caisse : <strong>{F(d.total_caisse || d.montant_theorique)} FCFA</strong>
                      </span>
                      {d.bons && d.bons.length > 0 && (
                        <span className="text-amber-700 font-medium">
                          📝 {d.bons.length} bon(s) : {F(d.total_bons || d.encaissements?.credit_client)} FCFA
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex items-center justify-between md:justify-end gap-3">
                    <div>
                      <div className="font-extrabold text-sm text-gray-900">{F(d.total_caisse || d.montant_theorique)} F</div>
                      <div className={`font-bold text-xs ${d.ecart >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        Écart : {d.ecart >= 0 ? "+" : ""}{F(d.ecart)} F
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {d.statut !== "TERMINEE" || isManager ? (
                        <button
                          type="button"
                          onClick={() => handleEditerDescente(d)}
                          className={`px-2.5 py-1 rounded text-xs font-bold shadow-xs flex items-center gap-1 transition-colors ${
                            d.statut === "TERMINEE"
                              ? "bg-purple-700 hover:bg-purple-800 text-white"
                              : "bg-amber-500 hover:bg-amber-600 text-white"
                          }`}
                          title={d.statut === "TERMINEE" ? "Corriger cette descente (Droits Gérant)" : "Reprendre et modifier ce quart en cours"}
                        >
                          {d.statut === "TERMINEE" ? "✏️ Corriger (Gérant)" : "✏️ Modifier"}
                        </button>
                      ) : (
                        <span
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 flex items-center gap-1 cursor-default"
                          title="Cette descente est validée et verrouillée pour le pompiste"
                        >
                          🔒 Clôturée
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setTicketModal(d)}
                        className="px-2.5 py-1 rounded text-xs font-semibold border bg-white text-gray-700 hover:bg-gray-50 shadow-xs"
                        style={{ borderColor: T.line }}
                      >
                        🧾 Ticket
                      </button>
                      <button
                        type="button"
                        onClick={() => shareTicketWhatsApp(d)}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1"
                      >
                        📲 WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* VUE FORMULAIRE DE SAISIE / CORRECTION */
        <div className="grid gap-5">
          {/* ────────────────────────────────────────────────────────── */}
          {/* SECTION 1 : MES POMPES & CAISSES (C1, C2... Cn)           */}
          {/* ────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: T.line }}>
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>⛽</span> MES POMPES & CAISSES INDIVIDUELLES
                </h2>
                <p className="text-[11px] text-gray-500">
                  Chaque pompe correspond à une caisse individuelle (C1, C2, C3...). Le total est agrégé automatiquement.
                </p>
              </div>
              <button
                type="button"
                onClick={openAddPompeModal}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"
                style={{ background: T.petrol }}
              >
                <span>➕</span> AJOUTER UNE POMPE
              </button>
            </div>

            {/* Liste des blocs de pompes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {pompes.length === 0 && (
                <div className="md:col-span-2 py-8 px-4 rounded-xl border border-dashed text-center" style={{ borderColor: T.line }}>
                  <p className="text-sm font-semibold text-gray-800 mb-1">Aucune pompe sélectionnée</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Choisissez vous-même les pompes de votre quart — aucune n’est attribuée par défaut.
                  </p>
                  <button
                    type="button"
                    onClick={openAddPompeModal}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: T.petrol }}
                  >
                    ➕ Choisir une pompe
                  </button>
                </div>
              )}
              {pompes.map((p) => {
                const idxDeb = n(p.index_debut);
                const idxFin = n(p.index_fin);
                const hasAnomalie = p.index_fin !== "" && idxFin < idxDeb;

                return (
                  <div
                    key={p.id}
                    className="border rounded-xl p-3 bg-gray-50/60 relative flex flex-col justify-between hover:border-blue-300 transition-colors shadow-xs"
                    style={{ borderColor: hasAnomalie ? "#FCA5A5" : T.line }}
                  >
                    <div>
                      {/* En-tête de la pompe */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-extrabold text-xs text-white" style={{ background: T.petrol }}>
                            {p.caisseId}
                          </span>
                          <span className="font-bold text-xs text-gray-900">
                            {(p.pistolet_code || "").toUpperCase()}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.2 rounded font-medium bg-blue-100 text-blue-800">
                            {p.produit}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSupprimerPompeSession(p.id)}
                          className="text-gray-400 hover:text-red-600 text-xs px-1 font-semibold"
                          title="Retirer cette pompe de la session"
                        >
                          ✕ Retirer
                        </button>
                      </div>

                      {/* Tarif unitaire */}
                      <div className="text-[11px] text-gray-500 mb-2 flex justify-between">
                        <span>Prix unitaire officiel :</span>
                        <span className="font-semibold text-gray-800">{F(p.prix_unitaire)} FCFA / L</span>
                      </div>

                      {/* Index début et Index fin */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <InputComptable
                          label="Index Début (L)"
                          value={p.index_debut}
                          onChange={(v) => handleUpdatePompeField(p.id, "index_debut", v)}
                          unit="L"
                          placeholder="0"
                          min={0}
                          hint="Relevé compteur début de quart"
                        />
                        <InputComptable
                          label="Index Fin (L) *"
                          value={p.index_fin}
                          onChange={(v) => handleUpdatePompeField(p.id, "index_fin", v)}
                          unit="L"
                          placeholder="Relevé actuel"
                          required
                          min={n(p.index_debut) || 0}
                          hint={hasAnomalie ? undefined : "Fin ≥ Début"}
                        />
                      </div>

                      {hasAnomalie && (
                        <p className="text-[10px] text-red-600 font-semibold mb-2 flex items-center gap-1">
                          ⚠️ L'index fin doit être supérieur ou égal à l'index début
                        </p>
                      )}
                    </div>

                    {/* Synthèse de la caisse individuelle */}
                    <div className="pt-2 border-t mt-1 flex items-center justify-between text-xs" style={{ borderColor: T.line }}>
                      <div>
                        <span className="text-[11px] text-gray-500">Volume : </span>
                        <strong className="text-gray-900">{F(p.volume_vendu)} L</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 block">Caisse {p.caisseId}</span>
                        <strong className="text-sm font-extrabold text-blue-950 tabular">{F(p.montant)} FCFA</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Synthèse TOTAL VENTES POMPES (CARBURANT) */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-blue-950 uppercase tracking-wide">
                    TOTAL VENTES POMPES (CARBURANT)
                  </div>
                  <div className="text-[11px] text-blue-800 flex flex-wrap gap-2 mt-0.5">
                    {pompes.map((p) => (
                      <span key={p.id}>
                        <strong>{p.caisseId}</strong> ({(p.pistolet_code || "").toUpperCase()}) : {F(p.montant)} F
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-blue-700 block font-medium">Cumul {F(totalVolumeVendu)} Litres Carburant</span>
                  <span className="text-lg font-black text-blue-950 tabular">{F(totalCarburant)} FCFA</span>
                </div>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────── */}
          {/* SECTION 1b : VENTE DE LUBRIFIANTS SUR PISTE                */}
          {/* ────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: T.line }}>
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>🛢️</span> VENTES DE LUBRIFIANTS SUR PISTE
                </h2>
                <p className="text-[11px] text-gray-500">
                  Enregistrement des bidons d'huile et lubrifiants vendus pendant le quart par le pompiste.
                </p>
              </div>
              <button
                type="button"
                onClick={openAddLubModal}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-transform active:scale-95 bg-emerald-700 hover:bg-emerald-800"
              >
                <span>➕</span> AJOUTER UN LUBRIFIANT
              </button>
            </div>

            {lubrifiants.length === 0 ? (
              <div className="text-center py-4 border border-dashed rounded-lg bg-gray-50/50" style={{ borderColor: T.line }}>
                <p className="text-xs text-gray-500">Aucune vente de lubrifiant enregistrée pour ce quart.</p>
                <button
                  type="button"
                  onClick={openAddLubModal}
                  className="mt-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  + Ajouter un bidon d'huile vendu
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600 text-left" style={{ borderColor: T.line }}>
                      <th className="py-2 px-3">Produit Lubrifiant</th>
                      <th className="py-2 px-3 text-center">Quantité</th>
                      <th className="py-2 px-3 text-right">Prix Unitaire</th>
                      <th className="py-2 px-3 text-right">Total FCFA</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: T.line }}>
                    {lubrifiants.map((l) => (
                      <tr key={l.id} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="py-2 px-3 font-semibold text-gray-900">
                          {l.libelle}
                          <span className="text-[10px] text-gray-500 block font-mono">{l.produit_code}</span>
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-800">{l.quantite}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{F(l.prix_unitaire)} F</td>
                        <td className="py-2 px-3 text-right font-black text-gray-900 tabular">
                          {F(l.montant)} FCFA
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleSupprimerLubrifiant(l.id)}
                            className="text-red-500 hover:text-red-700 font-semibold text-[11px]"
                          >
                            Suppr.
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total Lubrifiants */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                  TOTAL VENTES LUBRIFIANTS
                </span>
                <span className="text-[11px] text-emerald-800 block">
                  {lubrifiants.length} article(s) saisi(s)
                </span>
              </div>
              <span className="text-base font-black text-emerald-950 tabular">{F(totalLubrifiants)} FCFA</span>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────── */}
          {/* SECTION 1c : REMISE EN CUVE (VALEUR NUMÉRAIRE DÉDUITE)     */}
          {/* ────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: T.line }}>
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>🔄</span> REMISE EN CUVE (DÉDUCTION VALEUR NUMÉRAIRE)
                </h2>
                <p className="text-[11px] text-gray-500">
                  Carburant passé au compteur mais retourné en cuve (étalonnage pistolet, jauge étalon, purge ou retour cuve). Cette valeur numéraire est automatiquement déduite de votre caisse théorique.
                </p>
              </div>
              {totalRemiseCuve > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-900 border border-indigo-200">
                  - {F(totalRemiseCuve)} FCFA
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-indigo-50/40 p-3 rounded-xl border border-indigo-100">
              <div>
                <label className="text-[11px] font-bold text-indigo-950 block mb-1">
                  Valeur numéraire (FCFA) *
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={remiseCuveValeur}
                  onChange={(e) => setRemiseCuveValeur(e.target.value)}
                  className="w-full text-xs border rounded p-2 font-black text-indigo-950 bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-gray-700 block mb-1">
                  Volume estimé (Litres)
                </label>
                <input
                  type="number"
                  placeholder="ex: 20"
                  value={remiseCuveLitres}
                  onChange={(e) => setRemiseCuveLitres(e.target.value)}
                  className="w-full text-xs border rounded p-2 bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-gray-700 block mb-1">
                  Pistolet d'origine
                </label>
                <select
                  value={remiseCuvePistolet}
                  onChange={(e) => setRemiseCuvePistolet(e.target.value)}
                  className="w-full text-xs border rounded p-2 bg-white font-medium"
                  style={{ borderColor: T.line }}
                >
                  <option value="">Sélectionner (optionnel)</option>
                  {pompes.map((p) => (
                    <option key={p.id} value={p.pistolet_code}>
                      {p.caisseId} — {p.pistolet_code?.toUpperCase()} ({p.produit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-gray-700 block mb-1">
                  Motif / Justification
                </label>
                <input
                  type="text"
                  placeholder="ex: Étalonnage jauge 20L"
                  value={remiseCuveMotif}
                  onChange={(e) => setRemiseCuveMotif(e.target.value)}
                  className="w-full text-xs border rounded p-2 bg-white"
                  style={{ borderColor: T.line }}
                />
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────── */}
          {/* SECTION 2 : BONS D'ENCAISSEMENT                            */}
          {/* ────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: T.line }}>
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>📝</span> BONS D'ENCAISSEMENT (CLIENTS PROFESSIONNELS)
                </h2>
                <p className="text-[11px] text-gray-500">
                  Enregistrement dynamique de plusieurs bons pour différents clients avec références et montants.
                </p>
              </div>
              <button
                type="button"
                onClick={openAddBonModal}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"
                style={{ background: "#D97706" }}
              >
                <span>➕</span> AJOUTER UN BON
              </button>
            </div>

            {bons.length === 0 ? (
              <div className="text-center py-5 border border-dashed rounded-lg bg-gray-50/50" style={{ borderColor: T.line }}>
                <p className="text-xs text-gray-500">Aucun bon d'encaissement ajouté pour ce quart.</p>
                <button
                  type="button"
                  onClick={openAddBonModal}
                  className="mt-2 text-xs font-semibold text-amber-700 hover:underline"
                >
                  + Cliquer pour ajouter un bon client
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600 text-left" style={{ borderColor: T.line }}>
                      <th className="py-2 px-3">Client</th>
                      <th className="py-2 px-3">N° Bon</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Litrage</th>
                      <th className="py-2 px-3 text-right">Montant</th>
                      <th className="py-2 px-3">Observation</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: T.line }}>
                    {bons.map((b) => (
                      <tr key={b.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-2 px-3 font-semibold text-gray-900">
                          {b.client_nom || b.client_code}
                          <span className="text-[10px] text-gray-500 block">{b.client_code}</span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-900">{b.numero_bon}</td>
                        <td className="py-2 px-3 text-gray-600">{fmtDate(b.date)}</td>
                        <td className="py-2 px-3 text-right font-black text-blue-900 tabular">
                          {n(b.volume_litres) > 0 ? `${F(b.volume_litres)} L` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-extrabold text-gray-900 tabular">
                          {F(b.montant)} FCFA
                        </td>
                        <td className="py-2 px-3 text-gray-500">{b.observation || "-"}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditBonModal(b)}
                              className="text-blue-600 hover:text-blue-800 font-medium text-[11px]"
                            >
                              Modifier
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() => handleSupprimerBon(b.id)}
                              className="text-red-500 hover:text-red-700 font-medium text-[11px]"
                            >
                              Suppr.
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Synthèse TOTAL BONS */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 mt-2 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  TOTAL BONS D'ENCAISSEMENT
                </span>
                <span className="text-[11px] text-amber-800 block">
                  {bons.length} bon(s) enregistré(s) · <strong>{F(totalBonsLitres)} Litres Carburant</strong>
                </span>
              </div>
              <span className="text-base font-black text-amber-950 tabular">{F(totalBons)} FCFA</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b" style={{ borderColor: T.line }}>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>💰</span> 3. Encaissements Reçus (Multi-modes)
              </h2>
              <span className="text-[11px] text-gray-500">
                Saisie avec assistance comptable anti-erreur
              </span>
            </div>

            {/* BANDEAU BALANCE COMPTABLE EN DIRECT */}
            <div
              className="p-3 mb-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors shadow-xs"
              style={{
                background: ecart === 0 ? "#F0FDF4" : ecart < 0 ? "#FEF2F2" : "#FFFBEB",
                borderColor: ecart === 0 ? "#86EFAC" : ecart < 0 ? "#FCA5A5" : "#FDE68A",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black shrink-0 shadow-xs"
                  style={{
                    background: ecart === 0 ? "#DCFCE7" : ecart < 0 ? "#FEE2E2" : "#FEF3C7",
                    color: ecart === 0 ? "#15803D" : ecart < 0 ? "#DC2626" : "#D97706",
                  }}
                >
                  {ecart === 0 ? "✓" : ecart < 0 ? "⚠️" : "⚡"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                      Balance Comptable en Direct :
                    </span>
                    <span
                      className="text-xs font-black px-2 py-0.5 rounded-full"
                      style={{
                        background: ecart === 0 ? "#BBF7D0" : ecart < 0 ? "#FECACA" : "#FDE68A",
                        color: ecart === 0 ? "#14532D" : ecart < 0 ? "#991B1B" : "#78350F",
                      }}
                    >
                      {ecart === 0
                        ? "ÉQUILIBRÉE"
                        : ecart < 0
                        ? `MANQUANT : ${F(ecart)} FCFA`
                        : `SURPLUS : +${F(ecart)} FCFA`}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5 flex flex-wrap gap-x-3">
                    <span>
                      Théorique à verser : <strong>{F(netTheoriqueAVerser)} F</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Total saisi : <strong>{F(totalEncaisse)} F</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Bouton d'aide à la saisie du solde en espèces */}
              {ecart < 0 && netTheoriqueAVerser > 0 && (
                <button
                  type="button"
                  onClick={handleAjusterSoldeEspeces}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 bg-emerald-700 hover:bg-emerald-800 shrink-0"
                >
                  <span>⚡</span> Affecter le reste ({F(Math.abs(ecart))} F) en Espèces
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputComptable
                label="💵 Espèces (Cash)"
                value={especes}
                onChange={setEspeces}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="📲 Wave"
                value={wave}
                onChange={setWave}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="🍊 Orange Money"
                value={orangeMoney}
                onChange={setOrangeMoney}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="⛽ Petrosen (Cartes / Plateforme)"
                value={petrosen}
                onChange={setPetrosen}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="🔢 Code Électronique (Voucher)"
                value={codeElectronique}
                onChange={setCodeElectronique}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="🎟️ Tickets Valeurs / Bons Carburant"
                value={tickets}
                onChange={setTickets}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="💳 Carte Bancaire / TPE"
                value={carteBancaire}
                onChange={setCarteBancaire}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
              <InputComptable
                label="🔄 Autre moyen de paiement"
                value={autrePaiement}
                onChange={setAutrePaiement}
                unit="FCFA"
                placeholder="0"
                min={0}
              />
            </div>

            {/* Bons Client Pro — calculé automatiquement */}
            <div className="mt-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <div>
                <span className="text-xs font-bold text-amber-900 block">📝 Bons Client Pro (Total Bons)</span>
                <span className="text-[10px] text-amber-700">Calculé automatiquement depuis la section des bons</span>
              </div>
              <span className="text-sm font-black text-amber-950 tabular">{F(totalBons)} FCFA</span>
            </div>

            {/* Dépenses pompiste */}
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <span className="text-xs font-bold text-rose-700 flex items-center gap-1 mb-2">
                <span>💸</span> Dépenses Pompiste (Justificatifs de sortie de caisse)
              </span>
              <span className="text-[10px] text-rose-600 block mb-2">
                Dépenses autorisées réglées avec la caisse du quart (fournitures, frais, petits achats avec reçu)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">Motif de la dépense</label>
                  <input
                    type="text"
                    placeholder="Ex: achat fournitures, nettoyage..."
                    value={depensesMotif}
                    onChange={(e) => setDepensesMotif(e.target.value)}
                    className="text-xs border rounded-lg px-2.5 py-2 bg-white"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <InputComptable
                  label="Montant des dépenses"
                  value={depensesValeur}
                  onChange={setDepensesValeur}
                  unit="FCFA"
                  placeholder="0"
                  min={0}
                />
              </div>
            </div>

            {/* Commentaire */}
            <Row>
              <span className="text-xs font-medium">Commentaire / Observation</span>
              <input
                type="text"
                placeholder="Remarques éventuelles sur le quart..."
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                className="text-xs border rounded px-2.5 py-1.5 w-60"
                style={{ borderColor: T.line }}
              />
            </Row>
          </div>


          {/* ────────────────────────────────────────────────────────── */}
          {/* SECTION 4 : SYNTHÈSE GLOBALE DU POMPISTE                   */}
          {/* ────────────────────────────────────────────────────────── */}
          <div
            className="rounded-2xl p-5 shadow-sm border"
            style={{
              borderColor: ecart === 0 ? "#86EFAC" : Math.abs(ecart) <= 200 ? "#FDE047" : "#FCA5A5",
              background: ecart === 0 ? "#F0FDF4" : Math.abs(ecart) <= 200 ? "#FEFCE8" : "#FEF2F2",
            }}
          >
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3 text-gray-700 flex items-center justify-between">
              <span>SYNTHÈSE DE MA CAISSE GLOBALE</span>
              <span className="text-[11px] font-semibold text-gray-500">
                {pompes.length} pompe(s) · {lubrifiants.length} lubrifiant(s) · {bons.length} bon(s)
              </span>
            </h3>

            <div className="space-y-1.5 text-xs text-gray-700">
              <div className="flex justify-between items-center">
                <span>Ventes Carburant (Compteurs Pompes) :</span>
                <span className="font-semibold tabular">{F(totalCarburant)} FCFA</span>
              </div>

              {totalLubrifiants > 0 && (
                <div className="flex justify-between items-center text-emerald-800">
                  <span>+ Ventes Lubrifiants ({lubrifiants.length} réf.) :</span>
                  <span className="font-semibold tabular">+{F(totalLubrifiants)} FCFA</span>
                </div>
              )}

              {totalRemiseCuve > 0 && (
                <div className="flex justify-between items-center text-indigo-800 font-bold">
                  <span>- Remise en Cuve (Valeur numéraire) :</span>
                  <span className="font-semibold tabular">-{F(totalRemiseCuve)} FCFA</span>
                </div>
              )}

              <div className="border-t pt-1.5 flex justify-between items-center font-bold text-gray-900">
                <span>NET THÉORIQUE À JUSTIFIER / VERSER :</span>
                <span className="text-sm font-extrabold tabular text-blue-950">{F(netTheoriqueAVerser)} FCFA</span>
              </div>

              <div className="border-t pt-1.5 flex justify-between items-center font-bold text-gray-900">
                <span>TOTAL ENCAISSEMENTS & JUSTIFICATIFS REMIS :</span>
                <span className="text-sm font-extrabold tabular text-emerald-900">{F(totalEncaisse)} FCFA</span>
              </div>

              {totalDepensesPompiste > 0 && (
                <div className="flex justify-between items-center text-rose-700 text-[11px] font-semibold pl-2">
                  <span>• Dont Dépenses Pompiste ({depensesMotif || "Frais justifiés"}) :</span>
                  <span className="tabular">+{F(totalDepensesPompiste)} FCFA</span>
                </div>
              )}
            </div>

            <div className="border-t pt-3 mt-3 flex justify-between items-center">
              <div>
                <span className="text-sm font-black tracking-wide">ÉCART DE CAISSE :</span>
                <div className="text-[10px] mt-0.5">
                  {ecart === 0 && <span className="text-emerald-700 font-bold">✓ Caisse conforme et équilibrée</span>}
                  {ecart > 0 && <span className="text-emerald-700 font-bold">🟢 Excédent de caisse constaté</span>}
                  {ecart < 0 && <span className="text-red-600 font-bold">⚠️ Manquant de caisse à justifier</span>}
                </div>
              </div>
              <span
                className={`text-xl font-black tabular ${
                  ecart === 0 ? "text-emerald-700" : ecart > 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {ecart > 0 ? "+" : ""}{F(ecart)} FCFA
              </span>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => validerDescente("EN_COURS")}
              className="flex-1 py-3.5 rounded-xl text-xs font-bold border bg-white hover:bg-gray-50 transition-colors shadow-xs"
              style={{ borderColor: T.line }}
            >
              💾 {editingDescenteId ? "Enregistrer modifications (Brouillon)" : "Enregistrer brouillon"}
            </button>
            <button
              type="button"
              onClick={() => validerDescente("TERMINEE")}
              className="flex-1 py-3.5 rounded-xl text-xs font-black text-gray-900 shadow-md transition-opacity hover:opacity-95"
              style={{ background: T.gold }}
            >
              {editingDescenteId ? "✓ Valider et Enregistrer les Corrections" : "✓ Clôturer et Valider la Descente"}
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL AJOUTER UNE POMPE A LA SESSION                      */}
      {/* ────────────────────────────────────────────────────────── */}
      {showAddPompeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200">
            <div className="p-3.5 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⛽</span>
                <span className="font-bold text-xs">Ajouter une pompe à mon service</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPompeModal(false)}
                className="text-gray-400 hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAjouterPompeSession} className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-medium text-gray-600">Type d'affectation :</span>
                <div className="flex gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setIsNewPhysicalPump(false)}
                    className={`px-2.5 py-1 rounded font-semibold border ${
                      !isNewPhysicalPump ? "bg-blue-900 text-white border-blue-900" : "bg-white text-gray-700"
                    }`}
                  >
                    Pompe existante
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNewPhysicalPump(true)}
                    className={`px-2.5 py-1 rounded font-semibold border ${
                      isNewPhysicalPump ? "bg-blue-900 text-white border-blue-900" : "bg-white text-gray-700"
                    }`}
                  >
                    + Nouvelle pompe
                  </button>
                </div>
              </div>

              {!isNewPhysicalPump ? (
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    Sélectionner la pompe physique de la station *
                  </label>
                  <select
                    value={selectedAddCode}
                    onChange={(e) => handleSelectAddCode(e.target.value)}
                    className="w-full text-xs border rounded-lg px-2.5 py-2 font-bold bg-white"
                    style={{ borderColor: T.line }}
                    required
                  >
                    <option value="">— Choisir une pompe —</option>
                    {pistList.map((p) => {
                      const isAlreadyAssigned = pompes.some((item) => item.pistolet_code === p.code);
                      return (
                        <option key={p.code} value={p.code} disabled={isAlreadyAssigned}>
                          {p.code.toUpperCase()} — {p.produit} {isAlreadyAssigned ? "(Déjà assignée)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="space-y-2 bg-blue-50/50 p-2.5 rounded-lg border border-blue-200">
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">Code / Nom de la pompe (ex: P5, super5) *</label>
                    <input
                      type="text"
                      placeholder="ex: gasoil5"
                      value={newPhysicalCode}
                      onChange={(e) => setNewPhysicalCode(e.target.value)}
                      className="w-full text-xs border rounded px-2 py-1.5 bg-white font-bold"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">Carburant *</label>
                    <select
                      value={newPhysicalProduit}
                      onChange={(e) => setNewPhysicalProduit(e.target.value)}
                      className="w-full text-xs border rounded px-2 py-1.5 bg-white"
                      style={{ borderColor: T.line }}
                    >
                      <option value="GASOIL">GASOIL</option>
                      <option value="SUPER">SUPER</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 font-medium mb-1">Index Début (Litres)</label>
                  <input
                    type="number"
                    placeholder="Index départ"
                    value={addIndexDebut}
                    onChange={(e) => setAddIndexDebut(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1.5 bg-white font-mono"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-blue-900 font-bold mb-1">Index Fin (Litres)</label>
                  <input
                    type="number"
                    placeholder="Optionnel pour l'instant"
                    value={addIndexFin}
                    onChange={(e) => setAddIndexFin(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1.5 bg-white font-mono"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t" style={{ borderColor: T.line }}>
                <button
                  type="button"
                  onClick={() => setShowAddPompeModal(false)}
                  className="px-3 py-1.5 rounded-lg border bg-white text-gray-700 font-medium"
                  style={{ borderColor: T.line }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold text-white shadow-sm"
                  style={{ background: T.petrol }}
                >
                  Ajouter à ma session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL AJOUT VENTE DE LUBRIFIANT                            */}
      {/* ────────────────────────────────────────────────────────── */}
      {showAddLubModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200">
            <div className="p-3.5 bg-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🛢️</span>
                <span className="font-bold text-xs">Vente de Lubrifiant sur Piste</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddLubModal(false)}
                className="text-emerald-200 hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLubrifiant} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Article Lubrifiant *</label>
                <select
                  value={selectedLubCode}
                  onChange={(e) => handleSelectLubrifiant(e.target.value)}
                  className="w-full text-xs border rounded px-2.5 py-2 bg-white font-medium"
                  style={{ borderColor: T.line }}
                  required
                >
                  {lubrifiantsList.map((lub) => (
                    <option key={lub.code} value={lub.code}>
                      {lub.nom || lub.libelle || lub.code} — {F(lub.prix_vente)} FCFA
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InputComptable
                  label="Quantité (bidons) *"
                  value={lubQuantite}
                  onChange={setLubQuantite}
                  unit="unité(s)"
                  placeholder="0"
                  min={1}
                  required
                />
                <InputComptable
                  label="Prix Unitaire *"
                  value={lubPrixUnitaire}
                  onChange={setLubPrixUnitaire}
                  unit="FCFA"
                  placeholder="0"
                  min={1}
                  required
                />
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex justify-between items-center text-xs">
                <span className="font-semibold text-emerald-900">Total à ajouter :</span>
                <span className="font-black text-emerald-950 tabular text-sm">
                  {F(n(lubQuantite) * n(lubPrixUnitaire))} FCFA
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t" style={{ borderColor: T.line }}>
                <button
                  type="button"
                  onClick={() => setShowAddLubModal(false)}
                  className="px-3 py-1.5 rounded-lg border bg-white text-gray-700 font-medium"
                  style={{ borderColor: T.line }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold text-white shadow-sm bg-emerald-700 hover:bg-emerald-800"
                >
                  Valider l'ajout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL AJOUT / MODIF BON D'ENCAISSEMENT                     */}
      {/* ────────────────────────────────────────────────────────── */}
      {showBonModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200">
            <div className="p-3.5 bg-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>📝</span>
                <span className="font-bold text-xs">
                  {editingBonId ? "Modifier le bon d'encaissement" : "Ajouter un bon d'encaissement"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowBonModal(false)}
                className="text-amber-200 hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBon} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Client Professionnel *</label>
                <select
                  value={bonClientCode}
                  onChange={(e) => setBonClientCode(e.target.value)}
                  className="w-full text-xs border rounded-lg px-2.5 py-2 font-bold bg-white"
                  style={{ borderColor: T.line }}
                >
                  <option value="">-- Choisir le compte client --</option>
                  {clientsList.map((cl) => (
                    <option key={cl.code} value={cl.code}>
                      {cl.nom} ({cl.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">N° Bon / Réf *</label>
                  <input
                    type="text"
                    placeholder="ex: BE-001"
                    value={bonNumero}
                    onChange={(e) => setBonNumero(e.target.value)}
                    className="w-full text-xs border rounded px-2.5 py-1.5 font-bold uppercase"
                    style={{ borderColor: T.line }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={bonDate}
                    onChange={(e) => setBonDate(e.target.value)}
                    className="w-full text-xs border rounded px-2.5 py-1.5"
                    style={{ borderColor: T.line }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Carburant</label>
                  <select
                    value={bonProduit}
                    onChange={(e) => handleProduitChange(e.target.value)}
                    className="w-full text-xs border rounded px-2.5 py-1.5 bg-white font-bold"
                    style={{ borderColor: T.line }}
                  >
                    <option value="GASOIL">GASOIL (755 F/L)</option>
                    <option value="SUPER">SUPER (990 F/L)</option>
                  </select>
                </div>
                <InputComptable
                  label="Litrage *"
                  value={bonLitres}
                  onChange={handleLitresChange}
                  unit="Litres"
                  placeholder="ex: 50"
                  min={1}
                  hint="→ Montant calculé auto"
                />
              </div>

              <InputComptable
                label="Montant du Bon (FCFA) *"
                value={bonMontant}
                onChange={setBonMontant}
                unit="FCFA"
                placeholder="0"
                min={1}
                required
                hint="Calculé depuis le litrage, modifiable si besoin."
              />

              <div>
                <label className="block text-gray-600 font-medium mb-1">Observation / Véhicule (optionnel)</label>
                <input
                  type="text"
                  placeholder="ex: Véhicule camion SD-4501-AA"
                  value={bonObservation}
                  onChange={(e) => setBonObservation(e.target.value)}
                  className="w-full text-xs border rounded px-2.5 py-1.5"
                  style={{ borderColor: T.line }}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t" style={{ borderColor: T.line }}>
                <button
                  type="button"
                  onClick={() => setShowBonModal(false)}
                  className="px-3 py-1.5 rounded-lg border bg-white text-gray-700 font-medium"
                  style={{ borderColor: T.line }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold text-white shadow-sm"
                  style={{ background: "#D97706" }}
                >
                  {editingBonId ? "Enregistrer modifications" : "Ajouter le bon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL TICKET DE FIN DE QUART MULTI-POMPES & MULTI-BONS    */}
      {/* ────────────────────────────────────────────────────────── */}
      {ticketModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200">
            {/* Barre d'action supérieure */}
            <div className="p-3 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">⛽</span>
                <span className="font-bold text-xs">Ticket de Fin de Quart Multi-Pompes</span>
              </div>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1 transition"
                title="Fermer cette fenêtre"
              >
                ✕ Fermer
              </button>
            </div>

            {/* Corps du ticket thermique */}
            <div className="p-5 font-mono text-xs text-gray-800 space-y-3 bg-[#FDFDFD]" id="ticket-print-area">
              <div className="text-center border-b pb-2 border-dashed border-gray-300">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <img src="/branding/damel-energy/damel-energy-icon.svg" alt="DAMEL ENERGY" className="w-5 h-5 object-contain" />
                  <span className="text-sm font-black tracking-wider uppercase text-[#0B4EA2]">DAMEL ENERGY</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-[10px] text-[#56216C] font-extrabold uppercase">
                  <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3.5 h-3.5 object-contain rounded-xs" />
                  <span>RÉSEAU STAR ENERGY · SÉNÉGAL</span>
                </div>
                <div className="text-[10px] text-amber-700 font-bold uppercase mt-0.5">STATION {stationCode}</div>
                <div className="text-[11px] font-bold mt-1">TICKET DE PASSATION DE QUART</div>
                <div className="text-[10px] text-gray-500">
                  {fmtDate(ticketModal.date)} ·{" "}
                  {ticketModal.created_at
                    ? new Date(ticketModal.created_at).toLocaleTimeString()
                    : new Date().toLocaleTimeString()}
                </div>
              </div>

              <div className="text-[11px] space-y-0.5 border-b pb-2 border-dashed border-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-500">Pompiste sortant :</span>
                  <span className="font-bold">{ticketModal.pompiste_nom || profil?.nom_complet || "Pompiste"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nombre de pompes :</span>
                  <span className="font-bold">{(ticketModal.pompes || []).length}</span>
                </div>
              </div>

              {/* Détail par pompe */}
              <div className="border-b pb-2 border-dashed border-gray-300 text-[11px] space-y-2">
                <div className="font-bold text-gray-700">DÉTAIL DES CAISSES PAR POMPE :</div>
                {(ticketModal.pompes || []).map((p) => (
                  <div key={p.id || p.pistolet_code} className="bg-gray-50 p-2 rounded border border-gray-200 space-y-0.5">
                    <div className="flex justify-between font-bold text-blue-900">
                      <span>{p.caisseId} — {(p.pistolet_code || "").toUpperCase()} ({p.produit})</span>
                      <span className="tabular">{F(p.montant)} F</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-600">
                      <span>Index : {p.index_debut} ➔ {p.index_fin}</span>
                      <span>{F(p.volume_vendu)} L à {F(p.prix_unitaire)} F</span>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between font-bold text-blue-900 pt-1">
                  <span>VOLUME TOTAL :</span>
                  <span className="tabular">{F(ticketModal.total_volume || ticketModal.volume_vendu)} L</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-dotted">
                  <span>VENTES CARBURANT :</span>
                  <span className="tabular">{F(ticketModal.total_carburant || ticketModal.total_caisse || ticketModal.montant_theorique)} FCFA</span>
                </div>

                {/* Ventes Lubrifiants sur ticket */}
                {ticketModal.lubrifiants && ticketModal.lubrifiants.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-dotted text-emerald-800 space-y-0.5">
                    <div className="font-bold flex justify-between">
                      <span>VENTES LUBRIFIANTS :</span>
                      <span className="tabular">+{F(ticketModal.total_lubrifiants || 0)} F</span>
                    </div>
                    {ticketModal.lubrifiants.map((l) => (
                      <div key={l.id} className="flex justify-between text-[10px] pl-1 text-gray-600">
                        <span>• {l.libelle} (x{l.quantite})</span>
                        <span className="tabular">{F(l.montant)} F</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Remise en Cuve sur ticket */}
                {n(ticketModal.remise_cuve_valeur) > 0 && (
                  <div className="pt-1 mt-1 border-t border-dotted text-indigo-900 flex justify-between font-bold">
                    <span>REMISE EN CUVE (DÉDUITE) :</span>
                    <span className="tabular">-{F(ticketModal.remise_cuve_valeur)} F</span>
                  </div>
                )}

                <div className="flex justify-between font-black text-gray-950 pt-1.5 border-t border-gray-400">
                  <span>NET THÉORIQUE À VERSER :</span>
                  <span className="tabular">
                    {F(ticketModal.net_theorique ?? Math.max(0, (ticketModal.total_caisse || 0) - (ticketModal.remise_cuve_valeur || 0)))} FCFA
                  </span>
                </div>
              </div>

              {/* Détail encaissements */}
              <div className="border-b pb-2 border-dashed border-gray-300 text-[11px] space-y-1">
                <div className="font-bold text-gray-700">ENCAISSEMENTS REMIS :</div>
                <div className="flex justify-between">
                  <span>Espèces (Cash) :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.especes || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Wave :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.wave || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Orange Money :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.orange_money || 0)} F</span>
                </div>
                <div className="flex justify-between text-purple-800 font-medium">
                  <span>Paiement Petrosen :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.petrosen || 0)} F</span>
                </div>
                <div className="flex justify-between text-cyan-800 font-medium">
                  <span>Code Électronique :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.code_electronique || 0)} F</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-medium">
                  <span>Tickets Carburant :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.tickets || 0)} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Carte Bancaire / TPE :</span>
                  <span className="tabular">{F(ticketModal.encaissements?.carte_bancaire || 0)} F</span>
                </div>
                <div className="flex justify-between font-bold text-amber-900">
                  <span>Bons Client Pro ({ticketModal.bons?.length || 0}) :</span>
                  <span className="tabular">{F(ticketModal.total_bons || ticketModal.encaissements?.credit_client || 0)} F</span>
                </div>
                {n(ticketModal.depenses_valeur) > 0 && (
                  <div className="flex justify-between text-rose-700 font-medium">
                    <span>Dépenses Pompiste {ticketModal.depenses_motif ? `(${ticketModal.depenses_motif})` : ""} :</span>
                    <span className="tabular font-bold">+{F(ticketModal.depenses_valeur)} F</span>
                  </div>
                )}
                {n(ticketModal.encaissements?.autre) > 0 && (
                  <div className="flex justify-between">
                    <span>Autre :</span>
                    <span className="tabular">{F(ticketModal.encaissements?.autre)} F</span>
                  </div>
                )}

                {/* Détail des bons d'encaissement */}
                {ticketModal.bons && ticketModal.bons.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-dotted space-y-0.5 text-[10px] text-gray-600">
                    <div className="font-semibold text-gray-700">Détail des bons :</div>
                    {ticketModal.bons.map((b) => (
                      <div key={b.id || b.numero_bon} className="flex justify-between pl-1">
                        <span>
                          • {b.client_nom || b.client_code} ({b.numero_bon})
                          {n(b.volume_litres) > 0 ? ` [${F(b.volume_litres)} L]` : ""}
                        </span>
                        <span className="tabular font-medium">{F(b.montant)} F</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between font-black text-gray-950 pt-1 border-t border-dotted">
                  <span>TOTAL ENCAISSÉ :</span>
                  <span className="tabular">{F(ticketModal.total_encaisse)} FCFA</span>
                </div>
              </div>

              {/* Écart */}
              <div className="border-b pb-2 border-dashed border-gray-300">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold">ÉCART DE CAISSE :</span>
                  <span
                    className={`font-black tabular text-sm ${
                      ticketModal.ecart >= 0 ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {ticketModal.ecart >= 0 ? "+" : ""}{F(ticketModal.ecart)} FCFA
                  </span>
                </div>
                <div className="text-[10px] mt-0.5 font-sans">
                  {ticketModal.ecart === 0 && <span className="text-emerald-700">✓ Caisse parfaitement équilibrée.</span>}
                  {ticketModal.ecart > 0 && <span className="text-emerald-700">🟢 Excédent de caisse constaté.</span>}
                  {ticketModal.ecart < 0 && (
                    <span className="text-red-600 font-bold">⚠️ Manquant de caisse à justifier.</span>
                  )}
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-2 grid grid-cols-2 gap-4 text-[10px] text-gray-500 font-sans">
                <div className="border rounded p-2 text-center h-16 flex flex-col justify-between">
                  <span>Signature Pompiste</span>
                  <span className="text-[9px] text-gray-400">Certifié sincère</span>
                </div>
                <div className="border rounded p-2 text-center h-16 flex flex-col justify-between">
                  <span>Visa Gérant / Contrôle</span>
                  <span className="text-[9px] text-gray-400">Caisse vérifiée</span>
                </div>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="p-3 bg-gray-50 border-t flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-900 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition order-last sm:order-first"
                title="Fermer et revenir à la saisie"
              >
                ✕ Fermer le ticket
              </button>
              {ticketModal.statut !== "TERMINEE" || isManager ? (
                <button
                  type="button"
                  onClick={() => handleEditerDescente(ticketModal)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm ${
                    ticketModal.statut === "TERMINEE"
                      ? "bg-purple-700 hover:bg-purple-800"
                      : "bg-amber-500 hover:bg-amber-600"
                  }`}
                >
                  {ticketModal.statut === "TERMINEE" ? "✏️ Corriger cette descente (Gérant)" : "✏️ Corriger ce brouillon"}
                </button>
              ) : (
                <div className="py-2 px-3 rounded-xl bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5">
                  🔒 Descente Clôturée (Verrouillée)
                </div>
              )}
              <div className="flex gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-800 hover:bg-gray-100 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  🖨️ Imprimer
                </button>
                <button
                  type="button"
                  onClick={() => shareTicketWhatsApp(ticketModal)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm"
                >
                  📲 WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}