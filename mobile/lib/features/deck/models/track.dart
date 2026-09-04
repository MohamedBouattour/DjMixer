class Track {
  final String id;
  final String title;
  final String artist;
  final String album;
  final Duration duration;
  final double bpm;
  final String key;
  final String camelot;
  final List<double> waveformPeaks;
  final String? assetPath;
  final String? filePath;
  final String? streamUrl;

  const Track({
    required this.id,
    required this.title,
    required this.artist,
    this.album = 'Single',
    required this.duration,
    required this.bpm,
    required this.key,
    required this.camelot,
    required this.waveformPeaks,
    this.assetPath,
    this.filePath,
    this.streamUrl,
  });

  /// Factory helper to generate synthetic waveform peaks if audio is not pre-analyzed
  static List<double> generateMockPeaks(int count) {
    return List.generate(count, (i) {
      final t = i / count;
      final bass = (0.5 * (1.0 + (i % 4 == 0 ? 0.8 : 0.0))).clamp(0.1, 1.0);
      final envelope = 0.4 + 0.5 * (1.0 - (t - 0.5).abs() * 1.5);
      return (bass * envelope).clamp(0.1, 1.0);
    });
  }
}
