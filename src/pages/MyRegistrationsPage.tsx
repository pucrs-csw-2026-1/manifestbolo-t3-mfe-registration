import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme as defaultTheme } from "../theme";
import {
  listUserRegistrations,
  type UserRegistration,
} from "../services/registrationApi";

export interface MyRegistrationsPageProps {
  theme?: Theme;
  embedded?: boolean;
  userId?: string | null;
  accessToken?: string | null;
  onBack?: () => void;
  onOpenEvent?: (eventId: string) => void;
}

const C = {
  bg: "#e6fcff",
  ink: "#1c1a20",
  inkSoft: "#3a3640",
  muted: "#5a5560",
  faint: "#8a858f",
  primary: "#b8336a",
  line: "rgba(28,26,32,.08)",
};

const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function readStorage(keys: string[]): string | null {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

function readJsonStorage(keys: string[]): Record<string, unknown> | null {
  const raw = readStorage(keys);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function resolveUserId(explicit?: string | null): string | null {
  if (explicit) return explicit;
  const direct = readStorage(["userId", "currentUserId", "eloo:userId"]);
  if (direct) return direct;
  const user = readJsonStorage(["user", "currentUser", "eloo:user", "auth:user"]);
  const candidate = user?.id ?? user?.userId ?? user?.sub;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function resolveToken(explicit?: string | null): string | null {
  if (explicit) return explicit;
  const direct = readStorage(["accessToken", "access_token", "token", "eloo:accessToken"]);
  if (direct) return direct;
  const session = readJsonStorage(["auth", "session", "eloo:auth", "eloo:session"]);
  const candidate = session?.accessToken ?? session?.access_token ?? session?.token;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}. de ${d.getFullYear()} as ${hh}h${mm}`;
}

function statusLabel(status?: string | null): string {
  if (!status) return "Inscrito";
  const normalized = status.toLowerCase();
  if (normalized.includes("confirm")) return "Confirmado";
  if (normalized.includes("pend")) return "Pendente";
  if (normalized.includes("cancel")) return "Cancelado";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function eventField(reg: UserRegistration, key: keyof UserRegistration): string | null {
  const own = reg[key];
  if (typeof own === "string" && own.trim()) return own;
  const nested = (reg.event as Record<string, unknown> | null | undefined)?.[String(key)];
  return typeof nested === "string" && nested.trim() ? nested : null;
}

interface EventRegistrationView {
  eventId: string;
  title: string;
  description: string | null;
  category: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  city: string | null;
  statuses: string[];
  registrationCount: number;
  lastRegisteredAt: string | null;
}

function toEventViews(registrations: UserRegistration[]): EventRegistrationView[] {
  const byEvent = new Map<string, UserRegistration[]>();
  registrations.forEach((reg) => {
    const eventId = reg.eventId || reg.event?.eventId;
    if (!eventId) return;
    const group = byEvent.get(eventId) ?? [];
    group.push(reg);
    byEvent.set(eventId, group);
  });

  return Array.from(byEvent.entries())
    .map(([eventId, regs]) => {
      const first = regs[0];
      const title =
        eventField(first, "eventName") ??
        eventField(first, "eventTitle") ??
        eventField(first, "name") ??
        eventField(first, "title") ??
        `Evento ${eventId}`;
      const dates = regs
        .map((r) => r.confirmedAt ?? r.registeredAt ?? r.createdAt)
        .filter((d): d is string => !!d)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return {
        eventId,
        title,
        description: eventField(first, "description"),
        category: eventField(first, "category"),
        startsAt: eventField(first, "startsAt"),
        endsAt: eventField(first, "endsAt"),
        venue: eventField(first, "venue"),
        city: eventField(first, "city"),
        statuses: Array.from(new Set(regs.map((r) => statusLabel(r.status)))),
        registrationCount: regs.length,
        lastRegisteredAt: dates[0] ?? null,
      };
    })
    .sort((a, b) => {
      const ad = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd || a.title.localeCompare(b.title, "pt");
    });
}

function Header({ onBack }: { onBack?: () => void }) {
  return (
    <header
      style={{
        background: "#fff",
        borderBottom: `1px solid ${C.line}`,
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: "0 1px 2px rgba(28,26,32,.04)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "0 32px",
          height: 68,
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: onBack ? "pointer" : "default",
            color: C.ink,
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg,#b8336a,#c490d1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 19,
            }}
          >
            E
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 21 }}>
            Eloo
          </span>
        </button>
        <nav style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <button
            onClick={onBack}
            style={navButton(false)}
          >
            Eventos
          </button>
          <span style={navButton(true)}>Inscricoes</span>
        </nav>
      </div>
    </header>
  );
}

function navButton(active: boolean): CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: active ? "rgba(184,51,106,.08)" : "transparent",
    color: active ? C.primary : C.muted,
    fontWeight: active ? 600 : 500,
    fontSize: 14,
    fontFamily: "inherit",
    cursor: active ? "default" : "pointer",
  };
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px", color: C.faint }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.inkSoft }}>{title}</p>
      <p style={{ margin: "8px auto 20px", fontSize: 14, maxWidth: 440, lineHeight: 1.5 }}>
        {body}
      </p>
      {action}
    </div>
  );
}

export default function MyRegistrationsPage({
  theme,
  embedded = false,
  userId,
  accessToken,
  onBack,
  onOpenEvent,
}: MyRegistrationsPageProps) {
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [registrations, setRegistrations] = useState<UserRegistration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setResolvedUserId(resolveUserId(userId));
    setResolvedToken(resolveToken(accessToken));
  }, [userId, accessToken]);

  useEffect(() => {
    if (!resolvedUserId) {
      setState("idle");
      setRegistrations([]);
      return;
    }
    let alive = true;
    setState("loading");
    setError(null);
    listUserRegistrations(resolvedUserId, { accessToken: resolvedToken })
      .then((data) => {
        if (!alive) return;
        setRegistrations(data);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar inscricoes.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [resolvedUserId, resolvedToken, reloadKey]);

  const events = useMemo(() => toEventViews(registrations), [registrations]);
  const back = onBack ?? (() => window.history.back());

  return (
    <ThemeProvider theme={theme ?? defaultTheme}>
      <CssBaseline />
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          fontFamily: "'Public Sans', system-ui, sans-serif",
          color: C.ink,
        }}
      >
        {!embedded && <Header onBack={back} />}

        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 32px 64px" }}>
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: C.primary,
                marginBottom: 8,
              }}
            >
              Area do participante
            </div>
            <h1 style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.08 }}>
              Minhas inscricoes
            </h1>
            <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 15 }}>
              {state === "ready"
                ? `${events.length} ${events.length === 1 ? "evento cadastrado" : "eventos cadastrados"}`
                : "Eventos em que o usuario atual esta cadastrado"}
            </p>
          </div>

          {!resolvedUserId && (
            <EmptyState
              title="Usuario nao identificado"
              body="Para listar inscricoes, esta tela precisa receber o usuario atual do shell ou encontrar o userId salvo na sessao local."
              action={
                <button onClick={back} style={primaryButton}>
                  Voltar para eventos
                </button>
              }
            />
          )}

          {resolvedUserId && state === "loading" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 18 }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} style={{ height: 210, background: "#fff", borderRadius: 8, opacity: 0.65 }} />
              ))}
            </div>
          )}

          {resolvedUserId && state === "error" && (
            <EmptyState
              title="Nao foi possivel carregar suas inscricoes"
              body={error ?? "Tente novamente em instantes."}
              action={
                <button onClick={() => setReloadKey((k) => k + 1)} style={primaryButton}>
                  Tentar novamente
                </button>
              }
            />
          )}

          {resolvedUserId && state === "ready" && events.length === 0 && (
            <EmptyState
              title="Nenhuma inscricao encontrada"
              body="Quando voce se cadastrar em um evento, ele aparecera nesta lista."
              action={
                <button onClick={back} style={primaryButton}>
                  Ver eventos disponiveis
                </button>
              }
            />
          )}

          {resolvedUserId && state === "ready" && events.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 18 }}>
              {events.map((event) => {
                const loc = [event.venue, event.city].filter(Boolean).join(" - ");
                const date = fmtDate(event.startsAt);
                return (
                  <article
                    key={event.eventId}
                    style={{
                      background: "#fff",
                      border: "1px solid rgba(28,26,32,.07)",
                      borderRadius: 8,
                      boxShadow: "0 1px 3px rgba(28,26,32,.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ height: 5, background: C.primary }} />
                    <div style={{ padding: "20px 22px 22px" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        {(event.category ?? "Evento") && (
                          <span style={tagStyle}>{event.category ?? "Evento"}</span>
                        )}
                        {event.statuses.map((status) => (
                          <span key={status} style={statusStyle}>
                            {status}
                          </span>
                        ))}
                      </div>

                      <h2 style={{ margin: "0 0 8px", fontSize: 20, lineHeight: 1.25, fontWeight: 800 }}>
                        {event.title}
                      </h2>
                      {event.description && (
                        <p style={{ margin: "0 0 16px", color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>
                          {event.description}
                        </p>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, color: C.inkSoft, fontSize: 13.5 }}>
                        {date && <span>{date}</span>}
                        {loc && <span>{loc}</span>}
                        {event.lastRegisteredAt && (
                          <span style={{ color: C.faint }}>
                            Inscrito em {fmtDate(event.lastRegisteredAt)}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderTop: `1px solid ${C.line}`,
                          marginTop: 18,
                          paddingTop: 14,
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: C.faint }}>
                          {event.registrationCount} {event.registrationCount === 1 ? "inscricao" : "inscricoes"}
                        </span>
                        <button
                          onClick={() => onOpenEvent?.(event.eventId)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: C.primary,
                            fontWeight: 700,
                            fontSize: 13.5,
                            cursor: onOpenEvent ? "pointer" : "default",
                            fontFamily: "inherit",
                          }}
                        >
                          Ver evento
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

const primaryButton: CSSProperties = {
  background: C.primary,
  color: "#fff",
  border: "none",
  padding: "10px 18px",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
};

const tagStyle: CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".09em",
  textTransform: "uppercase",
  color: C.primary,
  background: "rgba(184,51,106,.10)",
  padding: "5px 10px",
  borderRadius: 6,
};

const statusStyle: CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  color: "#1f8a5b",
  background: "rgba(46,140,90,.12)",
  padding: "5px 10px",
  borderRadius: 6,
};
