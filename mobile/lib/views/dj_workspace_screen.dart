import 'package:flutter/material.dart';
import '../features/audio_engine/audio_engine_controller.dart';
import '../features/audio_engine/ableton_link_service.dart';
import '../features/recording/services/audio_recorder_service.dart';
import '../features/recording/presentation/recording_modal.dart';
import '../features/library/services/library_service.dart';
import '../features/library/presentation/library_screen.dart';
import '../features/deck/presentation/deck_view.dart';
import '../features/mixer/presentation/mixer_view.dart';
import '../features/performance/presentation/performance_tabs_view.dart';
import '../core/widgets/midi_mapping_modal.dart';
import '../core/widgets/waveform_view.dart';
import '../core/theme/dj_colors.dart';
import '../core/theme/dj_typography.dart';

class DJWorkspaceScreen extends StatefulWidget {
  const DJWorkspaceScreen({super.key});

  @override
  State<DJWorkspaceScreen> createState() => _DJWorkspaceScreenState();
}

class _DJWorkspaceScreenState extends State<DJWorkspaceScreen> {
  final AudioEngineController _controller = AudioEngineController();
  final AbletonLinkService _linkService = AbletonLinkService();
  final AudioRecorderService _recorderService = AudioRecorderService();

  String _activeDeckTab = 'AB'; // 'AB' or 'CD'

  @override
  void initState() {
    super.initState();
    // Auto load default demo tracks into Deck A and Deck B
    if (LibraryService.defaultTracks.isNotEmpty) {
      _controller.loadTrack('A', LibraryService.defaultTracks[0]);
    }
    if (LibraryService.defaultTracks.length > 1) {
      _controller.loadTrack('B', LibraryService.defaultTracks[1]);
    }
  }

