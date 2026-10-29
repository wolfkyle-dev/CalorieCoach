# CalorieCoach — GitHub Copilot Instructions

## 1. Project Overview

CalorieCoach is an iPhone-first personal calorie and nutrition tracking application inspired by the functionality of MacroFactor.

The long-term goal is to provide:
- Accurate calorie and macronutrient tracking.
- Fast food logging through search, barcode scanning, and AI-assisted entry.
- Daily calorie and macro targets.
- Body-weight tracking and trend analysis.
- Adaptive calorie targets based on weight trends and observed energy balance.
- A polished, responsive, reliable mobile experience.

This is an independent application. Do not copy proprietary code, branding, assets, or undocumented algorithms from other applications.

Prioritize correctness, maintainability, privacy, and a great user experience over unnecessary complexity.

## 2. Development Environment

- Primary development OS: Windows 11.
- Primary target: iPhone and iOS.
- Framework: React Native with Expo.
- Language: TypeScript with strict type checking.
- Package manager: npm.
- Navigation: Expo Router, unless the existing project establishes a different working architecture.
- Version control: Git and GitHub.
- iOS builds: Expo Application Services (EAS).
- Initial development and testing: Expo Go when compatible, followed by development builds when required.

Do not require a local Mac or Xcode for routine development.

All development instructions must work in Windows PowerShell unless explicitly identified otherwise.

Do not modify, reconfigure, or depend on the developer's separate Linux server without explicit authorization.

## 3. Working Rules

Before implementing a task:

1. Inspect the existing project structure and relevant files.
2. Read this document and any applicable project-specific instructions.
3. Identify dependencies, existing conventions, and potential regressions.
4. Propose a concise implementation plan for substantial changes.
5. Implement the smallest complete solution that meets the requirements.

When making changes:

- Preserve existing working functionality.
- Avoid rewriting unrelated files.
- Prefer incremental, reviewable changes.
- Do not replace configuration files wholesale when a targeted edit will suffice.
- Do not introduce a new library when existing platform APIs or dependencies can solve the problem adequately.
- Explain meaningful trade-offs when multiple approaches are reasonable.
- Ask for clarification when a decision could significantly affect data integrity, privacy, cost, or architecture.

Never claim a command, test, build, or feature succeeded unless it was actually executed or verified. Clearly distinguish completed work from proposed work.

## 4. Code Quality and Architecture

Use TypeScript throughout the application.

- Enable and maintain strict type checking.
- Avoid `any`; use explicit types, generics, `unknown`, and runtime validation where appropriate.
- Separate UI components, application logic, data access, and external integrations.
- Prefer small, reusable components with clear responsibilities.
- Keep business rules independent of React components.
- Use descriptive names and consistent formatting.
- Handle loading, empty, error, and success states.
- Avoid duplicated business logic.
- Remove unused code and dependencies introduced during implementation.
- Do not suppress TypeScript errors or lint rules merely to make checks pass.
- Use comments to explain non-obvious decisions rather than restating the code.

Follow the existing project structure where practical. Do not reorganize the entire codebase without a clear benefit.

## 5. User Interface and Experience

Design for an iPhone-first experience.

The interface should feel polished, modern, calm, and data-focused, with an emphasis on readability and efficient daily use.

Priorities:

- Clear visual hierarchy.
- Readable typography and adequate contrast.
- Comfortable touch targets.
- Responsive layouts across supported iPhone sizes.
- Appropriate keyboard behavior and safe-area handling.
- Accessible labels and controls.
- Useful loading, empty, and error states.
- Consistent spacing, colors, and component patterns.
- Light and dark mode support where practical.

The core daily workflow should make it easy to understand:
- Calories consumed.
- Calories remaining.
- Protein, carbohydrates, and fat consumed.
- Logged meals and foods.
- Current weight and weight trend.

Avoid unnecessary animations, excessive decoration, and interactions that slow down food logging.

Do not use hardcoded sample values in production calculations or present demo data as actual user records.

## 6. Nutrition and Calculation Accuracy

Nutrition calculations are core business logic and must be testable independently of the UI.

Use explicit units and well-defined data models.

