import { db, ensureLocalSeed, getLocalRef, isCloudConfigured, setLocalRef } from "./db";
import { getSupabase } from "./supabase";
import { calculer, n, todayISO, uuid } from "./calcul";
import { referentielFromSeed } from "./seed";
import {
  TABLES_CLOUD_METIER,
  TABLES_META_METIER,
  TABLES_OPS_CLOUD,
  cloudTable,
  dexieTable,
  parseQueueMetierOp,
} from "./metier-sync";

export { isCloudConfigured };

function totaux(r, ref) {
  const c = calculer(r, ref);
  return {
    ca_carburant: Math.round(c.caCarburant),
    ca_lubrifiant: Math.round(c.caLub),
    ca_gaz: Math.round(c.caGaz),
    ca_total: Math.round(c.caTotal),
    a_verser: Math.round(c.aVerser),
    total_versements: Math.round(c.bis),
    ecart_caisse: Math.round(c.ecart),
    depenses: Math.round(c.depenses),
    ca_lavage: Math.round(c.lavage),
    tickets: Math.round(c.tickets),
    remboursement: Math.round(c.remboursement),
    depots: Math.round(c.depots),
  };
}

export async function loadReferentiel() {
  const sb = getSupabase();
  if (sb) {
    try {
      const [{ data: stations }, { data: prix }, { data: pistolets }, { data: produits }, { data: categories }, { data: clients }, { data: cuves }] = await Promise.all([
        sb.from("stations").select("*").eq("actif", true),
        sb.from("prix_carburant").select("*"),
        sb.from("pistolets").select("*, stations(code)"),
        sb.from("produits").select("*").eq("actif", true).order("ordre"),
        sb.from("categories_depense").select("*"),
        sb.from("clients_credit").select("*").eq("actif", true),
        sb.from("cuves").select("*"),
      ]);
      if (stations?.length) {
        const pist = (pistolets || []).map((p) => ({ ...p, station_code: p.stations?.code }));
        const ref = {
          stations,
          prix: (prix || []).map((p) => ({ ...p, date_effet: p.date_effet })),
          pistolets: pist,
          produits,
          lubrifiants: (produits || []).filter((p) => p.famille === "LUBRIFIANT" || p.famille === "ACCESSOIRE"),
          gaz: (produits || []).filter((p) => p.famille === "GAZ"),
          categories: categories || [],
          clients: clients || [],
          cuves: cuves || [],
        };
        await setLocalRef(ref);
        return ref;
      }
    } catch {
      /* offline: cache locale */
    }
  }
  return getLocalRef();
}

export async function listRapports(options = {}) {
  const limit = options.limit ?? 100;
  const page = options.page ?? 1;
  await ensureLocalSeed();
  let local = await db.rapports.orderBy("date").reverse().toArray();
  if (options.station) local = local.filter((r) => r.station === options.station);
  const sb = getSupabase();
  if (!sb) { local.total = local.length; local.pages = 1; return local; }
  try {
    const from = (page - 1) * limit;
    const { data, error, count } = await sb
      .from("rapports_journaliers")
      .select("*, stations(code, nom)", { count: "exact" })
      .order("date_rapport", { ascending: false })
      .range(from, from + limit - 1);
    if (error || !data) { local.total = local.length; local.pages = 1; return local; }
    const rows = data.map(rowToLocal);
    const cloudKeys = new Set(rows.map((r) => `${r.station}:${r.date}`));
    const pendings = local
      .filter((r) => !cloudKeys.has(`${r.station}:${r.date}`) && !rows.some((c) => c.id === r.id))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const merged = page === 1 ? [...pendings, ...rows].slice(0, limit) : rows;
    merged.total = count ?? rows.length;
    merged.pages = Math.max(1, Math.ceil((count ?? rows.length) / limit));
    merged.page = page;
    merged.pending = pendings.length;
    return merged;
  } catch {
    local.total = local.length;
    local.pages = 1;
    return local;
  }
}

function rowToLocal(row) {
  const payload = row.payload || {};
  return {
    ...payload,
    id: row.id,
    station: row.stations?.code || payload.station,
    date: row.date_rapport,
    statut: row.statut,
    gerant: payload.gerant,
    gerant_id: row.gerant_id,
    motifRejet: row.motif_rejet || payload.motifRejet,
    commentaire: row.commentaire || payload.commentaire,
    client_uuid: row.client_uuid,
    maj_le: row.maj_le,
    ca_total: row.ca_total ?? payload.ca_total,
    ecart_caisse: row.ecart_caisse ?? payload.ecart_caisse,
    a_verser: row.a_verser ?? payload.a_verser,
    vol_hint: payload,
  };
}

