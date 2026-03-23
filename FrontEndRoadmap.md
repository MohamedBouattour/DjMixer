🔍 CSS Audit Summary
The project has 12 CSS files across src/ and src/components/ totaling ~90KB of styles . The core problems cluster into 5 categories: duplicate selectors, dead code, hardcoded values, !important abuse, and broken CSS architecture ownership.

Critical Issues Found

1. Duplicate Selectors Across Files
   The most severe issue — the same selectors are defined in both App.css and index.css with conflicting values :

Selector App.css index.css Conflict
.app position: fixed, padding: env(...) padding: 5px, background gradient ✅ Conflicting
.app-header display: none !important display: none !important ♻️ Exact duplicate
.app-main height: 100vh only height: 100vh + flex-direction: column ✅ Conflicting
.decks-section width: 100% No width Partial overlap
.center-section Full layout Empty block Dead code
.settings-floating-btn display: flex !important ×2 MQs display: flex !important ♻️ Triple duplicate
body overflow/user-select Full body block Covered in html,body,#root ♻️ Redundant
In Mixer.css, the /_ ADVANCED CONTROLS POPUP _/ section header appears twice back-to-back, and /_ RESPONSIVE - Tablet _/ media query header is duplicated as well .

2. Dead / Commented-Out Code
   .center-section {} in index.css — empty block with comment "Styles moved to App.css"

/_ Legacy Component Components _/ section — empty with no rules

Two consecutive empty responsive section headers: /_ RESPONSIVE - Landscape mobile _/ and /_ RESPONSIVE - Global _/

transition: all 0.15s ease is declared twice on .btn-magic-loop in Deck.css

orientation.css exists as a dedicated file yet orientation warning styles are also fully defined in index.css

3. Hardcoded Values Ignoring the Design System
   index.css defines a complete design system with CSS custom properties (--deck-a-primary, --border-subtle, --gap-md, --radius-lg, etc.) that are barely used in component files . Instead, Deck.css and Mixer.css repeat raw hex values everywhere:

#ff0080 / #00d4ff instead of var(--deck-a-primary) / var(--deck-b-primary)

rgba(255,255,255,0.08) instead of var(--border-subtle)

8px, 12px, 4px gaps instead of var(--gap-md), var(--gap-lg), var(--gap-sm)

4px, 6px, 8px radii instead of var(--radius-sm/md/lg)

4. !important Overuse
   There are 9+ !important declarations used to fight cascade specificity rather than fix the actual selector architecture . .settings-floating-btn { display: flex !important } appears in 3 separate locations.

5. Broken File Ownership Architecture
   App.css and index.css both attempt to define the global layout, creating an unclear and fragile cascade. The breakpoint max-width: 1200px is repeated in App.css, Deck.css, and Mixer.css with no shared breakpoint tokens .

🗺️ Full Refactoring Roadmap
Phase 1 — Audit & Baseline (Day 1)
Goal: freeze a working visual snapshot before touching anything.

Take browser screenshots of all 3 breakpoints (desktop, tablet ≤1200px, small landscape ≤500px height)

Run npx stylelint "src/\*_/_.css" to generate a linting baseline report

Create branch refactor/css-cleanup from main

Optionally install PurgeCSS or VSCode CSS Peek to map unused class names

Phase 2 — Merge & Consolidate Global Files (Day 2)
Goal: one file owns global layout, one file owns the design system.

Merge App.css into index.css — index.css becomes the single global stylesheet

Keep the :root design tokens at the top

Merge .app into one definitive block: keep position: fixed from App.css, background gradient from index.css

Remove the conflicting .app-main definition from index.css (keep App.css version with correct flex-direction)

Delete App.css after migration; update main.tsx / App.tsx imports

Delete orientation.css after confirming its content is already in index.css; remove its import

Phase 3 — Kill Dead Code (Day 2–3)
Goal: remove every empty block, stale comment, and commented-out rule.

Delete empty section blocks in index.css: .center-section {}, /_ Legacy Component Components _/, both empty responsive headers

Remove stale display: none !important for .effects, .mini-waveform, .shortcut-badge, .center-toggle-btn — confirm these elements don't exist in JSX; if confirmed, delete the HTML elements or keep one canonical hide rule

