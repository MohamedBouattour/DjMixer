import 'package:flutter_test/flutter_test.dart';
import 'package:dj_pro_master/main.dart';

void main() {
  testWidgets('DJProMasterApp builds smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const DJProMasterApp());
    await tester.pump();

    // Verify brand title is displayed
    expect(find.text('DJ PRO MASTER'), findsOneWidget);
    // Verify Deck A and Deck B are rendered
    expect(find.text('DECK A'), findsWidgets);
    expect(find.text('DECK B'), findsWidgets);
    // Verify crossfader text is present
    expect(find.text('CROSSFADER'), findsOneWidget);
  });
}