  void _openLibrary() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => LibraryScreen(
          onLoadTrack: (deckId, track) {
            _controller.loadTrack(deckId, track);
          },
        ),
      ),
    );
  }

  void _openRecordingModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => RecordingModal(recorder: _recorderService),
    );
  }

  void _openMidiModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => MidiMappingModal(
        selectedDevice: 'Pioneer DDJ-FLX4 (USB/BLE)',
        isConnected: true,
        availableDevices: const ['Pioneer DDJ-FLX4 (USB/BLE)', 'Numark Mixtrack Pro FX'],
        currentMappings: const {},
        onSelectPreset: (preset) {},
        onScanDevices: () {},
        onStartMidiLearn: (key) {},
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([_controller, _linkService, _recorderService]),
      builder: (context, _) {
        final isLandscape = MediaQuery.of(context).orientation == Orientation.landscape;

        return Scaffold(
          backgroundColor: DJColors.background,
          body: SafeArea(
            child: Column(
              children: [
                // Top Global Status & Utility Bar
                _buildTopBar(),
                // Dual Scrolling Beat-matching Waveforms
                _buildDualWaveformsBar(),
                // Main Workspace Layout (Landscape vs Portrait)
                Expanded(
                  child: isLandscape ? _buildLandscapeLayout() : _buildPortraitLayout(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      color: DJColors.surface,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // App Logo & Brand Title
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Image.asset(
                  'assets/images/dj_logo.jpg',
                  width: 26,
                  height: 26,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Icon(Icons.album, color: DJColors.deckA, size: 24),
                ),
              ),
              const SizedBox(width: 8),
              Text('DJ PRO MASTER', style: DJTypography.brandTitle.copyWith(fontSize: 14)),
            ],
          ),
          // 4-Deck Selector Tabs (A/B vs C/D expandable)
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: DJColors.background,
              borderRadius: BorderRadius.circular(5),
            ),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => setState(() => _activeDeckTab = 'AB'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _activeDeckTab == 'AB' ? DJColors.surfaceElevated : Colors.transparent,
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text('DECKS A / B', style: DJTypography.buttonLabel.copyWith(fontSize: 9)),
                  ),
                ),
                GestureDetector(
                  onTap: () => setState(() => _activeDeckTab = 'CD'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _activeDeckTab == 'CD' ? DJColors.surfaceElevated : Colors.transparent,
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text('DECKS C / D', style: DJTypography.buttonLabel.copyWith(fontSize: 9)),
                  ),
                ),
              ],
            ),
          ),
          // Hardware Buttons: Ableton Link, MIDI, REC, Library
          Row(
            children: [
              // Ableton Link Button
              GestureDetector(
                onTap: () => _linkService.toggleLink(!_linkService.state.isEnabled),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  decoration: BoxDecoration(
                    color: _linkService.state.isEnabled
                        ? DJColors.deckD.withOpacity(0.2)
                        : DJColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: _linkService.state.isEnabled ? DJColors.deckD : DJColors.surfaceBorder,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.link,
                        size: 11,
                        color: _linkService.state.isEnabled ? DJColors.deckD : DJColors.textMuted,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'LINK',
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 8,
                          color: _linkService.state.isEnabled ? DJColors.deckD : DJColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              // MIDI Controller Button
              IconButton(
                icon: const Icon(Icons.piano, color: DJColors.textSecondary, size: 18),
                tooltip: 'MIDI Hardware',
                onPressed: _openMidiModal,
                constraints: const BoxConstraints(),
                padding: const EdgeInsets.all(4),
              ),
              const SizedBox(width: 4),
              // Session Recording Button
              GestureDetector(
                onTap: _openRecordingModal,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  decoration: BoxDecoration(
                    color: _recorderService.isRecording
                        ? DJColors.vuRed.withOpacity(0.3)
                        : DJColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: _recorderService.isRecording ? DJColors.vuRed : DJColors.surfaceBorder,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _recorderService.isRecording ? DJColors.vuRed : DJColors.textMuted,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'REC',
                        style: DJTypography.buttonLabel.copyWith(
                          fontSize: 8,
                          color: _recorderService.isRecording ? DJColors.vuRed : DJColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              // Open Library Button
              IconButton(
                icon: const Icon(Icons.music_note, color: DJColors.deckA, size: 18),
                tooltip: 'Music Library',
                onPressed: _openLibrary,
                constraints: const BoxConstraints(),
                padding: const EdgeInsets.all(4),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDualWaveformsBar() {
    final trackA = _controller.deckA.track;
    final trackB = _controller.deckB.track;
    final progA = (trackA != null && trackA.duration.inMilliseconds > 0)
        ? (_controller.deckA.position.inMilliseconds / trackA.duration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;
    final progB = (trackB != null && trackB.duration.inMilliseconds > 0)
        ? (_controller.deckB.position.inMilliseconds / trackB.duration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      color: DJColors.background,
      child: Column(
        children: [
          // Deck A scrolling waveform
          WaveformView(
            peaks: trackA?.waveformPeaks ?? [],
            currentProgress: progA,
            duration: trackA?.duration ?? const Duration(minutes: 3),
            bpm: _controller.deckA.effectiveBpm,
            accentColor: DJColors.deckA,
            height: 28,
          ),
          const SizedBox(height: 2),
          // Deck B scrolling waveform
          WaveformView(
            peaks: trackB?.waveformPeaks ?? [],
            currentProgress: progB,
            duration: trackB?.duration ?? const Duration(minutes: 3),
            bpm: _controller.deckB.effectiveBpm,
            accentColor: DJColors.deckB,
            height: 28,
          ),
        ],
      ),
    );
  }

  // Portrait Mobile Layout: Stacked Decks, Mixer, Performance Tabs
  Widget _buildPortraitLayout() {
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        // Deck A
        DeckView(
          deckId: 'A',
          controller: _controller,
          onOpenLibrary: _openLibrary,
        ),
        const SizedBox(height: 8),
        // Center Mixer Console
        MixerView(controller: _controller),
        const SizedBox(height: 8),
        // Deck B
        DeckView(
          deckId: 'B',
          controller: _controller,
          onOpenLibrary: _openLibrary,
        ),
        const SizedBox(height: 8),
        // Performance Tools Drawer (Hot Cue, Loop, Sampler, FX, Stems)
        PerformanceTabsView(controller: _controller),
      ],
    );
  }

  // Landscape Pro Layout (Mac 13 / Desktop / iPad): Side-by-side Decks with Center Mixer & Performance Pads
  Widget _buildLandscapeLayout() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Left: Deck A + Deck A Performance Pads
        Expanded(
          flex: 5,
          child: SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DeckView(
                    deckId: 'A',
                    controller: _controller,
                    onOpenLibrary: _openLibrary,
                  ),
                  const SizedBox(height: 5),
                  PerformanceTabsView(
                    controller: _controller,
                    fixedDeckId: 'A',
                  ),
                ],
              ),
            ),
          ),
        ),
        // Center: Full Mixer Console with Crossfader
        Expanded(
          flex: 4,
          child: SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
              child: MixerView(controller: _controller),
            ),
          ),
        ),
        // Right: Deck B + Deck B Performance Pads
        Expanded(
          flex: 5,
          child: SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DeckView(
                    deckId: 'B',
                    controller: _controller,
                    onOpenLibrary: _openLibrary,
                  ),
                  const SizedBox(height: 5),
                  PerformanceTabsView(
                    controller: _controller,
                    fixedDeckId: 'B',
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    _linkService.dispose();
    _recorderService.dispose();
    super.dispose();
  }
}
