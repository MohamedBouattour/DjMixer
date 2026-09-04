import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../features/audio_engine/waveform_analyzer.dart';
import '../theme/dj_colors.dart';

/// Mixxx-style RGB waveform.
///
/// Follows the rendering Mixxx uses in
/// `waveform/renderers/allshader/waveformrendererrgb.cpp`: for every pixel
/// column take the peak of the low, mid and high bands, map them onto red,
/// green and blue, normalize by the largest component, and draw a bar of the
/// unfiltered peak's height symmetrically about the centre line.
class WaveformView extends StatelessWidget {
  /// Analyzed band data. When null the widget falls back to [peaks].
  final WaveformData? waveform;

  /// Legacy synthetic envelope, used until analysis finishes.
  final List<double> peaks;

  final double currentProgress; // 0.0 to 1.0
  final Duration duration;
  final double bpm;
  final Color accentColor;
  final List<double>? hotCuePoints;
  final double? loopStart;
  final double? loopEnd;
  final bool isLooping;
  final ValueChanged<double>? onSeek;
  final double height;
  final bool isOverview;

  /// Zoom of the scrolling view, in screen pixels per second of audio.
  final double pixelsPerSecond;

  const WaveformView({
    super.key,
    this.waveform,
    required this.peaks,
    required this.currentProgress,
    required this.duration,
    required this.bpm,
    this.accentColor = DJColors.deckA,
    this.hotCuePoints,
    this.loopStart,
    this.loopEnd,
    this.isLooping = false,
    this.onSeek,
    this.height = 70.0,
    this.isOverview = false,
    this.pixelsPerSecond = 140.0,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onHorizontalDragUpdate: (details) => _seek(context, details.localPosition),
      onTapDown: (details) => _seek(context, details.localPosition),
      child: Container(
        width: double.infinity,
        height: height,
        decoration: BoxDecoration(
          color: DJColors.background,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: DJColors.surfaceBorder, width: 1),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(5),
          child: CustomPaint(
            size: Size.infinite,
            painter: _WaveformPainter(
              waveform: waveform,
              peaks: peaks,
              progress: currentProgress,
              bpm: bpm,
              duration: duration,
              accentColor: accentColor,
              hotCues: hotCuePoints ?? const [],
              loopStart: loopStart,
              loopEnd: loopEnd,
              isLooping: isLooping,
              isOverview: isOverview,
              pixelsPerSecond: pixelsPerSecond,
            ),
          ),
        ),
      ),
    );
  }

  void _seek(BuildContext context, Offset local) {
    final onSeek = this.onSeek;
    if (onSeek == null) return;
    final box = context.findRenderObject() as RenderBox?;
    if (box == null) return;

    if (isOverview) {
      onSeek((local.dx / box.size.width).clamp(0.0, 1.0));
      return;
    }
    // The scrolling view is anchored at the playhead, so dragging it moves the
    // track relative to where it is now rather than jumping to an absolute
    // fraction of the width.
    final totalSec = duration.inMicroseconds / 1e6;
    if (totalSec <= 0) return;
    final deltaSec = (local.dx - box.size.width / 2) / pixelsPerSecond;
    onSeek(((currentProgress * totalSec + deltaSec) / totalSec).clamp(0.0, 1.0));
  }
}

/// Peak of each band across a range of strides, plus the resulting colour.
class _Column {
  final double low, mid, high, all;
  const _Column(this.low, this.mid, this.high, this.all);
  static const zero = _Column(0, 0, 0, 0);
  bool get isSilent => all <= 0;
}

class _WaveformPainter extends CustomPainter {
  final WaveformData? waveform;
  final List<double> peaks;
  final double progress;
  final double bpm;
  final Duration duration;
  final Color accentColor;
  final List<double> hotCues;
  final double? loopStart;
  final double? loopEnd;
  final bool isLooping;
  final bool isOverview;
  final double pixelsPerSecond;

  _WaveformPainter({
    required this.waveform,
    required this.peaks,
    required this.progress,
    required this.bpm,
    required this.duration,
    required this.accentColor,
    required this.hotCues,
    this.loopStart,
    this.loopEnd,
    required this.isLooping,
    required this.isOverview,
    required this.pixelsPerSecond,
  });

  /// Mixxx's default signal colours: low = red, mid = green, high = blue.
  static const _lowColor = Color(0xFFFF0000);
  static const _midColor = Color(0xFF00FF00);
  static const _highColor = Color(0xFF0000FF);

  @override
  void paint(Canvas canvas, Size size) {
    if (isOverview) {
      _paintOverview(canvas, size);
    } else {
      _paintScrolling(canvas, size);
    }
  }

  // --- Band sampling -------------------------------------------------------

