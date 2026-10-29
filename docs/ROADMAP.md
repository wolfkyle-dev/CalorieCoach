# CalorieCoach Development Roadmap

CalorieCoach is a personal-use, iPhone-first nutrition tracker. Deliver milestones in order unless a dependency explicitly allows parallel work. Keep each milestone independently testable and usable, preserve local-first behavior, and do not pull future milestone scope forward without an explicit decision.

## Current repository layout

As of 2026-10-28, the Expo app is located at the repository root. Run npm, Expo, lint, test, and TypeScript commands from the repository root. Earlier M0–M2 verification notes below refer to the former `CalorieCoach\` project subdirectory.

## M0: Verify project setup and existing dashboard

**Objective:** Establish a reproducible baseline for the existing Expo project and confirm what the dashboard does today.

**Dependencies:** None.

**Scope:**
- Confirm the actual repository and Expo project roots, Git worktree, package manager, installed Expo SDK, scripts, and project instructions.
- Install from the npm lockfile and start the existing app.
- Smoke-test the dashboard on the physical iPhone using Expo Go when compatible, or a development build when required.
- Record existing type-check, lint, test, and device-test results and distinguish working UI from data-backed behavior.

**Explicit exclusions:** New dashboard features, nutrition data, storage, dependency upgrades, and unrelated starter-template cleanup.

**Acceptance criteria:**
- A clean dependency install and documented start command work from the Expo project directory.
- The existing dashboard opens on the target iPhone without a blocking runtime error.
- Light and dark appearance, safe areas, and tab navigation are checked on-device.
- The dashboard is documented accurately; placeholder values are not mistaken for user records.
- Any existing failures or unavailable checks have a reproducible command and are recorded as blockers rather than hidden.

**Required tests:**
- Start the app and confirm the dashboard route renders; verify the web route too if web remains a supported development target.
- Run the available TypeScript and lint commands and record their exact results.
- Smoke-test on a physical iPhone; a web build alone does not satisfy this check.
- There are no formal unit tests in the current project; do not claim a test suite passed until one exists.

**Definition of done:** The repository/project layout, startup steps, actual dashboard behavior, and baseline check results are documented; device testing and any required setup fixes are completed or explicitly left as M0 blockers.

### Verified M0 progress (2026-10-28)

- At initial M0 inspection, the Git worktree root was `C:\Users\8kyle\.copilot\repos\copilot-worktrees\CalorieCoach\wolfkyle-dev-studious-goggles` and the Expo project was nested at `CalorieCoach\`. The app uses npm, Expo SDK `~58.0.20`, and React Native `0.88.0`; the nested project directory was later flattened to the repository root.
- `npm ci` completed from the then-nested Expo project root. npm reported 8 audit findings (5 low, 3 high); the findings were subsequently traced to Zod and deepmerge advisories, are not remediated, and are explicitly accepted for personal-use development.
- `npm run web -- --port 8085` started successfully. Expo Router and the web bundle compiled, and `curl.exe --head http://localhost:8085` returned HTTP 200 after the tab ref fix.
- `.\node_modules\.bin\tsc.cmd --noEmit --pretty false` passed after the web tab ref fix.
- User-verified iPhone checks through Expo Go: light/dark colors changed with the Expo Go appearance setting; top and bottom safe areas passed; Home and Explore tab navigation passed. These checks were performed by the user, not independently by Copilot.
- The web hydration guard in `src/hooks/use-color-scheme.web.ts` now uses React `useSyncExternalStore` with a stable server snapshot instead of setting state synchronously in an effect. This retains the light-mode server/hydration snapshot and then uses the device scheme, without suppressing the lint rule.
- ESLint is configured with the SDK-matched `eslint-config-expo` flat config. `npm run lint` invokes `eslint .`; after the hydration fix, the full lint command passes.
- The Expo CLI `expo lint` wrapper rejected installed ESLint 9 because its version check reads a missing `ESLint.version` property. The package lint script invokes ESLint directly to avoid that wrapper issue.
- At the M0 baseline, there was no test script, framework, or existing suite. M0 did not require a new framework; M1 now adds deterministic domain and SQLite tests, but these do not replace the required physical-device checks.
- At M0 completion, the dashboard was presentation-only: the date was dynamic, while calorie totals, macro goals, and foods were unset and not backed by saved user records. M2 now connects today's dashboard values and food list to local records.
- `npm audit --json` reports 8 package findings: high `expo`, `@expo/cli`, and `zod`; low `@expo/config`, `@expo/local-build-cache-provider`, `@expo/metro-config`, `@expo/prebuild-config`, and `deepmerge`. The two underlying advisories are Zod memory exhaustion (GHSA-mrhx-c7xc-m3w5, affected `<4.6.6`; installed `zod@3.25.76`, used by Expo CLI/config tooling) and deepmerge prototype poisoning (GHSA-gcqx-w48m-w2h4, affected `>=4.2.0 <=4.3.1`; installed `deepmerge@4.3.1`, used by `@expo/config`). `npm audit` only offers `expo@51.0.39`, a major SDK downgrade. Expo `58.0.21` and CLI `58.1.17` are available, but still depend on Zod `^3.25.76`; the published deepmerge versions stop at affected `4.3.1`. Updating to Zod 4 would override Expo CLI's Zod 3 dependency range and is not established as compatible. No automatic fix, override, downgrade, or other dependency upgrade was applied.

