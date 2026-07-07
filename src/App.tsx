import { Navigate, Route, Routes } from "react-router-dom";
import EventsListPage from "./pages/EventsListPage";

// Standalone router — only used when this app runs on its own dev/preview
// server. When mounted as a Module Federation remote inside the shell, the
// shell imports the exposed pages directly (see vite.config.ts `exposes`) and
// this App component isn't used at all.
export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <EventsListPage
            onOpenEvent={(eventId) => console.log("abrir evento", eventId)}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
