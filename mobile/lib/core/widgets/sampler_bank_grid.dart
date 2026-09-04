import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class SamplerBankGrid extends StatefulWidget {
  final int currentBank; // 0: Bank A, 1: Bank B, 2: Bank C, 3: Bank D
  final double samplerVolume;
  final int pitchSemitones; // -12 to +12
  final ValueChanged<int> onSelectBank;
  final ValueChanged<double> onVolumeChanged;
  final ValueChanged<int> onPitchChanged;
  final Function(int padIndex, String soundAsset) onTriggerPad;

  const SamplerBankGrid({
    super.key,
    required this.currentBank,
    required this.samplerVolume,
    required this.pitchSemitones,
    required this.onSelectBank,
    required this.onVolumeChanged,
    required this.onPitchChanged,
    required this.onTriggerPad,
  });

  @override
  State<SamplerBankGrid> createState() => _SamplerBankGridState();
}

class _SamplerBankGridState extends State<SamplerBankGrid> {
  int? _activePad;

  // 4 Banks x 4 Pads = 16 Samples
  static const List<List<Map<String, String>>> banks = [
    // Bank A: Vocal & DJ Stabs
    [
      {'name': 'HEY!', 'file': 'assets/audio/vocal_hey.wav'},
      {'name': 'YEAH!', 'file': 'assets/audio/vocal_yeah.wav'},
      {'name': 'AIRHORN', 'file': 'assets/audio/airhorn.wav'},
      {'name': 'LASER', 'file': 'assets/audio/laser.wav'},
    ],
    // Bank B: Drum Essentials
    [
      {'name': '808 KICK', 'file': 'assets/audio/kick.wav'},
      {'name': 'SNARE', 'file': 'assets/audio/snare.wav'},
      {'name': 'HI-HAT', 'file': 'assets/audio/hihat.wav'},
      {'name': 'CLAP', 'file': 'assets/audio/clap.wav'},
    ],
    // Bank C: Drops & FX
    [
      {'name': 'SUB DROP', 'file': 'assets/audio/drop_sub.wav'},
      {'name': 'SCRATCH', 'file': 'assets/audio/scratch_stab.wav'},
      {'name': 'SIREN', 'file': 'assets/audio/siren.wav'},
      {'name': 'CRASH', 'file': 'assets/audio/crash.wav'},
    ],
    // Bank D: Risers & Percussion
    [
      {'name': 'RISER', 'file': 'assets/audio/riser.wav'},
      {'name': 'BRAKE', 'file': 'assets/audio/brake.wav'},
      {'name': '808 TOM', 'file': 'assets/audio/tom.wav'},
      {'name': 'COWBELL', 'file': 'assets/audio/cowbell.wav'},
    ],
  ];

  @override
  Widget build(BuildContext context) {
    final currentPads = banks[widget.currentBank.clamp(0, 3)];

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Bank Selection & Controls Header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Bank Selector Pills
            Row(
              children: List.generate(4, (bIndex) {
                final isSelected = widget.currentBank == bIndex;
                final bankChar = String.fromCharCode(65 + bIndex); // A, B, C, D
                return Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: GestureDetector(
                    onTap: () => widget.onSelectBank(bIndex),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? DJColors.deckA.withOpacity(0.25)
                            : DJColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: isSelected ? DJColors.deckA : DJColors.surfaceBorder,
                        ),
                      ),
                      child: Text(
                        bankChar,
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 10,
                          color: isSelected ? DJColors.deckA : DJColors.textMuted,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
            // Pitch display & Vol slider
            Row(
              children: [
                Text(
                  'PITCH: ${widget.pitchSemitones > 0 ? "+" : ""}${widget.pitchSemitones}st',
                  style: DJTypography.digitalDisplaySmall.copyWith(fontSize: 10),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 80,
                  child: SliderTheme(
                    data: SliderThemeData(
                      trackHeight: 2,
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                      activeTrackColor: DJColors.deckA,
                      inactiveTrackColor: DJColors.surfaceBorder,
                      thumbColor: DJColors.deckA,
                    ),
                    child: Slider(
                      value: widget.samplerVolume,
                      onChanged: widget.onVolumeChanged,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 8),
        // 4 Large illuminated Performance Pads for current bank
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            childAspectRatio: 2.2,
          ),
          itemCount: 4,
          itemBuilder: (context, index) {
            final pad = currentPads[index];
            final isPressed = _activePad == index;
            final padColor = DJColors.padColors[(widget.currentBank * 2 + index) % DJColors.padColors.length];

            return GestureDetector(
              onTapDown: (_) {
                setState(() => _activePad = index);
                widget.onTriggerPad(index, pad['file']!);
              },
              onTapUp: (_) => setState(() => _activePad = null),
              onTapCancel: () => setState(() => _activePad = null),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 60),
                decoration: BoxDecoration(
                  color: isPressed
                      ? padColor.withOpacity(0.5)
                      : DJColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isPressed ? padColor : DJColors.surfaceBorder,
                    width: isPressed ? 2.0 : 1.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: isPressed ? padColor.withOpacity(0.6) : Colors.black.withOpacity(0.3),
                      blurRadius: isPressed ? 10 : 3,
                    ),
                  ],
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.music_note_rounded,
                        size: 16,
                        color: isPressed ? Colors.white : padColor,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        pad['name']!,
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 10,
                          color: isPressed ? Colors.white : DJColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
