import 'package:flutter/material.dart';

class DJColors {
  // Backgrounds & Surfaces
  static const Color background = Color(0xFF0A0B10);
  static const Color surface = Color(0xFF12141F);
  static const Color surfaceElevated = Color(0xFF1B1E2E);
  static const Color surfaceBorder = Color(0xFF282D42);

  // Deck A Accent (Neon Cyan)
  static const Color deckA = Color(0xFF00E5FF);
  static const Color deckADark = Color(0xFF006B78);
  static const Color deckAGlow = Color(0x5500E5FF);

  // Deck B Accent (Sunset Orange / Neon Coral)
  static const Color deckB = Color(0xFFFF5722);
  static const Color deckBDark = Color(0xFF8A2E12);
  static const Color deckBGlow = Color(0x55FF5722);

  // Deck C Accent (Electric Purple)
  static const Color deckC = Color(0xFFB026FF);
  // Deck D Accent (Acid Green)
  static const Color deckD = Color(0xFF00FF66);

  // Mixer & Transport Neutrals
  static const Color textPrimary = Color(0xFFF2F4F8);
  static const Color textSecondary = Color(0xFF8E95AA);
  static const Color textMuted = Color(0xFF555B6E);

  // LED & VU Meters
  static const Color vuGreen = Color(0xFF00E676);
  static const Color vuAmber = Color(0xFFFFAB00);
  static const Color vuRed = Color(0xFFFF1744);

  // Performance Pads Colors
  static const List<Color> padColors = [
    Color(0xFFFF1744), // Pad 1 Red
    Color(0xFFFF9100), // Pad 2 Orange
    Color(0xFFFFEA00), // Pad 3 Yellow
    Color(0xFF00E676), // Pad 4 Green
    Color(0xFF00E5FF), // Pad 5 Cyan
    Color(0xFF2979FF), // Pad 6 Blue
    Color(0xFFD500F9), // Pad 7 Purple
    Color(0xFFF50057), // Pad 8 Pink
  ];

  // Stem Colors
  static const Color stemVocals = Color(0xFF00E5FF); // Cyan
  static const Color stemDrums = Color(0xFFFF1744);  // Red
  static const Color stemBass = Color(0xFFB026FF);   // Purple
  static const Color stemMelody = Color(0xFFFFAB00); // Amber
}
