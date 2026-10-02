# GamePortal Web

A responsive web portal prototype for COMSW4995 Multiplayer Games. The first playable slice includes game discovery, filters, match setup, persistent local matches, pass-and-play Tic-Tac-Toe, and a computer opponent.

## Run in Browser

Go to <https://cdilli223.github.io/comsw4995-web-game-portal/>. The first screen uses fictional catalog, profile, and match data so the portal is explorable without backend access. The profile dialog's Google, Facebook, guest, and phone paths are explicitly mock interactions. Use the gear button for the separate local backend development login. `file://` can render the local demo, but service workers and API requests require localhost or HTTPS.

## Run locally

There is no build step or package install. From this directory, run:

```sh
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Just as with the browser, the first page will constist of fictional data.

## Repository layout

```text
.nojekyll                 GitHub Pages static-file marker
README.md                  Setup, API contract, and implementation limits
index.html                 GitHub Pages entrypoint
service-worker.js          Root-scoped offline shell cache
assets/
  css/styles.css            Portal styles
  js/app.js                 Views, demo data, and API adapter
```

Keep the entrypoint at repository root and use relative asset URLs. This allows the same build to work at both `http://localhost:8080/` and the GitHub project-site path `https://<owner>.github.io/<repository>/`.

## GitHub Pages

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**, select `main` and the `/ (root)` folder, then save.
4. Wait for the Pages deployment and open the published project-site URL.

No Node build or custom domain is required. `.nojekyll` is included so Pages serves the static tree directly. The service worker is at root so it can control the site and caches only same-origin app assets. GitHub Pages is static hosting: it does not run the NestJS backend, and its origin must be allowed by backend CORS.

Do not publish `DEV_AUTH_KEY` or rely on the local development login on a public site. Production sign-in needs the agreed identity provider/token flow, and the API must be served over HTTPS with production secrets held server-side.

## Backend integration

The gear menu accepts the API base URL. It supports the backend repository's current local development login, `POST /auth/login` with `{ "email", "developmentKey" }`. The resulting one-hour bearer token stays in `sessionStorage`; the development key is not saved. This is only for a locally configured backend, not production authentication. The backend's `DEV_AUTH_KEY` must be set in its environment, and seeded emails include `admin@demo.local`, `player-a@demo.local`, and `player-b@demo.local`.

The portal uses these implemented routes and payloads:

| Method | Route | Contract |
| --- | --- | --- |
| `POST` | `/auth/login` | `{ email, developmentKey }` → `{ accessToken, user }` |
| `GET` | `/users/me` | Validate the bearer token and get the current profile |
| `GET` | `/games` | Authenticated game records, with their versions |
| `POST` | `/matches` | `{ gameVersionId, mode, joinPolicy }`; this portal sends `PING_PONG` + `OPEN` |
| `GET` | `/matches/{id}` | Refresh the joined match after `/join` |
| `POST` | `/matches/{id}/join` | Join an open lobby; the route takes no body |
| `POST` | `/matches/{id}/start` | Owner starts after the exact player count is present |
| `POST` | `/matches/{id}/moves` | `{ clientMoveId, expectedVersion, move }` |
| `GET` | `/me/matches` | Full current-user match list; refresh every five seconds while active, on resume, and reconnect |

Every protected request includes `Authorization: Bearer <accessToken>`. The backend enables CORS in `main.ts`. Its current `/games` implementation returns records owned by the signed-in user (admins see all records), not a public catalog. The portal displays published versions from those records and keeps local sample cards separate. A global public-game listing still needs a backend route or an agreed policy change.

For the seeded reference game, sign in as `admin@demo.local` to see the seeded game/version (the seed assigns it to Admin). Create an open lobby, copy its link, then open that link in a second browser session signed in as `player-a@demo.local` or `player-b@demo.local`. Supply the local `DEV_AUTH_KEY` from the backend environment when signing in.

The API's join service rejects `INVITE_ONLY`, so this portal creates `OPEN` ping-pong lobbies. It copies a `?match=<id>` link; the recipient signs in, fetches the match, and joins while it is still open. The owner can start when the roster is full. The current backend has no `changedSince` filtering; it returns the whole match list. Its `/matches/{id}/hide` sets a shared match-level hidden flag, so the portal's Hide action remains local instead of calling that endpoint.

