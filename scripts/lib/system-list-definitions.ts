// These lists use the WCA export dated 2026-08-06.
//
// The source population is one primary person row (`sub_id = 1`). First names
// use the first token in `persons.name`, surnames use the last token before a
// parenthesized local name, and counts are case-insensitive. The surname
// ranking used all 294,065 export rows for the analysis requested on 2026-08-06.
//
// Keep the first 25 entries in each group public. The remaining entries are
// still directly accessible system lists, but stay out of the public list
// directory. This keeps direct list links useful without cluttering the list.
export const PUBLIC_SYSTEM_LIST_LIMIT = 25;

type NameCount = [name: string, count: number];
type ListMatch = "first-name" | "last-name";
type Gender = "m" | "f" | null;

export interface SystemListDefinition {
  key: string;
  alias: string;
  version: number;
  name: string;
  description: string | null;
  token: string;
  match: ListMatch;
  gender: Gender;
  visibility: "public" | "private";
}

const MALE_FIRST_NAMES: NameCount[] = [
  ["Daniel", 2170],
  ["David", 1592],
  ["Juan", 1571],
  ["Samuel", 1333],
  ["Ethan", 1323],
  ["Lucas", 1284],
  ["Gabriel", 1210],
  ["Alexander", 1095],
  ["Ryan", 1051],
  ["Muhammad", 1038],
  ["William", 1010],
  ["Benjamin", 1005],
  ["Michael", 997],
  ["Jacob", 995],
  ["Matthew", 975],
  ["Noah", 966],
  ["James", 942],
  ["Joshua", 939],
  ["Thomas", 939],
  ["Adam", 928],
  ["Jack", 926],
  ["Andrew", 907],
  ["Alex", 884],
  ["Nathan", 861],
  ["John", 831],
  ["Nguyễn", 792],
  ["Liam", 778],
  ["Luis", 769],
  ["Sebastian", 760],
  ["Oliver", 736],
  ["Kevin", 724],
  ["Isaac", 716],
  ["Diego", 711],
  ["Luke", 708],
  ["Max", 683],
  ["Jonathan", 671],
  ["Carlos", 652],
  ["Miguel", 627],
  ["Dylan", 618],
  ["Henry", 617],
  ["Santiago", 617],
  ["Joseph", 613],
  ["Ivan", 602],
  ["Aaron", 601],
  ["José", 575],
  ["Pedro", 563],
  ["Evan", 558],
  ["Christian", 556],
  ["Caleb", 527],
  ["Ian", 526],
];

const FEMALE_FIRST_NAMES: NameCount[] = [
  ["Maria", 298],
  ["Ana", 219],
  ["Anna", 198],
  ["Laura", 139],
  ["Emma", 135],
  ["Emily", 121],
  ["Sofia", 120],
  ["Sara", 116],
  ["Julia", 115],
  ["Sarah", 112],
  ["Isabella", 96],
  ["Jessica", 92],
  ["Olivia", 90],
  ["María", 88],
  ["Hannah", 84],
  ["Alice", 80],
  ["Chloe", 76],
  ["Sophia", 75],
  ["Sophie", 74],
  ["Andrea", 67],
  ["Mariana", 65],
  ["Amanda", 64],
  ["Clara", 64],
  ["Grace", 62],
  ["Abigail", 61],
  ["Natalia", 59],
  ["Eva", 58],
  ["Paula", 57],
  ["Victoria", 57],
  ["Alexandra", 55],
  ["Nicole", 55],
  ["Mia", 54],
  ["Anastasia", 53],
  ["Camila", 53],
  ["Charlotte", 53],
  ["Maya", 53],
  ["Elizabeth", 52],
  ["Lily", 52],
  ["Claire", 51],
  ["Zoe", 51],
  ["Nguyễn", 49],
  ["Diana", 48],
  ["Elena", 48],
  ["Ella", 48],
  ["Gabriela", 47],
  ["Jennifer", 47],
  ["Rebecca", 47],
  ["Valeria", 46],
  ["Daniela", 44],
  ["Michelle", 43],
];

