import { test, expect } from '@playwright/test';

test('Notation font applied to Number system pitches', async ({ page }) => {
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    
    // Type number system pitches (default system)
    await page.click('[data-testid="editor-root"]');
    await page.keyboard.type('1 2 3');
    
    // Get the first pitch cell
    const firstCell = await page.locator('[data-testid="editor-root"] .char-cell').first();
    
    // Check that the font-family includes NotationMonoDotted
    const fontFamily = await firstCell.evaluate(el => window.getComputedStyle(el).fontFamily);
    console.log('Number system font family:', fontFamily);
    
    expect(fontFamily.toLowerCase()).toContain('notationmono');
    console.log('✓ NotationMonoDotted applied to Number system pitches');
});

test('Notation font applied to Western system pitches', async ({ page }) => {
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    
    // Click on pitch system dropdown and select Western
    const pitchSystemBtn = page.locator('button', { has: page.locator('text=Number') }).first();
    await pitchSystemBtn.click();
    
    // Click Western option
    await page.locator('text=Western').click();
    
    // Type Western system pitches
    await page.click('[data-testid="editor-root"]');
    await page.keyboard.type('C D E');
    
    // Get the first pitch cell
    const firstCell = await page.locator('[data-testid="editor-root"] .char-cell').first();
    
    // Check that the font-family includes NotationMonoDotted
    const fontFamily = await firstCell.evaluate(el => window.getComputedStyle(el).fontFamily);
    console.log('Western system font family:', fontFamily);
    
    expect(fontFamily.toLowerCase()).toContain('notationmono');
    console.log('✓ NotationMonoDotted applied to Western system pitches');
});

test('Notation font applied to dashes (unpitched elements)', async ({ page }) => {
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    
    // Type pitch with dashes
    await page.click('[data-testid="editor-root"]');
    await page.keyboard.type('1---2--3');
    
    // Find a dash cell
    const cells = await page.locator('[data-testid="editor-root"] .char-cell').all();
    
    // Find first dash
    let dashCell = null;
    for (const cell of cells) {
        const text = await cell.textContent();
        if (text === '-') {
            dashCell = cell;
            break;
        }
    }
    
    // Check that the dash uses NotationMonoDotted
    if (dashCell) {
        const fontFamily = await dashCell.evaluate(el => window.getComputedStyle(el).fontFamily);
        console.log('Dash cell font family:', fontFamily);
        
        expect(fontFamily.toLowerCase()).toContain('notationmono');
        console.log('✓ NotationMonoDotted applied to dashes');
    }
});
