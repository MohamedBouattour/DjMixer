import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class HotCuePadGrid extends StatefulWidget {
  final Map<int, Duration> hotCues; // pad index (0-7) -> cue timestamp
  final bool isDeleteMode;
  final bool isQuantized;
  final ValueChanged<int> onTriggerCue;
  final ValueChanged<int> onDeleteCue;
  final VoidCallback onToggleDeleteMode;
  final VoidCallback onToggleQuantize;

  const HotCuePadGrid({
    super.key,
    required this.hotCues,
    required this.isDeleteMode,
    required this.isQuantized,
    required this.onTriggerCue,
    required this.onDeleteCue,
    required this.onToggleDeleteMode,
    required this.onToggleQuantize,
  });

  @override
  State<HotCuePadGrid> createState() => _HotCuePadGridState();
}

class _HotCuePadGridState extends State<HotCuePadGrid> {
  int? _pressedPad;

  String _formatCueTime(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    final ms = (d.inMilliseconds.remainder(1000) ~/ 100).toString();
    return '$m:$s.$ms';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Top toolbar: Mode indicators (Quantize, Delete Mode)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'HOT CUES (1-8)',
                  style: DJTypography.knobLabel,
                ),
                const SizedBox(width: 8),
                Row(
                  children: [
                  // Quantize button
                  GestureDetector(
                    onTap: widget.onToggleQuantize,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: widget.isQuantized
                            ? DJColors.deckA.withOpacity(0.2)
                            : DJColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: widget.isQuantized
                              ? DJColors.deckA
                              : DJColors.surfaceBorder,
                        ),
                      ),
                      child: Text(
                        'QUANTIZE',
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 9,
                          color: widget.isQuantized
                              ? DJColors.deckA
                              : DJColors.textMuted,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Delete Mode toggle
                  GestureDetector(
                    onTap: widget.onToggleDeleteMode,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: widget.isDeleteMode
                            ? DJColors.vuRed.withOpacity(0.25)
                            : DJColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: widget.isDeleteMode
                              ? DJColors.vuRed
                              : DJColors.surfaceBorder,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.delete_outline,
                            size: 11,
                            color: widget.isDeleteMode
                                ? DJColors.vuRed
                                : DJColors.textMuted,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            'DELETE',
                            style: DJTypography.buttonLabel.copyWith(
                              fontSize: 9,
                              color: widget.isDeleteMode
                                  ? DJColors.vuRed
                                  : DJColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
        // 2x4 Grid of 8 Hot Cue Pads
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(2),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            crossAxisSpacing: 6,
            mainAxisSpacing: 6,
            childAspectRatio: 1.4,
          ),
          itemCount: 8,
          itemBuilder: (context, index) {
            final hasCue = widget.hotCues.containsKey(index);
            final cueTime = widget.hotCues[index];
            final color = DJColors.padColors[index % DJColors.padColors.length];
            final isPressed = _pressedPad == index;

            return GestureDetector(
              onTapDown: (_) {
                setState(() => _pressedPad = index);
                if (widget.isDeleteMode) {
                  if (hasCue) widget.onDeleteCue(index);
                } else {
                  widget.onTriggerCue(index);
                }
              },
              onTapUp: (_) => setState(() => _pressedPad = null),
              onTapCancel: () => setState(() => _pressedPad = null),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 60),
                decoration: BoxDecoration(
                  color: hasCue
                      ? (isPressed
                          ? color.withOpacity(0.5)
                          : color.withOpacity(0.18))
                      : DJColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(5),
                  border: Border.all(
                    color: hasCue
                        ? color
                        : DJColors.surfaceBorder,
                    width: isPressed ? 2.0 : 1.2,
                  ),
                  boxShadow: hasCue
                      ? [
                          BoxShadow(
                            color: color.withOpacity(isPressed ? 0.6 : 0.25),
                            blurRadius: isPressed ? 8 : 4,
                            spreadRadius: isPressed ? 1 : 0,
                          ),
                        ]
                      : null,
                ),
                child: Stack(
                  children: [
                    // Pad index number
                    Positioned(
                      top: 3,
                      left: 5,
                      child: Text(
                        '${index + 1}',
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 10,
                          color: hasCue ? color : DJColors.textMuted,
                        ),
                      ),
                    ),
                    // Cue time or empty marker
                    Center(
                      child: hasCue
                          ? Text(
                              _formatCueTime(cueTime!),
                              style: DJTypography.digitalDisplaySmall.copyWith(
                                fontSize: 9,
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            )
                          : Icon(
                              Icons.add,
                              size: 14,
                              color: DJColors.textMuted,
                            ),
                    ),
                    // Delete overlay icon if in delete mode and cue exists
                    if (widget.isDeleteMode && hasCue)
                      Positioned(
                        top: 2,
                        right: 2,
                        child: Icon(
                          Icons.close,
                          size: 12,
                          color: DJColors.vuRed,
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
