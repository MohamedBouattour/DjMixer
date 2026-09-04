import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/theme/dj_colors.dart';
import 'views/dj_workspace_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Configure edge-to-edge transparent system bars for immersive pro DJ experience
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: DJColors.background,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const DJProMasterApp());
}

class DJProMasterApp extends StatelessWidget {
  const DJProMasterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DJ Pro Master',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: DJColors.background,
        colorScheme: const ColorScheme.dark(
          primary: DJColors.deckA,
          secondary: DJColors.deckB,
          surface: DJColors.surface,
        ),
      ),
      home: const DJWorkspaceScreen(),
    );
  }
}
