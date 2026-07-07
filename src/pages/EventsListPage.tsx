import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme as defaultTheme } from "../theme";
import {
  listAvailableEvents,
  type AvailableEvent,
} from "../services/registrationApi";

// Tela principal do MFE de registro: lista apenas os eventos DISPONÍVEIS para
// inscrição (GET /events/available — público, só eventos futuros/em andamento
// com vagas). Segue o contrato de remote dos MFEs Eloo: recebe `theme?` (usa o
// próprio quando standalone) e reporta ações via callbacks em vez de navegar.
// "Todos os eventos" é uma tela separada (futura). Design: claude.ai/design.

export interface EventsListPageProps {
  theme?: Theme;
  // Disparado ao clicar "Ver detalhes" num evento — o host decide a navegação.
  onOpenEvent?: (eventId: string) => void;
  // Quando montado dentro do shell, este já provê o header/nav global, então
  // o cabeçalho próprio da tela é omitido para não duplicar a "casca".
  embedded?: boolean;
}

// --- paleta Eloo (DESIGN.md) ---------------------------------------------
const C = {
  bg: "#e6fcff",
  ink: "#1c1a20",
  inkSoft: "#3a3640",
  muted: "#5a5560",
  faint: "#8a858f",
  primary: "#b8336a",
  line: "rgba(28,26,32,.08)",
};

const CATEGORY_ACCENT: Record<string, string> = {
  Acadêmico: "#b8336a",
  Social: "#c490d1",
  Corporativo: "#3a8fc4",
};
const CATEGORY_ACCENT_SOFT: Record<string, string> = {
  Acadêmico: "rgba(184,51,106,.10)",
  Social: "rgba(196,144,209,.18)",
  Corporativo: "rgba(58,143,196,.12)",
};
const accentFor = (cat: string | null) =>
  (cat && CATEGORY_ACCENT[cat]) || C.primary;
const accentSoftFor = (cat: string | null) =>
  (cat && CATEGORY_ACCENT_SOFT[cat]) || "rgba(184,51,106,.10)";

const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function fmt(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return {
    day: d.getDate(),
    mon: MONTHS[d.getMonth()],
    year: d.getFullYear(),
    time: `${hh}h${mm}`,
  };
}

function dateLine(ev: AvailableEvent): string | null {
  if (!ev.startsAt) return null;
  const s = fmt(ev.startsAt);
  if (!ev.endsAt) return `${s.day} de ${s.mon}. · a partir das ${s.time}`;
  const e = fmt(ev.endsAt);
  if (s.day === e.day && s.mon === e.mon) {
    return `${s.day} de ${s.mon}. · ${s.time}–${e.time}`;
  }
  return `${s.day} ${s.mon}. – ${e.day} ${e.mon}. ${e.year} · a partir das ${s.time}`;
}

