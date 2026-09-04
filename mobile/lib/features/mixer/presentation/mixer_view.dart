import 'package:flutter/material.dart';
import '../models/mixer_state.dart';
import '../../audio_engine/audio_engine_controller.dart';
import '../../../core/theme/dj_colors.dart';
import '../../../core/theme/dj_typography.dart';
import '../../../core/components/rotary_knob.dart';
import '../../../core/components/precision_fader.dart';
import '../../../core/components/led_vu_meter.dart';
import '../../../core/components/crossfader_slider.dart';
import '../../../core/components/neon_button.dart';

class MixerView extends StatelessWidget {
  final AudioEngineController controller;

  const MixerView({
    super.key,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    final mixer = controller.mixer;
    final deckA = controller.deckA;
    final deckB = controller.deckB;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: DJColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DJColors.surfaceBorder, width: 1.2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Top Master Section (Master Vol, Limiter, Headphone Vol, Split-Cue)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Master Vol Knob
                RotaryKnob(
                  value: mixer.masterVolume,
                  label: 'MASTER',
                  valueDisplay: '${(mixer.masterVolume * 100).toInt()}%',
                  activeColor: Colors.white,
                  size: 38,
                  onChanged: controller.setMasterVolume,
                ),
                const SizedBox(width: 10),
                // Limiter & Master VU Meter
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: mixer.isLimiterEngaged
                            ? DJColors.vuRed.withOpacity(0.3)
                            : DJColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(
                          color: mixer.isLimiterEngaged
                              ? DJColors.vuRed
                              : DJColors.surfaceBorder,
                        ),
                      ),
                      child: Text(
                        'LIMITER',
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 8,
                          color: mixer.isLimiterEngaged
                              ? DJColors.vuRed
                              : DJColors.textMuted,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    LedVuMeter(
                      level: mixer.masterVuLeft,
                      peakLevel: mixer.masterVuPeak,
                      rightLevel: mixer.masterVuRight,
                      isStereo: true,
                      height: 35,
                      width: 8,
                      segments: 8,
                    ),
                  ],
                ),
                const SizedBox(width: 10),
                // Booth Vol Knob
                RotaryKnob(
                  value: mixer.boothVolume,
                  label: 'BOOTH',
                  valueDisplay: '${(mixer.boothVolume * 100).toInt()}%',
                  activeColor: DJColors.textSecondary,
                  size: 38,
                  onChanged: (v) {},
                ),
                const SizedBox(width: 10),
                // Headphone Vol & Split Cue Toggle
                Row(
                  children: [
                    RotaryKnob(
                      value: mixer.headphoneVolume,
                      label: 'PHONES',
                      valueDisplay: '${(mixer.headphoneVolume * 100).toInt()}%',
                      activeColor: DJColors.vuAmber,
                      size: 38,
                      onChanged: (v) {},
                    ),
                    const SizedBox(width: 6),
                    NeonButton(
                      label: 'SPLIT',
                      isActive: mixer.isSplitCue,
                      activeColor: DJColors.vuAmber,
                      width: 36,
                      height: 28,
                      fontSize: 8,
                      onTap: () {},
                    ),
                  ],
                ),
              ],
            ),
          ),
          const Divider(color: DJColors.surfaceBorder, height: 16),
          // Dual Channels (A & B) Knobs, Faders & VU Meters
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // --- CHANNEL A ---
              _buildChannelColumn(
                channelId: 'A',
                channelStrip: mixer.channelA,
                vuLevel: deckA.vuLeft,
                vuPeak: deckA.vuPeak,
                accentColor: DJColors.deckA,
              ),
              // Center Divider with Crossfader Curve Controls
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 12),
                  Text('CURVE', style: DJTypography.knobLabel.copyWith(fontSize: 8)),
                  const SizedBox(height: 4),
                  PopupMenuButton<CrossfaderCurve>(
                    initialValue: mixer.crossfaderCurve,
                    onSelected: controller.setCrossfaderCurve,
                    color: DJColors.surfaceElevated,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: DJColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: DJColors.surfaceBorder),
                      ),
                      child: Text(
                        mixer.crossfaderCurve == CrossfaderCurve.linear
                            ? 'LIN'
                            : (mixer.crossfaderCurve == CrossfaderCurve.exponential
                                ? 'EXP'
                                : 'CUT'),
                        style: DJTypography.buttonLabel.copyWith(fontSize: 9),
                      ),
                    ),
                    itemBuilder: (context) => [
                      const PopupMenuItem(value: CrossfaderCurve.linear, child: Text('Linear (Smooth)')),
                      const PopupMenuItem(value: CrossfaderCurve.exponential, child: Text('Exponential (Blend)')),
                      const PopupMenuItem(value: CrossfaderCurve.sharpCut, child: Text('Sharp Cut (Scratch)')),
                    ],
                  ),
                  const SizedBox(height: 14),
                  // Hamster Switch
                  NeonButton(
                    label: 'REV',
                    isActive: mixer.isHamsterReverse,
                    activeColor: DJColors.vuAmber,
                    width: 36,
                    height: 26,
                    fontSize: 8,
                    onTap: controller.toggleHamsterReverse,
                  ),
                ],
              ),
              // --- CHANNEL B ---
              _buildChannelColumn(
                channelId: 'B',
                channelStrip: mixer.channelB,
                vuLevel: deckB.vuLeft,
                vuPeak: deckB.vuPeak,
                accentColor: DJColors.deckB,
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Horizontal Pro Crossfader
          CrossfaderSlider(
            position: mixer.crossfaderPosition,
            curve: mixer.crossfaderCurve,
            isHamsterReverse: mixer.isHamsterReverse,
            onChanged: controller.setCrossfaderPosition,
            width: 290,
          ),
        ],
      ),
    );
  }

  Widget _buildChannelColumn({
    required String channelId,
    required ChannelStripState channelStrip,
    required double vuLevel,
    required double vuPeak,
    required Color accentColor,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Gain Trim Knob
        RotaryKnob(
          value: channelStrip.gain,
          min: 0.0,
          max: 1.5,
          defaultValue: 1.0,
          label: 'GAIN',
          activeColor: accentColor,
          size: 40,
          onChanged: (v) => controller.setGain(channelId, v),
        ),
        const SizedBox(height: 6),
        // 3-Band EQ Knobs + Kill Buttons
        _buildEqRow(channelId, 'HIGH', channelStrip.eqHigh, channelStrip.killHigh, accentColor, 'high'),
        const SizedBox(height: 4),
        _buildEqRow(channelId, 'MID', channelStrip.eqMid, channelStrip.killMid, accentColor, 'mid'),
        const SizedBox(height: 4),
        _buildEqRow(channelId, 'LOW', channelStrip.eqLow, channelStrip.killLow, accentColor, 'low'),
        const SizedBox(height: 6),
        // Bipolar Combo Filter Knob (HPF/LPF)
        RotaryKnob(
          value: channelStrip.filterPosition,
          min: -1.0,
          max: 1.0,
          defaultValue: 0.0,
          isBipolar: true,
          label: 'FILTER',
          activeColor: channelStrip.filterPosition < 0 ? DJColors.vuAmber : DJColors.deckA,
          size: 42,
          onChanged: (v) => controller.setFilter(channelId, v),
        ),
        const SizedBox(height: 8),
        // Channel Fader & Stereo LED VU Meter
        Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            PrecisionFader(
              value: channelStrip.channelFader,
              min: 0.0,
              max: 1.0,
              defaultValue: 1.0,
              label: 'CH $channelId',
              activeColor: accentColor,
              width: 38,
              height: 110,
              onChanged: (v) => controller.setChannelFader(channelId, v),
            ),
            const SizedBox(width: 4),
            LedVuMeter(
              level: vuLevel,
              peakLevel: vuPeak,
              height: 110,
              width: 9,
              segments: 10,
            ),
          ],
        ),
        const SizedBox(height: 6),
        // Cue PFL Audition Button
        NeonButton(
          label: 'CUE',
          isActive: channelStrip.cueHeadphones,
          activeColor: DJColors.vuAmber,
          width: 44,
          height: 26,
          fontSize: 9,
          onTap: () {},
        ),
      ],
    );
  }

  Widget _buildEqRow(
    String channelId,
    String band,
    double value,
    bool isKilled,
    Color color,
    String bandKey,
  ) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        RotaryKnob(
          value: value,
          min: 0.0,
          max: 1.0,
          defaultValue: 0.5,
          label: band,
          activeColor: isKilled ? DJColors.textMuted : color,
          size: 38,
          onChanged: (v) {
            if (bandKey == 'high') controller.setEqHigh(channelId, v);
            if (bandKey == 'mid') controller.setEqMid(channelId, v);
            if (bandKey == 'low') controller.setEqLow(channelId, v);
          },
        ),
        const SizedBox(width: 2),
        // Kill Button
        GestureDetector(
          onTap: () => controller.toggleEqKill(channelId, bandKey),
          child: Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: isKilled ? DJColors.vuRed.withOpacity(0.3) : DJColors.surfaceElevated,
              shape: BoxShape.circle,
              border: Border.all(color: isKilled ? DJColors.vuRed : DJColors.surfaceBorder),
            ),
            child: Text(
              'K',
              style: DJTypography.buttonLabel.copyWith(
                fontSize: 7,
                color: isKilled ? DJColors.vuRed : DJColors.textMuted,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
