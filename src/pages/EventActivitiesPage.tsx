import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme as defaultTheme } from "../theme";
import {
  listAvailableEvents,
  listEventActivities,
  getProfile,
  registerEvent,
  confirmEventRegistration,
  registerActivity,
  listUserEventRegistrations,
  listUserActivities,
  RegistrationError,
  type AvailableEvent,
  type EventActivity,
} from "../services/registrationApi";

// Tela "Atividades do Evento": lista as atividades de um evento disponível,
// com filtros por ocupação, fluxo simulado de inscrição (convidado) e lista de
// inscritos (gestor). Dados reais via GET /events/available (cabeçalho do
// evento) + GET /events/{id}/activities (novo endpoint público do T2), em
// paralelo. Segue o contrato de remote dos MFEs Eloo (theme?/embedded?/
// callbacks). Design: "Atividades do Evento.dc.html" (claude.ai/design).

export interface EventActivitiesPageProps {
  theme?: Theme;
  // Quando ausente, é lido de useParams() (rota standalone
  // /events/:eventId/atividades).
  eventId?: string;
  // Quando montado dentro do shell, este já provê o header global; o app bar
  // próprio da tela é omitido para não duplicar a "casca".
  embedded?: boolean;
  // Voltar à listagem de eventos — o host decide a navegação.
  onBack?: () => void;
}

// --- paleta (design "Atividades do Evento") -------------------------------
const C = {
  bg: "#eef7fa",
  ink: "#241f2b",
  soft: "#5a5566",
  muted: "#6b6577",
  faint: "#8a8494",
  fainter: "#9a94a4",
  faintest: "#a49eae",
  primary: "#b8336a",
  primaryHover: "#8e2a55",
  line: "#efeaf2",
  danger: "#c0392b",
  warn: "#d99a2b",
  ok: "#2f9e6f",
};

// Estilo visual por tipo de atividade (ícone Material Symbols + cores do
// badge de categoria e da borda esquerda do card).
type TypeStyle = { icon: string; bg: string; fg: string; accent: string };
const TYPE_STYLES: Record<string, TypeStyle> = {
  workshop: { icon: "construction", bg: "#f3e8f7", fg: "#7a3d8c", accent: "#c490d1" },
  palestra: { icon: "campaign", bg: "#e3f1fc", fg: "#2f6c9e", accent: "#abdafc" },
  mesa_redonda: { icon: "groups", bg: "#fbe6ef", fg: "#a52a5f", accent: "#b8336a" },
  networking: { icon: "handshake", bg: "#e2f7f0", fg: "#238a6b", accent: "#5cc3a3" },
};
const SPECIAL_STYLE: TypeStyle = {
  icon: "rocket_launch",
  bg: "#fff0e6",
  fg: "#b25a29",
  accent: "#e0894f",
};
const styleForType = (type: string) =>
  TYPE_STYLES[type.toLowerCase()] ?? SPECIAL_STYLE;

