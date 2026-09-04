import 'dart:math' as math;

class TimeStretcher {
  /// Converts pitch semitones to playback rate multiplier (without key lock)
  static double semitonesToRate(int semitones) {
    return math.pow(2.0, semitones / 12.0).toDouble();
  }

  /// Converts percentage pitch fader (-100% to +100%) to playback speed rate
  static double pitchPercentToSpeed(double pitchPercent) {
    return (1.0 + (pitchPercent / 100.0)).clamp(0.05, 2.5);
  }

  /// Camelot Wheel and Musical Key Transposition Dictionary
  static const Map<String, String> keyToCamelot = {
    'Abm': '1A', 'B': '1B',
    'Ebm': '2A', 'F#': '2B',
    'Bbm': '3A', 'Db': '3B',
    'Fm': '4A',  'Ab': '4B',
    'Cm': '5A',  'Eb': '5B',
    'Gm': '6A',  'Bb': '6B',
    'Dm': '7A',  'F': '7B',
    'Am': '8A',  'C': '8B',
    'Em': '9A',  'G': '9B',
    'Bm': '10A', 'D': '10B',
    'F#m': '11A','A': '11B',
    'C#m': '12A','E': '12B',
  };

  static const List<String> chromaticKeys = [
    'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
  ];

  /// Transposes a key by a given semitone offset
  static String transposeKey(String key, int semitones) {
    final isMinor = key.endsWith('m');
    final base = isMinor ? key.substring(0, key.length - 1) : key;
    final idx = chromaticKeys.indexOf(base);
    if (idx == -1) return key;

    final newIdx = (idx + semitones) % 12;
    final wrappedIdx = newIdx < 0 ? newIdx + 12 : newIdx;
    return '${chromaticKeys[wrappedIdx]}${isMinor ? "m" : ""}';
  }

  /// Retrieves Camelot notation (e.g. "8A" for Am)
  static String getCamelot(String key) {
    return keyToCamelot[key] ?? key;
  }

  /// Checks if two keys are harmonically compatible on the Camelot wheel
  static bool isHarmonicallyCompatible(String keyA, String keyB) {
    final camA = getCamelot(keyA);
    final camB = getCamelot(keyB);
    if (camA == camB) return true;

    final numA = int.tryParse(camA.replaceAll(RegExp(r'[AB]'), '')) ?? 0;
    final numB = int.tryParse(camB.replaceAll(RegExp(r'[AB]'), '')) ?? 0;
    final letterA = camA.replaceAll(RegExp(r'[0-9]'), '');
    final letterB = camB.replaceAll(RegExp(r'[0-9]'), '');

    // Same number, relative major/minor
    if (numA == numB) return true;

    // Same letter, adjacent numbers (1 step clock distance)
    if (letterA == letterB) {
      final diff = (numA - numB).abs();
      return diff == 1 || diff == 11;
    }
    return false;
  }
}
