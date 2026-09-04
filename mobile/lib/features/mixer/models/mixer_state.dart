import '../../audio_engine/dsp_filters.dart';
import '../../../core/components/crossfader_slider.dart';

class ChannelStripState {
  final double gain; // 0.0 to 1.5 (center 1.0)
  final double eqHigh; // 0.0 to 1.0 (center 0.5 = 0dB)
  final double eqMid;  // 0.0 to 1.0 (center 0.5 = 0dB)
  final double eqLow;  // 0.0 to 1.0 (center 0.5 = 0dB)
  final EQMode eqMode;
  final bool killHigh;
  final bool killMid;
  final bool killLow;
  final double filterPosition; // -1.0 (LPF) .. 0.0 .. +1.0 (HPF)
  final double channelFader;   // 0.0 to 1.0
  final bool cueHeadphones;

  const ChannelStripState({
    this.gain = 1.0,
    this.eqHigh = 0.5,
    this.eqMid = 0.5,
    this.eqLow = 0.5,
    this.eqMode = EQMode.standard,
    this.killHigh = false,
    this.killMid = false,
    this.killLow = false,
    this.filterPosition = 0.0,
    this.channelFader = 1.0,
    this.cueHeadphones = false,
  });

  ChannelStripState copyWith({
    double? gain,
    double? eqHigh,
    double? eqMid,
    double? eqLow,
    EQMode? eqMode,
    bool? killHigh,
    bool? killMid,
    bool? killLow,
    double? filterPosition,
    double? channelFader,
    bool? cueHeadphones,
  }) {
    return ChannelStripState(
      gain: gain ?? this.gain,
      eqHigh: eqHigh ?? this.eqHigh,
      eqMid: eqMid ?? this.eqMid,
      eqLow: eqLow ?? this.eqLow,
      eqMode: eqMode ?? this.eqMode,
      killHigh: killHigh ?? this.killHigh,
      killMid: killMid ?? this.killMid,
      killLow: killLow ?? this.killLow,
      filterPosition: filterPosition ?? this.filterPosition,
      channelFader: channelFader ?? this.channelFader,
      cueHeadphones: cueHeadphones ?? this.cueHeadphones,
    );
  }
}

class MixerState {
  final ChannelStripState channelA;
  final ChannelStripState channelB;
  final double crossfaderPosition; // -1.0 to +1.0
  final CrossfaderCurve crossfaderCurve;
  final bool isHamsterReverse;
  final double masterVolume;
  final double boothVolume;
  final double headphoneVolume;
  final double cueMasterMix; // 0.0 = Cue, 1.0 = Master
  final bool isSplitCue;
  final bool isLimiterEngaged;
  final double masterVuLeft;
  final double masterVuRight;
  final double masterVuPeak;

  const MixerState({
    this.channelA = const ChannelStripState(),
    this.channelB = const ChannelStripState(),
    this.crossfaderPosition = 0.0,
    this.crossfaderCurve = CrossfaderCurve.linear,
    this.isHamsterReverse = false,
    this.masterVolume = 0.9,
    this.boothVolume = 0.7,
    this.headphoneVolume = 0.8,
    this.cueMasterMix = 0.5,
    this.isSplitCue = false,
    this.isLimiterEngaged = false,
    this.masterVuLeft = 0.0,
    this.masterVuRight = 0.0,
    this.masterVuPeak = 0.0,
  });

  MixerState copyWith({
    ChannelStripState? channelA,
    ChannelStripState? channelB,
    double? crossfaderPosition,
    CrossfaderCurve? crossfaderCurve,
    bool? isHamsterReverse,
    double? masterVolume,
    double? boothVolume,
    double? headphoneVolume,
    double? cueMasterMix,
    bool? isSplitCue,
    bool? isLimiterEngaged,
    double? masterVuLeft,
    double? masterVuRight,
    double? masterVuPeak,
  }) {
    return MixerState(
      channelA: channelA ?? this.channelA,
      channelB: channelB ?? this.channelB,
      crossfaderPosition: crossfaderPosition ?? this.crossfaderPosition,
      crossfaderCurve: crossfaderCurve ?? this.crossfaderCurve,
      isHamsterReverse: isHamsterReverse ?? this.isHamsterReverse,
      masterVolume: masterVolume ?? this.masterVolume,
      boothVolume: boothVolume ?? this.boothVolume,
      headphoneVolume: headphoneVolume ?? this.headphoneVolume,
      cueMasterMix: cueMasterMix ?? this.cueMasterMix,
      isSplitCue: isSplitCue ?? this.isSplitCue,
      isLimiterEngaged: isLimiterEngaged ?? this.isLimiterEngaged,
      masterVuLeft: masterVuLeft ?? this.masterVuLeft,
      masterVuRight: masterVuRight ?? this.masterVuRight,
      masterVuPeak: masterVuPeak ?? this.masterVuPeak,
    );
  }
}
