const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const http = require('http');

// Configuration
const BACKEND_PORT = 3002;
const isDev = !app.isPackaged;

let mainWindow;
let backendProcess;
let backendLogs = [];

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#0a0a0a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        },
        title: "DJ Controller",
        show: false // Don't show until ready
    });

    const appUrl = isDev
        ? 'http://localhost:5173'
        : `http://localhost:${BACKEND_PORT}`;

    console.log('Loading URL:', appUrl);

    // Wait for server before loading
    const targetPort = isDev ? 5173 : BACKEND_PORT;
    waitForServer(targetPort).then(() => {
        mainWindow.loadURL(appUrl).catch(e => {
            console.error('Failed to load URL:', e);
            dialog.showErrorBox('Load Error', `Failed to load app URL: ${e.message}`);
        });
        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
        });
    }).catch(err => {
        console.error('Server failed to start:', err);
        const logs = backendLogs.join('\n').slice(-1000); // Last 1000 chars
        dialog.showErrorBox('Startup Error',
            `Failed to start backend server.\n\nError: ${err.message}\n\nLast Backend Logs:\n${logs}`
        );
        app.quit();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Open DevTools in production to debug startup issues
    // mainWindow.webContents.openDevTools();
}

function waitForServer(port) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const timeout = 20000; // 20s timeout

        const check = () => {
            // Check if backend process died (only relevant for prod/backend usage)
            if (backendProcess && backendProcess.exitCode !== null) {
                return reject(new Error(`Backend process exited early with code ${backendProcess.exitCode}`));
            }

            // In dev, 5173 might return 200. In prod, 3002 returns 200 for /.
            // If we get 404, the server IS running, just maybe missing the file. 
            // We should resolve so the window can open and show the 404 error (or "App not ready").
            const req = http.get(`http://localhost:${port}`, (res) => {
                res.resume();
                if (res.statusCode === 200 || res.statusCode === 404) {
                    resolve();
                } else {
                    console.log(`Server responded with ${res.statusCode}, waiting...`);
                    setTimeout(check, 500);
                }
            });

            req.on('error', (e) => {
                if (Date.now() - start > timeout) {
                    reject(new Error(`Server timeout after ${timeout}ms. Port ${port} not reachable.`));
                } else {
                    setTimeout(check, 500);
                }
            });
            req.end();
        };
        check();
    });
}

function startBackend() {
    const userDataPath = app.getPath('userData');
    const cacheDir = path.join(userDataPath, 'cache');

    let backendScript;
    if (isDev) {
        backendScript = path.join(__dirname, '../backend/proxy.js');
    } else {
        // In production, resources/backend/proxy.js
        backendScript = path.join(process.resourcesPath, 'backend', 'proxy.js');
    }

    console.log('Starting backend from:', backendScript);

    if (!fs.existsSync(backendScript)) {
        console.error('Backend script not found at:', backendScript);
        dialog.showErrorBox('Detailed Error', `Backend script missing at: ${backendScript}`);
        return;
    }

    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
        } catch (e) {
            console.error('Failed to create cache dir:', e);
        }
    }

    backendProcess = fork(backendScript, [], {
        env: {
            ...process.env,
            PORT: BACKEND_PORT,
            CACHE_DIR: cacheDir,
            NODE_ENV: isDev ? 'development' : 'production'
        },
        // Pipe output so we can see it in terminal (if run from terminal)
        // and potentially capture it if needed
        stdio: 'pipe'
    });

    const captureLog = (type, data) => {
        const line = `[${type}] ${data.toString().trim()}`;
        console.log(line);
        backendLogs.push(line);
        if (backendLogs.length > 50) backendLogs.shift(); // Keep last 50 lines
    };

    backendProcess.stdout.on('data', (data) => captureLog('Backend', data));
    backendProcess.stderr.on('data', (data) => captureLog('Backend Error', data));

    backendProcess.on('error', (err) => {
        console.error('Failed to start backend process:', err);
        dialog.showErrorBox('Process Error', `Failed to spawn backend: ${err.message}`);
    });

    backendProcess.on('exit', (code, signal) => {
        console.log(`Backend process exited with code ${code}`);
        if (code !== 0 && code !== null) {
            // If it crashes while we are waiting, waitForServer loop deals with it
            // If it crashes later, we might want to alert the user
            console.error(`Backend crashed unexpectedly (Code: ${code})`);
        }
    });
}

app.whenReady().then(() => {
    startBackend();
    // Start checking immediately
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
});