  /// Band levels over the strides covering [fromStride, toStride).
  ///
  /// Height always comes from the true peak. Colour uses the peak too when a
  /// column covers only a handful of strides (the zoomed-in view), but falls
  /// back to the mean once a column spans a long stretch of the track —
  /// otherwise every band saturates and the waveform washes out to grey.
  _Column _sampleStrides(WaveformData w, double fromStride, double toStride) {
    var a = fromStride.floor();
    var b = toStride.ceil();
    if (b <= a) b = a + 1;
    if (b <= 0 || a >= w.length) return _Column.zero;
    a = a.clamp(0, w.length - 1);
    b = b.clamp(1, w.length);

    var peakLow = 0, peakMid = 0, peakHigh = 0, peakAll = 0;
    var sumLow = 0, sumMid = 0, sumHigh = 0, sumAll = 0;
    for (var i = a; i < b; i++) {
      if (w.low[i] > peakLow) peakLow = w.low[i];
      if (w.mid[i] > peakMid) peakMid = w.mid[i];
      if (w.high[i] > peakHigh) peakHigh = w.high[i];
      if (w.all[i] > peakAll) peakAll = w.all[i];
      sumLow += w.low[i];
      sumMid += w.mid[i];
      sumHigh += w.high[i];
      sumAll += w.all[i];
    }

    final n = b - a;
    if (n <= 8) {
      return _Column(
          peakLow / 255, peakMid / 255, peakHigh / 255, peakAll / 255);
    }
    // Mostly the average, so the intro/breakdown/drop shape of the track is
    // visible, with a little of the peak mixed back in to keep transients.
    final meanAll = sumAll / n;
    return _Column(
      sumLow / n / 255,
      sumMid / n / 255,
      sumHigh / n / 255,
      ((meanAll * 0.72 + peakAll * 0.28) / 255).clamp(0.0, 1.0),
    );
  }

  /// Fallback column built from the synthetic envelope, so a track still shows
  /// something while it is being analyzed.
  _Column _sampleFallback(double fraction) {
    if (peaks.isEmpty) return _Column.zero;
    final idx = (fraction * (peaks.length - 1))
        .clamp(0, peaks.length - 1)
        .toInt();
    final amp = peaks[idx];
    return _Column(amp, amp * 0.7, amp * 0.4, amp);
  }

  /// Mixxx's colour mix: weight each band colour by its peak, then normalize by
  /// the largest component so every column is fully saturated.
  Color _columnColor(_Column c) {
    var r = c.low * _lowColor.r + c.mid * _midColor.r + c.high * _highColor.r;
    var g = c.low * _lowColor.g + c.mid * _midColor.g + c.high * _highColor.g;
    var b = c.low * _lowColor.b + c.mid * _midColor.b + c.high * _highColor.b;

    final maxComponent = math.max(r, math.max(g, b));
    if (maxComponent <= 0) return Colors.transparent;
    final norm = 1.0 / maxComponent;
    r *= norm;
    g *= norm;
    b *= norm;
    return Color.from(alpha: 1.0, red: r, green: g, blue: b);
  }

  /// Builds the bar geometry as a triangle mesh, the way Mixxx fills its vertex
  /// buffer. One `drawVertices` call is far cheaper than a draw call per column.
  void _drawColumns(
    Canvas canvas,
    Size size,
    List<double> xs,
    List<_Column> columns, {
    required double Function(int i) opacityFor,
  }) {
    final midY = size.height / 2;
    final halfBar = math.max(0.5, (xs.length > 1 ? (xs[1] - xs[0]) : 2.0) / 2);

    final positions = <Offset>[];
    final colors = <Color>[];

    for (var i = 0; i < columns.length; i++) {
      final c = columns[i];
      if (c.isSilent) continue;
      final x = xs[i];
      final h = (c.all * midY * 0.95).clamp(1.0, midY);
      final color = _columnColor(c).withValues(alpha: opacityFor(i));

      final l = x - halfBar;
      final r = x + halfBar;
      final t = midY - h;
      final b = midY + h;

      // Two triangles per column.
      positions.addAll([
        Offset(l, t), Offset(r, t), Offset(l, b),
        Offset(r, t), Offset(r, b), Offset(l, b),
      ]);
      for (var k = 0; k < 6; k++) {
        colors.add(color);
      }
    }

    if (positions.isEmpty) return;
    final vertices = ui.Vertices(
      ui.VertexMode.triangles,
      positions,
      colors: colors,
    );
    canvas.drawVertices(vertices, BlendMode.srcOver, Paint());
    vertices.dispose();
  }

  // --- Overview ------------------------------------------------------------

