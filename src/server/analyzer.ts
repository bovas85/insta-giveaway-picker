import puppeteer, { Page } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

interface Config {
  postUrl: string;
  competitors: string[];
}

const DELAY = {
  short: 500,
  medium: 1500,
  long: 3000,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getCommentersAPI(
  postUrl: string,
  accessToken: string,
  onLog: (m: string) => void,
): Promise<Set<string> | null> {
  try {
    onLog('📡 Fetching comments via Graph API...');

    // 1. Get IG Business Account ID
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`,
    );
    const pages = accountsRes.data.data || [];
    const page = pages.find((p: any) => p.instagram_business_account);

    let igId = page?.instagram_business_account?.id;

    // --- Fallback for "Hidden" Pages ---

    if (!igId) {
      const manualId = process.env.MANUAL_PAGE_ID;
      if (manualId) {
        onLog('⚠️ Auto-discovery found 0 pages. Trying manual Page ID lookup from .env...');
        try {
          const manualRes = await axios.get(
            `https://graph.facebook.com/v18.0/${manualId}?fields=instagram_business_account,name&access_token=${accessToken}`,
          );
          if (manualRes.data.instagram_business_account) {
            igId = manualRes.data.instagram_business_account.id;
            onLog(`✅ Manual Match Found: ${manualRes.data.name}`);
          }
        } catch (e) {
          onLog('❌ Manual lookup failed.');
        }
      }
    }
    // -----------------------------------------------

    if (!igId) {
      onLog('❌ Error: No Instagram Business Account linked to your Facebook Pages.');
      return null;
    }

    // 2. Get Media ID from Shortcode
    const shortcodeMatch = postUrl.match(/\/(p|reels|reel)\/([A-Za-z0-9_-]+)/);
    if (!shortcodeMatch) {
      onLog('❌ Error: Could not extract shortcode from URL.');
      return null;
    }
    const shortcode = shortcodeMatch[2];

    // Search recent media for this shortcode
    const mediaRes = await axios.get(
      `https://graph.facebook.com/v18.0/${igId}/media?fields=shortcode&limit=50&access_token=${accessToken}`,
    );
    const media = mediaRes.data.data.find((m: any) => m.shortcode === shortcode);

    if (!media) {
      onLog('⚠️ Post not found in your recent media. (API only works for YOUR own posts)');
      return null;
    }

    const mediaId = media.id;
    const commenters = new Set<string>();
    let nextUrl = `https://graph.facebook.com/v18.0/${mediaId}/comments?fields=username,text&limit=50&access_token=${accessToken}`;

    while (nextUrl) {
      const commentRes = await axios.get(nextUrl);
      const data = commentRes.data;

      for (const comment of data.data) {
        const text = comment.text;
        const author = comment.username;

        // Logic: Must mention 2 friends
        const mentions = text.match(/@[a-zA-Z0-9_.]+/g) || [];
        const uniqueMentions = new Set(
          mentions.map((m: string) => m.replace('@', '').toLowerCase()),
        );
        uniqueMentions.delete(author.toLowerCase());

        if (uniqueMentions.size >= 2) {
          commenters.add(author);
        }
      }
      nextUrl = data.paging?.next || null;
      if (nextUrl) onLog(`   Fetched ${commenters.size} potential winners so far...`);
    }

    return commenters;
  } catch (e: any) {
    onLog(`❌ API Error: ${e.response?.data?.error?.message || e.message}`);
    return null;
  }
}

export async function openLoginBrowser(onLog: (m: string) => void) {
  // ... existing code ...
  onLog('🌐 Opening browser for manual login...');
  const userDataDir = path.resolve(process.cwd(), 'instagram-session');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // Always visible for manual login
      defaultViewport: null,
      userDataDir: userDataDir,
      args: [
        '--start-maximized',
        '--disable-notifications',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
  } catch (e: any) {
    onLog(`❌ Failed to launch browser: ${e.message}`);
    onLog('💡 Tip: Make sure no other Instagram Analyzer windows are open.');
    return;
  }

  const page = await browser.newPage();

  try {
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'networkidle2',
    });
  } catch (e) {
    // If user closes browser while loading, ignore the error
    if (!browser.isConnected()) return;
  }

  onLog('ℹ️ Please log in manually. Close the browser window when finished.');

  // Wait for browser to be closed by user
  return new Promise<void>((resolve) => {
    browser.on('disconnected', () => {
      onLog('✅ Login browser closed.');
      resolve();
    });
  });
}