- Store energy internally in a consistent unit, preferably kcal.
- Store macronutrients in grams.
- Represent serving quantities and serving units explicitly.
- Preserve the distinction between per-serving and per-100-gram nutrition values.
- Calculate nutrients proportionally to the consumed quantity.
- Handle missing nutrition values explicitly rather than silently treating unknown values as zero.
- Define and test rounding rules.
- Prevent accidental double-counting when foods or meals are edited.
- Keep calculated totals consistent across the food log, dashboard, and daily summaries.

For a food with a nutrient value specified per 100 grams:

consumed nutrient = nutrient per 100 g × consumed grams / 100

For calorie and macro summaries, use a single authoritative calculation layer.

Do not silently invent nutrition information. Identify estimates and distinguish them from verified database values.

## 7. Food Logging and Nutrition Data

The application will eventually support:

1. Manual food entry.
2. Search against an external nutrition database.
3. Barcode scanning and packaged-food lookup.
4. Custom foods and saved meals.
5. AI-assisted meal descriptions and estimates.

Implement these incrementally.

Food records should support, as appropriate:

- Stable identifiers.
- Food name and brand.
- Serving size and unit.
- Nutrition values and their units.
- Data source and external source identifier.
- Barcode when available.
- Whether values are verified, estimated, or user-entered.
- Creation and modification timestamps.

Preserve the original source information where practical.

AI-generated food estimates must be identified as estimates and presented for user review before being saved as confirmed nutrition data.

Do not assume that a barcode always resolves to a food or that every food database contains complete nutrition information.

Keep external nutrition providers behind a replaceable service layer so providers can be changed without rewriting the UI.

## 8. Weight Tracking and Adaptive Calorie Targets

Weight tracking and adaptive coaching are important long-term features.

Separate these concepts:

- Individual weigh-ins.
- Smoothed weight trends.
- Estimated energy expenditure.
- Prescribed calorie targets.
- Actual calorie intake.
- Observed progress over time.

Do not treat an individual day's weight change as equivalent to a change in body fat.

Account for measurement noise, incomplete logs, missing weigh-ins, and insufficient historical data.

Adaptive targets should use transparent, testable business logic. Document the assumptions, minimum data requirements, confidence limitations, and behavior when data is insufficient.

Do not invent a proprietary algorithm or claim to reproduce another product's exact algorithm.

Keep calorie targets within configurable safety bounds. Do not recommend extreme restriction or automatically make aggressive adjustments based on noisy data.

Explain meaningful target changes to the user and allow targets to be reviewed and overridden.

Write deterministic unit tests for calculations, edge cases, and insufficient-data scenarios before integrating coaching logic into the UI.

## 9. Data Storage and Integrity

Start with local-first storage unless the task explicitly requires a backend.

Use SQLite through an Expo-compatible library for structured local data when appropriate.

- Keep database access separate from presentation components.
- Use parameterized queries.
- Use transactions for related changes that must succeed or fail together.
- Add versioned database migrations.
- Preserve user data when schemas change.
- Use stable identifiers rather than relying on display names.
- Define relationships between foods, meals, food-log entries, and weigh-ins.
- Handle database failures without silently losing data.

Do not introduce cloud synchronization, authentication, or a remote backend without an explicit architectural decision.

Any future synchronization system must account for offline changes, duplicate records, conflict resolution, and deletion propagation.

## 10. Privacy and Security

Nutrition records, body-weight history, and personal goals are sensitive personal information.

- Collect only the information needed for the feature.
- Keep API credentials out of source code and version control.
- Never place secret API keys in client-side application code or Expo public environment variables.
- Use a trusted server-side service for integrations requiring secret credentials.
- Validate external data before using it.
- Avoid logging personal health-related data, credentials, or complete API responses unnecessarily.
- Do not transmit user records to external services without a clear feature requirement and appropriate disclosure.
- Do not add analytics, advertising trackers, or third-party data sharing without explicit approval.
- Treat external API responses and AI outputs as untrusted input.
- Keep `.env` files and other secrets out of Git, and maintain an appropriate `.gitignore`.

Use secure storage for credentials or tokens when required. Do not treat ordinary local application storage as a secure vault.

## 11. External APIs and AI Integrations

Keep API-specific logic in dedicated service modules.

