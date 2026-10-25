// Client-safe drug dictionary, name normalisation, drug-drug interactions and allergy cross-checks.
// Curated and deliberately small: every entry is a well-established interaction found in standard
// references (FDA labels, BNF, Lexicomp-class summaries). It is a safety net, not a full formulary.
import type { Priority } from "@/lib/db/schema";

export interface DrugInfo {
  name: string;
  aliases: string[];
  classes: string[];
}

export const DRUGS: DrugInfo[] = [
  { name: "clopidogrel", aliases: ["plavix"], classes: ["antiplatelet"] },
  { name: "aspirin", aliases: ["acetylsalicylic acid", "asa", "ecotrin"], classes: ["antiplatelet", "nsaid_aspirin"] },
  { name: "warfarin", aliases: ["coumadin", "jantoven"], classes: ["anticoagulant", "vka"] },
  { name: "apixaban", aliases: ["eliquis"], classes: ["anticoagulant"] },
  { name: "rivaroxaban", aliases: ["xarelto"], classes: ["anticoagulant"] },
  { name: "citalopram", aliases: ["celexa", "cipramil"], classes: ["ssri", "serotonergic"] },
  { name: "escitalopram", aliases: ["lexapro", "cipralex"], classes: ["ssri", "serotonergic"] },
  { name: "sertraline", aliases: ["zoloft", "lustral"], classes: ["ssri", "serotonergic"] },
  { name: "fluoxetine", aliases: ["prozac", "sarafem"], classes: ["ssri", "serotonergic", "cyp2d6_inhibitor"] },
  { name: "paroxetine", aliases: ["paxil", "seroxat"], classes: ["ssri", "serotonergic", "cyp2d6_inhibitor"] },
  { name: "omeprazole", aliases: ["prilosec", "losec"], classes: ["ppi", "cyp2c19_inhibitor"] },
  { name: "esomeprazole", aliases: ["nexium"], classes: ["ppi", "cyp2c19_inhibitor"] },
  { name: "lansoprazole", aliases: ["prevacid", "zoton"], classes: ["ppi"] },
  { name: "pantoprazole", aliases: ["protonix", "protium"], classes: ["ppi"] },
  { name: "dexlansoprazole", aliases: ["dexilant"], classes: ["ppi"] },
  { name: "voriconazole", aliases: ["vfend"], classes: ["azole"] },
  { name: "fluconazole", aliases: ["diflucan"], classes: ["azole"] },
  { name: "phenytoin", aliases: ["dilantin", "epanutin", "fosphenytoin"], classes: ["anticonvulsant"] },
  { name: "ibuprofen", aliases: ["advil", "motrin", "nurofen"], classes: ["nsaid"] },
  { name: "naproxen", aliases: ["aleve", "naprosyn"], classes: ["nsaid"] },
  { name: "diclofenac", aliases: ["voltaren", "voltarol"], classes: ["nsaid"] },
  { name: "celecoxib", aliases: ["celebrex"], classes: ["nsaid"] },
  { name: "meloxicam", aliases: ["mobic"], classes: ["nsaid"] },
  { name: "flurbiprofen", aliases: ["ansaid"], classes: ["nsaid"] },
  { name: "codeine", aliases: ["tylenol 3", "tylenol with codeine", "co-codamol"], classes: ["opioid", "cyp2d6_prodrug"] },
  { name: "tramadol", aliases: ["ultram", "zydol"], classes: ["opioid", "serotonergic", "cyp2d6_prodrug"] },
  { name: "tamoxifen", aliases: ["nolvadex", "soltamox"], classes: ["serm"] },
  { name: "metoprolol", aliases: ["lopressor", "toprol"], classes: ["beta_blocker"] },
  { name: "simvastatin", aliases: ["zocor"], classes: ["statin"] },
  { name: "atorvastatin", aliases: ["lipitor"], classes: ["statin"] },
  { name: "rosuvastatin", aliases: ["crestor"], classes: ["statin"] },
  { name: "lovastatin", aliases: ["mevacor", "altoprev"], classes: ["statin"] },
  { name: "pravastatin", aliases: ["pravachol"], classes: ["statin"] },
  { name: "azathioprine", aliases: ["imuran"], classes: ["thiopurine"] },
  { name: "mercaptopurine", aliases: ["purinethol", "purixan", "6-mp"], classes: ["thiopurine"] },
  { name: "thioguanine", aliases: ["tabloid", "6-tg"], classes: ["thiopurine"] },
  { name: "fluorouracil", aliases: ["5-fu", "adrucil"], classes: ["fluoropyrimidine"] },
  { name: "capecitabine", aliases: ["xeloda"], classes: ["fluoropyrimidine"] },
  { name: "tacrolimus", aliases: ["prograf", "advagraf", "envarsus"], classes: ["calcineurin_inhibitor"] },
  { name: "atazanavir", aliases: ["reyataz"], classes: ["antiretroviral"] },
  { name: "irinotecan", aliases: ["camptosar"], classes: ["chemotherapy"] },
  { name: "abacavir", aliases: ["ziagen", "triumeq", "epzicom", "kivexa"], classes: ["antiretroviral"] },
  { name: "ethinylestradiol", aliases: ["ethinyl estradiol", "combined oral contraceptive", "combined pill", "yasmin", "microgynon", "loestrin"], classes: ["estrogen"] },
  { name: "estradiol", aliases: ["estrace", "estrogel", "vagifem", "climara"], classes: ["estrogen"] },
  { name: "lisinopril", aliases: ["zestril", "prinivil"], classes: ["ace_inhibitor", "raas"] },
  { name: "ramipril", aliases: ["altace", "tritace"], classes: ["ace_inhibitor", "raas"] },
  { name: "enalapril", aliases: ["vasotec"], classes: ["ace_inhibitor", "raas"] },
  { name: "losartan", aliases: ["cozaar"], classes: ["arb", "raas"] },
  { name: "valsartan", aliases: ["diovan"], classes: ["arb", "raas"] },
  { name: "spironolactone", aliases: ["aldactone"], classes: ["potassium_sparing"] },
  { name: "potassium chloride", aliases: ["klor-con", "potassium supplement", "slow-k"], classes: ["potassium"] },
  { name: "amlodipine", aliases: ["norvasc", "istin"], classes: ["ccb"] },
  { name: "amiodarone", aliases: ["cordarone", "pacerone"], classes: ["antiarrhythmic"] },
  { name: "clarithromycin", aliases: ["biaxin", "klaricid"], classes: ["macrolide_strong_cyp3a4"] },
  { name: "sildenafil", aliases: ["viagra", "revatio"], classes: ["pde5"] },
  { name: "tadalafil", aliases: ["cialis"], classes: ["pde5"] },
  { name: "nitroglycerin", aliases: ["glyceryl trinitrate", "gtn", "nitrostat"], classes: ["nitrate"] },
  { name: "isosorbide mononitrate", aliases: ["imdur", "ismo", "isosorbide"], classes: ["nitrate"] },
  { name: "lithium", aliases: ["lithobid", "priadel"], classes: ["lithium"] },
  { name: "methotrexate", aliases: ["trexall", "otrexup"], classes: ["methotrexate"] },
  { name: "trimethoprim", aliases: ["bactrim", "septra", "co-trimoxazole", "sulfamethoxazole"], classes: ["trimethoprim", "sulfonamide"] },
  { name: "metformin", aliases: ["glucophage", "glumetza"], classes: ["biguanide"] },
  { name: "amoxicillin", aliases: ["amoxil", "augmentin", "co-amoxiclav"], classes: ["penicillin"] },
  { name: "ampicillin", aliases: [], classes: ["penicillin"] },
  { name: "penicillin", aliases: ["penicillin v", "phenoxymethylpenicillin", "pen vk"], classes: ["penicillin"] },
  { name: "cephalexin", aliases: ["keflex", "cefalexin"], classes: ["cephalosporin"] },
  { name: "levothyroxine", aliases: ["synthroid", "levoxyl", "eltroxin"], classes: ["thyroid"] },
];

