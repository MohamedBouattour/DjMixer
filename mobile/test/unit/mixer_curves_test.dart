import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/core/components/crossfader_slider.dart';
import 'package:dj_pro_master/features/audio_engine/dsp_filters.dart';

void main() {
  group('Crossfader & Mixer Math Tests', () {
    test('Linear curve provides equal power center balance', () {
      final (gainA, gainB) = CrossfaderSlider.calculateGains(
        0.0, // Center
        CrossfaderCurve.linear,
        false,
      );
      // At center, each channel is ~0.707 (-3dB)
      expect(gainA, closeTo(0.707, 0.01));
      expect(gainB, closeTo(0.707, 0.01));
    });

    test('Sharp Cut curve provides full volume past cut-in distance', () {
      // Position -0.8 is just slightly off left wall -> both decks should be full volume
      final (gainA, gainB) = CrossfaderSlider.calculateGains(
        -0.8,
        CrossfaderCurve.sharpCut,
        false,
      );
      expect(gainA, equals(1.0));
      expect(gainB, equals(1.0));

      // Position -1.0 (hard left) -> Deck B must be 0.0
      final (gainAEdge, gainBEdge) = CrossfaderSlider.calculateGains(
        -1.0,
        CrossfaderCurve.sharpCut,
        false,
      );
      expect(gainAEdge, equals(1.0));
      expect(gainBEdge, equals(0.0));
    });

    test('Hamster Switch inverts deck assignments', () {
      final (gainA, gainB) = CrossfaderSlider.calculateGains(
        -1.0, // Hard Left
        CrossfaderCurve.linear,
        true, // Hamster active
      );
      // With hamster switch, Hard Left should output Deck B!
      expect(gainA, closeTo(0.0, 0.01));
      expect(gainB, closeTo(1.0, 0.01));
    });

    test('EQ Isolator mode completely kills signal at zero position', () {
      final multStandard = DSPFilters.calculateEqGainMultiplier(0.0, EQMode.standard, false);
      final multIsolator = DSPFilters.calculateEqGainMultiplier(0.0, EQMode.isolator, false);

      expect(multStandard, greaterThan(0.0)); // -26dB cut
      expect(multIsolator, equals(0.0));     // Absolute kill
    });

    test('EQ Kill button completely silences signal', () {
      final mult = DSPFilters.calculateEqGainMultiplier(0.8, EQMode.standard, true);
      expect(mult, equals(0.0));
    });
  });
}