function locationLine(ev: AvailableEvent): string | null {
  const parts = [ev.venue, ev.city].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function deadlineLine(ev: AvailableEvent): string {
  if (!ev.registrationDeadline) return "Inscrição livre";
  const dl = new Date(ev.registrationDeadline);
  if (Date.now() > dl.getTime()) return "Prazo encerrado";
  const d = fmt(ev.registrationDeadline);
  return `Inscreva-se até ${d.day} de ${d.mon}.`;
}

type Status = { label: string; bg: string; fg: string };
function statusFor(ev: AvailableEvent): Status {
  if (ev.availableSlots <= 0) {
    return { label: "Esgotado", bg: "rgba(28,26,32,.06)", fg: C.faint };
  }
  if (ev.registrationDeadline) {
    const dl = new Date(ev.registrationDeadline).getTime();
    const days = Math.ceil((dl - Date.now()) / 86_400_000);
    if (days <= 3 && days >= 0) {
      return { label: "Últimas vagas", bg: "rgba(184,51,106,.12)", fg: C.primary };
    }
  }
  if (ev.availableSlots <= Math.max(1, Math.round(ev.maxCapacity * 0.1))) {
    return { label: "Últimas vagas", bg: "rgba(184,51,106,.12)", fg: C.primary };
  }
  return { label: "Inscrições abertas", bg: "rgba(46,140,90,.12)", fg: "#1f8a5b" };
}

type SortKey = "date" | "title" | "capacity";

// --- componentes de apoio ------------------------------------------------

function EventCard({
  ev,
  onOpenEvent,
}: {
  ev: AvailableEvent;
  onOpenEvent?: (eventId: string) => void;
}) {
  const accent = accentFor(ev.category);
  const st = statusFor(ev);
  const pct = Math.min(100, Math.round((ev.registeredCount / ev.maxCapacity) * 100));
  const dLine = dateLine(ev);
  const locLine = locationLine(ev);
  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid rgba(28,26,32,.07)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(28,26,32,.06)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ height: 5, background: accent }} />
      <div style={{ padding: "20px 22px 22px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".09em",
              textTransform: "uppercase",
              color: accent,
              background: accentSoftFor(ev.category),
              padding: "5px 10px",
              borderRadius: 6,
            }}
          >
            {ev.category || "Evento"}
          </span>
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".04em",
              padding: "5px 10px",
              borderRadius: 6,
              background: st.bg,
              color: st.fg,
              whiteSpace: "nowrap",
            }}
          >
            {st.label}
          </span>
        </div>

        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 19,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
            color: C.ink,
          }}
        >
          {ev.name}
        </h3>

        {ev.description && (
          <p
            style={{
              margin: "0 0 18px",
              color: C.muted,
              fontSize: 13.5,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: 40,
            }}
          >
            {ev.description}
          </p>
        )}

        {(dLine || locLine) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              marginBottom: 18,
            }}
          >
            {dLine && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.inkSoft, fontSize: 13.5 }}>
                <span style={{ width: 16, textAlign: "center", opacity: 0.55 }}>🗓</span>
                <span>{dLine}</span>
              </div>
            )}
            {locLine && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.inkSoft, fontSize: 13.5 }}>
                <span style={{ width: 16, textAlign: "center", opacity: 0.55 }}>📍</span>
                <span>{locLine}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: C.muted,
              }}
            >
              Ocupação
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>
              {ev.registeredCount}/{ev.maxCapacity} vagas
            </span>
          </div>
          <div style={{ height: 6, background: "rgba(28,26,32,.07)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: accent, borderRadius: 99 }} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 14,
            borderTop: "1px solid rgba(28,26,32,.07)",
          }}
        >
          <span style={{ fontSize: 12.5, color: C.faint }}>{deadlineLine(ev)}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={() => onOpenEvent?.(ev.eventId)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpenEvent?.(ev.eventId);
            }}
            style={{ fontWeight: 600, fontSize: 13.5, color: C.primary, cursor: "pointer" }}
          >
            Ver detalhes →
          </span>
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(28,26,32,.07)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(28,26,32,.06)",
        height: 290,
      }}
    >
      <div style={{ height: 5, background: "rgba(28,26,32,.10)" }} />
      <div style={{ padding: "20px 22px", animation: "elooPulse 1.2s ease-in-out infinite" }}>
        <div style={{ height: 18, width: "40%", background: "rgba(28,26,32,.08)", borderRadius: 6, marginBottom: 16 }} />
        <div style={{ height: 20, width: "85%", background: "rgba(28,26,32,.10)", borderRadius: 6, marginBottom: 12 }} />
        <div style={{ height: 14, width: "100%", background: "rgba(28,26,32,.06)", borderRadius: 6, marginBottom: 8 }} />
        <div style={{ height: 14, width: "70%", background: "rgba(28,26,32,.06)", borderRadius: 6, marginBottom: 22 }} />
        <div style={{ height: 6, width: "100%", background: "rgba(28,26,32,.07)", borderRadius: 99 }} />
      </div>
    </div>
  );
}

// --- página --------------------------------------------------------------