**Status:** Complete for continued personal-use development. The user explicitly accepts the unresolved npm audit findings for this personal-use project. This is a risk-acceptance decision, not a remediation: the vulnerable Zod and deepmerge versions remain installed, and their use in Expo CLI/configuration paths is conditional rather than proven unreachable. Do not describe the findings as harmless or fixed; revisit compatible remediation before broader distribution or release.

## M1: Define domain models and implement reliable local persistence

**Objective:** Establish typed nutrition and health-data models and a versioned, reliable local data foundation.

**Dependencies:** M0.

**Scope:**
- Define stable, typed models for foods and nutrient values, serving units, meals and food-log entries, user goals, and weigh-ins.
- Make units and provenance explicit, distinguish missing values from zero, and record whether nutrition data is user-entered, verified, or estimated.
- Select and integrate an Expo-compatible local persistence approach; keep persistence behind a data-access layer.
- Add versioned migrations, transactional writes where records are related, and a small persisted settings slice so local save/reopen behavior is demonstrable.
- Define repository error behavior without silently dropping data.

**Explicit exclusions:** Cloud sync, accounts, remote backends, analytics, a complete food-log workflow, and adaptive coaching calculations.

**Acceptance criteria:**
- Domain types encode kcal, gram-based macros, serving quantities/units, and data provenance without ambiguous implicit conversions.
- Records survive app restarts and are available offline.
- Initial schema creation and at least one upgrade path preserve existing data.
- Database access is isolated from presentation code and all queries are parameterized.
- A failed write is surfaced and does not leave related records partially updated.

**Required tests:**
- Unit tests for model validation, units, missing nutrients, and invalid values.
- Persistence tests for create/read/update/delete and app-restart durability.
- Migration tests for a fresh database and an upgrade while preserving records.
- Transaction tests proving related writes commit or roll back together.

**Definition of done:** The typed local data layer is used by a small persisted settings flow, migrations and repository operations pass deterministic tests, and storage errors are visible rather than silently ignored.

### Verified M1 progress (2026-10-28)

