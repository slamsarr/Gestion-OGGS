import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Historique from "./pages/Historique";
import Rapport from "./pages/Rapport";
import Stocks from "./pages/Stocks";
import Finance from "./pages/Finance";
import Depenses from "./pages/Depenses";
import ClientsPro from "./pages/ClientsPro";
import Fournisseurs from "./pages/Fournisseurs";
import Pistolets from "./pages/Pistolets";
import Pompistes from "./pages/Pompistes";
import Parametres from "./pages/Parametres";
import DescentePompiste from "./pages/DescentePompiste";
import Lavage from "./pages/Lavage";
import Boutique from "./pages/Boutique";
import CuvesCarburant from "./pages/CuvesCarburant";
import Maintenance from "./pages/Maintenance";

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <p className="p-8 text-center text-sm text-gray-500">Chargement…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { profil } = useAuth();
  const role = profil?.role || "gerant";
  if (!roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

// Redirection d'accueil selon le métier opérationnel réel (§37)
function HomeRouter() {
  const { profil } = useAuth();
  const role = profil?.role || "gerant";
  if (role === "pompiste") return <Navigate to="/descente" replace />;
  if (role === "lavage") return <Navigate to="/lavage" replace />;
  if (role === "boutique") return <Navigate to="/boutique" replace />;
  if (role === "stock") return <Navigate to="/cuves" replace />;
  if (role === "maintenance") return <Navigate to="/maintenance" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRouter />} />
        {/* Modules opérationnels terrain §37 */}
        <Route path="/descente" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "pompiste"]}><DescentePompiste /></RequireRole>} />
        <Route path="/lavage" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "lavage"]}><Lavage /></RequireRole>} />
        <Route path="/boutique" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "boutique", "stock"]}><Boutique /></RequireRole>} />
        <Route path="/cuves" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "stock"]}><CuvesCarburant /></RequireRole>} />
        <Route path="/maintenance" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "maintenance"]}><Maintenance /></RequireRole>} />

        {/* Modules de gestion & pilotage */}
        <Route path="/historique" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "comptable"]}><Historique /></RequireRole>} />
        <Route path="/rapport" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur"]}><Rapport /></RequireRole>} />
        <Route path="/stocks" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "comptable", "stock"]}><Stocks /></RequireRole>} />
        <Route path="/finance" element={<RequireRole roles={["admin", "superviseur", "directeur", "comptable"]}><Finance /></RequireRole>} />
        <Route path="/depenses" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "comptable"]}><Depenses /></RequireRole>} />
        <Route path="/clients-pro" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "comptable"]}><ClientsPro /></RequireRole>} />
        <Route path="/fournisseurs" element={<RequireRole roles={["admin", "superviseur", "directeur", "comptable"]}><Fournisseurs /></RequireRole>} />
        <Route path="/pistolets" element={<RequireRole roles={["admin", "superviseur", "directeur", "gerant"]}><Pistolets /></RequireRole>} />
        <Route path="/pompistes" element={<RequireRole roles={["admin", "superviseur", "directeur", "gerant"]}><Pompistes /></RequireRole>} />
        <Route path="/parametres" element={<RequireRole roles={["admin", "directeur"]}><Parametres /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
