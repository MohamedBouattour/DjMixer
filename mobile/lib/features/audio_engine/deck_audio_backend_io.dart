import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

import 'deck_audio_backend.dart';
import 'waveform_analyzer.dart';

DeckAudioBackend createBackend(String deckId) => NativeDeckAudioBackend(deckId);

/// `audioplayers`-based fallback for the native platforms.
///
/// It cannot scrub sample-accurately or expose PCM, so scratching is
/// approximated with playback-rate changes and the waveform stays synthetic.
class NativeDeckAudioBackend implements DeckAudioBackend {
  final String deckId;
  final AudioPlayer _player = AudioPlayer();

  Source? _source;
  Duration _duration = Duration.zero;
  Duration _position = Duration.zero;
  bool _playing = false;
  double _rate = 1.0;
  bool _scratching = false;

  NativeDeckAudioBackend(this.deckId) {
    _player.onDurationChanged.listen((d) => _duration = d);
    _player.onPositionChanged.listen((p) => _position = p);
    _player.onPlayerComplete.listen((_) => _playing = false);
  }

  @override
  bool get isSampleAccurate => false;

  @override
  bool get isLoaded => _source != null;

  @override
  bool get isPlaying => _playing;

  @override
  Duration get position => _position;

  @override
  Duration get duration => _duration;

  @override
  WaveformData? get waveform => null;

  @override
  Future<void> unlock() async {}

  @override
  Future<void> load(AudioSourceSpec spec) async {
    if (spec.isEmpty) {
      throw ArgumentError('No audio source given for deck $deckId');
    }
    await _player.stop();

    final Source source;
    if (spec.assetPath != null) {
      source = AssetSource(spec.assetPath!.replaceFirst('assets/', ''));
    } else if (spec.filePath != null) {
      source = DeviceFileSource(spec.filePath!);
    } else {
      source = UrlSource(spec.url!);
    }

    await _player.setSource(source);
    _source = source;
    _position = Duration.zero;
    _playing = false;
  }

  @override
  Future<void> play() async {
    final source = _source;
    if (source == null) throw StateError('Deck $deckId has no track loaded');
    await _player.resume();
    await _player.setPlaybackRate(_rate);
    _playing = true;
  }

  @override
  Future<void> pause() async {
    await _player.pause();
    _playing = false;
  }

  @override
  Future<void> seek(Duration to) async {
    _position = to;
    await _player.seek(to);
  }

  @override
  void setRate(double rate) {
    _rate = rate;
    if (_scratching) return;
    _player.setPlaybackRate(rate).catchError((Object e) {
      debugPrint('setPlaybackRate failed: $e');
    });
  }

  @override
  void setVolume(double volume) {
    _player.setVolume(volume.clamp(0.0, 1.0));
  }

  @override
  void setEq({required double low, required double mid, required double high}) {
    // No EQ on the native fallback.
  }

  @override
  void setFilter(double position) {}

  @override
  void beginScratch() => _scratching = true;

  @override
  void scratchTo(double rate) {
    // Only forward playback is possible here; clamp away the reverse half.
    _player
        .setPlaybackRate(rate.abs().clamp(0.06, 4.0))
        .catchError((Object _) {});
  }

  @override
  void endScratch() {
    _scratching = false;
    _player.setPlaybackRate(_rate).catchError((Object _) {});
  }

  @override
  void setLoop(Duration? start, Duration? end) {}

  @override
  void dispose() {
    _player.dispose();
  }
}

void setMasterVolume(double v) {}