- Added SDK-compatible `expo-sqlite@~58.0.14`; the SDK 58 SQLite documentation lists iOS, Android, Expo Go, and web support. The app opens a persistent `caloriecoach.db` on iOS/Android, enables foreign keys and WAL, and runs migrations before repository use. No user nutrition data is sent to a service.
- Added typed food/nutrient, serving, meal, food-log-entry, daily-goal, weigh-in, and local-settings models. Runtime parsers reject invalid values, unsupported or incompatible units, duplicate nutrient records, and invalid dates. Nutrient units are fixed by nutrient; omitted nutrients remain missing rather than becoming zero. Food provenance distinguishes user-entered, verified, and estimated data.
- Added parameterized repositories for each M1 record type. Food and nutrient rows are saved in one exclusive transaction; foreign keys prevent deletion of foods/meals still referenced by log entries. Schema version 1 creates the core records and version 2 adds local settings; each migration is transactional and newer unsupported schemas fail explicitly.
- Added deterministic proportional nutrition and explicit serving-unit conversion functions. No meal totals, logging UI, or adaptive target calculations were added.
- Added a small persisted weight-unit preference control on Explore; it reports loading, saving, and storage errors. Native SQLite is used on iOS/Android. On web the control reports that local SQLite storage is not configured; web bundling remains a smoke-test target, not a persistence target.
- `npm test` uses Node's built-in test runner and built-in SQLite rather than adding Jest or another test dependency. It covers model validation, compatible/incompatible units, proportional calculations and missing nutrients, repository CRUD and foreign-key behavior, atomic rollback after an injected nutrient-write failure, fresh schema creation, v1-to-v2 data-preserving migration, and closing/reopening a file-backed database. This verifies the repository/migration SQL against SQLite; it does not by itself verify Expo's native bridge on an iPhone.
- The new settings screen and Expo SQLite native adapter have not yet been verified on the user's iPhone. The requested M1 app-restart test should be completed on-device by changing the preferred weight unit in Explore, force-closing/reopening the app, and confirming the selected unit remains.
- Final `npm run web -- --port 8086` compiled the web route and `curl.exe --head --max-time 10 http://localhost:8086` returned HTTP 200. This is a dashboard/web-bundle smoke test only; SQLite persistence is disabled on web.
- `npx expo install --check` reports that several already-installed SDK packages have newer SDK 58 patch versions expected by the current Expo metadata, including `expo@58.0.21`; those unrelated version changes were not applied. The audit still reports 8 findings after adding SQLite (5 low, 3 high), unchanged in severity; no audit fixes or overrides were applied. The user has accepted this risk for personal-use development as recorded under M0.

**Status:** Complete. Domain validation, SQLite persistence and migrations, deterministic calculations, and repository tests are in place. The user verified on iPhone through Expo Go that the SQLite-backed weight-unit preference survives force-closing and reopening. Existing SDK patch-version drift and accepted npm audit findings remain documented; neither was silently upgraded or suppressed.

## M2: Implement manual food logging, serving sizes, meal organization, and editing

**Objective:** Let a user reliably record and correct meals using manually entered foods.

**Dependencies:** M1.

**Scope:**
- Add manual food entry and a daily food log organized by meal.
- Support explicit serving amounts and units, including proportional nutrient calculations.
- Support adding, editing, moving, and deleting log entries and meals.
- Calculate daily calorie and macro totals in one authoritative, UI-independent calculation layer.
- Show empty, loading, validation, and persistence-error states.

**Explicit exclusions:** External database search, barcode scanning, AI-generated nutrition, weight trends, and adaptive targets.

**Acceptance criteria:**
- Users can create a food, enter it in a meal, adjust servings, and edit or remove it.
- Nutrition entered per 100 g scales proportionally to consumed grams; serving-based values remain distinguishable.
- Daily totals update once after edits or moves and never double-count a replaced entry.
- Missing nutrients remain visibly unknown and are not silently converted to zero.
- Logged data remains available offline and after restart.

**Required tests:**
- Deterministic unit tests for serving conversions, proportional calculations, rounding, incomplete nutrients, and totals.
- Repository and transaction tests for add/edit/move/delete behavior and double-count prevention.
- UI tests for the core logging and editing flow, including validation and empty/error states.

**Definition of done:** Manual logging is usable end-to-end on iPhone, persisted records and totals agree, and calculation and interaction tests pass.

### Verified M2 progress (2026-10-28)

