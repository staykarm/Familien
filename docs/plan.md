# Familieappen – arkitektur- og faseplan

## Kontekst
Repoet `staykarm/familien` er helt tomt (ingen commits). Vi bygger en familieapp for planlegging med kalender, Outlook-synk, vær, oppgaver, handleliste, AI-filinnlesning og Oda. Teknisk plattform gjenbrukes fra BacalaoCup (som jeg har lest).

**Funn i BacalaoCup:** Next.js 16.3 (App Router), React 19.2, Tailwind 4 (`@theme inline`-tokens i `globals.css`), Vitest, ESLint 9, `@supabase/supabase-js` uten auth (RLS er åpen). PWA via `src/app/manifest.ts` og genererte ikoner (`icon-192/route.tsx`, `apple-icon.tsx`). Yr-henting finnes i `src/lib/weather.ts` (`normalizeYr`, `normalizeYrHourly`) og `src/app/api/weather/route.ts`. CLAUDE.md → AGENTS.md, med regelen om å lese Next-dokumentasjonen i `node_modules/next/dist/docs/` fordi Next 16 har brudd.
→ Vi **følger samme stack og versjoner** og legger til `@supabase/ssr` (ekte auth), Zod og FullCalendar. Yr-normaliseringen portes med Europe/Oslo og `symbol_code`-ikoner i stedet for emoji. RLS gjøres stramt i stedet for åpent.

**Beslutninger fra deg:**
- Innlogging: Ingvild og Marius har egne brukere (magisk lenke). I tillegg en delt familiebruker (e-post og passord) for barna på nettbrett/telefon, med «Hvem er jeg?»-velger.
- Kalender: FullCalendar gratisversjon (MIT). Kolonner per person bygger vi selv.
- Outlook-visning: deltakernavn i tittelen, f.eks. «Fotball (Edvard, Olav)», og appkategorien som Outlook-kategori.
- Oda: utsettes til fase 8. Grensesnittet planlegges nå.

---

## Stack
- `next@16.3.x`, `react@19.2.x`, TypeScript, Tailwind 4, ESLint, Vitest (som BacalaoCup)
- `@supabase/ssr` og `@supabase/supabase-js` (auth via cookies, server-klient og browser-klient, `proxy.ts`/middleware for sesjonsoppfrisking)
- `zod` for validering av alle server actions og API-ruter
- `@fullcalendar/react`, `daygrid`, `timegrid`, `interaction`, `list`, `luxon3` (navngitt tidssone Europe/Oslo) og norsk locale `nb`
- `@azure/msal-node` (Outlook, fase 3), `@anthropic-ai/sdk` og `mammoth` for Word til tekst (fase 7)
- `lucide-react` for UI-ikoner. MET Norway sine `weathericons` (SVG) kopieres til `public/weather/`.
- Krypteringshjelper: Node `crypto` AES-256-GCM med `TOKEN_ENCRYPTION_KEY` (32 byte, base64)

## Mappestruktur
```
src/
  app/
    (auth)/logg-inn/            innlogging (magisk lenke + familiebruker)
    (app)/layout.tsx            AppShell: bunnmeny (mobil) / sidemeny (nettbrett/PC)
    (app)/page.tsx              Kalender (hovedside)
    (app)/oppgaver/  handleliste/  filer/  profiler/[id]/  innstillinger/
    api/
      outlook/connect|callback|webhook/route.ts
      cron/outlook-renew/route.ts   cron/outlook-sync/route.ts
      weather/route.ts   geocode/route.ts
      uploads/[id]/analyze/route.ts
    manifest.ts  icon*.tsx           PWA (som BacalaoCup)
  components/   calendar/ (CalendarView, MemberColumns, EventDialog, WeatherBadge)
                ui/ (Button, Sheet, Avatar, Chip …)  tasks/  shopping/  suggestions/
  lib/
    supabase/ (server.ts, client.ts, admin.ts – service role kun på server)
    validation/ (zod-skjemaer per domene)
    outlook/ (graph.ts, auth.ts, mapping.ts, sync.ts)   ← mapping.ts er rene funksjoner med tester
    weather/ (yr.ts, cache.ts, symbols.ts)
    ai/ (extract.ts, schema.ts)
    crypto.ts  time.ts (Oslo-hjelpere)  types.ts (genererte DB-typer)
  actions/      server actions per domene (events.ts, tasks.ts, shopping.ts, profiles.ts …)
supabase/migrations/0001_init.sql …   supabase/seed.sql (medlemmer, kategorier)
```

## Datamodell (Supabase)
Én familie, så vi har ingen multi-tenant-kolonner. RLS: hjelpefunksjonen `is_family()` (security definer) sjekker at `auth.uid()` finnes i `app_users`. Alle familietabeller får policyene `using (is_family()) with check (is_family())`. Hemmelige tabeller får **ingen** policyer og nås bare med service role fra server.