export async function getRapport(stationCode, date) {
  const local = await db.rapports.where("[station+date]").equals([stationCode, date]).first();
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: st } = await sb.from("stations").select("id").eq("code", stationCode).single();
      if (st) {
        const { data } = await sb.from("rapports_journaliers").select("*, stations(code, nom)").eq("station_id", st.id).eq("date_rapport", date).maybeSingle();
        if (data) {
          const mapped = rowToLocal(data);
          await db.rapports.put(mapped);
          return mapped;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return local || null;
}

export async function indexVeille(stationCode, date, pistoletCode) {
  const prev = await db.rapports.where("station").equals(stationCode).filter((r) => r.date < date).reverse().sortBy("date");
  const last = prev[prev.length - 1];
  const fin = last?.pistolets?.[pistoletCode]?.fin;
  return fin === "" || fin == null ? null : n(fin);
}

async function syncRapportCloud(doc, ref) {
  const sb = getSupabase();
  if (!sb) throw new Error("cloud non configuré");
  const referentiel = ref || (await getLocalRef());
  const station = referentiel.stations.find((s) => s.code === doc.station);
  if (!station) throw new Error("station inconnue : " + doc.station);
  const t = totaux(doc, referentiel);
  const row = {
    id: doc.id,
    station_id: station.id,
    date_rapport: doc.date,
    gerant_id: doc.gerant_id,
    statut: doc.statut,
    ca_lavage: t.ca_lavage,
    tickets: t.tickets,
    depenses: t.depenses,
    remboursement: t.remboursement,
    depots: t.depots,
    commentaire: doc.commentaire || null,
    motif_rejet: doc.motifRejet || null,
    payload: doc,
    client_uuid: doc.client_uuid,
    soumis_le: doc.soumisLe || null,
    valide_par: doc.valide_par || null,
  };
  const { error } = await sb.from("rapports_journaliers").upsert(row, { onConflict: "station_id,date_rapport" });
  if (error) throw new Error(error.message);
  await explodeCloud(sb, doc, referentiel, station.id);
  return { ok: true, t };
}

export async function saveRapport(r, profil, ref, extras = {}) {
  const t = totaux(r, ref);
  const doc = {
    ...r,
    ...extras,
    maj_le: new Date().toISOString(),
    gerant_id: profil?.id || null,
    ...t,
  };
  await db.rapports.put(doc);
  if (doc.statut === "VALIDE") await ecrireMouvementsLocaux(doc, ref);
  const sb = getSupabase();
  if (!sb) {
    return { ok: true, cloud: false, doc };
  }
  try {
    await syncRapportCloud(doc, ref);
    return { ok: true, cloud: true, doc };
  } catch (e) {
    await db.queue.add({ op: "upsert_rapport", payload: doc, created_at: Date.now(), error: String(e.message || e) });
    return { ok: true, cloud: false, pending: true, error: e.message, doc };
  }
}

async function explodeCloud(sb, r, ref, stationId) {
  const { data: header } = await sb.from("rapports_journaliers").select("id, statut").eq("station_id", stationId).eq("date_rapport", r.date).maybeSingle();
  if (!header || header.statut === "VALIDE") return;
  const id = header.id;
  const pist = ref.pistolets.filter((p) => p.station_id === stationId || p.station_code === r.station);
  const pistRows = pist.map((p) => {
    const x = r.pistolets[p.code] || { depart: 0, fin: 0 };
    const fin = x.fin === "" ? n(x.depart) : n(x.fin);
    const prix = p.produit === "GASOIL" ? calculer(r, ref).pGO : calculer(r, ref).pSU;
    return {
      rapport_id: id,
      pistolet_id: p.id,
      index_depart: n(x.depart),
      index_fin: Math.max(fin, n(x.depart)),
      prix_unitaire: prix,
    };
  }).filter((row) => pist.some((p) => p.id === row.pistolet_id));
  if (pistRows.length) await sb.from("rapport_pistolets").upsert(pistRows);

  const lubRows = (ref.lubrifiants || []).map((l) => {
    const x = r.lubrifiants[l.designation] || {};
    return {
      rapport_id: id,
      produit_id: l.id,
      stock_debut: n(x.debut),
      reception: n(x.reception),
      qte_vendue: n(x.vendu),
      prix_unitaire: l.prix_vente,
    };
  });
  if (lubRows.length) await sb.from("rapport_lubrifiants").upsert(lubRows);

  const gazRows = (ref.gaz || []).map((g) => {
    const x = r.gaz[g.designation] || {};
    return {
      rapport_id: id,
      produit_id: g.id,
      stock_present: n(x.present),
      livraison: n(x.livraison),
      qte_vendue: n(x.vendu),
      prix_unitaire: g.prix_vente,
      cout_unitaire: g.cout_achat || 0,
    };
  });
  if (gazRows.length) await sb.from("rapport_gaz").upsert(gazRows);

  const vers = (r.versements || []).map((montant, i) => ({ rapport_id: id, numero: i + 1, montant: n(montant) }));
  if (vers.length) await sb.from("rapport_versements").upsert(vers, { onConflict: "rapport_id,numero" });

  const cats = ref.categories || [];
  await sb.from("lignes_depense").delete().eq("rapport_id", id);
  for (const d of r.depenses || []) {
    const cat = cats.find((c) => c.libelle === d.categorie || c.code === d.categorie);
    if (!cat) continue;
    await sb.from("lignes_depense").insert({ rapport_id: id, categorie_id: cat.id, libelle: d.libelle, montant: n(d.montant) });
  }

  const modes = ["TICKET", "CARTE_STAR", "PLATEFORME_PETROSEN", "ORANGE_MONEY", "WAVE", "TPE", "CREDIT_CLIENT"];
  await sb.from("rapport_reglements").delete().eq("rapport_id", id);
  for (const rg of r.reglements || []) {
    if (!modes.includes(rg.mode) || n(rg.montant) <= 0) continue;
    const client = ref.clients?.find((c) => c.code === rg.client);
    await sb.from("rapport_reglements").insert({
      rapport_id: id,
      mode: rg.mode,
      montant: n(rg.montant),
      client_id: rg.mode === "CREDIT_CLIENT" ? (client?.id || rg.client_id || null) : null,
      detail: rg.libelle ? { libelle: rg.libelle } : null,
    });
  }
}

async function ecrireMouvementsLocaux(doc, ref) {
  await db.mouvements.where("rapport_id").equals(doc.id).delete();
  const station = ref.stations.find((s) => s.code === doc.station);
  for (const l of ref.lubrifiants || []) {
    const x = doc.lubrifiants?.[l.designation];
    if (!x) continue;
    if (n(x.vendu)) await db.mouvements.add({ station_id: station.id, produit_id: l.id, date_mvt: doc.date, type: "VENTE", quantite: -n(x.vendu), rapport_id: doc.id });
    if (n(x.reception)) await db.mouvements.add({ station_id: station.id, produit_id: l.id, date_mvt: doc.date, type: "RECEPTION", quantite: n(x.reception), rapport_id: doc.id });
  }
  for (const g of ref.gaz || []) {
    const x = doc.gaz?.[g.designation];
    if (!x) continue;
    if (n(x.vendu)) await db.mouvements.add({ station_id: station.id, produit_id: g.id, date_mvt: doc.date, type: "VENTE", quantite: -n(x.vendu), rapport_id: doc.id });
    if (n(x.livraison)) await db.mouvements.add({ station_id: station.id, produit_id: g.id, date_mvt: doc.date, type: "RECEPTION", quantite: n(x.livraison), rapport_id: doc.id });
  }
}

export async function stocksTheoriques(ref) {
  const referentiel = ref || (await getLocalRef());
  if (!referentiel) return [];
  const stations = referentiel.stations || [];
  const prods = [...(referentiel.lubrifiants || []), ...(referentiel.gaz || [])];
  const mvts = await db.mouvements.toArray();
  const map = {};
  for (const p of [...(ref.lubrifiants || []), ...(ref.gaz || [])]) {
    for (const st of stations) {
      const q = mvts.filter((m) => m.produit_id === p.id && m.station_id === st.id).reduce((s, m) => s + n(m.quantite), 0);
      map[`${st.code}:${p.designation}`] = q;
    }
  }
  const rapports = await db.rapports.toArray();
  for (const r of rapports) {
    if (r.statut !== "VALIDE") {
      for (const l of ref.lubrifiants || []) {
        const x = r.lubrifiants?.[l.designation];
        if (!x) continue;
        const key = `${r.station}:${l.designation}`;
        if (map[key] === 0 || map[key] == null) {
          /* last stock_fin from latest rapport */
        }
      }
    }
  }
  const lastByStation = {};
  for (const r of rapports) {
    if (r.statut !== "VALIDE") continue;
    const prev = lastByStation[r.station];
    if (!prev || (r.date > prev.date)) lastByStation[r.station] = r;
  }
  const rows = [];
  for (const st of ref.stations) {
    const last = lastByStation[st.code];
    for (const l of prods) {
      let stock = map[`${st.code}:${l.designation}`] || 0;
      if (stock === 0 && last) {
        const x = last.lubrifiants?.[l.designation] || last.gaz?.[l.designation];
        if (x) {
          if (x.debut != null) stock = n(x.debut) + n(x.reception) - n(x.vendu);
          if (x.present != null) stock = n(x.present) + n(x.livraison) - n(x.vendu);
        }
      }
      rows.push({ station: st.code, stationNom: st.nom, produit: l.designation, famille: l.famille, stock, seuil: l.seuil_alerte ?? 5, valeur: stock * (l.prix_vente || 0) });
    }
  }
  return rows;
}

async function syncQuartsCloud(withDate) {
  const sb = getSupabase();
  if (!sb) throw new Error("cloud non configuré");
  const pompistes = await db.pompistes.toArray();
  const ref = await getLocalRef();
  let synced = 0;
  let missingRapport = false;
  for (const q of withDate) {
    const pomp = pompistes.find((p) => p.id === q.pompiste_id);
    const st = ref.stations.find((s) => s.id === (pomp?.station_id || q.station_id));
    if (!pomp || !st) continue;
    let rapportId = q.rapport_id || null;
    if (!rapportId) {
      const { data: rapport } = await sb.from("rapports_journaliers").select("id").eq("station_id", st.id).eq("date_rapport", q.date).maybeSingle();
      rapportId = rapport?.id || null;
    }
    if (!rapportId) { missingRapport = true; continue; }
    const { error } = await sb.from("quarts_pompistes").upsert({
      id: q.id,
      rapport_id: rapportId,
      pompiste_id: pomp.id,
      pistolets: q.pistolets || [],
      valeur_ventes: n(q.valeur_ventes),
      prelevement: n(q.prelevement),
      tickets: n(q.tickets),
      cartes_star: n(q.cartes_star),
      petrosen: n(q.petrosen),
      mobile_money: n(q.mobile_money),
      verse: n(q.verse),
    });
    if (error) throw new Error(error.message);
    synced++;
  }
  if (missingRapport) throw new Error("rapport absent pour certains quarts — reprise ultérieure");
  return synced;
}

async function replayMetierQueueItem(sb, item) {
  const parsed = parseQueueMetierOp(item.op);
  if (!parsed) return false;
  const ct = cloudTable(parsed.table);
  if (!ct) throw new Error(`Table cloud inconnue : ${parsed.table}`);
  const dt = dexieTable(parsed.table);
  if (parsed.action === "delete") {
    const id = item.payload?.id;
    if (!id) throw new Error("ID manquant pour suppression");
    const { error } = await sb.from(ct).delete().eq("id", id);
    if (error) throw new Error(error.message);
    await db[dt].delete(id);
    return true;
  }
  const row = item.payload;
  if (parsed.action === "insert") {
    const { error } = await sb.from(ct).insert(row);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from(ct).upsert(row);
    if (error) throw new Error(error.message);
  }
  await db[dt].put(row);
  return true;
}

export async function flushQueue() {
  const sb = getSupabase();
  if (!sb) return { flushed: 0 };
  const items = await db.queue.toArray();
  let flushed = 0;
  for (const item of items) {
    try {
      if (item.op === "upsert_rapport") {
        const res = await syncRapportCloud(item.payload);
        if (!res.ok) throw new Error(res.error);
      } else if (item.op === "upsert_quarts") {
        await syncQuartsCloud(item.payload);
      } else if (item.op === "upsert_operation_credit") {
        const op = item.payload;
        const { data: cl } = await sb.from("clients_credit").select("id").eq("code", op.client_code).maybeSingle();
        if (!cl) throw new Error("Client crédit introuvable au niveau du cloud");
        const { error } = await sb.from("operations_credit").insert({ ...op, client_id: cl.id });
        if (error) throw new Error(error.message);
      } else if (await replayMetierQueueItem(sb, item)) {
        // upsert_*, insert_*, update_*, delete_* métier / ops terrain
      } else {
        throw new Error(`Opération de file inconnue : ${item.op}`);
      }
      await db.queue.delete(item.id);
      flushed += 1;
    } catch (e) {
      await db.queue.update(item.id, { error: String(e.message || e) });
    }
  }
  if (flushed > 0) await db.meta.put({ key: "last_sync", value: new Date().toISOString() });
  return { flushed };
}

export async function listProfilsCloud() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("profils").select("*, stations(code, nom)");
  return data || [];
}