- Added schema migration v3 to store a date-only `logged_date` (`YYYY-MM-DD`) on each food-log entry and index date-ordered log reads. New entries use the device's local calendar date separately from the UTC ISO timestamp used for event ordering. Existing v2 entries are backfilled from the first ten characters of their UTC ISO timestamp; this deterministic legacy conversion is tested.
- Reused the existing `Food`, `FoodLogEntry`, `Meal`, nutrition calculator, validation, SQLite adapter, and repository layer. Added atomic `logFood` and `updateFoodLogEntry` operations so food/nutrients and their associated entry commit or roll back together. Deletes remove the entry and its now-unreferenced food in one transaction. Repeated saves use stable IDs/upserts rather than creating duplicate entries.
- Added fixed local Breakfast, Lunch, Dinner, and Snacks meals. Users can select a day with previous/next/today controls, manually enter a food, reference serving and consumed amount/unit, kcal, protein/carbohydrates/fat in grams, and meal; saved foods are labeled as manually entered. Editing retains the record IDs and updating the entry recalculates its display/totals; deletion requires an in-app confirmation.
- Connected the existing dashboard to selected-day entries and calculated calorie/macro totals without replacing its screen or theme. Empty days display a clear empty state and zero totals. If any entry lacks a nutrient, that daily total is shown as unknown instead of summing an incomplete subset. Serving-scaled row values reuse `calculateFoodNutrition`.
- Added deterministic tests for manual input validation, strict decimal parsing, nonnegative nutrients, invalid dates, multi-entry totals and unknown nutrient handling, empty-day totals, local date selection across boundaries, selected-day repository reads, add/edit/delete, rollback of related food and log writes, v2-to-v3 date migration, and persisted log entries after closing/reopening SQLite. No additional testing framework or production dependency was added.
- Verification from the then-current `CalorieCoach\` project directory: `npm ci` passed and npm reported the existing 8 audit findings (5 low, 3 high); `npm test` passed all 11 tests; `npm run lint` passed; `npx tsc --noEmit --pretty false` passed; `npx expo config --type public` passed with SDK 58 and the SQLite plugin; and `git diff --check` passed.
- Web smoke test: `npm run web -- --port 8086` compiled the Expo Router and web bundles, and `curl.exe --head --max-time 10 http://localhost:8086` returned HTTP 200. This does not verify web persistence; the app's local SQLite layer is native-only.
- `npx expo install --check` exited with status 1 because the pre-existing SDK 58 packages `@expo/ui`, `expo`, `expo-constants`, `expo-font`, `expo-image`, `expo-linking`, `expo-router`, `expo-splash-screen`, and `expo-system-ui` are behind current SDK patch expectations. They were not changed. The Node test runner reports a module-type performance warning; it does not affect the passing test results.
- No dependency or Expo SDK versions were changed for M2. The previously accepted audit findings and reported SDK patch-version drift remain unchanged.
- User-verified physical-iPhone checks in Expo Go (reported 2026-10-28): entries save and appear in today's log; half-serving calories and macros match; editing the amount eaten updates the entry and totals; date navigation separates days; confirmed deletion removes the entry and updates totals; and entries persist after force-closing and reopening Expo Go. These checks were performed by the user, not independently by Copilot.

**Status:** Complete. Automated domain, repository, migration, rollback, and reopen tests pass, and the user has verified the complete add/edit/delete, totals, date-navigation, and restart-persistence flow on a physical iPhone through Expo Go. Automated UI interaction tests are not configured; no separate UI test framework was added. SDK 58 patch-version drift and the previously accepted npm audit findings remain unresolved and documented.

## M3: Implement nutrition database search and custom foods

**Objective:** Make foods faster to find while retaining a reliable offline path and user-created foods.

**Dependencies:** M1 and M2.

**Scope:**
- Select and document a nutrition-data provider, its licensing/terms, coverage, attribution, rate limits, privacy implications, and costs before integration.
- Place provider requests behind a replaceable service boundary with typed, runtime-validated responses.
- Add search, result review, and adding a selected result to a meal.
- Support custom foods and saved nutrition values, including editing and source/provenance labels.
- Handle unavailable networks and incomplete provider nutrition data.

