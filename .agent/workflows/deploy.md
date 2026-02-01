---
description: Build and Prepare for Deployment
---

# Deployment Workflow

This workflow prepares the application for deployment (e.g., to Render.com) by building the frontend and copying artifacts to the backend.

1. **Run the preparation script**
   This script installs dependencies, builds the Vite frontend, and copies the `dist` folder to the backend's public directory.
   ```bash
   node ./prepare-deploy.js
   ```

2. **Commit Changes**
   After the script finishes, commit the changes including the updated `backend/public` folder.
   ```bash
   git add .
   git commit -m "chore: prepare for deployment"
   ```

3. **Push to Remote**
   Push to your repository connected to Render/Heroku.
   ```bash
   git push origin main
   ```

## Render Configuration
- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `node proxy.js`