The portal can play remote matches for the backend's registered Tic-Tac-Toe engine (`tic-tac-toe`, engine version 1). Moves are sent to the backend for authoritative validation; the returned board/version/turn are used to refresh the view. The backend currently registers only its developer-authored Tic-Tac-Toe engine. `VS_COMPUTER` is an API mode enum, but the current create/start path does not add bot seats automatically, so the portal uses its local bot for local practice and does not claim online bot support.

## GameBuilder integration boundary

The GameBuilder README's source matches the implementation: generated code is stored through the builder host's private storage, and its game iframe is built internally from `srcdoc`. There is no current package-export URL or backend publishing call. Opening GameBuilder from the portal opens a separate app; it does not connect its saved games to this portal.

The backend accepts a `GameVersion` with `engineKey`, `engineVersion`, `manifest`, `capabilities`, and optional artifact references. Its runtime resolves only engines already registered in the server. The artifact fields are storage references, not a browser package URL, and the current API has no GameBuilder package upload/delivery route. Consequently, arbitrary generated GameBuilder JavaScript cannot yet be safely published, executed, and server-validated by this backend. The portal keeps its `state_change` / `make_move` iframe bridge as a future package boundary, but no GameBuilder-created game currently reaches it.

To complete that connection, the teams need to agree on a package/export format and an artifact upload/read URL, then add a server-side execution/validation strategy for generated rules (or restrict publishing to registered engines). Until those exist, the interoperable end-to-end slice is the registered Tic-Tac-Toe engine.

## Current scope

- Local Tic-Tac-Toe works against the computer or in pass-and-play and is saved in browser storage.
- Connect Four and Dots & Boxes also run locally against the computer or in pass-and-play. Their boards, scores, turns, and results are saved with each match.
- Connect Four and Dots & Boxes run locally in computer and pass-and-play modes, with saved boards and game-specific rules. Poker, Chinese Checkers, and Memory remain static board/table previews; their rules and match logic are not implemented.
- Without an authenticated published backend version, Ping-pong keeps its local friend-invite/open-lobby flow with simulated joins and invite codes. Real-time starts a local match against the game AI using the selected friend/stranger identity as a clearly labeled demo opponent. Neither flow sends invitations or creates network matches.
- The match list also contains public Connect Four and Dots & Boxes demo matches that can be watched read-only. Real backend spectators remain restricted to responses with `capabilities.spectators` and an explicit `publicView`.
- The profile center includes locally saved usernames/contact details and profile photos, built-in avatar presets, language and theme preferences, notification switches, mock social/payment settings, and a local support-request form. Messages is a separate global-navigation inbox with local replies. These are prototypes only: no payment, social, messaging, or support service is contacted, and full interface translations are not implemented.
- The authenticated API path supports published registered Tic-Tac-Toe ping-pong/real-time lobbies, sharing/joining, owner start, versioned moves, and full-list refresh.
- The portal shell is cached by a service worker. Local games keep working offline; remote Tic-Tac-Toe supports one pending move per match, auto-retry on reconnect, and a needs-review state on version conflict. This is not a general queue for arbitrary games.
- The pass-and-play demo hides the board at each handoff until the next player reveals it. This is social privacy, not device-owner security.
- Production Google/Facebook/phone sign-in, a public game catalog, random-opponent matchmaking, online bot seats, backend-provided spectator views, push notifications, portal/game translations, and playable Poker, Chinese Checkers, and Memory remain blocked or unimplemented.

## Match lifecycle policy

- Lobby members can leave without deleting the shared match; the owner can cancel the shared lobby.
- Hiding removes the match only from this browser's list and does not call the backend's shared `hide` route.
- Leaving an ongoing match is disabled. The current backend marks a player `LEFT` but does not define turn reassignment, bot takeover, or a game-specific outcome. The portal must not invent one.
- A non-player can view an ongoing match only when the response provides `capabilities.spectators` and an explicit `publicView`. The current backend does not provide that public view contract, so the portal denies spectator access rather than exposing the full match state.