**Explicit exclusions:** Barcode capture and lookup (M4), AI estimates (M7), provider credentials embedded in the client, and automatic acceptance of unreviewed results.

**Acceptance criteria:**
- Search results show enough source and serving information to distinguish matches before logging.
- External data is validated and normalized before it enters the local model.
- Provider outages, timeouts, rate limits, no matches, and missing nutrients have understandable outcomes.
- Custom foods can be created, edited, found, logged, and used offline.
- No secret API credential or unnecessary personal health data is sent from the client.

**Required tests:**
- Unit tests for provider-response validation and normalization, including malformed and incomplete responses.
- Service tests using mocked provider responses for success, timeout, rate limit, and no-result cases.
- UI tests for reviewing a result, logging it, and creating/editing an offline custom food.

**Definition of done:** Search and custom-food flows are usable, provider-specific behavior is isolated, privacy and provider terms are documented, and all integration behavior is testable without live API access.

### Verified M3 progress (2026-10-29)

- Added a typed `NutritionFoodProvider` boundary and a USDA FoodData Central adapter that expects a proxy base URL and FDC-compatible JSON. Search is bounded to 25 first-page results; provider responses are runtime-validated, duplicate results are removed, recognized nutrient identifiers and units are normalized, and unsupported branded serving units are rejected rather than guessed.
- Added a result review flow launched from **Add food**. It shows source, data type, brand, reference serving, per-100 g/ml basis, scaled nutrient preview, and meal selection before saving. Missing nutrients remain unknown; branded results are labeled as potentially manufacturer-provided and rounded. Saving reuses the existing food-log repository and selected local date.
- Added offline filtering and reuse of foods already stored locally. Existing manually entered foods remain editable through the established M2 form; selecting a saved food creates a transactional snapshot for the new entry so later edits do not mutate other log entries. Identical saved-food versions are grouped in the local results list.
- Live requests are deliberately disabled in the app: the screen constructs the adapter without a proxy URL, no USDA API key is read or bundled, and the app never uses `DEMO_KEY`. The adapter's HTTP behavior is covered with mocked fetch responses, including bounded routes, network errors, timeout, HTTP 403, rate limiting, malformed JSON, and missing proxy configuration. No live USDA request or proxy-hosting infrastructure was created.
- Documented USDA coverage and data types, CC0/public-domain status and requested attribution, manufacturer-sourced Branded Foods, the published default request limit, privacy implications, and the fact that proxy hosting costs have not been estimated. Before any hosting is added, the proxy provider, deployment steps, and expected costs require user review.
- `npm test` passed all 19 tests (11 existing M1/M2 tests and 8 M3 provider, persistence, and modal-flow tests); the Node built-in runner emits its existing `MODULE_TYPELESS_PACKAGE_JSON` performance warning. The M3 tests also verify nutrient scaling and missing values, selected-date logging, source provenance, custom-food reuse, SQLite close/reopen persistence, and sequential modal dismissal. `npm run lint`, `.\node_modules\.bin\tsc.cmd --noEmit --pretty false`, `npx expo config --type public`, and `git diff --check` passed. After the modal-flow change, `npm run web -- --port 8095` started and `curl.exe --head --max-time 10 http://localhost:8095` returned HTTP 200. No dependencies changed, so a clean install was not repeated.
- `npx expo install --check` still exits 1 for the previously recorded SDK 58 patch drift in nine Expo packages; no upgrades were made. The existing npm audit findings remain unresolved and were not re-audited for this change.
- Automated UI interaction tests are not configured. The user tested the M3 screen on a physical iPhone and reported that tapping **Search USDA foods** did nothing. Source inspection traced the initial failure to opening two sibling React Native modals concurrently on iOS. The flow now waits for each modal's iOS `onDismiss` event before presenting the other, preserving the manual draft when returning from search; the search action also dismisses the keyboard before showing provider errors. Automated modal-transition coverage passes, but physical-iPhone retesting of both fixes is still pending. Manual entry remains fully available, and saved foods can be filtered and reused offline through the new flow.

