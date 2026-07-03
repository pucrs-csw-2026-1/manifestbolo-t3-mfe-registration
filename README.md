# Registration MFE (T3)

React/Vite **remote** microfrontend for the ManifestoBolo event registration
flow, exposed to the [Eloo shell](../eloo-shell) via
[Module Federation](https://github.com/originjs/vite-plugin-federation). It also
runs standalone for local development.

> **Status: scaffold.** Copied from `eloo-auth-mfe` as the starting skeleton.
> Right now it only ships a placeholder **demo page** — no business logic and no
> connection to the registration microservice (T2) yet.

## Getting started

```bash
npm install
npm run dev             # standalone, http://localhost:5177
```

To serve it as a remote for the shell to consume, build and preview the build
(the dev server alone doesn't emit a `remoteEntry.js`):

```bash
npm run serve:remote    # vite build && vite preview --port 5176
```

`npm run build` type-checks (`tsc -b`) and produces a production bundle.

## Architecture

```
src/
  pages/DemoPage.tsx   placeholder page, exposed as the federation remote
  theme.ts             this app's own default MUI theme (used standalone)
  App.tsx              standalone router — only used when run on its own
```

Follows the same remote contract as the other Eloo microfrontends: each exposed
page accepts an optional `theme?: Theme` prop (falling back to `theme.ts` when
standalone) and reports user actions via callback props instead of navigating
directly — see `../eloo-shell/README.md` for the full pattern.

## Exposed remotes

Configured in `vite.config.ts`'s `federation({ exposes: {...} })`, consumed by
the shell as `mfeRegistration/<Name>`:

| Export        | Page                    | Notes                          |
| ------------- | ----------------------- | ------------------------------ |
| `./DemoPage`  | `src/pages/DemoPage.tsx`| placeholder to verify it boots |

`react`, `react-dom`, `react-router-dom`, `@mui/material`, `@emotion/react` and
`@emotion/styled` are declared as `shared` so this app and the shell run one
copy of each at runtime. Adding a shared dependency means updating **both** this
file's and the shell's `federation({ shared: [...] })` list.

## Next steps (planned)

- `src/services/registrationApi.ts` — client for the T2 registration service
  (`manifestbolo-t2-registration`, `:8000`), proxied via `/api`. Reuses the auth
  token written to `localStorage` (`mfeAuth.accessToken`) by `eloo-auth-mfe`.
- Real pages: available events + register, confirm registration (8-char code),
  event registrations list (MANAGER/ADMIN), cancel.
- Wire the remote into `eloo-shell` (`remotes.ts`, `vite-env.d.ts`, routes).
# manifestbolo-t3-mfe-registration
