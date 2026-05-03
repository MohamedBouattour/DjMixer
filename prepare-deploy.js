import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = __dirname;
const backendDir = path.join(rootDir, 'backend');
const distDir = path.join(rootDir, 'dist');
const backendPublicDir = path.join(backendDir, 'public');

const execOptions = { stdio: 'inherit', cwd: rootDir, shell: true };

try {
    console.log('🔹 Starting Preparation for VPS Deployment...');

    // 1. Build Frontend (Skipped for Split Deployment)
    console.log('🔹 Skipping frontend build (deployed to Render)...');

    // 2. Prepare Backend Public Directory
    console.log('🔹 Preparing backend public directory...');
    if (fs.existsSync(backendPublicDir)) {
        fs.rmSync(backendPublicDir, { recursive: true, force: true });
    }
    fs.mkdirSync(backendPublicDir, { recursive: true });

    // 3. Copy build artifacts (Skipped)
    console.log('🔹 Skipping frontend artifacts copy...');

    // 4. Bundle Backend (Single JS file)
    console.log('🔹 Bundling backend into bundle.js...');
    // We bundle with esbuild to create a single deployment file.
    // Native deps (better-sqlite3) and auth libs must be installed on VPS.
    execSync('npx esbuild backend/proxy.js --bundle --platform=node --target=node20 --outfile=backend/bundle.js --external:youtube-dl-exec --external:express --external:cors --external:yt-search --external:dotenv --external:better-sqlite3 --external:bcryptjs --external:jsonwebtoken --external:google-auth-library', execOptions);
    console.log('✅ Backend bundled successfully!');

    console.log('✅ Deployment preparation complete!');
    console.log('   You can now run "node deploy.js" to push to the VPS.');

} catch (error) {
    console.error('❌ Failed to prepare deployment:', error.message);
    process.exit(1);
}
