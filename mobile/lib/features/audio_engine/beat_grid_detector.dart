class BeatGridDetector {
  /// Detects BPM from PCM audio samples or peak amplitude sequence using Spectral Flux & Autocorrelation
  static double detectBpmFromPeaks(List<double> peaks, {double sampleRate = 44100.0, double hopSize = 512.0}) {
    if (peaks.length < 32) return 124.0; // fallback standard club tempo

    // 1. Calculate onset detection function (first-order difference / energy flux)
    final onsets = <double>[];
    for (int i = 1; i < peaks.length; i++) {
      final diff = peaks[i] - peaks[i - 1];
      onsets.add(diff > 0 ? diff : 0.0);
    }

    // 2. Autocorrelation over realistic DJ tempo lag ranges (60 BPM to 180 BPM)
    // frameRate = sampleRate / hopSize
    final frameRate = sampleRate / hopSize;
    final minLag = (frameRate * 60.0 / 180.0).round(); // ~180 BPM
    final maxLag = (frameRate * 60.0 / 60.0).round();  // ~60 BPM

    double maxCorrelation = -1.0;
    int bestLag = (minLag + maxLag) ~/ 2;

    for (int lag = minLag; lag <= maxLag && lag < onsets.length ~/ 2; lag++) {
      double sum = 0.0;
      int count = 0;
      for (int i = 0; i < onsets.length - lag; i++) {
        sum += onsets[i] * onsets[i + lag];
        count++;
      }
      final corr = count > 0 ? sum / count : 0.0;
      if (corr > maxCorrelation) {
        maxCorrelation = corr;
        bestLag = lag;
      }
    }

    if (bestLag <= 0) return 126.0;
    final calculatedBpm = (frameRate * 60.0) / bestLag;

    // Normalize into 70 - 160 BPM window if octave error (half or double tempo)
    var normalizedBpm = calculatedBpm;
    while (normalizedBpm < 75.0) {
      normalizedBpm *= 2.0;
    }
    while (normalizedBpm > 155.0) {
      normalizedBpm /= 2.0;
    }

    return double.parse(normalizedBpm.toStringAsFixed(1));
  }

  /// Calculates beat-grid marker positions (seconds) for a track
  static List<double> generateBeatGrid({
    required double bpm,
    required double firstDownbeatSec,
    required Duration trackDuration,
  }) {
    if (bpm <= 0) return [];
    final secPerBeat = 60.0 / bpm;
    final totalSec = trackDuration.inMilliseconds / 1000.0;

    final markers = <double>[];
    double t = firstDownbeatSec;
    while (t < totalSec) {
      if (t >= 0) {
        markers.add(t);
      }
      t += secPerBeat;
    }
    return markers;
  }

  /// Calculates Phase Difference between Deck A and Deck B in seconds
  static double calculatePhaseOffset({
    required double currentSecA,
    required double bpmA,
    required double currentSecB,
    required double bpmB,
  }) {
    if (bpmA <= 0 || bpmB <= 0) return 0.0;
    final secPerBeatA = 60.0 / bpmA;
    final secPerBeatB = 60.0 / bpmB;

    final phaseA = (currentSecA % secPerBeatA) / secPerBeatA; // 0..1
    final phaseB = (currentSecB % secPerBeatB) / secPerBeatB; // 0..1

    var phaseDiff = phaseA - phaseB;
    if (phaseDiff > 0.5) phaseDiff -= 1.0;
    if (phaseDiff < -0.5) phaseDiff += 1.0;

    return phaseDiff * secPerBeatB;
  }

  /// Tap Tempo calculator: records timestamps and returns averaged BPM
  static double? calculateTapTempo(List<DateTime> tapHistory) {
    if (tapHistory.length < 3) return null;

    final intervals = <double>[];
    for (int i = 1; i < tapHistory.length; i++) {
      final diffMs = tapHistory[i].difference(tapHistory[i - 1]).inMilliseconds;
      if (diffMs > 250 && diffMs < 2000) {
        // Valid 30 to 240 BPM interval
        intervals.add(diffMs.toDouble());
      }
    }

    if (intervals.isEmpty) return null;
    final avgMs = intervals.reduce((a, b) => a + b) / intervals.length;
    final bpm = 60000.0 / avgMs;
    return double.parse(bpm.toStringAsFixed(1));
  }
}
