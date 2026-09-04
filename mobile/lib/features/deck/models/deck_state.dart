import 'track.dart';
import '../../audio_engine/stem_separator_dsp.dart';
import '../../../core/widgets/jog_wheel_widget.dart';

enum PitchRange {
  four(4.0, '±4%'),
  eight(8.0, '±8%'),
  sixteen(16.0, '±16%'),
  fifty(50.0, '±50%'),
  wide(100.0, 'WIDE');

  final double percentage;
  final String label;
  const PitchRange(this.percentage, this.label);
}

class DeckState {
  final String deckId; // 'A', 'B', 'C', 'D'
  final Track? track;
  final bool isPlaying;
  final bool isCued;
  final Duration position;
  final Duration slipPosition; // Virtual linear shadow needle during Slip Mode
  final bool isSlipMode;
  final bool isScratching;
  final JogWheelMode jogMode;
  final double jogAngle; // In radians 0..2*PI

  final double pitchPercent; // -range to +range
  final PitchRange pitchRange;
  final bool isKeyLock;
  final bool isSync;
  final bool isMaster;

  // Cues & Loops
  final Duration? cuePoint;
  final Map<int, Duration> hotCues; // 0..7
  final bool isQuantize;
  final bool isDeleteCueMode;

  final double loopLength; // in beats
  final bool isLoopActive;
  final bool isLoopRollActive;
  final Duration? loopStartPosition;
  final Duration? loopEndPosition;

  // Stems
  final StemState stems;

  // Audio Levels
  final double vuLeft;
  final double vuRight;
  final double vuPeak;

  const DeckState({
    required this.deckId,
    this.track,
    this.isPlaying = false,
    this.isCued = false,
    this.position = Duration.zero,
    this.slipPosition = Duration.zero,
    this.isSlipMode = false,
    this.isScratching = false,
    this.jogMode = JogWheelMode.vinylScratch,
    this.jogAngle = 0.0,
    this.pitchPercent = 0.0,
    this.pitchRange = PitchRange.eight,
    this.isKeyLock = true,
    this.isSync = false,
    this.isMaster = false,
    this.cuePoint,
    this.hotCues = const {},
    this.isQuantize = true,
    this.isDeleteCueMode = false,
    this.loopLength = 4.0,
    this.isLoopActive = false,
    this.isLoopRollActive = false,
    this.loopStartPosition,
    this.loopEndPosition,
    this.stems = const StemState(),
    this.vuLeft = 0.0,
    this.vuRight = 0.0,
    this.vuPeak = 0.0,
  });

  /// Effective playback speed multiplier
  double get effectiveSpeedMultiplier {
    return (1.0 + (pitchPercent / 100.0)).clamp(0.05, 2.5);
  }

  /// Effective BPM after pitch fader adjustment
  double get effectiveBpm {
    if (track == null) return 126.0;
    return track!.bpm * effectiveSpeedMultiplier;
  }

  DeckState copyWith({
    String? deckId,
    Track? track,
    bool? isPlaying,
    bool? isCued,
    Duration? position,
    Duration? slipPosition,
    bool? isSlipMode,
    bool? isScratching,
    JogWheelMode? jogMode,
    double? jogAngle,
    double? pitchPercent,
    PitchRange? pitchRange,
    bool? isKeyLock,
    bool? isSync,
    bool? isMaster,
    Duration? cuePoint,
    Map<int, Duration>? hotCues,
    bool? isQuantize,
    bool? isDeleteCueMode,
    double? loopLength,
    bool? isLoopActive,
    bool? isLoopRollActive,
    Duration? loopStartPosition,
    Duration? loopEndPosition,
    StemState? stems,
    double? vuLeft,
    double? vuRight,
    double? vuPeak,
  }) {
    return DeckState(
      deckId: deckId ?? this.deckId,
      track: track ?? this.track,
      isPlaying: isPlaying ?? this.isPlaying,
      isCued: isCued ?? this.isCued,
      position: position ?? this.position,
      slipPosition: slipPosition ?? this.slipPosition,
      isSlipMode: isSlipMode ?? this.isSlipMode,
      isScratching: isScratching ?? this.isScratching,
      jogMode: jogMode ?? this.jogMode,
      jogAngle: jogAngle ?? this.jogAngle,
      pitchPercent: pitchPercent ?? this.pitchPercent,
      pitchRange: pitchRange ?? this.pitchRange,
      isKeyLock: isKeyLock ?? this.isKeyLock,
      isSync: isSync ?? this.isSync,
      isMaster: isMaster ?? this.isMaster,
      cuePoint: cuePoint ?? this.cuePoint,
      hotCues: hotCues ?? this.hotCues,
      isQuantize: isQuantize ?? this.isQuantize,
      isDeleteCueMode: isDeleteCueMode ?? this.isDeleteCueMode,
      loopLength: loopLength ?? this.loopLength,
      isLoopActive: isLoopActive ?? this.isLoopActive,
      isLoopRollActive: isLoopRollActive ?? this.isLoopRollActive,
      loopStartPosition: loopStartPosition ?? this.loopStartPosition,
      loopEndPosition: loopEndPosition ?? this.loopEndPosition,
      stems: stems ?? this.stems,
      vuLeft: vuLeft ?? this.vuLeft,
      vuRight: vuRight ?? this.vuRight,
      vuPeak: vuPeak ?? this.vuPeak,
    );
  }
}
