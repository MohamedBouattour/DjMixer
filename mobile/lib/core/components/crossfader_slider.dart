import 'dart:math' as math;
import 'package:flutter/gestures.dart';
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

/// Horizontal drag recognizer that claims the pointer as soon as it goes down.
///
/// The default recognizer waits for 18 logical pixels of travel before it
/// reports anything, and then reports the post-slop position. For a 36px fader
/// cap that meant the grab point was recomputed half a cap away from where the
/// finger actually landed, so the cap jumped sideways the instant a drag
/// started. Claiming immediately gives exact 1:1 tracking from the first pixel
/// and still beats a parent scrollable to the gesture.
class _ImmediateHorizontalDragRecognizer
    extends HorizontalDragGestureRecognizer {
  _ImmediateHorizontalDragRecognizer({super.debugOwner});

  @override
  void addAllowedPointer(PointerDownEvent event) {
    super.addAllowedPointer(event);
    resolve(GestureDisposition.accepted);
  }

  @override
  String get debugDescription => 'immediate horizontal drag';
}

class _CrossfaderSliderState extends State<CrossfaderSlider> {
  static const double _thumbWidth = 36.0;
  static const double _paddingH = 4.0;

  /// Where inside the cap the finger landed, so the cap stays put under it.
  double _grabOffsetInThumb = _thumbWidth / 2.0;
  bool _isInteracting = false;

  /// Manual double-tap detection: claiming the pointer immediately means a
  /// DoubleTapGestureRecognizer would never get a look in. Only a gesture that
  /// ended without moving counts as a tap, so a quick series of cuts is not
  /// mistaken for a double tap back to centre.
  int _lastTapUpMicros = 0;
  double _lastTapX = 0;
  double _dragStartX = 0;
  bool _movedDuringDrag = false;

  double _maxTravel(double width) => width - (2 * _paddingH) - _thumbWidth;

  double _thumbLeft(double width) {
    final fraction = ((widget.position + 1.0) / 2.0).clamp(0.0, 1.0);
    return _paddingH + fraction * _maxTravel(width);
  }

  void _emit(double localX, double width) {
    final maxTravel = _maxTravel(width);
    if (maxTravel <= 0) return;
    final targetThumbLeft = localX - _grabOffsetInThumb - _paddingH;
    final t = (targetThumbLeft / maxTravel).clamp(0.0, 1.0);
    var newPos = (t * 2.0) - 1.0;

    // Magnetic centre detent, as on a club mixer.
    if (newPos.abs() < 0.04) newPos = 0.0;

    if (newPos != widget.position) {
      widget.onChanged(newPos.clamp(-1.0, 1.0));
    }
  }

  void _onDragStart(double localX, double width) {
    final now = DateTime.now().microsecondsSinceEpoch;
    if (now - _lastTapUpMicros < 300000 && (localX - _lastTapX).abs() < 24) {
      _lastTapUpMicros = 0;
      _grabOffsetInThumb = _thumbWidth / 2.0;
      widget.onChanged(0.0); // double tap snaps back to centre
      setState(() => _isInteracting = false);
      return;
    }
    _dragStartX = localX;
    _movedDuringDrag = false;

    final thumbLeft = _thumbLeft(width);
    if (localX >= thumbLeft && localX <= thumbLeft + _thumbWidth) {
      // Grabbed the cap: keep it exactly where it was relative to the finger.
      _grabOffsetInThumb = localX - thumbLeft;
    } else {
      // Grabbed the track: jump the cap under the finger, then track from there.
      _grabOffsetInThumb = _thumbWidth / 2.0;
      _emit(localX, width);
    }
    setState(() => _isInteracting = true);
  }

  void _onDragEnd() {
    // A gesture that never moved is a tap, and two of those in quick
    // succession centre the fader.
    _lastTapUpMicros =
        _movedDuringDrag ? 0 : DateTime.now().microsecondsSinceEpoch;
    _lastTapX = _dragStartX;
    _grabOffsetInThumb = _thumbWidth / 2.0;
    if (_isInteracting) setState(() => _isInteracting = false);
  }

