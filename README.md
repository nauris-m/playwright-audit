# playwright-audit

Automated accessibility testing suite using Playwright, Axe-core, and Lighthouse to audit web applications for WCAG 2.0-2.2 compliance.

## Overview

This test suite performs comprehensive accessibility audits on web pages by:
- **Axe-core**: Detects accessibility violations using WCAG standards
- **Lighthouse**: Provides accessibility scoring and detailed audit reports
- **Visual Highlighting**: Screenshots with highlighted problematic elements
- **Detailed Reporting**: Generates markdown and JSON reports for each tested route

## Features

- ✅ Automated login and navigation
- ✅ Multiple route testing support
- ✅ WCAG 2.0, 2.1, and 2.2 Level A and AA compliance testing
- ✅ Axe-core violation detection with detailed reporting
- ✅ Lighthouse accessibility scoring
- ✅ Visual screenshots with highlighted violations
- ✅ Markdown and JSON report generation
- ✅ Configurable via JSON file or environment variables
- ✅ Third-party iframe filtering (ignores known external content)

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/nauris-m/playwright-audit.git
cd playwright-audit
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Edit `a11y-config.json` with your settings:
```json
{
  "loginUrl": "https://your-site.com/web/login",
  "defaultRoutes": [
    "https://your-site.com/page1",
    "https://your-site.com/page2"
  ],
  "credentials": {
    "username": "your-username@example.com",
    "password": "your-password"
  }
}
```

## Configuration

### Configuration File (`a11y-config.json`)

The configuration file supports the following options:

- **`loginUrl`**: The URL of the login page (required)
- **`defaultRoutes`**: Array of URLs to test
- **`credentials`**: Login credentials
  - `username`: Login username/email
  - `password`: Login password

### Environment Variables

You can override configuration using environment variables:

- **`A11Y_ROUTES`**: Comma-separated list of URLs to test
  ```bash
  A11Y_ROUTES=https://site.com/page1,https://site.com/page2 npm test
  ```

- **`A11Y_USERNAME`**: Override username from config
  ```bash
  A11Y_USERNAME=user@example.com npm test
  ```

- **`A11Y_PASSWORD`**: Override password from config
  ```bash
  A11Y_PASSWORD=secret npm test
  ```

- **`A11Y_LOGIN_URL`**: Override login URL from config
  ```bash
  A11Y_LOGIN_URL=https://your-site.com/login npm test
  ```

- **`A11Y_TAGS`**: Comma-separated list of accessibility tags to check
  ```bash
  A11Y_TAGS=wcag2a,wcag2aa npm test
  ```

  Available tags: `wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21a`, `wcag21aa`, `wcag21aaa`, `wcag22a`, `wcag22aa`, `wcag22aaa`, `best-practice`

- **`A11Y_IGNORE_TARGETS`**: Comma-separated list of target selectors to ignore
  ```bash
  A11Y_IGNORE_TARGETS=#FRAME_FRAMECOMMS,#other-iframe npm test
  ```

## Usage

### Run All Tests

```bash
npm test
```

or

```bash
npx playwright test a11y-audit.spec.ts
```

### Run with Custom Workers

```bash
npx playwright test a11y-audit.spec.ts --workers=1
```

### Run with Environment Variables

```bash
A11Y_ROUTES=https://example.com/page1 npm test
```

## What the Test Does

1. **Authentication**: 
   - Navigates to the login page
   - Handles cookie consent banners (if present)
   - Logs in using credentials from config or environment variables

2. **Route Testing**:
   - For each configured route:
     - Navigates to the URL
     - Waits for page load completion

3. **Axe-core Audit**:
   - Runs accessibility scan using WCAG 2.0-2.2 Level A/AA standards
   - Filters out violations from ignored targets (e.g., third-party iframes)
   - Highlights problematic elements on the page with visual indicators

4. **Lighthouse Audit**:
   - Runs Lighthouse accessibility audit via Chrome DevTools Protocol
   - Generates accessibility score (0-100)
   - Creates detailed HTML and JSON reports

5. **Report Generation**:
   - Creates a timestamped folder for each route
   - Generates markdown report with all violations and details
   - Generates JSON report for programmatic analysis
   - Takes full-page screenshot with highlighted violations
   - Generates Lighthouse markdown and HTML reports

## Output Structure

Each test run creates folders in `test-results/` with the following structure:

```
test-results/
└── a11y-{route-slug}-{timestamp}/
    ├── screenshot.png              # Full page screenshot with highlights
    ├── report.md                   # Axe audit report (markdown)
    ├── report.json                 # Axe audit data (JSON)
    ├── lighthouse-report.md        # Lighthouse report (markdown)
    ├── lighthouse-report.html      # Lighthouse report (interactive HTML)
    └── lighthouse-report.json      # Lighthouse report data (JSON)
```

### Report Contents

- **Violation Details**: Each violation includes:
  - Impact level (critical, serious, moderate, minor)
  - Description and help URL
  - First failing selector
  - Role and name/label from HTML
  - All failing nodes with HTML and selectors

- **Lighthouse Score**: Overall accessibility score (0-100)
- **Failed/Warning/Passed Audits**: Categorized audit results

## Example Output

```
--- Accessibility Audit Results for https://example.com/page ---
❌ Found 2 violations:

1. **Violation: button-name** (critical)
   Description: Ensure buttons have discernible text
   First selector: button.toggle-btn
   Role (from HTML): n/a
   Name/label (from HTML): n/a
   Failing Nodes: 15 elements

2. **Violation: nested-interactive** (serious)
   Description: Ensure interactive controls are not nested
   First selector: div.invoice-header[role="button"]
   Role (from HTML): button
   Name/label (from HTML): Open invoice details
   Failing Nodes: 15 elements

📸 Screenshot saved: test-results/...
📄 Report saved: test-results/...
💡 Lighthouse Accessibility Score: 94/100
```

## Continuous Integration

This test suite can be integrated into CI/CD pipelines. Example GitHub Actions workflow:

```yaml
name: Accessibility Audit

on: [push, pull_request]

jobs:
  a11y-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx playwright install --with-deps chromium
      - run: npm test
        env:
          A11Y_USERNAME: ${{ secrets.A11Y_USERNAME }}
          A11Y_PASSWORD: ${{ secrets.A11Y_PASSWORD }}
          A11Y_ROUTES: ${{ secrets.A11Y_ROUTES }}
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: a11y-reports
          path: test-results/
```

## Troubleshooting

### Lighthouse Audit Fails

If you see "Lighthouse audit failed" errors, ensure:
- Playwright is configured with CDP (Chrome DevTools Protocol) enabled
- Port 9222 is available (configured in `playwright.config.ts`)
- The browser launches successfully

### Login Fails

- Verify credentials in `a11y-config.json` or environment variables
- Check if the login page structure has changed
- Ensure cookie consent banner handling works correctly

### No Violations Found

- Check that the `A11Y_TAGS` environment variable includes the rules you want to test
- Verify that violations aren't being filtered out by `A11Y_IGNORE_TARGETS`

## License

This project is open source and available for use.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
