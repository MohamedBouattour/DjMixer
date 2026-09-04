import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';
import '../theme/dj_typography.dart';

class MidiMappingModal extends StatefulWidget {
  final String selectedDevice;
  final bool isConnected;
  final List<String> availableDevices;
  final Map<String, String> currentMappings;
  final ValueChanged<String> onSelectPreset;
  final VoidCallback onScanDevices;
  final Function(String controlKey) onStartMidiLearn;

  const MidiMappingModal({
    super.key,
    required this.selectedDevice,
    required this.isConnected,
    required this.availableDevices,
    required this.currentMappings,
    required this.onSelectPreset,
    required this.onScanDevices,
    required this.onStartMidiLearn,
  });

  @override
  State<MidiMappingModal> createState() => _MidiMappingModalState();
}

class _MidiMappingModalState extends State<MidiMappingModal> {
  String? _learningControl;

  final List<String> _presets = [
    'Pioneer DDJ-FLX4 (USB/BLE)',
    'Pioneer DDJ-200 (Bluetooth)',
    'Numark Mixtrack Pro FX',
    'Hercules DJControl Inpulse',
    'Custom Generic MIDI',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: DJColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.piano, color: DJColors.deckA, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'HARDWARE MIDI CONTROLLER',
                    style: DJTypography.deckLabel.copyWith(fontSize: 14),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.close, color: DJColors.textSecondary, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Connection Status & Scan
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: DJColors.background,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: DJColors.surfaceBorder),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: widget.isConnected ? DJColors.vuGreen : DJColors.vuRed,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      widget.isConnected
                          ? 'CONNECTED: ${widget.selectedDevice}'
                          : 'NO CONTROLLER DETECTED',
                      style: DJTypography.digitalDisplaySmall.copyWith(
                        color: widget.isConnected ? DJColors.vuGreen : DJColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                GestureDetector(
                  onTap: widget.onScanDevices,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: DJColors.deckA.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'SCAN BLE/USB',
                      style: DJTypography.buttonLabel.copyWith(
                        fontSize: 9,
                        color: DJColors.deckA,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Presets Dropdown
          Text(
            'CONTROLLER PRESET',
            style: DJTypography.knobLabel,
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: DJColors.surfaceElevated,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: DJColors.surfaceBorder),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                value: _presets.contains(widget.selectedDevice)
                    ? widget.selectedDevice
                    : _presets.first,
                dropdownColor: DJColors.surfaceElevated,
                items: _presets.map((preset) {
                  return DropdownMenuItem(
                    value: preset,
                    child: Text(
                      preset,
                      style: DJTypography.buttonLabel.copyWith(
                        fontSize: 12,
                        color: DJColors.textPrimary,
                      ),
                    ),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) widget.onSelectPreset(val);
                },
              ),
            ),
          ),
          const SizedBox(height: 14),
          // MIDI Learn Section
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'MIDI LEARN MAPPING',
                style: DJTypography.knobLabel,
              ),
              if (_learningControl != null)
                Text(
                  'MOVE HARDWARE CONTROL...',
                  style: DJTypography.digitalDisplaySmall.copyWith(
                    color: DJColors.vuAmber,
                    fontSize: 10,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          // Mapping List
          SizedBox(
            height: 180,
            child: ListView(
              children: [
                _buildMappingRow('Deck A Play/Pause', 'deckA_play', 'Note 0x3C (C4)'),
                _buildMappingRow('Deck A Stutter Cue', 'deckA_cue', 'Note 0x3D (C#4)'),
                _buildMappingRow('Deck A Jog Touch', 'deckA_jog', 'CC #16 (Pitch Wheel)'),
                _buildMappingRow('Deck A Tempo Pitch Fader', 'deckA_pitch', 'CC #00 (Fine 14-bit)'),
                _buildMappingRow('Crossfader', 'crossfader', 'CC #08 (Linear Cut)'),
                _buildMappingRow('Channel A Level Fader', 'deckA_fader', 'CC #19'),
                _buildMappingRow('Channel B Level Fader', 'deckB_fader', 'CC #20'),
                _buildMappingRow('Deck B Play/Pause', 'deckB_play', 'Note 0x40 (E4)'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMappingRow(String title, String controlKey, String defaultMidi) {
    final mapped = widget.currentMappings[controlKey] ?? defaultMidi;
    final isLearning = _learningControl == controlKey;

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: DJColors.surfaceElevated,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: isLearning ? DJColors.vuAmber : DJColors.surfaceBorder,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: DJTypography.trackTitle.copyWith(fontSize: 11),
          ),
          Row(
            children: [
              Text(
                mapped,
                style: DJTypography.digitalDisplaySmall.copyWith(
                  color: DJColors.deckA,
                  fontSize: 10,
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () {
                  setState(() => _learningControl = controlKey);
                  widget.onStartMidiLearn(controlKey);
                  Future.delayed(const Duration(seconds: 2), () {
                    if (mounted) setState(() => _learningControl = null);
                  });
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: isLearning ? DJColors.vuAmber : DJColors.background,
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Text(
                    isLearning ? 'LEARNING' : 'LEARN',
                    style: DJTypography.buttonLabel.copyWith(
                      fontSize: 8,
                      color: isLearning ? Colors.black : DJColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
