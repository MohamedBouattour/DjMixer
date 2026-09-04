import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/features/audio_engine/stem_separator_dsp.dart';

void main() {
  group('Real-Time AI Stems DSP Tests', () {
    test('Default stem state outputs full unity volume on all 4 stems', () {
      const state = StemState();
      final (vocal, drum, bass, melody) = state.computeEffectiveGains();

      expect(vocal, equals(1.0));
      expect(drum, equals(1.0));
      expect(bass, equals(1.0));
      expect(melody, equals(1.0));
    });

    test('Muting vocals completely zeroes vocal gain while others remain active', () {
      const state = StemState(vocalMuted: true);
      final (vocal, drum, bass, melody) = state.computeEffectiveGains();

      expect(vocal, equals(0.0));
      expect(drum, equals(1.0));
      expect(bass, equals(1.0));
      expect(melody, equals(1.0));
    });

    test('Soloing drums silences all non-solo stems (Acapella / Instrumental extraction)', () {
      const state = StemState(drumSolo: true);
      final (vocal, drum, bass, melody) = state.computeEffectiveGains();

      expect(vocal, equals(0.0));
      expect(drum, equals(1.0));
      expect(bass, equals(0.0));
      expect(melody, equals(0.0));
    });

    test('Multiple solos allow simultaneous stems (e.g. Drums + Bass rhythm section)', () {
      const state = StemState(drumSolo: true, bassSolo: true);
      final (vocal, drum, bass, melody) = state.computeEffectiveGains();

      expect(vocal, equals(0.0));
      expect(drum, equals(1.0));
      expect(bass, equals(1.0));
      expect(melody, equals(0.0));
    });
  });
}