**Status:** In progress; not complete. Live USDA search requires an approved server-side proxy, and the result-review flow cannot be exercised against real results until one is available. The fix for the reported iPhone modal issue also awaits physical-device retest. No proxy provider, deployment, or cost has been selected; request user review before adding hosting infrastructure. Automated UI interaction tests remain outstanding.

## M4: Implement barcode scanning and product lookup

**Objective:** Allow a user to scan packaged-food barcodes and review matching product nutrition.

**Dependencies:** M3 and a selected provider with suitable barcode coverage.

**Scope:**
- Add camera permission handling and barcode scanning using an Expo-compatible solution.
- Look up a scanned identifier through the selected provider and map a validated match into the existing food model.
- Provide clear permission-denied, unsupported-code, no-match, network-failure, and incomplete-data states.
- Offer a route back to search or manual food entry when lookup fails.

**Explicit exclusions:** Treating a barcode as proof of accurate nutrition, scanning without consent, automatic logging without review, and custom camera/native implementation when an Expo-supported API suffices.

**Acceptance criteria:**
- Permission is requested in context and can be declined without blocking manual entry.
- A recognized code produces a reviewable product and serving summary before it is logged.
- Unknown or unavailable products never appear as fabricated records.
- The flow works in the required iPhone build; any native-module requirement and development-build steps are documented.

**Required tests:**
- Unit tests for barcode validation and response mapping.
- Mocked lookup tests for found, missing, malformed, incomplete, and offline outcomes.
- Device tests for camera permission, scan, cancel, and fallback flows.

**Definition of done:** Scanning is usable on a physical iPhone, lookup results are reviewable and validated, and every failure path preserves the manual/search alternatives.

## M5: Implement weight logging and trend visualization

**Objective:** Record weigh-ins and present a trend that does not overstate day-to-day changes.

**Dependencies:** M1.

**Scope:**
- Add local weigh-in entry, editing, and deletion with explicit units and timestamps.
- Display individual measurements separately from a clearly labeled smoothed trend.
- Handle sparse, missing, and irregularly timed measurements.
- Explain the trend's display window and smoothing behavior in the UI or supporting documentation.

**Explicit exclusions:** Medical interpretation, claims about body-fat change, calorie-target adaptation (M6), and cloud health-record sync.

**Acceptance criteria:**
- Weigh-ins persist offline and can be corrected without duplication.
- Unit display/conversion is explicit and deterministic.
- Trend visualization distinguishes raw observations from the smoothed series and does not imply precision unsupported by the data.
- Insufficient history is shown as insufficient rather than extrapolated.

**Required tests:**
- Unit tests for unit conversion, ordering, duplicate dates, missing values, irregular intervals, and trend edge cases.
- Persistence tests for weigh-in create/edit/delete.
- UI tests for logging, correcting, and viewing both raw and trend values, including insufficient-data states.

**Definition of done:** Users can maintain a persistent weigh-in history and understand the limits of its trend; calculation and interaction tests pass.

## M6: Implement and test adaptive calorie-target calculations

**Objective:** Provide transparent, conservative target adjustments grounded in adequate intake and weight-trend data.

**Dependencies:** M2 and M5.

**Scope:**
- Specify and document deterministic adjustment logic, assumptions, minimum history/log completeness, confidence limitations, and safety bounds before UI integration.
- Calculate using the authoritative logged-intake and weight-trend data, with explicit behavior for missing or unreliable inputs.
- Explain meaningful target changes and allow the user to review and override targets.
- Keep calculation logic independent of UI and persistence.

**Explicit exclusions:** Reproducing another product's proprietary algorithm, medical diagnosis or treatment advice, extreme restriction, and automatic aggressive changes from noisy data.