| Tabell | Nøkkelfelt |
|---|---|
| `app_users` | `user_id` (auth.users), `role` (`adult`/`shared`), `member_id` (nullable) |
| `members` | `id`, `slug`, `name`, `color`, `icon`, `avatar_path`, `details` (jsonb: skole, aktiviteter, størrelser, allergier, fritekst), `is_shared` (Felles), `sort_order` |
| `categories` | `id`, `scope` (`event`/`task`/`shopping`), `name`, `icon`, `color`, `outlook_category` |
| `events` | `id`, `title`, `start_at`/`end_at` (timestamptz), `all_day`, `location`, `notes`, `category_id`, `created_by`, `updated_at`, `deleted_at` (myk sletting for synk) + synkfelt: `outlook_id`, `outlook_ical_uid`, `outlook_change_key`, `outlook_series_id`, `outlook_last_modified`, `sync_status` (`local`/`pending`/`synced`/`conflict`/`error`), `sync_error`, `origin` (`app`/`outlook`) |
| `event_participants` | `event_id`, `member_id` (PK på begge) |
| `tasks` | `id`, `title`, `notes`, `assignee_id` (member), `due_at`, `category_id`, `status` (`todo`/`doing`/`done`), `completed_at` |
| `shopping_items` | `id`, `name`, `quantity`, `category_id`, `checked`, `checked_at`, `added_by`, `sort_order`. Realtime er aktivert. |
| `shopping_templates` / `shopping_template_items` | malnavn, ikon / varer med kategori og mengde |
| `settings` | `key`, `value` jsonb (f.eks. `weather_location` = {label, lat, lon}) |
| `weather_cache` | `lat`, `lon` (avrundet til 4 desimaler), `payload`, `expires_at`, `last_modified` — kun service role |
| `outlook_connection` | `account_email`, `calendar_id`, `token_cache_encrypted`, `delta_link`, `subscription_id`, `subscription_expires_at`, `client_state_hash` — kun service role |
| `sync_log` | tidspunkt, retning, resultat, feilmelding (vises for voksne) |
| `uploads` | `storage_path`, `filename`, `mime`, `uploaded_by`, `status` (`uploaded`/`analyzing`/`done`/`failed`), `error` |
| `suggestions` | `upload_id`, `kind` (`event`/`task`/`shopping`), `payload` jsonb (Zod-validert), `status` (`pending`/`approved`/`rejected`), `created_ref` |

Storage-buckets: `avatars` (privat, signerte URL-er) og `uploads` (privat). Policyer: `is_family()`.

---

## Outlook-synk (design, implementeres i fase 3)
- **Auth:** MSAL-node confidential client med autoriseringskode-flyt, authority `https://login.microsoftonline.com/consumers`, scopes `Calendars.ReadWrite offline_access User.Read` (+ `MailboxSettings.ReadWrite` om vi skal opprette fargede master-kategorier). Eieren logger inn én gang via `/api/outlook/connect` og velger den delte kalenderen fra en liste. MSAL-token-cachen (med refresh-token) lagres AES-GCM-kryptert i `outlook_connection`.
- **Ut (app → Outlook):** server action skriver til DB (`sync_status=pending`) og kaller deretter Graph `POST/PATCH/DELETE /me/calendars/{id}/events`. `POST` bruker `transactionId = events.id` (idempotent, så vi unngår duplikater ved retry). Tittelen blir «Fotball (Edvard, Olav)», kategori blir Outlook-kategori, og appens felt lagres i en `singleValueExtendedProperty` (`String {egen GUID} Name FamilienApp`) med JSON `{appId, participants, categoryId, v}`. Vi lagrer `changeKey` fra svaret. Feil gir `pending`, som cron prøver på nytt.
- **Inn (Outlook → app):** Graph-abonnement på `/me/calendars/{id}/events` (created/updated/deleted) mot `/api/outlook/webhook`. Webhooken svarer på `validationToken`, verifiserer `clientState`, returnerer 202 raskt og kjører delta-synk i `after()`. Delta (`/me/calendars/{id}/calendarView/delta`, vindu fra −3 til +12 måneder) gir endringene. Endrede hendelser hentes deretter med `$expand=singleValueExtendedProperties`, fordi delta ikke tar med extended properties. Delta kjøres også ved oppstart og fra cron som reserve.
- **Fornyelse:** abonnementer på hendelser varer maks ca. 3 dager. Vercel Cron kjører daglig (Hobby tillater 1 gang/døgn), fornyer til maks utløp, gjenoppretter abonnementet hvis det er borte og kjører delta.
- **Ekko-demping:** innkommende hendelser med samme `changeKey` som vi sist skrev blir ignorert.
- **Konflikter:** `PATCH` sendes med `If-Match`. Får vi 412 (endret i Outlook siden sist), hentes Outlook-versjonen, raden markeres `conflict`, og appen viser «Endret i Outlook – behold min / bruk Outlook sin». Innkommende endring på en rad uten lokale ventende endringer gjelder direkte (Outlook vinner).
- **Duplikater:** vi matcher først på extended property `appId`, så på `outlook_id`, så på `iCalUId`. `transactionId` hindrer doble opprettelser.
- **Hendelser laget direkte i Outlook:** de importeres med `origin=outlook`. Deltakere tolkes fra tittelsuffiks «(Navn, Navn)» når navnene matcher medlemmer, og ellers blir deltaker Felles. Kategori settes fra Outlook-kategori hvis den er kjent, og ellers «Annet». Første gang de redigeres i appen får de extended property («adoptert»).
- **Gjentakende hendelser:** occurrences fra calendarView vises. I v1 kan én forekomst redigeres. Serier opprettes og redigeres i Outlook (kan utvides senere).

