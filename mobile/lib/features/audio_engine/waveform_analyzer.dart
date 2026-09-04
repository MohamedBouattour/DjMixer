import 'dart:math' as math;
import 'dart:typed_data';

/// Per-pixel waveform data in the style of Mixxx's `AnalyzerWaveform`.
///
/// Mixxx splits the signal into three bands (low < 600 Hz, mid 600-4000 Hz,
/// high > 4000 Hz) and, for every "stride" of samples, stores the peak
/// magnitude of each band plus the peak of the unfiltered signal. The renderer
/// then maps low/mid/high onto red/green/blue.
///
/// See mixxx/src/analyzer/analyzerwaveform.cpp and
/// mixxx/src/waveform/renderers/allshader/waveformrendererrgb.cpp.
class WaveformData {
  /// Peak magnitude per stride, 0-255, for each band.
  final Uint8List low;
  final Uint8List mid;
  final Uint8List high;

  /// Peak magnitude of the unfiltered signal per stride, 0-255. Drives the
  /// height of the drawn bar.
  final Uint8List all;

  /// Strides per second of audio — Mixxx's "visual sample rate".
  final double stridesPerSecond;

  /// Duration of the analyzed audio.
  final Duration duration;

  const WaveformData({
    required this.low,
    required this.mid,
    required this.high,
    required this.all,
    required this.stridesPerSecond,
    required this.duration,
  });

  int get length => all.length;

  bool get isEmpty => all.isEmpty;

  static final WaveformData empty = WaveformData(
    low: Uint8List(0),
    mid: Uint8List(0),
    high: Uint8List(0),
    all: Uint8List(0),
    stridesPerSecond: kStridesPerSecond,
    duration: Duration.zero,
  );

  /// Mixxx renders roughly 441 strides per second of audio (one stride per
  /// 100 samples at 44.1 kHz). That is enough detail for a zoomed-in scrolling
  /// waveform while keeping the analysis result small.
  static const double kStridesPerSecond = 441.0;

  /// Downsamples to [count] buckets, taking the peak of each band. Used for the
  /// zoomed-out overview strip, which has far fewer pixels than strides.
  WaveformData downsample(int count) {
    if (count <= 0 || all.isEmpty) return empty;
    if (count >= all.length) return this;

    final outLow = Uint8List(count);
    final outMid = Uint8List(count);
    final outHigh = Uint8List(count);
    final outAll = Uint8List(count);
    final bucket = all.length / count;

    for (var i = 0; i < count; i++) {
      final start = (i * bucket).floor();
      final end = math.min(((i + 1) * bucket).ceil(), all.length);
      var l = 0, m = 0, h = 0, a = 0;
      for (var j = start; j < end; j++) {
        if (low[j] > l) l = low[j];
        if (mid[j] > m) m = mid[j];
        if (high[j] > h) h = high[j];
        if (all[j] > a) a = all[j];
      }
      outLow[i] = l;
      outMid[i] = m;
      outHigh[i] = h;
      outAll[i] = a;
    }

    return WaveformData(
      low: outLow,
      mid: outMid,
      high: outHigh,
      all: outAll,
      stridesPerSecond: count / math.max(duration.inMicroseconds / 1e6, 1e-9),
      duration: duration,
    );
  }
}

/// Direct-form-1 biquad, used to build the band splitter.
class _Biquad {
  final double b0, b1, b2, a1, a2;
  double _x1 = 0, _x2 = 0, _y1 = 0, _y2 = 0;

  _Biquad(this.b0, this.b1, this.b2, this.a1, this.a2);

  /// Butterworth (Q = 1/sqrt(2)) low-pass, RBJ cookbook coefficients.
  factory _Biquad.lowPass(double sampleRate, double freq, double q) {
    final w0 = 2 * math.pi * freq / sampleRate;
    final cosW0 = math.cos(w0);
    final alpha = math.sin(w0) / (2 * q);
    final a0 = 1 + alpha;
    return _Biquad(
      ((1 - cosW0) / 2) / a0,
      (1 - cosW0) / a0,
      ((1 - cosW0) / 2) / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0,
    );
  }

  factory _Biquad.highPass(double sampleRate, double freq, double q) {
    final w0 = 2 * math.pi * freq / sampleRate;
    final cosW0 = math.cos(w0);
    final alpha = math.sin(w0) / (2 * q);
    final a0 = 1 + alpha;
    return _Biquad(
      ((1 + cosW0) / 2) / a0,
      (-(1 + cosW0)) / a0,
      ((1 + cosW0) / 2) / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0,
    );
  }

  double process(double x) {
    final y = b0 * x + b1 * _x1 + b2 * _x2 - a1 * _y1 - a2 * _y2;
    _x2 = _x1;
    _x1 = x;
    _y2 = _y1;
    _y1 = y;
    return y;
  }
}

/// A cascade of biquads, giving a steeper roll-off than a single section.
/// Two Butterworth sections approximate the 4th-order Bessel filters Mixxx uses
/// closely enough for display purposes.
class _Cascade {
  final List<_Biquad> stages;
  _Cascade(this.stages);

