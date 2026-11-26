import * as ftp from "basic-ftp";
import path from "path";
import fs from "fs";

async function deploy() {
  const rawHost = process.env.HOSTINGER_FTP_SERVER || process.env.FTP_SERVER;
  const user = process.env.HOSTINGER_FTP_USER || process.env.FTP_USER;
  const password = process.env.HOSTINGER_FTP_PASSWORD || process.env.FTP_PASSWORD;

  if (!rawHost || !user || !password) {
    console.log("ℹ️ Secrets FTP non configurés ou incomplets. Déploiement ignoré.");
    return;
  }

  // Nettoyage de l'hôte (suppression de ftp://, http://, ports ou slashes)
  const host = rawHost.replace(/^[a-zA-Z]+:\/\//, "").replace(/\/.*$/, "").trim();

  console.log("==========================================");
  console.log("🚀 DÉPLOIEMENT AUTOMATIQUE HOSTINGER (FTP)");
  console.log("==========================================");
  console.log("📡 Serveur cible :", host);
  console.log("👤 Utilisateur   :", user);

  const distDir = path.resolve("dist");
  if (!fs.existsSync(distDir)) {
    console.error("❌ Le dossier 'dist' n'existe pas. Veuillez lancer 'npm run build' d'abord.");
    process.exit(1);
  }

  const client = new ftp.Client(30000); // 30s timeout
  // client.ftp.verbose = true;

  try {
    console.log("\n🔌 Connexion en cours au serveur Hostinger...");

    // Tentative 1 : FTPS sécurisé
    let connected = false;
    try {
      await client.access({
        host,
        user,
        password,
        port: 21,
        secure: "implicit" === false ? false : true,
        secureOptions: { rejectUnauthorized: false },
      });
      connected = true;
      console.log("✅ Connecté avec succès via FTPS sécurisé !");
    } catch (ftpsErr) {
      console.log("⚠️ FTPS non supporté (" + ftpsErr.message + "), tentative en FTP standard...");
      client.close();
      await client.access({
        host,
        user,
        password,
        port: 21,
        secure: false,
      });
      connected = true;
      console.log("✅ Connecté avec succès via FTP standard !");
    }

    // Détection du répertoire de destination
    console.log("\n📁 Analyse de la structure distante...");
    const rootList = await client.list();
    const hasPublicHtml = rootList.some((item) => item.name === "public_html" && item.isDirectory);

    let targetDir = "/";
    if (hasPublicHtml) {
      console.log("📂 Dossier 'public_html' détecté à la racine.");
      targetDir = "public_html";
    } else {
      console.log("📂 Vous êtes déjà connecté directement au dossier racine du site.");
    }

    console.log(`📤 Envoi des fichiers vers : ${targetDir}...`);
    await client.uploadFromDir(distDir, targetDir);

    console.log("\n🎉 DÉPLOIEMENT RÉUSSI À 100% SUR HOSTINGER !");
    console.log("🌐 Votre site est à jour sur https://fuelossn.com");
  } catch (err) {
    console.error("\n❌ ÉCHEC DU DÉPLOIEMENT FTP :");
    console.error("Détail de l'erreur :", err.message);

    if (err.message?.includes("530") || err.message?.includes("Login authentication failed") || err.message?.includes("User cannot log in")) {
      console.error("\n👉 VÉRIFICATION REQUISE :");
      console.error("Le nom d'utilisateur ou le mot de passe FTP est incorrect dans vos Secrets GitHub.");
      console.error("Allez dans GitHub > Settings > Secrets and variables > Actions et vérifiez HOSTINGER_FTP_USER et HOSTINGER_FTP_PASSWORD.");
    } else if (err.message?.includes("ENOTFOUND") || err.message?.includes("EAI_AGAIN") || err.message?.includes("ETIMEDOUT")) {
      console.error("\n👉 VÉRIFICATION REQUISE :");
      console.error("Impossible de joindre l'hôte FTP : '" + host + "'. Vérifiez HOSTINGER_FTP_SERVER dans vos Secrets GitHub (ex: ftp.fuelossn.com ou l'adresse IP de votre serveur).");
    }

    process.exit(1);
  } finally {
    client.close();
  }
}

deploy();
