import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/features/audio_engine/waveform_analyzer.dart';

/// One second of a sine wave at [freq] Hz.
Float32List tone(double freq, double sampleRate, {double amplitude = 1.0}) {
  final n = sampleRate.round();
  final out = Float32List(n);
  for (var i = 0; i < n; i++) {
    out[i] = amplitude * math.sin(2 * math.pi * freq * i / sampleRate);
  }
  return out;
}

void main() {
  const sampleRate = 44100.0;

  group('WaveformAnalyzer band splitting', () {
    // Mixxx splits at 600 Hz and 4000 Hz; a pure tone must land in exactly one
    // band, which is what gives the waveform its colour.
    test('a bass tone lands in the low band', () {
      final d = WaveformAnalyzer.analyze(
          left: tone(100, sampleRate), sampleRate: sampleRate);
      final mid = d.length ~/ 2; // skip filter settling at the edges

      expect(d.low[mid], greaterThan(200));
      expect(d.mid[mid], lessThan(60));
      expect(d.high[mid], lessThan(30));
    });

    test('a midrange tone lands in the mid band', () {
      final d = WaveformAnalyzer.analyze(
          left: tone(1500, sampleRate), sampleRate: sampleRate);
      final mid = d.length ~/ 2;

      expect(d.mid[mid], greaterThan(200));
      expect(d.low[mid], lessThan(60));
      expect(d.high[mid], lessThan(60));
    });

    test('a treble tone lands in the high band', () {
      final d = WaveformAnalyzer.analyze(
          left: tone(10000, sampleRate), sampleRate: sampleRate);
      final mid = d.length ~/ 2;

      expect(d.high[mid], greaterThan(200));
      expect(d.low[mid], lessThan(30));
      expect(d.mid[mid], lessThan(60));
    });
  });

  group('WaveformAnalyzer output shape', () {
    test('produces roughly one stride per 1/441 second', () {
      final d = WaveformAnalyzer.analyze(
          left: tone(440, sampleRate), sampleRate: sampleRate);

      expect(d.length, closeTo(441, 2));
      expect(d.duration.inMilliseconds, closeTo(1000, 5));
      expect(d.stridesPerSecond, closeTo(441, 2));
    });

    test('quiet tracks are normalized up to full scale', () {
      final d = WaveformAnalyzer.analyze(
          left: tone(1500, sampleRate, amplitude: 0.05),
          sampleRate: sampleRate);

      expect(d.all.reduce(math.max), greaterThan(240));
    });

    test('silence stays silent', () {
      final d = WaveformAnalyzer.analyze(
          left: Float32List(4410), sampleRate: sampleRate);

      expect(d.all.every((v) => v == 0), isTrue);
    });

    test('empty input yields empty data', () {
      final d = WaveformAnalyzer.analyze(
          left: Float32List(0), sampleRate: sampleRate);

      expect(d.isEmpty, isTrue);
    });

    test('downsampling keeps the peak of each bucket', () {
      final d = WaveformAnalyzer.analyze(
          left: tone(1500, sampleRate), sampleRate: sampleRate);
      final small = d.downsample(50);

      expect(small.length, 50);
      expect(small.all.reduce(math.max), d.all.reduce(math.max));
      expect(small.duration, d.duration);
    });

    test('stereo input is summed to mono', () {
      final left = tone(1500, sampleRate);
      final d = WaveformAnalyzer.analyze(
        left: left,
        right: Float32List.fromList(left.map((v) => -v).toList()),
        sampleRate: sampleRate,
      );

      // Perfectly out-of-phase channels cancel, so nothing should register.
      expect(d.all.every((v) => v == 0), isTrue);
    });
  });
}
