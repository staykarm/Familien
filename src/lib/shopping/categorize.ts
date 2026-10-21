/**
 * Gjetter butikk-kategori ut fra varenavnet, slik at listen sorteres etter hvor varene står.
 * Dette er første, raske gjetning. Det familien har valgt før (minnet), går foran, og ukjente varer
 * sendes til Claude (lib/ai/shoppingCategories.ts). Ingen treff gir null.
 */
const KEYWORDS: Record<string, string[]> = {
  "Frukt og grønt": [
    "eple", "banan", "pære", "appelsin", "klementin", "mandarin", "drue", "druer", "sitron", "lime", "avokado", "mango",
    "kiwi", "ananas", "melon", "vannmelon", "fersken", "nektarin", "plomme", "granateple", "dadler",
    "bær", "jordbær", "blåbær", "bringebær", "agurk", "tomat", "cherrytomat", "salat", "isbergsalat", "ruccola",
    "paprika", "chili", "løk", "rødløk", "vårløk", "sjalottløk", "hvitløk", "gulrot", "gulrøtter", "potet", "søtpotet",
    "brokkoli", "blomkål", "kål", "rosenkål", "squash", "aubergine", "spinat", "sopp", "sjampinjong", "mais",
    "maiskolbe", "erter", "sukkererter", "purre", "selleri", "stangselleri", "ingefær", "frukt", "grønnsak",
    "urter", "basilikum", "persille", "koriander", "dill", "gressløk", "rødbete", "pastinakk", "kålrot", "reddik",
  ],
  Meieri: [
    "melk", "lettmelk", "helmelk", "skummet", "ost", "smør", "yoghurt", "rømme", "fløte", "matfløte", "kremfløte",
    "egg", "kesam", "cottage", "crème", "kremost", "skyr", "kefir", "pålegg", "brunost", "geitost", "margarin",
    "jarlsberg", "norvegia", "parmesan", "mozzarella", "fetaost", "feta", "cheddar", "brie", "philadelphia",
    "synnøve", "tine", "biola", "kulturmelk", "havremelk", "soyamelk", "oatly", "piano", "smøreost",
  ],
  "Kjøtt og fisk": [
    "kjøtt", "kylling", "kyllingfilet", "kyllinglår", "kalkun", "svin", "svinekjøtt", "storfe", "biff", "entrecote",
    "indrefilet", "pølse", "pølser", "wienerpølse", "grillpølse", "bacon", "skinke", "spekeskinke", "kotelett",
    "karbonade", "laks", "torsk", "fisk", "reker", "sei", "tunfisk", "makrell", "kjøttdeig", "kjøttboller",
    "kjøttkaker", "lam", "lammekjøtt", "salami", "leverpostei", "postei", "fiskekaker", "fiskeboller", "scampi",
    "ørret", "hamburger", "burger", "ribbe", "pinnekjøtt", "kebab", "taco­kjøtt", "svinenakke", "nakkekoteletter",
  ],
  "Brød og bakst": [
    "brød", "grovbrød", "rundstykke", "rundstykker", "lefse", "lomper", "tortilla", "knekkebrød", "baguette",
    "boller", "bolle", "pita", "polarbrød", "loff", "ciabatta", "croissant", "wienerbrød", "kake", "muffins",
    "skolebrød", "kanelbolle", "kanelsnurr", "rugbrød", "hamburgerbrød", "pølsebrød", "wraps", "flatbrød",
  ],
  Tørrvarer: [
    "pasta", "spagetti", "spaghetti", "makaroni", "penne", "tagliatelle", "lasagne", "ris", "basmatiris", "mel",
    "hvetemel", "sammalt", "sukker", "melis", "salt", "pepper", "krydder", "kanel", "havregryn", "müsli",
    "granola", "frokostblanding", "cornflakes", "hermetikk", "bønner", "kikerter", "linser", "buljong",
    "olje", "olivenolje", "rapsolje", "eddik", "ketchup", "sennep", "majones", "remulade", "salsa", "taco",
    "tacokrydder", "tacoskjell", "nudler", "syltetøy", "honning", "kaffe", "te", "kakao", "nøtter", "mandler",
    "tomatsaus", "pastasaus", "pesto", "soyasaus", "kokosmelk", "hermetiske", "tomatpuré", "bakepulver",
    "gjær", "vaniljesukker", "rosiner", "peanøttsmør", "nugatti", "leverpostei­boks", "sirup", "maisstivelse",
    "potetmos", "posesuppe", "suppe",
  ],
  Frys: [
    "frossen", "frosne", "fryst", "is", "iskrem", "pizza", "grandiosa", "fiskepinner", "pommes", "pommes frites",
    "frityrpotet", "frosne bær", "wok­grønnsaker", "lapskaus",
  ],
  "Snacks og drikke": [
    "chips", "potetgull", "brus", "saft", "juice", "appelsinjuice", "eplejuice", "sjokolade", "godteri", "smågodt",
    "kjeks", "popcorn", "vann", "mineralvann", "farris", "imsdal", "øl", "vin", "cola", "pepsi", "fanta", "sprite",
    "solo", "rødvin", "hvitvin", "rosévin", "musserende", "pils", "julebrus", "nøttemiks", "smoothie", "kvikk lunsj", "melkesjokolade", "freia", "twist", "seigmenn", "lakris",
    "snacks", "dip", "dipmix", "energidrikk", "red bull", "iste", "kaffedrikk", "pepsi max", "coca-cola",
  ],
  "Hus og hygiene": [
    "dopapir", "toalettpapir", "tørkerull", "kjøkkenrull", "såpe", "håndsåpe", "sjampo", "shampo", "balsam",
    "tannkrem", "tannbørste", "bleier", "våtservietter", "oppvask", "oppvaskmiddel", "oppvasktabletter",
    "vaskemiddel", "tøymykner", "zalo", "søppelpose", "søppelposer", "bæreposer", "poser", "fryseposer",
    "plastfolie", "aluminiumsfolie", "bakepapir", "tørkepapir", "deodorant", "batteri", "batterier", "servietter",
    "lyspærer", "lyspære", "telys", "stearinlys", "bomullspads", "q-tips", "bind", "tamponger", "barberblad",
    "solkrem", "plaster", "zewa", "lambi", "klut", "svamp", "rengjøring", "klor", "vaskeklut",
  ],
};

