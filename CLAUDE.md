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
- Uten innlogging er appen **låst med en felles kode** (standard 0102) eller Face ID/Touch ID (passkeys). Proxy-en sender til `/las` til enheten er låst opp, og `requireFamily` sjekker kodeversjonen (`lib/lock/`, `actions/lock.ts`). Nye offentlige stier legges i `OPEN_PREFIXES` i `lib/lock/token.ts`. Snarveier og andre klienter uten informasjonskapsel bruker egne nøkler (`SHARE_TOKEN`, `CRON_SECRET`).
- Sider og server actions henter databaseklienten med `getDb()` fra `lib/supabase/db.ts`, aldri `createClient()` direkte. Da virker koden både med og uten innlogging.
- Sider i `(app)` kaller `requireFamily()` fra `lib/session.ts`. Server actions gjør det samme før de skriver.

## Kalender
- Navn i tittelen («Trening Olav») gir deltaker: i dialogen for ny aktivitet (til man velger selv) og for hendelser fra Outlook når appen bare har Felles (`lib/calendar/names.ts`). Til Outlook gjentas ikke navn som allerede står i tittelen.
- Gjentakende aktiviteter lagres som én aktivitet per gang, samlet i `event_series` (`series_id` på `events`). Datoene regnes ut i `lib/calendar/recurrence.ts`, med Oslo-klokkeslett per dato (riktig over sommertid). Outlook får vanlige enkelthendelser. Lagring av en hel serie skjer i én transaksjon via `save_event_series`.

## Les inn fil
- Brukeren kan velge hvem alt i en fil gjelder (`uploads.member_ids`), før opplasting eller etterpå. Valget sendes til Claude og legges på alle ventende forslag med `applyPeople` (`lib/ai/map.ts`).
- «Si det» (mikrofonknappen i toppen / sidemenyen, `components/voice/`): tale til tekst i nettleseren (Web Speech API, `nb-NO`). Uten støtte dikterer man med tastaturet. Teksten lastes opp som en tekstfil med navn som starter med `SPOKEN_PREFIX` («Sagt inn …»), og tolkes som en muntlig beskjed (`instruction` i `lib/ai/extract.ts`). Forslagene godkjennes i «Les inn fil» (`/filer?vis=<id>`). Opplasting og tolkning ligger i `components/files/upload.ts`.
- Tolkningen lærer av familien: vaner fra kalenderen (hvem og kategori per tittel) og rettelser/avvisninger av tidligere forslag legges i prompten (`lib/ai/learning.ts`, hentes i `lib/ai/learningDb.ts`). Ingen egen tabell – det utledes av `events` og `suggestions`.

## Handleliste og levering
- Avdeling for nye varer: først det familien har valgt før (`shopping_category_memory`, huskes når noen flytter en vare), så ordlisten (`lib/shopping/categorize.ts`, bare hele ord og ordslutter, med bøyning). Ukjente varer sorteres av Claude i bakgrunnen (`after()`, `lib/ai/shoppingCategories.ts`, `ANTHROPIC_SHOPPING_MODEL`), og svaret huskes som `source = 'ai'`. Familiens valg overskrives aldri. Det skjer automatisk hver gang noe legges inn, og varer i «Annet» som ikke er vurdert før, får samme sjanse.
- Handlemodus («Handle»): store avkrysningsknapper, framdrift og skjermen holdes våken (Wake Lock). Avdelingene sorteres i butikkrekkefølge (`categories.sort_order`, endres i «Butikkrekkefølge»).
- Levering og henting (barnehage/skole), bare hverdager, i praksis for Olav. Det finnes ikke noe fast mønster, så det registreres dag for dag på egen side, **Henting** i hovedmenyen (`/henting`, `components/care/CarePage.tsx`; barnet velges øverst, `?barn=<id>`, og profilen lenker dit) (`care_entries`: barn + dato, `drop_*`/`pick_*`). Hver endring lagres med en gang. Velger man en person uten tid, foreslås sist brukte tid (`usualTime`). «Som uka før» fyller tomme dager. Hvem som kan velges, lagres i `settings` (`care_pickers`; standard er voksne brukere i `app_users`) og endres på siden. Andre skrives inn som fritekst (`drop_other`/`pick_other`, «+» på dagen), med de faste valgene Farmor, Farfar og Bestemor (`OTHER_SUGGESTIONS`). `careFor` (`lib/care/plan.ts`) gir levering og henting for en dato. Tabellene `care_plans`/`care_overrides` brukes ikke lenger.
- I kalenderen er levering og henting ikke avtaler, men en kort linje ved datoen: «🚸 Ingvild leverer og henter» / «🚸 Ingvild leverer, Marius henter» (`CareLine`, tekst fra `careSummary`/`careText` i `lib/care/plan.ts`). Den står under tittelen i dagvisningen, i dagshodene i ukevisningene (bare avatarer på telefon) og under «I dag»/«I morgen».