const MONTHS_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const MONTHS_FULL = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// "mesa_redonda" → "Mesa redonda" (usado quando a atividade não tem category).
function capitalizeType(type: string): string {
  const clean = type.replace(/[_-]+/g, " ").trim();
  if (!clean) return "Atividade";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// "05 ago 2026"
function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// "12–14 de agosto, 2026" (ou variações quando cruza mês/ano ou é dia único).
function eventDatesLine(ev: AvailableEvent): string | null {
  if (!ev.startsAt) return null;
  const s = new Date(ev.startsAt);
  const e = ev.endsAt ? new Date(ev.endsAt) : null;
  if (
    !e ||
    (s.getDate() === e.getDate() &&
      s.getMonth() === e.getMonth() &&
      s.getFullYear() === e.getFullYear())
  ) {
    return `${s.getDate()} de ${MONTHS_FULL[s.getMonth()]}, ${s.getFullYear()}`;
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} de ${MONTHS_FULL[s.getMonth()]}, ${s.getFullYear()}`;
  }
  return `${s.getDate()} de ${MONTHS_FULL[s.getMonth()]} – ${e.getDate()} de ${MONTHS_FULL[e.getMonth()]}, ${e.getFullYear()}`;
}

// Data-calendário (dia UTC) de um instante ISO no fuso da atividade, para o
// cálculo do "Dia N" respeitar o dia local do evento.
function calendarDay(iso: string, timeZone: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let ymd: string;
  try {
    ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    ymd = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
  const [y, m, day] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

// "Dia N" = diferença de dias entre o início da atividade e o início do
// evento, +1. Null quando o evento não tem startsAt.
function dayLabel(a: EventActivity, eventStartsAt: string | null): string | null {
  if (!eventStartsAt) return null;
  const actDay = calendarDay(a.startsAt, a.timezone);
  const evDay = calendarDay(eventStartsAt, a.timezone);
  if (actDay === null || evDay === null) return null;
  return `Dia ${Math.round((actDay - evDay) / 86_400_000) + 1}`;
}

// "09:00 – 11:00" no fuso da atividade.
function timeRange(a: EventActivity): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: a.timezone,
      }).format(d);
    } catch {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }
  };
  return `${fmt(a.startsAt)} – ${fmt(a.endsAt)}`;
}

// View-model de uma atividade (derivado do design: cores, barra, botão…).
interface ActivityView {
  a: EventActivity;
  categoryLabel: string;
  style: TypeStyle;
  day: string | null;
  time: string;
  limited: boolean; // maxCapacity != null
  available: number;
  soldOut: boolean;
  pct: number;
  barColor: string;
}

function toView(a: EventActivity, eventStartsAt: string | null): ActivityView {
  const style = styleForType(a.type);
  const limited = a.maxCapacity !== null;
  const available = limited
    ? (a.availableSlots ?? Math.max(0, (a.maxCapacity as number) - a.registeredCount))
    : Number.POSITIVE_INFINITY;
  const soldOut = limited && available <= 0;
  const pct = limited
    ? Math.min(100, Math.round((a.registeredCount / Math.max(1, a.maxCapacity as number)) * 100))
    : 0;
  const barColor = soldOut ? C.danger : pct >= 85 ? C.warn : C.ok;
  return {
    a,
    categoryLabel: a.category ?? capitalizeType(a.type),
    style,
    day: dayLabel(a, eventStartsAt),
    time: timeRange(a),
    limited,
    available,
    soldOut,
    pct,
    barColor,
  };
}

// Lista simulada de inscritos (visão do gestor) — a integração real com o T2
// (GET de inscritos por atividade, autenticado como MANAGER) virá depois.
const GUEST_ROWS: Array<[string, string, "confirmado" | "pendente"]> = [
  ["Camila Andrade", "camila.andrade@email.com", "confirmado"],
  ["Bruno Teixeira", "bruno.teixeira@email.com", "confirmado"],
  ["Larissa Gomes", "larissa.gomes@email.com", "pendente"],
  ["Diego Martins", "diego.martins@email.com", "confirmado"],
  ["Fernanda Souza", "fernanda.souza@email.com", "confirmado"],
  ["Gustavo Pereira", "gustavo.pereira@email.com", "pendente"],
];

// --- componentes de apoio --------------------------------------------------

function Msym({ name, style }: { name: string; style?: CSSProperties }) {
  return (
    <span className="msym" style={style}>
      {name}
    </span>
  );
}

const spaceGrotesk = "'Space Grotesk', sans-serif";

const labelStyle: CSSProperties = {
  fontFamily: spaceGrotesk,
  fontSize: 11,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: C.faint,
};

const cardShadow =
  "0 1px 3px rgba(30,15,40,.10), 0 6px 20px rgba(30,15,40,.05)";

type Role = "guest" | "manager";

function RoleToggle({
  role,
  onChange,
  variant,
}: {
  role: Role;
  onChange: (role: Role) => void;
  variant: "bar" | "light";
}) {
  const tab = (active: boolean): CSSProperties => ({
    border: "none",
    cursor: "pointer",
    padding: "7px 15px",
    borderRadius: 999,
    fontFamily: spaceGrotesk,
    fontWeight: 600,
    fontSize: 12.5,
    transition: ".15s",
    ...(active
      ? { background: "#fff", color: C.primary, boxShadow: "0 1px 3px rgba(0,0,0,.15)" }
      : variant === "bar"
        ? { background: "transparent", color: "rgba(255,255,255,.9)" }
        : { background: "transparent", color: C.muted }),
  });
  return (
    <div
      style={{
        display: "flex",
        background: variant === "bar" ? "rgba(255,255,255,.16)" : "rgba(184,51,106,.12)",
        borderRadius: 999,
        padding: 3,
      }}
    >
      <button onClick={() => onChange("guest")} style={tab(role === "guest")}>
        Convidado
      </button>
      <button onClick={() => onChange("manager")} style={tab(role === "manager")}>
        Gestor
      </button>
    </div>
  );
}

function BackToListButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ea-back"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        color: C.primary,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "'Public Sans', sans-serif",
        cursor: "pointer",
        padding: "6px 0",
        marginBottom: 16,
      }}
    >
      <Msym name="arrow_back" style={{ fontSize: 19 }} />
      Voltar às atividades
    </button>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <Msym name={icon} style={{ fontSize: 20, color: "#c490d1" }} />
      <div>
        <div style={{ ...labelStyle, fontSize: 11, color: C.fainter, letterSpacing: 0.5 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function EventHeaderCard({
  ev,
  loggedIn,
  registered,
  onRegister,
}: {
  ev: AvailableEvent;
  loggedIn: boolean;
  registered: boolean;
  onRegister: () => void;
}) {
  const pct = Math.min(
    100,
    Math.round((ev.registeredCount / Math.max(1, ev.maxCapacity)) * 100),
  );
  const dates = eventDatesLine(ev);
  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 12,
        boxShadow: cardShadow,
        overflow: "hidden",
        marginBottom: 28,
      }}
    >
      <div style={{ height: 8, background: "linear-gradient(90deg,#b8336a,#c490d1 60%,#abdafc)" }} />
      <div style={{ padding: "26px 28px 24px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fbe6ef",
                color: "#a52a5f",
                fontFamily: spaceGrotesk,
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                padding: "5px 10px",
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              <Msym name="school" style={{ fontSize: 15 }} />
              {ev.category ?? "Evento"}
            </div>
            <h1
              style={{
                margin: "0 0 10px",
                fontSize: 30,
                lineHeight: 1.15,
                fontWeight: 800,
                letterSpacing: -0.4,
              }}
            >
              {ev.name}
            </h1>
            {ev.description && (
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: C.muted, maxWidth: 620 }}>
                {ev.description}
              </p>
            )}
          </div>
          <div
            style={{
              flex: "none",
              width: 230,
              background: "#f6fbfd",
              border: "1px solid #e4eef2",
              borderRadius: 10,
              padding: "16px 18px",
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 6 }}>Inscrições no evento</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: C.primary }}>
                {ev.registeredCount}
              </span>
              <span style={{ fontSize: 14, color: C.faint }}>/ {ev.maxCapacity} vagas</span>
            </div>
            <div style={{ height: 8, background: "#e9e4ee", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: C.primary,
                  borderRadius: 999,
                  transition: "width .6s ease",
                }}
              />
            </div>
            {ev.registrationDeadline && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  color: "#a5324f",
                }}
              >
                <Msym name="event_busy" style={{ fontSize: 16 }} />
                Inscrições até {deadlineLabel(ev.registrationDeadline)}
              </div>
            )}
            {/* CTA de inscrição no evento macro (real, autenticado). */}
            <div style={{ marginTop: 14 }}>
              {!loggedIn ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: C.faint,
                  }}
                >
                  <Msym name="lock" style={{ fontSize: 16 }} />
                  Faça login para se inscrever
                </div>
              ) : registered ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ok,
                    background: "#e4f6ec",
                    borderRadius: 8,
                    padding: "9px 12px",
                  }}
                >
                  <Msym name="check_circle" style={{ fontSize: 17 }} />
                  Inscrito no evento
                </div>
              ) : (
                <button
                  onClick={onRegister}
                  className="ea-btn"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: C.primary,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontFamily: spaceGrotesk,
                    fontWeight: 600,
                    fontSize: 13,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    boxShadow: "0 2px 5px rgba(184,51,106,.32)",
                  }}
                >
                  Inscrever-se no evento
                  <Msym name="arrow_forward" style={{ fontSize: 17 }} />
                </button>
              )}
            </div>
          </div>
        </div>
        {(dates || ev.venue || ev.city) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 26,
              marginTop: 20,
              paddingTop: 18,
              borderTop: `1px solid ${C.line}`,
            }}
          >
            {dates && <MetaItem icon="calendar_month" label="Data" value={dates} />}
            {ev.venue && <MetaItem icon="location_on" label="Local" value={ev.venue} />}
            {ev.city && <MetaItem icon="apartment" label="Cidade" value={ev.city} />}
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityCard({
  v,
  role,
  loggedIn,
  registeredInEvent,
  alreadyRegistered,
  onOpen,
}: {
  v: ActivityView;
  role: Role;
  loggedIn: boolean;
  registeredInEvent: boolean;
  alreadyRegistered: boolean;
  onOpen: (v: ActivityView) => void;
}) {
  const manager = role === "manager";
  let btnLabel: string;
  let btnIcon: string;
  let btnDisabled: boolean;
  let btnStyle: CSSProperties;
  const btnBase: CSSProperties = {
    padding: "10px 12px",
    borderRadius: 8,
    fontFamily: spaceGrotesk,
    fontWeight: 600,
    fontSize: 12.5,
    letterSpacing: 0.4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
  const disabledGrey: CSSProperties = {
    ...btnBase,
    background: "#f1eef4",
    color: C.faintest,
    border: "1px solid #e4dfea",
    cursor: "not-allowed",
  };
  if (manager) {
    btnLabel = "Ver inscritos";
    btnIcon = "group";
    btnDisabled = false;
    btnStyle = {
      ...btnBase,
      background: "#fff",
      color: C.primary,
      border: "1.5px solid #d9a6bd",
      cursor: "pointer",
    };
  } else if (alreadyRegistered) {
    // Guest já inscrito nesta atividade.
    btnLabel = "Inscrito";
    btnIcon = "check_circle";
    btnDisabled = true;
    btnStyle = {
      ...btnBase,
      background: "#e4f6ec",
      color: C.ok,
      border: "1px solid #bfe6d1",
      cursor: "default",
    };
  } else if (v.soldOut) {
    btnLabel = "Esgotado";
    btnIcon = "block";
    btnDisabled = true;
    btnStyle = disabledGrey;
  } else if (!loggedIn) {
    btnLabel = "Faça login";
    btnIcon = "lock";
    btnDisabled = true;
    btnStyle = disabledGrey;
  } else if (!registeredInEvent) {
    // Regra macro→atividade: precisa estar inscrito no evento antes.
    btnLabel = "Inscreva-se no evento";
    btnIcon = "lock";
    btnDisabled = true;
    btnStyle = disabledGrey;
  } else {
    btnLabel = "Inscrever-se";
    btnIcon = "arrow_forward";
    btnDisabled = false;
    btnStyle = {
      ...btnBase,
      background: C.primary,
      color: "#fff",
      border: "none",
      cursor: "pointer",
      boxShadow: "0 2px 5px rgba(184,51,106,.32)",
    };
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        alignItems: "stretch",
        background: "#fff",
        border: "1px solid #ece7f0",
        borderLeft: `4px solid ${v.style.accent}`,
        borderRadius: 8,
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(30,15,40,.05)",
        opacity: v.soldOut ? 0.66 : 1,
      }}
    >
      {/* esquerda */}
      <div style={{ flex: 1, minWidth: 260 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 9,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: v.style.bg,
              color: v.style.fg,
              fontFamily: spaceGrotesk,
              fontWeight: 600,
              fontSize: 10.5,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              padding: "4px 9px",
              borderRadius: 4,
            }}
          >
            <Msym name={v.style.icon} style={{ fontSize: 14 }} />
            {v.categoryLabel}
          </span>
          {v.day && (
            <span
              style={{
                fontSize: 12,
                color: C.fainter,
                background: "#f3f0f6",
                borderRadius: 4,
                padding: "4px 8px",
                fontWeight: 600,
              }}
            >
              {v.day}
            </span>
          )}
          {v.soldOut && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "#fdeaea",
                color: C.danger,
                fontFamily: spaceGrotesk,
                fontWeight: 600,
                fontSize: 10.5,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                padding: "4px 9px",
                borderRadius: 4,
              }}
            >
              <Msym name="block" style={{ fontSize: 14 }} />
              Esgotado
            </span>
          )}
        </div>
        <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>
          {v.a.title}
        </h3>
        {/* sala e palestrante não existem na API do T2 — meta mostra só o horário */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: C.muted }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Msym name="schedule" style={{ fontSize: 17, color: "#b39dbf" }} />
            {v.time}
          </span>
        </div>
      </div>
      {/* direita */}
      <div
        style={{
          flex: "none",
          width: 210,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
          borderLeft: "1px solid #f0ecf3",
          paddingLeft: 20,
        }}
      >
        {v.limited ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              {v.soldOut ? (
                <span style={{ fontSize: 15, fontWeight: 700, color: C.danger }}>Lotado</span>
              ) : (
                <span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: v.barColor }}>
                    {v.available}
                  </span>{" "}
                  <span style={{ fontSize: 13, color: C.faint }}>vagas</span>
                </span>
              )}
              <span style={{ fontSize: 12, color: C.faintest }}>
                {v.a.registeredCount}/{v.a.maxCapacity}
              </span>
            </div>
            <div style={{ height: 7, background: "#eceaef", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${v.pct}%`,
                  background: v.barColor,
                  borderRadius: 999,
                  transition: "width .6s ease",
                }}
              />
            </div>
          </>
        ) : (
          // Sem maxCapacity: sem limite de vagas — nada de barra/contagem.
          <div style={{ fontSize: 13, color: C.faint }}>Sem limite de vagas</div>
        )}
        <button
          onClick={() => onOpen(v)}
          disabled={btnDisabled}
          className={btnDisabled ? undefined : "ea-btn"}
          style={btnStyle}
        >
          {btnLabel}
          <Msym name={btnIcon} style={{ fontSize: 17 }} />
        </button>
      </div>
    </div>
  );
}

