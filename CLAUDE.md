# editor Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-14

## Active Technologies
- Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+ + wasm-bindgen 0.2.92, OSMD (OpenSheetMusicDisplay) 1.7.6, existing Cell-based editor (002-real-time-staff)
- Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, serde 1.0.197, quick-xml 0.31, mustache 0.9 (006-music-notation-ornament)
- JSON file format for document persistence (006-music-notation-ornament)
- Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, UnoCSS (styling) (006-music-notation-ornament)

## Project Structure
```
src/
tests/
```

## Commands
cargo test [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] cargo clippy

## Code Style
Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+: Follow standard conventions

## Recent Changes
- 006-music-notation-ornament: Added Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, UnoCSS (styling)
- 006-music-notation-ornament: Added Rust 1.75+ (WASM module) + JavaScript ES2022+ (host application) + wasm-bindgen 0.2.92, OSMD 1.7.6, serde 1.0.197, quick-xml 0.31, mustache 0.9
- 002-real-time-staff: Added Rust 1.75+ (WASM module), JavaScript ES2022+ (host application), Node.js 18+ + wasm-bindgen 0.2.92, OSMD (OpenSheetMusicDisplay) 1.7.6, existing Cell-based editor

<!-- MANUAL ADDITIONS START -->

## Inspector-First, LilyPond-Fail-Fast Testing (Playwright + Docker)

A compact playbook for Claude CLI to make wasm/js/html/css music-notation editor tests **reliable, quiet, and end-to-end meaningful**.

### Core Principle

**Prioritize in-app inspector tabs as your oracles, in this order:**

1. **LilyPond source** — easiest end-to-end truth (export reflects editor state)
2. **MusicXML source** — structural soundness (measures, ties, tuplets)
3. **WASM DOM Layout** — semantic rendering checks (ordering, caret/bbox presence)
4. **Document Model** — logical tokens/beats/column alignment

**Fail fast if LilyPond panel is empty or incorrect.** Skip noisy visuals and browser report windows.

### Claude "System" Meta-Instructions (Summary)

You are an **autonomous test engineer** (CLI only):

1. **Use inspector tabs as ground truth**; do not open Playwright HTML report windows
2. **Prefer semantic assertions & text snapshots** over screenshots
3. **Use stable locators**: `getByRole`, `getByLabel`, `getByTestId`
4. **No sleeps**; rely on Playwright auto-wait and `expect.poll`
5. **On failure**: produce a small patch proposal (add `data-testid`, better selectors, or targeted waits)
6. **Always save artifacts to disk**; keep output quiet

### Minimal Locators (Required in App)

```html
<!-- Inspector tabs -->
<button data-testid="tab-lilypond">LilyPond</button>
<button data-testid="tab-musicxml">MusicXML</button>
<button data-testid="tab-displaylist">Display List</button>
<button data-testid="tab-docmodel">Doc Model</button>

<!-- Inspector panes -->
<pre data-testid="pane-lilypond"></pre>
<pre data-testid="pane-musicxml"></pre>
<pre data-testid="pane-displaylist"></pre>
<pre data-testid="pane-docmodel"></pre>

<!-- Editor -->
<div data-testid="editor-root" role="textbox"></div>
```

### Playwright Config (Quiet + Artifacts)

- **Reporter**: `list` (or `list + html` with `{ open: 'never' }`)
- **use**: `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`
- **expect.timeout** = 5000, **test timeout** ~ 30s
- **webServer** starts your dev server and waits on URL
- **Default headless**; no report windows

### Helper Utilities (Inspector-First)

Create `tests/helpers/inspectors.js`:

```javascript
import { expect } from '@playwright/test';

export async function openTab(page, testId) {
  const tab = page.getByTestId(testId);
  await expect(tab).toBeVisible();
  await tab.click();
}

export async function readPaneText(page, testId) {
  const pane = page.getByTestId(testId);
  await expect(pane).toBeVisible();
  await expect.poll(async () => (await pane.innerText()).trim()).not.toEqual('');
  return (await pane.innerText())
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
```

### Fail-Fast Smoke Test (Runs First)

Create `tests/e2e-pw/tests/00-lilypond-smoke.spec.js`:

```javascript
import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('SMOKE: LilyPond export reflects editor content (fail-fast)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type('S--r G- m |'); // tiny deterministic motif

  await openTab(page, 'tab-lilypond');
  const ly = await readPaneText(page, 'pane-lilypond');

  expect(ly.length).toBeGreaterThan(0);
  expect(ly).toMatchSnapshot('smoke.ly.txt'); // stable, diffable
});
```

