import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import EventsListPage from "./pages/EventsListPage";
import EventActivitiesPage from "./pages/EventActivitiesPage";
import MyRegistrationsPage from "./pages/MyRegistrationsPage";

// Standalone router — only used when this app runs on its own dev/preview
// server. When mounted as a Module Federation remote inside the shell, the
// shell imports the exposed pages directly (see vite.config.ts `exposes`) and
// this App component isn't used at all.

// Wrapper para poder usar useNavigate (App já está dentro do BrowserRouter
// montado em main.tsx).
function EventsListRoute() {
  const navigate = useNavigate();
  return (
    <EventsListPage
      onOpenEvent={(eventId) => navigate(`/events/${eventId}/atividades`)}
      onOpenRegistrations={() => navigate("/inscricoes")}
    />
  );
}

function MyRegistrationsRoute() {
  const navigate = useNavigate();
  return (
    <MyRegistrationsPage
      onBack={() => navigate("/")}
      onOpenEvent={(eventId) => navigate(`/events/${eventId}/atividades`)}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EventsListRoute />} />
      {/* eventId é lido de useParams dentro da página; onBack volta à lista */}
      <Route path="/events/:eventId/atividades" element={<EventActivitiesPage />} />
      <Route path="/inscricoes" element={<MyRegistrationsRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
