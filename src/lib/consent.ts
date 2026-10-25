// Client-safe consent copy. Bump CONSENT_VERSION whenever the wording changes materially.
export const CONSENT_VERSION = "2026-10-25";

export const CONSENT_ITEMS = [
  {
    key: "genomics",
    title: "Genetic data",
    body: "Your DNA file is read in your browser. Only 20 medicine-related variants are uploaded and stored, encrypted. No ancestry, disease-risk or relative-matching data is ever kept.",
  },
  {
    key: "wearables",
    title: "Wearable and home-device data",
    body: "Daily summaries such as steps, resting heart rate, HRV, sleep, SpO₂, weight, blood pressure and glucose.",
  },
  {
    key: "records",
    title: "Health records",
    body: "Conditions, medicines, allergies, lab results and vital signs from a FHIR export or entered by hand. Names, addresses and record numbers in the file are ignored.",
  },
  {
    key: "ai",
    title: "AI analysis with Claude",
    body: "A de-identified summary (age, sex and clinical data, never your name or email) is sent to Anthropic's Claude API to write care plans and answer questions. Anthropic does not train on API data. Turn this off and Allele uses its offline rules engine only.",
  },
] as const;

export type ConsentKey = (typeof CONSENT_ITEMS)[number]["key"];
