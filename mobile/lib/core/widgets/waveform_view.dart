import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/dj_colors.dart';

class WaveformView extends StatelessWidget {
  final List<double> peaks; // Normalized peak amplitudes
  final double currentProgress; // 0.0 to 1.0
  final Duration duration;
  final double bpm;
  final Color accentColor;
  final List<double>? hotCuePoints; // Normalized 0.0 to 1.0 positions
  final double? loopStart; // Normalized position
  final double? loopEnd; // Normalized position
  final bool isLooping;
  final ValueChanged<double>? onSeek;
  final double height;
  final bool isOverview;

  const WaveformView({
    super.key,
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
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragUpdate: (details) {
        if (onSeek == null) return;
        final box = context.findRenderObject() as RenderBox;
        final localX = details.localPosition.dx;
        final fraction = (localX / box.size.width).clamp(0.0, 1.0);
        onSeek!(fraction);
      },
      onTapDown: (details) {
        if (onSeek == null) return;
        final box = context.findRenderObject() as RenderBox;
        final localX = details.localPosition.dx;
        final fraction = (localX / box.size.width).clamp(0.0, 1.0);
        onSeek!(fraction);
      },
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
            painter: _WaveformPainter(
              peaks: peaks,
              progress: currentProgress,
              bpm: bpm,
              duration: duration,
              accentColor: accentColor,
              hotCues: hotCuePoints ?? [],
              loopStart: loopStart,
              loopEnd: loopEnd,
              isLooping: isLooping,
              isOverview: isOverview,
            ),
          ),
        ),
      ),
    );
  }
}

class _WaveformPainter extends CustomPainter {
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

  _WaveformPainter({
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
  });

  @override
  void paint(Canvas canvas, Size size) {
    final midY = size.height / 2;

    if (isOverview) {
      _paintOverview(canvas, size, midY);
    } else {
      _paintScrollingWaveform(canvas, size, midY);
    }
  }

  void _paintOverview(Canvas canvas, Size size, double midY) {
    // 1. Draw loop highlight region
    if (loopStart != null && loopEnd != null && loopEnd! > loopStart!) {
      final startX = loopStart! * size.width;
      final endX = loopEnd! * size.width;
      final loopRect = Rect.fromLTRB(startX, 0, endX, size.height);
      final loopPaint = Paint()
        ..color = (isLooping ? DJColors.vuGreen : DJColors.vuAmber).withOpacity(0.25)
        ..style = PaintingStyle.fill;
      canvas.drawRect(loopRect, loopPaint);
    }

    // 2. Draw static full track waveform
    final count = peaks.isEmpty ? 120 : peaks.length;
    final barWidth = size.width / count;

    for (int i = 0; i < count; i++) {
      final amp = peaks.isNotEmpty ? peaks[i % peaks.length] : (0.2 + 0.6 * math.sin(i * 0.1).abs());
      final barHeight = (amp * midY * 0.9).clamp(2.0, midY);
      final x = i * barWidth;
      final isPlayed = (x / size.width) <= progress;

      final barPaint = Paint()
        ..color = isPlayed ? accentColor : DJColors.surfaceElevated
        ..strokeWidth = math.max(1.0, barWidth - 0.5)
        ..strokeCap = StrokeCap.round;

      canvas.drawLine(Offset(x, midY - barHeight), Offset(x, midY + barHeight), barPaint);
    }

    // 3. Draw Hot Cue Pins
    for (int i = 0; i < hotCues.length; i++) {
      final cueX = hotCues[i] * size.width;
      final cueColor = DJColors.padColors[i % DJColors.padColors.length];
      final cuePaint = Paint()..color = cueColor;

      canvas.drawCircle(Offset(cueX, 6), 3.5, cuePaint);
      final linePaint = Paint()
        ..color = cueColor
        ..strokeWidth = 1.0;
      canvas.drawLine(Offset(cueX, 6), Offset(cueX, size.height), linePaint);
    }

    // 4. Playhead needle
    final playheadX = progress * size.width;
    final needlePaint = Paint()
      ..color = Colors.white
      ..strokeWidth = 2.0;
    canvas.drawLine(Offset(playheadX, 0), Offset(playheadX, size.height), needlePaint);
  }

