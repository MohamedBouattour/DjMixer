import 'package:flutter/material.dart';
import '../../audio_engine/audio_engine_controller.dart';
import '../../../core/theme/dj_colors.dart';
import '../../../core/theme/dj_typography.dart';
import '../../../core/widgets/hot_cue_pad_grid.dart';
import '../../../core/widgets/loop_control_strip.dart';
import '../../../core/widgets/sampler_bank_grid.dart';
import '../../../core/widgets/xy_touch_fx_pad.dart';
import '../../../core/widgets/stem_fader_panel.dart';

enum PerformanceTab {
  hotCue('HOT CUE', Icons.bookmark_border),
  loop('LOOP & JUMP', Icons.repeat),
  sampler('SAMPLER', Icons.grid_view),
  fx('XY TOUCH FX', Icons.tune),
  stems('AI STEMS', Icons.auto_awesome);

  final String title;
  final IconData icon;
  const PerformanceTab(this.title, this.icon);
}

class PerformanceTabsView extends StatefulWidget {
  final AudioEngineController controller;

  const PerformanceTabsView({
    super.key,
    required this.controller,
  });

  @override
  State<PerformanceTabsView> createState() => _PerformanceTabsViewState();
}

class _PerformanceTabsViewState extends State<PerformanceTabsView> {
  PerformanceTab _currentTab = PerformanceTab.hotCue;
  String _targetDeck = 'A'; // 'A' or 'B'

  @override
  Widget build(BuildContext context) {
    final deck = _targetDeck == 'A' ? widget.controller.deckA : widget.controller.deckB;
    final accentColor = _targetDeck == 'A' ? DJColors.deckA : DJColors.deckB;

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: DJColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DJColors.surfaceBorder),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header: Tab Bar & Deck A/B Target Selector
          Row(
            children: [
              // Deck Selector Pills
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: DJColors.background,
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _targetDeck = 'A'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _targetDeck == 'A'
                              ? DJColors.deckA
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'DECK A',
                          style: DJTypography.buttonLabel.copyWith(
                            fontSize: 9,
                            color: _targetDeck == 'A' ? Colors.black : DJColors.deckA,
                          ),
                        ),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => setState(() => _targetDeck = 'B'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _targetDeck == 'B'
                              ? DJColors.deckB
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'DECK B',
                          style: DJTypography.buttonLabel.copyWith(
                            fontSize: 9,
                            color: _targetDeck == 'B' ? Colors.black : DJColors.deckB,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Horizontal Performance Tabs
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: PerformanceTab.values.map((tab) {
                      final isSelected = _currentTab == tab;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: GestureDetector(
                          onTap: () => setState(() => _currentTab = tab),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? accentColor.withOpacity(0.2)
                                  : DJColors.surfaceElevated,
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: isSelected ? accentColor : DJColors.surfaceBorder,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  tab.icon,
                                  size: 12,
                                  color: isSelected ? accentColor : DJColors.textSecondary,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  tab.title,
                                  style: DJTypography.buttonLabel.copyWith(
                                    fontSize: 9,
                                    color: isSelected ? accentColor : DJColors.textSecondary,
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
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Active Performance Tab Content
          _buildActiveTabContent(deck, accentColor),
        ],
      ),
    );
  }

  Widget _buildActiveTabContent(dynamic deck, Color accentColor) {
    switch (_currentTab) {
      case PerformanceTab.hotCue:
        return HotCuePadGrid(
          hotCues: deck.hotCues,
          isDeleteMode: deck.isDeleteCueMode,
          isQuantized: deck.isQuantize,
          onTriggerCue: (idx) => widget.controller.triggerHotCue(_targetDeck, idx),
          onDeleteCue: (idx) => widget.controller.deleteHotCue(_targetDeck, idx),
          onToggleDeleteMode: () => widget.controller.toggleDeleteCueMode(_targetDeck),
          onToggleQuantize: () => widget.controller.toggleQuantize(_targetDeck),
        );

      case PerformanceTab.loop:
        return LoopControlStrip(
          currentLoopLength: deck.loopLength,
          isLoopActive: deck.isLoopActive,
          isLoopRollActive: deck.isLoopRollActive,
          accentColor: accentColor,
          onSelectLoopLength: (len) => widget.controller.setLoopLength(_targetDeck, len),
          onToggleLoop: () => widget.controller.toggleLoop(_targetDeck),
          onHalveLoop: () => widget.controller.halveLoop(_targetDeck),
          onDoubleLoop: () => widget.controller.doubleLoop(_targetDeck),
          onLoopIn: () {},
          onLoopOut: () {},
          onLoopRollStart: () => widget.controller.loopRollStart(_targetDeck),
          onLoopRollEnd: () => widget.controller.loopRollEnd(_targetDeck),
          onBeatJump: (beats) => widget.controller.beatJump(_targetDeck, beats),
        );

      case PerformanceTab.sampler:
        return SamplerBankGrid(
          currentBank: widget.controller.samplerBank,
          samplerVolume: widget.controller.samplerVolume,
          pitchSemitones: widget.controller.samplerPitchSemitones,
          onSelectBank: widget.controller.setSamplerBank,
          onVolumeChanged: widget.controller.setSamplerVolume,
          onPitchChanged: widget.controller.setSamplerPitch,
          onTriggerPad: (idx, asset) => widget.controller.triggerSamplerPad(idx, asset),
        );

      case PerformanceTab.fx:
        return XYTouchFxPad(
          selectedFx: widget.controller.selectedFx,
          x: widget.controller.fxX,
          y: widget.controller.fxY,
          isHoldActive: widget.controller.isFxHold,
          isTouched: widget.controller.isFxTouched,
          onSelectFx: widget.controller.selectFx,
          onUpdateCoordinates: widget.controller.updateFxCoordinates,
          onToggleHold: widget.controller.toggleFxHold,
          onTouchDown: () => widget.controller.setFxTouched(true),
          onTouchUp: () => widget.controller.setFxTouched(false),
        );

      case PerformanceTab.stems:
        final stems = deck.stems;
        return StemFaderPanel(
          vocalVolume: stems.vocalVolume,
          drumVolume: stems.drumVolume,
          bassVolume: stems.bassVolume,
          melodyVolume: stems.melodyVolume,
          vocalMuted: stems.vocalMuted,
          drumMuted: stems.drumMuted,
          bassMuted: stems.bassMuted,
          melodyMuted: stems.melodyMuted,
          vocalSolo: stems.vocalSolo,
          drumSolo: stems.drumSolo,
          bassSolo: stems.bassSolo,
          melodySolo: stems.melodySolo,
          onVolumeChanged: (stem, vol) => widget.controller.setStemVolume(_targetDeck, stem, vol),
          onToggleMute: (stem) => widget.controller.toggleStemMute(_targetDeck, stem),
          onToggleSolo: (stem) => widget.controller.toggleStemSolo(_targetDeck, stem),
        );
    }
  }
}