export async function startAnalysis(
  config: Config,
  onLog: (msg: string) => void,
  onResult: (result: any) => void,
) {
  const startTime = Date.now();
  onLog('🚀 Starting Instagram Analyzer...');

  const userDataDir = path.join(process.cwd(), 'instagram-session');
  const isFirstRun = !fs.existsSync(userDataDir);

  // --- Session Cloning Logic ---
  // Create a unique temp folder for this specific run
  const tempSessionId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const tempDir = path.join(process.cwd(), 'temp_sessions', tempSessionId);

  // Ensure temp_sessions root exists
  const tempRoot = path.join(process.cwd(), 'temp_sessions');
  if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot);

  if (!isFirstRun) {
    onLog('🔄 Cloning session for isolated run...');
    try {
      // Node 16.7+ supports recursive copy
      fs.cpSync(userDataDir, tempDir, { recursive: true });
    } catch (e) {
      onLog('⚠️ Session clone failed (using fresh session): ' + e);
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } else {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  // -----------------------------

  try {
    // Wrap everything in try/finally to ensure cleanup

    if (isFirstRun) {
      onLog('⚠️ First run detected (or session cleared).');
      onLog('ℹ️ Please LOG IN MANUALLY in the browser window that opens.');
    } else {
      onLog('✅ Session restored.');
    }

    // --- Step 1: Get Commenters (Try API first) ---
    let commenters: Set<string> | null = null;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (accessToken) {
      commenters = await getCommentersAPI(config.postUrl, accessToken, onLog);
    }

    if (commenters) {
      onLog(`✅ Graph API found ${commenters.size} valid commenters.`);
    } else {
      onLog('🌐 Using browser scraping for comments...');
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: process.env.HEADLESS === 'true',
          defaultViewport: null,
          userDataDir: tempDir, // Use CLONE
          args: [
            '--start-maximized',
            '--disable-notifications',
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
        });
      } catch (e: any) {
        onLog(`❌ Failed to launch browser: ${e.message}`);
        onResult({ error: e.message });
        return;
      }

      const page = await browser.newPage();

      // ... Setup page and scrape ...
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      try {
        onLog('🔐 Checking login status...');
        await ensureLoggedIn(page, onLog);

        onLog(`🔍 Scraping comments from: ${config.postUrl}`);
        commenters = await scrapeCommenters(page, config.postUrl, config.competitors, onLog);
        await browser.close();
      } catch (e: any) {
        onLog(`❌ Scrape Error: ${e.message}`);
        if (browser) await browser.close();
        return;
      }
    }

    if (!commenters || commenters.size === 0) {
      onLog('❌ No valid commenters found.');
      onResult({ error: 'No valid commenters found.' });
      return;
    }

    // --- Step 2: Analyze Following Status (Must use Browser) ---
    onLog('Opening browser for follower check...');
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: process.env.HEADLESS === 'true',
        defaultViewport: null,
        userDataDir: tempDir, // Use CLONE
        args: [
          '--start-maximized',
          '--disable-notifications',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
    } catch (e: any) {
      onLog(`❌ Failed to launch browser for analysis: ${e.message}`);
      onResult({ error: e.message });
      return;
    }

    const page = await browser.newPage();

    // ... (rest of analysis logic) ...
    try {
      // ... Copy of existing analysis logic ...
      const competitorSet = new Set(config.competitors.map((c) => c.toLowerCase()));
      for (const user of Array.from(commenters)) {
        if (competitorSet.has(user.toLowerCase())) {
          commenters.delete(user);
        }
      }

      onLog(`👥 Found ${commenters.size} unique potential winners.`);
      onLog('------------------------------------------------');

      let count = 0;
      const qualifiedUsers: string[] = [];

      for (const user of commenters) {
        count++;
        onLog(`[${count}/${commenters.size}] Checking @${user}...`);

        const isMatch = await analyzeUser(page, user, config.competitors, onLog);

        if (isMatch) {
          qualifiedUsers.push(user);
          onLog(`✨ QUALIFIED: @${user}`);
        }

        await sleep(DELAY.short);
      }

      onLog('------------------------------------------------');
      onLog(`🏁 ANALYSIS COMPLETE`);
      onLog(`✅ Qualified Users: ${qualifiedUsers.length}`);

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      if (qualifiedUsers.length > 0) {
        const winnerIndex = Math.floor(Math.random() * qualifiedUsers.length);
        const winner = qualifiedUsers[winnerIndex];

        onLog(`🏆 WINNER: @${winner}`);

        onResult({
          winner: winner,
          profile: `https://www.instagram.com/${winner}/`,
          qualified: qualifiedUsers,
          duration: durationSeconds,
        });
      } else {
        onLog('❌ No qualified users found.');
        onResult({ error: 'No qualified users found.', duration: durationSeconds });
      }
    } catch (err: any) {
      onLog(`❌ Error during analysis: ${err.message}`);
      throw err;
    } finally {
      if (browser) await browser.close();
    }
  } catch (err: any) {
    onLog(`❌ Critical Error: ${err.message}`);
    onResult({ error: err.message });
  } finally {
    // --- Cleanup ---
    onLog('🧹 Cleaning up temp session...');
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to delete temp dir:', e);
    }
  }
}

