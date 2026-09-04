import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class StemFaderPanel extends StatelessWidget {
  final double vocalVolume;
  final double drumVolume;
  final double bassVolume;
  final double melodyVolume;

  final bool vocalMuted;
  final bool drumMuted;
  final bool bassMuted;
  final bool melodyMuted;

  final bool vocalSolo;
  final bool drumSolo;
  final bool bassSolo;
  final bool melodySolo;

  final Function(String stem, double volume) onVolumeChanged;
  final Function(String stem) onToggleMute;
  final Function(String stem) onToggleSolo;

  const StemFaderPanel({
    super.key,
    required this.vocalVolume,
    required this.drumVolume,
    required this.bassVolume,
    required this.melodyVolume,
    required this.vocalMuted,
    required this.drumMuted,
    required this.bassMuted,
    required this.melodyMuted,
    required this.vocalSolo,
    required this.drumSolo,
    required this.bassSolo,
    required this.melodySolo,
    required this.onVolumeChanged,
    required this.onToggleMute,
    required this.onToggleSolo,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: DJColors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: DJColors.surfaceBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_awesome, size: 14, color: DJColors.deckA),
                  const SizedBox(width: 5),
                  Text(
                    'REAL-TIME AI STEMS',
                    style: DJTypography.knobLabel.copyWith(color: DJColors.deckA),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: DJColors.deckA.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '4-CHANNEL DEMIX',
                  style: DJTypography.digitalDisplaySmall.copyWith(
                    color: DJColors.deckA,
                    fontSize: 9,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStemColumn(
                stemKey: 'vocals',
                name: 'VOCALS',
                icon: Icons.mic_none_rounded,
                color: DJColors.stemVocals,
                volume: vocalVolume,
                isMuted: vocalMuted,
                isSolo: vocalSolo,
              ),
              _buildStemColumn(
                stemKey: 'drums',
                name: 'DRUMS',
                icon: Icons.album_outlined,
                color: DJColors.stemDrums,
                volume: drumVolume,
                isMuted: drumMuted,
                isSolo: drumSolo,
              ),
              _buildStemColumn(
                stemKey: 'bass',
                name: 'BASS',
                icon: Icons.graphic_eq_rounded,
                color: DJColors.stemBass,
                volume: bassVolume,
                isMuted: bassMuted,
                isSolo: bassSolo,
              ),
              _buildStemColumn(
                stemKey: 'melody',
                name: 'MELODY',
                icon: Icons.piano_rounded,
                color: DJColors.stemMelody,
                volume: melodyVolume,
                isMuted: melodyMuted,
                isSolo: melodySolo,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStemColumn({
    required String stemKey,
    required String name,
    required IconData icon,
    required Color color,
    required double volume,
    required bool isMuted,
    required bool isSolo,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Stem Icon & Name
        Icon(icon, size: 16, color: isMuted ? DJColors.textMuted : color),
        const SizedBox(height: 2),
        Text(
          name,
          style: DJTypography.knobLabel.copyWith(
            fontSize: 9,
            color: isMuted ? DJColors.textMuted : color,
          ),
        ),
        const SizedBox(height: 6),
        // Vertical Slider for volume
        SizedBox(
          height: 100,
          child: RotatedBox(
            quarterTurns: 3,
            child: SliderTheme(
              data: SliderThemeData(
                trackHeight: 4,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                activeTrackColor: color,
                inactiveTrackColor: DJColors.surfaceElevated,
                thumbColor: color,
              ),
              child: Slider(
                value: isMuted ? 0.0 : volume,
                onChanged: (newVal) => onVolumeChanged(stemKey, newVal),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        // Mute & Solo Buttons
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            GestureDetector(
              onTap: () => onToggleMute(stemKey),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: isMuted
                      ? DJColors.vuRed.withOpacity(0.3)
                      : DJColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(
                    color: isMuted ? DJColors.vuRed : DJColors.surfaceBorder,
                  ),
                ),
                child: Text(
                  'M',
                  style: DJTypography.buttonLabel.copyWith(
                    fontSize: 9,
                    color: isMuted ? DJColors.vuRed : DJColors.textSecondary,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),
            GestureDetector(
              onTap: () => onToggleSolo(stemKey),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: isSolo
                      ? DJColors.vuAmber.withOpacity(0.3)
                      : DJColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(
                    color: isSolo ? DJColors.vuAmber : DJColors.surfaceBorder,
                  ),
                ),
                child: Text(
                  'S',
                  style: DJTypography.buttonLabel.copyWith(
                    fontSize: 9,
                    color: isSolo ? DJColors.vuAmber : DJColors.textSecondary,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
