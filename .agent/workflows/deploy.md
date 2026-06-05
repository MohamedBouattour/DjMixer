---
description: Build and Prepare for Deployment
---

# Deployment Workflow

This workflow prepares the application for a unified Docker-based deployment: the static frontend and the backend API on your VPS (dj-mixer.cloud).

## Unified Deployment (VPS)
The frontend and backend are deployed together to your VPS using Docker Compose.

1. **Run the deployment script**
   This script will archive the source files, transfer them to your VPS, and run `docker compose up --build -d`.
   ```bash
   node ./deploy.js
   ```
   *Note: Ensure your `.env` containing `RAPID_API` keys is present locally so it gets transferred to the VPS.*

2. **What Happens?**
   - The frontend is built inside a Docker container (`Dockerfile.frontend`) and served via Nginx.
   - Nginx handles SSL and routes `/api/` traffic to the backend container.
   - The backend runs in its own container (`Dockerfile.backend`) on port 3002.
   - The deploy script automatically restarts the Docker containers and cleans up old PM2 processes.

3. **Domain Configuration**
   The application is configured to run on `dj-mixer.cloud`. Ensure your DNS records are pointing to the VPS IP (`79.137.14.75`). Nginx will handle the HTTP to HTTPS redirection.
