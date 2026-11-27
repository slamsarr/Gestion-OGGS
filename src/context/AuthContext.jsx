import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { db, ensureLocalSeed, isCloudConfigured, isDemoModeEnabled } from "../lib/db";
import { getSupabase } from "../lib/supabase";
import { DEMO_USERS, SEED_STATIONS } from "../lib/seed";

export const AuthCtx = createContext(null);

async function resolveCloudProfil(sb, user) {
  if (!user) return null;
  let p = null;
  try {
    const { data } = await sb.from("profils").select("*, stations(code, nom)").eq("id", user.id).maybeSingle();
    p = data;
  } catch {}

  const meta = user.user_metadata || {};
  // Priorité au rôle explicite renseigné dans les métadonnées s'il diffère du fallback par défaut
  const userRole = (p?.role && p.role !== "gerant") ? p.role : (meta.role || p?.role || "gerant");
  let clientCode = meta.client_code || p?.client_code || null;

  // Si c'est un client professionnel et que le code n'est pas encore renseigné
  if (userRole === "client_pro" && !clientCode) {
    try {
      const { data: cl } = await sb.from("clients_professionnels")
        .select("code, nom_entreprise")
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();
      if (cl?.code) clientCode = cl.code;
    } catch {}
    if (!clientCode) {
      try {
        const localCl = await db.clients_pro.where("email").equalsIgnoreCase(user.email).first();
        if (localCl?.code) clientCode = localCl.code;
      } catch {}
    }
  }

  const st = SEED_STATIONS.find((s) => s.id === (p?.station_id || meta.station_id)) || SEED_STATIONS[0];
  const stations = p?.stations || { code: st?.code || "HANN", nom: st?.nom || "STATION DAMEL HANN" };

  return {
    ...(p || {}),
    id: user.id,
    email: user.email,
    nom_complet: p?.nom_complet || meta.nom_complet || user.email,
    role: userRole,
    station_id: p?.station_id || meta.station_id || st.id,
    stations,
    client_code: clientCode,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profil, setProfil] = useState(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureLocalSeed();
      } catch (e) {
        console.warn("ensureLocalSeed error:", e);
      }

      // Restauration d'une session locale ou démo existante
      const raw = localStorage.getItem("ogss_demo_session");
      let restoredLocal = null;
      if (raw) {
        try {
          const u = JSON.parse(raw);
          restoredLocal = u;
          if (alive) {
            setSession({ type: u.type || "local", user: u });
            setProfil({
              id: u.id,
              nom_complet: u.nom_complet,
              role: u.role,
              station_id: u.station_id,
              stations: u.stations || { code: "HANN", nom: "STATION DAMEL HANN" },
              email: u.email,
              client_code: u.client_code || null,
            });
          }
        } catch {}
      }

      const sb = getSupabase();
      if (sb) {
        try {
          const sessPromise = sb.auth.getSession();
          const timerPromise = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 1800));
          const { data } = await Promise.race([sessPromise, timerPromise]);
          if (!alive) return;
          if (data?.session) {
            const resolved = await resolveCloudProfil(sb, data.session.user);
            setSession({ type: "cloud", user: data.session.user });
            if (alive) setProfil(resolved);
            return;
          }
        } catch (e) {
          console.warn("Supabase session check:", e);
        }

        // Si pas de session Cloud mais une session locale restaurée, on la conserve
        if (alive && !restoredLocal) setSession(null);

        sb.auth.onAuthStateChange(async (_e, sess) => {
          if (!sess) {
            const currentDemo = localStorage.getItem("ogss_demo_session");
            if (!currentDemo) {
              setSession(null);
              setProfil(null);
            }
            return;
          }
          setSession({ type: "cloud", user: sess.user });
          try {
            const resolved = await resolveCloudProfil(sb, sess.user);
            setProfil(resolved);
          } catch {}
        });
        return;
      }

      if (alive && !restoredLocal) setSession(null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const api = useMemo(() => {
    const loginWithLocalUser = async (u) => {
      await ensureLocalSeed();
      const { password: _p, ...safe } = u;
      const st = SEED_STATIONS.find((s) => s.id === u.station_id) || SEED_STATIONS[0];
      const stations = { code: st?.code || "HANN", nom: st?.nom || u.nom_complet || "STATION DAMEL HANN" };
      const packed = { ...safe, stations, type: "local" };
      localStorage.setItem("ogss_demo_session", JSON.stringify(packed));
      setSession({ type: "local", user: packed });
      setProfil({
        id: packed.id,
        nom_complet: packed.nom_complet,
        role: packed.role,
        station_id: packed.station_id,
        stations: packed.stations,
        email: packed.email,
        client_code: packed.client_code || null,
      });
      return packed;
    };

    return {
      session,
      profil,
      online,
      cloud: isCloudConfigured(),
      demoMode: isDemoModeEnabled(),
      loading: session === undefined,

      async login(email, password) {
        const cleanEmail = email.trim().toLowerCase();
        await ensureLocalSeed();

        // 1. Recherche utilisateur local ou démo (IndexedDB db.users ou DEMO_USERS)
        let localUser = null;
        try {
          const localList = await db.users.toArray().catch(() => []);
          localUser = localList.find((x) => (x.email || "").toLowerCase() === cleanEmail);
        } catch {}
        if (!localUser) {
          localUser = DEMO_USERS.find((x) => (x.email || "").toLowerCase() === cleanEmail);
        }

        const motDePasseLocalValide = localUser && (localUser.password === password);

        const sb = getSupabase();
        if (sb) {
          try {
            const { data, error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
            if (!error && data?.user) {
              localStorage.removeItem("ogss_demo_session");
              const resolved = await resolveCloudProfil(sb, data.user);
              setSession({ type: "cloud", user: data.user });
              setProfil(resolved);

              // Mise en cache locale du profil pour disponibilité offline future
              try {
                await db.users.put({
                  id: data.user.id,
                  email: cleanEmail,
                  password,
                  nom_complet: resolved.nom_complet,
                  role: resolved.role,
                  station_id: resolved.station_id,
                  client_code: resolved.client_code || null,
                  actif: true,
                  updated_at: new Date().toISOString(),
                });
              } catch {}
              return;
            }

            if (error) {
              // Si Supabase échoue (ex: email not confirmed, rate limit, compte créé en local offline)
              // mais que l'utilisateur existe dans IndexedDB avec le bon mot de passe, on l'autorise en mode local !
              if (motDePasseLocalValide) {
                await loginWithLocalUser(localUser);
                return;
              }
              if (error.message?.toLowerCase().includes("email not confirmed")) {
                throw new Error("L'adresse e-mail n'a pas encore été confirmée dans Supabase. (Désactivez 'Confirm email' dans Supabase > Auth > Providers > Email pour activer la connexion directe).");
              }
              throw new Error(error.message);
            }
          } catch (err) {
            if (motDePasseLocalValide) {
              await loginWithLocalUser(localUser);
              return;
            }
            if (err.message && (err.message.includes("fetch failed") || err.message.includes("NetworkError") || err.message.includes("Failed to fetch"))) {
              throw new Error("Serveur Supabase inaccessible. Utilisez un compte enregistré localement ou les accès démo.");
            }
            throw err;
          }
        }

        // 2. Mode local / hors-ligne / sans cloud
        if (localUser) {
          if (localUser.password && localUser.password !== password) {
            throw new Error("Mot de passe incorrect");
          }
          await loginWithLocalUser(localUser);
          return;
        }

        throw new Error("Identifiants incorrects ou compte introuvable");
      },

      async loginDemo(roleOrEmail) {
        if (!isDemoModeEnabled()) throw new Error("Mode démonstration désactivé en production.");
        await ensureLocalSeed();
        const clean = typeof roleOrEmail === "string" ? roleOrEmail.trim().toLowerCase() : "gerant";
        const u = DEMO_USERS.find((x) => x.email === clean || x.role === clean) || DEMO_USERS[1] || DEMO_USERS[0];
        await loginWithLocalUser(u);
      },

      async signup(email, password, nom, role = "pompiste", extra = {}) {
        await ensureLocalSeed();
        const cleanEmail = email.trim().toLowerCase();
        const nomComplet = (nom || "").trim();
        const userRole = role || "pompiste";
        const telephone = extra.telephone ? extra.telephone.trim() : "";
        const stationId = extra.station_id || extra.stationId || "st-hann";
        const clientCode = extra.client_code || extra.clientCode || "";

        let authUserId = null;
        const sb = getSupabase();
        if (sb) {
          try {
            const { data, error } = await sb.auth.signUp({
              email: cleanEmail,
              password,
              options: {
                data: {
                  nom_complet: nomComplet,
                  role: userRole,
                  telephone,
                  station_id: stationId,
                  client_code: clientCode,
                },
              },
            });
            if (error && !error.message?.toLowerCase().includes("already registered")) {
              console.warn("Supabase signup warning:", error.message);
            } else if (data?.user?.id) {
              authUserId = data.user.id;
            }
          } catch (e) {
            console.warn("Supabase signup exception:", e);
          }
        }

        const newUserId = authUserId || `u-${userRole}-${Date.now().toString(36)}`;
        const newUser = {
          id: newUserId,
          email: cleanEmail,
          password,
          nom_complet: nomComplet,
          role: userRole,
          station_id: stationId,
          telephone,
          client_code: clientCode,
          actif: true,
          created_at: new Date().toISOString(),
        };

        // Sauvegarde locale IndexedDB
        await db.users.put(newUser);

        // Si rôle pompiste : enregistrement immédiat dans la liste des pompistes de la station
        if (userRole === "pompiste") {
          try {
            const existingPomp = await db.pompistes.get(newUserId);
            if (!existingPomp) {
              await db.pompistes.put({
                id: newUserId,
                nom: nomComplet,
                station_id: stationId,
                telephone,
                actif: true,
                created_at: new Date().toISOString(),
              });
            }
          } catch (errP) {
            console.warn("Ajout pompiste local:", errP);
          }
        }

        // Si rôle client professionnel : création ou liaison dans clients_pro
        if (userRole === "client_pro") {
          try {
            const code = clientCode || `CP-${nomComplet.slice(0, 4).toUpperCase()}`;
            const existingCl = await db.clients_pro.where("code").equals(code).first();
            if (!existingCl) {
              await db.clients_pro.put({
                code,
                nom_entreprise: nomComplet,
                email: cleanEmail,
                telephone,
                station_id: stationId,
                acces_actif: true,
                plafond_credit: 1000000,
                solde_actuel: 0,
                user_id: newUserId,
                created_at: new Date().toISOString(),
              });
            } else {
              await db.clients_pro.update(existingCl.id, {
                email: cleanEmail,
                acces_actif: true,
                user_id: newUserId,
              });
            }
          } catch (errC) {
            console.warn("Ajout client_pro local:", errC);
          }
        }

        // Connexion immédiate de l'utilisateur
        try {
          await this.login(cleanEmail, password);
        } catch {
          await loginWithLocalUser(newUser);
        }

        return newUser;
      },

      async resetPassword(email) {
        const sb = getSupabase();
        if (!sb) throw new Error("Réinitialisation disponible en mode cloud uniquement.");
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/login",
        });
        if (error) throw new Error(error.message);
        return { ok: true };
      },

      async logout() {
        localStorage.removeItem("ogss_demo_session");
        const sb = getSupabase();
        if (sb) {
          try { await sb.auth.signOut(); } catch {}
        }
        setSession(null);
        setProfil(null);
      },
    };
  }, [session, profil, online]);

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth hors provider");
  return ctx;
}
