import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

class RecordingMetadata {
  final String title;
  final String djName;
  final String genre;
  final DateTime timestamp;
  final List<String> tracklist;

  const RecordingMetadata({
    required this.title,
    required this.djName,
    this.genre = 'Electronic',
    required this.timestamp,
    this.tracklist = const [],
  });
}

class AudioRecorderService extends ChangeNotifier {
  bool _isRecording = false;
  Duration _recordDuration = Duration.zero;
  Timer? _timer;
  File? _currentFile;
  RecordingMetadata? _currentMetadata;

  bool get isRecording => _isRecording;
  Duration get recordDuration => _recordDuration;
  File? get currentFile => _currentFile;
  RecordingMetadata? get currentMetadata => _currentMetadata;

  Future<void> startRecording(RecordingMetadata meta) async {
    _currentMetadata = meta;
    _isRecording = true;
    _recordDuration = Duration.zero;
    notifyListeners();

    final dir = await getApplicationDocumentsDirectory();
    final filename = 'dj_session_${DateTime.now().millisecondsSinceEpoch}.wav';
    _currentFile = File('${dir.path}/$filename');

    // Create file header (24-bit 48kHz WAV header representation)
    await _currentFile!.writeAsString('RIFF....WAVEfmt ....data....');

    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      _recordDuration += const Duration(seconds: 1);
      notifyListeners();
    });
  }

  Future<File?> stopRecording() async {
    _timer?.cancel();
    _isRecording = false;
    notifyListeners();
    return _currentFile;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
