# Findings

## Screenshot observations

- The page is very tall and gives three unrelated configuration domains equal visual weight.
- Pricing duplicates four fields and a Save button in each vehicle card, creating ambiguous save scope.
- Gate-lane creation is compressed into one horizontal row; helper text and action alignment are weak.
- The lane empty state consumes space without explaining the next operational step.
- Building Layout is read-only but visually resembles editable configuration, reducing hierarchy clarity.
- Most cards use similar border, radius, and contrast, so primary tasks do not stand out.
- Values and status counts are not formatted as scannable operational data.

## Initial direction

- Use a task-oriented admin configuration layout with clear editable/read-only separation.
- Keep one primary action per configuration section.
- Use progressive disclosure for secondary reference information.
- Preserve accessible labels, keyboard focus, validation, loading, success, and error states.

## Source evidence

- `Config.tsx` renders all three sections sequentially inside `max-w-4xl`, producing the tall page and unused desktop width.
- Pricing uses a single global `saving` flag but renders one Save button per vehicle card; saving either card disables both and does not expose dirty state.
- The lane creation form uses four columns at the medium breakpoint and native selects, while reusable Radix Select/Dialog/Sheet/Table/Badge/Skeleton components already exist.
- Unassign uses a red trash icon, which visually suggests deleting the lane or staff account instead of removing an assignment.
- Building layout is fetched as read-only data, yet lives under the same visual treatment as editable sections.
- The building footer exposes an internal REST endpoint to the manager instead of a product navigation action.
- Web package has build and lint scripts but no automated UI test runner.

## Target information architecture

1. Page header: title, short purpose, and optional unsaved-change indicator.
2. URL-addressable tabs: `Pricing`, `Gate lanes`, `Layout overview`.
3. Pricing tab: comparison matrix with Car/Motorbike rows, four validated fields, one section-level Save action, and dirty-state controls.
4. Gate lanes tab: operational summary, lane list/table, and one `Create lane` action opening a dialog or side sheet.
5. Layout overview tab: explicit read-only badge, summary metrics, compact floor accordions, occupancy indicators, and a `Manage slots` link to Dashboard.

## Responsive behavior

- Desktop: `max-w-6xl`; pricing comparison table and lane table.
- Tablet: tabs remain visible; lane list uses two-row cards where needed.
- Mobile: horizontally scrollable tabs, pricing vehicle cards, stacked lane rows, full-width dialog actions, no horizontal page scrolling.

## Interaction and accessibility requirements

- Track dirty pricing fields; Save remains disabled until values change and pass validation.
- Format VND values with locale separators while preserving numeric API payloads; show units as suffixes.
- Validate non-negative money values and a sensible overtime threshold inline.
- Show row-specific pending feedback for lane assignment/toggle operations.
- Confirm lane deactivation; use `UserMinus` and a clear label for unassignment.
- Use semantic headings, labels, focus management, visible focus rings, `aria-live` feedback, and keyboard-operable tabs/dialogs.
- Use skeletons instead of blank spinner cards and provide inline retry actions for load failures.
- Verify light/dark contrast and 44px minimum interactive targets.

## Recommended implementation sequence

1. Extract typed section components and introduce tab state synchronized to the URL hash/query.
2. Rebuild Pricing as a dirty-tracked comparison form with section-level Save/Discard.
3. Move lane creation into a Dialog/Sheet and rebuild existing lanes as a responsive table/card list.
4. Convert Building Layout to a compact read-only overview with expandable floors and a Dashboard action.
5. Add loading/error/empty/success states and accessibility semantics.
6. Validate at 375, 768, 1024, and 1440 widths in both themes; run lint and build.

## Acceptance criteria

- Only one configuration domain is expanded at a time and each tab can be linked directly.
- The default viewport shows the full header, tabs, and the beginning of the active task without unrelated sections competing below it.
- Pricing has one unambiguous save scope and cannot submit invalid values.
- Creating a lane never compresses four controls into one narrow row.
- Lane assignment, unassignment, activation, and deactivation communicate pending/success/error state locally.
- Layout information is visibly read-only and no internal API path is shown to the user.
- No horizontal overflow at 375px; full keyboard flow works; light/dark themes remain legible.
- Existing pricing and gate-lane API contracts remain unchanged unless a later implementation reveals a blocker.

## Tool fallback

- The installed UI skill exposes `scripts` as a pointer but its target is absent, so its design-system CLI could not run. The plan uses the skill's embedded admin-form, accessibility, responsive-layout, and interaction checklists directly.