export async function updateProfilRole(id, patch) {
  const sb = getSupabase();
  if (!sb) return { error: "Cloud requis" };
  const { error } = await sb.from("profils").update(patch).eq("id", id);
  return { error: error?.message };
}

export function newId() {
  return uuid();
}

// ── CRUD Stations ──
export async function createStation(station) {
  const sb = getSupabase();
  const row = { id: station.id || uuid(), code: station.code, nom: station.nom, localisation: station.localisation || "", nb_pistolets: n(station.nb_pistolets) || 8, actif: true };
  if (sb) { const { error } = await sb.from("stations").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.stations = [...ref.stations, row]; await setLocalRef(ref);
  return { ok: true, station: row };
}
export async function updateStation(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("stations").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.stations = ref.stations.map((s) => s.id === id ? { ...s, ...patch } : s); await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Prix ──
export async function createPrix(prix) {
  const sb = getSupabase();
  const row = { produit: prix.produit, prix_vente: n(prix.prix_vente), prix_achat: prix.prix_achat ? +prix.prix_achat : null, date_effet: prix.date_effet };
  if (sb) { const { error } = await sb.from("prix_carburant").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.prix = [...ref.prix, row]; await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Produits ──
export async function createProduit(produit) {
  const sb = getSupabase();
  const row = { id: produit.id || uuid(), code: produit.code, designation: produit.designation, famille: produit.famille, unite: produit.unite || "unité", prix_vente: n(produit.prix_vente), cout_achat: produit.cout_achat ? n(produit.cout_achat) : null, seuil_alerte: n(produit.seuil_alerte) || 5, ordre: n(produit.ordre) || 99, actif: true };
  if (sb) { const { error } = await sb.from("produits").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.produits = [...(ref.produits || []), row];
  if (row.famille === "LUBRIFIANT" || row.famille === "ACCESSOIRE") ref.lubrifiants = [...(ref.lubrifiants || []), row];
  if (row.famille === "GAZ") ref.gaz = [...(ref.gaz || []), row];
  await setLocalRef(ref);
  return { ok: true, produit: row };
}
export async function updateProduit(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("produits").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  const upd = (arr) => (arr || []).map((p) => p.id === id ? { ...p, ...patch } : p);
  ref.produits = upd(ref.produits); ref.lubrifiants = upd(ref.lubrifiants); ref.gaz = upd(ref.gaz);
  await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Catégories ──
export async function createCategorie(cat) {
  const sb = getSupabase();
  const row = { code: cat.code, libelle: cat.libelle, nature: cat.nature || "VARIABLE", compte_syscohada: cat.compte_syscohada || "6588" };
  if (sb) { const { error } = await sb.from("categories_depense").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.categories = [...(ref.categories || []), row]; await setLocalRef(ref);
  return { ok: true };
}
export async function updateCategorie(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("categories_depense").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.categories = (ref.categories || []).map((c) => (c.id === id || c.code === id) ? { ...c, ...patch } : c);
  await setLocalRef(ref);
  return { ok: true };
}
export async function deleteCategorie(id) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("categories_depense").delete().eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.categories = (ref.categories || []).filter((c) => c.id !== id && c.code !== id);
  await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Clients crédit ──
export async function createClientCredit(client) {
  const sb = getSupabase();
  const row = { id: client.id || uuid(), code: client.code, nom: client.nom, plafond: n(client.plafond) || 0, actif: true };
  if (sb) { const { error } = await sb.from("clients_credit").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.clients = [...(ref.clients || []), row]; await setLocalRef(ref);
  return { ok: true, client: row };
}
export async function updateClientCredit(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("clients_credit").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.clients = (ref.clients || []).map((c) => (c.id === id || c.code === id) ? { ...c, ...patch } : c);
  await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Prix (suppression d'une saisie erronée) ──
export async function deletePrix(id) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("prix_carburant").delete().eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.prix = (ref.prix || []).filter((p) => p.id !== id);
  await setLocalRef(ref);
  return { ok: true };
}

// ── Livraisons carburant ──
export async function saveLivraison(liv) {
  const row = { id: liv.id || uuid(), station_id: liv.station_id, date_livraison: liv.date_livraison, numero_bl: liv.numero_bl, produit: liv.produit, volume_l: n(liv.volume_l), depot: liv.depot || "", camion: liv.camion || "", chauffeur: liv.chauffeur || "", prix_achat: liv.prix_achat ? +liv.prix_achat : null, manquant_l: n(liv.manquant_l) };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("livraisons_carburant").upsert(row); if (error) return { error: error.message }; }
  await db.livraisons.put(row);
  return { ok: true };
}
export async function listLivraisons(stationId) {
  const sb = getSupabase();
  if (sb) { try { const { data } = await sb.from("livraisons_carburant").select("*").eq("station_id", stationId).order("date_livraison", { ascending: false }).limit(100); if (data) return data; } catch {} }
  return db.livraisons.where("station_id").equals(stationId).reverse().sortBy("date_livraison");
}

// ── Jauges cuves ──
export async function saveJauge(jauge) {
  const row = { station_id: jauge.station_id, date_jauge: jauge.date_jauge, produit: jauge.produit, jauge_j: +jauge.jauge_j, livraison_l: n(jauge.livraison_l), vente_j: n(jauge.vente_j), jauge_j1: jauge.jauge_j1 != null && jauge.jauge_j1 !== "" ? +jauge.jauge_j1 : null };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("jauges_cuves").upsert(row, { onConflict: "station_id,date_jauge,produit" }); if (error) return { error: error.message }; }
  await db.jauges.put({ ...row, id: jauge.id || undefined });
  return { ok: true };
}
export async function listJauges(stationId) {
  const sb = getSupabase();
  if (sb) { try { const { data } = await sb.from("jauges_cuves").select("*").eq("station_id", stationId).order("date_jauge", { ascending: false }).limit(60); if (data) return data; } catch {} }
  return db.jauges.where("station_id").equals(stationId).reverse().sortBy("date_jauge");
}

// ── Pompistes ──
export async function listPompistes(stationId) {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from("pompistes").select("*").eq("station_id", stationId);
      if (data) return data;
    } catch {}
  }
  return db.pompistes.where("station_id").equals(stationId).toArray();
}
export async function savePompiste(p) {
  const row = { id: p.id || uuid(), station_id: p.station_id, nom: p.nom, actif: p.actif !== false };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("pompistes").upsert(row); if (error) return { error: error.message }; }
  await db.pompistes.put(row);
  return { ok: true, pompiste: row };
}

// ══════════════════════════════════════════════════════════════════════════
export async function listQuarts(dateISO) {
  const key = dateISO || todayISO();
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: rapports } = await sb.from("rapports_journaliers").select("id").eq("date_rapport", key);
      const ids = (rapports || []).map((r) => r.id);
      if (ids.length > 0) {
        const { data } = await sb.from("quarts_pompistes").select("*").in("rapport_id", ids).limit(200);
        if (data) {
          const merged = data.map((q) => ({ ...q, date: key }));
          for (const m of merged) await db.quarts.put(m);
          return merged;
        }
      }
    } catch {}
  }
  return db.quarts.where("date").equals(key).toArray();
}

export async function saveQuarts(quarts) {
  const withDate = quarts.map((q) => ({ ...q, date: q.date || todayISO() }));
  for (const q of withDate) await db.quarts.put(q);
  const sb = getSupabase();
  if (!sb) return { ok: true, cloud: false, count: withDate.length };
  try {
    await syncQuartsCloud(withDate);
    return { ok: true, cloud: true, count: withDate.length };
  } catch (e) {
    await db.queue.add({ op: "upsert_quarts", payload: withDate, created_at: Date.now(), error: String(e.message || e) });
    return { ok: true, cloud: false, pending: true, count: withDate.length, error: e.message };
  }
}

// ── Cuves ──
export async function listCuves(stationId) {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from("cuves").select("*").eq("station_id", stationId);
      if (data?.length) return data;
    } catch {}
  }
  const ref = await getLocalRef();
  return (ref.cuves || []).filter((c) => c.station_id === stationId);
}
export async function saveCuve(cuve) {
  const row = { id: cuve.id || uuid(), station_id: cuve.station_id, produit: cuve.produit, capacite_l: n(cuve.capacite_l) || null };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("cuves").upsert(row, { onConflict: "station_id,produit" }); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.cuves = [...(ref.cuves || []).filter((c) => !(c.station_id === row.station_id && c.produit === row.produit)), row];
  await setLocalRef(ref);
  return { ok: true, cuve: row };
}