Replicate the pattern for **MusicXML**, **WASM layout**, and **Document Model** as secondary checks.

### Docker (Quiet) Runner

Example Docker command for quiet, artifact-focused runs:

```bash
#!/bin/bash
IMG="mcr.microsoft.com/playwright:v1.48.2-jammy"
ART="$(pwd)/artifacts"
mkdir -p "$ART"

docker run --rm -it --ipc=host \
  -v "$(pwd):/work" -w /work \
  -e CI=1 -e HOME=/work/.home \
  -v "$ART:/work/artifacts" \
  "$IMG" bash -lc "
    corepack enable && pnpm i --frozen-lockfile &&
    npx playwright install --with-deps &&
    npx playwright test --reporter=list --output=artifacts
  "
```

No report UI is opened; artifacts & traces go to `./artifacts`.

### Autonomy Loop for Claude (Terse)

1. **Plan** one hypothesis (ex: "LilyPond reflects typed motif")
2. **Run** only the needed spec/test
3. **Inspect** the right tab; grab text; normalize; assert
4. **Harden** (selectors, `expect.poll`, add `data-testid`)
5. **Artifacts (CLI)**: snapshot diffs + trace on retry; write `artifacts/triage.md`
6. **Patch**: propose tiny changes; no broad retries/timeouts; never disable tests

### Why This Works

- ✅ **End-to-end confidence** without pixel flakiness
- ✅ **Fast triage**: LilyPond text exposes real logic/regression
- ✅ **Quiet runs**: no distracting browser/HTML report windows
- ✅ **Deterministic**: stable locators + auto-wait + snapshot text

### Next Steps

1. Ensure app exposes the test IDs above
2. Convert existing specs to call `openTab`/`readPaneText` where relevant
3. Add a second smoke test for MusicXML (structure) to catch format regressions early
4. Gate heavier suites on passing the LilyPond smoke test

---

## Playwright Testing Workflow (Docker-based)

### Overview
This project uses Playwright for E2E testing, running in Docker containers to ensure consistent cross-browser testing (especially for WebKit/Safari on non-compatible systems).

**⚠️ CRITICAL: Do not open the Playwright HTML report browser window.** Always configure Playwright with `{ open: 'never' }` and rely on test output, logs, and artifacts saved to disk instead. This keeps the CLI experience clean and avoids unexpected browser windows.

### Core Testing Commands

**Local Development:**
- `npm run test:e2e` - Run all tests locally (if environment supports)
- `npm run test:headed` - Run with browser UI visible
- `npm run test:debug` - Run with Playwright Inspector
- `npm run test:ui` - Run with Playwright UI Mode

**Docker Testing:**
- `./scripts/run-tests-docker.sh` - Run all tests in Docker
- `./scripts/run-tests-docker.sh tests/e2e-pw/tests/specific.spec.js` - Run specific test file
- `docker-compose up --build playwright-tests` - Run via docker-compose

**Selective Execution:**
- `npx playwright test --project=chromium` - Single browser
- `npx playwright test --project=webkit` - WebKit only (use Docker on Arch Linux)
- `npx playwright test -g "test name pattern"` - Filter by test name
- `npx playwright test --headed` - See browser UI (local only)

### Best Practices for Claude

#### 1. Docker Image Management
- **Cache awareness**: Rebuild only when Dockerfile/dependencies change
- **Check before rebuild**: Ask user if Docker image needs rebuilding, or check if it exists
- **Layer optimization**: Suggest enabling BuildKit (`DOCKER_BUILDKIT=1`) for faster builds
- **Image tagging**: Consider tagging images with feature/commit for traceability

#### 2. Writing Tests
- **Deterministic waits**: ALWAYS use `waitForSelector()`, `waitForLoadState()`, or `expect()` with auto-waiting
- **Avoid hardcoded timeouts**: Only use `waitForTimeout()` for animations/transitions, not for element loading
- **Use locators properly**: Prefer `page.locator()` or `page.getByTestId()` over `page.$()` for auto-waiting behavior
- **Test isolation**: Each test should be independent and not rely on previous test state
- **Inspector-first**: Prioritize checking inspector tabs (LilyPond, MusicXML, WASM, DocModel) over visual rendering

**Good Pattern:**
```javascript
await page.waitForSelector('#element', { state: 'visible' });
await expect(page.locator('#element')).toBeVisible();

// Even better: use inspector tabs
const ly = await readPaneText(page, 'pane-lilypond');
expect(ly).toContain('\\relative c\'');
```

