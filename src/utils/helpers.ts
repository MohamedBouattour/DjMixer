export const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatTotalSeconds = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0s';
    return `${Math.floor(seconds)}s`;
};

export const generateId = (): string => {
    return Math.random().toString(36).substring(2, 9);
};
