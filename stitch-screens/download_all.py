#!/usr/bin/env python3
import os
import json
import urllib.request
import re

# Base directory paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.dirname(BASE_DIR)
ENV_PATH = os.path.join(WORKSPACE_DIR, '.env')
JSON_PATH = os.path.join(BASE_DIR, 'screens_list_mcp.json')
IMAGES_DIR = os.path.join(BASE_DIR, 'images')
CODE_DIR = os.path.join(BASE_DIR, 'code')

# Ensure output directories exist
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(CODE_DIR, exist_ok=True)

# Load STITCH_API_KEY from .env
api_key = None
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, 'r') as f:
        for line in f:
            if line.startswith('STITCH_API_KEY='):
                api_key = line.split('=', 1)[1].strip()
                break

if not api_key:
    print("❌ STITCH_API_KEY not found in .env!")
    exit(1)

# Hardcoded screen slugs mapped by screen_id
SLUG_MAP = {
    "3b41033f23f24b92af89a3f46087c360": "track-library-overlay",
    "e4046d084889498eaf9fb5e8715f8cf0": "track-library-optimized",
    "ed1acd70be11458b8566e1e0cc0ecb93": "smart-mix-dashboard",
    "a269f82406304146a61242ed6581e928": "track-library-pro-grade",
    "278717ed9d7d4ce289f3917eabe789c8": "eq-popup",
    "8edf883604ce47df9eadc7e308782553": "mixing-interface",
    "a062af2d8a4d48c1b7531e061ba3c050": "pro-mixing-optimized",
    "6f598ebf55b94d1db88da5887deb653e": "dj-pro-master-pro",
    "9c75fdfaace6493b8d3c746db79d347e": "pro-eq-interface",
    "2c320563d2854f81bf460f97b53b2ee3": "settings-modal",
    "595e83f1f6fe4512a772c1b7b8f9e077": "orientation-lock",
    "asset-stub-assets_e9150d8f54c9429c9e0fe95a2b462b2e": "design-system",
    "f2ede3311e32488ba5bfef4fef13a302": "orientation-polished",
    "a1a132e283c34b6dbbea81523cbab784": "auth-modal",
    "d36b53126f97400bb1d7ed49e6b2252d": "smart-mix-optimized",
    "aa892dd54b4b4f54860398e8b72900c6": "smart-mix-panel"
}

def get_slug(screen_id, title):
    if screen_id in SLUG_MAP:
        return SLUG_MAP[screen_id]
    # Fallback to slugified title
    slug = title.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug

import time

def download_file(url, output_path, desc, max_retries=3):
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                with open(output_path, 'wb') as out_file:
                    out_file.write(response.read())
            size = os.path.getsize(output_path)
            if size > 0:
                print(f"   ✅ Downloaded {desc} ({size} bytes) on attempt {attempt}")
                return True
            else:
                print(f"   ⚠️ Warning: downloaded {desc} is empty, retrying...")
        except Exception as e:
            print(f"   ⚠️ Attempt {attempt}/{max_retries} failed for {desc}: {e}")
            if attempt < max_retries:
                time.sleep(2)
    print(f"   ❌ All attempts failed for {desc}")
    return False

# Read screens_list_mcp.json
if not os.path.exists(JSON_PATH):
    print(f"❌ {JSON_PATH} not found!")
    exit(1)

with open(JSON_PATH, 'r') as f:
    data = json.load(f)

screens = data.get('result', {}).get('structuredContent', {}).get('screens', [])
if not screens:
    # Try different JSON format path
    screens = data.get('screens', [])

print(f"🎵 Found {len(screens)} screens in MCP data. Starting download...\n")

success_count = 0
for idx, screen in enumerate(screens, 1):
    name = screen.get('name', '')
    title = screen.get('title', 'unnamed')
    
    # Extract screen ID from resource name "projects/{project_id}/screens/{screen_id}"
    screen_id = name.split('/')[-1] if '/' in name else name
    slug = get_slug(screen_id, title)
    
    print(f"[{idx}/{len(screens)}] 🎯 {title} (ID: {screen_id}, Slug: {slug})")
    
    # 1. Download Screenshot
    screenshot_obj = screen.get('screenshot', {})
    screenshot_url = screenshot_obj.get('downloadUrl') if isinstance(screenshot_obj, dict) else None
    
    img_success = False
    if screenshot_url:
        img_path = os.path.join(IMAGES_DIR, f"{slug}.png")
        img_success = download_file(screenshot_url, img_path, "image")
    else:
        print("   ⚠️ No image URL found for this screen")

    # 2. Download HTML Code
    html_obj = screen.get('htmlCode', {})
    html_url = html_obj.get('downloadUrl') if isinstance(html_obj, dict) else None
    
    html_success = False
    if html_url:
        # Append API key for authentication on usercontent download endpoint
        auth_html_url = f"{html_url}&key={api_key}"
        html_path = os.path.join(CODE_DIR, f"{slug}.html")
        html_success = download_file(auth_html_url, html_path, "HTML code")
    else:
        print("   ⚠️ No HTML code URL found for this screen")
        
    if img_success or html_success:
        success_count += 1
    time.sleep(1)
    print("-" * 50)

print(f"\n✨ Download summary: {success_count}/{len(screens)} screens successfully processed.")
print(f"📁 Images: {IMAGES_DIR}")
print(f"📁 Code: {CODE_DIR}")
