import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dj_colors.dart';

class DJTypography {
  static TextStyle get brandTitle => GoogleFonts.orbitron(
    fontSize: 20,
    fontWeight: FontWeight.w800,
    letterSpacing: 2.0,
    color: DJColors.textPrimary,
  );

  static TextStyle get deckLabel => GoogleFonts.orbitron(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    letterSpacing: 1.5,
  );

  static TextStyle get digitalDisplay => GoogleFonts.shareTechMono(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    letterSpacing: 1.0,
    color: DJColors.textPrimary,
  );

  static TextStyle get digitalDisplaySmall => GoogleFonts.shareTechMono(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: DJColors.textSecondary,
  );

  static TextStyle get knobLabel => GoogleFonts.inter(
    fontSize: 9,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.8,
    color: DJColors.textSecondary,
  );

  static TextStyle get buttonLabel => GoogleFonts.orbitron(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 1.0,
  );

  static TextStyle get trackTitle => GoogleFonts.inter(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: DJColors.textPrimary,
  );

  static TextStyle get trackArtist => GoogleFonts.inter(
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: DJColors.textSecondary,
  );
}
