# Registered-to-Pokédex: Build Instructions

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

### 7.1 Project config (web config is public by design; it lives in `src/lib/firebase.ts`)

```js
const firebaseConfig = {
  apiKey: "AIzaSyA2cYPuhEcCKg3J_uSMVeYtDiO_YhC6HSs",
  authDomain: "registered-to-pokedex.firebaseapp.com",
  projectId: "registered-to-pokedex",
  storageBucket: "registered-to-pokedex.firebasestorage.app",
  messagingSenderId: "811588813548",
  appId: "1:811588813548:web:b02496a9050fcb485b1bc9",
  measurementId: "G-JGSCJWTTBP"
};
```

Security comes from Firestore rules and authorised domains, not from hiding this config.

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

1. Authentication → Sign-in method → enable **Google**. Then add the hosting domains (and `localhost`) under authorised domains.
2. Firestore → create the database in **production mode**.
3. Deploy the rules and hosting:
   ```bash
   firebase deploy --only firestore:rules,hosting
   ```
4. Optional: upgrade to Blaze, set the secret, then deploy the functions:
   ```bash
   firebase deploy --only functions
   ```

**Local development against emulators**: start them with `firebase emulators:start --only auth,firestore,functions`, then run `VITE_USE_EMULATORS=1 npm run dev`. The functions emulator reads `ANTHROPIC_API_KEY` from the gitignored `functions/.secret.local`.

---

## 8. Repository layout

```
INSTRUCTIONS.md        this spec
README.md              quick start
firebase.json          hosting (dist/, SPA rewrite, caching headers), firestore, functions
.firebaserc            default project: registered-to-pokedex
firestore.rules        security rules (§7.2)
firestore.indexes.json
tests/firestore.rules.test.ts  security-rule tests (npm run test:rules, Firestore emulator)
index.html
vite.config.ts  tsconfig*.json  package.json
scripts/build-data.mjs data pipeline (§4)
public/data/…          generated JSON (no images)
src/
  main.tsx  App.tsx
  lib/      firebase, auth, data loading, search, typeChart, catchRate, sprites, votes, caught, aiNotes, age
  components/ DexShell, Book, SearchBar, PokemonTile, QuickLook, PokeballReveal, TypeBadge, Tag,
              StatBars, MoveTable, EvolutionTree, CardViewer, VoteButtons, CatchButton, ProfessorNotes…
  pages/    IndexPage, PokemonPage, TrainerPage, NotFoundPage
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
- [x] No Pokémon images in the repo or database (only URLs; the one asset is a hand-drawn favicon). No Claude API key anywhere in the repo or bundle.
- [x] Usable at 375 px width with no horizontal page scroll. Keyboard-navigable, with visible focus.
