🔴 Critical Issues Found

1. Hardcoded Color Values (No Token Usage)
   Multiple files bypass the design system tokens defined in index.css and use raw hex values directly.

Offenders:

AuthModal.css: #1e1e1e, #252525, #888, #ff0080, #00d4ff, #ff4444 — all hardcoded despite tokens existing in :root

SettingsModal.css: #1e1e1e, #252525, #333, #888, #ccc, #ff4444

VerticalSlider.css: #888, #252525, #ff0080 hardcoded inline instead of using var(--deck-color)

HorizontalSlider.css: #0a0a0a, #888 hardcoded

2. Duplicate user-select: none Declaration
   user-select: none appears on both html/body/#root AND body separately, creating a redundant double-declaration. The body block also duplicates -webkit-tap-highlight-color: transparent which is already in the \* reset.

3. Mixed Use of --gap-_ and --radius-_ as Spacing
   --radius-md and --radius-lg are used as gap/padding values in Deck.css and Mixer.css — which is semantically wrong and confusing. For example: gap: var(--radius-md) in .deck-performance-controls.

4. Duplicate Responsive Blocks
   The media query @media screen and (max-width: 1200px) and (min-width: 768px) appears in Deck.css, Mixer.css, VerticalSlider.css, and index.css — all with overlapping rules that could be consolidated.

The .deck-effects-grid-performance { display: none } rule appears twice in Deck.css — once inside @media (max-height: 500px) and once inside @media (max-width: 1200px).

5. .settings-overlay Ghost Selector
   In SettingsModal.css, the selector .settings-modal-overlay, .settings-overlay targets .settings-overlay which doesn't appear to exist anywhere in the TSX — a dead selector increasing specificity noise.

6. Inconsistent Close Button Pattern
   Both AuthModal.css and SettingsModal.css define near-identical .auth-close-btn / .settings-close-btn / .advanced-controls-close styles (32-42px circle, #333 background, hover → red). This button pattern appears 3+ times across files.

7. Duplicate Modal Base Pattern
   .auth-modal and .settings-modal share identical base styles: background: #1e1e1e, border: 1px solid rgba(255,255,255,0.1), border-radius: 12px, box-shadow: 0 20px 60px rgba(0,0,0,0.8) — fully duplicated.

📋 CSS Quality Summary Table
File Size Hardcoded Colors Duplicate Rules Token Usage Grade
index.css 9KB Some user-select x2, tap-highlight x2 ✅ Good B
Deck.css 14KB None Media query ×2, display:none ×2 ✅ Good B+
Mixer.css 13KB #3a3a3a inline --radius as spacing ✅ Good B
VerticalSlider.css 4.5KB #888, #252525 None ⚠️ Partial C+
HorizontalSlider.css 1.6KB #888, #0a0a0a None ⚠️ Partial C+
AuthModal.css 2.4KB All hardcoded None ❌ None D
SettingsModal.css 5.5KB All hardcoded Ghost selector ❌ None D
Waveform.css 5.3KB None None ✅ Full A
ScrollableWaveform.css 1.9KB None None ✅ Full A
UnifiedTrackSelector.css 5.6KB Some — ⚠️ Partial C+
🗺️ Full Refactoring Roadmap
Phase 1 — Design Token Completion (1–2 days)
Goal: Make all hardcoded values traceable to :root tokens.

Add missing tokens to index.css > :root:

css
--color-bg-modal: #1e1e1e;
--color-bg-header: #252525;
--color-bg-control-dark: #333;
--color-border-light: rgba(255, 255, 255, 0.1);
--color-text-hint: #888;
--color-text-light: #ccc;
--shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.8);
--radius-circle: 50%;
--radius-xxl: 50px; /_ for toggle pills _/
Replace all hardcoded hex values in AuthModal.css, SettingsModal.css, VerticalSlider.css, and HorizontalSlider.css with the new tokens.

Fix VerticalSlider.css and HorizontalSlider.css to use var(--deck-color, var(--deck-a-primary)) consistently.

Phase 2 — Extract Shared Component Classes (1–2 days)
Goal: Eliminate the duplicated modal, close button, and overlay patterns.