  @override
  Widget build(BuildContext context) {
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
                  color:
                      widget.isHamsterReverse ? DJColors.deckB : DJColors.deckA,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'CROSSFADER',
                    style: DJTypography.knobLabel
                        .copyWith(fontSize: 9, letterSpacing: 1.2),
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
                  color:
                      widget.isHamsterReverse ? DJColors.deckA : DJColors.deckB,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 3),
        // The parent can be narrower than the requested width (the mixer column
        // on a phone, for instance). Measuring here keeps the cap under the
        // cursor instead of drifting against a stale width.
        LayoutBuilder(
          builder: (context, constraints) {
            final width = math.min(
              widget.width,
              constraints.maxWidth.isFinite ? constraints.maxWidth : widget.width,
            );
            final thumbLeft = _thumbLeft(width);

            return MouseRegion(
              cursor: SystemMouseCursors.resizeLeftRight,
              child: RawGestureDetector(
                behavior: HitTestBehavior.opaque,
                gestures: {
                  _ImmediateHorizontalDragRecognizer:
                      GestureRecognizerFactoryWithHandlers<
                          _ImmediateHorizontalDragRecognizer>(
                    () => _ImmediateHorizontalDragRecognizer(debugOwner: this),
                    (instance) {
                      instance.dragStartBehavior = DragStartBehavior.down;
                      instance.onStart = (details) {
                        _onDragStart(details.localPosition.dx, width);
                      };
                      instance.onUpdate = (details) {
                        if ((details.localPosition.dx - _dragStartX).abs() > 2) {
                          _movedDuringDrag = true;
                        }
                        _emit(details.localPosition.dx, width);
                      };
                      instance.onEnd = (_) => _onDragEnd();
                      instance.onCancel = _onDragEnd;
                    },
                  ),
                },
                child: _buildTrack(width, thumbLeft, isCenter),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildTrack(double width, double thumbLeft, bool isCenter) {
    final accent = widget.position < 0
        ? DJColors.deckA
        : (widget.position > 0 ? DJColors.deckB : DJColors.vuGreen);

    return Container(
      width: width,
      height: widget.height,
      padding: const EdgeInsets.symmetric(horizontal: _paddingH),
      decoration: BoxDecoration(
        color: DJColors.background,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: _isInteracting
              ? DJColors.deckA.withValues(alpha: 0.6)
              : DJColors.surfaceBorder,
          width: 1.2,
        ),
      ),
      child: Stack(
        alignment: Alignment.centerLeft,
        children: [
          Center(
            child: Container(
              height: 5,
              decoration: BoxDecoration(
                color: DJColors.surfaceElevated,
                borderRadius: BorderRadius.circular(2.5),
              ),
            ),
          ),
          Center(
            child: Container(
              width: 2,
              height: 16,
              color: isCenter ? DJColors.vuGreen : DJColors.surfaceBorder,
            ),
          ),
          Positioned(
            left: 4,
            child: Container(
                width: 1.5,
                height: 10,
                color: DJColors.deckA.withValues(alpha: 0.4)),
          ),
          Positioned(
            right: 4,
            child: Container(
                width: 1.5,
                height: 10,
                color: DJColors.deckB.withValues(alpha: 0.4)),
          ),
          Positioned(
            left: thumbLeft - _paddingH,
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
                    color: Colors.black.withValues(alpha: 0.7),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                  if (_isInteracting)
                    BoxShadow(
                        color: accent.withValues(alpha: 0.35), blurRadius: 6),
                ],
              ),
              child: Center(
                child: Container(
                  width: 2.5,
                  height: widget.height - 20,
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(1),
                    boxShadow: [
                      BoxShadow(
                          color: accent.withValues(alpha: 0.8), blurRadius: 4),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