// Top 100 surname tokens from the complete WCA persons export. The first 25
// are public; ranks 26-100 are private-directory entries.
const LAST_NAMES: NameCount[] = [
  ["Wang", 2931],
  ["Li", 2531],
  ["Chen", 2465],
  ["Zhang", 2381],
  ["Liu", 1889],
  ["Lee", 1251],
  ["Yang", 1248],
  ["Wu", 1142],
  ["Huang", 1130],
  ["Kim", 1097],
  ["Lin", 1037],
  ["Silva", 849],
  ["Xu", 824],
  ["Zhao", 709],
  ["Zhou", 663],
  ["Santos", 647],
  ["Yu", 630],
  ["Singh", 605],
  ["Smith", 570],
  ["Sun", 563],
  ["Kumar", 557],
  ["Lu", 510],
  ["Zhu", 510],
  ["Nguyen", 490],
  ["Zheng", 478],
  ["Hu", 464],
  ["Ma", 459],
  ["Jiang", 457],
  ["He", 431],
  ["Guo", 416],
  ["Park", 415],
  ["Shah", 410],
  ["Garcia", 395],
  ["Rodriguez", 394],
  ["Sharma", 383],
  ["Gupta", 377],
  ["Wei", 377],
  ["Chang", 362],
  ["Johnson", 362],
  ["Patel", 362],
  ["Cheng", 361],
  ["Liang", 361],
  ["Oliveira", 359],
  ["Gao", 356],
  ["Jain", 344],
  ["Han", 336],
  ["Cruz", 332],
  ["Tan", 332],
  ["Luo", 317],
  ["Song", 316],
  ["Tang", 316],
  ["Xie", 316],
  ["García", 314],
  ["Shi", 310],
  ["Yan", 309],
  ["Martinez", 298],
  ["Lopez", 296],
  ["Rodríguez", 286],
  ["Torres", 280],
  ["Brown", 279],
  ["López", 278],
  ["Miller", 278],
  ["Sanchez", 278],
  ["Hong", 277],
  ["Feng", 272],
  ["Chan", 271],
  ["Wong", 267],
  ["Flores", 266],
  ["Williams", 265],
  ["Choi", 264],
  ["Shen", 263],
  ["Jones", 256],
  ["González", 254],
  ["Gonzalez", 253],
  ["Su", 251],
  ["Pérez", 250],
  ["Jin", 248],
  ["Martínez", 246],
  ["Perez", 246],
  ["Khan", 241],
  ["Souza", 241],
  ["Tran", 238],
  ["Ye", 237],
  ["Hernandez", 236],
  ["Jr.", 236],
  ["Castro", 230],
  ["Cai", 228],
  ["Cao", 226],
  ["Ramos", 225],
  ["Sánchez", 222],
  ["Kang", 221],
  ["Reyes", 220],
  ["Pan", 219],
  ["Lim", 216],
  ["Castillo", 215],
  ["Anonymous", 213],
  ["Hernández", 213],
  ["Ramirez", 211],
  ["Yin", 210],
  ["Martin", 209],
];

function tokenForMatch(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("en-US");
}

function aliasFor(kind: ListMatch, gender: Gender, name: string): string {
  const token =
    tokenForMatch(name)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unknown";
  return `${kind}-${gender ? `${gender}-` : ""}${token}`;
}

function definitionsFor(
  kind: ListMatch,
  gender: Gender,
  names: NameCount[],
): SystemListDefinition[] {
  const usedAliases = new Set();
  let groupLabel = "Last";
  if (gender === "m") groupLabel = "Male";
  if (gender === "f") groupLabel = "Female";
  const nameLabel = kind === "first-name" ? "first name" : "name";
  return names.map(([name, count], index) => ({
    key:
      kind === "first-name" &&
      gender === "m" &&
      ["max", "luke"].includes(tokenForMatch(name))
        ? `given-name-${tokenForMatch(name)}`
        : `${kind}-${gender ?? "all"}-${tokenForMatch(name)}`,
    alias: (() => {
      const legacyAlias =
        kind === "first-name" &&
        gender === "m" &&
        ["max", "luke"].includes(tokenForMatch(name))
          ? tokenForMatch(name)
          : aliasFor(kind, gender, name);
      const alias = usedAliases.has(legacyAlias)
        ? `${legacyAlias}-${index + 1}`
        : legacyAlias;
      usedAliases.add(alias);
      return alias;
    })(),
    version: 3,
    name: `${groupLabel} ${nameLabel}: ${name}`,
    description: `Rank ${index + 1} system list from the WCA export dated 2026-08-06 (${count} matching export rows).`,
    token: tokenForMatch(name),
    match: kind,
    gender,
    visibility: index < PUBLIC_SYSTEM_LIST_LIMIT ? "public" : "private",
  }));
}

export const SYSTEM_LIST_DEFINITIONS: SystemListDefinition[] = [
  ...definitionsFor("first-name", "m", MALE_FIRST_NAMES),
  ...definitionsFor("first-name", "f", FEMALE_FIRST_NAMES),
  ...definitionsFor("last-name", null, LAST_NAMES),
];

export function primaryNameToken(name: unknown) {
  return String(name ?? "")
    .normalize("NFKC")
    .split("(", 1)[0]
    .trim()
    .split(/\s+/, 1)[0]
    .toLocaleLowerCase("en-US");
}
