$ErrorActionPreference = "Stop"

# Initial configuration commits
git add tsconfig.json package.json package-lock.json next.config.mjs
git commit -m "chore: Configure project dependencies and compiler options"

git rm --cached src/app/favicon.ico -f 2>$null
git add tailwind.config.ts src/app/globals.css
git commit -m "style: Setup Tailwind CSS theme and custom brand tokens"

git add public/ src/app/icon.png Gemini_Generated_Image*
git commit -m "assets: Add static images, logos, and branding assets"

git add src/types/
git commit -m "types: Define core data models for runs, claims, and hypotheses"

git add src/lib/
git commit -m "feat(core): Implement LLM utilities and openrouter client"

git add supabase/
git commit -m "feat(db): Add Supabase schema and RPC migrations for state diffs"

git add src/orchestrator/
git commit -m "feat(orchestrator): Build ingest pipeline for PDF and Ar5iv parsing"

# Agents commits
git add src/agents/extractor.ts
git commit -m "feat(agents): Implement Extractor agent for citation-backed claims"

git add src/agents/verifier.ts
git commit -m "feat(agents): Implement Verifier agent for cross-referencing claims"

git add src/agents/synthesis.ts
git commit -m "feat(agents): Implement Synthesis agent for generating hypotheses"

git add src/agents/audit.ts
git commit -m "feat(agents): Implement Audit agent for tracking run metrics"

git add src/agents/
git commit -m "feat(agents): Add remaining agent core structures"

# UI/Component commits
git add src/components/landing/
git commit -m "feat(ui): Build landing page components and hero sections"

git add src/components/dashboard/ClaimGraph.tsx
git commit -m "feat(dashboard): Implement ClaimGraph for visualizing evidence"

git add src/components/dashboard/ExecutionTrace.tsx
git commit -m "feat(dashboard): Implement ExecutionTrace for real-time agent logs"

git add src/components/dashboard/ClaimIntegrityReport.tsx
git commit -m "feat(dashboard): Implement premium ClaimIntegrityReport with glassmorphism"

git add src/components/dashboard/SourcesLedger.tsx src/components/dashboard/CostLedger.tsx
git commit -m "feat(dashboard): Add Sources and Cost Ledgers for agent transparency"

git add src/components/dashboard/
git commit -m "feat(dashboard): Finalize remaining dashboard components"

# App router commits
git add src/app/api/
git commit -m "feat(api): Build API routes for webhook triggers and runs"

git add src/app/run/
git commit -m "feat(app): Build dynamic dashboard viewer routes"

git add src/app/demo/
git commit -m "feat(app): Add demo pages for testing UI components"

git add src/app/page.tsx src/app/layout.tsx src/app/not-found.tsx
git commit -m "feat(app): Construct main app layout and root page"

# Misc
git add README.md
git commit -m "docs: Update README with Popper architecture overview"

git add get_run.js scripts/
git commit -m "chore: Add utility scripts for E2E testing and measurement"

git add .
git commit -m "chore: Catch miscellaneous untracked config files"

git remote add origin https://github.com/Xconmax245/Popper.git 2>$null
if ($LASTEXITCODE -ne 0) {
    git remote set-url origin https://github.com/Xconmax245/Popper.git
}

Write-Output "Done creating commits."
