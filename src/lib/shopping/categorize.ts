/**
 * Gjetter butikk-kategori ut fra varenavnet, slik at listen sorteres etter hvor varene står.
 * Treffer på ordstammer (melk → «Lettmelk», «Melk»). Ingen treff gir null (= «Annet»).
 */
const KEYWORDS: Record<string, string[]> = {
  "Frukt og grønt": [
    "eple", "banan", "pære", "appelsin", "klementin", "druer", "drue", "sitron", "lime", "avokado", "mango", "kiwi",
    "bær", "jordbær", "blåbær", "bringebær", "agurk", "tomat", "salat", "paprika", "løk", "hvitløk", "gulrot",
    "potet", "brokkoli", "blomkål", "squash", "spinat", "sopp", "mais", "erter", "purre", "ingefær", "frukt", "grønnsak", "urter", "basilikum", "persille",
  ],
  Meieri: ["melk", "ost", "smør", "yoghurt", "rømme", "fløte", "egg", "kesam", "cottage", "crème", "kremost", "skyr", "kefir", "pålegg", "brunost", "margarin"],
  "Kjøtt og fisk": [
    "kjøtt", "kylling", "kalkun", "svin", "storfe", "biff", "pølse", "bacon", "skinke", "kotelett", "karbonade",
    "laks", "torsk", "fisk", "reker", "sei", "tunfisk", "makrell", "kjøttdeig", "kjøttboller", "lam",
  ],
  "Brød og bakst": ["brød", "rundstykke", "lefse", "tortilla", "knekkebrød", "baguette", "boller", "bolle", "pita", "polarbrød", "loff", "ciabatta"],
  Tørrvarer: [
    "pasta", "spagetti", "spaghetti", "makaroni", "ris", "mel", "sukker", "salt", "krydder", "havregryn", "müsli",
    "frokostblanding", "hermetikk", "bønner", "linser", "buljong", "olje", "eddik", "ketchup", "sennep", "majones",
    "salsa", "taco", "nudler", "syltetøy", "honning", "kaffe", "te", "kakao", "nøtter", "tomatsaus", "pesto",
  ],
  Frys: ["frossen", "frosne", "is", "pizza", "fiskepinner", "pommes"],
  "Snacks og drikke": ["chips", "brus", "saft", "juice", "sjokolade", "godteri", "smågodt", "kjeks", "popcorn", "vann", "øl", "vin", "cola", "nøttemiks"],
  "Hus og hygiene": [
    "dopapir", "toalettpapir", "tørkerull", "såpe", "sjampo", "shampo", "balsam", "tannkrem", "tannbørste", "bleier",
    "våtservietter", "oppvask", "vaskemiddel", "zalo", "søppelpose", "plastfolie", "aluminiumsfolie", "tørkepapir", "deodorant", "batteri",
  ],
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFC").trim();
}

export function guessCategoryName(itemName: string): string | null {
  const words = normalize(itemName).split(/[\s,.-]+/).filter(Boolean);
  let best: { category: string; score: number } | null = null;
  for (const [category, keys] of Object.entries(KEYWORDS)) {
    for (const key of keys) {
      for (const w of words) {
        // Norske sammensetninger har hovedordet sist («potetchips» er chips), så treff på slutten veier tyngst.
        // Svært korte nøkler (≤2 tegn, f.eks. «is», «te») må være hele ord; 3 tegn må stå sist i ordet.
        const exact = w === key;
        const atEnd = w.endsWith(key) && key.length >= 3;
        const inside = w.includes(key) && key.length >= 4;
        if (!exact && !atEnd && !inside) continue;
        const score = key.length + (exact || atEnd ? 100 : 0);
        if (!best || score > best.score) best = { category, score };
      }
    }
  }
  return best?.category ?? null;
}
