# Allele: product prompt

This is the brief Allele was built from. Use it to explain the product, onboard contributors, or prompt an AI system that extends it.

---

**Build "Allele": AI personalised medicine that turns a person's genome, wearable data and health records into treatment advice they can take to their clinician.**

**Who it's for.** Adults managing one or more chronic conditions or several medicines (heart disease, hypertension, depression, diabetes, high cholesterol), people who already have a consumer DNA file from 23andMe, AncestryDNA or MyHeritage, the caregivers who help them, and the clinicians who see them for fifteen minutes at a time.

**The problem.** Medicine is still prescribed for the average patient. About 9 in 10 people carry at least one gene variant that changes how they respond to a common drug, yet that information sits unused in a DNA file on their laptop. Their smartwatch knows their resting heart rate went up after a dose change; their record knows their LDL is above target; their pharmacist knows about an interaction. No one puts it together, and the person is left to notice problems on their own.

**The product.** A private health vault that does the joining-up continuously:

1. **Collect.** Accept three kinds of data, each with its own consent:
   - **Genome:** raw files from 23andMe, AncestryDNA, MyHeritage or a VCF. Parse in the browser and keep only a 20-variant pharmacogenomic panel (CYP2C19, CYP2C9, CYP2D6, CYP3A5, SLCO1B1, VKORC1, TPMT, NUDT15, DPYD, UGT1A1, HLA-B*57:01, CYP4F2, Factor V Leiden, prothrombin). Store calls encrypted.
   - **Wearables:** CSV exports (Apple Health, Fitbit, Garmin, Oura or any daily sheet) for resting heart rate, HRV, sleep, steps, SpO2, weight, blood pressure and glucose.
   - **Health records:** FHIR R4 bundles from a patient portal (conditions, medications, allergies, labs, vitals), plus manual entry. Read only birth year and sex from Patient; ignore names and addresses.
2. **Interpret.** Run a deterministic findings engine that anyone can audit:
   - gene-drug rules based on CPIC guidelines, applied to the medicines the person actually takes;
   - drug-drug interactions and allergy cross-reactions;
   - lab interpretation with LOINC mapping, unit conversion and condition-aware targets (for example an LDL goal after a stent);
   - wearable trends against the person's own 30-day baseline, not a population average.
   Each finding has a priority, a plain-English summary, a recommendation, the evidence it used (genotype, dose, value, date), the evidence level, and questions to ask a clinician.
3. **Advise.** Use Claude to turn findings into a prioritised care plan, explain any medicine the person is considering before it is prescribed, write a pre-visit brief for their clinician, and answer questions in a chat grounded in their own data. Claude explains and prioritises; it never invents a dose or contradicts the rules engine. Outputs are validated structured data.
4. **Share.** Invite a clinician (who can review findings and add notes) or a caregiver (read-only). Every access and change is written to an audit log the owner can read.

**Safety principles.**
- Information to discuss with a clinician, never a diagnosis or a prescription, and the product says so on every page that recommends something.
- Never tell someone to stop or change a medicine on their own; name the question to ask instead, and warn when stopping suddenly is dangerous (antiplatelets after a stent, antidepressants, beta blockers).
- Emergency symptoms (chest pain, stroke signs, anaphylaxis, self-harm) get an immediate fixed reply pointing to emergency services, before any model is called.
- Consumer arrays miss variants; recommend clinical confirmation before prescribing decisions.

**Privacy principles.**
- Data minimisation: the raw genome never leaves the browser.
- Consent per data type and for AI processing; withdrawing consent deletes that data.
- Anything sent to the model is de-identified (age, not birth date; no names or contact details).
- Owners can export everything as JSON and permanently delete their vault.

**Experience principles.**
- Lead with the one thing that matters most, then the next few.
- Every recommendation shows why it applies to *you*: your genotype, your dose, your number.
- Warm, plain language at a reading age of about 12, with the clinical detail one click away.
- Works fully without an API key (offline rules engine), so it can be demoed and tested anywhere.

**Why now.** Consumer genomics has reached tens of millions of people, FHIR patient access is required in the US, wearables are everywhere, and language models can finally explain clinical guidelines in plain language. Y Combinator has listed AI personalised medicine among the ideas it wants to fund. The pieces exist; Allele connects them.