// ── Opérations crédit ──
export async function saveOperationCredit(op) {
  const row = { client_code: op.client_code, station_id: op.station_id, date_op: op.date_op, matricule: op.matricule || "", volume_l: n(op.volume_l), valeur_cons: n(op.valeur_cons), depot: n(op.depot), rapport_id: op.rapport_id || null };
  const id = await db.operations_credit.add(row);
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: cl } = await sb.from("clients_credit").select("id").eq("code", op.client_code).maybeSingle();
      if (!cl) throw new Error("Client crédit introuvable au niveau du cloud");
      const { error } = await sb.from("operations_credit").insert({ ...row, client_id: cl.id });
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: "upsert_operation_credit", payload: row, created_at: Date.now(), error: String(e.message || e) });
      return { ok: true, cloud: false, pending: true, id, row, error: e.message };
    }
  }
  return { ok: true, cloud: Boolean(sb), id, row };
}
export async function listOperationsCredit(clientCode) {
  const sb = getSupabase();
  if (sb) { try { const { data: cl } = await sb.from("clients_credit").select("id").eq("code", clientCode).maybeSingle(); if (cl) { const { data } = await sb.from("operations_credit").select("*").eq("client_id", cl.id).order("date_op", { ascending: false }).limit(200); if (data) return data; } } catch {} }
  return db.operations_credit.where("client_code").equals(clientCode).reverse().sortBy("date_op");
}
export async function soldeClient(clientCode) {
  const ops = await listOperationsCredit(clientCode);
  return ops.reduce((s, o) => s + n(o.depot) - n(o.valeur_cons), 0);
}

