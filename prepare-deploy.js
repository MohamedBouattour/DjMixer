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

try {
    console.log('🔹 Installing frontend dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: rootDir, shell: true });

    console.log('🔹 Building frontend...');
    execSync('npm run build', { stdio: 'inherit', cwd: rootDir, shell: true });

    console.log('🔹 Installing backend dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: backendDir, shell: true });

    console.log('🔹 Preparing backend public directory...');
    if (fs.existsSync(backendPublicDir)) {
        fs.rmSync(backendPublicDir, { recursive: true, force: true });
    }
    fs.mkdirSync(backendPublicDir, { recursive: true });

    console.log('🔹 Copying build artifacts to backend/public...');
    if (fs.existsSync(distDir)) {
        fs.cpSync(distDir, backendPublicDir, { recursive: true });
        console.log('✅ Build artifacts copied successfully!');
    } else {
        console.error('❌ Error: dist directory not found after build!');
        process.exit(1);
    }

    console.log('✅ Deployment preparation complete!');
    console.log('   Now you can commit the changes (including backend/public) and deploy to Render.');
    console.log('   On Render, you can simply set the Root Directory to "backend" and Start Command to "npm start".');
    console.log('   OR, if you prefer building on Render, use the render-build.sh script.');

} catch (error) {
    console.error('❌ Failed to prepare deployment:', error.message);
    process.exit(1);
}
