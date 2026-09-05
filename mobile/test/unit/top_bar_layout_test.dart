import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/views/dj_workspace_screen.dart';

/// The top bar packs a brand, a deck selector and five actions into one row.
/// Adding anything to it has overflowed the row before, which paints the
/// yellow/black stripes over the UI, so every viewport we care about is
/// checked here.
void main() {
  const sizes = <String, Size>{
    'iPhone 15 portrait': Size(393, 852),
    'iPhone 15 landscape': Size(852, 393),
    'iPhone SE portrait': Size(375, 667),
    'small tablet': Size(768, 1024),
    'test default': Size(800, 600),
    'Mac 13': Size(1440, 790),
    'large desktop': Size(1920, 1080),
  };

  for (final entry in sizes.entries) {
    testWidgets('workspace lays out without overflow on ${entry.key}',
        (tester) async {
      tester.view.physicalSize = entry.value;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(const MaterialApp(home: DJWorkspaceScreen()));
      await tester.pump(const Duration(milliseconds: 100));

      expect(tester.takeException(), isNull,
          reason: '${entry.key} (${entry.value}) overflowed');
    });
  }
}
