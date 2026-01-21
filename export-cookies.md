# How to Export YouTube Cookies for Render

## Step 1: Install Browser Extension

Install one of these extensions:
- **Chrome**: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

## Step 2: Export Cookies

1. Open **YouTube.com** in your browser
2. **Sign in** to your Google account (important!)
3. Click the extension icon
4. Choose "Export" or "Export for current site"
5. Save the file as `cookies.txt`

## Step 3: Add to Render

1. Go to your [Render Dashboard](https://dashboard.render.com)
2. Select your DJ Mixer service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Set:
   - **Key**: `YOUTUBE_COOKIES`
   - **Value**: Copy the ENTIRE content of the cookies.txt file and paste it here
6. Click **Save Changes**
7. Your service will automatically redeploy

## Important Notes

- ⚠️ Cookies expire! You may need to re-export every 1-2 weeks
- ⚠️ Don't share your cookies.txt file - it contains your session
- ⚠️ Use a secondary Google account if possible (for safety)

## Alternative: Use yt-dlp directly (one-time setup)

If you have Python installed, you can also try:

```bash
pip install yt-dlp
yt-dlp --cookies-from-browser chrome --cookies cookies.txt https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

This exports cookies directly from your browser.
