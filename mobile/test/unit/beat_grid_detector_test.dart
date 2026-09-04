import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/features/audio_engine/beat_grid_detector.dart';

void main() {
  group('BeatGridDetector Tests', () {
    test('detectBpmFromPeaks returns valid standard tempo for regular peaks', () {
      // 120 BPM at 44100Hz with 512 hopSize means peak every ~43 frames
      final peaks = List.generate(200, (i) => (i % 43 == 0) ? 0.95 : 0.1);
      final bpm = BeatGridDetector.detectBpmFromPeaks(peaks);
      expect(bpm, inInclusiveRange(70.0, 160.0));
    });

    test('generateBeatGrid produces correct time markers for 120 BPM', () {
      final markers = BeatGridDetector.generateBeatGrid(
        bpm: 120.0, // 0.5s per beat
        firstDownbeatSec: 0.0,
        trackDuration: const Duration(seconds: 4),
      );
      expect(markers.length, equals(8));
      expect(markers[0], closeTo(0.0, 0.001));
      expect(markers[1], closeTo(0.5, 0.001));
      expect(markers[2], closeTo(1.0, 0.001));
    });

    test('calculateTapTempo accurately computes BPM from tap intervals', () {
      final base = DateTime(2026, 1, 1, 12, 0, 0);
      final taps = [
        base,
        base.add(const Duration(milliseconds: 500)), // 120 BPM
        base.add(const Duration(milliseconds: 1000)),
        base.add(const Duration(milliseconds: 1500)),
      ];
      final bpm = BeatGridDetector.calculateTapTempo(taps);
      expect(bpm, isNotNull);
      expect(bpm!, closeTo(120.0, 0.5));
    });

    test('calculatePhaseOffset calculates offset between two decks', () {
      final offset = BeatGridDetector.calculatePhaseOffset(
        currentSecA: 0.25,
        bpmA: 120.0, // beat every 0.5s -> phase is 0.5
        currentSecB: 0.0,
        bpmB: 120.0, // phase is 0.0
      );
      // phase difference 0.5 of 0.5s = 0.25s
      expect(offset.abs(), closeTo(0.25, 0.01));
    });
  });
}
