// a11y-audit.spec.ts

import test from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { playAudit } from 'playwright-lighthouse';
import * as fs from 'fs';
import * as path from 'path';

test('Accessibility Audit for WCAG 2.0 to 2.2', async ({ page, browser }) => {
    // 1. Load configuration from file
    const configPath = path.join(process.cwd(), 'a11y-config.json');
    let config: any = {};
    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
    } catch (e) {
        console.log(`⚠️  Could not load config file ${configPath}`);
    }
    
    // Load credentials (override via env A11Y_USERNAME and A11Y_PASSWORD)
    const username = process.env.A11Y_USERNAME || config.credentials?.username || '';
    const password = process.env.A11Y_PASSWORD || config.credentials?.password || '';
    
    if (!username || !password) {
        throw new Error('Username and password must be provided via config file or environment variables (A11Y_USERNAME, A11Y_PASSWORD)');
    }

    // Load login URL (override via env A11Y_LOGIN_URL)
    const loginUrl = process.env.A11Y_LOGIN_URL || config.loginUrl || '';
    
    if (!loginUrl) {
        throw new Error('Login URL must be provided via config file (loginUrl) or environment variable (A11Y_LOGIN_URL)');
    }

    // 2. Navigate to the login page
    await page.goto(loginUrl);

    // 3. Handle cookie consent banner if present
    await page.waitForLoadState('networkidle');
    try {
        // Try to accept cookies if the banner is visible
        const acceptCookiesButton = page.getByRole('button', { name: /accept all cookies/i });
        if (await acceptCookiesButton.isVisible({ timeout: 2000 })) {
            await acceptCookiesButton.click();
            await page.waitForTimeout(500); // Wait for banner to disappear
        }
    } catch (e) {
        // Cookie banner might not be present, continue
    }
    
    // 4. Perform login with a small retry to avoid flakiness
    const doLogin = async () => {
        await page.getByRole('textbox', { name: /username/i }).fill(username);
        await page.getByRole('textbox', { name: /password/i }).fill(password);
        await page.getByRole('button', { name: /log in/i }).click();
    };

    await doLogin();
    await page.waitForLoadState('networkidle');
    // If still on login after a brief wait, retry once
    if (page.url().includes('/login')) {
        await page.waitForTimeout(1000);
        if (page.url().includes('/login')) {
            await doLogin();
            await page.waitForLoadState('networkidle');
        }
    }

    // 5. Load routes (override via env A11Y_ROUTES=comma,separated,urls)
    const defaultRoutes = config.defaultRoutes || [];
    const routes =
        process.env.A11Y_ROUTES?.split(',').map(r => r.trim()).filter(Boolean) ??
        defaultRoutes;

    // Tags to include (override via env A11Y_TAGS=tag1,tag2)
    const defaultTags = [
        'wcag2a', 
        'wcag2aa', 
        //'wcag2aaa',
        'wcag21a', 
        'wcag21aa', 
        //'wcag21aaa',
        'wcag22a', 
        'wcag22aa', 
        //'wcag22aaa',
        //'best-practice',
    ];
    const auditTags =
        process.env.A11Y_TAGS?.split(',').map(t => t.trim()).filter(Boolean) ??
        defaultTags;

    // Ignore nodes whose targets contain any of these substrings (env A11Y_IGNORE_TARGETS=foo,bar)
    const ignoredTargetSubstrings =
        process.env.A11Y_IGNORE_TARGETS?.split(',').map(t => t.trim()).filter(Boolean) ??
        ['#FRAME_FRAMECOMMS'];

    const slugFromUrl = (url: string) =>
        url.replace(/https?:\/\//, '')
           .replace(/[^\w.-]+/g, '-')
           .replace(/-+/g, '-')
           .replace(/^-|-$/g, '');

    const runStartedAt = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(auditTags)
            .analyze();

        // Filter out nodes matching ignored targets
        const filteredViolations = accessibilityScanResults.violations
            .map(v => ({
                ...v,
                nodes: v.nodes.filter(n =>
                    !n.target.some(t => ignoredTargetSubstrings.some(ignore => t.includes(ignore)))
                ),
            }))
            .filter(v => v.nodes.length > 0);

        const routeSlug = slugFromUrl(route);
        const runFolder = path.join('test-results', `a11y-${routeSlug}-${runStartedAt}`);
        if (!fs.existsSync(runFolder)) {
            fs.mkdirSync(runFolder, { recursive: true });
        }

        // Run Lighthouse accessibility audit
        let lighthouseScore: number | null = null;
        try {
            // playwright-lighthouse requires a CDP port
            // We'll use a default port - the library will attempt to connect
            // Note: For this to work, Playwright needs CDP enabled (configured in playwright.config.ts)
            await playAudit({
                port: 9222, // Default CDP port
                page: page,
                thresholds: {
                    accessibility: 0, // Don't fail on score, just collect data
                },
                reports: {
                    formats: {
                        html: true,
                        json: true,
                    },
                    name: 'lighthouse-report',
                    directory: runFolder,
                },
            } as any);
            console.log(`\n🔍 Lighthouse audit completed`);
            
            // Try to read the lighthouse report JSON if available
            const lighthouseJsonPath = path.join(runFolder, 'lighthouse-report.json');
            if (fs.existsSync(lighthouseJsonPath)) {
                const lighthouseReport = JSON.parse(fs.readFileSync(lighthouseJsonPath, 'utf-8'));
                lighthouseScore = Math.round((lighthouseReport.categories?.accessibility?.score || 0) * 100);
                
                // Generate Lighthouse markdown report
                const lighthouseMarkdownPath = path.join(runFolder, 'lighthouse-report.md');
                let lighthouseMd = `# Lighthouse Accessibility Report\n\n`;
                lighthouseMd += `**URL:** ${route}\n\n`;
                lighthouseMd += `**Test Date:** ${new Date().toISOString()}\n\n`;
                lighthouseMd += `**Accessibility Score:** ${lighthouseScore}/100\n\n`;
                lighthouseMd += `**Full Report:** [lighthouse-report.html](./lighthouse-report.html)\n\n`;
                lighthouseMd += `---\n\n`;
                
                // Add audit details
                const audits = lighthouseReport.audits;
                if (audits) {
                    lighthouseMd += `## Accessibility Audits\n\n`;
                    
                    // Group audits by score
                    const passed: any[] = [];
                    const warnings: any[] = [];
                    const failed: any[] = [];
                    
                    Object.entries(audits).forEach(([id, audit]: [string, any]) => {
                        if (audit.score === null || audit.score === undefined) return;
                        
                        const auditEntry = {
                            id,
                            title: audit.title,
                            description: audit.description,
                            score: audit.score,
                            scoreDisplayMode: audit.scoreDisplayMode,
                            details: audit.details,
                        };
                        
                        if (audit.score === 1) {
                            passed.push(auditEntry);
                        } else if (audit.score >= 0.5) {
                            warnings.push(auditEntry);
                        } else {
                            failed.push(auditEntry);
                        }
                    });
                    
                    if (failed.length > 0) {
                        lighthouseMd += `### ❌ Failed Audits (${failed.length})\n\n`;
                        failed.forEach(audit => {
                            lighthouseMd += `#### ${audit.title}\n\n`;
                            lighthouseMd += `**ID:** ${audit.id}\n\n`;
                            lighthouseMd += `**Description:** ${audit.description}\n\n`;
                            lighthouseMd += `**Score:** ${Math.round(audit.score * 100)}/100\n\n`;
                            if (audit.details?.items && audit.details.items.length > 0) {
                                lighthouseMd += `**Issues Found:** ${audit.details.items.length}\n\n`;
                            }
                            lighthouseMd += `---\n\n`;
                        });
                    }
                    
                    if (warnings.length > 0) {
                        lighthouseMd += `### ⚠️ Warnings (${warnings.length})\n\n`;
                        warnings.forEach(audit => {
                            lighthouseMd += `#### ${audit.title}\n\n`;
                            lighthouseMd += `**ID:** ${audit.id}\n\n`;
                            lighthouseMd += `**Description:** ${audit.description}\n\n`;
                            lighthouseMd += `**Score:** ${Math.round(audit.score * 100)}/100\n\n`;
                            lighthouseMd += `---\n\n`;
                        });
                    }
                    
                    if (passed.length > 0) {
                        lighthouseMd += `### ✅ Passed Audits (${passed.length})\n\n`;
                        lighthouseMd += `All other accessibility checks passed.\n\n`;
                    }
                }
                
                fs.writeFileSync(lighthouseMarkdownPath, lighthouseMd, 'utf-8');
                console.log(`📄 Lighthouse markdown report saved: ${lighthouseMarkdownPath}`);
            }
        } catch (e: any) {
            console.log(`⚠️  Lighthouse audit failed: ${e.message || e}`);
        }

        console.log(`\n--- Accessibility Audit Results for ${route} ---`);

        let markdownContent = `# Accessibility Audit Report\n\n`;
        markdownContent += `**URL:** ${route}\n\n`;
        markdownContent += `**Test Date:** ${new Date().toISOString()}\n\n`;
        if (lighthouseScore !== null) {
            markdownContent += `**Lighthouse Accessibility Score:** ${lighthouseScore}/100\n\n`;
            markdownContent += `**Lighthouse Reports:**\n- [Markdown Report](./lighthouse-report.md)\n- [HTML Report](./lighthouse-report.html)\n\n`;
        }
        markdownContent += `---\n\n`;

        const impactCounts: Record<string, number> = {};
        filteredViolations.forEach(v => {
            const impact = v.impact ?? 'unknown';
            impactCounts[impact] = (impactCounts[impact] || 0) + 1;
        });

        // Always take a screenshot
        const screenshotPath = path.join(runFolder, 'screenshot.png');
        
        if (filteredViolations.length === 0) {
            console.log('🎉 No accessibility violations found for the configured standards (WCAG 2.1 AA).');
            markdownContent += `## ✅ No Violations Found\n\n`;
            markdownContent += `No accessibility violations were found for the configured standards (WCAG 2.1 AA).\n`;
        } else {
            console.log(`❌ Found ${filteredViolations.length} violations:`);
            markdownContent += `## ❌ Violations Found: ${filteredViolations.length}\n\n`;
            markdownContent += `**Impact counts:** ${JSON.stringify(impactCounts)}\n\n`;

            // Highlight problematic elements on the page
            // @ts-ignore - Complex type inference in browser context
            await page.evaluate((violations: any) => {
                const style = document.createElement('style');
                style.id = 'a11y-highlight-style';
                style.textContent = `
                    .a11y-violation-highlight {
                        outline: 1px solid #ff0000 !important;
                        outline-offset: 2px !important;
                        background-color: rgba(255, 0, 0, 0.1) !important;
                        position: relative !important;
                    }
                    .a11y-violation-label {
                        position: absolute;
                        background-color: #ff0000;
                        color: white;
                        padding: 2px 6px;
                        font-size: 11px;
                        font-weight: bold;
                        z-index: 10000;
                        pointer-events: none;
                        border-radius: 2px;
                    }
                `;
                document.head.appendChild(style);

                violations.forEach((violation: any, violationIndex: number) => {
                    violation.nodes.forEach((node: any) => {
                        try {
                            const selectors = node.target;
                            if (selectors && selectors.length > 0) {
                                let element = null;
                                for (const selector of selectors) {
                                    try {
                                        element = document.querySelector(selector);
                                        if (element) break;
                                    } catch (e) {
                                        // Invalid selector, try next
                                    }
                                }
                                
                                if (element) {
                                    element.classList.add('a11y-violation-highlight');
                                    const label = document.createElement('div');
                                    label.className = 'a11y-violation-label';
                                    label.textContent = `${violationIndex + 1}. ${violation.id}`;
                                    label.style.top = '0px';
                                    label.style.left = '0px';
                                    element.style.position = 'relative';
                                    element.appendChild(label);
                                }
                            }
                        } catch (e) {
                            // Skip if element can't be found or highlighted
                        }
                    });
                });
            }, filteredViolations);

            await page.waitForTimeout(500);
            markdownContent += `**Highlight legend:**\n- Red outline + light red overlay: elements flagged for this rule\n- Red label: violation index and rule id\n\n`;

            filteredViolations.forEach((violation, index) => {
                const impactEmoji = violation.impact === 'critical' ? '🔴' : 
                                   violation.impact === 'serious' ? '🟠' : 
                                   violation.impact === 'moderate' ? '🟡' : '⚪';
                const firstNode = violation.nodes[0];
                const firstSelector = firstNode?.target?.[0] ?? 'n/a';
                const roleMatch = /role="([^"]+)"/i.exec(firstNode?.html ?? '');
                const labelMatch = /aria-label="([^"]+)"/i.exec(firstNode?.html ?? '') || /title="([^"]+)"/i.exec(firstNode?.html ?? '');
                const firstRole = roleMatch?.[1] ?? 'n/a';
                const firstName = labelMatch?.[1] ?? 'n/a';
                
                markdownContent += `### ${index + 1}. ${impactEmoji} ${violation.id} (${violation.impact})\n\n`;
                markdownContent += `**Description:** ${violation.description}\n\n`;
                markdownContent += `**Help URL:** [${violation.helpUrl}](${violation.helpUrl})\n\n`;
                markdownContent += `**Failing Nodes:** ${violation.nodes.length}\n\n`;
                markdownContent += `**First selector:** \`${firstSelector}\`\n\n`;
                markdownContent += `**Role (from HTML):** ${firstRole}\n\n`;
                markdownContent += `**Name/label (from HTML):** ${firstName}\n\n`;
                
                console.log(`\n${index + 1}. **Violation: ${violation.id}** (${violation.impact})`);
                console.log(`   Description: ${violation.description}`);
                console.log(`   Help URL: ${violation.helpUrl}`);
                console.log(`   First selector: ${firstSelector}`);
                console.log(`   Role (from HTML): ${firstRole}`);
                console.log(`   Name/label (from HTML): ${firstName}`);
                console.log('   Failing Nodes:');

                violation.nodes.forEach((node, nodeIndex) => {
                    const nodeNum = nodeIndex + 1;
                    markdownContent += `#### Node ${nodeNum}\n\n`;
                    markdownContent += `**HTML:**\n\`\`\`html\n${node.html}\n\`\`\`\n\n`;
                    markdownContent += `**Target Selector:** \`${node.target.join(' ')}\`\n\n`;
                    
                    if (nodeIndex < 3) { // Show first 3 in console
                        console.log(`    - HTML: ${node.html}`);
                        console.log(`    - Target Selector: ${node.target.join(' ')}`);
                    }
                });
                
                if (violation.nodes.length > 3) {
                    console.log(`    ... and ${violation.nodes.length - 3} more elements.`);
                }
                
                markdownContent += `---\n\n`;
            });
        }

        // Take screenshot after all processing
        await page.screenshot({ 
            path: screenshotPath, 
            fullPage: true 
        });
        console.log(`\n📸 Screenshot saved: ${screenshotPath}`);
        markdownContent += `**Screenshot:** [screenshot.png](./screenshot.png)\n\n`;

        const reportPath = path.join(runFolder, 'report.md');
        fs.writeFileSync(reportPath, markdownContent, 'utf-8');
        const jsonReportPath = path.join(runFolder, 'report.json');
        fs.writeFileSync(jsonReportPath, JSON.stringify({
            url: route,
            testDate: new Date().toISOString(),
            impactCounts,
            violations: filteredViolations,
        }, null, 2), 'utf-8');
        console.log(`\n📄 Report saved: ${reportPath}`);
        console.log(`📄 JSON report saved: ${jsonReportPath}`);
        console.log(`📁 Run folder: ${runFolder}`);
    }

    // Optional: Fail the Playwright test if any critical/serious issues are found
    // expect(accessibilityScanResults.violations).toHaveLength(0);
});