const byName = new Map(DRUGS.map((d) => [d.name, d]));

export function drugInfo(drug: string) {
  return byName.get(drug);
}

function words(s: string) {
  return ` ${s.toLowerCase().replace(/[^a-z0-9-]+/g, " ").trim()} `;
}

/** Maps "Plavix 75mg tablet" to "clopidogrel". Unknown names come back lower-cased so they still match themselves. */
export function normalizeDrug(raw: string): string {
  const w = words(raw);
  let best: { name: string; len: number } | null = null;
  for (const d of DRUGS) {
    for (const term of [d.name, ...d.aliases]) {
      if (w.includes(` ${term} `) && (!best || term.length > best.len)) best = { name: d.name, len: term.length };
    }
  }
  return best?.name ?? raw.trim().toLowerCase().replace(/\s+\d.*$/, "");
}

export function hasClass(drug: string, cls: string) {
  return byName.get(drug)?.classes.includes(cls) ?? false;
}

type Matcher = { drug?: string; cls?: string };

export interface Interaction {
  code: string;
  a: Matcher[];
  b: Matcher[];
  priority: Priority;
  title: string;
  summary: string;
  recommendation: string;
  source: string;
}

export const INTERACTIONS: Interaction[] = [
  {
    code: "clopidogrel-ppi",
    a: [{ drug: "clopidogrel" }],
    b: [{ drug: "omeprazole" }, { drug: "esomeprazole" }],
    priority: "moderate",
    title: "Omeprazole can blunt clopidogrel",
    summary: "Omeprazole and esomeprazole block CYP2C19, the enzyme that switches clopidogrel on, so clopidogrel may protect less against clots.",
    recommendation: "Ask whether a different stomach protector (such as pantoprazole) would suit you. Keep taking both until you have spoken to your prescriber.",
    source: "FDA clopidogrel label (boxed warning context); ACCF/ACG/AHA consensus",
  },
  {
    code: "anticoagulant-nsaid",
    a: [{ cls: "anticoagulant" }],
    b: [{ cls: "nsaid" }],
    priority: "high",
    title: "Blood thinner with an anti-inflammatory painkiller",
    summary: "Taking an NSAID such as ibuprofen or naproxen with an anticoagulant raises the risk of serious bleeding, especially in the stomach.",
    recommendation: "Ask your clinician or pharmacist about a safer painkiller (often paracetamol/acetaminophen) and avoid over-the-counter NSAIDs.",
    source: "FDA anticoagulant labels; BNF interactions",
  },
  {
    code: "warfarin-amiodarone",
    a: [{ drug: "warfarin" }],
    b: [{ drug: "amiodarone" }],
    priority: "high",
    title: "Amiodarone raises warfarin levels",
    summary: "Amiodarone slows warfarin breakdown. INR can climb over several weeks and increase bleeding risk.",
    recommendation: "Your INR usually needs closer checks and a lower warfarin dose. Confirm a monitoring plan with your anticoagulation clinic.",
    source: "FDA warfarin label",
  },
  {
    code: "warfarin-azole",
    a: [{ drug: "warfarin" }],
    b: [{ cls: "azole" }],
    priority: "high",
    title: "Antifungal raises warfarin effect",
    summary: "Fluconazole and voriconazole inhibit CYP2C9 and CYP3A4 and can sharply raise INR.",
    recommendation: "Ask for an INR check within a few days of starting the antifungal.",
    source: "FDA warfarin label",
  },
  {
    code: "anticoagulant-antiplatelet",
    a: [{ cls: "anticoagulant" }],
    b: [{ cls: "antiplatelet" }],
    priority: "moderate",
    title: "Blood thinner with an antiplatelet",
    summary: "This combination is sometimes intended (for example after a stent) but adds bleeding risk.",
    recommendation: "Confirm the combination is deliberate and how long it should last.",
    source: "ACC/AHA antithrombotic guidance",
  },
  {
    code: "ssri-nsaid",
    a: [{ cls: "ssri" }],
    b: [{ cls: "nsaid" }],
    priority: "moderate",
    title: "Antidepressant with an NSAID",
    summary: "SSRIs reduce platelet serotonin; with NSAIDs the risk of stomach bleeding rises several-fold.",
    recommendation: "Ask whether you need stomach protection or a different painkiller.",
    source: "BNF interactions; NICE CKS",
  },
  {
    code: "serotonergic-tramadol",
    a: [{ cls: "ssri" }],
    b: [{ drug: "tramadol" }],
    priority: "high",
    title: "Tramadol with an SSRI",
    summary: "Together they can cause serotonin syndrome and lower the seizure threshold.",
    recommendation: "Ask about an alternative painkiller. Seek urgent care for agitation, fever, sweating, tremor or muscle jerks.",
    source: "FDA tramadol label",
  },
  {
    code: "simvastatin-clarithromycin",
    a: [{ drug: "simvastatin" }, { drug: "lovastatin" }],
    b: [{ drug: "clarithromycin" }],
    priority: "urgent",
    title: "Statin with clarithromycin is contraindicated",
    summary: "Clarithromycin strongly blocks CYP3A4 and can raise simvastatin or lovastatin levels enough to cause muscle breakdown (rhabdomyolysis).",
    recommendation: "Contact your prescriber today. The statin is usually paused while the antibiotic is taken.",
    source: "FDA simvastatin label (contraindication)",
  },
  {
    code: "simvastatin-amlodipine",
    a: [{ drug: "simvastatin" }],
    b: [{ drug: "amlodipine" }, { drug: "amiodarone" }],
    priority: "moderate",
    title: "Simvastatin dose cap with amlodipine or amiodarone",
    summary: "These raise simvastatin levels. The FDA label limits simvastatin to 20 mg a day in combination.",
    recommendation: "Check your simvastatin dose is 20 mg or less, or ask about another statin.",
    source: "FDA simvastatin label",
  },
  {
    code: "pde5-nitrate",
    a: [{ cls: "pde5" }],
    b: [{ cls: "nitrate" }],
    priority: "urgent",
    title: "PDE5 inhibitor with a nitrate is contraindicated",
    summary: "Sildenafil or tadalafil with nitrates can cause a dangerous drop in blood pressure.",
    recommendation: "Do not combine them. Tell your clinician, and tell emergency staff if you have taken a PDE5 inhibitor in the last 48 hours.",
    source: "FDA sildenafil and tadalafil labels",
  },
  {
    code: "raas-potassium",
    a: [{ cls: "raas" }],
    b: [{ cls: "potassium_sparing" }, { cls: "potassium" }],
    priority: "moderate",
    title: "Potassium can build up",
    summary: "ACE inhibitors or ARBs combined with spironolactone or potassium supplements can raise blood potassium.",
    recommendation: "Make sure potassium and kidney function are checked regularly.",
    source: "BNF interactions; KDIGO",
  },
  {
    code: "lithium-nsaid-raas",
    a: [{ drug: "lithium" }],
    b: [{ cls: "nsaid" }, { cls: "raas" }],
    priority: "high",
    title: "Lithium levels can rise",
    summary: "NSAIDs and ACE inhibitors/ARBs reduce lithium clearance and can push levels into the toxic range.",
    recommendation: "Ask for a lithium level check and avoid over-the-counter NSAIDs.",
    source: "FDA lithium label",
  },
  {
    code: "methotrexate-trimethoprim",
    a: [{ drug: "methotrexate" }],
    b: [{ drug: "trimethoprim" }],
    priority: "high",
    title: "Methotrexate with trimethoprim",
    summary: "Both block folate; together they can suppress the bone marrow.",
    recommendation: "Ask your prescriber about an alternative antibiotic.",
    source: "BNF interactions; MHRA",
  },
  {
    code: "tamoxifen-cyp2d6-inhibitor",
    a: [{ drug: "tamoxifen" }],
    b: [{ cls: "cyp2d6_inhibitor" }],
    priority: "high",
    title: "This antidepressant may weaken tamoxifen",
    summary: "Paroxetine and fluoxetine strongly block CYP2D6, which turns tamoxifen into its active form (endoxifen).",
    recommendation: "Ask your oncologist whether an antidepressant with little CYP2D6 effect would suit you.",
    source: "CPIC tamoxifen guideline (2018)",
  },
  {
    code: "opioid-cyp2d6-inhibitor",
    a: [{ cls: "cyp2d6_prodrug" }],
    b: [{ cls: "cyp2d6_inhibitor" }],
    priority: "moderate",
    title: "Painkiller may work less well",
    summary: "Codeine and tramadol need CYP2D6 to work. Paroxetine and fluoxetine block it, so you can respond like a poor metabolizer whatever your genes say.",
    recommendation: "If pain relief is poor, ask about a painkiller that does not depend on CYP2D6.",
    source: "CPIC opioid guideline (2021), phenoconversion",
  },
];

