// popup.js
const logs = document.getElementById('logs');
const logContainer = document.getElementById('logContainer');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const winnerCard = document.getElementById('winnerCard');

// 1. Initial Sync on Open
chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
  if (state && state.logs) {
    state.logs.forEach((msg) => appendLog(msg));
    updateUI(state);
  }
});

// 2. Real-time Sync Loop
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'getState' }, updateUI);
}, 1000);

function appendLog(msg) {
  logContainer.classList.remove('hidden');
  console.log(msg);

  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerText = msg;
  logs.appendChild(div);

  // Keep only the last 10 logs visible
  while (logs.children.length > 10) {
    logs.removeChild(logs.firstChild);
  }

  logContainer.scrollTop = logContainer.scrollHeight;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function updateUI(state) {
  if (!state) return;

  if (state.active) {
    startBtn.disabled = true;
    const total = state.candidates.length;
    if (total > 0) {
      startBtn.innerText = `Analyzing ${state.currentIndex + 1}/${total}`;
    } else {
      startBtn.innerText = 'Scanning...';
    }
    logContainer.classList.remove('hidden');
    winnerCard.classList.add('hidden');
    stopBtn.classList.remove('hidden');
  } else {
    startBtn.disabled = false;
    startBtn.innerText = 'Start Search';
    stopBtn.classList.add('hidden');

    if (state.winner) {
      document.getElementById('winnerName').innerText = '@' + state.winner;
      document.getElementById('winnerLink').href = `https://www.instagram.com/${state.winner}/`;
      document.getElementById('qualifiedCount').innerText = state.qualified.length;
      winnerCard.classList.remove('hidden');
    } else {
      winnerCard.classList.add('hidden');
    }
  }
}

startBtn.addEventListener('click', async () => {
  const competitorsStr = document.getElementById('competitors').value;
  if (!competitorsStr) return alert('Enter competitors');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('instagram.com')) {
    return alert('Please open an Instagram post first.');
  }

  logs.innerHTML = '';
  winnerCard.classList.add('hidden');
  logContainer.classList.remove('hidden');

  chrome.runtime.sendMessage({
    action: 'startAnalysis',
    competitors: competitorsStr.split(/[\s,]+/).filter((c) => c.length > 0),
    tabId: tab.id,
  });
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopAnalysis' });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'log') {
    appendLog(request.msg);
  }

  if (request.action === 'analysisComplete') {
    if (request.winner) {
      appendLog(`🏁 Winner found: @${request.winner}`);
      // UI will update via the interval sync
    }
  }
});