- Use explicit request and response types.
- Validate responses at runtime.
- Handle timeouts, rate limits, unavailable services, and malformed data.
- Avoid exposing provider-specific details throughout the UI.
- Avoid unnecessary network requests.
- Provide useful offline or failure behavior when possible.
- Keep API usage and potential costs visible during implementation planning.

AI must not be the source of truth for arithmetic or persisted nutrition totals. Use deterministic code for calculations and validation.

Do not send API keys, credentials, or unnecessary personal data to AI providers.

## 12. Testing and Verification

Every substantive feature should include appropriate verification.

Use the existing test framework if one is configured. Otherwise, choose a lightweight, Expo-compatible testing setup before adding extensive infrastructure.

Priorities:

- Unit tests for nutrition and calorie calculations.
- Tests for serving-size conversions and rounding.
- Tests for weight-trend and adaptive-target logic.
- Tests for malformed and incomplete nutrition records.
- Tests for database operations and migrations.
- Component tests for important user interactions.
- Type checking and linting.
- A real-device smoke test for significant mobile changes.

Before declaring a task complete:

1. Run the relevant tests.
2. Run available type-checking and linting commands.
3. Fix regressions introduced by the change.
4. Report any checks that could not be run.
5. Summarize modified files and known limitations.

Do not claim that an iOS build succeeds based solely on TypeScript compilation.

## 13. Dependencies and Expo Compatibility

Prefer Expo-supported APIs and libraries compatible with the project's installed SDK.

Before adding or upgrading dependencies:

- Check compatibility with the existing Expo SDK and React Native version.
- Prefer `npx expo install` for Expo-compatible native dependencies.
- Avoid unnecessary major-version upgrades.
- Explain native build requirements when introducing a native module.
- Update lockfiles consistently through npm.
- Do not manually edit generated files unless necessary.

Keep Expo Go compatibility in mind during early development. When a feature requires a development build, explain the reason and the required steps.

## 14. Git and Change Management

Use small, logically grouped changes.

- Never discard unrelated user changes.
- Inspect Git status before broad edits or potentially destructive operations.
- Do not run destructive Git commands without explicit authorization.
- Do not commit secrets, personal data, generated credentials, or signing files.
- Do not force-push or rewrite shared history without explicit authorization.
- Prefer clear, descriptive commit messages.
- Summarize changes before requesting review.

Do not commit or push ad hoc; for completed roadmap milestones, follow the default workflow in section 18 after all required verification gates pass.

## 15. Definition of Done

A feature is complete when:

- It satisfies the requested behavior.
- Its implementation fits the existing architecture.
- Relevant tests pass.
- Available type checks and lint checks pass.
- Error and empty states are handled.
- Data integrity and privacy have been considered.
- Documentation is updated where necessary.
- No unrelated functionality has been broken.
- Remaining limitations are clearly reported.

## 16. Communication Style

Be direct, technically precise, and transparent.

When implementing a task, provide:

1. A concise summary of the approach.
2. The key files changed.
3. Important architectural or product decisions.
4. Commands and checks executed, with actual results.
5. Any outstanding issues or manual steps required.

Prefer practical solutions over speculative abstractions. Explain meaningful trade-offs, but avoid unnecessary complexity for a personal-use application.

## 17. Shared Development Roadmap

Use [`docs/ROADMAP.md`](../docs/ROADMAP.md) as the shared milestone sequence and source of milestone acceptance criteria. Keep changes incremental, satisfy the active milestone's definition of done, and do not implement future milestone scope unless explicitly requested.

## 18. Milestone Completion and GitHub Backup Workflow

- Implement one roadmap milestone at a time.
- Run relevant automated checks and record their actual results.
- For device-dependent features, distinguish automated verification from user-performed device verification.
- Do not declare a milestone complete until its required verification gates pass.
- Once a milestone's required verification is complete, use a focused feature branch, inspect the staged diff, commit only intended changes, push the branch, and open a pull request into the repository's default branch.
- Verify remote push success before describing the code as backed up.
- Never commit secrets, credentials, environment files, build artifacts, or unrelated user changes.
- Never commit directly to the default branch, force-push, discard user changes, or merge a pull request without explicit user approval.
- If authentication or permissions block an operation, explain the blocker and the next action without claiming success.
- Keep unresolved security findings and dependency warnings documented accurately.
- Ask before destructive actions or changes that materially alter repository configuration.