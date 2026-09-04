import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class RotaryKnob extends StatefulWidget {
  final double value; // normalized or mapped value
  final double min;
  final double max;
  final double defaultValue;
  final String label;
  final String? valueDisplay;
  final Color activeColor;
  final bool isBipolar; // center 12 o'clock is 0 / default
  final double size;
  final ValueChanged<double> onChanged;

  const RotaryKnob({
    super.key,
    required this.value,
    this.min = 0.0,
    this.max = 1.0,
    this.defaultValue = 0.5,
    required this.label,
    this.valueDisplay,
    this.activeColor = DJColors.deckA,
    this.isBipolar = false,
    this.size = 52.0,
    required this.onChanged,
  });

  @override
  State<RotaryKnob> createState() => _RotaryKnobState();
}

class _RotaryKnobState extends State<RotaryKnob> {
  double _dragStartY = 0.0;
  double _dragStartValue = 0.0;

  @override
  Widget build(BuildContext context) {
    // Fraction between min and max (0.0 to 1.0)
    final fraction = ((widget.value - widget.min) / (widget.max - widget.min))
        .clamp(0.0, 1.0);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onDoubleTap: () => widget.onChanged(widget.defaultValue),
          onVerticalDragStart: (details) {
            _dragStartY = details.localPosition.dy;
            _dragStartValue = widget.value;
          },
          onVerticalDragUpdate: (details) {
            final deltaY = _dragStartY - details.localPosition.dy;
            final range = widget.max - widget.min;
            // 150px drag traverses full range
            final sensitivity = range / 150.0;
            final newValue = (_dragStartValue + deltaY * sensitivity)
                .clamp(widget.min, widget.max);
            widget.onChanged(newValue);
          },
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: CustomPaint(
              painter: _KnobPainter(
                fraction: fraction,
                isBipolar: widget.isBipolar,
                activeColor: widget.activeColor,
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          widget.label,
          style: DJTypography.knobLabel,
          textAlign: TextAlign.center,
        ),
        if (widget.valueDisplay != null) ...[
          const SizedBox(height: 2),
          Text(
            widget.valueDisplay!,
            style: DJTypography.digitalDisplaySmall.copyWith(fontSize: 10),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}

class _KnobPainter extends CustomPainter {
  final double fraction; // 0.0 to 1.0
  final bool isBipolar;
  final Color activeColor;

  _KnobPainter({
    required this.fraction,
    required this.isBipolar,
    required this.activeColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final arcRadius = radius - 4;

    // Angle span: from 135 deg to 405 deg (270 deg total travel)
    const startAngle = 135.0 * math.pi / 180.0;
    const sweepAngle = 270.0 * math.pi / 180.0;
    const topAngle = 270.0 * math.pi / 180.0; // 12 o'clock

    // 1. Draw outer arc track (inactive)
    final trackPaint = Paint()
      ..color = DJColors.surfaceBorder
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: arcRadius),
      startAngle,
      sweepAngle,
      false,
      trackPaint,
    );

    // 2. Draw active arc
    final activePaint = Paint()
      ..color = activeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;

    if (isBipolar) {
      // From 12 o'clock to current position
      final currentAngle = startAngle + fraction * sweepAngle;
      final bipolarSweep = currentAngle - topAngle;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: arcRadius),
        topAngle,
        bipolarSweep,
        false,
        activePaint,
      );
    } else {
      // From 7 o'clock to current position
      final activeSweep = fraction * sweepAngle;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: arcRadius),
        startAngle,
        activeSweep,
        false,
        activePaint,
      );
    }

    // 3. Draw knob body (dark metallic dial)
    final dialRadius = radius - 8;
    final bodyPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          DJColors.surfaceElevated,
          DJColors.surface,
          DJColors.background,
        ],
        stops: const [0.0, 0.7, 1.0],
      ).createShader(Rect.fromCircle(center: center, radius: dialRadius));

    canvas.drawCircle(center, dialRadius, bodyPaint);

    final rimPaint = Paint()
      ..color = DJColors.surfaceBorder
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawCircle(center, dialRadius, rimPaint);

    // 4. Draw pointer line / notch
    final pointerAngle = startAngle + fraction * sweepAngle;
    final pointerLength = dialRadius * 0.75;
    final pointerStart = Offset(
      center.dx + (dialRadius * 0.25) * math.cos(pointerAngle),
      center.dy + (dialRadius * 0.25) * math.sin(pointerAngle),
    );
    final pointerEnd = Offset(
      center.dx + pointerLength * math.cos(pointerAngle),
      center.dy + pointerLength * math.sin(pointerAngle),
    );

    final pointerPaint = Paint()
      ..color = activeColor
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(pointerStart, pointerEnd, pointerPaint);
  }

  @override
  bool shouldRepaint(covariant _KnobPainter oldDelegate) {
    return oldDelegate.fraction != fraction ||
        oldDelegate.isBipolar != isBipolar ||
        oldDelegate.activeColor != activeColor;
  }
}
