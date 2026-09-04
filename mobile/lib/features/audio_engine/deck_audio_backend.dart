import 'waveform_analyzer.dart';

import 'deck_audio_backend_io.dart'
    if (dart.library.js_interop) 'deck_audio_backend_web.dart' as impl;

/// Where a deck's audio comes from.
class AudioSourceSpec {
  /// Bundled asset, e.g. `assets/audio/track_a_demo.mp3`.
  final String? assetPath;

  /// Absolute or relative URL, e.g. the YouTube-to-MP3 proxy endpoint.
  final String? url;

  /// Local file path (native platforms only).
  final String? filePath;

  const AudioSourceSpec({this.assetPath, this.url, this.filePath});

  bool get isEmpty => assetPath == null && url == null && filePath == null;
}

/// One deck's audio output.
///
/// The web implementation decodes the whole track up front, which gives three
/// things the previous `audioplayers` setup could not: a real playback clock,
/// PCM for Mixxx-style waveform analysis, and sample-accurate scrubbing for
/// scratching.
abstract class DeckAudioBackend {
  /// True when this backend can report a real playback position and waveform.
  /// The native fallback cannot, so the UI keeps its own clock there.
  bool get isSampleAccurate;

  bool get isLoaded;
  bool get isPlaying;

  /// Real playback position, driven by the audio clock.
  Duration get position;
  Duration get duration;

  /// Mixxx-style banded waveform of the loaded track, once analysis finishes.
  WaveformData? get waveform;

  /// Decodes [spec] and prepares it for playback. Throws on failure so callers
  /// can surface the problem instead of silently playing nothing.
  Future<void> load(AudioSourceSpec spec);

  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration position);

  /// Playback speed multiplier (pitch fader).
  void setRate(double rate);

  /// Post-fader channel volume, 0..1.
  void setVolume(double volume);

  /// Three-band EQ, each 0..1 with 0.5 as unity.
  void setEq({required double low, required double mid, required double high});

  /// Combined low/high-pass filter knob, -1..1 with 0 as bypass.
  void setFilter(double position);

  /// Enters scratch mode; playback then follows [scratchTo] exactly.
  void beginScratch();

  /// Sets the instantaneous playback rate while scratching. Negative values
  /// play the track backwards.
  void scratchTo(double rate);

  /// Leaves scratch mode and returns to the pitch-fader rate.
  void endScratch();

  /// Sets or clears an active loop.
  void setLoop(Duration? start, Duration? end);

  /// Called on the first user gesture to satisfy browser autoplay policy.
  Future<void> unlock();

  void dispose();
}

/// Creates the platform's backend. Web gets the Web Audio engine; other
/// platforms get the `audioplayers` fallback.
DeckAudioBackend createDeckAudioBackend(String deckId) =>
    impl.createBackend(deckId);
