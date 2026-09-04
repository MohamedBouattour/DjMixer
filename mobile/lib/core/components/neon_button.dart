import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class NeonButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final bool isActive;
  final Color activeColor;
  final VoidCallback? onTap;
  final VoidCallback? onTapDown;
  final VoidCallback? onTapUp;
  final double width;
  final double height;
  final double fontSize;
  final bool isCircular;

  const NeonButton({
    super.key,
    required this.label,
    this.icon,
    this.isActive = false,
    this.activeColor = DJColors.deckA,
    this.onTap,
    this.onTapDown,
    this.onTapUp,
    this.width = 64,
    this.height = 42,
    this.fontSize = 11,
    this.isCircular = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      onTapDown: (_) => onTapDown?.call(),
      onTapUp: (_) => onTapUp?.call(),
      onTapCancel: () => onTapUp?.call(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        width: isCircular ? height : width,
        height: height,
        decoration: BoxDecoration(
          color: isActive
              ? activeColor.withOpacity(0.2)
              : DJColors.surfaceElevated,
          shape: isCircular ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: isCircular ? null : BorderRadius.circular(6),
          border: Border.all(
            color: isActive ? activeColor : DJColors.surfaceBorder,
            width: isActive ? 1.8 : 1.0,
          ),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: activeColor.withOpacity(0.5),
                    blurRadius: 8,
                    spreadRadius: 1,
                  ),
                ]
              : null,
        ),
        child: Center(
          child: icon != null
              ? Icon(
                  icon,
                  size: height * 0.45,
                  color: isActive ? activeColor : DJColors.textSecondary,
                )
              : Text(
                  label,
                  style: DJTypography.buttonLabel.copyWith(
                    fontSize: fontSize,
                    color: isActive ? activeColor : DJColors.textSecondary,
                  ),
                ),
        ),
      ),
    );
  }
}
