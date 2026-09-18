import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ensureLocalSeed, isCloudConfigured, isDemoModeEnabled } from "../lib/db";
import { getSupabase } from "../lib/supabase";
import { DEMO_USERS, SEED_STATIONS } from "../lib/seed";

export const AuthCtx = createContext(null);

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
      const raw = localStorage.getItem("ogss_demo_session");
      if (raw && isDemoModeEnabled()) {
        try {
          const u = JSON.parse(raw);
          if (alive) {
            setSession({ type: "demo", user: u });
            setProfil({ id: u.id, nom_complet: u.nom_complet, role: u.role, station_id: u.station_id, stations: u.stations, email: u.email });
          }
          return;
        } catch {}
      } else if (raw && !isDemoModeEnabled()) {
        localStorage.removeItem("ogss_demo_session");
      }
      const sb = getSupabase();
      if (sb) {
        try {
          const sessPromise = sb.auth.getSession();
          const timerPromise = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 1500));
          const { data } = await Promise.race([sessPromise, timerPromise]);
          if (!alive) return;
          if (data?.session) {
            setSession({ type: "cloud", user: data.session.user });
            const { data: p } = await sb.from("profils").select("*, stations(code, nom)").eq("id", data.session.user.id).maybeSingle();
            if (alive) setProfil(p);
            return;
          }
        } catch (e) {
          console.warn("Supabase session check:", e);
        }
        if (alive) setSession(null);
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
            const { data: p } = await sb.from("profils").select("*, stations(code, nom)").eq("id", sess.user.id).maybeSingle();
            setProfil(p);
          } catch {}
        });
        return;
      }
      if (alive) setSession(null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const api = useMemo(() => ({
    session,
    profil,
    online,
    cloud: isCloudConfigured(),
    demoMode: isDemoModeEnabled(),
    loading: session === undefined,
    async login(email, password) {
      const cleanEmail = email.trim().toLowerCase();
      const demoUser = isDemoModeEnabled() ? DEMO_USERS.find((x) => x.email === cleanEmail) : null;
      if (demoUser) {
        if (demoUser.password !== password) throw new Error("Mot de passe démo incorrect");
        await ensureLocalSeed();
        const { password: _p, ...safe } = demoUser;
        const st = SEED_STATIONS.find((s) => s.id === demoUser.station_id);
        const stations = { code: st?.code || null, nom: st?.nom || demoUser.nom_complet };
        const packed = { ...safe, stations };
        localStorage.setItem("ogss_demo_session", JSON.stringify(packed));
        setSession({ type: "demo", user: packed });
        setProfil({ id: packed.id, nom_complet: packed.nom_complet, role: packed.role, station_id: packed.station_id, stations: packed.stations, email: packed.email });
        return;
      }

      const sb = getSupabase();
      if (sb) {
        try {
          const { data, error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
          if (error) throw new Error(error.message);
          let p = null;
          try {
            const res = await sb.from("profils").select("*, stations(code, nom)").eq("id", data.user.id).maybeSingle();
            p = res.data;
          } catch {}
          localStorage.removeItem("ogss_demo_session");
          setSession({ type: "cloud", user: data.user });
          setProfil(p || { id: data.user.id, email: data.user.email, role: "gerant", nom_complet: data.user.email });
          return;
        } catch (err) {
          if (err.message && (err.message.includes("fetch failed") || err.message.includes("NetworkError") || err.message.includes("Failed to fetch"))) {
            throw new Error("Serveur Supabase inaccessible. Utilisez les boutons de connexion démo ci-dessous pour tester l'application.");
          }
          throw err;
        }
      }
      throw new Error("Identifiants incorrects ou compte introuvable");
    },
    async loginDemo(roleOrEmail) {
      if (!isDemoModeEnabled()) throw new Error("Mode démonstration désactivé en production.");
      await ensureLocalSeed();
      const clean = typeof roleOrEmail === "string" ? roleOrEmail.trim().toLowerCase() : "gerant";
      const u = DEMO_USERS.find((x) => x.email === clean || x.role === clean) || DEMO_USERS[1] || DEMO_USERS[0];
      const { password: _p, ...safe } = u;
      const st = SEED_STATIONS.find((s) => s.id === u.station_id);
      const stations = { code: st?.code || null, nom: st?.nom || u.nom_complet };
      const packed = { ...safe, stations };
      localStorage.setItem("ogss_demo_session", JSON.stringify(packed));
      setSession({ type: "demo", user: packed });
      setProfil({ id: packed.id, nom_complet: packed.nom_complet, role: packed.role, station_id: packed.station_id, stations: packed.stations, email: packed.email });
    },
    async signup(email, password, nom) {
      const sb = getSupabase();
      if (!sb) throw new Error("Inscription disponible une fois Supabase configuré. En démo, utilisez les comptes fournis.");
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nom_complet: nom } } });
      if (error) throw new Error(error.message);
      return data;
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
  }), [session, profil, online]);

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth hors provider");
  return ctx;
}
