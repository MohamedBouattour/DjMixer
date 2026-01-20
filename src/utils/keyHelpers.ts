
export const getKeyLabel = (code: string | undefined | null, layout: 'qwerty' | 'azerty'): string => {
    if (!code) return '';

    // Remove prefixes for base label
    let label = code.replace('Key', '').replace('Digit', '').replace('Arrow', '');

    if (layout === 'azerty') {
        const azertyMap: Record<string, string> = {
            'Q': 'A',
            'W': 'Z',
            'A': 'Q',
            'Z': 'W',
            'Semicolon': 'M', // Key to the right of L
            'M': ',', // Key to the right of N
            'Comma': ';',
            'Period': ':',
            'Slash': '!',
            'Quote': 'ù',
            'Backquote': '²',
            'BracketLeft': '^',
            'BracketRight': '$',
            'Backslash': '*',
            // Numbers on French keyboards (physically the same keys)
            '0': 'à', '1': '&', '2': 'é', '3': '"', '4': "'",
            '5': '(', '6': '-', '7': 'è', '8': '_', '9': 'ç',
        };

        // Match label without 'Key' or raw code mapping
        const mapped = azertyMap[label] || azertyMap[code];
        if (mapped) return mapped;
    }

    // Default formatting
    if (code.startsWith('Arrow')) return code.replace('Arrow', ' ').toUpperCase();
    if (code === 'Space') return 'SPC';
    if (code === 'Period') return '.';
    if (code === 'Comma') return ',';

    return label;
};
