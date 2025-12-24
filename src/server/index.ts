import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import dotenv from 'dotenv';
import axios from 'axios';
import { startAnalysis, openLoginBrowser } from './analyzer';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = 3000;

// Determine the correct client path
// If running via ts-node, __dirname is src/server, so client is ../client
// If running via node dist/server/index.js, __dirname is dist/server, so client is ../client IF it was copied.
// But we haven't copied it. So let's point to the SOURCE client folder for now to be safe.
const clientPath = path.resolve(__dirname, '../../src/client');

console.log(`📂 Serving client files from: ${clientPath}`);

// Serve static files from the client directory
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(clientPath, 'admin.html'));
});

// --- Instagram Graph API Auth Flow ---

app.get('/auth/debug', async (req, res) => {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.send('❌ Error: No INSTAGRAM_ACCESS_TOKEN found in .env');

  try {
    // Check User Info
    const userRes = await axios.get(
      `https://graph.facebook.com/v18.0/me?fields=name,id&access_token=${token}`,
    );
    const user = userRes.data;

    // Check Permissions
    const permRes = await axios.get(
      `https://graph.facebook.com/v18.0/me/permissions?access_token=${token}`,
    );
    const grantedPerms = permRes.data.data
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission);

    // Check Accounts (with extra fields)
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts?fields=name,id,instagram_business_account,tasks,is_published,category&access_token=${token}`,
    );
    const pages = response.data.data;
    const validPages = pages.filter((p: any) => p.instagram_business_account);

    // --- Manual ID Check ---
    const manualId = process.env.MANUAL_PAGE_ID;
    let manualResult = null;

    if (manualId) {
      try {
        const manualRes = await axios.get(
          `https://graph.facebook.com/v18.0/${manualId}?fields=name,instagram_business_account{id,username}&access_token=${token}`,
        );
        manualResult = manualRes.data;
      } catch (e: any) {
        manualResult = { error: e.response?.data?.error?.message || e.message };
      }
    }
    // -----------------------

    let html = `<h1>🔍 Auth Debugger</h1>`;
    html += `<p><strong>Logged in as:</strong> ${user.name} <span style="font-size:0.8em; opacity:0.7">(ID: ${user.id})</span></p>`;

    if (manualId) {
      html += `<p><strong>Manual Lookup (ID: ${manualId}):</strong> `;
      if (manualResult.error) {
        html += `<span style="color:red">❌ Failed: ${manualResult.error}</span></p>`;
      } else {
        const ig = manualResult.instagram_business_account;
        const igName = ig ? `@${ig.username}` : 'NONE';
        html += `<span style="color:green">✅ Found: ${manualResult.name} (IG Linked: ${igName})</span></p>`;
      }
    }

    html += `<h3>🔑 Granted Permissions:</h3>`;

    html += `<h3>🔑 Granted Permissions:</h3>`;
    if (grantedPerms.length === 0) {
      html += `<p style="color:red">⚠️ NO PERMISSIONS GRANTED. The token is invalid or the app is misconfigured.</p>`;
    } else {
      html += `<ul>${grantedPerms.map((p: string) => `<li>${p}</li>`).join('')}</ul>`;
    }

    const required = ['pages_show_list', 'instagram_basic', 'instagram_manage_comments'];
    const missing = required.filter((p) => !grantedPerms.includes(p));

    if (missing.length > 0) {
      html += `<p style="color:red; font-weight:bold">❌ MISSING CRITICAL PERMISSIONS: ${missing.join(', ')}</p>`;
      html += `<p>This usually means your .env file has the WRONG App ID (the old Consumer one), or you selected "Business" app type but didn't add the "Instagram Graph API" product.</p>`;
    } else {
      html += `<p style="color:green">✅ All required permissions are present.</p>`;
    }

    html += `<h3>📄 Pages Found: ${pages.length}</h3>`;
    html += `<p><strong>Token Status:</strong> Present</p>`;
    html += `<p><strong>Pages Found:</strong> ${pages.length}</p>`;

    if (pages.length === 0) {
      html += `<p style="color:red">⚠️ No Pages found. You likely unchecked the "Facebook Page" permission during login.</p>`;
    } else {
      html += `<ul>`;
      pages.forEach((p: any) => {
        const hasIg = !!p.instagram_business_account;
        const style = hasIg ? 'color:green; font-weight:bold' : 'color:gray';
        const icon = hasIg ? '✅' : '❌';
        html += `<li style="${style}">${icon} ${p.name} <span style="font-size:0.8em; opacity:0.7">(ID: ${p.id})</span> - IG Linked: ${hasIg ? 'YES' : 'NO'}</li>`;
      });
      html += `</ul>`;
    }

    if (validPages.length === 0) {
      html += `<h3>💡 How to fix:</h3>
        <ol>
            <li>Go to <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank">Facebook Business Integrations</a></li>
            <li>Find "Insta Analyzer" and click <strong>View and Edit</strong></li>
            <li>Ensure the <strong>Facebook Page</strong> connected to your Instagram is CHECKED.</li>
            <li>Save and try running the analysis again.</li>
        </ol>`;
    } else {
      html += `<p style="color:green">✅ System detects ${validPages.length} usable account(s). Analysis should work!</p>`;
    }

    res.send(html);
  } catch (e: any) {
    res
      .status(500)
      .send(
        `<h3>❌ API Error</h3><pre>${JSON.stringify(e.response?.data || e.message, null, 2)}</pre>`,
      );
  }
});

