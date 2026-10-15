# Familien

Familieapp for planlegging for Ingvild, Marius, Edvard og Olav (+ Felles): kalender med Outlook-synk, værvarsel fra Yr, oppgaver, handleliste i sanntid, filinnlesning med AI-forslag og Oda.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (database, auth, storage, realtime) · Vercel (hosting og cron) · Zod · Vitest. Appen er en PWA og kan installeres på hjemskjermen.

## Status

| Fase | Innhold | Status |
|---|---|---|
| 1 | Oppsett, innlogging, «Hvem er jeg?», profiler med bilde | ✅ |
| 2 | Kalender (dag/uke/måned, per person) med lokal data | ✅ |
| 3 | Synk med delt Outlook-kalender (Microsoft Graph) | ✅ |
| 4 | Oppgaver | ✅ |
| 5 | Værvarsel fra Yr / MET Norway | ✅ |
| 6 | Handleliste i sanntid og faste lister | ✅ |
| 6b | Notater (som iOS Notater) | ✅ |
| 7 | Filinnlesning med forslag (Claude API) | ✅ |
| 8 | Oda-handlekurv med Claude-agent | ✅ |
| 9 | «I dag»-oversikt og «Angre» i stedet for «Er du sikker?» | ✅ |

## Kom i gang lokalt

```bash
npm install
cp .env.example .env.local   # fyll inn Supabase-verdiene
npm run dev                  # http://localhost:3000
```

Sjekker: `npm run lint`, `npm run typecheck`, `npm test` og `npm run build`.

## Oppsett – det du må gjøre manuelt

