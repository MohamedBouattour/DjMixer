import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

enum FXType {
  filter('FILTER', Icons.waves),
  echo('ECHO / DELAY', Icons.repeat),
  reverb('REVERB', Icons.grain),
  flanger('FLANGER', Icons.air),
  bitcrusher('BITCRUSHER', Icons.grid_on),
  brake('VINYL BRAKE', Icons.stop_circle_outlined),
  roll('BEAT ROLL', Icons.speed);

  final String label;
  final IconData icon;
  const FXType(this.label, this.icon);
}

class XYTouchFxPad extends StatefulWidget {
  final FXType selectedFx;
  final double x; // 0.0 to 1.0
  final double y; // 0.0 to 1.0
  final bool isHoldActive;
  final bool isTouched;
  final ValueChanged<FXType> onSelectFx;
  final Function(double x, double y) onUpdateCoordinates;
  final ValueChanged<bool> onToggleHold;
  final VoidCallback onTouchDown;
  final VoidCallback onTouchUp;

  const XYTouchFxPad({
    super.key,
    required this.selectedFx,
    required this.x,
    required this.y,
    required this.isHoldActive,
    required this.isTouched,
    required this.onSelectFx,
    required this.onUpdateCoordinates,
    required this.onToggleHold,
    required this.onTouchDown,
    required this.onTouchUp,
  });

  @override
  State<XYTouchFxPad> createState() => _XYTouchFxPadState();
}

class _XYTouchFxPadState extends State<XYTouchFxPad> {
  void _handleTouch(Offset localPos, Size size) {
    final newX = (localPos.dx / size.width).clamp(0.0, 1.0);
    final newY = (1.0 - (localPos.dy / size.height)).clamp(0.0, 1.0); // Y: 0 at bottom, 1 at top
    widget.onUpdateCoordinates(newX, newY);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Top FX Selector Chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: FXType.values.map((fx) {
              final isSelected = widget.selectedFx == fx;
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: GestureDetector(
                  onTap: () => widget.onSelectFx(fx),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? DJColors.deckA.withOpacity(0.2)
                          : DJColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: isSelected ? DJColors.deckA : DJColors.surfaceBorder,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          fx.icon,
                          size: 11,
                          color: isSelected ? DJColors.deckA : DJColors.textSecondary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          fx.label,
                          style: DJTypography.buttonLabel.copyWith(
                            fontSize: 9,
                            color: isSelected ? DJColors.deckA : DJColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 8),
        // XY Touch Surface
        LayoutBuilder(
          builder: (context, constraints) {
            final padWidth = constraints.maxWidth;
            const padHeight = 150.0;

            return GestureDetector(
              onPanStart: (details) {
                widget.onTouchDown();
                _handleTouch(details.localPosition, Size(padWidth, padHeight));
              },
              onPanUpdate: (details) {
                _handleTouch(details.localPosition, Size(padWidth, padHeight));
              },
              onPanEnd: (_) {
                widget.onTouchUp();
              },
              onPanCancel: widget.onTouchUp,
              child: Container(
                width: padWidth,
                height: padHeight,
                decoration: BoxDecoration(
                  color: DJColors.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: (widget.isTouched || widget.isHoldActive)
                        ? DJColors.deckA
                        : DJColors.surfaceBorder,
                    width: (widget.isTouched || widget.isHoldActive) ? 1.5 : 1.0,
                  ),
                  boxShadow: (widget.isTouched || widget.isHoldActive)
                      ? [
                          BoxShadow(
                            color: DJColors.deckA.withOpacity(0.3),
                            blurRadius: 10,
                          ),
                        ]
                      : null,
                ),
                child: Stack(
                  children: [
                    // Grid Crosshairs
                    CustomPaint(
                      size: Size(padWidth, padHeight),
                      painter: _XYGridPainter(),
                    ),
                    // Hold & Active readout
                    Positioned(
                      top: 8,
                      left: 10,
                      child: Row(
                        children: [
                          GestureDetector(
                            onTap: () => widget.onToggleHold(!widget.isHoldActive),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: widget.isHoldActive
                                    ? DJColors.vuAmber.withOpacity(0.3)
                                    : DJColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(
                                  color: widget.isHoldActive
                                      ? DJColors.vuAmber
                                      : DJColors.surfaceBorder,
                                ),
                              ),
                              child: Text(
                                'HOLD',
                                style: DJTypography.buttonLabel.copyWith(
                                  fontSize: 8,
                                  color: widget.isHoldActive
                                      ? DJColors.vuAmber
                                      : DJColors.textMuted,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'X: ${(widget.x * 100).toInt()}%  Y: ${(widget.y * 100).toInt()}%',
                            style: DJTypography.digitalDisplaySmall.copyWith(
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                    // Touch point glowing indicator
                    if (widget.isTouched || widget.isHoldActive)
                      Positioned(
                        left: (widget.x * padWidth) - 16,
                        top: ((1.0 - widget.y) * padHeight) - 16,
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: DJColors.deckA.withOpacity(0.3),
                            boxShadow: [
                              BoxShadow(
                                color: DJColors.deckA.withOpacity(0.8),
                                blurRadius: 12,
                                spreadRadius: 3,
                              ),
                            ],
                          ),
                          child: Center(
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _XYGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = DJColors.surfaceBorder.withOpacity(0.4)
      ..strokeWidth = 1.0;

    // 4 vertical divisions
    for (int i = 1; i < 4; i++) {
      final x = size.width * (i / 4.0);
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    // 3 horizontal divisions
    for (int i = 1; i < 3; i++) {
      final y = size.height * (i / 3.0);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