async function ensureLoggedIn(page: Page, onLog: (m: string) => void): Promise<void> {
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
  const loginInput = await page.$('input[name="username"]');

  if (loginInput) {
    onLog('⚠️ Login required. Waiting for you to log in...');
    await page.waitForSelector(
      'svg[aria-label="Home"], svg[aria-label="Search"], a[href="/explore/"]',
      { timeout: 0 },
    );
    onLog('✅ Login detected!');
    await sleep(DELAY.long);
  }
}

async function scrapeCommenters(
  page: Page,
  postUrl: string,
  competitorsList: string[],
  onLog: (m: string) => void,
): Promise<Set<string>> {
  await page.goto(postUrl, { waitUntil: 'networkidle2' });
  await sleep(DELAY.medium);

  try {
    let loadMoreAttempts = 0;
    const MAX_LOAD_ATTEMPTS = 20;

    while (loadMoreAttempts < MAX_LOAD_ATTEMPTS) {
      const loadMoreBtn = await page.$('svg[aria-label="Load more comments"]');
      if (loadMoreBtn) {
        onLog(`   Loading comments (${loadMoreAttempts + 1}/${MAX_LOAD_ATTEMPTS})...`);
        await page.evaluate((el) => {
          const btn = el.closest('button') || el.parentElement;
          if (btn) (btn as HTMLElement).click();
        }, loadMoreBtn);
        await sleep(DELAY.medium + 1000);
      } else {
        const scrolled = await page.evaluate(() => {
          const xpath1 = '//main/div/div[1]/div/div[2]/div/div[2]';
          const res1 = document.evaluate(xpath1, document, null, 9, null);
          let container = res1.singleNodeValue as HTMLElement;
          if (!container || container.scrollHeight <= container.clientHeight) {
            const res2 = document.evaluate(
              '//main/div/div[1]/div/div[2]/div/div[2]/div',
              document,
              null,
              9,
              null,
            );
            container = res2.singleNodeValue as HTMLElement;
          }
          if (container && container.scrollHeight > container.clientHeight) {
            container.scrollBy(0, 1000);
            container.dispatchEvent(new Event('scroll'));
            return true;
          }
          const startNode =
            document.querySelector('svg[aria-label="Load more comments"]') ||
            document.querySelector('div.html-div span[dir="auto"]');
          if (startNode) {
            let curr = startNode.parentElement;
            while (curr && curr.tagName !== 'BODY') {
              if (
                curr.scrollHeight > curr.clientHeight &&
                curr.querySelectorAll('div.html-div').length > 5
              ) {
                curr.scrollBy(0, 1000);
                curr.dispatchEvent(new Event('scroll'));
                return true;
              }
              curr = curr.parentElement;
            }
          }
          return false;
        });

        if (!scrolled) {
          await sleep(300);
          const btnAfter = await page.$('svg[aria-label="Load more comments"]');
          if (!btnAfter) break;
        } else {
          await sleep(300);
        }
      }
      loadMoreAttempts++;
    }
  } catch (e) {
    // ignore
  }

  const usernames = await page.evaluate((competitorsList) => {
    const validUsers = new Set<string>();
    const competitors = new Set(competitorsList.map((c: string) => c.toLowerCase()));
    const commentSpans = Array.from(document.querySelectorAll('div.html-div span[dir="auto"]'));

    commentSpans.forEach((span: any) => {
      const textContent = span.innerText || '';
      if (!textContent.includes('@') || textContent.length < 5) return;

      let author = '';
      let container = span.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!container || container.tagName === 'UL') break;
        const authorLink = container.querySelector(
          'a[href^="/"]:not([href*="/p/"]):not([href*="/reels/"])',
        );
        if (authorLink) {
          const href = authorLink.getAttribute('href');
          const match = href.match(/^\/([a-zA-Z0-9_.]+)\/?$/);
          if (match) {
            const foundUser = match[1];
            if (
              !['explore', 'reels', 'stories', 'accounts', 'direct', 'create', 'legal'].includes(
                foundUser,
              )
            ) {
              if (!authorLink.innerText.includes('@')) {
                author = foundUser;
                break;
              }
            }
          }
        }
        container = container.parentElement;
      }

      if (!author) return;
      if (competitors.has(author.toLowerCase())) return;

      const mentions = textContent.match(/@[a-zA-Z0-9_.]+/g) || [];
      const uniqueMentions = new Set(mentions.map((m: string) => m.replace('@', '').toLowerCase()));
      competitors.forEach((c) => uniqueMentions.delete(c));
      uniqueMentions.delete(author.toLowerCase());

      if (uniqueMentions.size >= 2) {
        validUsers.add(author);
      }
    });
    return Array.from(validUsers);
  }, competitorsList);

  return new Set(usernames);
}

