import 'dart:async';
import 'dart:js_interop';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

import 'deck_audio_backend.dart';
import 'waveform_analyzer.dart';

DeckAudioBackend createBackend(String deckId) => WebDeckAudioBackend(deckId);

/// Process-wide Web Audio graph shared by every deck.
///
/// Browsers start an AudioContext suspended until a user gesture, and Safari
/// limits how many contexts a page may create, so there is exactly one.
class _AudioGraph {
  static _AudioGraph? _instance;
  static _AudioGraph get instance => _instance ??= _AudioGraph._();

  _AudioGraph._();

  web.AudioContext? _ctx;
  web.GainNode? _master;
  Future<void>? _workletLoad;
  bool workletReady = false;

  web.AudioContext get context {
    final existing = _ctx;
    if (existing != null) return existing;
    final ctx = web.AudioContext();
    final master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    _ctx = ctx;
    _master = master;
    return ctx;
  }

  web.GainNode get master {
    context;
    return _master!;
  }

  void setMasterVolume(double v) {
    master.gain.value = v.clamp(0.0, 1.0);
  }

  /// Loads the scratch worklet once. Safe to await repeatedly.
  Future<void> ensureWorklet() {
    return _workletLoad ??= () async {
      try {
        await context.audioWorklet
            .addModule('dj_scratch_processor.js')
            .toDart;
        workletReady = true;
      } catch (e) {
        // Falls back to AudioBufferSourceNode playback (no reverse scratch).
        debugPrint('AudioWorklet unavailable, using buffer source: $e');
        workletReady = false;
      }
    }();
  }

  /// Resumes the context. Must be called from a user gesture the first time.
  Future<void> resume() async {
    final ctx = context;
    if (ctx.state == 'suspended') {
      try {
        await ctx.resume().toDart;
      } catch (e) {
        debugPrint('AudioContext resume failed: $e');
      }
    }
  }
}

class WebDeckAudioBackend implements DeckAudioBackend {
  final String deckId;

  WebDeckAudioBackend(this.deckId);

  final _graph = _AudioGraph.instance;

  web.AudioBuffer? _buffer;
  WaveformData? _waveform;

  // Graph: source -> eqLow -> eqMid -> eqHigh -> filter -> gain -> master
  web.AudioWorkletNode? _worklet;
  web.AudioBufferSourceNode? _bufferSource;
  web.BiquadFilterNode? _eqLow;
  web.BiquadFilterNode? _eqMid;
  web.BiquadFilterNode? _eqHigh;
  web.BiquadFilterNode? _filter;
  web.GainNode? _gain;

  bool _playing = false;
  bool _scratching = false;
  double _rate = 1.0;
  double _volume = 1.0;

  /// Playhead in frames, kept up to date by the worklet.
  double _positionFrames = 0.0;

  /// For the buffer-source fallback: context time when playback started and the
  /// frame offset it started from.
  double _fallbackStartCtxTime = 0.0;
  double _fallbackStartFrame = 0.0;

  double get _sampleRate => _buffer?.sampleRate ?? 44100.0;

  @override
  bool get isSampleAccurate => true;

  @override
  bool get isLoaded => _buffer != null;

  @override
  bool get isPlaying => _playing;

  @override
  WaveformData? get waveform => _waveform;

  void Function()? _onWaveformReady;

  @override
  set onWaveformReady(void Function()? callback) => _onWaveformReady = callback;

  @override
  Duration get duration {
    final b = _buffer;
    if (b == null) return Duration.zero;
    return Duration(microseconds: (b.duration * 1e6).round());
  }

  @override
  Duration get position {
    final b = _buffer;
    if (b == null) return Duration.zero;
    var frames = _positionFrames;
    if (_playing && !_graph.workletReady) {
      // Fallback path derives position from the context clock.
      final elapsed = _graph.context.currentTime - _fallbackStartCtxTime;
      frames = _fallbackStartFrame + elapsed * _sampleRate * _rate;
    }
    final clamped = frames.clamp(0.0, b.length.toDouble());
    return Duration(microseconds: (clamped / _sampleRate * 1e6).round());
  }

  @override
  Future<void> unlock() async {
    await _graph.resume();
    await _graph.ensureWorklet();
  }

  @override
  Future<void> load(AudioSourceSpec spec) async {
    if (spec.isEmpty) {
      throw ArgumentError('No audio source given for deck $deckId');
    }

    await _graph.ensureWorklet();

    final url = _resolveUrl(spec);
    final response = await web.window.fetch(url.toJS).toDart;
    if (!response.ok) {
      throw StateError('Failed to fetch $url (HTTP ${response.status})');
    }
    final bytes = await response.arrayBuffer().toDart;

    final buffer = await _graph.context.decodeAudioData(bytes).toDart;

    _teardownSource();
    _buffer = buffer;
    _positionFrames = 0.0;
    _playing = false;

    _buildGraph();
    _pushBufferToWorklet();

    // Analyze off the critical path so the deck is playable immediately.
    unawaited(_analyze(buffer));
  }

