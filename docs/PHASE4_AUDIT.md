# Phase 4 — Audit Findings + Proposed Tokens

**Date:** 2026-05-10
**Goal:** rebuild kit's CSS on a coherent token system. Audit current usage, propose tokens that match reality.

## Scope of the codebase

- **6,570 lines** of CSS across 14 files
- Largest: home.css (1,554), shell.css (1,085), guides.css (875), travel.css (736)
- Theme files: pills.css (233), pills2.css (232) — unique color palettes, treated separately

## Color audit

### Distinct colors found
- **76 total hex values** including theme files
- **27 in core CSS** (excluding wild themes)

### Issues identified
1. **Danger red is reinvented 4 ways:**
   - `#c0392b` (10 uses, the canonical) — admin, shell, phrases
   - `#a83025` (1 use) — admin bulk-bar hover
   - `#c33` (3 uses) — home, guides — totally different shade
   - `#962d22` (1 use) — admin
   - **Fix:** introduce `--danger` token, sweep all to that.

2. **Dark mode bg referenced as raw hex:**
   - `html.dark { background: #161614; }` in shell.css line 97
   - `#161614` IS the `--bg` token value in dark mode
   - **Fix:** use `var(--bg)`.

3. **Phrases gradient colors hardcoded** (juice page):
   - `#fff8e7`, `#f5ecd6`, `#d6c8d0` light + 4 dark variants
   - These are page-specific atmospheric colors
   - **Decision:** leave hardcoded. Page-scoped, not system-level.

### Proposed color tokens (light mode)
```css
:root {
  --bg:        #f5f5f2;   /* page background */
  --surface:   #ebeae5;   /* cards, inputs, secondary surfaces (was --field) */
  --surface-2: #e3e2dc;   /* deeper hover state (was --field-focus) */
  --ink:       #111111;   /* primary text */
  --ink-2:     #555551;   /* secondary text */
  --ink-3:     #777773;   /* tertiary, captions */
  --rule:      #d8d8d4;   /* hairlines */
  --accent:    #2a4ed4;   /* french blue, hover/active (was --blue) */
  --danger:    #c0392b;   /* destructive states (NEW) */
}
```

### Proposed color tokens (dark mode)
```css
html.dark {
  --bg:        #161614;
  --surface:   #1f1f1d;
  --surface-2: #262624;
  --ink:       #ebeae5;
  --ink-2:     #a8a8a3;
  --ink-3:     #8a8a85;
  --rule:      #2a2a27;
  --accent:    #2a4ed4;   /* same blue both modes */
  --danger:    #c0392b;   /* same red both modes */
}
```

### Token renames
- `--field` → `--surface` (50 references, sed-replaceable)
- `--field-focus` → `--surface-2`
- `--blue` → `--accent`
- Drop `--ink-4` (only 2 uses, can be `--ink-3`)
- New: `--danger`

**Total: 9 color tokens.** Clean.

## Type audit

### Distinct sizes found
- **17 distinct font-size values**
- Most common: 14px (81), 11px (53), 13px (45), 16px (29), 10px (25)
- Visual noise from arbitrary 1px variations (13/14/15 all "body-ish")

### Proposed type tokens
```css
:root {
  --text-tiny:    11px;   /* mono captions, smallest legible */
  --text-small:   13px;   /* secondary body, helper text */
  --text-body:    15px;   /* default body text */
  --text-strong:  16px;   /* iOS-safe form inputs, emphasis */
  --text-medium:  18px;   /* subheads */
  --text-display: 22px;   /* page titles, h1 */
  --text-hero:    36px;   /* hero titles, big magazine type */
}
```

### Migration mapping
- 9px, 10px, 11px → `--text-tiny` (11px)
- 12px, 13px → `--text-small` (13px)
- 14px → `--text-body` (15px) — slight visual change accepted (14 uses → 15)
- 15px → `--text-body` (15px) unchanged
- 16px → `--text-strong` (16px) unchanged
- 17px, 19px → `--text-medium` (18px)
- 18px → `--text-medium` (18px) unchanged
- 22px → `--text-display` (22px)
- 24px, 26px → `--text-display` (22px) — slight shrink
- 28px, 30px, 32px → `--text-hero` (36px) OR custom
- 36px, 40px → `--text-hero` (36px)

**Real flag:** the 14→15 migration affects 81 references. Will check button widths after.

**Total: 7 type size tokens.**

## Spacing audit

### Distinct values found
- 1px (79 — borders, ignore)
- 2/3/4/6/7/8/9/10/12/14/16/18/20/22/24/26/28/32/36/40/48/56/60/80
- Heaviest used: 12 (61), 4 (46), 8 (43), 16 (36), 24 (34), 14 (33), 6 (32), 10 (32)

### Proposed spacing scale
```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 48px;
  --space-9: 80px;
}
```