  void _paintScrollingWaveform(Canvas canvas, Size size, double midY) {
    final centerX = size.width / 2;
    const pixelsPerSec = 140.0; // Zoom factor
    final totalSec = duration.inMilliseconds / 1000.0;
    final currentSec = progress * totalSec;

    // Draw beatgrid lines
    if (bpm > 0) {
      final secPerBeat = 60.0 / bpm;
      final startBeat = (currentSec - (centerX / pixelsPerSec)) / secPerBeat;
      final endBeat = (currentSec + (centerX / pixelsPerSec)) / secPerBeat;

      for (int b = startBeat.floor(); b <= endBeat.ceil(); b++) {
        if (b < 0) continue;
        final beatSec = b * secPerBeat;
        final x = centerX + (beatSec - currentSec) * pixelsPerSec;
        final isDownbeat = (b % 4) == 0;

        final gridPaint = Paint()
          ..color = isDownbeat
              ? Colors.white.withOpacity(0.4)
              : Colors.white.withOpacity(0.15)
          ..strokeWidth = isDownbeat ? 1.5 : 0.8;

        canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
      }
    }

    // Draw multi-color frequency scrolling bars
    const barSpacing = 4.0;
    final numBars = (size.width / barSpacing).ceil() + 2;

    for (int i = -numBars ~/ 2; i <= numBars ~/ 2; i++) {
      final x = centerX + i * barSpacing;
      final timeAtBar = currentSec + (i * barSpacing / pixelsPerSec);
      if (timeAtBar < 0 || (totalSec > 0 && timeAtBar > totalSec)) continue;

      // Amplitude from peaks or synthetic generator
      final frac = totalSec > 0 ? (timeAtBar / totalSec).clamp(0.0, 1.0) : 0.0;
      final peakIndex = peaks.isNotEmpty ? (frac * (peaks.length - 1)).round() : 0;
      final amp = peaks.isNotEmpty
          ? peaks[peakIndex]
          : (0.3 + 0.6 * math.sin(timeAtBar * 4.0).abs());

      final barH = (amp * midY * 0.95).clamp(3.0, midY);

      // 3-band color: Bass (Pink/Red), Mid (Cyan), High (White)
      final bassH = barH * 0.45;
      final hiH = barH * 0.2;

      // Highs
      final hiPaint = Paint()..color = Colors.white.withOpacity(0.9)..strokeWidth = 2.5;
      canvas.drawLine(Offset(x, midY - barH), Offset(x, midY - (barH - hiH)), hiPaint);
      canvas.drawLine(Offset(x, midY + (barH - hiH)), Offset(x, midY + barH), hiPaint);

      // Mids
      final midPaint = Paint()..color = accentColor..strokeWidth = 2.5;
      canvas.drawLine(Offset(x, midY - (barH - hiH)), Offset(x, midY - bassH), midPaint);
      canvas.drawLine(Offset(x, midY + bassH), Offset(x, midY + (barH - hiH)), midPaint);

      // Bass
      final bassPaint = Paint()..color = const Color(0xFFFF2A6D)..strokeWidth = 2.5;
      canvas.drawLine(Offset(x, midY - bassH), Offset(x, midY + bassH), bassPaint);
    }

    // Center Fixed Playhead
    final playheadPaint = Paint()
      ..color = Colors.white
      ..strokeWidth = 2.5;
    canvas.drawLine(Offset(centerX, 0), Offset(centerX, size.height), playheadPaint);

    final needleHead = Path()
      ..moveTo(centerX - 5, 0)
      ..lineTo(centerX + 5, 0)
      ..lineTo(centerX, 7)
      ..close();
    canvas.drawPath(needleHead, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant _WaveformPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.bpm != bpm ||
        oldDelegate.isLooping != isLooping ||
        oldDelegate.loopStart != loopStart ||
        oldDelegate.loopEnd != loopEnd;
  }
}
