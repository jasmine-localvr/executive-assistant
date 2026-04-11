import type { Browser, Page, BrowserContext } from 'playwright';

// Lazy-load Playwright so the module doesn't crash at import time in environments
// where Playwright isn't available (e.g. Vercel serverless functions that don't
// use browser tools). Only loads when a browser session is actually created.
function getChromium() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require(/* webpackIgnore: true */ 'playwright') as typeof import('playwright');
  return chromium;
}

// ─── Types ───

export interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  text: string;
  placeholder?: string;
  name?: string;
  href?: string;
  value?: string;
  ariaLabel?: string;
  options?: { value: string; text: string }[];
}

export interface PageSnapshot {
  url: string;
  title: string;
  screenshot: string; // base64 PNG
  elements: InteractiveElement[];
}

// ─── Session Management ───

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastActivity: number;
}

const sessions = new Map<string, BrowserSession>();

// Clean up stale sessions after 5 minutes of inactivity
const SESSION_TTL_MS = 5 * 60 * 1000;

function cleanupStale() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      session.browser.close().catch(() => {});
      sessions.delete(id);
    }
  }
}

/**
 * Get or create a headless browser session for a team member.
 * Sessions persist across tool calls within the same conversation turn.
 */
export async function getOrCreateSession(sessionId: string): Promise<Page> {
  cleanupStale();

  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing.page;
  }

  let browser: Browser;

  const wsEndpoint = (process.env.BROWSER_WS_ENDPOINT || '').trim();
  if (wsEndpoint && wsEndpoint.startsWith('ws')) {
    // Production: connect to a remote browser service (Browserbase, Browserless, etc.)
    console.log('[browser] Connecting to remote:', wsEndpoint.slice(0, 50));
    browser = await getChromium().connect(wsEndpoint);
  } else {
    // Development: launch local Chromium
    console.log('[browser] Launching local Chromium...');
    browser = await getChromium().launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 10000,
    });
  }
  console.log('[browser] Browser ready');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  // Dismiss dialogs automatically (alert, confirm, prompt)
  const page = await context.newPage();
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });

  sessions.set(sessionId, { browser, context, page, lastActivity: Date.now() });
  return page;
}

/**
 * Close and clean up a browser session.
 */
export async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    await session.browser.close().catch(() => {});
    sessions.delete(sessionId);
  }
}

// ─── Page Interaction Helpers ───

/**
 * Take a viewport screenshot and return as base64 JPEG (smaller payload for Claude).
 */
export async function takeScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
  return buffer.toString('base64');
}

/**
 * Extract all visible interactive elements from the page.
 * Returns a numbered list the agent can reference by index.
 */
export async function extractInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    const selectors =
      'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [type="submit"]';
    const found = document.querySelectorAll(selectors);
    const elements: {
      index: number;
      tag: string;
      type?: string;
      text: string;
      placeholder?: string;
      name?: string;
      href?: string;
      value?: string;
      ariaLabel?: string;
      options?: { value: string; text: string }[];
    }[] = [];

    let index = 0;
    found.forEach((el) => {
      // Skip invisible elements
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        return;

      const tag = el.tagName.toLowerCase();
      const entry: (typeof elements)[number] = {
        index,
        tag,
        text: (el.textContent || '').trim().slice(0, 100),
      };

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        entry.type = (el as HTMLInputElement).type || 'text';
        if (el.placeholder) entry.placeholder = el.placeholder;
        if (el.name) entry.name = el.name;
        if (el.value) entry.value = el.value.slice(0, 50);
      }

      if (el instanceof HTMLSelectElement) {
        if (el.name) entry.name = el.name;
        if (el.value) entry.value = el.value;
        entry.options = Array.from(el.options).map((o) => ({
          value: o.value,
          text: o.text.trim(),
        }));
      }

      if (el instanceof HTMLAnchorElement && el.href) {
        entry.href = el.href;
      }

      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) entry.ariaLabel = ariaLabel;

      elements.push(entry);
      index++;
    });

    return elements;
  });
}

/**
 * Take a full page snapshot: screenshot + interactive elements + metadata.
 */
export async function getPageSnapshot(page: Page): Promise<PageSnapshot> {
  const [screenshot, elements] = await Promise.all([
    takeScreenshot(page),
    extractInteractiveElements(page),
  ]);

  return {
    url: page.url(),
    title: await page.title(),
    screenshot,
    elements,
  };
}

/**
 * Click the interactive element at the given index.
 * Re-queries visible elements to match the current page state.
 */
export async function clickElement(page: Page, index: number): Promise<void> {
  await page.evaluate((idx) => {
    const selectors =
      'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [type="submit"]';
    const found = document.querySelectorAll(selectors);
    const visible: Element[] = [];

    found.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        return;
      visible.push(el);
    });

    if (idx >= 0 && idx < visible.length) {
      (visible[idx] as HTMLElement).scrollIntoView({ block: 'center' });
      (visible[idx] as HTMLElement).click();
    } else {
      throw new Error(`Element index ${idx} out of range (${visible.length} elements on page)`);
    }
  }, index);

  // Wait for any navigation or dynamic content triggered by the click
  await page.waitForTimeout(1500);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

/**
 * Focus an input element by index, clear it, and type new text.
 */
export async function typeInElement(
  page: Page,
  index: number,
  text: string,
  clearFirst = true
): Promise<void> {
  // Focus the element
  await page.evaluate(
    ({ idx, clear }) => {
      const selectors =
        'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [type="submit"]';
      const found = document.querySelectorAll(selectors);
      const visible: Element[] = [];

      found.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          return;
        visible.push(el);
      });

      if (idx >= 0 && idx < visible.length) {
        const el = visible[idx] as HTMLInputElement;
        el.scrollIntoView({ block: 'center' });
        el.focus();
        if (clear && 'value' in el) {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        throw new Error(`Element index ${idx} out of range (${visible.length} elements on page)`);
      }
    },
    { idx: index, clear: clearFirst }
  );

  // Type using keyboard events for proper form handling
  await page.keyboard.type(text, { delay: 30 });
}

/**
 * Select an option from a <select> element by value.
 */
export async function selectOption(page: Page, index: number, value: string): Promise<void> {
  await page.evaluate(
    ({ idx, val }) => {
      const selectors =
        'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [type="submit"]';
      const found = document.querySelectorAll(selectors);
      const visible: Element[] = [];

      found.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          return;
        visible.push(el);
      });

      if (idx >= 0 && idx < visible.length) {
        const el = visible[idx] as HTMLSelectElement;
        if (el.tagName.toLowerCase() !== 'select') {
          throw new Error(`Element ${idx} is a <${el.tagName.toLowerCase()}>, not a <select>`);
        }
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error(`Element index ${idx} out of range (${visible.length} elements on page)`);
      }
    },
    { idx: index, val: value }
  );
}
