import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

enum JogWheelMode {
  vinylScratch,
  pitchBend,
  cdjSearch,
}

class JogWheelWidget extends StatefulWidget {
  final double angle; // 0 to 2*PI rotational angle
  final bool isPlaying;
  final JogWheelMode mode;
  final Color accentColor;
  final String assetImage;
  final double size;
  final Function(double angularDelta, bool isCenterTouch) onJogTouchMove;
  final VoidCallback onTouchDown;
  final Function(double releaseVelocity) onTouchUp;

  const JogWheelWidget({
    super.key,
    required this.angle,
    required this.isPlaying,
    this.mode = JogWheelMode.vinylScratch,
    this.accentColor = DJColors.deckA,
    required this.assetImage,
    this.size = 200.0,
    required this.onJogTouchMove,
    required this.onTouchDown,
    required this.onTouchUp,
  });

  @override
  State<JogWheelWidget> createState() => _JogWheelWidgetState();
}

class _JogWheelWidgetState extends State<JogWheelWidget> {
  double? _lastTouchAngle;
  DateTime? _lastTouchTime;
  double _currentVelocity = 0.0;
  bool _isCenterTouch = true;
  bool _isTouched = false;

  double _getAngleFromOffset(Offset localPos, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final dx = localPos.dx - center.dx;
    final dy = localPos.dy - center.dy;
    return math.atan2(dy, dx);
  }

  double _getDistanceFromCenter(Offset localPos, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final dx = localPos.dx - center.dx;
    final dy = localPos.dy - center.dy;
    return math.sqrt(dx * dx + dy * dy);
  }

  void _onPanStart(DragStartDetails details) {
    final box = context.findRenderObject() as RenderBox;
    final localPos = box.globalToLocal(details.globalPosition);
    final dist = _getDistanceFromCenter(localPos, Size(widget.size, widget.size));
    final radius = widget.size / 2;

    // Center zone = inner 70% of jog wheel
    _isCenterTouch = dist < (radius * 0.72);
    _lastTouchAngle = _getAngleFromOffset(localPos, Size(widget.size, widget.size));
    _lastTouchTime = DateTime.now();
    _currentVelocity = 0.0;

    setState(() {
      _isTouched = true;
    });
    widget.onTouchDown();
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (_lastTouchAngle == null) return;
    final box = context.findRenderObject() as RenderBox;
    final localPos = box.globalToLocal(details.globalPosition);
    final currentAngle = _getAngleFromOffset(localPos, Size(widget.size, widget.size));
    final now = DateTime.now();

    // Calculate angular delta with wrapping around -PI..PI
    var delta = currentAngle - _lastTouchAngle!;
    if (delta > math.pi) delta -= 2 * math.pi;
    if (delta < -math.pi) delta += 2 * math.pi;

    if (_lastTouchTime != null) {
      final dt = (now.difference(_lastTouchTime!).inMicroseconds) / 1000000.0;
      if (dt > 0.001) {
        _currentVelocity = delta / dt; // radians per second
      }
    }

    _lastTouchAngle = currentAngle;
    _lastTouchTime = now;

    widget.onJogTouchMove(delta, _isCenterTouch);
  }

  void _onPanEnd(DragEndDetails details) {
    setState(() {
      _isTouched = false;
    });
    _lastTouchAngle = null;
    _lastTouchTime = null;
    widget.onTouchUp(_currentVelocity);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: _onPanStart,
      onPanUpdate: _onPanUpdate,
      onPanEnd: _onPanEnd,
      onPanCancel: () => _onPanEnd(DragEndDetails()),
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: DJColors.background,
          border: Border.all(
            color: _isTouched ? widget.accentColor : DJColors.surfaceBorder,
            width: _isTouched ? 2.5 : 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: (_isTouched ? widget.accentColor : Colors.black)
                  .withOpacity(_isTouched ? 0.4 : 0.6),
              blurRadius: _isTouched ? 16 : 8,
              spreadRadius: _isTouched ? 2 : 1,
            ),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Rotating Jog Wheel Platter Image
            Transform.rotate(
              angle: widget.angle,
              child: ClipOval(
                child: Image.asset(
                  widget.assetImage,
                  width: widget.size - 8,
                  height: widget.size - 8,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) {
                    // Fallback procedural vinyl disc if asset is loading
                    return Container(
                      width: widget.size - 8,
                      height: widget.size - 8,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: DJColors.surfaceElevated,
                      ),
                      child: Center(
                        child: Icon(
                          Icons.album,
                          size: widget.size * 0.5,
                          color: widget.accentColor.withOpacity(0.5),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            // Outer Platter Position Needle (LED Marker)
            Transform.rotate(
              angle: widget.angle,
              child: Align(
                alignment: Alignment.topCenter,
                child: Container(
                  margin: const EdgeInsets.only(top: 2),
                  width: 5,
                  height: 14,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(2),
                    boxShadow: [
                      BoxShadow(
                        color: widget.accentColor,
                        blurRadius: 6,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Center Hub Display with Mode Badge & State
            Container(
              width: widget.size * 0.36,
              height: widget.size * 0.36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: DJColors.background.withOpacity(0.92),
                border: Border.all(
                  color: _isTouched ? widget.accentColor : DJColors.surfaceBorder,
                  width: 1.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.8),
                    blurRadius: 6,
                  ),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    widget.isPlaying
                        ? Icons.play_arrow_rounded
                        : Icons.pause_rounded,
                    color: widget.isPlaying
                        ? DJColors.vuGreen
                        : DJColors.textSecondary,
                    size: 18,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.mode == JogWheelMode.vinylScratch
                        ? 'VINYL'
                        : (widget.mode == JogWheelMode.pitchBend
                            ? 'BEND'
                            : 'SEARCH'),
                    style: DJTypography.knobLabel.copyWith(
                      color: widget.accentColor,
                      fontSize: 8,
                      fontWeight: FontWeight.bold,
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
