import 'dart:async';
import 'dart:io' show Platform;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'deck_audio_backend.dart';
import 'waveform_analyzer.dart';

/// iOS gets the native AVAudioEngine deck (real scratching, EQ and waveforms).
/// Other platforms fall back to `audioplayers`.
DeckAudioBackend createBackend(String deckId) {
  if (Platform.isIOS) return NativeDeckAudioBackend(deckId);
  return AudioPlayersDeckBackend(deckId);
}

void setMasterVolume(double v) {}

/// Runs off the UI isolate — analyzing a few minutes of audio is tens of
/// millions of filter steps and would drop frames on the main thread.
WaveformData _analyzeInIsolate(List<Object> input) {
  return WaveformAnalyzer.analyze(
    left: input[0] as Float32List,
    sampleRate: input[1] as double,
  );
}

/// Talks to `DeckAudioPlugin.swift`, which renders each deck from decoded PCM
/// with its own playhead — the native counterpart of the web AudioWorklet.
class NativeDeckAudioBackend implements DeckAudioBackend {
  final String deckId;

  static const MethodChannel _channel = MethodChannel('dj_pro_master/audio');
  static const EventChannel _positions =
      EventChannel('dj_pro_master/audio/position');

  /// One position stream feeds every deck.
  static StreamSubscription<dynamic>? _positionSub;
  static final Map<String, Duration> _positionByDeck = {};
  static final Map<String, bool> _playingByDeck = {};

  NativeDeckAudioBackend(this.deckId) {
    _positionSub ??= _positions.receiveBroadcastStream().listen(
      (event) {
        if (event is! Map) return;
        for (final entry in event.entries) {
          final data = entry.value;
          if (data is! Map) continue;
          final ms = (data['ms'] as num?)?.toDouble() ?? 0;
          _positionByDeck['${entry.key}'] =
              Duration(microseconds: (ms * 1000).round());
          _playingByDeck['${entry.key}'] = data['playing'] == true;
        }
      },
      onError: (Object e) => debugPrint('Deck position stream error: $e'),
    );
  }

  WaveformData? _waveform;
  void Function()? _onWaveformReady;
  Duration _duration = Duration.zero;
  bool _loaded = false;

  @override
  bool get isSampleAccurate => true;

  @override
  bool get isLoaded => _loaded;

  @override
  bool get isPlaying => _playingByDeck[deckId] ?? false;

  @override
  Duration get position => _positionByDeck[deckId] ?? Duration.zero;

  @override
  Duration get duration => _duration;

  @override
  WaveformData? get waveform => _waveform;

  @override
  set onWaveformReady(void Function()? callback) => _onWaveformReady = callback;

  Map<String, dynamic> _args([Map<String, dynamic> extra = const {}]) =>
      {'deckId': deckId, ...extra};

  @override
  Future<void> unlock() async {}

  @override
  Future<void> load(AudioSourceSpec spec) async {
    if (spec.isEmpty) {
      throw ArgumentError('No audio source given for deck $deckId');
    }

    final result = await _channel.invokeMapMethod<String, dynamic>(
      'load',
      _args({
        'assetPath': spec.assetPath,
        'filePath': spec.filePath,
        'url': spec.url,
      }),
    );
    if (result == null) throw StateError('Deck $deckId got no audio back');

    _duration = Duration(
      microseconds: ((result['durationMs'] as num).toDouble() * 1000).round(),
    );
    _loaded = true;
    _waveform = null;

    final pcm = result['pcm'];
    final analysisRate = (result['analysisSampleRate'] as num?)?.toDouble();
    if (pcm is Float32List && analysisRate != null && pcm.isNotEmpty) {
      unawaited(_analyze(pcm, analysisRate));
    }
  }

  Future<void> _analyze(Float32List samples, double sampleRate) async {
    try {
      _waveform = await compute(_analyzeInIsolate, <Object>[samples, sampleRate]);
      _onWaveformReady?.call();
    } catch (e) {
      debugPrint('Waveform analysis failed on deck $deckId: $e');
    }
  }

  @override
  Future<void> play() async {
    if (!_loaded) throw StateError('Deck $deckId has no track loaded');
    await _channel.invokeMethod<void>('play', _args());
    _playingByDeck[deckId] = true;
  }

  @override
  Future<void> pause() async {
    await _channel.invokeMethod<void>('pause', _args());
    _playingByDeck[deckId] = false;
  }

  @override
  Future<void> seek(Duration to) async {
    _positionByDeck[deckId] = to;
    await _channel.invokeMethod<void>(
      'seek',
      _args({'ms': to.inMicroseconds / 1000.0}),
    );
  }

  void _fire(String method, [Map<String, dynamic> extra = const {}]) {
    _channel
        .invokeMethod<void>(method, _args(extra))
        .catchError((Object e) => debugPrint('$method failed on $deckId: $e'));
  }

  @override
  void setRate(double rate) => _fire('setRate', {'rate': rate});

  @override
  void setVolume(double volume) =>
      _fire('setVolume', {'volume': volume.clamp(0.0, 1.0)});

  @override
  void setEq({required double low, required double mid, required double high}) {
    _fire('setEq', {
      'low': eqKnobToDb(low),
      'mid': eqKnobToDb(mid),
      'high': eqKnobToDb(high),
    });
  }

  @override
  void setFilter(double position) => _fire('setFilter', {'position': position});

  @override
  void beginScratch() => _fire('beginScratch');

  @override
  void scratchTo(double rate) => _fire('scratchTo', {'rate': rate});

  @override
  void endScratch() => _fire('endScratch', {'rate': 1.0, 'resume': isPlaying});

  @override
  void setLoop(Duration? start, Duration? end) {
    _fire('setLoop', {
      'startMs': start == null ? null : start.inMicroseconds / 1000.0,
      'endMs': end == null ? null : end.inMicroseconds / 1000.0,
    });
  }

  @override
  void dispose() => _fire('dispose');
}

/// `audioplayers` fallback for platforms without a native engine.
///
/// It cannot scrub sample-accurately or expose PCM, so scratching is
/// approximated with playback-rate changes and the waveform stays synthetic.
class AudioPlayersDeckBackend implements DeckAudioBackend {
  final String deckId;
  final AudioPlayer _player = AudioPlayer();

  Source? _source;
  Duration _duration = Duration.zero;
  Duration _position = Duration.zero;
  bool _playing = false;
  double _rate = 1.0;
  bool _scratching = false;

  AudioPlayersDeckBackend(this.deckId) {
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
  set onWaveformReady(void Function()? callback) {}

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
    // No EQ on the fallback.
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