Remove the duplicate transition: all 0.15s ease on .btn-magic-loop in Deck.css

Remove duplicate /_ ADVANCED CONTROLS POPUP _/ header block and duplicate /_ RESPONSIVE - Tablet _/ header in Mixer.css

Remove .separator { display: none } if element is not rendered in JSX

Phase 4 — Tokenize All Hardcoded Values (Day 3–4)
Goal: every component references var(--token) instead of raw values.

In Deck.css — replace all occurrences of:

#ff0080 → var(--deck-a-primary) (already overridden per deck via --deck-color)

#00d4ff → var(--deck-b-primary)

#252525 → var(--color-bg-control)

rgba(255,255,255,0.08) → var(--border-subtle)

rgba(255,255,255,0.15) → var(--border-medium)

All gap values → var(--gap-sm/md/lg/xl)

All border-radius values → var(--radius-sm/md/lg/xl)

Repeat the same token replacement in Mixer.css

Add missing tokens to :root if needed (e.g., --color-bg-gradient, --breakpoint-tablet: 1200px)

Phase 5 — Fix !important Abuse (Day 4)
Goal: zero !important declarations except truly unavoidable overrides.

For .app-header { display: none !important } — keep only one in index.css; increase specificity if needed (#root .app-header)

For .settings-floating-btn { display: flex !important } × 3 — collapse into one rule at base level; the MQ overrides are redundant since the default is already flex

For .floating-actions { display: flex !important } in both orientation MQs — the declarations are identical to the base style; delete both MQ overrides entirely

For .btn-fx-toggle { display: flex !important } in responsive MQ — replace with a proper cascade: default display: none, then @media { display: flex } without !important

Phase 6 — Consolidate Responsive Breakpoints (Day 5)
Goal: one place defines breakpoint values; all MQs use them.

Add CSS custom media queries (or SCSS variables if migrating): --bp-tablet: 1200px, --bp-mobile: 767px, --bp-small-landscape: (max-height: 500px) and (orientation: landscape)

Audit all 3 main CSS files for max-width: 1200px and max-height: 500px breakpoints — ensure each file's MQ only contains that component's responsive rules, not global layout overrides

Move global layout responsive rules (body, .app, .decks-section) to index.css only

Phase 7 — CSS Architecture Hardening (Day 5–6)
Goal: prevent regressions with naming conventions and tooling.

Prefix all component class names with their component name to avoid global collisions: .deck-_ (already mostly done), .mixer-_, .waveform-\* — audit Mixer.css for bare names like .vol-label, .mix-center, .vu-meter that could clash

Add stylelint rules to eslint.config.js or a .stylelintrc:

json
"no-duplicate-selectors": true,
"declaration-no-important": true,
"custom-property-pattern": "^(color|deck|text|border|gap|radius|font|bp)-.+"
Add a pre-commit hook (via husky + lint-staged) that runs stylelint on changed CSS files

Phase 8 — Validation & Regression (Day 6–7)
Goal: confirm nothing broke visually.

Re-take screenshots at all 3 breakpoints and diff against Phase 1 baseline

Test on Safari (PWA env() padding, overscroll-behavior) and Firefox (::-moz-range-\* rules still active)

Run Lighthouse CSS coverage report — verify reduced unused CSS percentage

Merge refactor/css-cleanup → main via PR with before/after screenshots in description

Effort Estimate
Phase Effort Risk
Phase 1 – Audit 2h 🟢 None
Phase 2 – Merge global files 3h 🟡 Medium (cascade order)
Phase 3 – Dead code 1h 🟢 Low
Phase 4 – Tokenize values 4h 🟡 Medium (many occurrences)
Phase 5 – Fix !important 2h 🟡 Medium (specificity side effects)
Phase 6 – Breakpoints 2h 🟢 Low
Phase 7 – Architecture 3h 🟠 High (rename impacts TSX)
Phase 8 – Validation 2h 🟢 Low
Total estimated effort: ~19h spread across 7 days. Phases 2–5 deliver the highest visual and maintenance ROI and should be prioritized if time is constrained.
