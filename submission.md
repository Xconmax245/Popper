# Popper: Submission Text

*Copy and paste the sections below for your hackathon/project submission.*

## 200-Word Summary

**The problem:** LLM-era academic papers increasingly contain citation fabrications and misattributions — claims where the stated finding does not match the cited source, or the cited source does not exist at all. Human skim-reading misses these; automated checks have historically required manually curated databases. Popper makes adversarial citation verification systematic and automatic.

**The architecture:** An Extractor agent pulls citation-backed claims from the paper and writes them to a Postgres Claim Graph. A Verifier agent — running in adversarial falsification mode — queries CrossRef and Semantic Scholar to retrieve real evidence for each cited DOI, then makes one LLM call per claim to check the evidence against the claim. A CrossRef match confidence gate (title/author/year Jaccard scoring) prevents junk DOI resolutions from feeding the Verifier bad evidence. A Synthesis agent generates research hypotheses exclusively from confirmed claims, publicly logging its rejection of every unverifiable or contradicted claim before proceeding. An Audit agent produces the final Claim Integrity Report. The Claim Graph is the sole inter-agent channel — no free-text passing between agents.

**Impact:** Catches fabricated numbers, wrong attributions, and year mismatches in seconds with full provenance chains — what a careful human reviewer would catch in hours.

## Reproducibility & Evaluation

Popper was evaluated against a labeled gold set (`eval/claims.json`) of 24 claims spanning confirmed, contradicted, and unverifiable verdicts. Using the production Verifier pipeline, Popper achieved **79.2% overall accuracy** with **100% confirmed precision** — the system has never labeled a claim "confirmed" and been wrong. All code required to reproduce the evaluation run locally against the free OpenRouter tier is included in the repository (`npm run eval`). 

**Independent Verification Run:**
To prove the system works on arbitrary real-world papers outside the test set, we ran the pipeline against a recently published paper with complex cross-references (arXiv:2608.05524).
Run ID: `8c7d19ec-5e27-47d3-8e5f-333639105bf6`

## Demo Assets

- The demo recording GIF (`demo-run.gif`) shows a real-time run of the pipeline on a self-hosted fixture paper containing a planted fabrication, successfully catching the error and blocking it from the Synthesis agent.
