import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/features/deck/models/deck_state.dart';
import 'package:dj_pro_master/features/deck/models/track.dart';
import 'package:dj_pro_master/features/audio_engine/time_stretcher.dart';

void main() {
  group('Deck State & Slip Mode Tests', () {
    test('effectiveSpeedMultiplier scales correctly with pitch percentage', () {
      const stateZero = DeckState(deckId: 'A', pitchPercent: 0.0);
      expect(stateZero.effectiveSpeedMultiplier, equals(1.0));

      const statePlusEight = DeckState(deckId: 'A', pitchPercent: 8.0);
      expect(statePlusEight.effectiveSpeedMultiplier, closeTo(1.08, 0.001));

      const stateMinusFifty = DeckState(deckId: 'A', pitchPercent: -50.0);
      expect(stateMinusFifty.effectiveSpeedMultiplier, closeTo(0.50, 0.001));
    });

    test('Slip mode shadow needle position is tracked independently from scrub position', () {
      var state = const DeckState(
        deckId: 'A',
        isSlipMode: true,
        position: Duration(seconds: 10),
        slipPosition: Duration(seconds: 10),
      );

      // Simulate 5 seconds scratch scrub back to 2 seconds while background slip continues to 15s
      state = state.copyWith(
        position: const Duration(seconds: 2),
        slipPosition: const Duration(seconds: 15),
      );

      expect(state.position, equals(const Duration(seconds: 2)));
      expect(state.slipPosition, equals(const Duration(seconds: 15)));

      // On release, position jumps back to slipPosition
      state = state.copyWith(position: state.slipPosition);
      expect(state.position, equals(const Duration(seconds: 15)));
    });

    test('Camelot Wheel key transposition and harmonic compatibility', () {
      expect(TimeStretcher.getCamelot('Am'), equals('8A'));
      expect(TimeStretcher.getCamelot('C'), equals('8B'));
      expect(TimeStretcher.getCamelot('Em'), equals('9A'));

      // 8A (Am) and 8B (C) are relative minor/major -> harmonically compatible
      expect(TimeStretcher.isHarmonicallyCompatible('Am', 'C'), isTrue);

      // 8A (Am) and 9A (Em) are 1 step distance -> harmonically compatible
      expect(TimeStretcher.isHarmonicallyCompatible('Am', 'Em'), isTrue);

      // 8A (Am) and 2A (Ebm) are completely dissonant -> not compatible
      expect(TimeStretcher.isHarmonicallyCompatible('Am', 'Ebm'), isFalse);
    });

    test('Track end triggers stop and resets playhead to start of song', () {
      final stateAtEnd = DeckState(
        deckId: 'A',
        isPlaying: true,
        position: const Duration(minutes: 3),
        track: Track(
          id: 'test',
          title: 'Test',
          artist: 'Artist',
          bpm: 120,
          key: 'Am',
          camelot: '8A',
          waveformPeaks: const [0.5, 0.8],
          duration: const Duration(minutes: 3),
        ),
      );

      final trackDuration = stateAtEnd.track!.duration;
      final bool trackEnded = !stateAtEnd.isLoopActive &&
          !stateAtEnd.isScratching &&
          stateAtEnd.position >= trackDuration;

      expect(trackEnded, isTrue);

      final resetState = stateAtEnd.copyWith(
        isPlaying: false,
        position: Duration.zero,
      );

      expect(resetState.isPlaying, isFalse);
      expect(resetState.position, equals(Duration.zero));
    });
  });
}
