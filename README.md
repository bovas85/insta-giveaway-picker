# Instagram Giveaway Analyzer

A hybrid tool to analyze Instagram giveaway comments using both the **Instagram Graph API** (for speed) and **Puppeteer** (for following checks).

## Features
- **Fast Comment Fetching:** Uses the official Graph API to fetch 1000+ comments in seconds.
- **Rules Verification:** Checks if the winner follows specific competitor accounts.
- **Multi-User Support:** Allows up to 3 concurrent analyses using isolated sessions.
- **Secure:** Admin tools and login features are protected by an Access Code.

## Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Configuration:**
    Create a `.env` file in the root directory:
    ```env
    # App Credentials (From Meta Developer Portal)
    INSTAGRAM_APP_ID=your_app_id
    INSTAGRAM_APP_SECRET=your_app_secret
    
    # Your Public URL (e.g. from Cloudflare)
    PUBLIC_URL=https://your-tunnel-url.trycloudflare.com
    
    # Security
    ACCESS_CODE=user_password
    ADMIN_CODE=admin_password
    
    # Optional: If your Facebook Page is hidden from the API list
    MANUAL_PAGE_ID=your_page_id
    
    # Optional: Set to false to see the browser window
    HEADLESS=true
    ```

3.  **Run the Server:**
    ```bash
    npm run serve
    ```

## Usage
1.  Open the dashboard in your browser.
2.  **First Time Setup:**
    *   Enter your `ADMIN_CODE` and click the ⚙️ icon.
    *   Click **API Login** to connect your Facebook/Instagram account.
    *   Click **Browser Login** to save a session for following checks.
3.  **Run Analysis:**
    *   Enter the Post URL and Competitors.
    *   Enter the `ACCESS_CODE` (if required).
    *   Click **Start Analysis**.

## License
MIT