async function analyzeUser(
  page: Page,
  username: string,
  competitors: string[],
  onLog: (m: string) => void,
): Promise<boolean> {
  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
    });

    const isPrivate = await page.evaluate(() =>
      document.body.innerText.includes('This account is private'),
    );
    if (isPrivate) {
      onLog(`      (Private)`);
      return false;
    }

    // 1. Get User ID from the profile page
    const userId = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      // Look for the profile_id in the window state or JSON blobs
      const match = html.match(/"profile_id":"(\d+)"/) || html.match(/"id":"(\d+)"/);
      return match ? match[1] : null;
    });

    if (!userId) {
      onLog(`      ❌ Could not determine user ID for @${username}`);
      return false;
    }

    // 2. Get the CSRF token from cookies for the API call
    const cookies = await page.cookies();
    const csrfToken = cookies.find((c) => c.name === 'csrftoken')?.value;
    const appId = '936619743392459'; // Standard Instagram Web App ID

    const sanitizedCompetitors = competitors
      .flatMap((c) => c.split(/[\s,]+/))
      .filter((c) => c.length > 0);

    const matches: string[] = [];
    for (const competitor of sanitizedCompetitors) {
      onLog(`      Checking follow for: ${competitor}...`);

      const isFollowing = await page.evaluate(
        async (targetId, comp, csrf, appId) => {
          try {
            // Truncate the query to 12 characters to be more reliable for long usernames
            const queryTerm = comp.length > 12 ? comp.slice(0, 12) : comp;
            const url = `https://www.instagram.com/api/v1/friendships/${targetId}/following/?query=${encodeURIComponent(queryTerm)}`;

            const headers: Record<string, string> = {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': appId,
            };
            if (csrf) headers['X-CSRFToken'] = csrf;

            const response = await fetch(url, { headers });
            const data = await response.json();

            // The API returns a list of users. Check if the exact full competitor is in the results.
            return (
              data.users?.some((u: any) => u.username.toLowerCase() === comp.toLowerCase()) || false
            );
          } catch (e) {
            return false;
          }
        },
        userId,
        competitor,
        csrfToken,
        appId,
      );
      if (isFollowing) {
        matches.push(competitor);
        onLog(`      ✅ Found follow for ${competitor}`);
      } else {
        onLog(`      ❌ No follow found for ${competitor}`);
      }

      // Small delay to avoid rate limiting
      await sleep(1000);
    }

    return matches.length === sanitizedCompetitors.length;
  } catch (e: any) {
    onLog(`      ❌ Error analyzing user: ${e.message}`);
    return false;
  }
}