  String _resolveUrl(AudioSourceSpec spec) {
    if (spec.url != null) return spec.url!;
    if (spec.assetPath != null) {
      // Flutter web serves declared assets under assets/<declared path>.
      final p = spec.assetPath!;
      return p.startsWith('assets/') ? 'assets/$p' : 'assets/assets/$p';
    }
    // Blob/object URLs picked on web arrive as filePath.
    return spec.filePath!;
  }

  Future<void> _analyze(web.AudioBuffer buffer) async {
    try {
      final left = buffer.getChannelData(0).toDart;
      final right = buffer.numberOfChannels > 1
          ? buffer.getChannelData(1).toDart
          : null;
      final data = WaveformAnalyzer.analyze(
        left: Float32List.view(left.buffer, left.offsetInBytes, left.length),
        right: right == null
            ? null
            : Float32List.view(
                right.buffer, right.offsetInBytes, right.length),
        sampleRate: buffer.sampleRate,
      );
      if (_buffer == buffer) {
        _waveform = data;
        _onWaveformReady?.call();
      }
    } catch (e) {
      debugPrint('Waveform analysis failed on deck $deckId: $e');
    }
  }

  void _buildGraph() {
    final ctx = _graph.context;
    if (_gain != null) return;

    final eqLow = ctx.createBiquadFilter()
      ..type = 'lowshelf'
      ..frequency.value = WaveformAnalyzer.kLowMidFreqHz;
    final eqMid = ctx.createBiquadFilter()
      ..type = 'peaking'
      ..frequency.value = 1500
      ..Q.value = 0.8;
    final eqHigh = ctx.createBiquadFilter()
      ..type = 'highshelf'
      ..frequency.value = WaveformAnalyzer.kMidHighFreqHz;
    final filter = ctx.createBiquadFilter()
      ..type = 'lowpass'
      ..frequency.value = 22050;
    final gain = ctx.createGain()..gain.value = _volume;

    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(filter);
    filter.connect(gain);
    gain.connect(_graph.master);

    _eqLow = eqLow;
    _eqMid = eqMid;
    _eqHigh = eqHigh;
    _filter = filter;
    _gain = gain;
  }

  void _pushBufferToWorklet() {
    final buffer = _buffer;
    if (buffer == null) return;

    if (!_graph.workletReady) return;

    final node = _worklet ??= _createWorklet();
    if (node == null) return;

    final channels = <JSAny>[];
    for (var c = 0; c < math.min(2, buffer.numberOfChannels); c++) {
      channels.add(buffer.getChannelData(c).toDart.buffer.toJS);
    }
    node.port.postMessage(
      {
        'type': 'load',
        'channels': channels,
        'sampleRate': buffer.sampleRate,
      }.jsify(),
    );
    // 'load' resets the worklet's playhead, so it must only ever be sent once
    // per track — re-sending it on play would jump back to the start.
    _workletHasBuffer = true;
  }

