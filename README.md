# Registration MFE (T3)

React/Vite **remote** microfrontend for the ManifestoBolo event registration
flow, exposed to the [Eloo shell](../eloo-shell) via
[Module Federation](https://github.com/originjs/vite-plugin-federation). It also
runs standalone for local development.

> **Status: em desenvolvimento.** Primeira tela real entregue — **Listagem de
> Eventos disponíveis**, consumindo o microsserviço de registro (T2) via
> `GET /events/available`. As demais telas (confirmação, minhas inscrições,
> painel do organizador) ainda serão implementadas.

## Getting started

```bash
npm install
npm run dev             # standalone, http://localhost:5177
```

> 📖 Para rodar o **stack completo** (quais repositórios clonar, portas a trocar,
> ordem de subida dos serviços e como criar eventos), veja **[RUNNING.md](./RUNNING.md)**.

A listagem lê `GET /events/available` através do proxy `/api` (configurado em
`vite.config.ts` → `REGISTRATION_SERVICE_URL`, default `http://localhost:8000`).
Esse endpoint é **público** (não exige login), então a tela renderiza sem token;
para dados reais, o T2 (`manifestbolo-t2-registration`, `:8000`) e o
events-service precisam estar no ar — sem eles a tela mostra o estado de erro
com botão "Tentar novamente".

To serve it as a remote for the shell to consume, build and preview the build
(the dev server alone doesn't emit a `remoteEntry.js`):

```bash
npm run serve:remote    # vite build && vite preview --port 5176
```

`npm run build` type-checks (`tsc -b`) and produces a production bundle.

## Architecture

```
src/
  pages/EventsListPage.tsx      tela principal (listagem de eventos disponíveis)
  services/registrationApi.ts   client HTTP do T2 (via proxy /api)
  theme.ts                      tema MUI Eloo próprio (usado standalone)
  App.tsx                       router standalone — só quando roda sozinho
```

Follows the same remote contract as the other Eloo microfrontends: each exposed
page accepts an optional `theme?: Theme` prop (falling back to `theme.ts` when
standalone) and reports user actions via callback props instead of navigating
directly — see `../eloo-shell/README.md` for the full pattern.

## Exposed remotes

Configured in `vite.config.ts`'s `federation({ exposes: {...} })`, consumed by
the shell as `mfeRegistration/<Name>`:

| Export                   | Page                                | Notes                                         |
| ------------------------ | ----------------------------------- | --------------------------------------------- |
| `./EventsListPage`       | `src/pages/EventsListPage.tsx`      | listagem de eventos disponíveis (pública)     |
| `./EventActivitiesPage`  | `src/pages/EventActivitiesPage.tsx` | atividades de um evento + inscrição (pública) |

`EventsListPage` aceita `theme?: Theme`, `onOpenEvent?(eventId)` (o host decide
a navegação ao clicar "Ver detalhes") e `embedded?: boolean` (quando `true`,
omite o header próprio para não duplicar a casca do shell).

`EventActivitiesPage` aceita `theme?: Theme`, `eventId?: string` (quando
ausente, lê de `useParams()` na rota standalone `/events/:eventId/atividades`),
`embedded?: boolean` e `onBack?()` (voltar à listagem — default `navigate(-1)`).
Consome `GET /events/available` (cabeçalho do evento) e o novo
`GET /events/{id}/activities` do T2, ambos públicos. O fluxo de inscrição
(código de 8 chars num "e-mail simulado") e a lista de inscritos do gestor são
simulados no cliente por enquanto.

`react`, `react-dom`, `react-router-dom`, `@mui/material`, `@emotion/react` and
`@emotion/styled` are declared as `shared` so this app and the shell run one
copy of each at runtime. Adding a shared dependency means updating **both** this
file's and the shell's `federation({ shared: [...] })` list.

## Next steps (planned)

- Detalhe do evento + **inscrever-se** (`POST /events/{id}/guests`) — passa a
  exigir login (Bearer token do `0x_t1`, reusando o `eloo-auth-mfe`).
- **Confirmação** de inscrição com o código de 8 chars (`POST /events/confirmation/{id}`),
  mockando em tela o "e-mail" recebido (o T2 devolve `confirmationToken` na criação).
- **Minhas inscrições** (`GET /users/{id}/registrations` + `/activities`) e cancelar.
- **Painel do organizador** (MANAGER/ADMIN) com inscritos por evento/atividade.
- Wire the remote into `eloo-shell` (`remotes.ts`, `vite-env.d.ts`, routes).
# manifestbolo-t3-mfe-registration
