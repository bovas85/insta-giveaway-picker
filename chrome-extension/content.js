// content.js
let isScraping = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startScrape" && !isScraping) {
        sendResponse({ ready: true });
        scrapeComments(request.config);
    } else if (request.action === "checkFollows") {
        sendResponse({ ready: true });
        checkUserFollows(request.username, request.competitors);
    }
    return true;
});

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
    console.log(`[GiveawayTool] ${msg}`);
    chrome.runtime.sendMessage({ action: "log", msg });
}

async function scrapeComments(config) {
    isScraping = true;
    log("🔍 Searching for comment container...");
    
    // 1. Load all comments
    let attempts = 0;
    const MAX_ATTEMPTS = 15;
    
    while (attempts < MAX_ATTEMPTS) {
        const loadMoreBtn = document.querySelector('svg[aria-label="Load more comments"]');
        if (loadMoreBtn) {
            log(`   Clicking Load More (${attempts + 1})...`);
            (loadMoreBtn.closest('button') || loadMoreBtn.parentElement).click();
            await sleep(2500);
        } else {
            // Robust scroll using your XPath structure
            const xpath = "//main/div/div[1]/div/div[2]/div/div[2]";
            const res = document.evaluate(xpath, document, null, 9, null);
            const container = res.singleNodeValue;
            if (container && container.scrollHeight > container.clientHeight) {
                container.scrollBy(0, 1000);
                log("   Scrolling for more...");
                await sleep(1500);
            } else {
                break;
            }
        }
        attempts++;
    }

    // 2. Extract users with 2+ tags
    log("📝 Analyzing comments...");
    const commentSpans = Array.from(document.querySelectorAll('div.html-div span[dir="auto"]'));
    const validUsers = new Set();
    const competitors = new Set(config.competitors.map(c => c.toLowerCase().trim()));

    commentSpans.forEach(span => {
        const text = span.innerText || "";
        if (!text.includes("@") || text.length < 5) return;

        let author = "";
        let curr = span.parentElement;
        for (let i = 0; i < 6; i++) {
            if (!curr || curr.tagName === "UL") break;
            const link = curr.querySelector('a[href^="/"]:not([href*="/p/"])');
            if (link && !link.innerText.includes("@")) {
                const href = link.getAttribute("href");
                author = href.replace(/\//g, "");
                break;
            }
            curr = curr.parentElement;
        }

        if (author && !competitors.has(author.toLowerCase())) {
            const mentions = (text.match(/@[a-zA-Z0-9_.]+/g) || []);
            const uniqueMentions = new Set(mentions.map(m => m.replace("@", "").toLowerCase()));
            uniqueMentions.delete(author.toLowerCase());
            competitors.forEach(c => uniqueMentions.delete(c));

            if (uniqueMentions.size >= 2) {
                validUsers.add(author);
            }
        }
    });

    isScraping = false;
    chrome.runtime.sendMessage({ action: "scrapeDone", users: Array.from(validUsers) });
}

async function checkUserFollows(username, competitors) {
    log(`🧐 Checking @${username}'s following list...`);
    
    // 1. Check if Private first
    const isPrivate = document.body.innerText.includes("This account is private");
    if (isPrivate) {
        log(`   🔒 @${username} is PRIVATE. Skipping.`);
        chrome.runtime.sendMessage({ action: "followResult", username, success: false });
        return;
    }

    // 2. Find Following Link (Retry a few times)
    let followingLink = null;
    for (let i = 0; i < 10; i++) {
        // Try exact match first
        followingLink = document.querySelector(`a[href="/${username.toLowerCase()}/following/"]`) || 
                        document.querySelector(`a[href="/${username}/following/"]`) ||
                        document.querySelector('a[href$="/following/"]');
        
        if (followingLink) break;
        await sleep(1000);
    }

    if (!followingLink) {
        log(`   ⚠️ Could not find Following link for @${username} after 10s.`);
        // Debug: Log all links starting with / and ending with /following/
        const allLinks = Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href'));
        console.log("All Links found:", allLinks);
        chrome.runtime.sendMessage({ action: "followResult", username, success: false });
        return;
    }

    followingLink.click();
    await sleep(2500);

    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    const dialog = dialogs.find(d => d.innerText.includes("Following") || d.querySelector('input[placeholder="Search"]'));
    
    if (!dialog) {
        log(`   ❌ Could not open Following modal for @${username}`);
        chrome.runtime.sendMessage({ action: "followResult", username, success: false });
        return;
    }

    const input = dialog.querySelector('input[placeholder="Search"]');
    if (!input) {
        log(`   ❌ Search bar not found in modal.`);
        chrome.runtime.sendMessage({ action: "followResult", username, success: false });
        return;
    }

    const matches = [];
    for (const comp of competitors) {
        // Clear
        input.value = "";
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);

        // Type partial
        const term = comp.length > 5 ? comp.slice(0, -3) : comp;
        log(`      Typing "${term}"...`);
        
        input.focus();
        // Set value directly then trigger input event
        input.value = term;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(2000);

        // Check result
        const resultLink = dialog.querySelector(`a[href="/${comp.toLowerCase()}/"]`);
        if (resultLink) {
            matches.push(comp);
            log(`      ✅ Matches ${comp}`);
        } else {
            log(`      ❌ No match for ${comp}`);
        }
    }

    const success = matches.length === competitors.length;
    chrome.runtime.sendMessage({ action: "followResult", username, success });
}