export async function listNotifications() {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("notifications").select("*").order("cree_le", { ascending: false }).limit(30);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function marquerNotificationLue(id) {
  const sb = getSupabase();
  if (!sb) return { ok: false };
  const { error } = await sb.from("notifications").update({ lu: true }).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

// ── Suppression d'un rapport (brouillons / rejetés) ──
export async function deleteRapport(doc, ref) {
  if (!doc || !doc.id) return { error: "Rapport invalide" };
  if (doc.statut === "VALIDE") return { error: "Un rapport validé ne peut pas être supprimé — historique gardé" };
  const sb = getSupabase();
  if (sb) {
    try {
      const referentiel = ref || (await getLocalRef());
      const station = referentiel.stations.find((s) => s.code === doc.station);
      if (station) {
        const { error } = await sb.from("rapports_journaliers").delete().eq("station_id", station.id).eq("date_rapport", doc.date);
        if (error && !String(error.message || "").toLowerCase().includes("no rows")) {
          if (String(error.message || "").toLowerCase().includes("policy")) return { error: "Suppression refusée côté serveur (RLS)" };
        }
      }
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }
  await db.rapports.delete(doc.id);
  await db.mouvements.where("rapport_id").equals(doc.id).delete();
  await db.quarts.where("rapport_id").equals(doc.id).delete();
  const queued = await db.queue.toArray();
  for (const q of queued) {
    if (q.op === "upsert_rapport" && q.payload?.id === doc.id) await db.queue.delete(q.id);
  }
  return { ok: true };
}

// ── Paramètres réseau ──
export const PARAMETRES_DEFAUT = { id: "reseau", nom_reseau: "OGSS Réseau", devise: "FCFA", adresse: "", contact: "" };

export async function getParametres() {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from("parametres_networks").select("*").eq("id", "reseau").maybeSingle();
      if (data) return { ...PARAMETRES_DEFAUT, ...data };
    } catch {
      /* hors ligne : cache locale */
    }
  }
  const local = await db.meta.get("parametres");
  return { ...PARAMETRES_DEFAUT, ...(local?.value || {}) };
}

export async function saveParametres(p) {
  const row = { ...PARAMETRES_DEFAUT, ...p, id: "reseau", maj_le: new Date().toISOString() };
  await db.meta.put({ key: "parametres", value: row });
  const sb = getSupabase();
  if (!sb) return { ok: true, cloud: false, parametres: row };
  try {
    const { error } = await sb.from("parametres_networks").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true, cloud: true, parametres: row };
  } catch (e) {
    return { ok: true, cloud: false, pending: true, parametres: row, error: e.message };
  }
}

