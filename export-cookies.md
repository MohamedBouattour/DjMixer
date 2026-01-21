# How to Export YouTube Cookies for Render

YouTube is now requiring authentication to bypass bot detection. You need to provide cookies from a logged-in YouTube session.

## Step 1: Install Browser Extension

Install one of these extensions:
- **Chrome**: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

## Step 2: Export Cookies

1. Open **YouTube.com** in your browser
2. **Sign in** to your Google account (important!)
3. Watch a few videos to ensure the session is active
4. Click the extension icon
5. Choose **"Export"** or **"Export for current site"**
6. Save the file as `cookies.txt`

## Step 3: Add to Render

1. Go to your [Render Dashboard](https://dashboard.render.com)
2. Select your **DJ Mixer** service
3. Go to the **Environment** tab
4. Click **Add Environment Variable**
5. Set:
   - **Key**: `YOUTUBE_COOKIES`
   - **Value**: Copy the **ENTIRE** content of the `cookies.txt` file and paste it here
6. Click **Save Changes**
7. Your service will automatically redeploy

## Alternative: Use yt-dlp to Export Cookies

If you have Python installed, this is the most reliable method:

```bash
# Install yt-dlp  
pip install yt-dlp

# Export cookies from Chrome (choose your browser)
yt-dlp --cookies-from-browser chrome --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# For Firefox:
yt-dlp --cookies-from-browser firefox --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# For Edge:
yt-dlp --cookies-from-browser edge --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Then copy the content of `cookies.txt` to Render's environment variable.

## ⚠️ Important Notes

- **Cookies expire!** You may need to re-export every 1-2 weeks
- **Don't share** your cookies.txt file - it contains your session
- **Use a secondary Google account** if possible (for safety)
- **Keep YouTube open** in your browser to keep the session fresh

## Checking If It Works

After deploying with cookies, check the Render logs. You should see:
```
Authentication status: YOUTUBE_COOKIES=SET, PO_TOKEN=NOT SET
Cookies file written from environment variable
Using cookies file for authentication
yt-dlp download successful
```

If you still see bot detection errors, your cookies may have expired or your account needs more activity.