function GuestRow({ row }: { row: [string, string, "confirmado" | "pendente"] }) {
  const [name, email, status] = row;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const conf = status === "confirmado";
  return (
    <div
      className="ea-guest"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8 }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "#f3e8f7",
          color: "#7a3d8c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 14,
          flex: "none",
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 12.5, color: C.fainter }}>{email}</div>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: conf ? "#e4f6ec" : "#fdf3e0",
          color: conf ? "#238a6b" : "#b2812b",
          fontFamily: spaceGrotesk,
          fontWeight: 600,
          fontSize: 10.5,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          padding: "5px 10px",
          borderRadius: 999,
        }}
      >
        <Msym name={conf ? "check_circle" : "schedule"} style={{ fontSize: 14 }} />
        {status}
      </span>
    </div>
  );
}

function PrimaryButton({
  onClick,
  children,
  marginTop,
  disabled = false,
}: {
  onClick: () => void;
  children: ReactNode;
  marginTop?: number;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={disabled ? undefined : "ea-btn"}
      style={{
        width: "100%",
        marginTop,
        padding: 14,
        background: disabled ? "#d7a6bd" : C.primary,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontFamily: spaceGrotesk,
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: 0.5,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        boxShadow: "0 2px 6px rgba(184,51,106,.35)",
      }}
    >
      {children}
    </button>
  );
}

