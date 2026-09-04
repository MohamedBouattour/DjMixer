import 'package:flutter/material.dart';
import '../models/deck_state.dart';
import '../../audio_engine/audio_engine_controller.dart';
import '../../../core/theme/dj_colors.dart';
import '../../../core/theme/dj_typography.dart';
import '../../../core/components/bpm_counter_display.dart';
import '../../../core/components/precision_fader.dart';
import '../../../core/components/neon_button.dart';
import '../../../core/widgets/jog_wheel_widget.dart';
import '../../../core/widgets/waveform_view.dart';

class DeckView extends StatefulWidget {
  final String deckId; // 'A' or 'B'
  final AudioEngineController controller;
  final VoidCallback onOpenLibrary;

  const DeckView({
    super.key,
    required this.deckId,
    required this.controller,
    required this.onOpenLibrary,
  });

  @override
  State<DeckView> createState() => _DeckViewState();
}

class _DeckViewState extends State<DeckView> {
  final List<DateTime> _tapHistory = [];

  void _onTapTempo() {
    _tapHistory.add(DateTime.now());
    if (_tapHistory.length > 5) _tapHistory.removeAt(0);
    // Tap tempo logic handled via beat grid detector if desired
  }

  @override
  Widget build(BuildContext context) {
    final isA = widget.deckId == 'A';
    final deck = isA ? widget.controller.deckA : widget.controller.deckB;
    final accentColor = isA ? DJColors.deckA : DJColors.deckB;
    final jogAsset = isA
        ? 'assets/images/jog_wheel_cyan.jpg'
        : 'assets/images/jog_wheel_orange.jpg';

    final track = deck.track;
    final progress = (track != null && track.duration.inMilliseconds > 0)
        ? (deck.position.inMilliseconds / track.duration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: DJColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: accentColor.withOpacity(0.4),
          width: 1.2,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header: Deck Tag, Track Info & Load Button
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: accentColor),
                ),
                child: Text(
                  'DECK ${widget.deckId}',
                  style: DJTypography.deckLabel.copyWith(
                    color: accentColor,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: widget.onOpenLibrary,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        track?.title ?? 'NO TRACK LOADED',
                        style: DJTypography.trackTitle.copyWith(fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        track?.artist ?? 'Tap to select music',
                        style: DJTypography.trackArtist.copyWith(fontSize: 10),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
              IconButton(
                icon: Icon(Icons.folder_open, color: accentColor, size: 20),
                onPressed: widget.onOpenLibrary,
                tooltip: 'Load Track',
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Digital BPM & Timecode readout
          BpmCounterDisplay(
            bpm: deck.effectiveBpm,
            pitchPercent: deck.pitchPercent,
            musicalKey: track?.camelot ?? '8A',
            elapsed: deck.position,
            duration: track?.duration ?? const Duration(minutes: 3),
            accentColor: accentColor,
          ),
          const SizedBox(height: 6),
          // Dynamic Waveform View
          WaveformView(
            peaks: track?.waveformPeaks ?? [],
            currentProgress: progress,
            duration: track?.duration ?? const Duration(minutes: 3),
            bpm: deck.effectiveBpm,
            accentColor: accentColor,
            hotCuePoints: deck.hotCues.values.map((d) {
              final total = track?.duration.inMilliseconds ?? 180000;
              return (d.inMilliseconds / total).clamp(0.0, 1.0);
            }).toList(),
            loopStart: deck.loopStartPosition != null && track != null
                ? (deck.loopStartPosition!.inMilliseconds / track.duration.inMilliseconds).clamp(0.0, 1.0)
                : null,
            loopEnd: deck.loopEndPosition != null && track != null
                ? (deck.loopEndPosition!.inMilliseconds / track.duration.inMilliseconds).clamp(0.0, 1.0)
                : null,
            isLooping: deck.isLoopActive,
            height: 52,
            onSeek: (seekFrac) {},
          ),
          const SizedBox(height: 8),
          // Center Section: Jog Wheel + Pitch Slider
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Virtual Vinyl Jog Wheel
              Expanded(
                child: Center(
                  child: JogWheelWidget(
                    angle: deck.jogAngle,
                    isPlaying: deck.isPlaying,
                    mode: deck.jogMode,
                    accentColor: accentColor,
                    assetImage: jogAsset,
                    size: 175.0,
                    onTouchDown: () => widget.controller.onJogTouchDown(widget.deckId),
                    onJogTouchMove: (delta, isCenter) =>
                        widget.controller.onJogMove(widget.deckId, delta, isCenter),
                    onTouchUp: (vel) =>
                        widget.controller.onJogTouchUp(widget.deckId, vel),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Pitch / Tempo Slider Column
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Range Badge
                  PopupMenuButton<PitchRange>(
                    initialValue: deck.pitchRange,
                    onSelected: (r) => widget.controller.setPitchRange(widget.deckId, r),
                    color: DJColors.surfaceElevated,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: DJColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(color: DJColors.surfaceBorder),
                      ),
                      child: Text(
                        deck.pitchRange.label,
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 8,
                          color: accentColor,
                        ),
                      ),
                    ),
                    itemBuilder: (context) => PitchRange.values.map((r) {
                      return PopupMenuItem(
                        value: r,
                        child: Text(r.label, style: DJTypography.buttonLabel.copyWith(fontSize: 10)),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 4),
                  PrecisionFader(
                    value: deck.pitchPercent,
                    min: -deck.pitchRange.percentage,
                    max: deck.pitchRange.percentage,
                    defaultValue: 0.0,
                    label: 'TEMPO',
                    activeColor: accentColor,
                    width: 38,
                    height: 125,
                    hasCenterDetent: true,
                    onChanged: (val) => widget.controller.setPitchPercent(widget.deckId, val),
                  ),
                  const SizedBox(height: 4),
                  // Tap Tempo Button
                  NeonButton(
                    label: 'TAP',
                    width: 38,
                    height: 22,
                    fontSize: 8,
                    onTap: _onTapTempo,
                    activeColor: DJColors.textSecondary,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Action Buttons Strip: Play/Pause, Stutter Cue, Sync, Key Lock, Slip Mode
          Row(
            children: [
              // Play/Pause Button (Pioneer Green)
              Expanded(
                child: NeonButton(
                  label: deck.isPlaying ? 'PAUSE' : 'PLAY',
                  icon: deck.isPlaying ? Icons.pause : Icons.play_arrow,
                  isActive: deck.isPlaying,
                  activeColor: DJColors.vuGreen,
                  height: 38,
                  fontSize: 10,
                  onTap: () => widget.controller.togglePlay(widget.deckId),
                ),
              ),
              const SizedBox(width: 4),
              // Pioneer Stutter Cue Button
              Expanded(
                child: NeonButton(
                  label: 'CUE',
                  isActive: deck.isCued,
                  activeColor: DJColors.vuAmber,
                  height: 38,
                  fontSize: 10,
                  onTapDown: () => widget.controller.tempCueDown(widget.deckId),
                  onTapUp: () => widget.controller.tempCueUp(widget.deckId),
                  onTap: () => widget.controller.stutterCue(widget.deckId),
                ),
              ),
              const SizedBox(width: 4),
              // Beat Sync Button
              Expanded(
                child: NeonButton(
                  label: 'SYNC',
                  isActive: deck.isSync,
                  activeColor: accentColor,
                  height: 38,
                  fontSize: 10,
                  onTap: () => widget.controller.triggerBeatSync(widget.deckId),
                ),
              ),
              const SizedBox(width: 4),
              // Key Lock (Master Tempo) Toggle
              Expanded(
                child: NeonButton(
                  label: 'KEY',
                  isActive: deck.isKeyLock,
                  activeColor: DJColors.deckC,
                  height: 38,
                  fontSize: 9,
                  onTap: () => widget.controller.toggleKeyLock(widget.deckId),
                ),
              ),
              const SizedBox(width: 4),
              // Slip Mode Toggle
              Expanded(
                child: NeonButton(
                  label: 'SLIP',
                  isActive: deck.isSlipMode,
                  activeColor: DJColors.vuAmber,
                  height: 38,
                  fontSize: 9,
                  onTap: () => widget.controller.toggleSlipMode(widget.deckId),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
