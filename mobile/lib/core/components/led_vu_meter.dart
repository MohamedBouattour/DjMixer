import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';

class LedVuMeter extends StatelessWidget {
  final double level; // 0.0 to 1.0 (or up to 1.2 for +6dB boost)
  final double peakLevel; // peak hold 0.0 to 1.2
  final int segments;
  final double width;
  final double height;
  final bool isStereo;
  final double? rightLevel;

  const LedVuMeter({
    super.key,
    required this.level,
    this.peakLevel = 0.0,
    this.segments = 12,
    this.width = 12,
    this.height = 140,
    this.isStereo = false,
    this.rightLevel,
  });

  @override
  Widget build(BuildContext context) {
    if (isStereo) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildSingleMeter(level, peakLevel),
          const SizedBox(width: 3),
          _buildSingleMeter(rightLevel ?? level, peakLevel),
        ],
      );
    }
    return _buildSingleMeter(level, peakLevel);
  }

  Widget _buildSingleMeter(double lvl, double pk) {
    final clampedLevel = lvl.clamp(0.0, 1.2);
    final clampedPeak = pk.clamp(0.0, 1.2);

    return Container(
      width: width,
      height: height,
      padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 2),
      decoration: BoxDecoration(
        color: DJColors.background,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: DJColors.surfaceBorder, width: 1),
      ),
      child: Column(
        verticalDirection: VerticalDirection.up,
        children: List.generate(segments, (index) {
          final threshold = (index + 1) / segments * 1.2;
          final isActive = clampedLevel >= (threshold - (1.2 / segments));
          final isPeak = (clampedPeak >= (threshold - (1.2 / segments * 0.5))) &&
              (clampedPeak <= threshold);

          Color activeColor;
          Color inactiveColor;

          if (index >= segments - 2) {
            // Clip / Overload zone (+3dB to +6dB)
            activeColor = DJColors.vuRed;
            inactiveColor = const Color(0x33FF1744);
          } else if (index >= segments - 5) {
            // Warning zone (0dB to +3dB)
            activeColor = DJColors.vuAmber;
            inactiveColor = const Color(0x33FFAB00);
          } else {
            // Safe signal zone (-20dB to 0dB)
            activeColor = DJColors.vuGreen;
            inactiveColor = const Color(0x3300E676);
          }

          final ledColor = isActive || isPeak ? activeColor : inactiveColor;
          final ledGlow = (isActive || isPeak)
              ? [
                  BoxShadow(
                    color: activeColor.withOpacity(0.6),
                    blurRadius: 4,
                    spreadRadius: 0.5,
                  )
                ]
              : null;

          return Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 1),
              decoration: BoxDecoration(
                color: ledColor,
                borderRadius: BorderRadius.circular(1.5),
                boxShadow: ledGlow,
              ),
            ),
          );
        }),
      ),
    );
  }
}