## Pushvarsler
- Web Push med `web-push`. Service workeren er `public/sw.js`. Enhetene ligger i `push_subscriptions`. VAPID-nøklene lages automatisk (`push_keys`, privatnøkkelen er kryptert).
- Hver enhet har egne valg (`push_subscriptions.prefs`, `lib/push/settings.ts`): hvem den tilhører, hvilke typer den får, minutter før, morgenklokkeslett og stille tid. Alle enhetene kan endres fra Innstillinger. Nye varseltyper legges i `PUSH_TYPES`.
- Varsler fra server actions sendes med funksjonene i `lib/push/notify.ts`. De kjører etter svaret (`after()`) og stopper aldri selve handlingen. Den som gjorde endringen (`activeMember`), får ikke varsel.
- Varsler på tid (påminnelser, levering/henting, morgen) ligger i `lib/push/jobs.ts` og regnes ut per enhet. De kalles fra `/api/cron/push` hvert 5. minutt (Supabase `pg_cron`). `push_log` sørger for at hvert varsel bare sendes én gang per enhet.

## Huset (Home Assistant)
- «Huset» (`/huset`, i menyen ved Innstillinger) styrer huset via Home Assistant, i sju faner: Musikk (Sonos og Spotify), Kart, Lys, Varme, Persienner, Roboter og Vanning. Fanen huskes på enheten.
- Kart (`components/huset/MapTab.tsx`, `lib/huset/floorplan.ts`): forenklet plan over 1. og 2. etasje, laget fra plantegningene (A22-105/106), ett felt per rom som i Roborock-appen. Feltet blir gult når lyset er på (sterkere jo høyere lysstyrke) og har merker for temperatur, varme (🔥), musikk (🎵) og persienne nede (▾) (`roomLook`). Trykk åpner et ark med alt for rommet: lys og scener, varme, persienner og høyttalerne i rommet. Telefon/nettbrett viser én etasje om gangen (1. etasje, 2. etasje, Ute); PC begge side om side. Rom ute som ikke står på kartet (Hage og inngang), ligger som knapper under.
- Vanning (`components/huset/WateringTab.tsx`, `toWatering` i `lib/huset/watering.ts`): Gardena-ventilene (`valve.*`) gruppert som plen, bed og takterrasse, med status, batteri og feil, og «Vann N min» (setter `number.*_watering_duration` før `valve.open_valve`) og «Stopp». Jordsensorene står øverst med råd (`wateringAdvice`: tørr jord under 30 %, fuktig nok over 50 %, frost). Anbefalte innstillinger ligger i en egen boks. Standardtid: plen 20, bed 15, tak 10 min.
- Roboter (`components/huset/RobotsTab.tsx`, `toRobots` i `lib/huset/robots.ts`): Roborock-støvsugere (`vacuum.*`, sensorene heter `sensor.<navn>_*`) og robotgressklippere (`lawn_mower.*`), med status, batteri, rom (Roborock-navn oversatt), feil og deler på overtid, og start/pause/hjem/«finn meg» (`robotService` i `lib/huset/robotControl.ts`). Vanning legges til når den er satt opp i Home Assistant.
- Romkartet (`lib/huset/rooms.ts`) bestemmer hvilke lys, termostater, persienner, sensorer og høyttalere (`speakers`) som hører til hvilket rom, og hva de heter. Navnene er familiens: Hovedbad, Guttas bad, WC, Trappa, Soverom Olav (nærmest trappa), Soverom Edvard, Takterrasse (over kontoret/vaskerommet, høyttaler «Taket») og Terrasse (ved spisestua, høyttaler «Terrassen»). KNX kommer fra ETS-prosjektet via `knx.yaml` i Home Assistant (UT og KAP, spottetyper fra Flos, heter «Lys»). Hue-grupper ute vises som ett lys. Lys som ikke står i kartet, havner i «Andre lys». `toHome` (`lib/huset/home.ts`) bygger rommene.
- Lys: hvert rom er én linje som styrer alle lysene i rommet (lysstyrke = snittet av lysene som er på, `roomBrightness`, og av/på via `lights_on`/`lights_off`). Pila åpner Hue-scenene og hvert enkelt lys (av/på, lysstyrke, fargetemperatur ved trykk på navnet). Rommene står i «Inne» og «Ute». Øverst: «Alt av i huset» og «Utelys av» (rom med `outdoor`). Lys, Varme og Persienner bruker liten skrift og én linje per enhet, så mye får plass på én skjerm. Varme: −/+ i halve grader (`stepTarget`). Persienner: opp/stopp/ned og posisjon (100 = oppe), felles styring øverst. Alt går gjennom `controlHome`, som sjekker at enheten finnes og svarer.
- «Spør huset» (`components/huset/HouseAgent.tsx`, øverst i Huset): skriv eller si en beskjed («skru av alt lyset i stua», «dim 1. etasje til 30 %»). Tale til tekst med `useSpeech` (sendes når man stopper). Svaret leses aldri opp. Claude (`ANTHROPIC_HOUSE_MODEL`, standard `claude-haiku-5-5`, effort `low`) får en kort oversikt over huset (`describeHome`, bare det som står i Huset, aldri døråpnere o.l.) og bruker verktøyene i `lib/huset/agent.ts` (lys, scener, varme, persienner, musikk, gruppering, faste grupper). Mål som «stua», «1. etasje» og «ute» løses i `lib/huset/agentTargets.ts` med etasjen fra romkartet (`floor`). Verktøyinndata valideres med Zod. Når agenten starter musikk i et rom som er med i en gruppe med andre rom, tas rommet ut først, og volum i beskjeden settes før musikken starter. Agenten oppdaterer sin egen oversikt over grupperingen med en gang (`withUnjoined`/`withJoined`), siden Home Assistant kan bruke noen sekunder på å vise endringen. Hvert svar har «Angre» (`undoHouse`), som setter lys, varme, persienner og volum/avspilling tilbake; gruppering og hva som spilles, angres ikke. Samtalen lagres ikke; de siste beskjedene sendes med som tekst.
- Endringer vises med en gang (`usePending`) og slippes når siden har hentet ny tilstand. Glidebryterne (`Range`) sender jevnlig mens man drar, og aldri samme verdi to ganger.
- Huset er bygd for å kunne flyttes til en egen app senere. Koden ligger samlet i `app/(app)/huset/`, `components/huset/`, `lib/huset/`, `actions/huset.ts` og `app/api/huset/`. Fra resten av Familien bruker den bare `requireFamily`, `getDb`/`createAdminClient`, `lib/env`, `lib/crypto` og UI-komponentene. Resten av Familien bruker bare grensesnittet `lib/huset/public.ts` (serveren: `loadHouseSummary`) og `components/huset/public.tsx` (visning: `HouseSummaryCard`, og `routeVoiceText`/`HouseVoiceReply` for «Si det»), aldri andre filer i Huset.
- «Huset nå» på «I dag»: rommene der noe er på («Stue: lys 7 %, musikk: …», «Ute: lys: …»), aktive roboter og feil fra robotene (`summarizeHouse`). Venter maks 2,5 sekunder på Home Assistant; ellers vises ikke kortet. `TodayView` får kortet som `house`, så «I dag» ikke kjenner til Huset.
- «Si det» styrer også huset: `routeVoiceText` sender husbeskjeder til «Spør huset» (svaret og «Angre» vises i arket, `HouseVoiceReply`), alt annet til «Les inn fil» som før. Ordlisten i `lib/huset/intent.ts` avgjør de tydelige tilfellene; er den usikker, spør Claude (`lib/huset/intentAi.ts`). En påminnelse om å gjøre noe senere går til «Les inn fil».
- Bare serveren snakker med Home Assistant (`lib/huset/ha.ts`, `HA_URL` + `HA_TOKEN`). Tokenet tilhører HA-brukeren «Familien-appen», som ikke er administrator. Cover-bilder går via `/api/huset/cover/[id]`.
- Styring er lov overalt, så lenge appen er låst opp. Server actions sjekker at høyttaleren finnes i Home Assistant før de kaller en tjeneste.
- Rommene vises som en liste (`RoomList`). Rom som spiller sammen, står samlet med farget strek og «Løs opp». Trykk på et rom gir forrige/neste, favoritter og «Velg musikk». Gruppering: lenkeknappen på et rom åpner brikker («Spill også i»), ett trykk kobler et rom til (`join`), og × tar et rom ut (`unjoin`). På større skjermer kan man også dra et rom i håndtaket og slippe det på et annet, eller på «Slipp her for å spille alene». Endringen vises med en gang (`moveSpeaker`) til Sonos har svart.
- Faste grupper (`house_groups`) ligger som knapper øverst. Et trykk kobler rommene og setter eventuelt volum og musikk (`startHouseGroup`).
- Siden henter tilstanden hvert 4. sekund mens den er synlig. Egne endringer (volum, spill/pause) vises med en gang og holdes til Home Assistant har svart.
- Sonos-favoritter er kildene (`source_list`) og spilles med `select_source`.
- Spotify: Sonos spiller en `open.spotify.com`-lenke (spor, album, spilleliste) med `media_player.play_media`, via Spotify-kontoen som er koblet til Sonos. Familien søker med appens nøkkel (`SPOTIFY_CLIENT_ID`/`SECRET`, Client Credentials) og henter spillelister og likte sanger med hver persons innlogging (`spotify_accounts`, kryptert, ingen policyer). Innloggingen bruker signert state (`lib/huset/oauthState.ts`) og hovedadressen (`NEXT_PUBLIC_SITE_URL`) som tilbakeadresse, så den virker også fra en testversjon.
- Huset har eget manifest (`/api/huset/manifest`), så det kan legges på hjemskjermen som en egen app.

