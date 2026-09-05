import 'package:flutter/material.dart';

import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

/// Marks controls that are built in the UI but do not affect audio yet, so a
/// demo never leaves the impression that something is broken.
class ComingSoonBadge extends StatelessWidget {
  final double fontSize;

  /// On a phone the top bar has no room for the word; a dot still marks the
  /// control, and tapping it explains.
  final bool compact;

  const ComingSoonBadge({super.key, this.fontSize = 6.5, this.compact = false});

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return Container(
        width: 5,
        height: 5,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: DJColors.vuAmber,
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
      decoration: BoxDecoration(
        color: DJColors.vuAmber.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(2),
        border: Border.all(color: DJColors.vuAmber.withValues(alpha: 0.55)),
      ),
      child: Text(
        'SOON',
        style: DJTypography.buttonLabel.copyWith(
          fontSize: fontSize,
          color: DJColors.vuAmber,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

/// Tells the user a control is not wired up yet, rather than silently doing
/// nothing when they tap it.
void showComingSoon(BuildContext context, String feature, {String? detail}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;

  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: DJColors.surfaceElevated,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: const BorderSide(color: DJColors.vuAmber, width: 1),
        ),
        content: Row(
          children: [
            const Icon(Icons.schedule, color: DJColors.vuAmber, size: 16),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$feature is coming soon',
                    style: DJTypography.buttonLabel
                        .copyWith(fontSize: 11, color: Colors.white),
                  ),
                  if (detail != null) ...[
                    const SizedBox(height: 2),
                    Text(detail, style: DJTypography.trackArtist),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
}

/// A translucent "not wired up yet" overlay for a whole panel.
class ComingSoonOverlay extends StatelessWidget {
  final String feature;
  final String detail;
  final Widget child;

  const ComingSoonOverlay({
    super.key,
    required this.feature,
    required this.detail,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // The real controls stay visible and usable so the layout still reads
        // as the finished product, just dimmed.
        Opacity(opacity: 0.45, child: child),
        Positioned.fill(
          child: Center(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: DJColors.background.withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                    color: DJColors.vuAmber.withValues(alpha: 0.6)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.schedule,
                          color: DJColors.vuAmber, size: 13),
                      const SizedBox(width: 6),
                      Text(
                        '$feature — COMING SOON',
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 9,
                          color: DJColors.vuAmber,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(detail,
                      style: DJTypography.trackArtist.copyWith(fontSize: 9),
                      textAlign: TextAlign.center),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