app.get('/auth/instagram', (req, res) => {
  const appId = process.env.INSTAGRAM_APP_ID;
  const redirectUri = `${process.env.PUBLIC_URL}/auth/instagram/callback`;

  // Permissions needed for analyzing own posts and comments:
  // instagram_basic: read profile info
  // instagram_manage_comments: read/reply to comments
  // pages_show_list: needed to find the Page linked to the IG account
  // pages_read_engagement: needed to read content from the Page
  const scope = 'instagram_basic,instagram_manage_comments,pages_show_list,pages_read_engagement';

  if (!appId || !process.env.PUBLIC_URL) {
    return res.status(500).send('Error: Missing INSTAGRAM_APP_ID or PUBLIC_URL in .env');
  }

  // Add auth_type=reauthenticate to force the "Select Pages" screen to appear again
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&auth_type=reauthenticate`;

  res.redirect(authUrl);
});

app.get('/auth/instagram/callback', async (req, res) => {
  const { code, error, error_reason, error_description } = req.query;

  if (error) {
    return res.status(400).send(`Login Failed: ${error_reason} - ${error_description}`);
  }

  if (!code) {
    return res.status(400).send('Error: No code received.');
  }

  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = `${process.env.PUBLIC_URL}/auth/instagram/callback`;

    // Exchange code for Access Token
    const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: appId,
        redirect_uri: redirectUri,
        client_secret: appSecret,
        code: code,
      },
    });

    const { access_token } = response.data;

    // TODO: Save this token securely (e.g., in a session or database)
    // For now, we'll just display it so you can verify it works.
    console.log('✅ ACCESS TOKEN RECEIVED:', access_token);

    res.send(`
      <h1>Login Successful!</h1>
      <p>Your Access Token has been logged to the server console.</p>
      <p>You can now close this window.</p>
    `);
  } catch (err: any) {
    console.error('Token Exchange Error:', err.response?.data || err.message);
    res
      .status(500)
      .send(`Error exchanging token: ${JSON.stringify(err.response?.data || err.message)}`);
  }
});

// -------------------------------------

// Concurrency Control
let activeScans = 0;
const MAX_CONCURRENT = 3;

// Admin Stats
const serverStartTime = Date.now();
const serverStats = {
  totalScans: 0,
  success: 0,
  failed: 0,
};
const activeSessions: any[] = [];

// Socket.io connection
io.on('connection', (socket) => {
  // ... (auth status logic) ...
  const apiReady = !!process.env.INSTAGRAM_ACCESS_TOKEN;
  const userDataDir = path.join(process.cwd(), 'instagram-session');
  let browserReady = false;
  try {
    if (fs.existsSync(userDataDir) && fs.readdirSync(userDataDir).length > 0) {
      browserReady = true;
    }
  } catch (e) {
    // ignore
  }

  socket.emit('auth-status', { apiReady, browserReady });

  socket.on('open-login', async () => {
    await openLoginBrowser((msg) => socket.emit('log', msg));
  });

  socket.on('verify-access-code', (code: string) => {
    const adminCode = process.env.ADMIN_CODE || process.env.ACCESS_CODE;
    if (adminCode && code === adminCode) {
      socket.emit('admin-access-granted');
    } else {
      socket.emit('log', '⛔ Admin Access Denied.');
    }
  });

  // Admin Stats Request
  socket.on('get-admin-stats', (code: string) => {
    const adminCode = process.env.ADMIN_CODE;
    if (!adminCode || code !== adminCode) {
      socket.emit('admin-error', 'Invalid Admin Code');
      return;
    }

    const memUsage = process.memoryUsage();
    const stats = {
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      activeScans,
      maxConcurrent: MAX_CONCURRENT,
      totalScans: serverStats.totalScans,
      success: serverStats.success,
      failed: serverStats.failed,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        totalSystem: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
      },
      loadAvg: os.loadavg(),
      sessions: activeSessions,
    };

    socket.emit('admin-stats', stats);
  });

  socket.on('start-analysis', async (data) => {
    // Check concurrency
    if (activeScans >= MAX_CONCURRENT) {
      socket.emit(
        'log',
        `⚠️ Server is busy (${activeScans}/${MAX_CONCURRENT} active scans). Please try again in a minute.`,
      );
      socket.emit('result', { error: 'Server busy' });
      return;
    }

    const { postUrl, competitors, accessCode } = data;

    // Access Code Protection
    const serverCode = process.env.ACCESS_CODE;
    if (serverCode && accessCode !== serverCode) {
      socket.emit('log', '⛔ ACCESS DENIED: Invalid Access Code.');
      socket.emit('result', { error: 'Invalid Access Code' });
      return;
    }

    if (!postUrl || !competitors) {
      socket.emit('log', '❌ Error: Missing URL or Competitors.');
      return;
    }

    const compsArray = competitors
      .split(/[\s,]+/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 0);

    // Run the analyzer
    activeScans++;
    serverStats.totalScans++;

    const sessionId = Date.now().toString();
    const sessionData = {
      id: sessionId,
      url: postUrl,
      startTime: new Date().toISOString(),
      competitors: compsArray.length,
    };
    activeSessions.push(sessionData);

    socket.emit('log', `🚦 Job started (Active: ${activeScans}/${MAX_CONCURRENT})`);

    try {
      await startAnalysis(
        { postUrl, competitors: compsArray },
        (msg) => socket.emit('log', msg),
        (result) => {
          if (result.error) serverStats.failed++;
          else serverStats.success++;
          socket.emit('result', result);
        },
      );
    } catch (e) {
      // Error handling is mostly done inside startAnalysis, but just in case
      console.error('Handler error:', e);
      serverStats.failed++;
    } finally {
      activeScans--;
      // Remove from active sessions
      const idx = activeSessions.findIndex((s) => s.id === sessionId);
      if (idx !== -1) activeSessions.splice(idx, 1);
      // socket.emit("log", `🚦 Job finished (Active: ${activeScans}/${MAX_CONCURRENT})`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (process.env.ACCESS_CODE) {
    console.log('🔒 Access Code Protection: ENABLED');
  } else {
    console.log('⚠️ Access Code Protection: DISABLED (Anyone can access)');
  }
});
