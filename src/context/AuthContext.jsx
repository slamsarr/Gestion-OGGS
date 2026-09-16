import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ensureLocalSeed, isCloudConfigured } from "../lib/db";
import { getSupabase } from "../lib/supabase";
import { DEMO_USERS, SEED_STATIONS } from "../lib/seed";

const AuthCtx = createContext(null);

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
      await ensureLocalSeed();
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.auth.getSession();
        if (!alive) return;
        if (data.session) {
          setSession({ type: "cloud", user: data.session.user });
          const { data: p } = await sb.from("profils").select("*, stations(code, nom)").eq("id", data.session.user.id).maybeSingle();
          if (alive) setProfil(p);
        } else {
          setSession(null);
        }
        sb.auth.onAuthStateChange(async (_e, sess) => {
          if (!sess) {
            setSession(null);
            setProfil(null);
            return;
          }
          setSession({ type: "cloud", user: sess.user });
          const { data: p } = await sb.from("profils").select("*, stations(code, nom)").eq("id", sess.user.id).maybeSingle();
          setProfil(p);
        });
        return;
      }
      const raw = localStorage.getItem("ogss_demo_session");
      if (raw) {
        const u = JSON.parse(raw);
        setSession({ type: "demo", user: u });
        setProfil({ id: u.id, nom_complet: u.nom_complet, role: u.role, station_id: u.station_id, stations: u.stations, email: u.email });
      } else setSession(null);
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
    loading: session === undefined,
    async login(email, password) {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        const { data: p } = await sb.from("profils").select("*, stations(code, nom)").eq("id", data.user.id).maybeSingle();
        setSession({ type: "cloud", user: data.user });
        setProfil(p);
        return;
      }
      await ensureLocalSeed();
      const u = DEMO_USERS.find((x) => x.email === email.trim().toLowerCase());
      if (!u || u.password !== password) throw new Error("Identifiants incorrects");
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
      const sb = getSupabase();
      if (sb) await sb.auth.signOut();
      localStorage.removeItem("ogss_demo_session");
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
