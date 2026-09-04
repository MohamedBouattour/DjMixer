import 'dart:async';
import 'dart:math' as math;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import '../deck/models/deck_state.dart';
import '../deck/models/track.dart';
import '../mixer/models/mixer_state.dart';
import '../../core/components/crossfader_slider.dart';
import '../../core/widgets/jog_wheel_widget.dart';
import '../../core/widgets/xy_touch_fx_pad.dart';
import 'beat_grid_detector.dart';
import 'deck_audio_backend.dart';
import 'waveform_analyzer.dart';
import 'split_cue_router.dart';
import 'stem_separator_dsp.dart';
import 'time_stretcher.dart';

class AudioEngineController extends ChangeNotifier {
  // Dual Deck States
  DeckState _deckA = const DeckState(deckId: 'A', isMaster: true);
  DeckState _deckB = const DeckState(deckId: 'B');
  MixerState _mixer = const MixerState();
  final SplitCueRouter _splitRouter = SplitCueRouter();

  // XY FX State
  FXType _selectedFx = FXType.filter;
  double _fxX = 0.5;
  double _fxY = 0.0;
  bool _isFxHold = false;
  bool _isFxTouched = false;

  // Sampler State
  int _samplerBank = 0;
  double _samplerVolume = 0.9;
  int _samplerPitchSemitones = 0;

  // Real audio backends. On web these decode the track up front, which gives
  // a true playback clock, PCM for waveform analysis and sample-accurate
  // scrubbing for scratching.
  final DeckAudioBackend _backendA = createDeckAudioBackend('A');
  final DeckAudioBackend _backendB = createDeckAudioBackend('B');
  final AudioPlayer _samplerPlayer = AudioPlayer();

  /// Set when an audio operation fails, so the UI can say so instead of
  /// silently running a mute transport.
  String? _lastAudioError;

  /// Browsers only allow audio to start from a user gesture; the first
  /// transport action unlocks the shared AudioContext.
  bool _unlocked = false;

  /// Decks currently fetching/decoding audio.
  final Set<String> _loadingDecks = {};

  /// Timestamp of the previous jog movement, used to derive scratch velocity.
  final Map<String, int> _lastJogMicros = {};

  // Engine clock loop (approx 60fps ~ 16ms tick)
  Timer? _engineTicker;

  // Getters
  DeckState get deckA => _deckA;
  DeckState get deckB => _deckB;
  MixerState get mixer => _mixer;
  SplitCueRouter get splitRouter => _splitRouter;
  FXType get selectedFx => _selectedFx;
  double get fxX => _fxX;
  double get fxY => _fxY;
  bool get isFxHold => _isFxHold;
  bool get isFxTouched => _isFxTouched;
  int get samplerBank => _samplerBank;
  double get samplerVolume => _samplerVolume;
  int get samplerPitchSemitones => _samplerPitchSemitones;
  String? get lastAudioError => _lastAudioError;

  bool isDeckLoading(String deckId) => _loadingDecks.contains(deckId);

  DeckAudioBackend backendFor(String deckId) =>
      deckId == 'A' ? _backendA : _backendB;

  /// Mixxx-style banded waveform for a deck, once analysis has finished.
  WaveformData? waveformFor(String deckId) => backendFor(deckId).waveform;

  AudioEngineController() {
    _initEngine();
  }

  void _initEngine() {
    // Analysis finishes after the track is already playable, so repaint the
    // waveforms when it lands.
    _backendA.onWaveformReady = notifyListeners;
    _backendB.onWaveformReady = notifyListeners;
    // Start high-performance audio coordinator loop
    _engineTicker = Timer.periodic(const Duration(milliseconds: 16), _onEngineTick);
  }

  // --- Deck Transport Controls ---

  Future<void> loadTrack(String deckId, Track track) async {
    final isA = deckId == 'A';

    // Show the track on the deck straight away so the UI never stalls on I/O.
    if (isA) {
      _deckA = _deckA.copyWith(
        track: track,
        position: Duration.zero,
        slipPosition: Duration.zero,
        isPlaying: false,
        cuePoint: Duration.zero,
        hotCues: {},
      );
    } else {
      _deckB = _deckB.copyWith(
        track: track,
        position: Duration.zero,
        slipPosition: Duration.zero,
        isPlaying: false,
        cuePoint: Duration.zero,
        hotCues: {},
      );
    }
    _lastAudioError = null;
    _loadingDecks.add(deckId);
    notifyListeners();

    final backend = backendFor(deckId);
    try {
      await backend.load(AudioSourceSpec(
        assetPath: track.assetPath,
        url: track.streamUrl,
        filePath: track.filePath,
      ));
      _applyDeckMixing(deckId);
      _syncTrackDuration(deckId);
    } catch (e) {
      // A deck that failed to load must say so; the old code swallowed this
      // and left a transport that moved but made no sound.
      _lastAudioError = 'Deck $deckId could not load "${track.title}": $e';
      debugPrint(_lastAudioError);
    } finally {
      _loadingDecks.remove(deckId);
    }
    notifyListeners();
  }

