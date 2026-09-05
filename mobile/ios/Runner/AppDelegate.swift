import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // Native deck audio: real scratching, EQ and waveform PCM, which the
    // audioplayers fallback cannot provide.
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DeckAudioPlugin") {
      DeckAudioPlugin.register(with: registrar)
    }
  }
}