## Lagring
- Handleliste, oppgaver og notater lagres automatisk mens man skriver, som i iOS Notater. Dialogene har ingen «Lagre»-knapp, bare «Ferdig» som lukker etter at siste endring er lagret. Bruk `useAutosave` (`components/useAutosave.ts`, logikken ligger i `lib/autosave.ts`).
- Unntak: forslag som skal godkjennes (Les inn fil) og kalenderaktiviteter, siden de synkes til Outlook.

## Sletting og «I dag»
- Sletting spør ikke «Er du sikker?». Den skjer med en gang og kan angres i noen sekunder (`useUndo` i `components/ui/UndoToast.tsx`). Delete-handlingene returnerer det som trengs for å angre (`deleted`/`undoIds`), og det finnes en `restore…`-handling.
- Kalenderaktiviteter slettes mykt først (`deleted_at`). Etter angrefristen (`finalizeDeletes` i `actions/events.ts`) slettes de for godt og i Outlook; synken lar ferske slettinger vente.
- `/i-dag` er oversikten appen åpner på (PWA `start_url`): vær, hvem skal hva i dag og i morgen, oppgaver med frist og handlelisten.

## Validering
- All input til server actions og API-ruter valideres med Zod (`src/lib/validation/`), med vennlige feilmeldinger på norsk.
- Server actions returnerer `{ ok, message }` i stedet for å kaste feil til UI.