  /// Replaces the placeholder duration with the decoded track's real length.
  void _syncTrackDuration(String deckId) {
    final backend = backendFor(deckId);
    if (!backend.isSampleAccurate) return;
    final real = backend.duration;
    if (real <= Duration.zero) return;
    final deck = deckId == 'A' ? _deckA : _deckB;
    final track = deck.track;
    if (track == null) return;
    final updated = track.copyWith(duration: real);
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(track: updated);
    } else {
      _deckB = _deckB.copyWith(track: updated);
    }
  }

  /// Makes sure the browser audio graph is running. Must be reached from a
  /// user gesture the first time.
  Future<void> _ensureUnlocked() async {
    if (_unlocked) return;
    _unlocked = true;
    await Future.wait([_backendA.unlock(), _backendB.unlock()]);
    _updatePlaybackVolumes();
  }

  Future<void> togglePlay(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = backendFor(deckId);

    await _ensureUnlocked();

    if (deck.isPlaying) {
      if (isA) {
        _deckA = _deckA.copyWith(isPlaying: false);
      } else {
        _deckB = _deckB.copyWith(isPlaying: false);
      }
      notifyListeners();
      try {
        await backend.pause();
      } catch (e) {
        debugPrint('Deck $deckId pause failed: $e');
      }
      return;
    }

    // Optimistic so the transport feels instant, then reverted if audio fails.
    if (isA) {
      _deckA = _deckA.copyWith(isPlaying: true, isCued: false);
    } else {
      _deckB = _deckB.copyWith(isPlaying: true, isCued: false);
    }
    _lastAudioError = null;
    notifyListeners();

    try {
      _applyDeckMixing(deckId);
      backend.setRate(deck.effectiveSpeedMultiplier);
      if (deck.position > Duration.zero) {
        await backend.seek(deck.position);
      }
      await backend.play();
    } catch (e) {
      _lastAudioError = 'Deck $deckId could not play: $e';
      debugPrint(_lastAudioError);
      if (isA) {
        _deckA = _deckA.copyWith(isPlaying: false);
      } else {
        _deckB = _deckB.copyWith(isPlaying: false);
      }
    }
    notifyListeners();
  }

  /// Seeks a deck to a fraction (0..1) of the loaded track.
  Future<void> seekToFraction(String deckId, double fraction) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final total = deck.track?.duration ?? Duration.zero;
    if (total <= Duration.zero) return;

    final target = Duration(
      microseconds:
          (total.inMicroseconds * fraction.clamp(0.0, 1.0)).round(),
    );
    if (isA) {
      _deckA = _deckA.copyWith(position: target, slipPosition: target);
    } else {
      _deckB = _deckB.copyWith(position: target, slipPosition: target);
    }
    notifyListeners();
    try {
      await backendFor(deckId).seek(target);
    } catch (e) {
      debugPrint('Deck $deckId seek failed: $e');
    }
  }

  /// Pioneer-style Stutter Cue:
  /// When paused: sets current position as cue point
  /// When playing: pauses and jumps back to cue point
  Future<void> stutterCue(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = isA ? _backendA : _backendB;

    if (!deck.isPlaying) {
      // Set new cue point at current position
      final newCue = deck.position;
      if (isA) {
        _deckA = _deckA.copyWith(cuePoint: newCue);
      } else {
        _deckB = _deckB.copyWith(cuePoint: newCue);
      }
    } else {
      // Return to cue point and pause
      final target = deck.cuePoint ?? Duration.zero;
      if (isA) {
        _deckA = _deckA.copyWith(isPlaying: false, position: target);
      } else {
        _deckB = _deckB.copyWith(isPlaying: false, position: target);
      }
      try {
        await backend.pause();
        await backend.seek(target);
      } catch (e) {
        debugPrint('stutterCue player error: $e');
      }
    }
    notifyListeners();
  }

  /// Temporary Cue (CUP): Auditions cue point while held
  Future<void> tempCueDown(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = isA ? _backendA : _backendB;
    final target = deck.cuePoint ?? Duration.zero;

    if (isA) {
      _deckA = _deckA.copyWith(isPlaying: true, position: target);
    } else {
      _deckB = _deckB.copyWith(isPlaying: true, position: target);
    }
    notifyListeners();

    try {
      await backend.seek(target);
      await backend.play();
    } catch (e) {
      debugPrint('tempCueDown player error: $e');
    }
  }

  Future<void> tempCueUp(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = isA ? _backendA : _backendB;
    final target = deck.cuePoint ?? Duration.zero;

    if (isA) {
      _deckA = _deckA.copyWith(isPlaying: false, position: target);
    } else {
      _deckB = _deckB.copyWith(isPlaying: false, position: target);
    }
    notifyListeners();

    try {
      await backend.pause();
      await backend.seek(target);
    } catch (e) {
      debugPrint('tempCueUp player error: $e');
    }
  }

  // --- Pitch & Tempo & Sync ---

  void setPitchPercent(String deckId, double percent) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final clamped = percent.clamp(-deck.pitchRange.percentage, deck.pitchRange.percentage);

    if (isA) {
      _deckA = _deckA.copyWith(pitchPercent: clamped);
      _backendA.setRate(_deckA.effectiveSpeedMultiplier);
    } else {
      _deckB = _deckB.copyWith(pitchPercent: clamped);
      _backendB.setRate(_deckB.effectiveSpeedMultiplier);
    }
    notifyListeners();
  }

  void setPitchRange(String deckId, PitchRange range) {
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(pitchRange: range);
    } else {
      _deckB = _deckB.copyWith(pitchRange: range);
    }
    notifyListeners();
  }

  void toggleKeyLock(String deckId) {
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(isKeyLock: !_deckA.isKeyLock);
    } else {
      _deckB = _deckB.copyWith(isKeyLock: !_deckB.isKeyLock);
    }
    notifyListeners();
  }

  void toggleSlipMode(String deckId) {
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(isSlipMode: !_deckA.isSlipMode);
    } else {
      _deckB = _deckB.copyWith(isSlipMode: !_deckB.isSlipMode);
    }
    notifyListeners();
  }

  /// Beat Sync: matches BPM & phase alignment with master deck
  void triggerBeatSync(String targetDeckId) {
    final isTargetA = targetDeckId == 'A';
    final sourceDeck = isTargetA ? _deckB : _deckA;
    final targetDeck = isTargetA ? _deckA : _deckB;

    if (sourceDeck.track == null || targetDeck.track == null) return;

    // 1. Match BPM
    final targetTargetBpm = sourceDeck.effectiveBpm;
    final speedRatio = targetTargetBpm / targetDeck.track!.bpm;
    final requiredPitchPercent = (speedRatio - 1.0) * 100.0;

    // 2. Align Phase
    final phaseOffsetSec = BeatGridDetector.calculatePhaseOffset(
      currentSecA: _deckA.position.inMilliseconds / 1000.0,
      bpmA: _deckA.effectiveBpm,
      currentSecB: _deckB.position.inMilliseconds / 1000.0,
      bpmB: _deckB.effectiveBpm,
    );

    final backend = isTargetA ? _backendA : _backendB;
    final currentMs = targetDeck.position.inMilliseconds;
    final adjustedTargetMs = (currentMs + (phaseOffsetSec * 1000).toInt()).clamp(0, targetDeck.track!.duration.inMilliseconds);
    backend.seek(Duration(milliseconds: adjustedTargetMs));

    if (isTargetA) {
      _deckA = _deckA.copyWith(
        pitchPercent: requiredPitchPercent.clamp(-_deckA.pitchRange.percentage, _deckA.pitchRange.percentage),
        isSync: true,
      );
      _backendA.setRate(_deckA.effectiveSpeedMultiplier);
    } else {
      _deckB = _deckB.copyWith(
        pitchPercent: requiredPitchPercent.clamp(-_deckB.pitchRange.percentage, _deckB.pitchRange.percentage),
        isSync: true,
      );
      _backendB.setRate(_deckB.effectiveSpeedMultiplier);
    }
    notifyListeners();
  }

  // --- Jog Wheel Touch, Scratch & Physics ---

  void onJogTouchDown(String deckId) {
    final isA = deckId == 'A';
    if (isA) {
      _deckA = _deckA.copyWith(isScratching: true);
    } else {
      _deckB = _deckB.copyWith(isScratching: true);
    }
    _lastJogMicros[deckId] = DateTime.now().microsecondsSinceEpoch;
    // Hand the deck over to the scratch path so the platter drives playback
    // directly, including backwards.
    backendFor(deckId).beginScratch();
    notifyListeners();
  }

  /// Seconds of audio moved by one full revolution of the platter, matching
  /// the feel of a 33 1/3 RPM record (1.8 s per revolution).
  static const double kSecondsPerRevolution = 1.8;

  void onJogMove(String deckId, double angularDelta, bool isCenterTouch) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = backendFor(deckId);

    var newAngle = (deck.jogAngle + angularDelta) % (2 * math.pi);
    if (newAngle < 0) newAngle += 2 * math.pi;

    final now = DateTime.now().microsecondsSinceEpoch;
    final lastMicros = _lastJogMicros[deckId] ?? now;
    // Clamp dt so a stalled frame cannot produce an absurd rate spike.
    final dt = ((now - lastMicros) / 1e6).clamp(0.004, 0.1);
    _lastJogMicros[deckId] = now;

    // Audio time the platter moved during this gesture.
    final scrubSec = (angularDelta / (2 * math.pi)) * kSecondsPerRevolution;

    if (deck.jogMode == JogWheelMode.vinylScratch && isCenterTouch) {
      // Vinyl scratch: the platter velocity *is* the playback rate, so
      // pushing back plays the track backwards like a real record.
      final rate = (scrubSec / dt).clamp(-4.0, 4.0);
      backend.scratchTo(rate);

      final newPosMs = (deck.position.inMilliseconds + (scrubSec * 1000).toInt())
          .clamp(0, deck.track?.duration.inMilliseconds ?? 300000);
      final newPos = Duration(milliseconds: newPosMs);
      if (isA) {
        _deckA = _deckA.copyWith(jogAngle: newAngle, position: newPos);
      } else {
        _deckB = _deckB.copyWith(jogAngle: newAngle, position: newPos);
      }
    } else if (deck.jogMode == JogWheelMode.pitchBend || !isCenterTouch) {
      // Outer ring: temporary pitch bend proportional to how hard it is nudged.
      final bend = (scrubSec / dt).clamp(-1.0, 1.0) * 0.12;
      backend.setRate(
          (deck.effectiveSpeedMultiplier * (1.0 + bend)).clamp(0.1, 2.5));
      if (isA) {
        _deckA = _deckA.copyWith(jogAngle: newAngle);
      } else {
        _deckB = _deckB.copyWith(jogAngle: newAngle);
      }
    } else {
      // CDJ search mode: step through the track in 1/75 s audio frames.
      final frameMs = (angularDelta > 0 ? 13 : -13);
      final newPosMs = (deck.position.inMilliseconds + frameMs)
          .clamp(0, deck.track?.duration.inMilliseconds ?? 300000);
      final newPos = Duration(milliseconds: newPosMs);
      backend.seek(newPos);
      if (isA) {
        _deckA = _deckA.copyWith(jogAngle: newAngle, position: newPos);
      } else {
        _deckB = _deckB.copyWith(jogAngle: newAngle, position: newPos);
      }
    }
    notifyListeners();
  }

  void onJogTouchUp(String deckId, double releaseVelocity) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = backendFor(deckId);

    _lastJogMicros.remove(deckId);
    backend.endScratch();
    backend.setRate(deck.effectiveSpeedMultiplier);

    // Slip mode: the track carries on underneath, so drop back onto the
    // shadow playhead when the hand leaves the platter.
    Duration targetPos = deck.position;
    if (deck.isSlipMode) {
      targetPos = deck.slipPosition;
      backend.seek(targetPos);
    } else if (backend.isSampleAccurate) {
      // Keep the visible position in step with where the scratch left the
      // audio, rather than where the last gesture event happened to land.
      targetPos = backend.position;
    }

    if (!deck.isPlaying) {
      backend.pause();
    }

    if (isA) {
      _deckA = _deckA.copyWith(isScratching: false, position: targetPos);
    } else {
      _deckB = _deckB.copyWith(isScratching: false, position: targetPos);
    }
    notifyListeners();
  }

  // --- Hot Cues ---

  void triggerHotCue(String deckId, int index) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = isA ? _backendA : _backendB;

    if (deck.hotCues.containsKey(index)) {
      // Jump to cue
      final target = deck.hotCues[index]!;
      backend.seek(target);
      if (!deck.isPlaying) {
        backend.play();
      }
      if (isA) {
        _deckA = _deckA.copyWith(position: target, isPlaying: true);
      } else {
        _deckB = _deckB.copyWith(position: target, isPlaying: true);
      }
    } else {
      // Set cue at current position
      final updatedCues = Map<int, Duration>.from(deck.hotCues);
      updatedCues[index] = deck.position;
      if (isA) {
        _deckA = _deckA.copyWith(hotCues: updatedCues);
      } else {
        _deckB = _deckB.copyWith(hotCues: updatedCues);
      }
    }
    notifyListeners();
  }

  void deleteHotCue(String deckId, int index) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final updatedCues = Map<int, Duration>.from(deck.hotCues)..remove(index);
    if (isA) {
      _deckA = _deckA.copyWith(hotCues: updatedCues);
    } else {
      _deckB = _deckB.copyWith(hotCues: updatedCues);
    }
    notifyListeners();
  }

  void toggleDeleteCueMode(String deckId) {
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(isDeleteCueMode: !_deckA.isDeleteCueMode);
    } else {
      _deckB = _deckB.copyWith(isDeleteCueMode: !_deckB.isDeleteCueMode);
    }
    notifyListeners();
  }

  void toggleQuantize(String deckId) {
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(isQuantize: !_deckA.isQuantize);
    } else {
      _deckB = _deckB.copyWith(isQuantize: !_deckB.isQuantize);
    }
    notifyListeners();
  }

  // --- Auto & Manual Looping & Beat Jump ---

  void setLoopLength(String deckId, double beats) {
    if (deckId == 'A') {
      _deckA = _deckA.copyWith(loopLength: beats);
    } else {
      _deckB = _deckB.copyWith(loopLength: beats);
    }
    notifyListeners();
  }

  void toggleLoop(String deckId) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;

    if (deck.isLoopActive) {
      // Deactivate loop
      if (isA) {
        _deckA = _deckA.copyWith(isLoopActive: false, loopStartPosition: null, loopEndPosition: null);
      } else {
        _deckB = _deckB.copyWith(isLoopActive: false, loopStartPosition: null, loopEndPosition: null);
      }
    } else {
      // Activate loop from current position
      final bpm = deck.effectiveBpm;
      final secPerBeat = 60.0 / bpm;
      final loopSec = deck.loopLength * secPerBeat;
      final startPos = deck.position;
      final endPos = startPos + Duration(milliseconds: (loopSec * 1000).toInt());

      if (isA) {
        _deckA = _deckA.copyWith(isLoopActive: true, loopStartPosition: startPos, loopEndPosition: endPos);
      } else {
        _deckB = _deckB.copyWith(isLoopActive: true, loopStartPosition: startPos, loopEndPosition: endPos);
      }
    }
    notifyListeners();
  }

  void halveLoop(String deckId) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final newLength = math.max(0.125, deck.loopLength / 2.0);
    setLoopLength(deckId, newLength);
    if (deck.isLoopActive && deck.loopStartPosition != null) {
      final secPerBeat = 60.0 / deck.effectiveBpm;
      final newEnd = deck.loopStartPosition! + Duration(milliseconds: (newLength * secPerBeat * 1000).toInt());
      if (isA) {
        _deckA = _deckA.copyWith(loopEndPosition: newEnd);
      } else {
        _deckB = _deckB.copyWith(loopEndPosition: newEnd);
      }
    }
    notifyListeners();
  }

  void doubleLoop(String deckId) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final newLength = math.min(32.0, deck.loopLength * 2.0);
    setLoopLength(deckId, newLength);
    if (deck.isLoopActive && deck.loopStartPosition != null) {
      final secPerBeat = 60.0 / deck.effectiveBpm;
      final newEnd = deck.loopStartPosition! + Duration(milliseconds: (newLength * secPerBeat * 1000).toInt());
      if (isA) {
        _deckA = _deckA.copyWith(loopEndPosition: newEnd);
      } else {
        _deckB = _deckB.copyWith(loopEndPosition: newEnd);
      }
    }
    notifyListeners();
  }

  void loopRollStart(String deckId) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final bpm = deck.effectiveBpm;
    final secPerBeat = 60.0 / bpm;
    final loopSec = deck.loopLength * secPerBeat;
    final startPos = deck.position;
    final endPos = startPos + Duration(milliseconds: (loopSec * 1000).toInt());

    if (isA) {
      _deckA = _deckA.copyWith(
        isLoopRollActive: true,
        isLoopActive: true,
        loopStartPosition: startPos,
        loopEndPosition: endPos,
      );
    } else {
      _deckB = _deckB.copyWith(
        isLoopRollActive: true,
        isLoopActive: true,
        loopStartPosition: startPos,
        loopEndPosition: endPos,
      );
    }
    notifyListeners();
  }

  void loopRollEnd(String deckId) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = isA ? _backendA : _backendB;

    // Resumes to slip linear position
    backend.seek(deck.slipPosition);
    if (isA) {
      _deckA = _deckA.copyWith(
        isLoopRollActive: false,
        isLoopActive: false,
        position: deck.slipPosition,
        loopStartPosition: null,
        loopEndPosition: null,
      );
    } else {
      _deckB = _deckB.copyWith(
        isLoopRollActive: false,
        isLoopActive: false,
        position: deck.slipPosition,
        loopStartPosition: null,
        loopEndPosition: null,
      );
    }
    notifyListeners();
  }

  void beatJump(String deckId, int beats) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final backend = isA ? _backendA : _backendB;
    final secPerBeat = 60.0 / deck.effectiveBpm;
    final offsetMs = (beats * secPerBeat * 1000).toInt();

    final targetMs = (deck.position.inMilliseconds + offsetMs).clamp(
      0,
      deck.track?.duration.inMilliseconds ?? 300000,
    );
    final targetPos = Duration(milliseconds: targetMs);
    backend.seek(targetPos);

    if (isA) {
      _deckA = _deckA.copyWith(position: targetPos);
    } else {
      _deckB = _deckB.copyWith(position: targetPos);
    }
    notifyListeners();
  }

  // --- Stems Control ---

  void setStemVolume(String deckId, String stemKey, double vol) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    StemState stems = deck.stems;

    switch (stemKey) {
      case 'vocals':
        stems = stems.copyWith(vocalVolume: vol);
        break;
      case 'drums':
        stems = stems.copyWith(drumVolume: vol);
        break;
      case 'bass':
        stems = stems.copyWith(bassVolume: vol);
        break;
      case 'melody':
        stems = stems.copyWith(melodyVolume: vol);
        break;
    }

    if (isA) {
      _deckA = _deckA.copyWith(stems: stems);
    } else {
      _deckB = _deckB.copyWith(stems: stems);
    }
    notifyListeners();
  }

  void toggleStemMute(String deckId, String stemKey) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    StemState stems = deck.stems;

    switch (stemKey) {
      case 'vocals':
        stems = stems.copyWith(vocalMuted: !stems.vocalMuted);
        break;
      case 'drums':
        stems = stems.copyWith(drumMuted: !stems.drumMuted);
        break;
      case 'bass':
        stems = stems.copyWith(bassMuted: !stems.bassMuted);
        break;
      case 'melody':
        stems = stems.copyWith(melodyMuted: !stems.melodyMuted);
        break;
    }

    if (isA) {
      _deckA = _deckA.copyWith(stems: stems);
    } else {
      _deckB = _deckB.copyWith(stems: stems);
    }
    notifyListeners();
  }

  void toggleStemSolo(String deckId, String stemKey) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    StemState stems = deck.stems;

    switch (stemKey) {
      case 'vocals':
        stems = stems.copyWith(vocalSolo: !stems.vocalSolo);
        break;
      case 'drums':
        stems = stems.copyWith(drumSolo: !stems.drumSolo);
        break;
      case 'bass':
        stems = stems.copyWith(bassSolo: !stems.bassSolo);
        break;
      case 'melody':
        stems = stems.copyWith(melodySolo: !stems.melodySolo);
        break;
    }

    if (isA) {
      _deckA = _deckA.copyWith(stems: stems);
    } else {
      _deckB = _deckB.copyWith(stems: stems);
    }
    notifyListeners();
  }

  // --- Mixer Controls ---

  void setCrossfaderPosition(double pos) {
    _mixer = _mixer.copyWith(crossfaderPosition: pos);
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void setCrossfaderCurve(CrossfaderCurve curve) {
    _mixer = _mixer.copyWith(crossfaderCurve: curve);
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void toggleHamsterReverse() {
    _mixer = _mixer.copyWith(isHamsterReverse: !_mixer.isHamsterReverse);
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void setChannelFader(String channel, double val) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(channelFader: val));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(channelFader: val));
    }
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void setGain(String channel, double val) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(gain: val));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(gain: val));
    }
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void setEqHigh(String channel, double val) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(eqHigh: val));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(eqHigh: val));
    }
    _applyDeckMixing(channel);
    notifyListeners();
  }

  void setEqMid(String channel, double val) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(eqMid: val));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(eqMid: val));
    }
    _applyDeckMixing(channel);
    notifyListeners();
  }

  void setEqLow(String channel, double val) {
    final strip = channel == 'A' ? _mixer.channelA : _mixer.channelB;
    final updated = strip.copyWith(eqLow: val.clamp(0.0, 2.0));
    _mixer = channel == 'A' ? _mixer.copyWith(channelA: updated) : _mixer.copyWith(channelB: updated);
    _applyDeckMixing(channel);
    notifyListeners();
  }

  void setEq(String channel, String band, double val) {
    if (band == 'high') setEqHigh(channel, val);
    if (band == 'mid') setEqMid(channel, val);
    if (band == 'low') setEqLow(channel, val);
  }

  void toggleEqKill(String channel, String band) {
    if (channel == 'A') {
      final ch = _mixer.channelA;
      if (band == 'high') _mixer = _mixer.copyWith(channelA: ch.copyWith(killHigh: !ch.killHigh));
      if (band == 'mid') _mixer = _mixer.copyWith(channelA: ch.copyWith(killMid: !ch.killMid));
      if (band == 'low') _mixer = _mixer.copyWith(channelA: ch.copyWith(killLow: !ch.killLow));
    } else {
      final ch = _mixer.channelB;
      if (band == 'high') _mixer = _mixer.copyWith(channelB: ch.copyWith(killHigh: !ch.killHigh));
      if (band == 'mid') _mixer = _mixer.copyWith(channelB: ch.copyWith(killMid: !ch.killMid));
      if (band == 'low') _mixer = _mixer.copyWith(channelB: ch.copyWith(killLow: !ch.killLow));
    }
    _applyDeckMixing(channel);
    notifyListeners();
  }

  void setFilter(String channel, double pos) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(filterPosition: pos));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(filterPosition: pos));
    }
    _applyDeckMixing(channel);
    notifyListeners();
  }

  void setMasterVolume(double val) {
    _mixer = _mixer.copyWith(masterVolume: val);
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void _updatePlaybackVolumes() {
    _applyDeckMixing('A');
    _applyDeckMixing('B');
  }

  /// Pushes the mixer strip for one deck (gain, channel fader, crossfader,
  /// master, EQ and filter) into that deck's audio backend.
  void _applyDeckMixing(String deckId) {
    final (crossGainA, crossGainB) = CrossfaderSlider.calculateGains(
      _mixer.crossfaderPosition,
      _mixer.crossfaderCurve,
      _mixer.isHamsterReverse,
    );

    final isA = deckId == 'A';
    final strip = isA ? _mixer.channelA : _mixer.channelB;
    final cross = isA ? crossGainA : crossGainB;
    final backend = isA ? _backendA : _backendB;

    final volume =
        (strip.channelFader * strip.gain * cross * _mixer.masterVolume)
            .clamp(0.0, 1.0);
    backend.setVolume(volume);

    backend.setEq(
      low: strip.killLow ? 0.0 : strip.eqLow,
      mid: strip.killMid ? 0.0 : strip.eqMid,
      high: strip.killHigh ? 0.0 : strip.eqHigh,
    );
    backend.setFilter(strip.filterPosition);
  }

  // --- XY FX & Sampler ---

  void selectFx(FXType fx) {
    _selectedFx = fx;
    notifyListeners();
  }

  void updateFxCoordinates(double x, double y) {
    _fxX = x;
    _fxY = y;
    notifyListeners();
  }

  void toggleFxHold(bool hold) {
    _isFxHold = hold;
    notifyListeners();
  }

  void setFxTouched(bool touched) {
    _isFxTouched = touched;
    notifyListeners();
  }

  void setSamplerBank(int bank) {
    _samplerBank = bank;
    notifyListeners();
  }

  void setSamplerVolume(double vol) {
    _samplerVolume = vol;
    notifyListeners();
  }

  void setSamplerPitch(int semitones) {
    _samplerPitchSemitones = semitones;
    notifyListeners();
  }

  Future<void> triggerSamplerPad(int padIndex, String soundAsset) async {
    await _samplerPlayer.stop();
    await _samplerPlayer.setVolume(_samplerVolume);
    final rate = TimeStretcher.semitonesToRate(_samplerPitchSemitones);
    await _samplerPlayer.setPlaybackRate(rate);
    await _samplerPlayer.play(AssetSource(soundAsset.replaceFirst('assets/', '')));
  }

  // --- Real-time Engine Tick (60 FPS) ---

  void _onEngineTick(Timer timer) {
    const dtSec = 0.016; // 16ms

    final beforeA = _deckA;
    final beforeB = _deckB;
    final beforeMixer = _mixer;

    _tickDeck('A', dtSec);
    _tickDeck('B', dtSec);

    // Master bus VU
    final (crossA, crossB) = CrossfaderSlider.calculateGains(
      _mixer.crossfaderPosition,
      _mixer.crossfaderCurve,
      _mixer.isHamsterReverse,
    );
    final masterSig =
        ((_deckA.vuLeft * crossA) + (_deckB.vuLeft * crossB)) *
            _mixer.masterVolume;
    _mixer = _mixer.copyWith(
      masterVuLeft: masterSig,
      masterVuRight: masterSig * 0.98,
      masterVuPeak: math.max(masterSig, _mixer.masterVuPeak * 0.96),
      isLimiterEngaged: masterSig > 1.05,
    );

    // Only repaint when something actually moved. The old tick notified 60
    // times a second unconditionally, which rebuilt the whole workspace even
    // while idle and made dragging the crossfader feel sticky.
    final idle = !_deckA.isPlaying &&
        !_deckB.isPlaying &&
        !_deckA.isScratching &&
        !_deckB.isScratching &&
        identical(beforeA, _deckA) &&
        identical(beforeB, _deckB) &&
        _isSettled(beforeMixer, _mixer);
    if (!idle) notifyListeners();
  }

  /// True when the master meters have decayed to nothing, so there is no
  /// visible change left to paint.
  bool _isSettled(MixerState before, MixerState after) {
    return after.masterVuLeft < 0.001 &&
        after.masterVuPeak < 0.001 &&
        before.masterVuPeak < 0.001;
  }

  void _tickDeck(String deckId, double dtSec) {
    final isA = deckId == 'A';
    var deck = isA ? _deckA : _deckB;
    final backend = backendFor(deckId);
    final strip = isA ? _mixer.channelA : _mixer.channelB;

    if (!deck.isPlaying && !deck.isScratching) {
      // Decay the meters, then leave the deck untouched so the tick can idle.
      if (deck.vuLeft < 0.001 && deck.vuRight < 0.001 && deck.vuPeak < 0.001) {
        if (deck.vuLeft != 0.0 || deck.vuRight != 0.0 || deck.vuPeak != 0.0) {
          deck = deck.copyWith(vuLeft: 0.0, vuRight: 0.0, vuPeak: 0.0);
          if (isA) {
            _deckA = deck;
          } else {
            _deckB = deck;
          }
        }
        return;
      }
      deck = deck.copyWith(
        vuLeft: deck.vuLeft * 0.85,
        vuRight: deck.vuRight * 0.85,
        vuPeak: deck.vuPeak * 0.95,
      );
      if (isA) {
        _deckA = deck;
      } else {
        _deckB = deck;
      }
      return;
    }

    final speed = deck.effectiveSpeedMultiplier;
    Duration nextPos;
    var stillPlaying = deck.isPlaying;

    if (backend.isSampleAccurate && backend.isLoaded) {
      // Real audio clock: the playhead is wherever the audio actually is.
      nextPos = backend.position;
      if (deck.isPlaying && !deck.isScratching && !backend.isPlaying) {
        stillPlaying = false; // reached the end of the track
      }
    } else {
      final addedMs = (dtSec * speed * 1000).toInt();
      nextPos = Duration(milliseconds: deck.position.inMilliseconds + addedMs);
      if (deck.isLoopActive &&
          deck.loopStartPosition != null &&
          deck.loopEndPosition != null &&
          nextPos >= deck.loopEndPosition!) {
        nextPos = deck.loopStartPosition!;
        backend.seek(nextPos);
      }
    }

    final trackDuration = deck.track?.duration ?? Duration.zero;
    final trackEnded = !deck.isLoopActive &&
        !deck.isScratching &&
        ((trackDuration > Duration.zero && nextPos >= trackDuration) ||
            (deck.isPlaying && !stillPlaying));

    if (trackEnded) {
      stillPlaying = false;
      nextPos = Duration.zero;
      backend.pause();
      backend.seek(Duration.zero);
    }

    final addedMs = stillPlaying ? (dtSec * speed * 1000).toInt() : 0;
    final newSlipMs = deck.slipPosition.inMilliseconds + addedMs;

    // Rotate the platter with the audio; while scratching it is driven by the
    // hand instead, and while stopped it stays still.
    final jogRot = (deck.isScratching || !stillPlaying)
        ? deck.jogAngle
        : (deck.jogAngle + (speed * 0.08)) % (2 * math.pi);

    final vuLevel = stillPlaying
        ? _meterLevel(deck, nextPos) * strip.channelFader * strip.gain
        : 0.0;

    deck = deck.copyWith(
      isPlaying: stillPlaying,
      position: nextPos,
      slipPosition: Duration(milliseconds: newSlipMs),
      jogAngle: jogRot,
      vuLeft: vuLevel,
      vuRight: vuLevel * 0.95,
      vuPeak: math.max(vuLevel, deck.vuPeak * 0.96),
    );

    if (isA) {
      _deckA = deck;
    } else {
      _deckB = deck;
    }
  }

  /// Meter level taken from the analyzed waveform where one exists, so the VUs
  /// follow the actual track instead of a synthetic envelope.
  double _meterLevel(DeckState deck, Duration position) {
    final wave = backendFor(deck.deckId).waveform;
    if (wave != null && wave.length > 0) {
      final idx = (position.inMicroseconds / 1e6 * wave.stridesPerSecond)
          .floor()
          .clamp(0, wave.length - 1);
      return wave.all[idx] / 255.0;
    }
    final track = deck.track;
    if (track == null || track.waveformPeaks.isEmpty) return 0.6;
    final idx = ((position.inMilliseconds / (track.duration.inMilliseconds + 1)) *
            (track.waveformPeaks.length - 1))
        .clamp(0, track.waveformPeaks.length - 1)
        .toInt();
    return track.waveformPeaks[idx];
  }

  @override
  void dispose() {
    _engineTicker?.cancel();
    _backendA.dispose();
    _backendB.dispose();
    _samplerPlayer.dispose();
    super.dispose();
  }
}