### Migration mapping
- 2, 3, 4 → `--space-1`
- 6, 7, 8, 9, 10 → `--space-2`
- 11, 12, 13, 14 → `--space-3`
- 15, 16, 17, 18 → `--space-4`
- 19, 20, 21, 22 → `--space-5`
- 23, 24, 25, 26, 27, 28 → `--space-6`
- 30, 32, 34, 36 → `--space-7`
- 40, 44, 48 → `--space-8`
- 56, 60, 64, 70, 80+ → `--space-9` or higher

**Real flag:** spacing migration is the most likely to introduce visual regressions. Will be careful, may leave some hardcoded if migration would visibly break something.

**Total: 9 spacing tokens.**

## Radius audit

### Issues identified
1. **`border-radius: 2px` used 16 times with no token** — used for "barely rounded" overlay corners, tight inputs. Print-feel.
2. Existing tokens (--r-pill, --r-button, --r-input, --r-card, --r-circle) are well-designed but not fully adopted.

### Proposed radius tokens (additions)
```css
:root {
  --r-tight:  2px;    /* NEW: sharp, print-feel */
  --r-input:  4px;
  --r-card:   6px;
  --r-button: 8px;
  --r-pill:   999px;
  --r-circle: 50%;
}
```

**Total: 6 radius tokens.**

## Motion audit

Motion is **already pretty consistent**.

### Distinct transitions
- `140ms ease` (most common — color, bg, border)
- `200ms ease` (transform, position)
- `180ms cubic-bezier(0.2, 0.8, 0.2, 1)` (sheets, modals)

### Proposed motion tokens
```css
:root {
  --ease-quick:  140ms ease;
  --ease-medium: 200ms ease;
  --ease-sheet:  180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

**Total: 3 motion tokens.**

## Component primitives needed

After token consolidation, the components that need to be promoted from inline-styled to primitive classes:

### `.btn` system
Currently: one `.btn` with modifiers (`--secondary`, `--published`, `--danger`).
Needed: size variants. Currently every "small button" reinvents padding.
```css
.btn               /* default = medium */
.btn--small        /* less padding, smaller text */
.btn--large        /* more padding, larger text */

.btn--primary      /* default — filled ink */
.btn--secondary    /* outlined ghost */
.btn--ghost        /* text only, no border */

.btn--danger       /* modifier — red on hover */
.btn--published    /* modifier — blue filled */
```

### `.btn-close-circle` ✓
Already canonical. Verify all overlays use it (vs custom × buttons).

### Inline-row remove circle
Pattern (28×28) used in `.time-card__remove`, `.ph-pill__delete`. Needed: shared base class so future inline closes use the same affordance.
```css
.btn-remove-circle  /* NEW canonical 28×28 inline remove */
```

### `.pill` primitive
Currently: stream pills (home), filter pills (spots picker-btn), category chips (juice ph-cat), translation pills (ph-pill). All slightly different. Needed:
```css
.pill                /* base — neutral filled */
.pill--accent        /* blue — "yours" */
.pill--solid         /* active state — ink-filled */
.pill--small         /* compact variant */
```

### `.input` / `.textarea` / `.select` primitives
Currently: every form invents its own input styling. Needed:
```css
.input               /* default — surface bg, rule border */
.textarea            /* multi-line variant */
.select              /* dropdown with custom chevron */
```

### `.card` primitive
Currently: cards reinvented per-page (apps card, trip card, todo card, etc.).
```css
.card                /* default — surface bg, --r-card, --rule border */
.card--interactive   /* hover state for tappable cards */
```

### `.caption` primitive
Currently: tiny mono uppercase labels reinvented everywhere.
```css
.caption             /* mono 11px uppercase 0.06em, ink-3 */
```

## Migration strategy

### Phase 4A — Foundation (this work)
1. **Token consolidation** — define all tokens in shell.css :root
2. **Color rename sweep** — `--field` → `--surface`, `--blue` → `--accent`, etc.
3. **Promote primitives** — implement `.btn--small/large`, `.pill`, `.input`, `.card`, `.caption`
4. **Migrate hardcoded values to tokens** — sweep all CSS files
5. **Document in style guide** — every primitive shown with example

### Phase 4B — Home rebuild (later in this session)
1. Cut todos (DONE)
2. Move home to 12-col grid via `.page-grid`
3. Promote home sections to modules (Day, TripStrip, Stream, MiniMonth, etc.)
4. Mobile single-column collapse
5. Click-through visual regression check

## Real flags

1. **The 14→15 type size migration** could change button widths slightly. Will spot-check buttons after.

2. **Spacing migration** is the highest-risk part. Some elements positioned by exact 14px or 18px will shift. Acceptable noise vs unification benefit, but will need eyeballs after.

3. **Theme files (pills.css, pills2.css) NOT being touched.** They're stable, work as-is, and are a separate system. The token rename WILL affect any theme file that uses `--blue` etc — sweep needed.

4. **One-off hardcoded values may need to stay.** If migrating `border-radius: 2px` to `--r-tight` would visually regress something (because tokens snap differently across pages), keep it hardcoded with a `/* TODO: use --r-tight */` comment.

5. **No build system means no CSS compilation safety net.** Every typo is a silent bug. Going slow > going fast.
