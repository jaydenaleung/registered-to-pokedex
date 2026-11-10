# Registered To Pokédex: Build Instructions

This file is the source of truth for the project. It turns the original request into a buildable spec, and the build follows it step by step (see [Build plan](#9-build-plan)).

---

## 1. Product goals

| # | Goal | Where it lives |
|---|------|----------------|
| G1 | Every Pokémon (National Dex #1–#1025) has its own page, with **official Pokémon TCG card art** as the main image. | `/pokemon/:id` |
| G2 | Each page shows the basics as **tags**: age, type, weaknesses, lore, possible moves, evolution line, how hard it is to catch, legendary/mythical status, and more. | Detail page, right-hand page |
| G3 | On the main page, each Pokémon's icon is its **pixel-art sprite**. The sprite stays still and **plays its animation on hover**. | Index tiles |
| G4 | Hovering over a tile long enough (≈600 ms) opens a small **quick-look popup** with stats. | Index tiles |
| G5 | Signed-in users can **upvote / downvote** a Pokémon. | Detail page, quick look, search sort |
| G6 | Signed-in users can **log caught Pokémon**, and their **trainer profile** shows how many they've caught. | Detail page + `/trainer` |

### Interpretation of ambiguous requirements

- **"Age"**: species have no canonical age, so *Age* means **years since the species debuted**, using the Japanese release year of its first game: $\text{age} = Y_{\text{now}} - Y_{\text{debut}}$. Generation debut years: I 1996, II 1999, III 2002, IV 2006, V 2010, VI 2013, VII 2016, VIII 2019, IX 2022. Known late debuts override these (Meltan/Melmetal 2018, Isle of Armor/Crown Tundra 2020, Hisui 2022, Teal Mask/Indigo Disk 2023, Pecharunt 2024).
- **"Lore"**: the official Pokédex entries from every game (deduplicated, newest first), plus the genus (e.g. "Seed Pokémon"). On top of that there is optional **Professor's Notes**: a short summary written by Claude, generated once per species and cached for everyone (see §6).
- **"Difficulty of catching"**: derived from the species' capture rate $R \in [3, 255]$ (§5.4).
- **"Original pixel art animation"**: the Gen V (Black/White) animated sprites, which are the classic animated pixel art. Species without a BW animation use the Showdown animated sprite. A few recent species have neither, so they get a CSS "hop" animation on their static sprite.

---

## 2. Design

### 2.1 Look & feel: the original red Pokédex

- The whole app sits inside a **red Pokédex device** drawn in CSS:
  - a big blue lens and three small lights (red / yellow / green) at the top
  - a hinge down the middle
  - D-pad and A/B buttons along the bottom
  - chunky black outlines everywhere
- Inside the device is an **open book**: two LCD-green "screens" (pages) with a spine between them.
- Everything is pixel style:
  - Fonts: `Press Start 2P` for labels and headings, `VT323` for body text.
  - Borders are stepped "pixel corner" borders, made with `box-shadow`.
  - Sprites render with `image-rendering: pixelated`.
  - The page background is a tiled pixel pattern.
  - The screens have a faint dot-matrix/scanline overlay.
- Palette tokens:
  - `--dex-red` #dc0a2d, `--dex-red-dark` #9e0019, `--ink` #141414
  - LCD `--screen` #c6d7a0, `--screen-ink` #213018
  - Lens blue #3db7f4
  - Plus the 18 standard type colours.

### 2.2 Book navigation

- **Index**: results are split into *spreads* (two pages of tiles). The D-pad ◀ ▶ buttons, the arrow keys, or a swipe flip one spread at a time, and the page turns over in 3-D.
- **Detail pages** use the same book. Flipping goes to the previous or next National Dex number.
- The page flip is real:
  - The old right page turns over and lands on the left, showing the new left page on its back.
  - The pages shown during the flip are static "ghost" copies, with no animation or network effects.
  - The flip is skipped when `prefers-reduced-motion` is set.
- On phones (< 820 px) the pages stack into one column, and the flip becomes a short slide.

### 2.3 Search bar (top of the device)

Free text plus `key:value` tokens, combined with AND:

| Query | Meaning |
|-------|---------|
| `pika` | name contains "pika" (case- and accent-insensitive) |
| `#25`, `25` | National Dex number |
| `1-151` | number range |
| `fire`, `type:fire` | has that type (`type:fire type:flying` = both) |
| `gen:3`, `gen3`, `hoenn` | generation (region names work too) |
| `legendary`, `mythical`, `baby` | special status (`is:legendary` also works) |
| `weak:ice` | takes ≥2× damage from Ice |
| `caught` / `missing` | in / not in your caught log (signed in) |
| `sort:popular` / `sort:unpopular` | by vote score ($\text{up} - \text{down}$) |
| `sort:name`, `sort:bst`, `sort:catch` (hardest first), `sort:easy`, `sort:num` | other orders |
| `alolan`, `galarian`, `hisuian`, `paldean`, `regional` | has that regional form (§13) |
| `mega`, `gmax`, `primal`, `forms`, `form:<tag>` | has a Mega, Gigantamax, Primal or any alternate form |

- The **Type / Gen / Sort dropdowns** next to the bar just rewrite tokens in the query, so the query string (`?q=`) is the only source of truth. That means searches are shareable and work with the back button.
- **Enter** on an exact name or number jumps straight to that Pokémon's page.
- A **"?"** button explains the syntax.
- The **RANDOM** button opens a random Pokémon page. With a search active, it picks from the current results.
- Keyboard shortcuts: `/` focuses search, `r` goes to a random Pokémon, `←`/`→` flip pages.

### 2.4 Index tile + quick look

- **Tile**:
  - Pixel frame with `No.025`, the static sprite, the name and type pips.
  - On hover or focus, the static PNG is swapped for the animated GIF.
  - A ✓ badge shows if you've caught it.
- **Quick look** (after ≈600 ms of hover or keyboard focus):
  - An RPG text-box popup with genus, types, six stat bars, BST, catch difficulty, legendary/mythical tag and vote score.
  - It positions itself so it stays on screen.
  - It never appears on touch devices, where a tap just opens the page.

### 2.5 Detail page

- **Left page**:
  - Title strip: `No.025 PIKACHU` and the genus.
  - **Battle arena**: pixel grass, with a platform the Pokémon lands on.
  - **Card viewer**: the featured official card, browsable ◀ n/N ▶ through every printed card of the species. A toggle switches to the **official artwork** from Bulbapedia, and clicking opens a lightbox.
- **Right page**:
  - **Tag cloud**:
    - TYPE, GEN, REGION, AGE, LEGENDARY / MYTHICAL / BABY, CATCH difficulty
    - HT and WT
    - WEAK ×4/×2, RESISTS ×½/×¼, IMMUNE
    - ABILITIES (hidden ability marked), EGG GROUPS, GENDER, HABITAT, COLOR, GROWTH
  - **Action row**: ▲ vote ▼ with the score, and **LOG CATCH** (or CAUGHT ✓ with edit/release).
  - **Tabs**:
    - **LORE**: Pokédex entries labelled by game, plus Professor's Notes.
    - **STATS**: base-stat bars and BST.
    - **MOVES**: the level-up table from the newest main-series game it appears in, plus TM, egg and tutor lists.
    - **EVOLUTION**: the full family tree with sprites and conditions such as "Lv. 16", "Use Thunder Stone", "Trade holding Metal Coat" or "High Friendship, Day". Every member links to its own page.
- **Pokéball throw** (runs every time a page opens, and can be replayed with **THROW AGAIN**), an original pixel-art take on the classic games:
  1. The ball arcs in from the bottom-left, spinning.
  2. It bounces, wobbles, and pops open.
  3. A white flash and pixel sparkles burst out.
  4. The Pokémon appears as a white silhouette that grows to full size, then shifts into colour.
  5. Its animated sprite takes over.
- **Sound**: **CRY** plays the cry. If **SOUND** is switched on in the top bar (off by default, remembered per browser), the cry also plays when the Pokémon comes out.

### 2.6 Trainer profile (`/trainer`)

- A trainer card: avatar, name, trainer-since date, and **CAUGHT n / 1025** with a progress bar.
- Completion broken down by generation.
- A grid of caught sprites, each linking to its page.
- A log table with nickname, where caught, date, shiny flag and notes. Rows can be edited or released.

---

## 3. Architecture

```
Browser (React SPA on Firebase Hosting)
 ├─ static JSON  /data/*.json  ← generated at build time from PokeAPI + TCG data (no images)
 ├─ images       hotlinked only (never stored):
 │     Bulbapedia (Bulbagarden Archives) official artwork
 │     images.pokemontcg.io official card scans
 │     PokeAPI sprites on GitHub (pixel sprites, animated GIFs, cries)
 ├─ Firebase Auth (Google sign-in)
 ├─ Cloud Firestore (votes, caught logs, profiles, cached AI notes)
 └─ Cloud Functions  professorNotes  → Claude API  (API key held only as a Firebase secret)
```

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 19 + TypeScript, React Router (BrowserRouter + Hosting SPA rewrite), hand-written CSS (no UI kit) |
| Auth | Firebase Auth, Google provider (popup) |
| Database | Cloud Firestore with offline persistence; security rules validate every write |
| Server | Cloud Functions for Firebase v2 (Node 22), `@anthropic-ai/sdk` |
| Analytics | Firebase Analytics, only where `isSupported()` |
| Tests | Vitest (search parser, type chart, catch maths, data integrity) |

### 3.1 Image sources (URLs only, nothing stored)

| Image | Primary source | Fallback chain (`onError`) |
|-------|---------------|----------------------------|
| Card art | `https://images.pokemontcg.io/{set}/{number}_hires.png`, or `images.scrydex.com` for the newest sets, exactly as listed in the open `PokemonTCG/pokemon-tcg-data` dataset | Bulbapedia artwork → PokeAPI official artwork |
| Official artwork | `https://archives.bulbagarden.net/media/upload/{h0}/{h0h1}/{NNNN}{Name}.png`, where `h = md5(filename)` (MediaWiki's hashed upload path, computed at build time) | PokeAPI `other/official-artwork/{id}.png` |
| Static sprite | PokeAPI `versions/generation-v/black-white/{id}.png` | `sprites/pokemon/{id}.png` |
| Animated sprite | PokeAPI BW `animated/{id}.gif`, else `other/showdown/{id}.gif` | static sprite + CSS hop |
| Cry | PokeAPI cries `latest/{id}.ogg` | button hidden on error |

Every `<img>` uses `referrerpolicy="no-referrer"`, `loading="lazy"` and `decoding="async"`.

---

## 4. Data pipeline (`npm run data` → `scripts/build-data.mjs`)

1. Download these PokeAPI CSVs from `github.com/PokeAPI/pokeapi/data/v2/csv` into `.cache/` (gitignored):
   - species, names, flavour text, pokemon, types
   - stats, abilities, moves, evolution
   - items, version groups, egg groups, habitats, colours, shapes, growth rates
2. Download `PokemonTCG/pokemon-tcg-data` sets and cards (English).
3. Read which animated sprites exist from a tree-only (`--filter=blob:none`) clone of `PokeAPI/sprites`.
4. Emit (committed, so the app builds without network):
   - `public/data/index.json`: one compact record per species, holding id, name, types, gen, genus, flags, capture rate, stats, BST, height, weight, sprite flags and the Bulbapedia art path.
   - `public/data/pokemon/{id}.json`: Pokédex entries, abilities with descriptions, breeding info, evolution tree with conditions, moves (ids, by method), and up to 24 cards (featured first).
   - `public/data/moves.json`: id → name, type, category, power, accuracy, PP.
   - `public/data/types.json`: the 18 types and their attack-vs-defence damage chart.
   - `functions/src/species-facts.json`: a compact fact sheet the Cloud Function puts into the Claude prompt. The function never trusts facts sent by the client.
5. **Card choice**:
   - Featured card: the newest *Special Illustration Rare* / *Illustration Rare* (full-art illustrations). If there is none, the newest card.
   - The rest of the list is sorted newest first.

---

## 5. Domain logic

### 5.1 Type effectiveness

For an attacking type $A$ against defender types $T_1, T_2$, the multiplier is

$$m(A) = c(A, T_1) \cdot c(A, T_2), \qquad c \in \left\{0, \tfrac{1}{2}, 1, 2\right\}$$

Tags group the results: ×4 and ×2 are weaknesses, ×½ and ×¼ are resistances, and ×0 is immunity.

### 5.2 Base stat total

$\text{BST} = \sum_{s \in \{\text{HP}, \text{Atk}, \text{Def}, \text{SpA}, \text{SpD}, \text{Spe}\}} s$. Stat bars scale against 255.

### 5.3 Popularity

$\text{score} = \text{up} - \text{down}$. `sort:popular` breaks ties by total votes, then by dex number.

### 5.4 Catch difficulty

Tier by capture rate $R$:

| Tier | $R$ |
|------|-----|
| Very Easy | ≥ 150 |
| Easy | 76–149 |
| Moderate | 46–75 |
| Hard | 26–45 |
| Very Hard | 4–25 |
| Extreme | ≤ 3 (legendary tier) |

The page also shows an approximate catch chance using the Gen V+ formula (ignoring critical captures and level modifiers):

$$a = \frac{(3H_{\max} - 2H_{\text{cur}}) \cdot R \cdot B}{3H_{\max}} \cdot S, \qquad p = \min\left(1, \left(\frac{a}{255}\right)^{\frac{3}{4}}\right)$$

Two scenarios are shown:

- **Poké Ball, full HP, no status** ($B = 1$, $S = 1$, $H_{\text{cur}} = H_{\max}$), together with the expected number of balls $\frac{1}{p}$.
- **Ultra Ball, 1 HP, asleep** ($B = 2$, $S = 2.5$, $H_{\text{cur}} \to 1$).

---

## 6. Professor's Notes (Claude API)

- **Purpose**: a short (~120–160 words), spoiler-free field-guide note per species, covering personality, habitat and trainer tips. It is written from the bundled official facts.
- **Flow**:
  1. The client reads `aiLore/{id}`. If it exists, the note is shown with no API call.
  2. If not, a signed-in user presses **ASK THE PROFESSOR**, which calls the `professorNotes` callable function with `{dexId}`.
  3. The function validates the id, returns the cached note if one exists, and takes a short lock so two users can't trigger the same generation.
  4. It calls Claude using only server-side facts, stores `{text, model, createdAt}` and returns it.
- **Cost is bounded**: at most one generation per species (1025 in total), and only signed-in users can trigger one. Clients cannot write `aiLore` at all.
- **Model**: `claude-opus-5-5` at `effort: "low"`, with server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). It checks `stop_reason` before reading the text.
- **Secrets**:
  - The Claude API key is **never** committed or sent to the browser. It lives only in Firebase Secret Manager:
    ```bash
    firebase functions:secrets:set ANTHROPIC_API_KEY
    ```
  - For the local emulator, use `functions/.secret.local` (gitignored).
  - The key in the original request was shared in plain text, so it should be **rotated** in the Claude Console before going live.
- Cloud Functions need the Firebase **Blaze** plan. Without the function deployed, the rest of the app works normally, and the Professor's panel says the Professor is away.

---

## 7. Firebase

### 7.1 Project config and secrets policy

**No key, token or credential is ever committed to this repository**, the Firebase web config included.

- The Firebase web config is read from environment variables at build time:
  - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_MEASUREMENT_ID`
- Copy `.env.example` (empty placeholders, committed) to **`.env.local`** (gitignored). Fill it in from Firebase console → Project settings → General → Your apps → *SDK setup and configuration*.
- Without a config the site still builds and runs: browsing works, and sign-in, votes and catch logs are switched off.
- Emulator mode (`VITE_USE_EMULATORS=1`) uses the offline `demo-registered-pokedex` project and needs no config.
- The Claude API key lives only in Firebase Secret Manager (§6).
- **Guards**: `scripts/check-secrets.mjs` scans for API keys, tokens, private keys and env files.
  - It runs in `npm test` (`src/lib/secrets.test.ts`), as `npm run check:secrets`, and as a git pre-commit hook (`.githooks/pre-commit`).
  - `npm install` switches the hook on through the `prepare` script.
- A Firebase web API key always ships inside the built site, because browsers need it to reach Firebase. Protect it in Google Cloud console → APIs & Services → Credentials:
  - **Application restrictions**: HTTP referrers limited to the site's domains (e.g. `registered-to-pokedex.web.app/*`, `registered-to-pokedex.firebaseapp.com/*`, `localhost:5173/*`).
  - **API restrictions**: only the Firebase APIs the app uses (Identity Toolkit, Token Service, Cloud Firestore, Firebase Installations, Firebase Analytics).
- Turn on GitHub **push protection** for secret scanning so a leaked key is refused at push time.
- If a key ever leaks, **rotate it first**. Removing it from the code doesn't make it secret again.

### 7.2 Firestore data model

| Path | Fields | Who can read | Who can write |
|------|--------|--------------|---------------|
| `pokemonVotes/{dexId}` | `up: int`, `down: int` | anyone | signed-in users, **only** in the same transaction as their own voter doc, with exactly the matching delta |
| `pokemonVotes/{dexId}/voters/{uid}` | `value: 1 \| -1`, `at: timestamp` | owner | owner (delete = remove vote), must match the tally change |
| `users/{uid}` | `displayName`, `photoURL`, `createdAt`, `updatedAt` | owner | owner (schema-checked) |
| `users/{uid}/caught/{dexId}` | `dexId`, `name`, `caughtAt`, `loggedAt`, `nickname?`, `location?`, `note?`, `shiny?` | owner | owner (schema + length checks) |
| `aiLore/{dexId}` | `text`, `model`, `createdAt` | anyone | Cloud Functions only |
| `aiLoreLocks/{dexId}` | `at` | nobody | Cloud Functions only |

- **Vote integrity**:
  - The rules compare the voter doc before and after the write (`get` / `getAfter`) and require
    $\Delta\text{up} = [v_{\text{after}} = 1] - [v_{\text{before}} = 1]$ and $\Delta\text{down} = [v_{\text{after}} = -1] - [v_{\text{before}} = -1]$.
  - So the counters can't be inflated, and can't drift from the votes actually cast.
- **Caught count** = the size of `users/{uid}/caught`, kept live with a snapshot listener.

### 7.3 Console setup (one-time, by the project owner)

1. **Authentication → Get started** (this switches Firebase Auth on for the project; until then every sign-in fails with `CONFIGURATION_NOT_FOUND`), then Sign-in method → enable **Google**. Add any extra hosting domains under Settings → Authorized domains (`localhost`, `*.web.app` and `*.firebaseapp.com` are there by default).
2. Firestore → create the database in **production mode**.
3. Deploy the rules and hosting:
   ```bash
   firebase deploy --only firestore:rules,hosting
   ```
4. Optional: upgrade to Blaze, set the secret, then deploy the functions:
   ```bash
   firebase deploy --only functions
   ```

**Sign-in troubleshooting**: when a sign-in fails, the app asks Firebase Auth's public project endpoint what's wrong and shows a specific message: Auth not switched on, Google provider disabled, domain not authorised, pop-up blocked, or embedded browser.

**Local development against emulators**: start them with `firebase emulators:start --only auth,firestore,functions --project demo-registered-pokedex`, then run `VITE_USE_EMULATORS=1 npm run dev`. The functions emulator reads `ANTHROPIC_API_KEY` from the gitignored `functions/.secret.local`.

---

## 8. Repository layout

```
INSTRUCTIONS.md        this spec
README.md              quick start
firebase.json          hosting (dist/, SPA rewrite, caching headers), firestore, functions
.firebaserc            default project id (an identifier, not a key)
.env.example           empty Firebase config placeholders (real values go in .env.local, gitignored)
.githooks/pre-commit   blocks commits containing secrets
scripts/check-secrets.mjs  secret scanner (npm run check:secrets, npm test, pre-commit)
firestore.rules        security rules (§7.2)
firestore.indexes.json
tests/firestore.rules.test.ts  security-rule tests (npm run test:rules, Firestore emulator)
index.html
vite.config.ts  tsconfig*.json  package.json
scripts/build-data.mjs data pipeline (§4)
public/data/…          generated JSON (no images): index, pokemon/{id}, moves, types, forms, games
src/
  main.tsx  App.tsx
  lib/      firebase, session (auth + prefs), data loading, search, typeChart, catchRate, sprites (incl. game modes),
            gameThemes, votes, caught, aiNotes, age, battle (engine), battleStore
  components/ DexShell, Book, SearchBar, PokemonTile, QuickLook, PokeballReveal, TypeBadge, Tag,
              StatBars, MoveTable, EvolutionTree, CardViewer, VoteButtons, CatchButton, ProfessorNotes…
  pages/    IndexPage, PokemonPage, TrainerPage, BattlePage, NotFoundPage
  styles/   theme.css (tokens, device, pixel borders), book.css, components.css
functions/
  src/index.ts       professorNotes callable (auth, validation, cache, lock)
  src/professor.ts   prompt + Claude call
  src/species-facts.json
```

---

## 9. Build plan

1. **Spec**: write this file.
2. **Scaffold**: Vite/React/TS app, Firebase config files, rules, functions package, `.gitignore` (excludes `.cache/`, `node_modules/`, `dist/`, `.env*`, `functions/.secret.local`).
3. **Data**: write and run `scripts/build-data.mjs`. Check there are 1025 species, every detail file exists, and the card and sprite coverage is reported.
4. **Core libs**: type chart, catch maths, age, search parser and filter, sprite and art URL builders, with Vitest tests.
5. **Shell & book**: the red device, the two-page book with flip animation, keyboard and swipe navigation.
6. **Index**: paged tiles with static → animated sprites on hover, the quick-look popup, search bar with dropdowns and help, RANDOM.
7. **Detail page**: tag cloud, pokéball throw, card viewer and artwork toggle, tabs (lore / stats / moves / evolution), cry and sound toggle, prefetching neighbours for instant flips.
8. **Firebase features**: Google sign-in, votes (transaction + rules), caught log dialog, trainer profile page.
9. **Professor's Notes**: Cloud Function and client panel, with graceful degradation.
10. **Verify**:
    - `npm test`, `npm run build`, and the functions `tsc` build all pass.
    - `npm run test:rules` passes in the Firestore emulator.
    - An end-to-end run against the emulators works: sign in, vote, change and remove a vote, log, edit and release a catch, see the profile count, generate a Professor's note.
    - Playwright screenshots of index, hover/quick look, page flip, detail page and mobile layout look right.
11. **Ship**: commit and push to the working branch. The owner runs the console steps in §7.3 and `firebase deploy`.

## 10. Acceptance checklist

- [x] All 1025 species reachable at `/pokemon/:id`, and flipping ◀ ▶ walks the dex in order.
- [x] Each page shows card art (with fallbacks), the tag cloud, lore, moves, evolution line, catch difficulty and legendary/mythical status.
- [x] Index sprites are static until hovered, then animate. Quick look appears after ~600 ms.
- [x] The search grammar in §2.3 works, the dropdowns stay in sync, and RANDOM works.
- [x] Pokéball throw animation plays on page open and on THROW AGAIN.
- [x] Signed-in users can vote (one vote each, changeable or removable) and can log, edit or release catches. The profile count updates live.
- [x] No Pokémon images in the repo or database (only URLs; the one asset is a hand-drawn favicon).
- [x] No API key of any kind in the repo (Firebase config in `.env.local`, Claude key in Secret Manager). Enforced by `npm test` and the pre-commit hook (§7.1).
- [x] Usable at 375 px width with no horizontal page scroll. Keyboard-navigable, with visible focus.

---

## 11. Game modes

A **GAME** selector in the header switches the whole Pokédex to one game's graphics. The choice is remembered per browser.

| Generation | Games |
|------------|-------|
| I | Red / Blue, Yellow |
| II | Gold, Silver, Crystal |
| III | Ruby / Sapphire, Emerald, FireRed / LeafGreen |
| IV | Diamond / Pearl, Platinum, HeartGold / SoulSilver |
| V | Black / White |
| VI | X / Y, Omega Ruby / Alpha Sapphire |
| VII | Ultra Sun / Ultra Moon, Let's Go Pikachu / Eevee |
| VIII | Sword / Shield, Brilliant Diamond / Shining Pearl, Legends: Arceus |
| IX | Scarlet / Violet, Legends: Z-A, Pokémon Champions |

What a game mode changes:

- **Sprites**: every sprite (index tiles, arena, evolution tree, search suggestions, trainer card, battle front/back) comes from that game's sprite set in PokeAPI/sprites.
  - Animated where the game had animation: Crystal and Emerald idle animations, Gen IV two-frame animations, Black/White GIFs, and the animated 3D renders of Gen VII–IX.
  - Gen VII–IX index tiles use the game's box icons, because the full renders are 0.5–1 MB each.
  - Gen VI+ renders are scaled smoothly; older pixel sprites are scaled with hard pixels.
- **Which Pokémon are listed**: the index, RANDOM, page flipping and the battle pickers only include Pokémon that have a sprite in that game. A page opened directly for an absent Pokémon shows the modern sprite with a "NOT IN …" label.
- **Cries**: Gen I–V games use the original-era cries (PokeAPI `legacy` set, #1–649), with the current cries as fallback. Later games use the current cries.
- **Pokédex text**: that game's own entries are listed first and marked **THIS GAME**.
- **Device colours**: each game recolours the device (e.g. yellow for Yellow, black for Black/White) and its screen (Game Boy green for Gen I, Game Boy Color, GBA, DS and HD palettes after).

Sprite availability is computed at build time from the sprites repository tree and stored as id ranges in `public/data/games.json`.

---

## 12. Battle simulator (beta)

Route `/battle?p={pid}&o={pid}&lv={level}`, reachable from the header's **BATTLE β** button or any Pokémon page.

- **Left page**: a Gen-style battle screen with the opponent's HP box and front sprite, your Pokémon's back sprite and HP box, and a text box. It has send-out, attack-lunge, hit-blink and faint animations.
- **Right page, before battle**: pick your Pokémon and an opponent (any species or form, or RANDOM), the level (1–100), and up to 4 moves from the learnset.
  - The default moveset picks the strongest damaging moves of different types, preferring STAB, then adds a support move if there's room.
- **Right page, in battle**: a 2×2 FIGHT menu with PP, RUN, and a battle log. At the end come REMATCH, NEW OPPONENT and CHANGE MOVES.
- **Opponent AI**: scores each move by expected damage (or the value of a heal, status or boost) and picks the best, with 15% randomness.

### Mechanics

Stats at level $L$ use perfect IVs, no EVs and a neutral nature:

$$\text{HP} = \left\lfloor \frac{(2b + 31) L}{100} \right\rfloor + L + 10, \qquad \text{stat} = \left\lfloor \frac{(2b + 31) L}{100} \right\rfloor + 5$$

Damage follows the Gen V+ formula:

$$\text{damage} = \left\lfloor \left( \left\lfloor \frac{\left\lfloor \frac{2L}{5} + 2 \right\rfloor \cdot P \cdot \frac{A}{D}}{50} \right\rfloor + 2 \right) \cdot r \cdot S \cdot E \cdot C \cdot B \right\rfloor$$

where:

- $r \in [0.85, 1]$ is the random spread.
- $S = 1.5$ for same-type attacks (STAB).
- $E$ is the type multiplier from §5.1.
- $C = 1.5$ on a critical hit. The crit chance is $\frac{1}{24}$, rising with high-crit moves.
- $B = \frac{1}{2}$ for a burned Pokémon's physical moves.

Stat stages scale a stat by

$$m(s) = \begin{cases} \frac{2 + s}{2} & s \ge 0 \\ \frac{2}{2 - s} & s < 0 \end{cases}$$

Also simulated:

- accuracy, move priority, then Speed order (paralysis halves Speed)
- multi-hit moves, drain and recoil, healing moves
- stat-changing moves
- paralysis, burn, poison, sleep and freeze, with type immunities
- flinching
- charge turns (Fly, Solar Beam …) and recharge turns (Hyper Beam …), and Focus Punch
- one-hit KO moves, fixed-damage moves (Seismic Toss, Dragon Rage …) and variable-power moves (Low Kick, Gyro Ball …)

Not yet simulated: abilities, held items, weather and terrain, switching, semi-invulnerable turns, confusion. Moves whose only effect isn't simulated are marked "no effect (beta)" in the move picker.

The engine (`src/lib/battle.ts`) is pure and seedable, and is unit-tested (`src/lib/battle.test.ts`).

---

## 13. Alternate forms

295 forms come from PokeAPI's Pokémon varieties:

- 58 regional forms (Alolan, Galarian, Hisuian, Paldean)
- 97 Mega Evolutions, including the Legends: Z-A Megas
- 2 Primal Reversions
- 34 Gigantamax forms
- 104 other battle-relevant forms (Rotom appliances, Deoxys formes, Therian formes, Urshifu styles and so on)

Event costumes, totem Pokémon and duplicate forms are left out.

- **Pokémon page**: a **FORMS** row switches the page to that form (`/pokemon/26?form=10100`) without turning the page. The form changes:
  - the title, sprite, cry, artwork and types
  - weaknesses, base stats, abilities, height and weight
  - the learnset (falling back to the species' learnset for Megas and Gigantamax)
  - card art: Alolan, Galarian, Hisuian, Paldean and Mega cards where they exist
  - It also adds a **FORM** tag, marked "in battle only" for Megas, Primals and Gigantamax.
- **Quick look** lists a species' forms. Search finds them (§2.3), and every form can be used in battles.
- **Data**: `public/data/forms.json` holds a summary per form. Each `pokemon/{id}.json` carries the forms' abilities, learnsets and cards.

---

## 14. Phase 2 build plan & checklist

1. Extend the pipeline: forms, per-game sprite availability, Pokédex entries for every game, and move battle metadata (priority, effects, two-turn flags).
2. Form switcher, form search and form-aware pages.
3. Game modes: GAME selector, game-aware sprite helpers, cries, entry ordering, themes, and the game-limited dex.
4. Sign-in: clear per-error messages plus a setup diagnosis. The root cause found was Authentication never being switched on (§7.3).
5. Battle engine with unit tests, then the battle page.
6. Rename to "Registered To Pokédex", then verify (tests, build, browser checks on desktop and at 375 px) and push.

- [x] Forms switch everything on the page and are searchable.
- [x] Every game in §11 changes sprites, cries, Pokédex text order, colours and the listed Pokémon.
- [x] Sign-in failures show what's wrong and how to fix it.
- [x] Battles run start to finish with the mechanics in §12, on desktop and phone.
