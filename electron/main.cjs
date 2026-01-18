const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const http = require('http');

// Configuration
const BACKEND_PORT = 3002;
const isDev = !app.isPackaged;

let mainWindow;
let backendProcess;

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
        });
        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
        });
    }).catch(err => {
        console.error('Server failed to start:', err);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Open DevTools in production to debug startup issues
    mainWindow.webContents.openDevTools();
}

function waitForServer(port) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const timeout = 20000; // 20s timeout

        const check = () => {
            // In dev, 5173 might return 200. In prod, 3002 returns 200 for /.
            const req = http.get(`http://localhost:${port}`, (res) => {
                res.resume();
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    console.log(`Server responded with ${res.statusCode}, waiting...`);
                    setTimeout(check, 500);
                }
            });

            req.on('error', (e) => {
                console.log(`Waiting for server on port ${port}... (${e.message})`);
                if (Date.now() - start > timeout) {
                    reject(new Error('Server timeout'));
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

    backendProcess.stdout.on('data', (data) => {
        console.log(`[Backend]: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[Backend Error]: ${data}`);
    });

    backendProcess.on('error', (err) => {
        console.error('Failed to start backend process:', err);
    });

    backendProcess.on('exit', (code, signal) => {
        console.log(`Backend process exited with code ${code}`);
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