## Vær (fase 5)
`/api/weather` leser `settings.weather_location` og bruker `weather_cache`. Når `expires_at` har passert, kaller den `api.met.no/.../compact` med `User-Agent: Familien/1.0 (github.com/staykarm/familien; <MET_CONTACT_EMAIL>)` og `If-Modified-Since`. Ved 304 forlenges cachen. Koordinatene rundes til 4 desimaler. Normaliseringen portes fra BacalaoCup `normalizeYr`/`normalizeYrHourly` med TZ Europe/Oslo og `symbol_code` → `/weather/{symbol_code}.svg`. Krediteringen «Værdata fra Yr / MET Norway» lenker til yr.no. Stedssøk går via `/api/geocode` → `ws.geonorge.no/adresser/v1/sok`. Standardsted er «Vardeveien, Oslo», og jeg ber deg bekrefte riktig treff hvis søket gir flere.

## Filinnlesning (fase 7)
Opplasting til `uploads`-bucket → `/api/uploads/[id]/analyze`. PDF og bilder sendes som dokument- og bildeblokker til Claude API, mens Word konverteres med mammoth til tekst. Svaret kommer som strukturert output (tool/JSON-skjema), valideres med Zod og lagres som `suggestions`. Modell styres av `ANTHROPIC_MODEL` (standard: siste Sonnet). Prompten får dagens dato, Europe/Oslo og listen over medlemmer og kategorier. Godkjenningssiden lar deg godkjenne, redigere eller avvise hvert forslag, og bare godkjente forslag skrives til events/tasks/shopping (og videre til Outlook).

## Oda (fase 8, avklares da)
Funn: det finnes ikke noe hostet MCP-endepunkt. `kolonialno/oda-mcp` (Oda sin GitHub, nå ikke offentlig klonbar) og `gbbirkisson/mcp-oda` kjører lokalt over stdio med Oda-brukernavn og -passord, og stdio-servere kan ikke kobles til Claude sin MCP-connector. Nå lager vi bare grensesnittet: knappen «Send til Oda» → forhåndsvisning (vare → foreslått Oda-produkt) → **eksplisitt bekreftelse** → server-rute. Valget mellom en egen Oda-klient i server-rute og en selvhostet MCP tas i fase 8.

## Design
Lys og varm palett (krem-bakgrunn, myke pasteller) definert som Tailwind 4-tokens slik som i BacalaoCup. Avrundede kort (`rounded-2xl`/`3xl`), minst 48 px trykkflater og en rund og vennlig font (f.eks. Nunito). Hvert medlem har farge og avatar, som brukes på kalenderhendelser (fargekant, avatarstabel), i filterchips og på oppgaver. Bunnmeny med store ikoner på mobil. Barnemodus («Hvem er jeg?») viser «Min dag» øverst.

### Kalender med FullCalendar gratis
- Vanlig visning: `timeGridDay`/`timeGridWeek`/`dayGridMonth` med medlemsfilter-chips, fargede hendelser og avatarer.
- «Per person»-visning: dag viser én `timeGridDay`-instans per medlem + Felles side om side, med `height="auto"` og en felles ytre scroll, slik at timeaksene står på linje (aksen vises bare i første kolonne). Uke viser én rad per medlem (`dayGridWeek`/`listWeek` uten header, under én felles ukeheader). Måned viser filter og fargede prikker per medlem.
- Vær-badge (symbol + maks-temp) i dag-, uke- og månedshodene via `dayHeaderContent`/`dayCellContent`. Trykk åpner timesvarsel-ark.
- Oppgaver med frist vises som egne «allDay»-elementer med avkrysningsikon.

---

