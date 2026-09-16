import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { T } from "../lib/calcul";
import { flushQueue, listNotifications, marquerNotificationLue, getParametres } from "../lib/api";
import { db } from "../lib/db";
import { ROLE_LABELS } from "../lib/permissions";

const LINKS = [
  { to: "/", label: "Réseau", roles: ["superviseur", "directeur", "comptable", "gerant", "admin"] },
  { to: "/historique", label: "Historique", roles: ["superviseur", "directeur", "comptable", "gerant", "admin"] },
  { to: "/rapport", label: "Rapport", roles: ["gerant", "superviseur", "directeur", "admin"] },
  { to: "/stocks", label: "Stocks", roles: ["gerant", "superviseur", "directeur", "comptable", "admin"] },
  { to: "/finance", label: "Finance", roles: ["superviseur", "directeur", "comptable", "admin"] },
  { to: "/pistolets", label: "Pistolets", roles: ["superviseur", "directeur", "gerant", "admin"] },
  { to: "/pompistes", label: "Pompistes", roles: ["superviseur", "directeur", "gerant", "admin"] },
  { to: "/parametres", label: "Paramètres", roles: ["directeur", "admin"] },
];

export default function Layout() {
  const { profil, logout, online, cloud } = useAuth();
  const navigate = useNavigate();
  const role = profil?.role || "gerant";
  const links = LINKS.filter((l) => l.roles.includes(role));
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [nomReseau, setNomReseau] = useState("OGSS Réseau");
  const unread = notifs.filter((n) => !n.lu).length;

  useEffect(() => {
    let alive = true;
    getParametres().then((p) => { if (alive && p?.nom_reseau) setNomReseau(p.nom_reseau); }).catch(() => {});
    return () => { alive = false; };
  }, [cloud]);

  // Check pending queue count
  useEffect(() => {
    const check = async () => {
      try { const count = await db.queue.count(); setPending(count); } catch {}
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    const syncOnline = async () => {
      if (!navigator.onLine) return;
      try {
        const { flushed } = await flushQueue();
        if (flushed > 0) {
          setSyncMsg(`${flushed} rapport(s) synchronisé(s)`);
          setPending((p) => Math.max(0, p - flushed));
          setTimeout(() => setSyncMsg(""), 4000);
        }
      } catch {}
    };
    window.addEventListener("online", syncOnline);
    syncOnline(); // also try on mount
    return () => window.removeEventListener("online", syncOnline);
  }, []);

  useEffect(() => {
    if (!cloud) return undefined;
    const load = async () => {
      try { setNotifs(await listNotifications()); } catch { /* hors ligne */ }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [cloud]);

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-30" style={{ background: T.petrol, color: "white" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{nomReseau}</div>
            <div className="text-xs opacity-80">
              {profil?.nom_complet} · {ROLE_LABELS[role] || role}
              {profil?.stations?.nom ? ` · ${profil.stations.nom}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: online ? T.ok : T.alert }}>
              {online ? "En ligne" : "Hors ligne"}
              {pending > 0 && <span className="bg-white text-xs px-1 rounded-full" style={{ color: T.alert }}>{pending}</span>}
            </span>
            <span className="opacity-80">{cloud ? "Cloud" : "Démo locale"}</span>
            {cloud && (
              <div className="relative">
                <button
                  type="button"
                  className="px-2 py-1 rounded border"
                  style={{ borderColor: "rgba(255,255,255,.35)" }}
                  onClick={() => setShowNotifs((v) => !v)}
                >
                  Alertes{unread > 0 ? ` (${unread})` : ""}
                </button>
                {showNotifs && (
                  <div className="absolute right-0 mt-1 w-72 rounded shadow-lg text-left p-2 z-40" style={{ background: "white", color: T.ink }}>
                    {notifs.length === 0 && <div className="text-xs p-2" style={{ color: T.muted }}>Aucune alerte</div>}
                    {notifs.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="block w-full text-left text-xs p-2 rounded mb-1"
                        style={{ background: n.lu ? T.paper : "#FFF6E5" }}
                        onClick={async () => {
                          await marquerNotificationLue(n.id);
                          setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
                        }}
                      >
                        <div className="font-medium">{n.titre}</div>
                        <div style={{ color: T.muted }}>{n.message}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              className="px-2 py-1 rounded border"
              style={{ borderColor: "rgba(255,255,255,.35)" }}
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Quitter
            </button>
          </div>
        </div>
        {syncMsg && (
          <div className="max-w-5xl mx-auto px-4 pb-2">
            <div className="text-xs px-2 py-1 rounded" style={{ background: "rgba(29,143,91,.3)" }}>✓ {syncMsg}</div>
          </div>
        )}
        <nav className="max-w-5xl mx-auto px-2 flex overflow-x-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) => `px-3 py-2 text-sm whitespace-nowrap ${isActive ? "font-semibold" : "opacity-75"}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-4 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
