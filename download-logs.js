#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const args = process.argv.slice(2);
const serverUrl = args[0] || process.env.SERVER_URL || 'http://localhost:3002';
const targetUrl = `${serverUrl.replace(/\/$/, '')}/api/logs`;

console.log(`Attempting to download logs from: ${targetUrl}`);

try {
    const res = await fetch(targetUrl);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    const dest = path.join(process.cwd(), 'downloaded-logs.txt');
    const fileStream = fs.createWriteStream(dest);
    
    if (res.body) {
        const body = Readable.fromWeb(res.body);
        body.pipe(fileStream);
        fileStream.on('finish', () => {
            console.log(`SUCCESS: Logs successfully written to ${dest}`);
        });
        fileStream.on('error', (err) => {
            console.error(`ERROR: File stream error: ${err.message}`);
        });
    } else {
        const text = await res.text();
        fs.writeFileSync(dest, text);
        console.log(`SUCCESS: Logs successfully written to ${dest}`);
    }
} catch (err) {
    console.error(`ERROR: Failed to download logs: ${err.message}`);
    console.log(`Usage: node download-logs.js [SERVER_URL]`);
    process.exit(1);
}
