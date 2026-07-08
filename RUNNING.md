# Como rodar o stack (T3 + dependências)

Guia para subir o **MFE de registro (T3)** com todo o backend de que ele depende,
do zero. A tela principal (Listagem de Eventos disponíveis) consome o
`manifestbolo-t2-registration`, que por sua vez fala com o serviço de eventos
(`avengers-t2`) e com o auth (`0x_t1`).

## 1. Repositórios para clonar

Todos no org `pucrs-csw-2026-1`. Clone os quatro **obrigatórios** na mesma pasta:

```bash
git clone git@github.com:pucrs-csw-2026-1/0x_t1.git                        # auth  (T1)
git clone git@github.com:pucrs-csw-2026-1/avengers-t2.git                  # eventos (T2)
git clone git@github.com:pucrs-csw-2026-1/manifestbolo-t2-registration.git # registro (T2)
git clone git@github.com:pucrs-csw-2026-1/manifestbolo-t3-mfe-registration.git # este MFE (T3)
```

Opcionais (só para integrar no shell / reaproveitar o login — **não** são
necessários para a tela de listagem, que é pública):

```bash
git clone git@github.com:pucrs-csw-2026-1/eloo-shell.git
git clone git@github.com:pucrs-csw-2026-1/eloo-auth-mfe.git
```

