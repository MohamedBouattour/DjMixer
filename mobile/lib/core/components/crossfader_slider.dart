import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

enum CrossfaderCurve {
  linear,
  exponential,
  sharpCut,
}

class CrossfaderSlider extends StatelessWidget {
  final double position; // -1.0 (Left Deck A) to +1.0 (Right Deck B)
  final CrossfaderCurve curve;
  final bool isHamsterReverse;
  final ValueChanged<double> onChanged;
  final double width;
  final double height;

  const CrossfaderSlider({
    super.key,
    required this.position,
    this.curve = CrossfaderCurve.linear,
    this.isHamsterReverse = false,
    required this.onChanged,
    this.width = 240.0,
    this.height = 48.0,
  });

  /// Calculates channel volumes (Deck A gain, Deck B gain) based on selected curve
  static (double, double) calculateGains(
    double pos,
    CrossfaderCurve curveType,
    bool hamster,
  ) {
    // If hamster switch is active, invert position
    final effectivePos = hamster ? -pos : pos;
    // Map -1.0..+1.0 to 0.0..1.0
    final t = (effectivePos + 1.0) / 2.0;

    double gainA = 1.0;
    double gainB = 1.0;

    switch (curveType) {
      case CrossfaderCurve.linear:
        // Equal power smooth blend
        gainA = math.cos(t * math.pi / 2.0);
        gainB = math.sin(t * math.pi / 2.0);
        break;

      case CrossfaderCurve.exponential:
        // Smooth transition curve (stays higher in center)
        if (t <= 0.5) {
          gainA = 1.0;
          gainB = math.pow(t * 2.0, 2.0).toDouble();
        } else {
          gainA = math.pow((1.0 - t) * 2.0, 2.0).toDouble();
          gainB = 1.0;
        }
        break;

      case CrossfaderCurve.sharpCut:
        // Scratch cut: reaches full volume within 4% cut-in distance
        const cutIn = 0.04;
        if (t < cutIn) {
          gainA = 1.0;
          gainB = 0.0;
        } else if (t > 1.0 - cutIn) {
          gainA = 0.0;
          gainB = 1.0;
        } else {
          gainA = 1.0;
          gainB = 1.0;
        }
        break;
    }

    return (gainA.clamp(0.0, 1.0), gainB.clamp(0.0, 1.0));
  }

  @override
  Widget build(BuildContext context) {
    // Map -1.0..1.0 to fraction 0.0..1.0
    final fraction = ((position + 1.0) / 2.0).clamp(0.0, 1.0);
    final isCenter = position.abs() < 0.03;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              isHamsterReverse ? 'B' : 'A',
              style: DJTypography.deckLabel.copyWith(
                color: isHamsterReverse ? DJColors.deckB : DJColors.deckA,
                fontSize: 12,
              ),
            ),
            Text(
              'CROSSFADER',
              style: DJTypography.knobLabel,
            ),
            Text(
              isHamsterReverse ? 'A' : 'B',
              style: DJTypography.deckLabel.copyWith(
                color: isHamsterReverse ? DJColors.deckA : DJColors.deckB,
                fontSize: 12,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        GestureDetector(
          onDoubleTap: () => onChanged(0.0), // center snap
          onHorizontalDragUpdate: (details) {
            final RenderBox box = context.findRenderObject() as RenderBox;
            final localPos = box.globalToLocal(details.globalPosition);
            final trackWidth = width - 40;
            final touchX = (localPos.dx - 20).clamp(0.0, trackWidth);
            final frac = touchX / trackWidth;
            var newPos = (frac * 2.0) - 1.0;

            // Center detent snap
            if (newPos.abs() < 0.05) {
              newPos = 0.0;
            }
            onChanged(newPos.clamp(-1.0, 1.0));
          },
          child: Container(
            width: width,
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: DJColors.background,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: DJColors.surfaceBorder, width: 1.2),
            ),
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                // Track groove
                Center(
                  child: Container(
                    height: 5,
                    width: width - 24,
                    decoration: BoxDecoration(
                      color: DJColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(2.5),
                    ),
                  ),
                ),
                // Center detent tick
                Center(
                  child: Container(
                    width: 2,
                    height: 14,
                    color: isCenter ? DJColors.textPrimary : DJColors.surfaceBorder,
                  ),
                ),
                // Thumb Cap
                Positioned(
                  left: fraction * (width - 44),
                  child: Container(
                    width: 36,
                    height: height - 12,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [
                          Color(0xFF383D54),
                          Color(0xFF222534),
                          Color(0xFF141620),
                        ],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(5),
                      border: Border.all(
                        color: isCenter
                            ? DJColors.textPrimary
                            : DJColors.surfaceBorder,
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.7),
                          blurRadius: 5,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Container(
                        width: 2.5,
                        height: height - 22,
                        decoration: BoxDecoration(
                          color: position < 0
                              ? DJColors.deckA
                              : (position > 0 ? DJColors.deckB : Colors.white),
                          boxShadow: [
                            BoxShadow(
                              color: (position < 0
                                      ? DJColors.deckA
                                      : (position > 0
                                          ? DJColors.deckB
                                          : Colors.white))
                                  .withOpacity(0.8),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