// ── Diagnostic synchronisation ──
export async function diagSync() {
  const sb = getSupabase();
  const pending = await db.queue.count();
  const localRapports = await db.rapports.count();
  const lastSyncMeta = await db.meta.get("last_sync");
  const result = { cloud: !!sb, enLigne: !!navigator?.onLine, pending, localRapports, lastSync: lastSyncMeta?.value || null, ok: false };
  if (sb) {
    try {
      const { count, error } = await sb.from("rapports_journaliers").select("id", { count: "exact", head: true });
      if (error) { result.erreur = error.message; } else { result.ok = true; result.cloudRapports = count ?? 0; }
    } catch (e) { result.erreur = String(e.message || e); }
  } else {
    result.erreur = "Cloud non configuré — mode démonstration locale";
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// VAGUE 2 — CRUD générique §33/§34/§38 (offline-first : Supabase → Dexie + audit)
// Convention identique à saveLivraison/createClientCredit : la grille par défaut
// (§6 RBAC) est testée côté page ; ici uniquement persistance + audit local.
// ══════════════════════════════════════════════════════════════════════════

const TABLES_METIER = {
  clients_pro: { libelle: "clients_professionnels", champCle: "code", cloud: "clients_professionnels" },
  vehicules: { libelle: "vehicules", champCle: "immatriculation", cloud: "vehicules" },
  fournisseurs: { libelle: "fournisseurs", champCle: "code", cloud: "fournisseurs" },
  achats: { libelle: "achats", champCle: "id", cloud: "achats_carburant" },
  depenses: { libelle: "depenses", champCle: "id", cloud: "depenses" },
  equipements: { libelle: "equipements", champCle: "id", cloud: "equipements" },
  maintenances: { libelle: "maintenances", champCle: "id", cloud: "maintenances" },
  incidents: { libelle: "incidents", champCle: "id", cloud: "incidents" },
};

export function listTablesMetier() {
  return Object.keys(TABLES_METIER);
}

// ── Formulaire générique (table → colonnes éditables sous forme de liste) ──
export function colonnesMetier(table) {
  if (table === "clients_pro") {
    return [
      { cle: "code", libelle: "Code client", requis: true },
      { cle: "nom_entreprise", libelle: "Entreprise", requis: true },
      { cle: "contact", libelle: "Contact", requis: false },
      { cle: "telephone", libelle: "Téléphone", requis: false },
      { cle: "email", libelle: "Email", requis: false },
      { cle: "plafond_credit", libelle: "Plafond crédit (F)", requis: false },
    ];
  }
  if (table === "vehicules") {
    return [
      { cle: "immatriculation", libelle: "Immatriculation", requis: true },
      { cle: "marque", libelle: "Marque", requis: false },
      { cle: "modele", libelle: "Modèle", requis: false },
      { cle: "carburant", libelle: "Carburant", requis: false },
    ];
  }
  if (table === "fournisseurs") {
    return [
      { cle: "code", libelle: "Code fournisseur", requis: true },
      { cle: "nom_fournisseur", libelle: "Nom", requis: true },
      { cle: "telephone", libelle: "Téléphone", requis: false },
      { cle: "email", libelle: "Email", requis: false },
    ];
  }
  if (table === "achats") {
    return [
      { cle: "date_achat", libelle: "Date", requis: true },
      { cle: "designation", libelle: "Désignation", requis: true },
      { cle: "quantite_achat", libelle: "Quantité", requis: false },
      { cle: "montant_total", libelle: "Montant total (F)", requis: false },
      { cle: "statut_achat", libelle: "Statut", requis: false },
    ];
  }
  if (table === "depenses") {
    return [
      { cle: "date_depense", libelle: "Date", requis: true },
      { cle: "categorie_depense", libelle: "Catégorie", requis: false },
      { cle: "designation_depense", libelle: "Désignation", requis: false },
      { cle: "montant_depense", libelle: "Montant (F)", requis: true },
      { cle: "mode_paiement", libelle: "Mode paiement", requis: false },
    ];
  }
  if (table === "equipements") {
    return [
      { cle: "type_equipement", libelle: "Type", requis: true },
      { cle: "designation_equipement", libelle: "Désignation", requis: false },
      { cle: "date_installation", libelle: "Installation", requis: false },
      { cle: "etat_equipement", libelle: "État", requis: false },
    ];
  }
  if (table === "maintenances") {
    return [
      { cle: "type_maintenance", libelle: "Type", requis: true },
      { cle: "equipement_id", libelle: "Équipement", requis: true },
      { cle: "date_maintenance", libelle: "Date", requis: false },
      { cle: "cout_maintenance", libelle: "Coût (F)", requis: false },
      { cle: "statut_maintenance", libelle: "Statut", requis: false },
    ];
  }
  if (table === "incidents") {
    return [
      { cle: "motif_incident", libelle: "Motif", requis: true },
      { cle: "incident_date", libelle: "Date", requis: true },
      { cle: "description_incident", libelle: "Description", requis: false },
      { cle: "priorite_incident", libelle: "Priorité", requis: false },
    ];
  }
  return [];
}

// ── §33 : helpers métier génériques (collecte Supabase + Dexie, save, delete) ──
// Tous les CRUD spécifiques (fournisseurs, achats, depenses, equipements,
// maintenances, incidents, clients_pro, vehicules) sont construits sur ces
// trois fonctions + TABLES_META_METIER / TABLES_CLOUD_METIER ci-dessous.

export function champCle(table) {
  return TABLES_METIER[table]?.champCle || TABLES_META_METIER[table]?.champCle || "id";
}

async function lastMetier(table) {
  const dt = dexieTable(table);
  try {
    if (db[dt]?.orderBy) {
      const rows = await db[dt].orderBy("created_at").reverse().limit(1).toArray();
      if (rows.length) return rows;
    }
  } catch {}
  try {
    const all = await db[dt].toArray();
    return all.length ? [all[all.length - 1]] : [];
  } catch {
    return [];
  }
}

async function collectMetier(table, stationId) {
  const sb = getSupabase();
  const ct = cloudTable(table) || TABLES_METIER[table]?.cloud;
  const dt = dexieTable(table);
  const seen = new Set();
  const rows = [];
  if (sb && ct) {
    try {
      const { data } = await sb.from(ct).select("*").order("created_at", { ascending: false }).limit(500);
      for (const r of data || []) {
        const key = r.id || r.code;
        if (key && !seen.has(key)) { seen.add(key); rows.push(r); }
      }
    } catch {}
  }
  let local = [];
  try { local = await db[dt].orderBy("created_at").reverse().toArray(); } catch { try { local = await db[dt].toArray(); } catch {} }
  for (const r of local) {
    const key = r.id || r.code;
    if (key && !seen.has(key)) { seen.add(key); rows.push(r); }
  }
  if (stationId) return rows.filter((r) => r.station_id === stationId || !r.station_id);
  return rows;
}

export async function createMetier(table, data) {
  const dt = dexieTable(table);
  const ct = cloudTable(table) || TABLES_METIER[table]?.cloud;
  const row = { ...data };
  if (!row.id) row.id = uuid();
  if (!row.created_at) row.created_at = new Date().toISOString();
  const sb = getSupabase();
  if (sb && ct) {
    try {
      const { error } = await sb.from(ct).insert(row);
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: `insert_${table}`, payload: row, created_at: Date.now(), error: String(e.message || e) });
      await db[dt].put(row);
      return { ok: true, cloud: false, pending: true, error: e.message, row };
    }
  }
  await db[dt].put(row);
  await db.audit_logs.put({ id: uuid(), table: table, action: "CREATE", objet_id: row.id || null, ancienne_valeur: null, nouvelle_valeur: row, created_at: new Date().toISOString() });
  return { ok: true, row };
}

export async function updateMetier(table, id, patch) {
  const dt = dexieTable(table);
  const ct = cloudTable(table) || TABLES_METIER[table]?.cloud;
  const existing = await db[dt].get(id);
  const prev = existing || (await lastMetier(table))[0] || null;
  const row = { ...(existing || {}), ...patch, id, maj_le: new Date().toISOString() };
  const sb = getSupabase();
  if (sb && ct) {
    try {
      const { error } = await sb.from(ct).update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: `update_${table}`, payload: row, created_at: Date.now(), error: String(e.message || e) });
      await db[dt].put(row);
      return { ok: true, cloud: false, pending: true, error: e.message, row };
    }
  }
  await db[dt].put(row);
  await db.audit_logs.put({ id: uuid(), table: table, action: "UPDATE", objet_id: id, ancienne_valeur: prev || {}, nouvelle_valeur: row, created_at: new Date().toISOString() });
  return { ok: true, row };
}