**Acceptance criteria:**
- Identical input histories produce identical outputs.
- Insufficient, incomplete, or anomalous data results in no adjustment (or another explicitly documented safe outcome).
- Changes respect configurable safety bounds and are explained to the user.
- Users can review and override a proposed target; an override is not silently discarded.
- The calculation makes clear that estimates are not exact measurements of energy expenditure.

**Required tests:**
- Deterministic tests for normal cases, boundary values, insufficient history, incomplete logs, missing weigh-ins, noisy/outlier measurements, and overrides.
- Tests that verify target bounds and repeatability.
- UI tests for explanation, review, acceptance/rejection, and override persistence.

**Definition of done:** The assumptions and safety behavior are documented, calculations pass edge-case tests, and no target changes are presented without an understandable explanation and user control.

## M7: Implement AI-assisted meal estimation with user review before saving

**Objective:** Help estimate meal nutrition while keeping estimates transparent, reviewable, and separate from confirmed records.

**Dependencies:** M2 and M3.

**Scope:**
- Define an AI service boundary and the minimum meal input required.
- Present estimated foods, portions, nutrients, uncertainty, and source labeling for correction before logging.
- Obtain explicit user confirmation before any estimate is saved as a food-log entry.
- Review provider privacy, retention, cost, rate limits, and credential handling before selecting an integration.

**Explicit exclusions:** Silent or automatic logging, presenting AI output as verified nutrition, using AI for arithmetic/totals, sending credentials or unrelated personal data, and training on user records without explicit approval.

**Acceptance criteria:**
- Every generated nutrient value is clearly labeled as an estimate and can be inspected and edited.
- Nothing is persisted to the food log until the user reviews and confirms it.
- Deterministic app logic validates inputs and calculates persisted totals.
- Network, timeout, malformed-output, and refusal states do not lose the user's entered meal description.
- Data sent to a provider is minimized and disclosed before submission.

**Required tests:**
- Unit tests for parsing, validation, uncertainty labeling, and deterministic total calculations.
- Mocked integration tests for valid, incomplete, malformed, timeout, and provider-error outputs.
- UI tests proving edit/review is possible and persistence only follows explicit confirmation.

**Definition of done:** AI estimates are isolated, visibly uncertain, user-reviewed before saving, and covered by tests proving AI output cannot bypass validation or arithmetic rules.

## M8: Complete reliability, privacy, backup/export, and iOS release readiness

**Objective:** Prepare the app and its local data for dependable personal use and a maintainable iOS release.

**Dependencies:** M0 through M7.

**Scope:**
- Review privacy, permissions, logging, secret handling, external data flows, and data deletion behavior.
- Implement documented backup/export and restore/import for user data, with validation and clear conflict/overwrite behavior.
- Exercise migrations, interrupted writes, and recovery paths on-device.
- Finalize accessibility, small-screen layout, offline/error behavior, and release configuration.
- Produce and install an EAS iOS build and perform a physical-device release smoke test.

**Explicit exclusions:** Unapproved cloud sync, accounts, analytics/advertising, unsupported health claims, and releasing secrets or signing credentials in the repository.

**Acceptance criteria:**
- Users can export their records and safely restore a validated backup without silent loss or duplicate creation.
- Privacy disclosures and actual network/data behavior agree; permissions are minimal and contextual.
- Critical flows work offline and recover from storage, migration, and network failures without silent data loss.
- EAS configuration builds an installable iOS artifact and the release candidate is smoke-tested on a physical iPhone.
- Known limitations, data-retention behavior, and recovery steps are documented.

**Required tests:**
- Full automated unit, persistence, migration, integration, and critical UI suites.
- Backup/export round-trip, malformed backup, interrupted restore, and duplicate/conflict tests.
- Privacy/permission review and offline/failure-path verification.
- EAS iOS build and physical-device smoke tests for install, launch, logging, persistence, and backup/restore.

**Definition of done:** Reliability, privacy, backup/restore, and release acceptance criteria are met; automated checks pass; the EAS build is installed and exercised on an iPhone; remaining limitations are documented.
