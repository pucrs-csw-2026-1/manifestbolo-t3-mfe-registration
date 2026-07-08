// Talks to the registration service (manifestbolo-t2-registration). Requests go
// through this app's own origin at "/api" — proxied server-to-server by
// vite.config.ts — since the backend sends no CORS headers and can't be
// modified. Using import.meta.url (rather than a relative path) keeps the
// origin correct even when this module is loaded as a Module Federation remote
// inside the shell's page. Same pattern as eloo-auth-mfe's authApi.ts.
const API_BASE = `${new URL(import.meta.url).origin}/api`;

export interface AuthOptions {
  accessToken?: string | null;
}

function authHeaders(accessToken?: string | null): HeadersInit | undefined {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

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

export interface UserRegistration {
  registrationId?: string;
  id?: string;
  eventId: string;
  activityId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  registeredAt?: string | null;
  confirmedAt?: string | null;
  eventName?: string | null;
  eventTitle?: string | null;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venue?: string | null;
  city?: string | null;
  event?: Partial<AvailableEvent> | null;
}

// GET /users/{user_id}/registrations — authenticated user registrations.
// The T2 contract may include denormalized event fields; the page also tolerates
// a compact response with only eventId/status.
export async function listUserRegistrations(
  userId: string,
  options: AuthOptions = {},
): Promise<UserRegistration[]> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/registrations`,
    { headers: authHeaders(options.accessToken) },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as UserRegistration[];
}

// Mirrors o response camelCase (alias Pydantic) do novo endpoint público do T2
// GET /events/{event_id}/activities — atividades de um evento do events-service
// enriquecidas com a contagem local de inscritos do T2.
export interface EventActivity {
  activityId: string;
  title: string;
  description: string | null;
  type: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  registrationDeadline: string | null;
  thumbnailUrl: string | null;
  maxCapacity: number | null;
  registeredCount: number;
  availableSlots: number | null;
  workloadMinutes: number;
  category: string | null;
  language: string | null;
}

// GET /events/{event_id}/activities — público (sem auth do usuário; o T2 se
// autentica como serviço no events-service). 404 se o evento não existir.
export async function listEventActivities(
  eventId: string,
): Promise<EventActivity[]> {
  const response = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/activities`,
  );
  console.log(response)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as EventActivity[];
}
