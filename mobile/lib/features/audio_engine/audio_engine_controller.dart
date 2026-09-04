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

  // AudioPlayers
  final AudioPlayer _playerA = AudioPlayer();
  final AudioPlayer _playerB = AudioPlayer();
  final AudioPlayer _samplerPlayer = AudioPlayer();

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

  AudioEngineController() {
    _initEngine();
  }

  void _initEngine() {
    // Start high-performance audio coordinator loop
    _engineTicker = Timer.periodic(const Duration(milliseconds: 16), _onEngineTick);
  }

  // --- Deck Transport Controls ---

  Future<void> loadTrack(String deckId, Track track) async {
    final isA = deckId == 'A';
    final player = isA ? _playerA : _playerB;

    // Immediately update deck state with new track
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
    notifyListeners();

    try {
      await player.stop();
      if (track.assetPath != null) {
        await player.setSource(AssetSource(track.assetPath!.replaceFirst('assets/', '')));
      } else if (track.filePath != null) {
        await player.setSource(DeviceFileSource(track.filePath!));
      } else if (track.streamUrl != null) {
        await player.setSource(UrlSource(track.streamUrl!));
      }
    } catch (e) {
      debugPrint('Warning: AudioPlayer setSource deferred: $e');
    }
  }

  Future<void> togglePlay(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final player = isA ? _playerA : _playerB;

    if (deck.isPlaying) {
      // Pause immediately
      if (isA) {
        _deckA = _deckA.copyWith(isPlaying: false);
      } else {
        _deckB = _deckB.copyWith(isPlaying: false);
      }
      notifyListeners();

      try {
        await player.pause();
      } catch (e) {
        debugPrint('AudioPlayer pause error: $e');
      }
    } else {
      // Play immediately (optimistic UI update so transport starts)
      if (isA) {
        _deckA = _deckA.copyWith(isPlaying: true, isCued: false);
      } else {
        _deckB = _deckB.copyWith(isPlaying: true, isCued: false);
      }
      notifyListeners();

      try {
        if (player.state == PlayerState.paused) {
          await player.resume();
        } else if (deck.track?.assetPath != null) {
          await player.play(AssetSource(deck.track!.assetPath!.replaceFirst('assets/', '')));
        } else if (deck.track?.filePath != null) {
          await player.play(DeviceFileSource(deck.track!.filePath!));
        } else if (deck.track?.streamUrl != null) {
          await player.play(UrlSource(deck.track!.streamUrl!));
        } else {
          await player.resume();
        }

        if (deck.position > Duration.zero) {
          await player.seek(deck.position);
        }
        await player.setPlaybackRate(deck.effectiveSpeedMultiplier);
      } catch (e) {
        debugPrint('AudioPlayer play/stream notice: $e');
        // Virtual audio transport continues smoothly in 60fps clock tick
      }
    }
  }

  /// Pioneer-style Stutter Cue:
  /// When paused: sets current position as cue point
  /// When playing: pauses and jumps back to cue point
  Future<void> stutterCue(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final player = isA ? _playerA : _playerB;

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
        await player.pause();
        await player.seek(target);
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
    final player = isA ? _playerA : _playerB;
    final target = deck.cuePoint ?? Duration.zero;

    if (isA) {
      _deckA = _deckA.copyWith(isPlaying: true, position: target);
    } else {
      _deckB = _deckB.copyWith(isPlaying: true, position: target);
    }
    notifyListeners();

    try {
      await player.seek(target);
      await player.resume();
    } catch (e) {
      debugPrint('tempCueDown player error: $e');
    }
  }

  Future<void> tempCueUp(String deckId) async {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final player = isA ? _playerA : _playerB;
    final target = deck.cuePoint ?? Duration.zero;

    if (isA) {
      _deckA = _deckA.copyWith(isPlaying: false, position: target);
    } else {
      _deckB = _deckB.copyWith(isPlaying: false, position: target);
    }
    notifyListeners();

    try {
      await player.pause();
      await player.seek(target);
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
      _playerA.setPlaybackRate(_deckA.effectiveSpeedMultiplier);
    } else {
      _deckB = _deckB.copyWith(pitchPercent: clamped);
      _playerB.setPlaybackRate(_deckB.effectiveSpeedMultiplier);
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

    final player = isTargetA ? _playerA : _playerB;
    final currentMs = targetDeck.position.inMilliseconds;
    final adjustedTargetMs = (currentMs + (phaseOffsetSec * 1000).toInt()).clamp(0, targetDeck.track!.duration.inMilliseconds);
    player.seek(Duration(milliseconds: adjustedTargetMs));

    if (isTargetA) {
      _deckA = _deckA.copyWith(
        pitchPercent: requiredPitchPercent.clamp(-_deckA.pitchRange.percentage, _deckA.pitchRange.percentage),
        isSync: true,
      );
      _playerA.setPlaybackRate(_deckA.effectiveSpeedMultiplier);
    } else {
      _deckB = _deckB.copyWith(
        pitchPercent: requiredPitchPercent.clamp(-_deckB.pitchRange.percentage, _deckB.pitchRange.percentage),
        isSync: true,
      );
      _playerB.setPlaybackRate(_deckB.effectiveSpeedMultiplier);
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
    notifyListeners();
  }

  void onJogMove(String deckId, double angularDelta, bool isCenterTouch) {
    final isA = deckId == 'A';
    final deck = isA ? _deckA : _deckB;
    final player = isA ? _playerA : _playerB;

    // Update jog wheel visual angle
    var newAngle = (deck.jogAngle + angularDelta) % (2 * math.pi);
    if (newAngle < 0) newAngle += 2 * math.pi;

    if (deck.jogMode == JogWheelMode.vinylScratch && isCenterTouch) {
      // 1. Vinyl Scratch Mode: 1 full rotation (2*PI) ~ 1.8 seconds audio scrub
      final scrubSec = (angularDelta / (2 * math.pi)) * 1.8;
      final scrubMs = (scrubSec * 1000).toInt();
      final newPosMs = (deck.position.inMilliseconds + scrubMs).clamp(
        0,
        deck.track?.duration.inMilliseconds ?? 300000,
      );

      final newPos = Duration(milliseconds: newPosMs);
      player.seek(newPos);

      if (isA) {
        _deckA = _deckA.copyWith(jogAngle: newAngle, position: newPos);
      } else {
        _deckB = _deckB.copyWith(jogAngle: newAngle, position: newPos);
      }
    } else if (deck.jogMode == JogWheelMode.pitchBend || !isCenterTouch) {
      // 2. Pitch Bend Mode (Outer ring nudge)
      final nudgeFactor = angularDelta > 0 ? 1.05 : 0.95;
      player.setPlaybackRate((deck.effectiveSpeedMultiplier * nudgeFactor).clamp(0.1, 2.5));
      if (isA) {
        _deckA = _deckA.copyWith(jogAngle: newAngle);
      } else {
        _deckB = _deckB.copyWith(jogAngle: newAngle);
      }
    } else {
      // 3. CDJ Search Mode (1/75s audio frames)
      final frameMs = (angularDelta > 0 ? 13 : -13);
      final newPosMs = (deck.position.inMilliseconds + frameMs).clamp(
        0,
        deck.track?.duration.inMilliseconds ?? 300000,
      );
      final newPos = Duration(milliseconds: newPosMs);
      player.seek(newPos);
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
    final player = isA ? _playerA : _playerB;

    // Reset rate to normal
    player.setPlaybackRate(deck.effectiveSpeedMultiplier);

    // If Slip Mode was active during scratch/seek, snap back to slip timeline!
    Duration targetPos = deck.position;
    if (deck.isSlipMode) {
      targetPos = deck.slipPosition;
      player.seek(targetPos);
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
    final player = isA ? _playerA : _playerB;

    if (deck.hotCues.containsKey(index)) {
      // Jump to cue
      final target = deck.hotCues[index]!;
      player.seek(target);
      if (!deck.isPlaying) {
        player.resume();
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
    final player = isA ? _playerA : _playerB;

    // Resumes to slip linear position
    player.seek(deck.slipPosition);
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
    final player = isA ? _playerA : _playerB;
    final secPerBeat = 60.0 / deck.effectiveBpm;
    final offsetMs = (beats * secPerBeat * 1000).toInt();

    final targetMs = (deck.position.inMilliseconds + offsetMs).clamp(
      0,
      deck.track?.duration.inMilliseconds ?? 300000,
    );
    final targetPos = Duration(milliseconds: targetMs);
    player.seek(targetPos);

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
    notifyListeners();
  }

  void setEqMid(String channel, double val) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(eqMid: val));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(eqMid: val));
    }
    notifyListeners();
  }

  void setEqLow(String channel, double val) {
    final strip = channel == 'A' ? _mixer.channelA : _mixer.channelB;
    final updated = strip.copyWith(eqLow: val.clamp(0.0, 2.0));
    _mixer = channel == 'A' ? _mixer.copyWith(channelA: updated) : _mixer.copyWith(channelB: updated);
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
    notifyListeners();
  }

  void setFilter(String channel, double pos) {
    if (channel == 'A') {
      _mixer = _mixer.copyWith(channelA: _mixer.channelA.copyWith(filterPosition: pos));
    } else {
      _mixer = _mixer.copyWith(channelB: _mixer.channelB.copyWith(filterPosition: pos));
    }
    notifyListeners();
  }

  void setMasterVolume(double val) {
    _mixer = _mixer.copyWith(masterVolume: val);
    _updatePlaybackVolumes();
    notifyListeners();
  }

  void _updatePlaybackVolumes() {
    final (crossGainA, crossGainB) = CrossfaderSlider.calculateGains(
      _mixer.crossfaderPosition,
      _mixer.crossfaderCurve,
      _mixer.isHamsterReverse,
    );

    final finalVolA = (_mixer.channelA.channelFader * _mixer.channelA.gain * crossGainA * _mixer.masterVolume).clamp(0.0, 1.2);
    final finalVolB = (_mixer.channelB.channelFader * _mixer.channelB.gain * crossGainB * _mixer.masterVolume).clamp(0.0, 1.2);

    _playerA.setVolume(finalVolA.clamp(0.0, 1.0));
    _playerB.setVolume(finalVolB.clamp(0.0, 1.0));
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

    // 1. Deck A Clock & Slip Tracking
    if (_deckA.isPlaying) {
      final speedA = _deckA.effectiveSpeedMultiplier;
      final addedMs = (dtSec * speedA * 1000).toInt();

      final newPosMs = _deckA.position.inMilliseconds + addedMs;
      final newSlipMs = _deckA.slipPosition.inMilliseconds + addedMs;

      // Check Looping Wrap-around
      Duration nextPos = Duration(milliseconds: newPosMs);
      if (_deckA.isLoopActive && _deckA.loopStartPosition != null && _deckA.loopEndPosition != null) {
        if (nextPos >= _deckA.loopEndPosition!) {
          nextPos = _deckA.loopStartPosition!;
          _playerA.seek(nextPos);
        }
      }

      // Rotate Jog Wheel
      final jogRot = (_deckA.jogAngle + (speedA * 0.08)) % (2 * math.pi);

      // Synthesize dynamic VU meter level
      final peakIndex = _deckA.track != null && _deckA.track!.waveformPeaks.isNotEmpty
          ? ((nextPos.inMilliseconds / (_deckA.track!.duration.inMilliseconds + 1)) * (_deckA.track!.waveformPeaks.length - 1)).clamp(0, _deckA.track!.waveformPeaks.length - 1).toInt()
          : 0;
      final rawPeak = _deckA.track != null && _deckA.track!.waveformPeaks.isNotEmpty
          ? _deckA.track!.waveformPeaks[peakIndex]
          : 0.6;
      final vuLevel = rawPeak * _mixer.channelA.channelFader * _mixer.channelA.gain;

      _deckA = _deckA.copyWith(
        position: nextPos,
        slipPosition: Duration(milliseconds: newSlipMs),
        jogAngle: jogRot,
        vuLeft: vuLevel,
        vuRight: (vuLevel * 0.95),
        vuPeak: math.max(vuLevel, _deckA.vuPeak * 0.96),
      );
    } else {
      _deckA = _deckA.copyWith(
        vuLeft: _deckA.vuLeft * 0.85,
        vuRight: _deckA.vuRight * 0.85,
        vuPeak: _deckA.vuPeak * 0.95,
      );
    }

    // 2. Deck B Clock & Slip Tracking
    if (_deckB.isPlaying) {
      final speedB = _deckB.effectiveSpeedMultiplier;
      final addedMs = (dtSec * speedB * 1000).toInt();

      final newPosMs = _deckB.position.inMilliseconds + addedMs;
      final newSlipMs = _deckB.slipPosition.inMilliseconds + addedMs;

      Duration nextPos = Duration(milliseconds: newPosMs);
      if (_deckB.isLoopActive && _deckB.loopStartPosition != null && _deckB.loopEndPosition != null) {
        if (nextPos >= _deckB.loopEndPosition!) {
          nextPos = _deckB.loopStartPosition!;
          _playerB.seek(nextPos);
        }
      }

      final jogRot = (_deckB.jogAngle + (speedB * 0.08)) % (2 * math.pi);

      final peakIndex = _deckB.track != null && _deckB.track!.waveformPeaks.isNotEmpty
          ? ((nextPos.inMilliseconds / (_deckB.track!.duration.inMilliseconds + 1)) * (_deckB.track!.waveformPeaks.length - 1)).clamp(0, _deckB.track!.waveformPeaks.length - 1).toInt()
          : 0;
      final rawPeak = _deckB.track != null && _deckB.track!.waveformPeaks.isNotEmpty
          ? _deckB.track!.waveformPeaks[peakIndex]
          : 0.6;
      final vuLevel = rawPeak * _mixer.channelB.channelFader * _mixer.channelB.gain;

      _deckB = _deckB.copyWith(
        position: nextPos,
        slipPosition: Duration(milliseconds: newSlipMs),
        jogAngle: jogRot,
        vuLeft: vuLevel,
        vuRight: (vuLevel * 0.95),
        vuPeak: math.max(vuLevel, _deckB.vuPeak * 0.96),
      );
    } else {
      _deckB = _deckB.copyWith(
        vuLeft: _deckB.vuLeft * 0.85,
        vuRight: _deckB.vuRight * 0.85,
        vuPeak: _deckB.vuPeak * 0.95,
      );
    }

    // 3. Master Bus VU Meter calculation
    final (crossA, crossB) = CrossfaderSlider.calculateGains(
      _mixer.crossfaderPosition,
      _mixer.crossfaderCurve,
      _mixer.isHamsterReverse,
    );
    final masterSig = ((_deckA.vuLeft * crossA) + (_deckB.vuLeft * crossB)) * _mixer.masterVolume;
    _mixer = _mixer.copyWith(
      masterVuLeft: masterSig,
      masterVuRight: masterSig * 0.98,
      masterVuPeak: math.max(masterSig, _mixer.masterVuPeak * 0.96),
      isLimiterEngaged: masterSig > 1.05,
    );

    notifyListeners();
  }

  @override
  void dispose() {
    _engineTicker?.cancel();
    _playerA.dispose();
    _playerB.dispose();
    _playerB.dispose();
    _samplerPlayer.dispose();
    super.dispose();
  }
}
