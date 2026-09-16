import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Historique from "./pages/Historique";
import Rapport from "./pages/Rapport";
import Stocks from "./pages/Stocks";
import Finance from "./pages/Finance";
import Pistolets from "./pages/Pistolets";
import Pompistes from "./pages/Pompistes";
import Parametres from "./pages/Parametres";

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/historique" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "comptable"]}><Historique /></RequireRole>} />
        <Route path="/rapport" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur"]}><Rapport /></RequireRole>} />
        <Route path="/stocks" element={<RequireRole roles={["admin", "gerant", "superviseur", "directeur", "comptable"]}><Stocks /></RequireRole>} />
        <Route path="/finance" element={<RequireRole roles={["admin", "superviseur", "directeur", "comptable"]}><Finance /></RequireRole>} />
        <Route path="/pistolets" element={<RequireRole roles={["admin", "superviseur", "directeur", "gerant"]}><Pistolets /></RequireRole>} />
        <Route path="/pompistes" element={<RequireRole roles={["admin", "superviseur", "directeur", "gerant"]}><Pompistes /></RequireRole>} />
        <Route path="/parametres" element={<RequireRole roles={["admin", "directeur"]}><Parametres /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
