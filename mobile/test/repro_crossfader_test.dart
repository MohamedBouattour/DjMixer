import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/core/components/crossfader_slider.dart';

Future<void> runCase(WidgetTester tester, String name, double grabOffsetInThumb,
    double dragDx, double width) async {
  double pos = 0.0;
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: width,
          child: StatefulBuilder(builder: (ctx, setState) {
            return CrossfaderSlider(
              position: pos,
              width: 250,
              height: 42,
              onChanged: (v) => setState(() => pos = v),
            );
          }),
        ),
      ),
    ),
  ));

  final gdBox = tester.getRect(
      find.descendant(of: find.byType(CrossfaderSlider), matching: find.byType(GestureDetector)).first);
  // thumb at center: thumbLeft = 4 + 0.5*206 = 107
  const thumbLeft = 107.0;
  final grabGlobal = Offset(gdBox.left + thumbLeft + grabOffsetInThumb, gdBox.center.dy);

  final g = await tester.startGesture(grabGlobal);
  await tester.pump(const Duration(milliseconds: 120));
  final afterDown = pos;
  // single continuous drag
  await g.moveBy(Offset(dragDx, 0));
  await tester.pump(const Duration(milliseconds: 16));
  final afterDrag = pos;
  await g.up();
  await tester.pump();

  final expected = (dragDx / 206.0) * 2.0;
  final err = (afterDrag - expected).abs();
  expect(err, lessThan(0.05));
  expect(afterDown, closeTo(0.0, 0.001));
}

void main() {
  testWidgets('grab offsets across the thumb', (tester) async {
    for (final off in [2.0, 10.0, 18.0, 26.0, 34.0]) {
      await runCase(tester, 'drag RIGHT', off, 40, 250);
    }
    for (final off in [2.0, 10.0, 18.0, 26.0, 34.0]) {
      await runCase(tester, 'drag LEFT ', off, -40, 250);
    }
    for (final off in [18.0]) {
      await runCase(tester, 'drag RIGHT', off, 40, 190);
    }
  });
}
