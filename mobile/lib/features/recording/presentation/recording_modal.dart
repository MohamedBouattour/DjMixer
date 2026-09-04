import 'package:flutter/material.dart';
import '../services/audio_recorder_service.dart';
import '../../../core/theme/dj_colors.dart';
import '../../../core/theme/dj_typography.dart';
import '../../../core/components/neon_button.dart';

class RecordingModal extends StatefulWidget {
  final AudioRecorderService recorder;

  const RecordingModal({
    super.key,
    required this.recorder,
  });

  @override
  State<RecordingModal> createState() => _RecordingModalState();
}

class _RecordingModalState extends State<RecordingModal> {
  final TextEditingController _titleController =
      TextEditingController(text: 'Live Club Set');
  final TextEditingController _djController =
      TextEditingController(text: 'Resident DJ');

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '${d.inHours.toString().padLeft(2, '0')}:$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final isRecording = widget.recorder.isRecording;
    final dur = widget.recorder.recordDuration;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: DJColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.fiber_manual_record,
                    color: isRecording ? DJColors.vuRed : DJColors.textMuted,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'SESSION RECORDER (24-BIT 48kHz)',
                    style: DJTypography.deckLabel.copyWith(fontSize: 13),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.close, color: DJColors.textSecondary, size: 18),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Timer & Status Display
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: DJColors.background,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isRecording ? DJColors.vuRed : DJColors.surfaceBorder,
              ),
            ),
            child: Column(
              children: [
                Text(
                  isRecording ? 'LIVE RECORDING IN PROGRESS' : 'STANDBY (READY TO RECORD)',
                  style: DJTypography.knobLabel.copyWith(
                    color: isRecording ? DJColors.vuRed : DJColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _formatDuration(dur),
                  style: DJTypography.digitalDisplay.copyWith(
                    fontSize: 28,
                    color: isRecording ? DJColors.vuRed : DJColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Metadata Fields
          TextField(
            controller: _titleController,
            enabled: !isRecording,
            style: DJTypography.trackTitle,
            decoration: InputDecoration(
              labelText: 'Session / Set Title',
              labelStyle: DJTypography.knobLabel,
              filled: true,
              fillColor: DJColors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _djController,
            enabled: !isRecording,
            style: DJTypography.trackTitle,
            decoration: InputDecoration(
              labelText: 'DJ Artist Name',
              labelStyle: DJTypography.knobLabel,
              filled: true,
              fillColor: DJColors.surfaceElevated,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
            ),
          ),
          const SizedBox(height: 16),
          // Start / Stop Recording Button
          NeonButton(
            label: isRecording ? 'STOP & SAVE RECORDING' : 'START RECORDING (WAV)',
            icon: isRecording ? Icons.stop : Icons.fiber_manual_record,
            isActive: isRecording,
            activeColor: DJColors.vuRed,
            height: 48,
            onTap: () {
              if (isRecording) {
                widget.recorder.stopRecording();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Session saved to Music Library!')),
                );
              } else {
                widget.recorder.startRecording(
                  RecordingMetadata(
                    title: _titleController.text,
                    djName: _djController.text,
                    timestamp: DateTime.now(),
                  ),
                );
              }
              setState(() {});
            },
          ),
        ],
      ),
    );
  }
}
