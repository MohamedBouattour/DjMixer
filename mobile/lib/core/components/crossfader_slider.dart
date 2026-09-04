import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

enum CrossfaderCurve {
  linear,
  exponential,
  sharpCut,
}

class CrossfaderSlider extends StatefulWidget {
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
    this.height = 46.0,
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
  State<CrossfaderSlider> createState() => _CrossfaderSliderState();
}

class _CrossfaderSliderState extends State<CrossfaderSlider> {
  static const double _thumbWidth = 36.0;
  static const double _paddingH = 4.0;

  double? _grabOffsetInThumb;
  bool _isInteracting = false;

  void _updatePosition(double localX, double maxTravel) {
    final offset = _grabOffsetInThumb ?? (_thumbWidth / 2.0);
    final targetThumbLeft = localX - offset - _paddingH;
    final t = (targetThumbLeft / maxTravel).clamp(0.0, 1.0);
    var newPos = (t * 2.0) - 1.0;

    // Center detent magnetic snap: snaps cleanly when within 4%
    if (newPos.abs() < 0.04) {
      newPos = 0.0;
    }

    widget.onChanged(newPos.clamp(-1.0, 1.0));
  }

  @override
  Widget build(BuildContext context) {
    final maxTravel = widget.width - (2 * _paddingH) - _thumbWidth;
    final fraction = ((widget.position + 1.0) / 2.0).clamp(0.0, 1.0);
    final currentThumbLeft = _paddingH + (fraction * maxTravel);
    final isCenter = widget.position.abs() < 0.03;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: widget.width,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                widget.isHamsterReverse ? 'B' : 'A',
                style: DJTypography.deckLabel.copyWith(
                  color: widget.isHamsterReverse ? DJColors.deckB : DJColors.deckA,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'CROSSFADER',
                    style: DJTypography.knobLabel.copyWith(fontSize: 9, letterSpacing: 1.2),
                  ),
                  if (isCenter) ...[
                    const SizedBox(width: 4),
                    Container(
                      width: 5,
                      height: 5,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: DJColors.vuGreen,
                      ),
                    ),
                  ],
                ],
              ),
              Text(
                widget.isHamsterReverse ? 'A' : 'B',
                style: DJTypography.deckLabel.copyWith(
                  color: widget.isHamsterReverse ? DJColors.deckA : DJColors.deckB,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 3),
        MouseRegion(
          cursor: SystemMouseCursors.resizeLeftRight,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onDoubleTap: () => widget.onChanged(0.0), // Center snap
            onTapDown: (details) {
              final localX = details.localPosition.dx;
              if (localX >= currentThumbLeft && localX <= currentThumbLeft + _thumbWidth) {
                _grabOffsetInThumb = localX - currentThumbLeft;
              } else {
                _grabOffsetInThumb = _thumbWidth / 2.0;
                _updatePosition(localX, maxTravel);
              }
              setState(() => _isInteracting = true);
            },
            onHorizontalDragStart: (details) {
              final localX = details.localPosition.dx;
              if (localX >= currentThumbLeft && localX <= currentThumbLeft + _thumbWidth) {
                _grabOffsetInThumb = localX - currentThumbLeft;
              } else {
                _grabOffsetInThumb = _thumbWidth / 2.0;
                _updatePosition(localX, maxTravel);
              }
              setState(() => _isInteracting = true);
            },
            onHorizontalDragUpdate: (details) {
              _updatePosition(details.localPosition.dx, maxTravel);
            },
            onHorizontalDragEnd: (_) {
              setState(() {
                _grabOffsetInThumb = null;
                _isInteracting = false;
              });
            },
            onHorizontalDragCancel: () {
              setState(() {
                _grabOffsetInThumb = null;
                _isInteracting = false;
              });
            },
            child: Container(
              width: widget.width,
              height: widget.height,
              padding: const EdgeInsets.symmetric(horizontal: _paddingH),
              decoration: BoxDecoration(
                color: DJColors.background,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: _isInteracting ? DJColors.deckA.withOpacity(0.6) : DJColors.surfaceBorder,
                  width: 1.2,
                ),
              ),
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  // Track groove slot
                  Center(
                    child: Container(
                      height: 5,
                      width: widget.width - 16,
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
                      height: 16,
                      color: isCenter ? DJColors.vuGreen : DJColors.surfaceBorder,
                    ),
                  ),
                  // Left & Right boundary markers
                  Positioned(
                    left: _paddingH + 4,
                    child: Container(width: 1.5, height: 10, color: DJColors.deckA.withOpacity(0.4)),
                  ),
                  Positioned(
                    right: _paddingH + 4,
                    child: Container(width: 1.5, height: 10, color: DJColors.deckB.withOpacity(0.4)),
                  ),
                  // Thumb Fader Cap
                  Positioned(
                    left: currentThumbLeft - _paddingH,
                    child: Container(
                      width: _thumbWidth,
                      height: widget.height - 10,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: _isInteracting
                              ? [
                                  const Color(0xFF4A516E),
                                  const Color(0xFF2E3347),
                                  const Color(0xFF1E2130),
                                ]
                              : [
                                  const Color(0xFF383D54),
                                  const Color(0xFF222534),
                                  const Color(0xFF141620),
                                ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: isCenter
                              ? DJColors.vuGreen
                              : (_isInteracting ? DJColors.deckA : DJColors.surfaceBorder),
                          width: 1.4,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.7),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                          if (_isInteracting)
                            BoxShadow(
                              color: (widget.position < 0
                                      ? DJColors.deckA
                                      : (widget.position > 0 ? DJColors.deckB : DJColors.vuGreen))
                                  .withOpacity(0.35),
                              blurRadius: 6,
                            ),
                        ],
                      ),
                      child: Center(
                        child: Container(
                          width: 2.5,
                          height: widget.height - 20,
                          decoration: BoxDecoration(
                            color: widget.position < 0
                                ? DJColors.deckA
                                : (widget.position > 0 ? DJColors.deckB : DJColors.vuGreen),
                            borderRadius: BorderRadius.circular(1),
                            boxShadow: [
                              BoxShadow(
                                color: (widget.position < 0
                                        ? DJColors.deckA
                                        : (widget.position > 0 ? DJColors.deckB : DJColors.vuGreen))
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
        ),
      ],
    );
  }
}
