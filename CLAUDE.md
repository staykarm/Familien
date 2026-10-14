@AGENTS.md

# Familien – prosjektkonvensjoner

Familieapp for planlegging (kalender, Outlook-synk, vær, oppgaver, handleliste, filinnlesning og Oda).
Arkitektur og faser står i README. Marius godkjenner hver fase før den startes.

## Stack
- Next.js 16 (App Router, `src/`), React 19, TypeScript strict, Tailwind CSS 4 og Vitest. Samme oppsett som BacalaoCup.
- Supabase via `@supabase/ssr`. Hosting og cron på Vercel.
- Next 16 har brudd mot eldre versjoner, så les `node_modules/next/dist/docs/` ved tvil. `middleware` heter nå `proxy` (`src/proxy.ts`). `cookies()`, `headers()`, `params` og `searchParams` er async. `PageProps`/`LayoutProps` er globale typer som `next typegen` genererer.

## Språk og tid
- **All tekst i UI skal være på norsk (bokmål).** Kommentarer skrives på norsk.
- Tidssonen er alltid `Europe/Oslo` (`TIME_ZONE` i `src/lib/time.ts`). Tidspunkt lagres som `timestamptz` og formateres med `Intl` og `timeZone`. Ikke stol på serverens lokale tid, fordi Vercel kjører i UTC.

## Supabase og sikkerhet
- Det finnes tre klienter:
  - `lib/supabase/server.ts`: innlogget bruker, RLS gjelder.
  - `lib/supabase/client.ts`: nettleseren.
  - `lib/supabase/admin.ts`: service role, kun for webhooks, cron og hemmelige tabeller.
- Kode som bruker service role-nøkkelen (`supabaseSecretKey()`) skal ha `import "server-only"`.
- Alle tabeller har RLS. Familietabeller har policy med `public.is_family()`. Tabeller med hemmeligheter (tokens o.l.) har **ingen** policyer.
- Ingen hemmeligheter i koden. Nye miljøvariabler legges i `.env.example` med kommentar og leses med `serverEnv()` fra `lib/env.ts`.
- Skjemaendringer legges som nye filer `supabase/migrations/NNNN_beskrivelse.sql`. Endre aldri en migrasjon som er kjørt. Oppdater `src/lib/database.types.ts` samtidig.
- **Innlogging er av inntil videre** (`AUTH_ENABLED` i `lib/env.ts`, styres av miljøvariabelen `AUTH_ENABLED`). Da hopper proxy-en over sesjonssjekk, og serveren bruker service role. Databasen er fortsatt stengt for den offentlige nøkkelen.
- Sider og server actions henter databaseklienten med `getDb()` fra `lib/supabase/db.ts`, aldri `createClient()` direkte. Da virker koden både med og uten innlogging.
- Sider i `(app)` kaller `requireFamily()` fra `lib/session.ts`. Server actions gjør det samme før de skriver.

## Kalender
- Gjentakende aktiviteter lagres som én aktivitet per gang, samlet i `event_series` (`series_id` på `events`). Datoene regnes ut i `lib/calendar/recurrence.ts`, med Oslo-klokkeslett per dato (riktig over sommertid). Outlook får vanlige enkelthendelser. Lagring av en hel serie skjer i én transaksjon via `save_event_series`.

## Validering
- All input til server actions og API-ruter valideres med Zod (`src/lib/validation/`), med vennlige feilmeldinger på norsk.
- Server actions returnerer `{ ok, message }` i stedet for å kaste feil til UI.

## UI og design
- Stilen er lys, varm og barnevennlig. Bruk tokenene i `globals.css` (`bg-card`, `text-ink`, `bg-primary` …) og klassene i `components/ui/styles.ts`.
- Trykkflater skal være minst 48 px (`min-h-12`), med avrundede former (`rounded-2xl`/`rounded-3xl`).
- Medlemsfarge og avatar (`components/ui/Avatar.tsx`) brukes konsekvent overalt der en person vises.
- **Responsivt oppsett:**
  - Grunnstørrelsen settes på `html` i `globals.css`: 14 px på telefon, 15 px fra `sm` og 16 px fra `lg`. Alt i Tailwind er `rem` og skalerer med, så ikke hardkod `px` for tekst.
  - `AppShell` har tre oppsett: bunnmeny + kompakt topplinje (< `md`), smal ikonmeny (`md`–`lg`, iPad på høykant) og full sidemeny (≥ `lg`).
  - Sidetitler bruker `font-display text-2xl font-bold sm:text-3xl lg:text-4xl`, og seksjonstitler `text-xl sm:text-2xl`.
  - Rader med filterknapper bruker klassen `chip-row`. Den gir én linje som kan rulles sidelengs på telefon, og bryter linjen fra `sm`.
  - På telefon vises sekundære knapper bare som ikon (`<span className="hidden sm:inline">tekst</span>`) med `aria-label`.
  - Skrivefelt holdes på minst 16 px på berøringsskjerm (ellers zoomer iOS), og det er allerede ordnet globalt.
  - Aktiviteter i kalenderen vises med `EventChipContent` (`components/calendar/EventChip.tsx`). Maks tre står side om side; resten samles i «+N». Når boksene blir smale, krymper skriften, teksten brytes, og tittelen byttes til en kortere variant (`lib/calendar/shorten.ts`). Dette styres av container queries (`.ev-*` i `globals.css`), ikke av JS-måling.
  - Test på 390 px (telefon), 820 px (iPad høykant) og 1180/1440 px før commit.

## Mappestruktur
- `src/app/(auth)`: offentlige sider.
- `src/app/(app)`: krever familieinnlogging.
- `src/app/api`: webhooks, cron og ruter med egen autentisering.
- `src/actions/`: server actions per domene.
- `src/lib/`: rene hjelpefunksjoner, med tester i `*.test.ts` ved siden av.
- `src/components/`: komponenter.

## Arbeidsflyt med PR
- **Ingen push rett til `main`.** Alt arbeid gjøres på en egen gren med én PR per fase eller oppgave. Små rettelser kan samles i samme PR.
- Grenenavn: `fase-N-kort-navn`, `fiks/kort-navn` eller `oppsett/kort-navn`.
- PR-beskrivelsen følger `.github/pull_request_template.md`, med SQL-blokker som må kjøres før merge.
- GitHub Actions (`.github/workflows/ci.yml`) kjører lint, typesjekk, tester og bygg på hver PR.
- Vercel lager en testversjon (Preview) per PR. Marius tester den og merger.
- Migrasjoner kjøres i Supabase **før** merge. Skriv dem bakoverkompatible (nye tabeller/kolonner), slik at koden som allerede er i produksjon tåler dem.

## Før commit
`npm run lint && npm run typecheck && npm test && npm run build` skal være grønt.
Commit ofte, med tydelige meldinger som starter med fasen, f.eks. `Fase 2: per-person-visning i kalenderen`.
