import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/core/components/crossfader_slider.dart';

/// Drags the cap starting [grabOffsetInThumb] pixels from its left edge and
/// returns the position the slider reported after moving [dragDx] pixels.
Future<({double afterDown, double afterDrag, double trackWidth})> dragCap(
  WidgetTester tester, {
  required double grabOffsetInThumb,
  required double dragDx,
  double available = 250,
  double startPosition = 0.0,
}) async {
  double pos = startPosition;
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: available,
          child: StatefulBuilder(
            builder: (ctx, setState) => CrossfaderSlider(
              position: pos,
              width: 250,
              height: 42,
              onChanged: (v) => setState(() => pos = v),
            ),
          ),
        ),
      ),
    ),
  ));

  final track = tester.getRect(find.descendant(
    of: find.byType(CrossfaderSlider),
    matching: find.byType(RawGestureDetector),
  ));

  const paddingH = 4.0, thumbWidth = 36.0;
  final maxTravel = track.width - 2 * paddingH - thumbWidth;
  final thumbLeft = paddingH + ((startPosition + 1) / 2) * maxTravel;

  final gesture = await tester.startGesture(
    Offset(track.left + thumbLeft + grabOffsetInThumb, track.center.dy),
  );
  await tester.pump(const Duration(milliseconds: 16));
  final afterDown = pos;

  await gesture.moveBy(Offset(dragDx, 0));
  await tester.pump(const Duration(milliseconds: 16));
  final afterDrag = pos;

  await gesture.up();
  await tester.pump();
  return (afterDown: afterDown, afterDrag: afterDrag, trackWidth: track.width);
}

void main() {
  group('crossfader drag tracking', () {
    // Regression: the cap used to re-centre itself on the cursor at drag start,
    // throwing the position off by up to half a cap (~16px) — it visibly
    // jumped right when grabbed on its right-hand side.
    testWidgets('cap does not jump wherever it is grabbed', (tester) async {
      const dragDx = 40.0;
      const maxTravel = 250 - 8 - 36;
      const expected = dragDx / maxTravel * 2;

      for (final grab in <double>[2, 10, 18, 26, 34]) {
        final r = await dragCap(tester,
            grabOffsetInThumb: grab, dragDx: dragDx);

        expect(r.afterDown, 0.0,
            reason: 'grabbing the cap at $grab must not move it');
        expect(r.afterDrag, closeTo(expected, 0.02),
            reason: 'grab offset $grab should still track the cursor 1:1');
      }
    });

    testWidgets('tracks the cursor when dragged left', (tester) async {
      for (final grab in <double>[2, 18, 34]) {
        final r = await dragCap(tester, grabOffsetInThumb: grab, dragDx: -40);
        expect(r.afterDrag, closeTo(-40 / 206 * 2, 0.02));
      }
    });

    // Regression: geometry was computed from the requested width even when the
    // parent forced a narrower box, so the cap drifted away from the cursor and
    // overflowed the track on small screens.
    testWidgets('uses the real painted width when the parent is narrow',
        (tester) async {
      final r = await dragCap(tester,
          grabOffsetInThumb: 18, dragDx: 40, available: 190);

      expect(r.trackWidth, 190);
      final maxTravel = 190 - 8 - 36;
      expect(r.afterDrag, closeTo(40 / maxTravel * 2, 0.02));
    });

    testWidgets('clicking the track jumps the cap under the cursor',
        (tester) async {
      double pos = 0.0;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: StatefulBuilder(
              builder: (ctx, setState) => CrossfaderSlider(
                position: pos,
                width: 250,
                onChanged: (v) => setState(() => pos = v),
              ),
            ),
          ),
        ),
      ));

      final track = tester.getRect(find.descendant(
        of: find.byType(CrossfaderSlider),
        matching: find.byType(RawGestureDetector),
      ));
      await tester.tapAt(Offset(track.left + 30, track.center.dy));
      await tester.pump();

      expect(pos, lessThan(-0.5));
    });
  });
}
