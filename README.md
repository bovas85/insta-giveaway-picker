# Instagram Giveaway Analyzer

A hybrid tool to analyze Instagram giveaway comments using both the **Instagram Graph API** (for speed) and **Puppeteer** (for following checks).

## Features
- **Fast Comment Fetching:** Uses the official Graph API to fetch 1000+ comments in seconds.
- **Rules Verification:** Checks if the winner follows specific competitor accounts.
- **Multi-User Support:** Allows up to 3 concurrent analyses using isolated sessions.
- **Secure:** Admin tools and login features are protected by an Access Code.

## Usage Modes

This tool can be used in three ways:
1.  **Local (No Setup):** Run on your own computer. Uses "Browser Login" to scrape comments. No tunnel or Meta App needed.
2.  **Public/API Mode (Cloudflare Required):** Generates a secure URL so you can:
    *   **Use the Graph API:** For ultra-fast comment fetching (requires a Meta App).
    *   **Remote Access:** Use the dashboard from your phone or any other device.
3.  **Chrome Extension:** A standalone browser tool. No server or setup required.

---

## Quick Start (Local Mode)
1.  **Install:** `npm install`
2.  **Run:** `npm run serve` (or double-click `Run_Analyzer.bat`)
3.  **Open:** Go to `http://localhost:3000` in your browser.
4.  **Login:** Click **ADMIN** (⚙️), then click **Browser Login (Required)** to save your Instagram session.
5.  **Analyze:** Enter the Post URL, Competitors, and click **Start Analysis**.

---

## Public & API Setup (Optional)
If you want to use the **API Login** or access the tool from your phone, you must set up a tunnel.

1.  **Download:** Install `cloudflared` by following the [official installation guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/installation/).
2.  **Run Tunnel:** 
    *   **Windows:** `Start_Public_URL.bat`
    *   **macOS/Linux:** `chmod +x Start_Public_URL.sh && ./Start_Public_URL.sh`
3.  **Copy URL:** Copy the `https://random-name.trycloudflare.com` link.
4.  **Configure `.env`:**
    *   Set `PUBLIC_URL=https://your-tunnel-url.trycloudflare.com`.
    *   (For API) Add your `INSTAGRAM_APP_ID` and `SECRET`.
5.  **Update Meta Dashboard:** Add your `PUBLIC_URL + /auth/instagram/callback` to the **Valid OAuth Redirect URIs** in your Meta App settings.


## Chrome Extension (Sideloading & Usage)
A standalone version that runs entirely in your browser. No server or technical setup required.

1.  **Sideloading (Installation):**
    *   Open Google Chrome and navigate to `chrome://extensions`.
    *   Toggle **Developer Mode** on (top right corner).
    *   Click the **Load Unpacked** button (top left).
    *   Select the `chrome-extension` folder located inside this project directory.
2.  **Usage:**
    *   **Pin it:** Click the puzzle piece icon 🧩 in Chrome and pin **InstaPick Pro**.
    *   **Navigate:** Go to the Instagram post you want to analyze.
    *   **Run:** Click the extension icon, enter Competitor Handles, and hit **Start Search**.
    *   *Important: Keep the Instagram tab open and active while it works.*

## License
MIT