  double process(double x) {
    var y = x;
    for (final s in stages) {
      y = s.process(y);
    }
    return y;
  }
}

/// Analyzes decoded PCM into Mixxx-style banded waveform data.
class WaveformAnalyzer {
  /// Mixxx's band split points.
  static const double kLowMidFreqHz = 600.0;
  static const double kMidHighFreqHz = 4000.0;

  /// Analyzes mono or stereo PCM.
  ///
  /// [left] and [right] are normalized float samples (-1..1). Pass the same
  /// list twice for mono. The result mirrors Mixxx's analyzer: for every stride
  /// of samples it records the peak magnitude of each band.
  static WaveformData analyze({
    required Float32List left,
    Float32List? right,
    required double sampleRate,
    double stridesPerSecond = WaveformData.kStridesPerSecond,
  }) {
    final frames = left.length;
    if (frames == 0 || sampleRate <= 0) return WaveformData.empty;

    final samplesPerStride =
        math.max(1, (sampleRate / stridesPerSecond).round());
    final strideCount = (frames / samplesPerStride).ceil();

    final low = Uint8List(strideCount);
    final mid = Uint8List(strideCount);
    final high = Uint8List(strideCount);
    final all = Uint8List(strideCount);

    // Butterworth Q for a maximally-flat cascaded pair.
    const q1 = 0.54119610;
    const q2 = 1.30656296;

    final lowFilter = _Cascade([
      _Biquad.lowPass(sampleRate, kLowMidFreqHz, q1),
      _Biquad.lowPass(sampleRate, kLowMidFreqHz, q2),
    ]);
    // Band-pass built as high-pass followed by low-pass, as Mixxx's
    // EngineFilterBessel4Band does.
    final midFilter = _Cascade([
      _Biquad.highPass(sampleRate, kLowMidFreqHz, q1),
      _Biquad.highPass(sampleRate, kLowMidFreqHz, q2),
      _Biquad.lowPass(sampleRate, kMidHighFreqHz, q1),
      _Biquad.lowPass(sampleRate, kMidHighFreqHz, q2),
    ]);
    final highFilter = _Cascade([
      _Biquad.highPass(sampleRate, kMidHighFreqHz, q1),
      _Biquad.highPass(sampleRate, kMidHighFreqHz, q2),
    ]);

    var strideIndex = 0;
    var inStride = 0;
    var peakLow = 0.0, peakMid = 0.0, peakHigh = 0.0, peakAll = 0.0;

    for (var i = 0; i < frames; i++) {
      // Mixxx analyzes the mono sum of both channels for the filtered bands.
      final sample =
          right == null ? left[i] : (left[i] + right[i]) * 0.5;

      final l = lowFilter.process(sample).abs();
      final m = midFilter.process(sample).abs();
      final h = highFilter.process(sample).abs();
      final a = sample.abs();

      if (l > peakLow) peakLow = l;
      if (m > peakMid) peakMid = m;
      if (h > peakHigh) peakHigh = h;
      if (a > peakAll) peakAll = a;

      if (++inStride >= samplesPerStride) {
        if (strideIndex < strideCount) {
          low[strideIndex] = _toByte(peakLow);
          mid[strideIndex] = _toByte(peakMid);
          high[strideIndex] = _toByte(peakHigh);
          all[strideIndex] = _toByte(peakAll);
        }
        strideIndex++;
        inStride = 0;
        peakLow = peakMid = peakHigh = peakAll = 0.0;
      }
    }

    // Flush the final partial stride.
    if (inStride > 0 && strideIndex < strideCount) {
      low[strideIndex] = _toByte(peakLow);
      mid[strideIndex] = _toByte(peakMid);
      high[strideIndex] = _toByte(peakHigh);
      all[strideIndex] = _toByte(peakAll);
    }

    final data = WaveformData(
      low: low,
      mid: mid,
      high: high,
      all: all,
      stridesPerSecond: sampleRate / samplesPerStride,
      duration: Duration(microseconds: (frames / sampleRate * 1e6).round()),
    );

    return _normalize(data);
  }

  static int _toByte(double v) {
    final scaled = (v * 255.0).round();
    return scaled < 0 ? 0 : (scaled > 255 ? 255 : scaled);
  }

  /// Scales the whole waveform so the loudest point reaches full height, the
  /// way Mixxx's normalization option does. Quiet tracks would otherwise render
  /// as a nearly flat line.
  static WaveformData _normalize(WaveformData data) {
    var peak = 0;
    for (final v in data.all) {
      if (v > peak) peak = v;
    }
    if (peak == 0 || peak >= 250) return data;

    final gain = 255.0 / peak;
    Uint8List scale(Uint8List src) {
      final out = Uint8List(src.length);
      for (var i = 0; i < src.length; i++) {
        final v = (src[i] * gain).round();
        out[i] = v > 255 ? 255 : v;
      }
      return out;
    }

    return WaveformData(
      low: scale(data.low),
      mid: scale(data.mid),
      high: scale(data.high),
      all: scale(data.all),
      stridesPerSecond: data.stridesPerSecond,
      duration: data.duration,
    );
  }
}