## UI og design
- Stilen er lys, varm og barnevennlig. Bruk tokenene i `globals.css` (`bg-card`, `text-ink`, `bg-primary` …) og klassene i `components/ui/styles.ts`.
- Trykkflater bruker `min-h-12` (ca. 40–45 px), med avrundede former (`rounded-2xl`/`rounded-3xl`).
- Medlemsfarge og avatar (`components/ui/Avatar.tsx`) brukes konsekvent overalt der en person vises.
- **Responsivt oppsett:**
  - Grunnstørrelsen settes på `html` i `globals.css`: 13 px på telefon, 14 px fra `sm` og 15 px fra `lg` (strammere oppsett for voksne). Alt i Tailwind er `rem` og skalerer med, så ikke hardkod `px` for tekst.
  - `AppShell` har tre oppsett: bunnmeny + kompakt topplinje (< `md`), smal ikonmeny (`md`–`lg`, iPad på høykant) og full sidemeny (≥ `lg`).
  - Sidetitler bruker `font-display text-xl font-bold sm:text-2xl lg:text-3xl`, og seksjonstitler `text-lg sm:text-xl`. Luft mellom seksjoner er `gap-4`.
  - Rader med filterknapper bruker klassen `chip-row`. Den gir én linje som kan rulles sidelengs på telefon, og bryter linjen fra `sm`.
  - På telefon vises sekundære knapper bare som ikon (`<span className="hidden sm:inline">tekst</span>`) med `aria-label`.
  - Skrivefelt holdes på minst 16 px på berøringsskjerm (ellers zoomer iOS), og det er allerede ordnet globalt.
  - Aktiviteter i kalenderen vises med `EventChipContent` (`components/calendar/EventChip.tsx`). Maks tre står side om side; resten samles i «+N». Når boksene blir smale, krymper skriften, teksten brytes (aldri «…»), og lange ord (over 9 tegn) forkortes (`lib/calendar/shorten.ts`). Ord fjernes aldri, og høyden alene gir ingen forkorting. Dette styres av container queries (`.ev-*` i `globals.css`), ikke av JS-måling.
  - I dagvisningene vises været time for time (lite symbol + temperatur) ved timeaksen (`HourWeather`, `lib/weather/hourly.ts`).
  - Dagvisningen på telefon (< `md`) har fast høyde og ruller inni seg selv, slik at 08–20 synes med en gang (`usePhoneDayFit`). «Per person» får plass i bredden på telefon (dag: smale kolonner; uke: alle radene og dagene på én skjerm).
  - Tekst som ikke får plass brytes over flere linjer (`wrap-break-word`). Bruk ikke `truncate`/«…».
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
- **SQL skal alltid også gis ferdig til innliming i svaret i chatten** (én samlet blokk Marius kan lime rett inn i Supabase SQL Editor), ikke bare stå i PR-en.
- GitHub Actions (`.github/workflows/ci.yml`) kjører lint, typesjekk, tester og bygg på hver PR.
- Vercel lager en testversjon (Preview) per PR. Marius tester den og merger.
- Migrasjoner kjøres i Supabase **før** merge. Skriv dem bakoverkompatible (nye tabeller/kolonner), slik at koden som allerede er i produksjon tåler dem.

## Før commit
`npm run lint && npm run typecheck && npm test && npm run build` skal være grønt.
Commit ofte, med tydelige meldinger som starter med fasen, f.eks. `Fase 2: per-person-visning i kalenderen`.