## Faser (jeg venter på godkjenning før hver fase)
1. **Oppsett, auth og profiler.** Next 16-skjelett som i BacalaoCup, Tailwind-tema, PWA-manifest og ikoner, `@supabase/ssr`-klienter og proxy, innloggingsside (magisk lenke + familiebruker), «Hvem er jeg?», migrasjon `0001` (app_users, members, categories, settings, RLS, `is_family`, storage-buckets) og seed (Ingvild, Marius, Edvard, Olav, Felles). Profilside med redigering og bildeopplasting. `CLAUDE.md`, `AGENTS.md`, README med oppsett og `.env.example`.
2. **Kalender med lokal data.** events/participants/categories, FullCalendar-visninger, per-person-visning, opprett/rediger/slett-dialog (Zod), Oslo-tid.
3. **Outlook-synk.** Som beskrevet over, med `vercel.json`-cron, synkstatus i UI og konfliktdialog.
4. **Oppgaver.** CRUD, filtrering per person og status, frister i kalenderen.
5. **Vær.** Cache, ikoner, kreditering, stedsvalg i innstillinger.
6. **Handleliste.** Realtime-liste, kategorier, avhuking og maler.
7. **Filinnlesning.** Opplasting, Claude-analyse og godkjenningsliste.
8. **Oda.** Undersøkelse + implementasjon med bekreftelse.

## Git
Første commit (skjelett) går på `main`, siden repoet er tomt. Deretter bruker hver fase en egen gren med jevnlige commits («Fase 1: …»-meldinger). Jeg lager PR bare hvis du ber om det.

---

## Manuelle steg for deg (kommer også i README)
**Supabase**
1. Opprett prosjekt på supabase.com (region `eu-north-1` Stockholm), og noter database-passordet.
   *(Denne økten har tilgang til Supabase Management API. Hvis du vil, kan jeg opprette prosjektet og kjøre migrasjonene for deg.)*
2. Under Project Settings → API: kopier Project URL, publishable/anon key og secret/service_role key.
3. Under Authentication → Providers → Email: skru av «Allow new users to sign up». Under URL Configuration: sett Site URL til Vercel-domenet og legg til `http://localhost:3000/**` og `https://<domene>/**` i Redirect URLs.
4. Opprett brukere under Authentication → Users: Ingvild, Marius og familiebrukeren (familie@…, med passord). Jeg lager et SQL-snippet som kobler dem i `app_users`.
5. Kjør migrasjonene (`supabase db push` eller SQL-editoren).

**Vercel**
1. Importer `staykarm/familien` (Framework: Next.js).
2. Legg inn env-variablene fra `.env.example` (Production + Preview).
3. Etter fase 3: cron i `vercel.json` aktiveres automatisk, og `CRON_SECRET` må settes.

**Microsoft Entra (fase 3)**
1. Gå til entra.microsoft.com (logg inn med en hvilken som helst Microsoft-konto) → App registrations → New registration.
2. Supported account types: «Personal Microsoft accounts only» (eller «Any Entra ID tenant + personal accounts»).
3. Redirect URI (Web): `https://<domene>/api/outlook/callback` og `http://localhost:3000/api/outlook/callback`.
4. Under Certificates & secrets: lag en client secret (noter verdien og utløpsdatoen).
5. Under API permissions → Microsoft Graph → Delegated: `Calendars.ReadWrite`, `offline_access`, `User.Read` (+ `MailboxSettings.ReadWrite`).
6. Kopier Application (client) ID og secret til Vercel.
7. Eieren av den delte kalenderen logger inn via Innstillinger → «Koble til Outlook».

**Øvrig:** Anthropic API-nøkkel (fase 7) og kontakt-e-post til MET sin User-Agent.

### `.env.example`
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=            # kun server
NEXT_PUBLIC_SITE_URL=http://localhost:3000
TOKEN_ENCRYPTION_KEY=           # openssl rand -base64 32
CRON_SECRET=                    # openssl rand -hex 32
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_AUTHORITY=https://login.microsoftonline.com/consumers
OUTLOOK_WEBHOOK_CLIENT_STATE=   # openssl rand -hex 32
MET_CONTACT_EMAIL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

## Verifisering per fase
- `npm run lint`, `npx tsc --noEmit`, `npm test` (Vitest) og `npm run build` før hver commit.
- Enhetstester for rene funksjoner: tittel- og deltaker-mapping (inn/ut), konfliktvalg, Yr-normalisering (fixture-JSON), Oslo-tid rundt sommertid og Zod-skjemaer.
- RLS-test: SQL-skript som verifiserer at anon ikke får lese noe, og at familiebruker får lese og skrive.
- Manuell sjekk med `npm run dev` + Playwright-screenshot på mobil- og nettbrettbredde. Outlook-synken testes mot en testkalender før den kobles til den delte.