### 1. Supabase
1. Opprett et nytt prosjekt på [supabase.com](https://supabase.com/dashboard) med region **Stockholm (eu-north-1)**. Ta vare på database-passordet.
2. Gå til **Project Settings → API Keys** og kopier:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (eller anon) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key (eller service_role) → `SUPABASE_SECRET_KEY` (kun server)
3. Kjør migrasjonene. Velg ett av alternativene:
   - SQL Editor: lim inn og kjør filene i `supabase/migrations/` i rekkefølge (`0001_…`, `0002_…`, `0003_…` osv.).
   - CLI: `npx supabase link --project-ref <ref>` og så `npx supabase db push`.
4. Gå til **Authentication → Sign In / Providers → Email** og slå **av** «Allow new users to sign up». Bare brukere dere oppretter selv slipper inn.
5. Gå til **Authentication → URL Configuration**:
   - Site URL: `https://<vercel-domenet>`
   - Redirect URLs: `http://localhost:3000/**` og `https://<vercel-domenet>/**`
6. Gå til **Authentication → Emails → Magic Link** og legg til koden i malen, slik at innlogging fungerer i hjemskjerm-appen på iPhone, der lenker åpnes i Safari og ikke i appen:
   ```html
   <h2>Logg inn i Familien</h2>
   <p>Koden din: <strong>{{ .Token }}</strong></p>
   <p>Eller trykk her: <a href="{{ .ConfirmationURL }}">Logg inn</a></p>
   ```
7. Opprett brukere under **Authentication → Users → Add user**:
   - Ingvild og Marius med sine e-postadresser (passord trengs ikke, de bruker kode/lenke).
   - En delt familiebruker for barna, f.eks. `familie@<deres-domene>`, med passord. Huk av «Auto confirm».
8. Åpne `supabase/scripts/link_users.sql`, bytt til de riktige e-postadressene og kjør skriptet i SQL Editor. Det kobler brukerne til familien. Brukere som ikke er koblet, ser «Ingen tilgang».
9. (Valgfritt) Kjør `supabase/scripts/verify_rls.sql` for å se at anonyme ikke får lest noe.

### 2. Vercel
1. Gå til [vercel.com/new](https://vercel.com/new) og importer `staykarm/familien`. Framework: Next.js, standardinnstillinger.
2. Under **Settings → Environment Variables** legger du inn variablene fra `.env.example` (Production og Preview). `NEXT_PUBLIC_SITE_URL` = `https://<vercel-domenet>`.
3. Deploy, og oppdater Site URL og Redirect URLs i Supabase hvis domenet endret seg.
4. Serverkoden kjører i Frankfurt (`"regions": ["fra1"]` i `vercel.json`), samme sted som Supabase-databasen (eu-central-1). Uten dette kjører Vercel i USA, og hvert databasekall må over Atlanteren. Flyttes databasen, må regionen følge etter.
5. Fase 3 legger inn cron i `vercel.json`. Da må `CRON_SECRET` være satt. På Hobby-planen kjører cron maks én gang i døgnet, og det holder for å fornye Outlook-abonnementet.

### 3. Microsoft Entra / Azure (fase 3)
1. Gå til [entra.microsoft.com](https://entra.microsoft.com) og logg inn med en hvilken som helst Microsoft-konto. **App registrations → New registration**:
   - Navn: `Familien`
   - Supported account types: **Personal Microsoft accounts only** (eller «Accounts in any organizational directory and personal Microsoft accounts»)
   - Redirect URI, type **Web**: `https://<vercel-domenet>/api/outlook/callback`
2. Under **Authentication** legger du også til `http://localhost:3000/api/outlook/callback`.
3. Under **Certificates & secrets → New client secret** lager du en secret. Kopier *Value* til `MS_CLIENT_SECRET` og skriv ned utløpsdatoen.
4. Under **API permissions → Add → Microsoft Graph → Delegated** legger du til `Calendars.ReadWrite`, `offline_access`, `User.Read` og `MailboxSettings.ReadWrite` (det siste for fargede Outlook-kategorier).
5. Kopier **Application (client) ID** til `MS_CLIENT_ID`. `MS_AUTHORITY` er `https://login.microsoftonline.com/consumers`.
6. Generer `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) og `OUTLOOK_WEBHOOK_CLIENT_STATE` (`openssl rand -hex 32`).
7. Legg `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_AUTHORITY`, `OUTLOOK_WEBHOOK_CLIENT_STATE` og `CRON_SECRET` inn i Vercel (Production).
8. Eieren av den delte kalenderen (outlook.com-kontoen) logger inn én gang via **Innstillinger → Outlook-kalender → Koble til Outlook** og velger kalenderen.

> Jobb-PC-er som er meldt inn i Intune kan stoppe innlogging med private Microsoft-kontoer. Gjør registreringen fra en privat enhet (det går fint fra mobilen via portal.azure.com).

### 4. Øvrig
- `MET_CONTACT_EMAIL` (fase 5, valgfri): legges til i User-Agent mot api.met.no. Uten den brukes GitHub-lenken som kontaktinfo.
- `ANTHROPIC_API_KEY` (fase 7 og 8): fra [console.anthropic.com](https://console.anthropic.com).
- `TOKEN_ENCRYPTION_KEY` (fase 3 og 8): `openssl rand -base64 32`. Krypterer Oda-innloggingen (og senere Outlook-tokenet).

## Innlogging og tilgang
> **Nå:** innlogging er slått av (`AUTH_ENABLED=false`, standard). Appen åpnes rett inn, og man velger «Hvem er du?». Serveren bruker service role-nøkkelen, så databasen er fortsatt stengt for den offentlige nøkkelen, men **alle som har lenken kan bruke appen**. Stegene om brukere, e-postmal og `link_users.sql` i Supabase-oppsettet kan vente til innlogging skrus på.
>
> **Skru på innlogging senere:** gjør stegene 4–8 i Supabase-oppsettet, sett `AUTH_ENABLED=true` i Vercel og redeploy.

Når innlogging er på:
- **Voksne** logger inn med e-post og får en kode eller lenke.
- **Familie-nettbrett/telefon** logger inn med den delte familiebrukeren (e-post og passord).
- Etter innlogging velger man **«Hvem er du?»**. Valget lagres per enhet og kan byttes ved å trykke på avataren øverst.
- All data er beskyttet med Supabase RLS: bare brukere i `app_users` (`public.is_family()`) har tilgang. Profilbilder ligger i en privat bucket og vises med signerte URL-er.

## Arkitektur

```
src/
  proxy.ts                 fornyer Supabase-sesjonen, sender uinnloggede til /logg-inn
  app/(auth)/logg-inn      innlogging (kode/lenke + passord)
  app/(app)/…              kalender, oppgaver, handleliste, profiler, innstillinger
  app/api/…                webhooks og cron (fra fase 3)
  actions/                 server actions (Zod-validert)
  components/              AppShell, Avatar, skjemaer
  lib/                     supabase-klienter, session, validering, tid (Europe/Oslo)
supabase/migrations/       SQL-migrasjoner (kjøres i rekkefølge)
supabase/scripts/          engangsskript (koble brukere, RLS-sjekk)
```

### Datamodell (fase 1)
- `members`: Ingvild, Marius, Edvard, Olav og Felles, med farge, ikon, profilbilde og fritekstdetaljer (`details` som liste av {label, value}).
- `app_users`: kobler Supabase-brukere til familien, med rolle `adult`/`shared`.
- `categories`: kategorier for aktiviteter, oppgaver og handlevarer, med ikon og farge.
- `settings`: nøkkel/verdi, f.eks. værsted.

Senere faser legger til `events`, `event_participants`, `tasks`, `shopping_*`, `outlook_connection`, `weather_cache`, `uploads` og `suggestions`. Hele arkitektur- og faseplanen står i [docs/plan.md](docs/plan.md).

### Outlook-synk (fase 3)
Koden ligger i `src/lib/outlook/`. Synken går begge veier mot én delt kalender.
- **Innlogging:** OAuth-kodeflyt mot Microsoft (`/api/outlook/connect` → `/api/outlook/callback`), uten MSAL. Access- og refresh-token lagres AES-256-GCM-kryptert i `outlook_connection`, som ikke har RLS-policyer. Eieren av kalenderen logger inn én gang under **Innstillinger → Outlook-kalender** og velger kalenderen.
- **App → Outlook:** etter hver lagring, flytting eller sletting sendes aktiviteten i bakgrunnen (`after()`). Appens id sendes som `transactionId`, så vi kjenner igjen våre egne hendelser og unngår duplikater. Tittelen blir «Fotball (Edvard, Olav)», kategorien blir Outlook-kategorien med samme navn, og fargede kategorier opprettes i Outlook ved oppstart.
- **Outlook → app:** Graph sender varsel til `/api/outlook/webhook`, som kjører en delta-spørring (`calendarView/delta`, fra 3 måneder bakover til 12 fremover). Hendelser laget i Outlook importeres. Deltakerne leses fra navnene i parentes, ellers blir det Felles. Våre egne endringer som kommer tilbake (samme `changeKey`) ignoreres.
- **Konflikter:** før vi endrer en hendelse i Outlook, sjekker vi at `changeKey` er den vi sist så. Er den endret begge steder, får aktiviteten ⚠️ i kalenderen, og familien velger «Behold min» eller «Bruk Outlook sin».
- **Gjentakende aktiviteter:** appen lager én vanlig aktivitet per gang og samler dem i en serie (`event_series`, regler i `src/lib/calendar/recurrence.ts`). I Outlook blir de derfor enkelthendelser, ikke en Outlook-serie. Hver forekomst kan endres for seg, eller «denne og alle senere» på en gang. Serier som lages i Outlook importeres som enkeltaktiviteter.
- **Reserve:** Vercel Cron (`/api/cron/outlook`, daglig kl. 03:17 UTC) fornyer varslene (de varer maks 7 døgn, vi ber om 4) og kjører en full synk i tilfelle et varsel har gått tapt. «Synk nå» i Innstillinger gjør det samme.
- **Gjentakende hendelser:** hver forekomst vises og kan endres eller slettes enkeltvis. Selve serien endres i Outlook.
- Synkloggen (`sync_log`) vises under Innstillinger.

### Oda (fase 8)
Oda har ikke noe hostet MCP-endepunkt, så appen har en egen Oda-klient på serveren (`src/lib/oda/`) og en Claude-agent som velger varer. Se «Oda» under.

## Værvarsel
- Data fra MET Norway sitt Locationforecast 2.0 (`compact`), samme kilde som Yr. Serveren henter varselet og bufrer det i `weather_cache` etter `Expires`/`Last-Modified`. Nettleseren spør aldri MET direkte.
- Stedet lagres i `settings.weather_location`. Første gang slås «Vardeveien, Oslo» opp hos Kartverket (ws.geonorge.no). Det kan endres under **Innstillinger → Sted for værvarsel**.
- Værsymbolene er Yr sine offisielle (metno/weathericons, MIT-lisens) og ligger i `public/weather/`.

## Handleliste og sanntid
- Etter hver endring sender serveren et lite «endret»-signal på Supabase Realtime-kanalen `familien-handleliste` (broadcast via REST med service-nøkkelen). Åpne skjermer henter da listen på nytt via en server action. Selve listen går aldri over den åpne kanalen, så dette virker både med og uten innlogging.
- Reserve: listen hentes også når appen kommer i forgrunnen og hvert 30. sekund.
- Krever at **Realtime → Settings → «Allow public access»** er på i Supabase. Det er standard. Står det «Kobler til» i stedet for «Live» på handlelisten, er det den innstillingen du bør sjekke.
- Varer får butikkavdeling automatisk ut fra navnet (`src/lib/shopping/categorize.ts`), og det kan endres per vare.

## Notater
- Fungerer som iOS Notater. Første linje blir tittel, og notatet lagres automatisk mens man skriver. Det har sjekklister, punktlister, nummererte lister, overskrift, fet og kursiv tekst, og angre/gjør om.
- Notater kan festes øverst og høre til én person (eller Felles). De gjenfinnes med søk og filter per person.
- «Nylig slettet» beholder notater i 30 dager, og de kan gjenopprettes.
- Innholdet lagres som Tiptap-JSON i `notes.content`, med ren tekst i `plain_text` for søk og forhåndsvisning.
- Hvis to skjermer skriver i samme notat samtidig, avsløres det av `version`. Den som taper får beskjed og kan laste inn nyeste versjon. Endringer vises live via Realtime-kanalen `familien-notater`.

## Les inn fil (AI-forslag)
- Siden **Les inn fil** (📄-ikonet øverst på mobil, nederst i sidemenyen på PC) tar imot bilde (kamera), PDF, Word (.docx) eller tekst, opptil 20 MB. Store bilder krympes i nettleseren før opplasting.
- Filen lastes rett til den private bucketen `uploads` via en signert opplastingslenke. Vercel slipper ikke store filer gjennom serveren.
- `/api/uploads/[id]/analyze` sender filen til Claude (`claude-opus-5-5`, kan overstyres med `ANTHROPIC_MODEL`). Svaret kommer som strukturert JSON med sammendrag, aktiviteter, oppgaver og handlevarer. Prompten får dagens dato, Oslo-tid, familiemedlemmene med profildetaljer (skole/klasse o.l.) og kategoriene. Hvis forespørselen avvises av sikkerhetsfiltrene, tar en annen modell automatisk over (server-side fallback).
- Forslagene lagres i `suggestions` med status `pending`. **Ingenting legges i kalender, oppgaver eller handleliste før noen trykker ✓**, eventuelt etter å ha endret forslaget. «Godkjenn alle» finnes også.
- Krever `ANTHROPIC_API_KEY` i Vercel.

## Oda
- På **Handleliste** finnes «Send til Oda» (hele den åpne listen), og hver fast liste har «Til Oda».
- Oda kobles til én gang under **Innstillinger → Oda** med e-post og passord. Innloggingen deles av hele familien, og lagres AES-256-GCM-kryptert med `TOKEN_ENCRYPTION_KEY` i tabellen `oda_connection`, som ikke har RLS-policyer (kun service role). «Koble fra» sletter den.
- **Husk passordet** (valgfritt, på som standard): passordet lagres også kryptert. Før hver bruk sjekker appen at økten fortsatt er innlogget (Oda gir ellers en tom gjestekurv uten feil). Er den utløpt, logger appen inn på nytt av seg selv. Godtar ikke Oda passordet lenger, glemmes det, og man må koble til på nytt. Uten husket passord må man koble til på nytt når Oda logger appen ut.
- `/api/oda/forslag` søker opp hver vare hos Oda og henter kjøpshistorikken. Deretter velger en Claude-agent (`src/lib/oda/agent.ts`) én vare per linje. Den foretrekker varer familien har kjøpt før, og kan søke selv med bedre søkeord. Agenten legger **aldri** noe i kurven, og bare produkt-id-er som faktisk kom fra Oda godtas.
- Forslaget vises for godkjenning: man kan endre antall, velge alternativ eller fjerne linjer. Først ved «Legg i handlekurven» legges varene i Oda-kurven. **Ingenting bestilles.** Man fullfører kjøpet selv i Oda-appen eller på oda.com. Varene kan hukes av på handlelisten samtidig.
- **Risiko:** Oda har ikke noe offentlig API. Klienten bruker de samme kallene som nettsiden, og kan slutte å virke hvis Oda endrer noe. Da får man en feilmelding, og handlelisten fungerer som før.
- Krever `ANTHROPIC_API_KEY` og `TOKEN_ENCRYPTION_KEY` i Vercel, og migrasjonene `0011_oda.sql` og `0012_oda_password.sql`.

## Del til appen (skjermbilder, PDF-er, tekst)
Filer og tekst kan sendes rett til **Les inn fil** fra delingsmenyen på mobilen, uten å gå via filbehandleren. De lastes opp til `/api/del`, og «Les inn fil» åpnes og tolker dem med en gang.

- **Android og PC (Chrome/Edge):** installer appen («Legg til på startskjermen» / «Installer app»). Da står **Familien** i delingsmenyen. Dette er PWA «share_target» i `src/app/manifest.ts`.
- **iPhone/iPad:** Safari støtter ikke «share_target». Bruk i stedet en snarvei i Snarveier-appen:
  1. Lag en ny snarvei og kall den **Del til Familien**.
  2. Under snarveiens innstillinger (ⓘ) slår du på **Vis i delingsark**. Velg typene **Bilder**, **PDF-er** og **Filer**.
  3. Legg til handlingen **Hent innholdet i URL**:
     - URL: `https://familien-two.vercel.app/api/del`
     - Metode: **POST**
     - Forespørselsinnhold: **Skjema**, med ett felt av typen **Fil**. Navnet skal være `filer`, og verdien **Snarveiinndata**.
     - Overskrifter: `Accept` = `application/json`
  4. Legg til **Hent ordbokverdi**. Nøkkel: `url`, fra «Innholdet i URL».
  5. Legg til **Åpne URL-er**.

  Nå står **Del til Familien** i delingsmenyen, for eksempel på et skjermbilde.
- Maks ca. 4 MB per deling, fordi det er grensen hos Vercel. Vanlige skjermbilder er godt under det. Er et bilde for stort, kan du legge **Konverter bilde → JPEG** inn i snarveien før opplastingen.
- Med innlogging på (`AUTH_ENABLED=true`) må snarveien også sende `Authorization: Bearer <SHARE_TOKEN>`. Uten innlogging trengs ikke `SHARE_TOKEN`.

