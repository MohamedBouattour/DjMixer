import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class BpmCounterDisplay extends StatelessWidget {
  final double bpm;
  final double pitchPercent;
  final String musicalKey;
  final Duration elapsed;
  final Duration duration;
  final bool isRemainingTime;
  final Color accentColor;
  final VoidCallback? onToggleTimeMode;

  const BpmCounterDisplay({
    super.key,
    required this.bpm,
    required this.pitchPercent,
    required this.musicalKey,
    required this.elapsed,
    required this.duration,
    this.isRemainingTime = true,
    this.accentColor = DJColors.deckA,
    this.onToggleTimeMode,
  });

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    final millis = (d.inMilliseconds.remainder(1000) ~/ 100).toString();
    return '$minutes:$seconds.$millis';
  }

  @override
  Widget build(BuildContext context) {
    final displayTime = isRemainingTime
        ? (duration > elapsed ? duration - elapsed : Duration.zero)
        : elapsed;
    final timePrefix = isRemainingTime ? '-' : '';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: DJColors.background,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: DJColors.surfaceBorder, width: 1),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // BPM Section
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'BPM',
                  style: DJTypography.knobLabel.copyWith(fontSize: 8),
                ),
                Text(
                  bpm.toStringAsFixed(2),
                  style: DJTypography.digitalDisplay.copyWith(
                    color: accentColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 8),
            // Pitch % Section
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'PITCH',
                  style: DJTypography.knobLabel.copyWith(fontSize: 8),
                ),
                Text(
                  '${pitchPercent >= 0 ? "+" : ""}${pitchPercent.toStringAsFixed(1)}%',
                  style: DJTypography.digitalDisplaySmall.copyWith(
                    color: pitchPercent.abs() < 0.01
                        ? DJColors.textSecondary
                        : (pitchPercent > 0 ? DJColors.vuAmber : DJColors.deckA),
                    fontSize: 11,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 8),
            // Key Section
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'KEY',
                  style: DJTypography.knobLabel.copyWith(fontSize: 8),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: accentColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Text(
                    musicalKey,
                    style: DJTypography.digitalDisplaySmall.copyWith(
                      color: accentColor,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 12),
            // Time readout
            GestureDetector(
              onTap: onToggleTimeMode,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isRemainingTime ? 'REMAIN' : 'ELAPSED',
                    style: DJTypography.knobLabel.copyWith(fontSize: 8),
                  ),
                  Text(
                    '$timePrefix${_formatDuration(displayTime)}',
                    style: DJTypography.digitalDisplay.copyWith(
                      fontSize: 14,
                      color: DJColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