export async function deleteMetier(table, id) {
  const dt = dexieTable(table);
  const ct = cloudTable(table) || TABLES_METIER[table]?.cloud;
  const existing = await db[dt].get(id);
  const prev = existing || null;
  const sb = getSupabase();
  if (sb && ct) {
    try {
      const { error } = await sb.from(ct).delete().eq("id", id);
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: `delete_${table}`, payload: { id }, created_at: Date.now(), error: String(e.message || e) });
      await db[dt].delete(id);
      return { ok: true, cloud: false, pending: true, error: e.message };
    }
  }
  await db[dt].delete(id);
  await db.audit_logs.put({ id: uuid(), table: table, action: "DELETE", objet_id: id, ancienne_valeur: prev || {}, nouvelle_valeur: null, created_at: new Date().toISOString() });
  return { ok: true };
}

// ╔═════════════════════════════════════════════════════════════════════════
// ║ VAGUE 2 — CRUD métier §33/§34/§38 (parametrage réseau, offline-first)
// ╚═════════════════════════════════════════════════════════════════════════
// Convention : Dexie = source de vérité locale (PWA hors-ligne) ;
// Supabase = upsert best-effort quand cloud configuré, sinon file d'attente.
// @param {string} table  — nom Dexie (§33 : clients_pro/vehicules/fournisseurs/…)
// @param {object} payload
function newIdMeta(table) {
  return {
    clients_pro: () => uuid(),
    vehicules: () => uuid(),
    fournisseurs: () => uuid(),
    achats: () => uuid(),
    depenses: () => uuid(),
    equipements: () => uuid(),
    maintenances: () => uuid(),
    incidents: () => uuid(),
    sessions_caisse: () => uuid(),
  }[table]?.() || uuid();
}
export async function listMetier(table, stationId, champFiltre) {
  const champ = champFiltre || TABLES_META_METIER[table]?.station;
  const ct = cloudTable(table);
  const dt = dexieTable(table);
  const sb = getSupabase();
  if (sb && ct && champ) {
    try {
      const { data } = await sb.from(ct).select("*").eq(champ, stationId).order("created_at", { ascending: false }).limit(500);
      if (data?.length) {
        for (const r of data) { try { await db[dt].put(r); } catch {} }
        return data;
      }
    } catch {}
  }
  if (!champ) return db[dt].toArray();
  return db[dt].where(champ).equals(stationId).reverse().sortBy("created_at");
}

export async function saveMetierRow(table, row) {
  const meta = TABLES_META_METIER[table] || {};
  const dt = dexieTable(table);
  const ct = cloudTable(table);
  const r = { ...row, id: row.id || newIdMeta(table) };
  if (!r.created_at) r.created_at = new Date().toISOString();
  r.maj_le = new Date().toISOString();
  const sb = getSupabase();
  if (sb && ct) {
    try {
      const { error } = await sb.from(ct).upsert(r);
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: `upsert_${table}`, payload: r, created_at: Date.now(), error: String(e.message || e) });
      await db[dt].put(r);
      return { ok: true, pending: true, row: r };
    }
  }
  await db[dt].put(r);
  await db.audit_logs.put({ id: uuid(), table, action: "SAVE", objet_id: r[meta.champCle] || r.id, nouvelle_valeur: r, created_at: new Date().toISOString() });
  return { ok: true, row: r };
}

export async function deleteMetierRow(table, id) {
  const dt = dexieTable(table);
  const ct = cloudTable(table);
  const sb = getSupabase();
  if (sb && ct) {
    try {
      const { error } = await sb.from(ct).delete().eq("id", id);
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: `delete_${table}`, payload: { id }, created_at: Date.now(), error: String(e.message || e) });
    }
  }
  await db[dt].delete(id);
  await db.audit_logs.put({ id: uuid(), table, action: "DELETE", objet_id: id, ancienne_valeur: { id }, created_at: new Date().toISOString() });
  return { ok: true };
}

/** Persistance offline-first pour opérations terrain Vague 2 */
async function saveOpRow(table, row) {
  const dt = dexieTable(table);
  const ct = cloudTable(table);
  const r = {
    ...row,
    id: row.id || uuid(),
    created_at: row.created_at || new Date().toISOString(),
    maj_le: new Date().toISOString(),
  };
  await db[dt].put(r);
  const sb = getSupabase();
  if (sb && ct) {
    try {
      const { error } = await sb.from(ct).upsert(r);
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: `upsert_${table}`, payload: r, created_at: Date.now(), error: String(e.message || e) });
      return { ok: true, pending: true, row: r };
    }
  }
  return { ok: true, row: r };
}

// ── CRUD clients_pro (clients professionnels) ──
export async function createClientPro(c) { return saveMetierRow("clients_pro", { ...c, code: c.code || uuid() }); }
export async function updateClientPro(id, patch) {
  const gun = await saveMetierRow("clients_pro", { ...patch, id });
  return gun;
}
export async function deleteClientPro(id) { return deleteMetierRow("clients_pro", id); }
export async function listClientsPro(stationId) { return listMetier("clients_pro", stationId); }
export async function createVehicule(v) { return saveMetierRow("vehicules", v); }
export async function updateVehicule(id, patch) { return saveMetierRow("vehicules", { ...patch, id }); }
export async function deleteVehicule(id) { return deleteMetierRow("vehicules", id); }
export async function listVehicules(stationId, clientCode) {
  return (await listMetier("vehicules", stationId)).filter((v) => !clientCode || v.client_code === clientCode);
}
export async function createFournisseur(f) { return saveMetierRow("fournisseurs", f); }
export async function updateFournisseur(id, patch) { return saveMetierRow("fournisseurs", { ...patch, id }); }
export async function deleteFournisseur(id) { return deleteMetierRow("fournisseurs", id); }
export async function listFournisseurs(stationId) { return listMetier("fournisseurs", stationId); }
export async function createAchat(a) { return saveMetierRow("achats", a); }
export async function updateAchat(id, patch) { return saveMetierRow("achats", { ...patch, id }); }
export async function deleteAchat(id) { return deleteMetierRow("achats", id); }
export async function listAchats(stationId) { return listMetier("achats", stationId); }
export async function createDepense(d) { return saveMetierRow("depenses", { ...d, montant: n(d.montant) }); }
export async function updateDepense(id, patch) { return saveMetierRow("depenses", { ...patch, id }); }
export async function deleteDepense(id) { return deleteMetierRow("depenses", id); }
export async function listDepenses(stationId) {
  const rows = await listMetier("depenses", stationId);
  return rows.sort((a, b) => (b.date_depense || b.date || "").localeCompare(a.date_depense || a.date || ""));
}
export async function createEquipement(e) { return saveMetierRow("equipements", e); }
export async function updateEquipement(id, patch) { return saveMetierRow("equipements", { ...patch, id }); }
export async function deleteEquipement(id) { return deleteMetierRow("equipements", id); }
export async function listEquipements(stationId) { return listMetier("equipements", stationId); }
export async function createMaintenance(m) { return saveMetierRow("maintenances", m); }
export async function updateMaintenance(id, patch) { return saveMetierRow("maintenances", { ...patch, id }); }
export async function deleteMaintenance(id) { return deleteMetierRow("maintenances", id); }
export async function listMaintenances(stationId) {
  const rows = await listMetier("maintenances", stationId);
  return rows.sort((a, b) => (b.date_maintenance || "").localeCompare(a.date_maintenance || ""));
}
export async function createIncident(x) { return saveMetierRow("incidents", x); }
export async function updateIncident(id, patch) { return saveMetierRow("incidents", { ...patch, id }); }
export async function deleteIncident(id) { return deleteMetierRow("incidents", id); }
export async function listIncidents(stationId) {
  const rows = await listMetier("incidents", stationId);
  return rows.sort((a, b) => (b.date_incident || "").localeCompare(a.date_incident || ""));
}
export async function createSessionCaisse(s) { return saveMetierRow("sessions_caisse", s); }
export async function updateSessionCaisse(id, patch) { return saveMetierRow("sessions_caisse", { ...patch, id }); }
export async function listSessionsCaisse(stationId) { return listMetier("sessions_caisse", stationId); }