> ℹ️ Os endpoints do T3 (`GET /events/available` etc.) já estão na `develop` do
> `manifestbolo-t2-registration` (merge do PR #38) — use a `develop`.

## 2. Pré-requisitos

- **Docker + Docker Compose** (0x_t1 e T2 registration rodam em container)
- **Node 18+ e npm** (avengers-t2 e o T3 rodam no host)

## 3. Portas — defaults e o que pode precisar trocar

Numa máquina limpa, os **defaults** funcionam. Só troque se a porta já estiver
ocupada por outro projeto (`ss -ltn` mostra o que está em uso).

| Serviço | Porta default | Onde trocar |
| --- | --- | --- |
| 0x_t1 — auth | **8080** | `0x_t1/docker-compose.yml` (mapeamento `8080:8080`) |
| 0x_t1 — ministack | **4566** | idem |
| avengers — app | **3000** | `avengers-t2/.env` → `PORT` |
| avengers — postgres | **5432** | `avengers-t2/.env` → `POSTGRES_PORT` **e** o host em `DATABASE_URL` |
| T2 registration — app | **8001** | `manifestbolo-t2-registration/app/docker-compose.yml` (`ports` do serviço `app`) |
| T2 registration — postgres | **5434** | idem (`ports` do serviço `db`) |
| T2 registration — ministack | **4567** | idem (já vem em 4567 p/ não bater com o do 0x_t1) |
| T3 — MFE (Vite) | **5177** | `vite.config.ts` (`server.port`) |

**Regras de ligação entre serviços (ajuste junto ao trocar porta):**

- `avengers-t2/.env` → `AUTH_SERVICE_URL=http://localhost:<porta 0x_t1>`
- `manifestbolo-t2-registration/app/.env` →
  `AUTH_SERVICE_BASE_URL=http://host.docker.internal:<porta 0x_t1>` e
  `EVENTS_SERVICE_BASE_URL=http://host.docker.internal:<porta avengers>`
  (o T2 roda em container; `host.docker.internal` alcança serviços no host)
- `manifestbolo-t3-mfe-registration/.env` →
  `REGISTRATION_SERVICE_URL=http://localhost:<porta T2>`

> Ao editar `ports:` no `docker-compose.yml` do T2, **edite a lista existente**
> (não use override em outro arquivo): o Compose *anexa* listas de `ports`, então
> um override deixaria a porta antiga e a nova, causando conflito.

### Exemplo real (máquina com :5432 ocupada por outro Postgres)

| Serviço | Porta usada |
| --- | --- |
| avengers postgres | **5434** (`.env` → `POSTGRES_PORT` e `DATABASE_URL`) |
| T2 postgres | **5435** (senão bate com o do avengers acima) |

## 4. Subir os serviços (nesta ordem)

Substitua as portas conforme sua escolha; abaixo estão os defaults.

### 4.1 — 0x_t1 (auth)
```bash
cd 0x_t1
docker compose up -d          # sobe auth (:8080) + ministack (:4566)
```
O bootstrap de dev semeia um admin logável: **`admin@local.dev` / `Admin@123`**
(scopes `participant`/`manager`/`admin`).

### 4.2 — avengers-t2 (eventos)
```bash
cd avengers-t2
cp .env.example .env          # ajuste PORT / POSTGRES_PORT / DATABASE_URL / AUTH_SERVICE_URL
npm install
npm run db:up                 # postgres do events
npm run db:migrate            # (se DATABASE_URL não for lido do .env: prefixe DATABASE_URL=... )
npm run dev                   # servidor de eventos (:3000)
```

### 4.3 — manifestbolo-t2-registration (registro)
```bash
cd manifestbolo-t2-registration/app
cp .env.example .env          # já aponta EVENTS/AUTH p/ host.docker.internal; ajuste as portas
docker compose up -d --build  # app (:8001) + postgres + ministack
```
`GET /events/available` é **público** e agrega os eventos do avengers. Como o
avengers exige Bearer em **todas** as rotas, o T2 se autentica como **serviço**
(OAuth2 client_credentials no 0x_t1) automaticamente — sem ação manual. Os
defaults de dev (`EVENTS_SERVICE_CLIENT_ID=metrics-service`,
`EVENTS_SERVICE_CLIENT_SECRET=dev-metrics-secret`) já funcionam.

### 4.4 — Criar eventos no avengers (senão a lista vem vazia)
Criar evento exige token com scope `manager`. Usando o admin do 0x_t1, este
snippet gera **5 eventos** de exemplo (datas **futuras**, para aparecerem como
disponíveis). Os timestamps estão em **UTC (`Z`)** — algumas cópias do events
rejeitam offsets tipo `-03:00`, então mantenha esse formato:
```bash
AUTH=http://localhost:8080 ; EVENTS=http://localhost:3000
TOKEN=$(curl -s -X POST $AUTH/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@local.dev&password=Admin@123" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

EVENTS_JSON=(
'{"title":"Congresso Brasileiro de Inteligência Artificial","description":"Três dias de palestras, workshops e networking sobre IA.","starts_at":"2026-07-22T12:00:00Z","ends_at":"2026-07-24T21:00:00Z","timezone":"America/Sao_Paulo","registration_deadline":"2026-07-19T02:59:00Z","location":{"venue":"Centro de Convenções Rebouças","city":"São Paulo, SP"},"capacity":500,"category":"Acadêmico"}'
'{"title":"Meetup Dev Frontend — React & Design Systems","description":"Encontro da comunidade sobre componentização e acessibilidade.","starts_at":"2026-07-30T22:00:00Z","ends_at":"2026-07-31T01:00:00Z","timezone":"America/Sao_Paulo","registration_deadline":"2026-07-29T21:00:00Z","location":{"venue":"Hub de Inovação Batel","city":"Curitiba, PR"},"capacity":80,"category":"Social"}'
'{"title":"Workshop de Liderança Corporativa 2026","description":"Programa intensivo para gestores: comunicação, feedback e gestão de times.","starts_at":"2026-08-05T11:30:00Z","ends_at":"2026-08-05T20:00:00Z","timezone":"America/Sao_Paulo","registration_deadline":"2026-08-02T02:59:00Z","location":{"venue":"Hotel Windsor Barra","city":"Rio de Janeiro, RJ"},"capacity":120,"category":"Corporativo"}'
'{"title":"Feira de Carreiras em Engenharia","description":"Conecte-se com empresas, entrevistas rápidas e vagas de estágio.","starts_at":"2026-09-14T13:00:00Z","ends_at":"2026-09-15T21:00:00Z","timezone":"America/Sao_Paulo","registration_deadline":"2026-09-11T02:59:00Z","location":{"venue":"UFMG — Campus Pampulha","city":"Belo Horizonte, MG"},"capacity":1000,"category":"Acadêmico"}'
'{"title":"Summit de Marketing Digital & Growth","description":"Estratégias de aquisição, retenção e análise de dados com líderes de mercado.","starts_at":"2026-08-19T12:00:00Z","ends_at":"2026-08-20T20:30:00Z","timezone":"America/Sao_Paulo","registration_deadline":"2026-08-16T02:59:00Z","location":{"venue":"WTC Events Center","city":"São Paulo, SP"},"capacity":350,"category":"Corporativo"}'
)

for ev in "${EVENTS_JSON[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST $EVENTS/events \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$ev")
  echo "[$code] $(echo "$ev" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p')"
done
```
Cada linha deve sair com `[201]`. Ajuste/duplique os payloads à vontade (mantenha
`starts_at`/`ends_at` no futuro para o evento continuar disponível).

### 4.5 — T3 (este MFE)
```bash
cd manifestbolo-t3-mfe-registration
echo "REGISTRATION_SERVICE_URL=http://localhost:8001" > .env   # ajuste a porta do T2
npm install
npm run dev                   # http://localhost:5177
```

## 5. Verificar

```bash
curl -s http://localhost:8001/events/available            # T2 direto (troque a porta)
curl -s http://localhost:5177/api/events/available        # via proxy do T3 (o que a tela usa)
```
Depois abra **http://localhost:5177** — a listagem aparece populada. Sem os
backends no ar, a tela mostra o estado de erro com botão “Tentar novamente”
(degradação graciosa).
