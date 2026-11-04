import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FullScreenSpinner } from "../ui/Feedback";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Settings and API keys are member-only; guests go back to the dashboard. */
export function RequireMember() {
  const { user } = useAuth();
  if (user?.is_guest) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
