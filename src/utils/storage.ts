import type { Track } from '../types';

const DB_NAME = 'DJControllerDB';
const DB_VERSION = 2;
const STORE_NAME = 'tracks';
const SETTINGS_STORE_NAME = 'settings';

let db: IDBDatabase | null = null;

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
                db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

export const saveTrackToDB = async (track: Track): Promise<void> => {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // We store the File object itself in IndexedDB
        const request = store.put(track);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllTracksFromDB = async (): Promise<Track[]> => {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const tracks = request.result as Track[];
            // Re-create object URLs for each track as they expire on refresh
            const hydratedTracks = tracks.map(track => {
                if (track.file) {
                    return {
                        ...track,
                        url: URL.createObjectURL(track.file)
                    };
                }
                return track;
            });
            resolve(hydratedTracks);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteTrackFromDB = async (id: string): Promise<void> => {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

import type { KeyMap } from '../types';

export const saveKeyMapToDB = async (keyMap: KeyMap): Promise<void> => {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([SETTINGS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = store.put({ id: 'keyMap', value: keyMap });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getKeyMapFromDB = async (): Promise<KeyMap | null> => {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([SETTINGS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = store.get('keyMap');

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result.value as KeyMap);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
};
