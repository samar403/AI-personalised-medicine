// Client-safe red-flag detection. Runs before anything is sent to the model so that an
// emergency gets an immediate, fixed answer rather than a generated one.

export const DISCLAIMER =
  "Allele gives information to discuss with your clinician. It is not a diagnosis or a prescription, and it is not a substitute for professional medical advice. Never start, stop or change a medicine without talking to your prescriber.";

export const EMERGENCY_NOTE = "If you think you are having a medical emergency, call your local emergency number (911 in the US, 112 in the EU, 999 in the UK) now.";

const RED_FLAGS: { pattern: RegExp; topic: string }[] = [
  { pattern: /\b(chest (pain|pressure|tightness)|crushing pain|heart attack)\b/i, topic: "chest pain" },
  { pattern: /\b(can'?t|cannot|struggling to|hard to|trouble) breath(e|ing)?\b|\bshort(ness)? of breath\b.*\b(sudden|severe|worse)\b/i, topic: "breathing difficulty" },
  { pattern: /\b(face (is )?droop\w*|slurred speech|speech is slurred|arm weakness|sudden (numbness|weakness|confusion)|stroke)\b/i, topic: "stroke symptoms" },
  { pattern: /\b(suicid\w*|kill (myself|me)|end (my|it all)|self[- ]harm|want to die|overdos\w*)\b/i, topic: "self-harm" },
  { pattern: /\b(anaphyla\w*|throat (is )?(closing|swelling)|swollen (tongue|lips|throat))\b/i, topic: "severe allergic reaction" },
  { pattern: /\b(unconscious|passed out|not breathing|seizure|fitting)\b/i, topic: "collapse or seizure" },
  { pattern: /\b(vomiting|coughing up) blood\b|\bblack,? tarry stool/i, topic: "serious bleeding" },
];

export function detectRedFlag(text: string) {
  return RED_FLAGS.find((r) => r.pattern.test(text))?.topic ?? null;
}

export function emergencyReply(topic: string) {
  if (topic === "self-harm") {
    return `**You deserve support right now.** If you might act on thoughts of harming yourself, call your local emergency number. In the US you can call or text **988** (Suicide & Crisis Lifeline); in the UK and Ireland call Samaritans on **116 123**. If you can, tell someone near you how you are feeling.\n\nI'm an information tool and can't help safely with this, but a trained person can, any time of day.`;
  }
  return `**This could be an emergency (${topic}).** ${EMERGENCY_NOTE}\n\nDon't wait for an online answer. If you've taken a medicine that might be causing this, take the packaging with you.`;
}
