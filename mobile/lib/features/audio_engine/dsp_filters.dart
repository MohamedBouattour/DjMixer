import 'dart:math' as math;

enum EQMode {
  standard, // -26dB to +6dB
  isolator, // -infinity (kill) to +6dB
}

/// Digital Biquad filter coefficients and state
class BiquadCoefficients {
  final double b0, b1, b2, a1, a2;
  const BiquadCoefficients(this.b0, this.b1, this.b2, this.a1, this.a2);
}

class DSPFilters {
  /// Computes Peaking EQ Biquad Filter coefficients
  static BiquadCoefficients calculatePeakingEQ({
    required double sampleRate,
    required double centerFreq,
    required double gainDb,
    double q = 1.0,
  }) {
    final w0 = 2.0 * math.pi * centerFreq / sampleRate;
    final alpha = math.sin(w0) / (2.0 * q);
    final A = math.pow(10.0, gainDb / 40.0).toDouble();

    final b0 = 1.0 + alpha * A;
    final b1 = -2.0 * math.cos(w0);
    final b2 = 1.0 - alpha * A;
    final a0 = 1.0 + alpha / A;
    final a1 = -2.0 * math.cos(w0);
    final a2 = 1.0 - alpha / A;

    return BiquadCoefficients(
      b0 / a0,
      b1 / a0,
      b2 / a0,
      a1 / a0,
      a2 / a0,
    );
  }

  /// Computes Low-Pass Biquad Filter coefficients
  static BiquadCoefficients calculateLowPass({
    required double sampleRate,
    required double cutoffFreq,
    double q = 0.707,
  }) {
    final clampedCutoff = cutoffFreq.clamp(20.0, sampleRate * 0.45);
    final w0 = 2.0 * math.pi * clampedCutoff / sampleRate;
    final alpha = math.sin(w0) / (2.0 * q);
    final cosw0 = math.cos(w0);

    final b0 = (1.0 - cosw0) / 2.0;
    final b1 = 1.0 - cosw0;
    final b2 = (1.0 - cosw0) / 2.0;
    final a0 = 1.0 + alpha;
    final a1 = -2.0 * cosw0;
    final a2 = 1.0 - alpha;

    return BiquadCoefficients(
      b0 / a0,
      b1 / a0,
      b2 / a0,
      a1 / a0,
      a2 / a0,
    );
  }

  /// Computes High-Pass Biquad Filter coefficients
  static BiquadCoefficients calculateHighPass({
    required double sampleRate,
    required double cutoffFreq,
    double q = 0.707,
  }) {
    final clampedCutoff = cutoffFreq.clamp(20.0, sampleRate * 0.45);
    final w0 = 2.0 * math.pi * clampedCutoff / sampleRate;
    final alpha = math.sin(w0) / (2.0 * q);
    final cosw0 = math.cos(w0);

    final b0 = (1.0 + cosw0) / 2.0;
    final b1 = -(1.0 + cosw0);
    final b2 = (1.0 + cosw0) / 2.0;
    final a0 = 1.0 + alpha;
    final a1 = -2.0 * cosw0;
    final a2 = 1.0 - alpha;

    return BiquadCoefficients(
      b0 / a0,
      b1 / a0,
      b2 / a0,
      a1 / a0,
      a2 / a0,
    );
  }

  /// Calculates Gain multiplier for EQ band based on Mode:
  /// Standard mode: -26dB at 0.0, 0dB at 0.5, +6dB at 1.0
  /// Isolator mode: -infinity (0.0 multiplier) at 0.0, 0dB at 0.5, +6dB at 1.0
  static double calculateEqGainMultiplier(
    double normalizedValue, // 0.0 to 1.0
    EQMode mode,
    bool isKilled,
  ) {
    if (isKilled) return 0.0;
    if (normalizedValue <= 0.001 && mode == EQMode.isolator) return 0.0;

    double gainDb;
    if (normalizedValue < 0.5) {
      final t = normalizedValue / 0.5; // 0..1
      if (mode == EQMode.isolator) {
        if (t < 0.05) return 0.0;
        gainDb = -60.0 * (1.0 - t); // down to -60dB kill
      } else {
        gainDb = -26.0 * (1.0 - t); // standard -26dB cut
      }
    } else {
      final t = (normalizedValue - 0.5) / 0.5; // 0..1
      gainDb = 6.0 * t; // up to +6dB boost
    }

    return math.pow(10.0, gainDb / 20.0).toDouble();
  }

  /// Calculates Bipolar Combo Filter frequency & type:
  /// position: -1.0 (LPF 20Hz) -> 0.0 (Bypass) -> +1.0 (HPF 20kHz)
  static (String type, double cutoffFreq, double wet) calculateBipolarFilter(
    double position, // -1.0 to +1.0
  ) {
    if (position.abs() < 0.03) {
      return ('bypass', 1000.0, 0.0);
    }
    if (position < 0) {
      // Low Pass Filter: from 20000Hz at 0 down to 100Hz at -1.0
      final t = position.abs(); // 0..1
      final cutoff = 20000.0 * math.pow(0.005, t).toDouble();
      return ('lpf', cutoff.clamp(40.0, 20000.0), t);
    } else {
      // High Pass Filter: from 20Hz at 0 up to 12000Hz at +1.0
      final t = position; // 0..1
      final cutoff = 20.0 * math.pow(600.0, t).toDouble();
      return ('hpf', cutoff.clamp(20.0, 16000.0), t);
    }
  }
}
