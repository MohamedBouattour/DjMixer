---
description: Build and Prepare for Deployment
---

# Deployment Workflow

This workflow prepares the application for a split deployment: the static frontend on Render, and the backend API on your VPS.

## 1. Backend Deployment (VPS)
The backend API is deployed directly to your VPS (`79.137.14.75`).

1. **Run the deployment script**
   This script will bundle the backend using esbuild and deploy it via SSH to your VPS. It no longer builds the frontend.
   ```bash
   node ./deploy.js
   ```
   *Note: Ensure your `.env` containing `RAPID_API` keys is present.*

## 2. Frontend Deployment (Render)
The frontend is deployed as a static site to Render. Render will automatically build the `dist` directory.

1. **Commit your changes**
   ```bash
   git add .
   git commit -m "chore: prepare for deployment"
   ```

2. **Push to Remote**
   ```bash
   git push origin main
   ```

3. **Render Configuration for Frontend**
   - **Type**: Static Site
   - **Root Directory**: `.` (leave empty or set to root)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Environment Variables**:
     - `VITE_API_URL`: `https://79.137.14.75/api` (Tells the frontend where the backend VPS is)
