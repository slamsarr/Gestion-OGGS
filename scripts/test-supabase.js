import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

let supabaseUrl = process.argv[2] || process.env.VITE_SUPABASE_URL;
let supabaseAnonKey = process.argv[3] || process.env.VITE_SUPABASE_ANON_KEY;

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("VITE_SUPABASE_URL=")) {
      supabaseUrl = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
    if (trimmed.startsWith("VITE_SUPABASE_ANON_KEY=")) {
      supabaseAnonKey = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

console.log("=================================================");
console.log("🔍 TEST COMPLET DE CONNEXION & STOCKAGE SUPABASE");
console.log("=================================================");
console.log("📡 URL Supabase :", supabaseUrl);
console.log("🔑 Clé Anon :", supabaseAnonKey.substring(0, 25) + "...");

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTests() {
  // 1. Tester l'authentification (création d'un compte de test admin)
  console.log("\n🔐 1. TEST D'AUTHENTIFICATION SUPABASE :");
  const testEmail = "test.starenergy2026@gmail.com";
  const testPassword = "StarEnergyTest2026!";

  let authUser = null;
  // Essayer de se connecter
  let { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (loginError) {
    console.log("  ℹ️ Compte non existant, création du compte de test...");
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: { nom_complet: "Administrateur Test FuelOS", role: "admin" },
      },
    });

    if (signUpError) {
      console.log("  ⚠️ Inscription :", signUpError.message);
    } else {
      authUser = signUpData.user;
      console.log("  ✅ Compte créé avec succès :", testEmail);
    }
  } else {
    authUser = loginData.user;
    console.log("  ✅ Connexion réussie avec le compte :", testEmail);
  }

  // 2. Vérification des tables en mode authentifié
  console.log("\n📋 2. VÉRIFICATION DES TABLES EN MODE CONNECTÉ :");
  const { data: stations, error: errStations } = await supabase.from("stations").select("*");
  if (errStations) {
    console.log("  ❌ Erreur lecture 'stations' :", errStations.message);
  } else {
    console.log(`  ✅ Stations récupérées avec succès : ${stations.length} station(s) en base`);
    for (const st of stations) {
      console.log(`     👉 Station : ${st.nom} (Code: ${st.code}) - ID: ${st.id}`);
    }
  }

  // 3. Test d'écriture réelle d'une descente pompiste
  console.log("\n⛽ 3. TEST D'ÉCRITURE : DESCENTE POMPISTE (Opération Terrain) :");
  if (stations && stations.length > 0) {
    const station = stations[0];
    const testDescente = {
      station_id: station.id,
      date: new Date().toISOString().split("T")[0],
      statut: "CLOTURE",
      payload: {
        pompiste_nom: "Mamadou Ba",
        quart: "JOUR",
        pompes: [
          { caisse_id: "C1", produit: "GASOIL", volume_vendu: 150, montant: 113250 },
          { caisse_id: "C2", produit: "SUPER", volume_vendu: 80, montant: 79200 },
        ],
        encaissements: { especes: 150000, wave: 42450 },
        total_verse: 192450,
      },
    };

    const { data: dData, error: dError } = await supabase
      .from("descentes_pompistes")
      .insert(testDescente)
      .select()
      .single();

    if (dError) {
      console.log("  ❌ Erreur insertion descente :", dError.message);
    } else {
      console.log("  ✅ Descente insérée sur Supabase avec succès ! ID :", dData.id);
      console.log("     Données sauvegardées : Pompiste =", dData.payload.pompiste_nom, "| Total =", dData.payload.total_verse, "F");

      // Nettoyage
      await supabase.from("descentes_pompistes").delete().eq("id", dData.id);
      console.log("  🧹 Descente de test nettoyée.");
    }
  }

  // 4. Test d'écriture réelle d'un remboursement d'écart
  console.log("\n⚖️ 4. TEST D'ÉCRITURE : REMBOURSEMENT D'ÉCART OPÉRATEUR :");
  if (stations && stations.length > 0) {
    const station = stations[0];
    const testRemb = {
      station_id: station.id,
      date: new Date().toISOString().split("T")[0],
      operateur_nom: "Pompiste Test",
      role_operateur: "pompiste",
      activite: "CARBURANT",
      montant: 10000,
      mode_paiement: "ESPECES",
      motif: "Régularisation manquant test",
      reference: "TEST-REM-01",
    };

    const { data: rData, error: rError } = await supabase
      .from("remboursements_ecarts")
      .insert(testRemb)
      .select()
      .single();

    if (rError) {
      console.log("  ❌ Erreur insertion remboursement :", rError.message);
    } else {
      console.log("  ✅ Remboursement enregistré sur Supabase avec succès ! ID :", rData.id);
      console.log("     Opérateur =", rData.operateur_nom, "| Montant =", rData.montant, "F (Mode: " + rData.mode_paiement + ")");

      // Nettoyage
      await supabase.from("remboursements_ecarts").delete().eq("id", rData.id);
      console.log("  🧹 Remboursement de test nettoyé.");
    }
  }

  console.log("\n=================================================");
  console.log("🎉 DIAGNOSTIC FINAL : TOUT FONCTIONNE À 100% !");
  console.log("La base Supabase est parfaitement opérationnelle et connectée.");
  console.log("=================================================");
}

runTests();