export default function EventsListPage({
  theme,
  onOpenEvent,
  embedded = false,
}: EventsListPageProps) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [events, setEvents] = useState<AvailableEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [sort, setSort] = useState<SortKey>("date");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setError(null);
    listAvailableEvents()
      .then((data) => {
        if (!alive) return;
        setEvents(data);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar eventos.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const categories = useMemo(() => {
    const present = Array.from(
      new Set(events.map((e) => e.category).filter((c): c is string => !!c)),
    ).sort((a, b) => a.localeCompare(b, "pt"));
    return ["Todos", ...present];
  }, [events]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = events.filter((ev) => {
      const okCat = category === "Todos" || ev.category === category;
      const okQ =
        !q ||
        `${ev.name} ${ev.description ?? ""} ${ev.city ?? ""}`
          .toLowerCase()
          .includes(q);
      return okCat && okQ;
    });
    list = list.slice();
    if (sort === "date") {
      list.sort(
        (a, b) =>
          new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime(),
      );
    } else if (sort === "title") {
      list.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    } else {
      list.sort((a, b) => b.availableSlots - a.availableSlots);
    }
    return list;
  }, [events, query, category, sort]);

  const resultLabel =
    state === "loading"
      ? "Carregando eventos…"
      : state === "error"
        ? "Não foi possível carregar os eventos"
        : visible.length === 0
          ? "Nenhum evento corresponde aos filtros"
          : `${visible.length} ${visible.length === 1 ? "evento disponível" : "eventos disponíveis"}`;

  const chipBase = {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 15px",
    borderRadius: 99,
    cursor: "pointer",
    transition: "all .15s",
    border: "1px solid",
  } as const;

  return (
    <ThemeProvider theme={theme ?? defaultTheme}>
      <CssBaseline />
      <style>{`@keyframes elooPulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          fontFamily: "'Public Sans', system-ui, sans-serif",
          color: C.ink,
        }}
      >
        {!embedded && (
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
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
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
                <span
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: 21,
                    letterSpacing: "-.01em",
                  }}
                >
                  Eloo
                </span>
              </div>
              <nav style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                <span
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "rgba(184,51,106,.08)",
                    color: C.primary,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Eventos
                </span>
                <span style={{ padding: "8px 14px", borderRadius: 8, color: C.muted, fontWeight: 500, fontSize: 14 }}>
                  Inscrições
                </span>
              </nav>
            </div>
          </header>
        )}

        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 32px 64px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
              marginBottom: 28,
            }}
          >
            <div>
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
                Painel de eventos
              </div>
              <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05 }}>
                Eventos disponíveis
              </h1>
              <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 15 }}>{resultLabel}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#9a95a0", fontSize: 15 }}>
                  ⌕
                </span>
                <input
                  value={query}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                  placeholder="Buscar eventos…"
                  style={{
                    width: 240,
                    padding: "11px 14px 11px 34px",
                    border: "1px solid rgba(28,26,32,.14)",
                    borderRadius: 8,
                    fontSize: 14,
                    background: "#fff",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <select
                value={sort}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSort(e.target.value as SortKey)}
                style={{
                  padding: "11px 12px",
                  border: "1px solid rgba(28,26,32,.14)",
                  borderRadius: 8,
                  fontSize: 14,
                  background: "#fff",
                  color: C.ink,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <option value="date">Data (mais próximo)</option>
                <option value="title">Título (A–Z)</option>
                <option value="capacity">Vagas disponíveis</option>
              </select>
            </div>
          </div>

          {categories.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
              {categories.map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    style={{
                      ...chipBase,
                      borderColor: active ? "rgba(0,0,0,0)" : "rgba(28,26,32,.14)",
                      background: active ? C.primary : "#fff",
                      color: active ? "#fff" : C.inkSoft,
                      boxShadow: active ? "0 1px 3px rgba(184,51,106,.3)" : "none",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {state === "loading" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 22 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {state === "error" && (
            <div style={{ textAlign: "center", padding: "72px 20px", color: C.faint }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>⚠️</div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.inkSoft }}>
                Não foi possível carregar os eventos
              </p>
              <p style={{ margin: "6px 0 18px", fontSize: 14 }}>{error}</p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                style={{
                  background: C.primary,
                  color: "#fff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {state === "ready" && visible.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 22 }}>
              {visible.map((ev) => (
                <EventCard key={ev.eventId} ev={ev} onOpenEvent={onOpenEvent} />
              ))}
            </div>
          )}

          {state === "ready" && visible.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 20px", color: C.faint }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🔎</div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.inkSoft }}>
                {events.length === 0
                  ? "Nenhum evento disponível no momento"
                  : "Nenhum evento encontrado"}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                {events.length === 0
                  ? "Assim que houver eventos com vagas abertas, eles aparecerão aqui."
                  : "Tente ajustar a busca ou os filtros de categoria."}
              </p>
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}