Create src/styles/shared.css (imported once in main.tsx):

.modal-base — shared background, border, border-radius, shadow for all modals

.modal-overlay-base — shared position: fixed; inset: 0; backdrop-filter: blur(...)

.icon-btn-close — shared 32px circle close button with hover → red state

.modal-header-base — shared display: flex; justify-content: space-between; border-bottom

In AuthModal.css and SettingsModal.css: Replace duplicate declarations with composition using @apply (if using PostCSS) or via shared class names in the TSX.

Remove the ghost selector .settings-overlay from SettingsModal.css.

Phase 3 — Fix Semantic Token Misuse (half day)
Goal: Separate spacing tokens from radius tokens.

In index.css, add explicit spacing tokens:

css
--space-xs: 2px;
--space-sm: 6px; /_ avoid collision with --gap-sm: 4px _/
--space-md: 8px;
--space-lg: 12px;
Audit all gap: var(--radius-_) and padding: var(--radius-_) in Deck.css and Mixer.css — replace with appropriate --gap-_ or new --space-_ tokens.

Rename usage confusion between --gap-_ (flex/grid gaps) and layout padding — standardize as --gap-_ for gaps only and --gap-\* or inline values for padding.

Phase 4 — Deduplicate Media Queries (1 day)
Goal: Single source of truth per breakpoint per component.

Deck.css: Merge the two @media (max-width: 1200px) blocks into one (currently split across the file). Remove the duplicate .deck-effects-grid-performance { display: none }.

SettingsModal.css: The small landscape media query references undefined classes (.close-btn, .settings-hint, .layout-selector, .layout-btn, .key-mapping-list, .key-mapping-item, .action-label, .key-btn, .settings-actions, .reset-btn, .settings-footer) — audit against actual TSX and remove dead rules.

Consider moving breakpoints to CSS custom property media queries or a dedicated src/styles/breakpoints.css file for shared reference across components.

Phase 5 — Reset & Base Cleanup (half day)
Goal: Remove redundant global declarations.

In index.css, consolidate the html/body/#root block and the body block — user-select, overflow: hidden, and -webkit-tap-highlight-color appear across both. Keep body as the single place for all base body rules.

Ensure outline: none in \* {} is not overriding accessibility — add a focused :focus-visible rule as a proper alternative:

css
_:focus { outline: none; }
_:focus-visible { outline: 2px solid var(--deck-a-primary); outline-offset: 2px; }
Audit position: fixed on .app — this is already set alongside overflow: hidden on body, check if both are necessary.

Phase 6 — Stylelint Enforcement (half day)
Goal: Prevent regressions automatically.

Review the existing .stylelintrc.json and add rules:

"declaration-no-important": true — remove all !important (found in Mixer.css)

"color-no-invalid-hex": true

"custom-property-no-missing-var-function": true

"no-duplicate-selectors": true

Add stylelint to the pre-commit hook via lint-staged.

Run npx stylelint "src/\*_/_.css" --fix as the initial automated pass.

Phase 7 — (Optional) CSS Modules Migration (3–5 days)
Goal: Eliminate global scope and class name collision risk entirely.

Since the project is React + Vite, migrating from plain .css files to CSS Modules (.module.css) is low-cost and high-value:

Rename files: Deck.css → Deck.module.css

Update imports: import styles from './Deck.module.css'

Replace className="deck-btn-play-pause" with className={styles.deckBtnPlayPause}

Keep index.css global for the design tokens (:root) and the body/reset rules only

Move shared component classes from Phase 2 into a shared.module.css

This eliminates all risk of .deck clashing with external libraries and makes refactoring fully traceable.

⚡ Quick Wins (Do First)
These can be done in under 2 hours without any breaking changes:

Remove duplicate user-select: none in index.css

Remove ghost selector .settings-overlay in SettingsModal.css

Remove duplicate deck-effects-grid-performance { display: none } in Deck.css

Replace #ff0080 and #00d4ff inline in AuthModal.css with var(--deck-a-primary) and var(--deck-b-primary)

Add declaration-no-important to .stylelintrc.json to block future regressions
