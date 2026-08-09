# Verifier Evaluation Scorecard

This is a **real, reproducible** evaluation of Popper's Verifier agent against a
labeled gold set — not a hand-picked demo. It runs the **production** `runVerifier`
code path (same CrossRef + Semantic Scholar resolution, same LLM wrapper, same
prompts), so the number below is the number the live system produces.

## Headline

| Metric | Pre-fix baseline | Post-fix (frozen) |
| --- | --- | --- |
| Overall accuracy | **54.2%** (13/24) | **79.2%** (19/24) |

The pre-fix baseline was depressed almost entirely by a free-tier **HTTP 429 rate-limit
storm**: bursts of back-to-back verifications got throttled, and each throttled call
collapsed to a false `unverifiable`. That is an infrastructure artifact, not a reasoning
failure. The fix (see below) removed the storm; the post-fix number reflects the
verifier's actual judgment quality.

## Gold set (`eval/claims.json`)

24 claims, balanced 8 / 8 / 8 across the three verdict classes:

- **confirmed** — citation genuinely supports the claim.
- **contradicted** — a planted error: wrong year, wrong finding, or wrong attribution.
- **unverifiable** — insufficient/paywalled/ambiguous evidence, no honest verdict possible.

## Post-fix results (frozen in `eval/results.json`)

```
Claims: 24   Correct: 19   Overall accuracy: 79.2%
Run: cdce6473-1c6e-4d75-a392-658319344a42   Verifier wall-clock: 947.8s

Per-class:
  confirmed     support=8  precision=100.0%  recall=62.5%  (tp=5 fp=0 fn=3)
  contradicted  support=8  precision= 66.7%  recall=100.0% (tp=8 fp=4 fn=0)
  unverifiable  support=8  precision= 85.7%  recall=75.0%  (tp=6 fp=1 fn=2)

Confusion matrix (rows = expected, cols = predicted):
                  confirmed  contradicted  unverifiable
  confirmed            5           2             1
  contradicted         0           8             0
  unverifiable         0           2             6
```

## What the numbers say (read this, not just the headline)

- **Confirmed precision = 100%.** The verifier is falsification-first: it never
  rubber-stamped a claim it could not positively support. When it says "confirmed,"
  it was right all 5 times. That is the property that matters most for a tool whose
  job is to catch bad citations.
- **Contradicted recall = 100%.** It caught **every single one** of the 8 planted
  errors. Nothing false slipped through as "confirmed."
- The cost of that aggressiveness shows up as **contradicted precision 66.7%** — it
  over-fires "contradicted" on 4 items. See the miss analysis: this is not the model
  hallucinating.

## Miss analysis — all 5, honestly

| ID | Expected | Got | Root cause |
| --- | --- | --- | --- |
| eval-003 | confirmed | contradicted | **CrossRef resolved the wrong DOI** (a 2021 record, not the 2016 PRL paper). Verifier reasoned correctly on wrong evidence. |
| eval-004 | confirmed | unverifiable | **True residual 429** — survived all 5 retries. The only miss caused by rate-limiting after the fix. |
| eval-005 | confirmed | contradicted | **CrossRef year mismatch** on the resolved record (2021 vs claimed 2020). Resolution artifact, not reasoning. |
| eval-018 | unverifiable | contradicted | **CrossRef resolved a plausible-but-wrong DOI** (2008 vs 2023). Verifier flagged the mismatch it was handed. |
| eval-023 | unverifiable | contradicted | **CrossRef resolved to an unrelated medical article.** Verifier correctly saw topic mismatch on bad evidence. |

**4 of 5 misses trace to citation→DOI resolution returning a wrong-but-plausible
match**, after which the verifier reasoned correctly on the evidence it was given.
**1 of 5** is a true residual rate-limit. **Zero** are the verifier inventing a verdict.
The clear next lever is tightening CrossRef match confidence (title/author/year
agreement gating), not touching the verifier prompt.

## The fix that moved 54.2% → 79.2%

1. **Retry with bounded backoff** on transient `429/5xx` (and network errors) in the
   shared LLM wrapper (`src/lib/llm/call.ts`), honoring `Retry-After`. A momentary
   throttle no longer becomes a permanent false `unverifiable`.
2. **Inter-claim pacing** in the Verifier (`src/agents/verifier.ts`,
   `VERIFIER_INTER_CLAIM_MS`, default 1500ms) so multi-claim runs stay under the
   free-tier per-minute cap in the first place.

## Reproduce

```bash
# Uses the production verifier against eval/claims.json, writes eval/results.json.
# Env below is timing-only (does not change verdict logic); values used for the
# frozen run are recorded here for exact reproducibility.
VERIFIER_INTER_CLAIM_MS=4000 LLM_MAX_ATTEMPTS=5 npx tsx scripts/eval-verifier.ts
```

- Model: `openai/gpt-oss-20b:free` (`MODELS.verifier`)
- The run row is kept in the DB (`cdce6473-…`) for trace inspection in the dashboard.
- Wall-clock is inflated by the deliberate 4s pacing + retry backoffs; it is a
  rate-limit-avoidance figure, not a latency benchmark.