// Bøyningsendelser: «tomat» treffer «tomater», «eple» treffer «epler», «agurk» treffer «agurkene».
const SUFFIXES = ["", "e", "en", "er", "ene", "et", "r", "a", "s"];

function normalize(s: string): string {
  return s.toLocaleLowerCase("nb").normalize("NFC").replace(/­/g, "").trim();
}

/** Nøkkelen varer huskes under: små bokstaver og ett mellomrom mellom ordene. */
export function itemKey(name: string): string {
  return normalize(name).replace(/\s+/g, " ");
}

/** Gir nøklene i ryddet form (uten myke bindestreker), lengste først. */
const ENTRIES = Object.entries(KEYWORDS).flatMap(([category, keys]) => keys.map((k) => ({ category, key: normalize(k) })));

export function guessCategoryName(itemName: string): string | null {
  const full = itemKey(itemName);
  const words = full.split(/[\s,.\-/]+/).filter(Boolean);
  let best: { category: string; score: number } | null = null;
  for (const { category, key } of ENTRIES) {
    let score = 0;
    // Flere ord («pepsi max», «kvikk lunsj»): må stå i navnet som en helhet.
    if (key.includes(" ")) {
      if (full === key || full.includes(key)) score = 200 + key.length;
    } else {
      for (const w of words) {
        // Norske sammensetninger har hovedordet sist («potetchips» er chips), så bare hele ord og
        // ordslutter teller – aldri treff midt i et ord («vannmelon» er ikke vann).
        // Nøkler på 1–3 tegn («is», «te», «sei») må være hele ordet (med bøyning).
        for (const suffix of SUFFIXES) {
          const form = key + suffix;
          const exact = w === form;
          const atEnd = !exact && key.length >= 4 && w.endsWith(form);
          if (!exact && !atEnd) continue;
          score = Math.max(score, key.length + (exact ? 150 : 100));
        }
      }
    }
    if (score && (!best || score > best.score)) best = { category, score };
  }
  return best?.category ?? null;
}
