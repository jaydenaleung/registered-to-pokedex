# Registered To Pokédex

A pixel-art Pokédex for all 1025 Pokémon, styled as the original red device and laid out as a book you flip through.

- Every Pokémon has its own page:
  - official TCG card art
  - a tag cloud: type, weaknesses, age, catch difficulty, legendary/mythical status and more
  - lore, moves and evolution line
  - a Poké Ball throw animation
- **Forms**: switch any page to its Alolan, Galarian, Hisuian, Paldean, Mega, Primal, Gigantamax or other form (295 in all).
- **Game modes**: the GAME menu reskins the whole Pokédex as any of 22 games, from Red/Blue to Pokémon Champions. It changes the sprites, cries, Pokédex text, device colours, and which Pokémon are listed.
- **Battle simulator (beta)**: pick any two Pokémon or forms, a level and up to 4 moves, then battle with Gen V+ mechanics.
- Index pages show pixel sprites that animate on hover, with a quick-look popup.
- Signed-in trainers can **vote** on Pokémon and **log catches**. Their trainer card counts how many they've caught.
- **Professor's Notes**: a short field guide for each species written by Claude through a Cloud Function, written once and cached for everyone.

The full spec is in [INSTRUCTIONS.md](INSTRUCTIONS.md).

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The Pokémon data in `public/data/` is already generated and committed, so the app runs without any setup.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server (uses the live Firebase project) |
| `npm test` | Run unit tests: search grammar, type chart, catch odds, data integrity |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run data` | Rebuild `public/data/` from PokeAPI and PokemonTCG data on GitHub (add `-- --refresh` to re-download) |
| `npm run test:rules` | Run the Firestore security-rule tests in the emulator. Needs `firebase-tools` and Java. |

### Local emulators (optional)

Install the Firebase CLI:

```bash
npm install -g firebase-tools
```

Build the functions:

```bash
npm --prefix functions install && npm --prefix functions run build
```

Start the emulators:

```bash
firebase emulators:start --only auth,firestore,functions
```

In a second terminal, start the dev server pointed at the emulators:

```bash
VITE_USE_EMULATORS=1 npm run dev
```

The functions emulator reads the Claude key from `functions/.secret.local` (gitignored), which contains one line: `ANTHROPIC_API_KEY=...`

## Deploying (project owner)

1. In the Firebase console for `registered-to-pokedex`:
   - **Authentication → Get started**, then Sign-in method → enable **Google**. Sign-in fails with "Sign-in isn't switched on" until this is done.
   - Add any custom domain under Authentication → Settings → *Authorized domains*. `localhost`, `*.web.app` and `*.firebaseapp.com` are allowed by default.
   - Firestore → create the database in **production mode**. Votes only work once the rules below are deployed.
2. Deploy the rules and the site:
   ```bash
   firebase login
   ```
   ```bash
   npm run build && firebase deploy --only firestore:rules,hosting
   ```
3. Professor's Notes is optional and needs the **Blaze** plan. Store the Claude API key as a secret:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   Then deploy the function:
   ```bash
   firebase deploy --only functions
   ```
   Without the function deployed, the rest of the app still works, and the notes panel says the Professor is away.

> **Security:** the Claude API key must never be committed or shipped to the browser. It lives only in Firebase Secret Manager. The Firebase web config in `src/lib/firebase.ts` is public by design. Access is enforced by `firestore.rules`, which the tests in `tests/` cover.

## Credits

- Pokémon data comes from [PokeAPI](https://github.com/PokeAPI/pokeapi), and card data from [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data).
- Images are hotlinked from Bulbapedia (Bulbagarden Archives), the official TCG image CDN and [PokeAPI/sprites](https://github.com/PokeAPI/sprites). No images are stored in this repo or in the database.
- Pokémon and all related names and artwork are © Nintendo, Creatures Inc. and GAME FREAK inc. This is a non-commercial fan project.
