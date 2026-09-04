import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class PrecisionFader extends StatefulWidget {
  final double value; // 0.0 to 1.0 (or mapped)
  final double min;
  final double max;
  final double defaultValue;
  final String label;
  final Color activeColor;
  final double width;
  final double height;
  final bool hasCenterDetent;
  final ValueChanged<double> onChanged;

  const PrecisionFader({
    super.key,
    required this.value,
    this.min = 0.0,
    this.max = 1.0,
    this.defaultValue = 1.0,
    required this.label,
    this.activeColor = DJColors.deckA,
    this.width = 44.0,
    this.height = 160.0,
    this.hasCenterDetent = false,
    required this.onChanged,
  });

  @override
  State<PrecisionFader> createState() => _PrecisionFaderState();
}

class _PrecisionFaderState extends State<PrecisionFader> {
  @override
  Widget build(BuildContext context) {
    final fraction = ((widget.value - widget.min) / (widget.max - widget.min))
        .clamp(0.0, 1.0);
    final isCenter = widget.hasCenterDetent && (fraction - 0.5).abs() < 0.015;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.label,
          style: DJTypography.knobLabel,
        ),
        const SizedBox(height: 4),
        GestureDetector(
          onDoubleTap: () => widget.onChanged(widget.defaultValue),
          onVerticalDragUpdate: (details) {
            final RenderBox box = context.findRenderObject() as RenderBox;
            final localPos = box.globalToLocal(details.globalPosition);
            // fader starts at bottom (0.0) to top (1.0)
            final trackHeight = widget.height - 32; // padding for thumb
            final touchY = (localPos.dy - 16).clamp(0.0, trackHeight);
            final invertedFrac = 1.0 - (touchY / trackHeight);

            // Center detent magnetic snap
            double newFrac = invertedFrac;
            if (widget.hasCenterDetent && (invertedFrac - 0.5).abs() < 0.035) {
              newFrac = 0.5;
            }

            final newValue =
                widget.min + newFrac * (widget.max - widget.min);
            widget.onChanged(newValue);
          },
          child: Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              color: DJColors.background,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: DJColors.surfaceBorder, width: 1),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Track slot
                Container(
                  width: 5,
                  height: widget.height - 24,
                  decoration: BoxDecoration(
                    color: DJColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(2.5),
                  ),
                ),
                // Center Detent LED indicator
                if (widget.hasCenterDetent)
                  Positioned(
                    top: (widget.height / 2) - 3,
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isCenter ? widget.activeColor : DJColors.surfaceBorder,
                        boxShadow: isCenter
                            ? [
                                BoxShadow(
                                  color: widget.activeColor.withOpacity(0.8),
                                  blurRadius: 6,
                                  spreadRadius: 1,
                                )
                              ]
                            : null,
                      ),
                    ),
                  ),
                // Fader Thumb / Cap
                Positioned(
                  bottom: fraction * (widget.height - 36),
                  child: Container(
                    width: widget.width - 8,
                    height: 28,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0xFF32374E),
                          Color(0xFF1E2130),
                          Color(0xFF13151F),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: isCenter
                            ? widget.activeColor
                            : DJColors.surfaceBorder,
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.6),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Center(
                      // Thumb center indicator line
                      child: Container(
                        width: widget.width - 16,
                        height: 2,
                        decoration: BoxDecoration(
                          color: widget.activeColor,
                          boxShadow: [
                            BoxShadow(
                              color: widget.activeColor.withOpacity(0.7),
                              blurRadius: 3,
                            )
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
