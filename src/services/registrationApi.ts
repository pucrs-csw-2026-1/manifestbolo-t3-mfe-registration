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
  return "Algo deu errado. Tente novamente.";
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
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as EventActivity[];
}

// ---------------------------------------------------------------------------
// Autenticação — espelha a convenção do mfe-auth (mesma origin dentro do shell)
// ---------------------------------------------------------------------------
// O eloo-auth-mfe grava o token/perfil no localStorage após o login. Como o
// Module Federation roda o código deste remote dentro da página do shell (mesma
// origin), lemos as mesmas chaves. Mesmo padrão de eloo-shell/src/hooks/useAuth.ts.
const ACCESS_TOKEN_KEY = "mfeAuth.accessToken";
const REFRESH_TOKEN_KEY = "mfeAuth.refreshToken";
const PROFILE_KEY = "mfeAuth.profile";
const SESSION_EXPIRED_EVENT = "mfeAuth:sessionExpired";

// Subconjunto do perfil gravado pelo mfe-auth (já em camelCase). accessLevel é
// o "papel" do usuário (PARTICIPANT/MANAGER/ADMIN).
export interface AuthProfile {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  accessLevel: "PARTICIPANT" | "MANAGER" | "ADMIN";
  isActive: boolean;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getProfile(): AuthProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthProfile>;
    if (!parsed || typeof parsed.id !== "string") return null;
    return parsed as AuthProfile;
  } catch {
    return null;
  }
}

// Limpa a sessão e avisa o shell (que escuta o evento e redireciona para /login).
function notifySessionExpired(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

// fetch autenticado: injeta o Bearer e trata 401 (sessão expirada) de forma
// central. Os endpoints de escrita do T2 exigem `Authorization: Bearer <jwt>`.
async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Faça login para se inscrever.");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 401) {
    notifySessionExpired();
    throw new Error("Sua sessão expirou. Faça login novamente.");
  }
  return response;
}

// ---------------------------------------------------------------------------
// Inscrição — POSTs reais no T2 (persistem no Postgres do serviço de registro)
// ---------------------------------------------------------------------------

// Status de uma inscrição de evento (enum RegistrationStatus do T2).
export type RegistrationStatus = "REGISTERED" | "CONFIRMED" | "CANCELLED";

// Resposta de POST /events/{eventId}/guests (GuestRegistrationResponse). Em
// dev/demo o T2 devolve o confirmationId/confirmationToken só na criação — o
// token de 8 chars faz o papel do "e-mail" de confirmação.
export interface EventRegistration {
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  confirmationId: string | null;
  confirmationToken: string | null;
}

// POST /events/{eventId}/guests — inscreve o usuário logado no evento macro.
// 409 = já inscrito; 422 = evento encerrado/lotado.
export async function registerEvent(
  eventId: string,
  userId: string,
): Promise<EventRegistration> {
  const response = await authFetch(
    `/events/${encodeURIComponent(eventId)}/guests`,
    { method: "POST", body: JSON.stringify({ userId }) },
  );
  if (!response.ok) {
    throw new RegistrationError(
      await readErrorMessage(response),
      response.status,
    );
  }
  return (await response.json()) as EventRegistration;
}

// POST /events/confirmation/{confirmationId} — valida o token (case-sensitive!).
// Endpoint público. 400 = token inválido; 410 = expirado.
export async function confirmEventRegistration(
  confirmationId: string,
  token: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/events/confirmation/${encodeURIComponent(confirmationId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    },
  );
  if (!response.ok) {
    throw new RegistrationError(
      await readErrorMessage(response),
      response.status,
    );
  }
}

// POST /activities/registrations — inscreve o usuário logado numa atividade.
// Sem código de confirmação (o T2 não gera um para atividades). 409 = já inscrito.
export async function registerActivity(
  activityId: string,
  userId: string,
  eventId: string,
): Promise<void> {
  const response = await authFetch(`/activities/registrations`, {
    method: "POST",
    body: JSON.stringify({ activityId, userId, eventId }),
  });
  if (!response.ok) {
    throw new RegistrationError(
      await readErrorMessage(response),
      response.status,
    );
  }
}

// Erro de inscrição que carrega o status HTTP, para a UI distinguir 409 (já
// inscrito) de 422 (fechado/lotado) etc.
export class RegistrationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RegistrationError";
    this.status = status;
  }
}

// GET /users/{userId}/registrations — inscrições do usuário em eventos (inclui
// canceladas; a UI filtra status != CANCELLED). Usado para o gating macro→atividade.
export interface UserEventRegistration {
  eventId: string;
  userId: string;
  status: RegistrationStatus;
}

export async function listUserEventRegistrations(
  userId: string,
): Promise<UserEventRegistration[]> {
  const response = await authFetch(
    `/users/${encodeURIComponent(userId)}/registrations`,
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as UserEventRegistration[];
}

// GET /users/{userId}/activities — inscrições do usuário em atividades. Usado
// para marcar atividades já inscritas (botão "Inscrito ✓") e evitar 409.
export interface UserActivityRegistration {
  activityId: string;
  userId: string;
  eventId: string;
}

export async function listUserActivities(
  userId: string,
): Promise<UserActivityRegistration[]> {
  const response = await authFetch(
    `/users/${encodeURIComponent(userId)}/activities`,
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as UserActivityRegistration[];
}