  web.AudioWorkletNode? _createWorklet() {
    try {
      final options = web.AudioWorkletNodeOptions(
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2].jsify() as JSArray<JSNumber>,
      );
      final node = web.AudioWorkletNode(
        _graph.context,
        'dj-deck-processor',
        options,
      );
      node.port.onmessage = ((web.MessageEvent e) {
        final data = e.data.dartify();
        if (data is Map && data['type'] == 'pos') {
          _positionFrames = (data['frame'] as num).toDouble();
          final playing = data['playing'] == true;
          if (!playing && _playing && !_scratching) {
            _playing = false;
            if (_positionFrames >= (_buffer?.length ?? 1) - 1 || _positionFrames == 0.0) {
              _positionFrames = 0.0;
            }
          }
        }
      }).toJS;
      node.connect(_eqLow!);
      return node;
    } catch (e) {
      debugPrint('Failed to create deck worklet: $e');
      return null;
    }
  }

  @override
  Future<void> play() async {
    if (_buffer == null) throw StateError('Deck $deckId has no track loaded');
    await _graph.resume();

    if (_graph.workletReady) {
      _pushBufferToWorkletIfNeeded();
      _worklet?.port.postMessage({'type': 'play'}.jsify());
      _worklet?.port.postMessage({'type': 'rate', 'rate': _rate}.jsify());
    } else {
      _startBufferSource();
    }
    _playing = true;
  }

  bool _workletHasBuffer = false;

  void _pushBufferToWorkletIfNeeded() {
    if (_workletHasBuffer && _worklet != null) return;
    _pushBufferToWorklet();
  }

  void _startBufferSource() {
    final buffer = _buffer;
    if (buffer == null) return;
    _stopBufferSource();
    final ctx = _graph.context;
    final src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = _rate.abs().clamp(0.06, 4.0);
    src.connect(_eqLow!);
    final offsetSec = _positionFrames / _sampleRate;
    src.onended = ((web.Event e) {
      if (_bufferSource == src) {
        _playing = false;
        _positionFrames = 0.0;
        _bufferSource = null;
      }
    }).toJS;
    src.start(0, offsetSec);
    _bufferSource = src;
    _fallbackStartCtxTime = ctx.currentTime.toDouble();
    _fallbackStartFrame = _positionFrames;
  }

  void _stopBufferSource() {
    final src = _bufferSource;
    if (src == null) return;
    try {
      src.stop();
      src.disconnect();
    } catch (_) {
      // Already stopped.
    }
    _bufferSource = null;
  }

  @override
  Future<void> pause() async {
    if (_graph.workletReady) {
      _worklet?.port.postMessage({'type': 'pause'}.jsify());
    } else {
      _positionFrames = position.inMicroseconds / 1e6 * _sampleRate;
      _stopBufferSource();
    }
    _playing = false;
  }

  @override
  Future<void> seek(Duration to) async {
    final frame = (to.inMicroseconds / 1e6 * _sampleRate)
        .clamp(0.0, (_buffer?.length ?? 0).toDouble());
    _positionFrames = frame;
    if (_graph.workletReady) {
      _worklet?.port.postMessage({'type': 'seek', 'frame': frame}.jsify());
    } else if (_playing) {
      _startBufferSource();
    }
  }

  @override
  void setRate(double rate) {
    _rate = rate;
    if (_scratching) return;
    if (_graph.workletReady) {
      _worklet?.port.postMessage({'type': 'rate', 'rate': rate}.jsify());
    } else {
      _bufferSource?.playbackRate.value = rate.abs().clamp(0.06, 4.0);
    }
  }

  @override
  void setVolume(double volume) {
    _volume = volume.clamp(0.0, 1.0);
    _gain?.gain.value = _volume;
  }

  @override
  void setEq({required double low, required double mid, required double high}) {
    _eqLow?.gain.value = eqKnobToDb(low);
    _eqMid?.gain.value = eqKnobToDb(mid);
    _eqHigh?.gain.value = eqKnobToDb(high);
  }

  @override
  void setFilter(double position) {
    final f = _filter;
    if (f == null) return;
    final p = position.clamp(-1.0, 1.0);
    const nyquist = 22050.0;
    if (p.abs() < 0.02) {
      f.type = 'lowpass';
      f.frequency.value = nyquist;
      f.Q.value = 0.0001;
      return;
    }
    // Exponential sweep so the knob feels musical across its travel.
    if (p < 0) {
      f.type = 'lowpass';
      f.frequency.value = 20000 * math.pow(0.0015, -p).toDouble();
    } else {
      f.type = 'highpass';
      f.frequency.value = 20 * math.pow(500.0, p).toDouble();
    }
    f.Q.value = 1.0 + p.abs() * 6.0;
  }

  @override
  void beginScratch() {
    _scratching = true;
    if (_graph.workletReady) {
      _worklet?.port
          .postMessage({'type': 'scratch', 'active': true, 'rate': 0.0}.jsify());
      // Scratching audibly needs the processor running even when paused.
      _worklet?.port.postMessage({'type': 'play'}.jsify());
    }
  }

  @override
  void scratchTo(double rate) {
    if (!_scratching) return;
    if (_graph.workletReady) {
      _worklet?.port.postMessage(
          {'type': 'scratch', 'active': true, 'rate': rate}.jsify());
    } else {
      // Without the worklet, approximate by nudging the rate forward only.
      _bufferSource?.playbackRate.value = rate.abs().clamp(0.06, 4.0);
    }
  }

  @override
  void endScratch() {
    _scratching = false;
    if (_graph.workletReady) {
      _worklet?.port.postMessage(
          {'type': 'scratch', 'active': false, 'rate': _rate}.jsify());
      _worklet?.port.postMessage({'type': 'rate', 'rate': _rate}.jsify());
      if (!_playing) {
        _worklet?.port.postMessage({'type': 'pause'}.jsify());
      }
    }
  }

  @override
  void setLoop(Duration? start, Duration? end) {
    if (!_graph.workletReady) return;
    if (start == null || end == null) {
      _worklet?.port
          .postMessage({'type': 'loop', 'start': -1, 'end': -1}.jsify());
      return;
    }
    _worklet?.port.postMessage({
      'type': 'loop',
      'start': start.inMicroseconds / 1e6 * _sampleRate,
      'end': end.inMicroseconds / 1e6 * _sampleRate,
    }.jsify());
  }

  void _teardownSource() {
    _stopBufferSource();
    _workletHasBuffer = false;
    _playing = false;
  }

  @override
  void dispose() {
    _teardownSource();
    try {
      _worklet?.port.postMessage({'type': 'unload'}.jsify());
      _worklet?.disconnect();
      _gain?.disconnect();
    } catch (_) {
      // Context may already be closed.
    }
    _worklet = null;
    _buffer = null;
    _waveform = null;
  }
}

/// Sets the shared master output level.
void setMasterVolume(double v) => _AudioGraph.instance.setMasterVolume(v);
