import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';
import '../components/neon_button.dart';

class LoopControlStrip extends StatelessWidget {
  final double currentLoopLength; // in beats (e.g., 0.25, 0.5, 1, 2, 4, 8, 16, 32)
  final bool isLoopActive;
  final bool isLoopRollActive;
  final ValueChanged<double> onSelectLoopLength;
  final VoidCallback onToggleLoop;
  final VoidCallback onHalveLoop;
  final VoidCallback onDoubleLoop;
  final VoidCallback onLoopIn;
  final VoidCallback onLoopOut;
  final VoidCallback onLoopRollStart;
  final VoidCallback onLoopRollEnd;
  final Function(int beatOffset) onBeatJump;
  final Color accentColor;

  const LoopControlStrip({
    super.key,
    required this.currentLoopLength,
    required this.isLoopActive,
    this.isLoopRollActive = false,
    required this.onSelectLoopLength,
    required this.onToggleLoop,
    required this.onHalveLoop,
    required this.onDoubleLoop,
    required this.onLoopIn,
    required this.onLoopOut,
    required this.onLoopRollStart,
    required this.onLoopRollEnd,
    required this.onBeatJump,
    this.accentColor = DJColors.deckA,
  });

  String _formatBeats(double beats) {
    if (beats < 1.0) {
      final denom = (1.0 / beats).round();
      return '1/$denom';
    }
    return '${beats.toInt()}';
  }

  @override
  Widget build(BuildContext context) {
    final loopSizes = [0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0];

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Title & Loop In/Out Buttons
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'LOOP / BEAT JUMP',
              style: DJTypography.knobLabel,
            ),
            Row(
              children: [
                NeonButton(
                  label: 'IN',
                  width: 38,
                  height: 26,
                  fontSize: 9,
                  onTap: onLoopIn,
                  activeColor: accentColor,
                ),
                const SizedBox(width: 4),
                NeonButton(
                  label: 'OUT',
                  width: 38,
                  height: 26,
                  fontSize: 9,
                  onTap: onLoopOut,
                  activeColor: accentColor,
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 6),
        // Quick Loop Selector Pills (horizontal scroll)
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: loopSizes.map((size) {
              final isSelected = (currentLoopLength - size).abs() < 0.001;
              return Padding(
                padding: const EdgeInsets.only(right: 4),
                child: GestureDetector(
                  onTap: () => onSelectLoopLength(size),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                    decoration: BoxDecoration(
                      color: isSelected && isLoopActive
                          ? accentColor
                          : (isSelected
                              ? accentColor.withOpacity(0.2)
                              : DJColors.surfaceElevated),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: isSelected ? accentColor : DJColors.surfaceBorder,
                      ),
                    ),
                    child: Text(
                      _formatBeats(size),
                      style: DJTypography.buttonLabel.copyWith(
                        fontSize: 9,
                        color: isSelected && isLoopActive
                            ? Colors.black
                            : (isSelected ? accentColor : DJColors.textSecondary),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 6),
        // Action Strip: /2, Loop Activate, 2X, ROLL, Beat Jump -4, +4
        Row(
          children: [
            // Halve Loop (/2)
            NeonButton(
              label: '1/2',
              width: 36,
              height: 32,
              fontSize: 10,
              onTap: onHalveLoop,
              activeColor: accentColor,
            ),
            const SizedBox(width: 4),
            // Master Loop Toggle
            Expanded(
              child: NeonButton(
                label: isLoopActive ? 'ACTIVE (${_formatBeats(currentLoopLength)})' : 'AUTO LOOP',
                isActive: isLoopActive,
                activeColor: accentColor,
                height: 32,
                fontSize: 10,
                onTap: onToggleLoop,
              ),
            ),
            const SizedBox(width: 4),
            // Double Loop (2X)
            NeonButton(
              label: '2X',
              width: 36,
              height: 32,
              fontSize: 10,
              onTap: onDoubleLoop,
              activeColor: accentColor,
            ),
            const SizedBox(width: 6),
            // Momentary Slip Loop Roll Button
            NeonButton(
              label: 'ROLL',
              isActive: isLoopRollActive,
              activeColor: DJColors.vuAmber,
              width: 46,
              height: 32,
              fontSize: 10,
              onTapDown: onLoopRollStart,
              onTapUp: onLoopRollEnd,
            ),
            const SizedBox(width: 6),
            // Beat Jump -4 & +4
            NeonButton(
              label: '◀ 4',
              width: 36,
              height: 32,
              fontSize: 9,
              onTap: () => onBeatJump(-4),
              activeColor: DJColors.textSecondary,
            ),
            const SizedBox(width: 4),
            NeonButton(
              label: '4 ▶',
              width: 36,
              height: 32,
              fontSize: 9,
              onTap: () => onBeatJump(4),
              activeColor: DJColors.textSecondary,
            ),
          ],
        ),
      ],
    );
  }
}
