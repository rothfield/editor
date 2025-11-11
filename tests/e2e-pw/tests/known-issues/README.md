# Known Issues Tests

This directory contains tests for **known issues** or **unimplemented features** that currently fail.

## Purpose

These tests are preserved here to:
1. Document expected behavior for future implementation
2. Provide ready-to-use tests when features are added
3. Avoid polluting CI/CD test results with expected failures

## Test Categories

### Layout & Spacing
- `FAILING-slurs-reserve-space.spec.js` - Slurs should not affect line height
- `FAILING-no-space-reservation-for-decorations.spec.js` - Decorations should not reserve vertical space
- `FAILING-lyrics-height-with-decorations.spec.js` - Lyrics height should not be affected by decorations

### UI Interactions
- `FAILING-click-highlights-line.spec.js` - Clicking should highlight the current line
- `FAILING-click-render-border.spec.js` - Click target borders/hit areas

## How to Use

When implementing a feature covered by these tests:
1. Move the test file back to `tests/e2e-pw/tests/`
2. Remove the `FAILING-` prefix from the filename
3. Update test descriptions to remove "FAILING:" markers
4. Ensure the test passes
5. Update this README

## Running These Tests

These tests are **excluded from normal test runs**. To run them manually:

```bash
npx playwright test tests/e2e-pw/tests/known-issues/
```

**Expected result:** All tests in this directory will fail until the features are implemented.