  void _paintOverview(Canvas canvas, Size size) {
    if (loopStart != null && loopEnd != null && loopEnd! > loopStart!) {
      canvas.drawRect(
        Rect.fromLTRB(
            loopStart! * size.width, 0, loopEnd! * size.width, size.height),
        Paint()
          ..color = (isLooping ? DJColors.vuGreen : DJColors.vuAmber)
              .withValues(alpha: 0.22),
      );
    }

    final w = waveform;
    final columnCount = size.width.floor().clamp(1, 4096);
    final xs = <double>[];
    final columns = <_Column>[];

    for (var i = 0; i < columnCount; i++) {
      final f0 = i / columnCount;
      final f1 = (i + 1) / columnCount;
      xs.add(i + 0.5);
      if (w != null && w.length > 0) {
        columns.add(_sampleStrides(w, f0 * w.length, f1 * w.length));
      } else {
        columns.add(_sampleFallback(f0));
      }
    }

    // Played audio is drawn at full strength, the rest dimmed — the same cue
    // Mixxx's overview gives.
    _drawColumns(canvas, size, xs, columns,
        opacityFor: (i) => (i / columnCount) <= progress ? 1.0 : 0.32);

    for (var i = 0; i < hotCues.length; i++) {
      final cueX = hotCues[i] * size.width;
      final cueColor = DJColors.padColors[i % DJColors.padColors.length];
      canvas.drawCircle(Offset(cueX, 6), 3.5, Paint()..color = cueColor);
      canvas.drawLine(Offset(cueX, 6), Offset(cueX, size.height),
          Paint()..color = cueColor..strokeWidth = 1.0);
    }

    final playheadX = progress * size.width;
    canvas.drawLine(Offset(playheadX, 0), Offset(playheadX, size.height),
        Paint()..color = Colors.white..strokeWidth = 2.0);
  }

  // --- Scrolling view ------------------------------------------------------

  void _paintScrolling(Canvas canvas, Size size) {
    final centerX = size.width / 2;
    final totalSec = duration.inMicroseconds / 1e6;
    final currentSec = progress * totalSec;

    _paintBeatGrid(canvas, size, centerX, currentSec);

    final w = waveform;
    final columnCount = size.width.floor().clamp(1, 4096);
    final secPerPixel = 1.0 / pixelsPerSecond;

    final xs = <double>[];
    final columns = <_Column>[];

    for (var i = 0; i < columnCount; i++) {
      final x = i + 0.5;
      final t0 = currentSec + (x - 0.5 - centerX) * secPerPixel;
      final t1 = currentSec + (x + 0.5 - centerX) * secPerPixel;
      xs.add(x);

      if (t1 < 0 || (totalSec > 0 && t0 > totalSec)) {
        columns.add(_Column.zero);
        continue;
      }
      if (w != null && w.length > 0) {
        columns.add(_sampleStrides(
            w, t0 * w.stridesPerSecond, t1 * w.stridesPerSecond));
      } else if (totalSec > 0) {
        columns.add(_sampleFallback((t0 / totalSec).clamp(0.0, 1.0)));
      } else {
        columns.add(_Column.zero);
      }
    }

    _drawColumns(canvas, size, xs, columns, opacityFor: (_) => 1.0);

    _paintLoopOverlay(canvas, size, centerX, currentSec, totalSec);
    _paintPlayhead(canvas, size, centerX);
  }

  void _paintBeatGrid(
      Canvas canvas, Size size, double centerX, double currentSec) {
    if (bpm <= 0) return;
    final secPerBeat = 60.0 / bpm;
    final halfSpanSec = centerX / pixelsPerSecond;
    final startBeat = ((currentSec - halfSpanSec) / secPerBeat).floor();
    final endBeat = ((currentSec + halfSpanSec) / secPerBeat).ceil();

    for (var b = startBeat; b <= endBeat; b++) {
      if (b < 0) continue;
      final x = centerX + (b * secPerBeat - currentSec) * pixelsPerSecond;
      final isDownbeat = (b % 4) == 0;
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        Paint()
          ..color = Colors.white.withValues(alpha: isDownbeat ? 0.35 : 0.12)
          ..strokeWidth = isDownbeat ? 1.5 : 0.8,
      );
    }
  }

  void _paintLoopOverlay(Canvas canvas, Size size, double centerX,
      double currentSec, double totalSec) {
    if (loopStart == null || loopEnd == null || totalSec <= 0) return;
    final x0 = centerX + (loopStart! * totalSec - currentSec) * pixelsPerSecond;
    final x1 = centerX + (loopEnd! * totalSec - currentSec) * pixelsPerSecond;
    if (x1 < 0 || x0 > size.width) return;
    canvas.drawRect(
      Rect.fromLTRB(x0, 0, x1, size.height),
      Paint()
        ..color = (isLooping ? DJColors.vuGreen : DJColors.vuAmber)
            .withValues(alpha: 0.18),
    );
  }

  void _paintPlayhead(Canvas canvas, Size size, double centerX) {
    canvas.drawLine(
      Offset(centerX, 0),
      Offset(centerX, size.height),
      Paint()..color = Colors.white..strokeWidth = 2.0,
    );
    canvas.drawPath(
      Path()
        ..moveTo(centerX - 5, 0)
        ..lineTo(centerX + 5, 0)
        ..lineTo(centerX, 7)
        ..close(),
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant _WaveformPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.bpm != bpm ||
        oldDelegate.waveform != waveform ||
        oldDelegate.peaks != peaks ||
        oldDelegate.duration != duration ||
        oldDelegate.isLooping != isLooping ||
        oldDelegate.loopStart != loopStart ||
        oldDelegate.loopEnd != loopEnd ||
        oldDelegate.pixelsPerSecond != pixelsPerSecond;
  }
}