**Bad Pattern:**
```javascript
await page.waitForTimeout(2000); // ❌ Flaky and slow
```

#### 3. Running Tests Efficiently
- **Single file testing**: When developing a feature, run only the relevant test file
- **Single browser**: Use `--project=chromium` for quick iteration, then test all browsers
- **Parallel execution**: Default is parallel; use `--workers=1` only for debugging
- **Failed tests**: Use `--last-failed` to rerun only previously failed tests
- **Retries**: CI has 2 retries configured; local has 0 (immediate feedback)
- **Smoke test first**: Run `00-lilypond-smoke.spec.js` to catch obvious regressions

#### 4. Debugging Tests
**When tests fail:**
1. Check test output for specific error messages
2. Look for screenshots in `test-results/` or `artifacts/` directory
3. Use `--trace on` for detailed timeline
4. Run specific failing test with `--headed --debug`
5. Check browser console logs (tests should capture these)
6. **Inspect the inspector tabs**: Check if LilyPond/MusicXML output is correct

**Quick debug workflow:**
```bash
# 1. Run failing test with UI
npx playwright test failing-test.spec.js --headed --project=chromium

# 2. If still unclear, use inspector
npx playwright test failing-test.spec.js --debug

# 3. For Docker issues, check logs
docker logs editor-playwright-tests

# 4. Check artifacts
ls -la test-results/
cat artifacts/triage.md  # if it exists
```

#### 5. Test Artifacts
- **Screenshots**: Automatically captured on failure (`screenshot: 'only-on-failure'`)
- **Videos**: Retained on failure (`video: 'retain-on-failure'`)
- **Traces**: Captured on first retry (`trace: 'on-first-retry'`)
- **Snapshots**: Text snapshots for LilyPond/MusicXML output (`.toMatchSnapshot()`)
- **Location**: All in `test-results/` or `artifacts/` directory
- **Reports**: HTML report in `playwright-report/`, view with `npx playwright show-report`
- **Keep it quiet**: Do NOT auto-open HTML reports; save artifacts to disk instead

#### 6. CI/CD Considerations
- **Environment**: Tests run in Docker with `CI=true` environment variable
- **Workers**: Limited to 1 worker in CI for stability
- **Retries**: 2 automatic retries on CI failures
- **Forbid .only**: `forbidOnly: true` in CI prevents accidentally committed focused tests
- **Server**: Dev server starts automatically with 120s timeout

#### 7. Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "WebKit not supported on Arch" | Use Docker: `./scripts/run-tests-docker.sh` |
| "Test timeout" | Check dev server is running; increase timeout if needed |
| "Element not found" | Use proper waits; check if element exists in DOM; add `data-testid` |
| "Flaky test" | Remove `waitForTimeout()`, use deterministic waits or `expect.poll()` |
| "Docker build slow" | Enable BuildKit; check if rebuild is necessary |
| "Can't see what's happening" | Use `--headed` mode locally or check screenshots/artifacts |
| "LilyPond output empty" | Check if WASM loaded; verify export triggered; inspect console errors |
| "HTML report opened" | Set `{ open: 'never' }` in config reporter |

#### 8. Workflow for New Features

**When Claude implements a new feature:**
1. **Add `data-testid` attributes** to new UI elements during implementation
2. Write test file in `tests/e2e-pw/tests/feature-name.spec.js`
3. **Use inspector helpers**: Import `openTab` and `readPaneText` from `../helpers/inspectors.js`
4. Start with single browser: `npx playwright test new-test.spec.js --project=chromium --headed`
5. Fix issues quickly with immediate visual feedback
6. Remove `--headed` and verify test passes reliably 3+ times
7. **Verify inspector output**: Check LilyPond/MusicXML tabs contain expected output
8. Test all browsers: `npx playwright test new-test.spec.js`
9. If WebKit fails, verify in Docker: `./scripts/run-tests-docker.sh tests/e2e-pw/tests/new-test.spec.js`
10. Run full suite to ensure no regressions: `npm run test:e2e`

#### 9. Performance Optimization
- **Reduce wait times**: Minimize timeout values where possible; use `expect.poll()` for dynamic content
- **Parallel tests**: Default `fullyParallel: true` is good; keep it
- **Reuse server**: `reuseExistingServer: true` in local dev
- **Skip unnecessary browsers**: During development, test one browser first
- **Selective reruns**: Use `--last-failed` after fixing issues
- **Cache Docker images**: Don't rebuild unnecessarily

