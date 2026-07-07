// Talks to the registration service (manifestbolo-t2-registration). Requests go
// through this app's own origin at "/api" — proxied server-to-server by
// vite.config.ts — since the backend sends no CORS headers and can't be
// modified. Using import.meta.url (rather than a relative path) keeps the
// origin correct even when this module is loaded as a Module Federation remote
// inside the shell's page. Same pattern as eloo-auth-mfe's authApi.ts.
const API_BASE = `${new URL(import.meta.url).origin}/api`;

// Mirrors AvailableEventResponse (camelCase via Pydantic alias) from
// registration/schemas.py. Fields below `availableSlots` are the descriptive
// data the T2 service forwards from the events-service for the listing UI.
export interface AvailableEvent {
  eventId: string;
  name: string;
  maxCapacity: number;
  registeredCount: number;
  availableSlots: number;
  description: string | null;
  category: string | null;
  startsAt: string | null;
  endsAt: string | null;
  registrationDeadline: string | null;
  venue: string | null;
  city: string | null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((issue: { msg?: string }) => issue.msg)
        .filter(Boolean)
        .join(" ");
    }
  } catch {
    // no JSON body to read
  }
  return "Não foi possível carregar os eventos. Tente novamente.";
}

// GET /events/available — public (no auth): only events that are still open
// (future/ongoing) and have free slots. See registration/controller.py.
export async function listAvailableEvents(): Promise<AvailableEvent[]> {
  const response = await fetch(`${API_BASE}/events/available`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as AvailableEvent[];
}
