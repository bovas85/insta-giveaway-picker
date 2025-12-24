// background.js
let state = {
    active: false,
    candidates: [],
    qualified: [],
    winner: null,
    currentIndex: 0,
    competitors: [],
    mainTabId: null, // The tab with the post
    workerTabId: null, // The temporary tab for profiles
    logs: []
};

function addLog(msg) {
    const formattedMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
    state.logs.push(formattedMsg);
    chrome.runtime.sendMessage({ action: "log", msg: formattedMsg }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startAnalysis") {
        state = {
            active: true,
            candidates: [],
            qualified: [],
            winner: null,
            currentIndex: 0,
            competitors: request.competitors,
            mainTabId: request.tabId,
            workerTabId: null,
            logs: []
        };
        addLog("🚀 Starting Analysis...");
        
        const sendStart = () => {
            chrome.tabs.sendMessage(state.mainTabId, { action: "startScrape", config: { competitors: state.competitors } }, (res) => {
                if (chrome.runtime.lastError) {
                    addLog("⏳ Waiting for page to be ready...");
                    setTimeout(sendStart, 2000);
                } else {
                    addLog("🔍 Page ready, beginning scrape.");
                }
            });
        };
        sendStart();
    }

    if (request.action === "scrapeDone") {
        state.candidates = request.users;
        state.currentIndex = 0;
        addLog(`✅ Found ${state.candidates.length} candidates.`);
        if (state.candidates.length > 0) {
            processNext();
        } else {
            state.active = false;
            addLog("❌ No candidates found.");
        }
    }

    if (request.action === "followResult") {
        if (request.success) {
            state.qualified.push(request.username);
            addLog(`✨ @${request.username} QUALIFIED!`);
        } else {
            addLog(`❌ @${request.username} did not qualify.`);
        }
        
        // Close worker tab and move on
        if (state.workerTabId) {
            chrome.tabs.remove(state.workerTabId, () => {
                state.workerTabId = null;
                state.currentIndex++;
                processNext();
            });
        }
    }

    if (request.action === "log") {
        addLog(request.msg);
    }

    if (request.action === "getState") {
        sendResponse(state);
    }

    if (request.action === "stopAnalysis") {
        state.active = false;
        if (state.workerTabId) {
            chrome.tabs.remove(state.workerTabId).catch(() => {});
            state.workerTabId = null;
        }
        addLog("🛑 Analysis stopped by user.");
    }
    return true;
});

// Detect page load in the worker tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (state.active && state.workerTabId === tabId && changeInfo.status === 'complete') {
        const username = state.candidates[state.currentIndex];
        if (tab.url.includes(username)) {
            addLog(`📄 Profile loaded, checking...`);
            // Wait slightly for React hydration
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: "checkFollows", username, competitors: state.competitors });
            }, 3000);
        }
    }
});

function processNext() {
    if (state.currentIndex >= state.candidates.length) {
        state.active = false;
        state.winner = pickWinner();
        addLog(`🏁 Analysis Finished! Winner: @${state.winner || "None"}`);
        chrome.runtime.sendMessage({ 
            action: "analysisComplete", 
            winner: state.winner, 
            qualifiedCount: state.qualified.length 
        }).catch(() => {});
        return;
    }

    const username = state.candidates[state.currentIndex];
    addLog(`⏭️ Checking @${username}...`);
    
    // Open in a new background tab
    chrome.tabs.create({ 
        url: `https://www.instagram.com/${username}/`,
        active: false // Keep it in background
    }, (tab) => {
        state.workerTabId = tab.id;
    });
}

function pickWinner() {
    if (state.qualified.length === 0) return null;
    return state.qualified[Math.floor(Math.random() * state.qualified.length)];
}