#### 10. Code Review Checklist
Before marking test work as complete, verify:
- [ ] No hardcoded `waitForTimeout()` except for animations
- [ ] Uses `waitForSelector()`, `expect.poll()`, or auto-waiting `expect()`
- [ ] Test is deterministic (passes 3+ times in a row)
- [ ] Works in all configured browsers (chromium, firefox, webkit)
- [ ] Captures relevant console logs for debugging
- [ ] Has clear test descriptions
- [ ] Follows existing test patterns in codebase
- [ ] Includes proper assertions, not just "no errors"
- [ ] **Uses inspector tabs** for end-to-end verification (LilyPond/MusicXML)
- [ ] **Has `data-testid` attributes** for stable selectors
- [ ] **Text snapshots** used where appropriate (`.toMatchSnapshot()`)
- [ ] **No auto-opening reports**; artifacts saved to disk

### Quick Reference Card

```bash
# Fast iteration (single browser, one test)
npx playwright test my-test.spec.js --project=chromium

# Debug visually
npx playwright test my-test.spec.js --headed --project=chromium

# Run in Docker (WebKit on Arch)
./scripts/run-tests-docker.sh tests/e2e-pw/tests/my-test.spec.js

# Rerun failures
npx playwright test --last-failed

# Full CI simulation
CI=true npx playwright test

# Smoke test (LilyPond fail-fast)
npx playwright test 00-lilypond-smoke.spec.js

# Quiet Docker run with artifacts
docker run --rm -v $(pwd):/work -w /work -e CI=1 \
  mcr.microsoft.com/playwright:v1.48.2-jammy \
  npx playwright test --reporter=list --output=artifacts
```

### Anti-Patterns to Avoid
1. ❌ Rebuilding Docker image unnecessarily
2. ❌ Using `waitForTimeout()` for element loading
3. ❌ Running full suite when debugging one test
4. ❌ Running all browsers during rapid iteration
5. ❌ Ignoring test artifacts (screenshots/videos/traces) when debugging
6. ❌ Not checking if dev server is already running
7. ❌ Using `.only()` in committed code
8. ❌ Writing interdependent tests that must run in sequence
9. ❌ **Auto-opening HTML reports** instead of saving artifacts
10. ❌ **Testing visuals** instead of inspector tab content
11. ❌ **Missing `data-testid` attributes** on interactive elements
12. ❌ **Ignoring LilyPond/MusicXML output** when verifying features

## IMPORTANT: WASM Function Integration Pattern

**⚠️ DO NOT FORGET THIS - It's a waste of time to debug later**

When adding a new WASM function that needs to be called from JavaScript:

### The Pattern
1. ✅ Add `#[wasm_bindgen]` to Rust function
2. ✅ Rebuild WASM: `npm run build-wasm` (generates new `.wasm` + `.js` exports)
3. ⚠️ **CRITICAL: Add the function to the JavaScript wrapper object in `src/js/editor.js`** (lines ~64-101)

### Example - DO NOT SKIP STEP 3
```rust
// src/api/core.rs
#[wasm_bindgen(js_name = generateIRJson)]
pub fn generate_ir_json(document_js: JsValue) -> Result<String, JsValue> {
    // implementation
}
```

The function is now **exported from WASM**, but JavaScript code using `this.wasmModule.generateIRJson()` will **FAIL** unless you add it here:

```javascript
// src/js/editor.js - lines ~64-101
this.wasmModule = {
    // ... other functions
    generateIRJson: wasmModule.generateIRJson  // ⚠️ ADD THIS LINE OR IT WON'T WORK
};
```

### Why This Happens
- `wasm-pack` exports all `#[wasm_bindgen]` functions to the module's public API
- The Editor class wraps WASM functions in `this.wasmModule` for organized access
- If you don't add the function to the wrapper, `this.wasmModule.functionName` will be `undefined`
- JavaScript code checking `typeof this.wasmModule?.functionName === 'function'` will fail silently
- This wastes debugging time - the function exists in WASM but isn't accessible from JS

### Quick Checklist for New WASM Functions
- [ ] Function works in Rust tests (`cargo test`)
- [ ] Added `#[wasm_bindgen]` decorator
- [ ] Ran `npm run build-wasm` successfully
- [ ] **Added to `this.wasmModule` object in `src/js/editor.js`** ← REQUIRED
- [ ] JavaScript code calls `this.wasmModule.functionName()`
- [ ] Tested in browser with hard refresh (Ctrl+Shift+R)

<!-- MANUAL ADDITIONS END -->
