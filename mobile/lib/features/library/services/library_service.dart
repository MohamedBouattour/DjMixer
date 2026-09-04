import 'dart:io';
import 'package:file_picker/file_picker.dart';
import '../../deck/models/track.dart';

class LibraryService {
  // Built-in Demo DJ Tracks
  static final List<Track> defaultTracks = [
    Track(
      id: 'demo_track_1',
      title: 'Neon Odyssey (Club VIP)',
      artist: 'Cyberpulse',
      album: 'Sub-Bass Records',
      duration: const Duration(minutes: 3, seconds: 45),
      bpm: 126.0,
      key: 'Am',
      camelot: '8A',
      waveformPeaks: Track.generateMockPeaks(90),
      assetPath: 'assets/audio/track_a_demo.mp3',
    ),
    Track(
      id: 'demo_track_2',
      title: 'Solar Flare (Festival Tech Mix)',
      artist: 'Apex Kinetic',
      album: 'Horizon Euphoria',
      duration: const Duration(minutes: 4, seconds: 15),
      bpm: 128.0,
      key: 'Em',
      camelot: '9A',
      waveformPeaks: Track.generateMockPeaks(90),
      assetPath: 'assets/audio/track_b_demo.mp3',
    ),
    Track(
      id: 'demo_track_3',
      title: 'Velocity Rush (Peak-Time Techno)',
      artist: 'Sub Zero',
      album: 'Warehouse 99',
      duration: const Duration(minutes: 3, seconds: 20),
      bpm: 134.0,
      key: 'Fm',
      camelot: '4A',
      waveformPeaks: Track.generateMockPeaks(90),
      assetPath: 'assets/audio/track_a_demo.mp3',
    ),
    Track(
      id: 'demo_track_4',
      title: 'Liquid Deep (Sunset Chill)',
      artist: 'Aura Sound',
      album: 'Ibiza Sessions',
      duration: const Duration(minutes: 4, seconds: 50),
      bpm: 122.0,
      key: 'C',
      camelot: '8B',
      waveformPeaks: Track.generateMockPeaks(90),
      assetPath: 'assets/audio/track_b_demo.mp3',
    ),
  ];

  /// Picks local audio files from device storage (MP3, WAV, FLAC, AAC, AIFF)
  static Future<Track?> pickLocalTrack() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['mp3', 'wav', 'flac', 'aac', 'aiff', 'm4a', 'ogg'],
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        final filename = result.files.single.name;
        final title = filename.replaceAll(RegExp(r'\.[a-zA-Z0-9]+$'), '');

        return Track(
          id: 'local_${DateTime.now().millisecondsSinceEpoch}',
          title: title,
          artist: 'Local File',
          album: 'Device Music',
          duration: const Duration(minutes: 3, seconds: 30),
          bpm: 128.0,
          key: 'Am',
          camelot: '8A',
          waveformPeaks: Track.generateMockPeaks(80),
          filePath: file.path,
        );
      }
    } catch (e) {
      // Handle file picker cancellation or permission
    }
    return null;
  }
}