// --- página ----------------------------------------------------------------

type FetchState = "loading" | "ready" | "error";
type Filter = "all" | "vaga" | "sold";
type Screen = "list" | "inscricao" | "inscritos";
type Step = "form" | "code" | "done";
// Qual inscrição a tela "inscricao" está conduzindo: no evento macro (com código
// de confirmação real do T2) ou numa atividade (1 clique, sem código).
type RegKind = "event" | "activity";

export default function EventActivitiesPage({
  theme,
  eventId: eventIdProp,
  embedded = false,
  onBack,
}: EventActivitiesPageProps) {
  const params = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const eventId = eventIdProp ?? params.eventId;
  const goBack = onBack ?? (() => navigate(-1));

  const [state, setState] = useState<FetchState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [event, setEvent] = useState<AvailableEvent | null>(null);
  const [activities, setActivities] = useState<EventActivity[]>([]);

  const [role, setRole] = useState<Role>("guest");
  const [filter, setFilter] = useState<Filter>("all");
  const [screen, setScreen] = useState<Screen>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [codeError, setCodeError] = useState(false);

  // Usuário logado real (mfe-auth via localStorage, mesma origin no shell).
  // Estável durante a vida do componente; navegar entre eventos remonta a tela.
  const profile = useMemo(() => getProfile(), []);
  const loggedIn = profile !== null;
  // Só MANAGER/ADMIN podem gerir (ver inscritos). Mesma convenção do eloo-shell
  // (Header.tsx). Espelha a autorização do T2, que responde 403 a participante
  // nos endpoints de listagem de inscritos.
  const canManage =
    profile?.accessLevel === "MANAGER" || profile?.accessLevel === "ADMIN";
  const userName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "";
  const userEmail = profile?.email ?? "";
  const userInitials = profile
    ? (
        (profile.firstName[0] ?? "") + (profile.lastName[0] ?? "")
      ).toUpperCase() || "?"
    : "?";

  // Fluxo de inscrição real.
  const [regKind, setRegKind] = useState<RegKind>("activity");
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRegisteredInEvent, setIsRegisteredInEvent] = useState(false);
  const [registeredActivityIds, setRegisteredActivityIds] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    let alive = true;
    if (!eventId) {
      setError("Evento não informado.");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    Promise.all([listAvailableEvents(), listEventActivities(eventId)])
      .then(async ([events, acts]) => {
        if (!alive) return;
        const ev = events.find((e) => e.eventId === eventId);
        if (!ev) {
          setError("Evento não encontrado.");
          setState("error");
          return;
        }
        setEvent(ev);
        setActivities(acts);
        // Inscrições do usuário logado — dão o gating (evento macro → atividade)
        // e a marcação "Inscrito ✓". Tolerante: falha aqui não bloqueia a tela.
        if (profile) {
          try {
            const [evRegs, actRegs] = await Promise.all([
              listUserEventRegistrations(profile.id),
              listUserActivities(profile.id),
            ]);
            if (!alive) return;
            setIsRegisteredInEvent(
              evRegs.some(
                (r) => r.eventId === eventId && r.status !== "CANCELLED",
              ),
            );
            setRegisteredActivityIds(
              new Set(
                actRegs
                  .filter((r) => r.eventId === eventId)
                  .map((r) => r.activityId),
              ),
            );
          } catch {
            if (!alive) return;
            setIsRegisteredInEvent(false);
            setRegisteredActivityIds(new Set());
          }
        }
        setState("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar as atividades.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [eventId, reloadKey, profile]);

  const views = useMemo(
    () => activities.map((a) => toView(a, event?.startsAt ?? null)),
    [activities, event],
  );
  const countAll = views.length;
  const countVaga = views.filter((v) => !v.soldOut).length;
  const countSold = views.filter((v) => v.soldOut).length;
  const visible =
    filter === "vaga"
      ? views.filter((v) => !v.soldOut)
      : filter === "sold"
        ? views.filter((v) => v.soldOut)
        : views;

  const selected = views.find((v) => v.a.activityId === selectedId) ?? null;

  // Voltar à listagem e refetch — reflete contagens/estados atualizados no banco.
  const backToList = () => {
    setScreen("list");
    setReloadKey((k) => k + 1);
  };
  const changeRole = (r: Role) => {
    setRole(r);
    setScreen("list");
  };
  // Prepara a tela "inscricao" (limpa o estado do fluxo anterior).
  const startRegistration = (kind: RegKind, activityId: string | null) => {
    setRegKind(kind);
    setSelectedId(activityId);
    setScreen("inscricao");
    setStep("form");
    setCode(null);
    setTyped("");
    setCodeError(false);
    setSubmitError(null);
    setConfirmationId(null);
  };
  const openEventRegistration = () => {
    if (!loggedIn || isRegisteredInEvent) return;
    startRegistration("event", null);
  };
  const openActivity = (v: ActivityView) => {
    if (role === "manager" && canManage) {
      setSelectedId(v.a.activityId);
      setScreen("inscritos");
      return;
    }
    // Gating: só inscreve em atividade se logado, inscrito no evento macro, com
    // vaga e ainda não inscrito nesta atividade.
    if (
      !loggedIn ||
      !isRegisteredInEvent ||
      v.soldOut ||
      registeredActivityIds.has(v.a.activityId)
    ) {
      return;
    }
    startRegistration("activity", v.a.activityId);
  };

  // Passo "form" → seguinte. Evento: POST guests (devolve o código real) → passo
  // "code". Atividade: POST activities/registrations (sem código) → "done".
  const confirmRegistration = async () => {
    if (!profile || !eventId) return;
    setBusy(true);
    setSubmitError(null);
    try {
      if (regKind === "event") {
        const reg = await registerEvent(eventId, profile.id);
        setIsRegisteredInEvent(true);
        if (reg.status === "CONFIRMED" || !reg.confirmationId) {
          setStep("done");
        } else {
          setConfirmationId(reg.confirmationId);
          setCode(reg.confirmationToken);
          setTyped("");
          setCodeError(false);
          setStep("code");
        }
      } else if (selected) {
        await registerActivity(selected.a.activityId, profile.id, eventId);
        setRegisteredActivityIds((prev) =>
          new Set(prev).add(selected.a.activityId),
        );
        setStep("done");
      }
    } catch (err) {
      // 409 = já inscrito: trata como sucesso idempotente.
      if (err instanceof RegistrationError && err.status === 409) {
        if (regKind === "event") {
          setIsRegisteredInEvent(true);
        } else if (selected) {
          setRegisteredActivityIds((prev) =>
            new Set(prev).add(selected.a.activityId),
          );
        }
        setStep("done");
      } else {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "Não foi possível concluir a inscrição.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // Passo "code" (só evento): confirma o token real no T2 (case-sensitive).
  const submitCode = async () => {
    if (!confirmationId) return;
    setBusy(true);
    setCodeError(false);
    try {
      await confirmEventRegistration(confirmationId, typed.trim());
      setIsRegisteredInEvent(true);
      setStep("done");
    } catch (err) {
      // 409 = já confirmado: também é sucesso.
      if (err instanceof RegistrationError && err.status === 409) {
        setIsRegisteredInEvent(true);
        setStep("done");
      } else {
        setCodeError(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const chipStyle = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? C.primary : "#e0dae7"}`,
    cursor: "pointer",
    padding: "8px 13px",
    borderRadius: 999,
    fontFamily: spaceGrotesk,
    fontWeight: 600,
    fontSize: 12,
    transition: ".15s",
    background: active ? "#fbe6ef" : "#fff",
    color: active ? "#a52a5f" : C.muted,
  });

  const shownGuests =
    selected === null
      ? GUEST_ROWS
      : GUEST_ROWS.slice(0, Math.min(GUEST_ROWS.length, selected.a.registeredCount));
  const moreGuests = selected
    ? Math.max(0, selected.a.registeredCount - shownGuests.length)
    : 0;

  return (
    <ThemeProvider theme={theme ?? defaultTheme}>
      <CssBaseline />
      <style>{`
        .msym{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased}
        .ea-btn:hover{filter:brightness(.95)}
        .ea-back:hover{color:${C.primaryHover}}
        .ea-guest:hover{background:#faf8fc}
        .ea-outline:hover{background:#fbe6ef}
        .ea-crumb:hover{color:${C.primaryHover};text-decoration:underline}
      `}</style>
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
              position: "sticky",
              top: 0,
              zIndex: 20,
              background: C.primary,
              color: "#fff",
              boxShadow: "0 2px 8px rgba(120,20,60,.28)",
            }}
          >
            <div
              style={{
                maxWidth: 1000,
                margin: "0 auto",
                padding: "0 24px",
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.primary,
                    fontWeight: 800,
                    fontSize: 18,
                    fontFamily: spaceGrotesk,
                  }}
                >
                  e
                </div>
                <span style={{ fontFamily: spaceGrotesk, fontWeight: 700, fontSize: 20, letterSpacing: 0.5 }}>
                  Eloo
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {canManage && (
                  <RoleToggle role={role} onChange={changeRole} variant="bar" />
                )}
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#c490d1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#3a1830",
                  }}
                >
                  {userInitials}
                </div>
              </div>
            </div>
          </header>
        )}

        <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 72px" }}>
          {state === "loading" && (
            <div style={{ textAlign: "center", padding: "80px 20px", color: C.fainter }}>
              <Msym name="hourglass_top" style={{ fontSize: 40, color: "#cdc7d6" }} />
              <p style={{ margin: "10px 0 0", fontSize: 15 }}>Carregando atividades…</p>
            </div>
          )}

          {state === "error" && (
            <div style={{ textAlign: "center", padding: "80px 20px", color: C.fainter }}>
              <Msym name="error" style={{ fontSize: 40, color: "#cdc7d6" }} />
              <p style={{ margin: "10px 0 4px", fontSize: 16, fontWeight: 600, color: C.soft }}>
                Não foi possível carregar as atividades
              </p>
              <p style={{ margin: "0 0 18px", fontSize: 14 }}>{error}</p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="ea-btn"
                style={{
                  background: C.primary,
                  color: "#fff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: spaceGrotesk,
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {state === "ready" && event && screen === "list" && (
            <div>
              {/* breadcrumb */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.faint }}>
                  <span
                    className="ea-crumb"
                    role="button"
                    tabIndex={0}
                    onClick={goBack}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") goBack();
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    Eventos
                  </span>
                  <Msym name="chevron_right" style={{ fontSize: 16 }} />
                  <span style={{ color: C.soft, fontWeight: 600 }}>{event.name}</span>
                </div>
                {embedded && canManage && (
                  <RoleToggle role={role} onChange={changeRole} variant="light" />
                )}
              </div>

              <EventHeaderCard
                ev={event}
                loggedIn={loggedIn}
                registered={isRegisteredInEvent}
                onRegister={openEventRegistration}
              />

              {/* seção de atividades */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: -0.2 }}>
                    Atividades
                  </h2>
                  <span style={{ fontSize: 14, color: C.faint }}>{countAll} no total</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setFilter("all")} style={chipStyle(filter === "all")}>
                    Todas · {countAll}
                  </button>
                  <button onClick={() => setFilter("vaga")} style={chipStyle(filter === "vaga")}>
                    Com vaga · {countVaga}
                  </button>
                  <button onClick={() => setFilter("sold")} style={chipStyle(filter === "sold")}>
                    Esgotadas · {countSold}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {visible.map((v) => (
                  <ActivityCard
                    key={v.a.activityId}
                    v={v}
                    role={canManage ? role : "guest"}
                    loggedIn={loggedIn}
                    registeredInEvent={isRegisteredInEvent}
                    alreadyRegistered={registeredActivityIds.has(v.a.activityId)}
                    onOpen={openActivity}
                  />
                ))}
              </div>

              {visible.length === 0 && (
                <div style={{ textAlign: "center", padding: "50px 20px", color: C.fainter }}>
                  <Msym name="event_available" style={{ fontSize: 40, color: "#cdc7d6" }} />
                  <p style={{ margin: "10px 0 0", fontSize: 15 }}>
                    Nenhuma atividade neste filtro.
                  </p>
                </div>
              )}
            </div>
          )}

          {state === "ready" && event && screen === "inscricao" &&
            (regKind === "event" || selected) && (
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <BackToListButton onClick={backToList} />

              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: cardShadow,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(120deg,#b8336a,#c490d1)",
                    color: "#fff",
                    padding: "22px 26px",
                  }}
                >
                  <div style={{ ...labelStyle, color: undefined, opacity: 0.85, marginBottom: 6 }}>
                    {regKind === "event" ? "Inscrição no evento" : "Inscrição em atividade"}
                  </div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                    {regKind === "event" ? event.name : selected?.a.title}
                  </h2>
                  {regKind === "activity" && (
                    <div style={{ fontSize: 13, opacity: 0.9 }}>{event.name}</div>
                  )}
                </div>

                <div style={{ padding: "24px 26px" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 18,
                      paddingBottom: 18,
                      marginBottom: 20,
                      borderBottom: `1px solid ${C.line}`,
                      fontSize: 13.5,
                      color: C.soft,
                    }}
                  >
                    {regKind === "event" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Msym name="calendar_month" style={{ fontSize: 18, color: "#c490d1" }} />
                        {eventDatesLine(event) ?? "Datas a confirmar"}
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Msym name="schedule" style={{ fontSize: 18, color: "#c490d1" }} />
                        {selected?.time}
                        {selected?.day ? ` · ${selected.day}` : ""}
                      </span>
                    )}
                  </div>

                  {step === "form" && (
                    <div>
                      <div style={{ ...labelStyle, marginBottom: 14 }}>Confirme seus dados</div>
                      {/* Dados do usuário logado (mfe-auth). */}
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 5 }}>
                        Nome completo
                      </label>
                      <div
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          border: "1px solid #ddd6e4",
                          borderRadius: 8,
                          background: "#faf8fc",
                          fontSize: 14.5,
                          color: C.ink,
                          marginBottom: 16,
                        }}
                      >
                        {userName || "—"}
                      </div>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 5 }}>
                        E-mail
                      </label>
                      <div
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          border: "1px solid #ddd6e4",
                          borderRadius: 8,
                          background: "#faf8fc",
                          fontSize: 14.5,
                          color: C.ink,
                          marginBottom: 22,
                        }}
                      >
                        {userEmail || "—"}
                      </div>
                      {submitError && (
                        <div
                          style={{
                            fontSize: 12.5,
                            color: C.danger,
                            marginBottom: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Msym name="error" style={{ fontSize: 15 }} />
                          {submitError}
                        </div>
                      )}
                      {loggedIn ? (
                        <PrimaryButton onClick={confirmRegistration} disabled={busy}>
                          {busy ? "Enviando…" : "Confirmar inscrição"}
                          {!busy && <Msym name="arrow_forward" style={{ fontSize: 18 }} />}
                        </PrimaryButton>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            fontSize: 13.5,
                            color: C.muted,
                            background: "#faf8fc",
                            border: "1px solid #ddd6e4",
                            borderRadius: 8,
                            padding: "14px",
                          }}
                        >
                          <Msym name="lock" style={{ fontSize: 17 }} />
                          Faça login para se inscrever
                        </div>
                      )}
                    </div>
                  )}

                  {step === "code" && (
                    <div>
                      <div
                        style={{
                          background: "#f0f9fd",
                          border: "1px solid #cfe8f6",
                          borderRadius: 10,
                          padding: "16px 18px",
                          marginBottom: 22,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: "#2f6c9e",
                            fontSize: 12.5,
                            fontWeight: 600,
                            marginBottom: 8,
                          }}
                        >
                          <Msym name="mail" style={{ fontSize: 18 }} />
                          Simulação de e-mail recebido
                        </div>
                        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#5a6b78", lineHeight: 1.5 }}>
                          Enviamos um código de confirmação de 8 caracteres. Digite-o abaixo para
                          concluir sua inscrição.
                        </p>
                        <div
                          style={{
                            fontFamily: spaceGrotesk,
                            fontWeight: 700,
                            fontSize: 24,
                            letterSpacing: 6,
                            color: "#0f3a52",
                            background: "#fff",
                            border: "1px dashed #9fc9e0",
                            borderRadius: 8,
                            padding: 12,
                            textAlign: "center",
                          }}
                        >
                          {code}
                        </div>
                      </div>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 5 }}>
                        Código de confirmação
                      </label>
                      {/* O token do T2 é case-sensitive (letras maiúsculas e
                          minúsculas + dígitos): não normalizar a caixa. */}
                      <input
                        value={typed}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          setTyped(e.target.value);
                          setCodeError(false);
                        }}
                        maxLength={8}
                        placeholder="8 caracteres"
                        style={{
                          width: "100%",
                          padding: "13px 14px",
                          border: `1px solid ${codeError ? "#e6a0a0" : "#ddd6e4"}`,
                          borderRadius: 8,
                          fontFamily: spaceGrotesk,
                          fontSize: 18,
                          letterSpacing: 4,
                          textAlign: "center",
                          color: C.ink,
                          marginBottom: 8,
                          outline: "none",
                        }}
                      />
                      {codeError && (
                        <div
                          style={{
                            fontSize: 12.5,
                            color: C.danger,
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Msym name="error" style={{ fontSize: 15 }} />
                          Código incorreto. Confira o e-mail e tente novamente.
                        </div>
                      )}
                      <PrimaryButton
                        onClick={submitCode}
                        marginTop={12}
                        disabled={busy || typed.trim().length !== 8}
                      >
                        {busy ? "Confirmando…" : "Confirmar código"}
                      </PrimaryButton>
                    </div>
                  )}

                  {step === "done" && (
                    <div style={{ textAlign: "center", padding: "8px 0 6px" }}>
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: "50%",
                          background: "#e4f6ec",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 16px",
                        }}
                      >
                        <Msym name="check_circle" style={{ fontSize: 38, color: C.ok }} />
                      </div>
                      <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>
                        Inscrição confirmada!
                      </h3>
                      <p style={{ margin: "0 0 22px", fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
                        {regKind === "event" ? (
                          <>
                            Sua inscrição em <strong>{event.name}</strong> está confirmada.
                            Agora você já pode se inscrever nas atividades do evento.
                          </>
                        ) : (
                          <>
                            Sua vaga em <strong>{selected?.a.title}</strong> está garantida. Você
                            receberá os detalhes por e-mail.
                          </>
                        )}
                      </p>
                      <button
                        onClick={backToList}
                        className="ea-outline"
                        style={{
                          padding: "12px 26px",
                          background: "#fff",
                          color: C.primary,
                          border: `1.5px solid ${C.primary}`,
                          borderRadius: 8,
                          fontFamily: spaceGrotesk,
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        Voltar às atividades
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {state === "ready" && event && screen === "inscritos" && selected && (
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <BackToListButton onClick={backToList} />
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: cardShadow,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "22px 26px", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Inscritos na atividade</div>
                  <h2 style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 800 }}>
                    {selected.a.title}
                  </h2>
                  <div style={{ fontSize: 13.5, color: C.muted }}>
                    {selected.limited
                      ? `${selected.a.registeredCount} de ${selected.a.maxCapacity} vagas preenchidas`
                      : `${selected.a.registeredCount} inscritos · sem limite de vagas`}
                  </div>
                </div>
                <div style={{ padding: "8px 12px" }}>
                  {/* Lista simulada (design) — endpoint real de inscritos por
                      atividade virá com a integração do painel do gestor. */}
                  {shownGuests.map((row) => (
                    <GuestRow key={row[1]} row={row} />
                  ))}
                  {shownGuests.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px 12px", fontSize: 13.5, color: C.faintest }}>
                      Nenhum inscrito nesta atividade ainda.
                    </div>
                  )}
                  {moreGuests > 0 && (
                    <div style={{ textAlign: "center", padding: 12, fontSize: 12.5, color: C.faintest }}>
                      + {moreGuests} outros inscritos
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}