export { referentielFromSeed };


export const saveDepense = createDepense;

// ── VAGUE 2 : CRUD Descentes pompistes (§2 & §37) ──
export async function createDescente(d) {
  const res = await saveOpRow("descentes", { ...d, statut: d.statut || "EN_COURS" });
  return { ok: true, descente: res.row, pending: res.pending };
}

export async function updateDescente(id, patch) {
  const existing = (await db.descentes.get(id)) || {};
  const res = await saveOpRow("descentes", { ...existing, ...patch, id });
  return { ok: true, descente: res.row, pending: res.pending };
}

export async function listDescentes(stationId, date) {
  await ensureLocalSeed();
  let rows = await db.descentes.toArray();
  if (stationId) rows = rows.filter((d) => d.station_id === stationId);
  if (date) rows = rows.filter((d) => d.date === date);
  return rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function getDescente(id) {
  return db.descentes.get(id);
}

// ── VAGUE 2 : CRUD Lavage (§2 & §37) ──
export async function createPrestationLavage(p) {
  const res = await saveOpRow("prestations_lavage", p);
  return { ok: true, prestation: res.row, pending: res.pending };
}

export async function listPrestationsLavage(stationId, date) {
  await ensureLocalSeed();
  let rows = await db.prestations_lavage.toArray();
  if (stationId) rows = rows.filter((p) => p.station_id === stationId);
  if (date) rows = rows.filter((p) => p.date === date);
  return rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function deletePrestationLavage(id) {
  return deleteMetierRow("prestations_lavage", id);
}

// ── VAGUE 2 : CRUD Boutique & POS (§2 & §37) ──
export async function listProduitsBoutique(stationId) {
  await ensureLocalSeed();
  let rows = await db.produits_boutique.toArray();
  if (!rows || rows.length === 0) {
    const ref = await getLocalRef();
    const defaults = (ref.produits_boutique || []).map((p) => ({
      ...p,
      id: p.code,
      station_id: stationId || "st-hann",
      actif: true,
    }));
    await db.produits_boutique.bulkPut(defaults);
    rows = defaults;
  }
  if (stationId) rows = rows.filter((p) => !p.station_id || p.station_id === stationId);
  return rows;
}

export async function updateProduitBoutique(id, patch) {
  const existing = (await db.produits_boutique.get(id)) || {};
  const res = await saveOpRow("produits_boutique", { ...existing, ...patch, id });
  return { ok: true, produit: res.row, pending: res.pending };
}

export async function createVenteBoutique(v) {
  const res = await saveOpRow("ventes_boutique", v);
  const row = res.row;
  if (Array.isArray(row.lignes)) {
    for (const item of row.lignes) {
      const prodId = item.id || item.code;
      if (prodId) {
        const p = await db.produits_boutique.get(prodId);
        if (p) {
          const nouveauStock = Math.max(0, (n(p.stock) || 0) - (n(item.quantite) || 1));
          await db.produits_boutique.update(prodId, { stock: nouveauStock });
        }
      }
    }
  }
  return { ok: true, vente: row, pending: res.pending };
}

export async function listVentesBoutique(stationId, date) {
  await ensureLocalSeed();
  let rows = await db.ventes_boutique.toArray();
  if (stationId) rows = rows.filter((v) => v.station_id === stationId);
  if (date) rows = rows.filter((v) => v.date === date);
  return rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

// ── VAGUE 2 : Rapprochement Cuves & Jauges physiques (§2 & §37) ──
export async function listJaugesCuves(stationId, date) {
  await ensureLocalSeed();
  let rows = await db.jauges_cuves.toArray();
  if (stationId) rows = rows.filter((j) => j.station_id === stationId);
  if (date) rows = rows.filter((j) => j.date === date);
  return rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function saveJaugeCuve(j) {
  const res = await saveOpRow("jauges_cuves", j);
  return { ok: true, jauge: res.row, pending: res.pending };
}

// ── Pistolets / Pompes dynamiques ──
export async function savePistolet(pist) {
  const ref = await getLocalRef();
  const station = (ref.stations || []).find((s) => s.id === pist.station_id || s.code === pist.station_code) || { id: pist.station_id || "st-hann", code: pist.station_code || "HANN" };
  const row = {
    id: pist.id || `${station.id}-${String(pist.code).toLowerCase()}`,
    station_id: station.id,
    station_code: station.code,
    code: String(pist.code).toLowerCase(),
    produit: pist.produit || "GASOIL",
    ordre: pist.ordre || ((ref.pistolets || []).length + 1),
    actif: pist.actif !== false,
  };
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from("pistolets").upsert(row, { onConflict: "station_id,code" });
    } catch {}
  }
  ref.pistolets = [...(ref.pistolets || []).filter((p) => !(p.station_id === row.station_id && p.code === row.code)), row];
  await setLocalRef(ref);
  return { ok: true, pistolet: row };
}