function matches(drug: string, m: Matcher) {
  return m.drug ? m.drug === drug : m.cls ? hasClass(drug, m.cls) : false;
}

/** Finds every curated interaction among a list of normalised drug names. */
export function findInteractions(drugs: string[]) {
  const unique = [...new Set(drugs)];
  const hits: { interaction: Interaction; pair: [string, string] }[] = [];
  for (const ix of INTERACTIONS) {
    for (const x of unique) {
      if (!ix.a.some((m) => matches(x, m))) continue;
      const y = unique.find((d) => d !== x && ix.b.some((m) => matches(d, m)));
      if (y) {
        hits.push({ interaction: ix, pair: [x, y] });
        break;
      }
    }
  }
  return hits;
}

const ALLERGY_CLASSES: { pattern: RegExp; cls: string; label: string }[] = [
  { pattern: /penicillin|amoxicillin|ampicillin|augmentin/i, cls: "penicillin", label: "penicillins" },
  { pattern: /sulfa|sulpha|sulfonamide|sulfamethoxazole|bactrim/i, cls: "sulfonamide", label: "sulfonamides" },
  { pattern: /nsaid|ibuprofen|naproxen|aspirin|diclofenac/i, cls: "nsaid", label: "NSAIDs" },
  { pattern: /codeine|morphine|opioid|opiate|tramadol/i, cls: "opioid", label: "opioids" },
  { pattern: /statin/i, cls: "statin", label: "statins" },
];

/** Returns the allergy that conflicts with a drug, if any (same drug, or the same drug class). */
export function allergyConflict(drug: string, allergySubstances: string[]) {
  for (const substance of allergySubstances) {
    if (normalizeDrug(substance) === drug) return { substance, reason: "listed as an allergy" };
    for (const c of ALLERGY_CLASSES) {
      if (c.pattern.test(substance) && (hasClass(drug, c.cls) || (c.cls === "nsaid" && hasClass(drug, "nsaid_aspirin")))) {
        return { substance, reason: `belongs to the ${c.label} you are allergic to` };
      }
    }
  }
  return null;
}
