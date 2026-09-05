import AVFoundation
import Flutter
import Foundation

/// Native deck audio for iOS, mirroring the Web Audio engine used on the web
/// build.
///
/// `AVAudioPlayerNode` cannot play backwards and smooths rate changes, so it
/// cannot scratch. Like the browser's AudioWorklet, this renders each deck from
/// decoded PCM with its own fractional playhead, which makes the rate free to
/// change per buffer and to go negative for reverse and backspins.

// MARK: - Render state

/// Everything the real-time render block touches.
///
/// The render block runs on the audio thread and must not allocate, lock or
/// touch Swift collections, so the samples live in raw buffers and every
/// control is a plain scalar written from the main thread.
final class DeckRenderState {
    var left: UnsafeMutablePointer<Float>?
    var right: UnsafeMutablePointer<Float>?
    var frameCount: Int = 0
    var sampleRate: Double = 44100

    var position: Double = 0
    var targetRate: Double = 1.0
    var currentRate: Double = 1.0
    var gain: Float = 1.0

    var isPlaying: Bool = false
    var isScratching: Bool = false

    var loopStart: Double = -1
    var loopEnd: Double = -1

    func freeBuffers() {
        left?.deallocate()
        right?.deallocate()
        left = nil
        right = nil
        frameCount = 0
    }

    deinit {
        freeBuffers()
    }
}

// MARK: - One deck

final class Deck {
    let state = DeckRenderState()
    let eq: AVAudioUnitEQ
    private(set) var sourceNode: AVAudioSourceNode!

    /// Bands: 0 low shelf, 1 mid peaking, 2 high shelf, 3 the sweepable filter.
    init(format: AVAudioFormat) {
        eq = AVAudioUnitEQ(numberOfBands: 4)
        eq.globalGain = 0

        let low = eq.bands[0]
        low.filterType = .lowShelf
        low.frequency = 600
        low.gain = 0
        low.bypass = false

        let mid = eq.bands[1]
        mid.filterType = .parametric
        mid.frequency = 1500
        mid.bandwidth = 1.0
        mid.gain = 0
        mid.bypass = false

        let high = eq.bands[2]
        high.filterType = .highShelf
        high.frequency = 4000
        high.gain = 0
        high.bypass = false

        let sweep = eq.bands[3]
        sweep.filterType = .lowPass
        sweep.frequency = 20000
        sweep.bypass = true

        // Capture the state object directly: resolving a weak self on the audio
        // thread is not real-time safe.
        let renderState = state
        sourceNode = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList -> OSStatus in
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let frames = Int(frameCount)

            guard renderState.isPlaying,
                  renderState.frameCount > 1,
                  let left = renderState.left,
                  let right = renderState.right else {
                for buffer in ablPointer {
                    memset(buffer.mData, 0, Int(buffer.mDataByteSize))
                }
                return noErr
            }

            let outL = ablPointer[0].mData?.assumingMemoryBound(to: Float.self)
            let outR = ablPointer.count > 1
                ? ablPointer[1].mData?.assumingMemoryBound(to: Float.self)
                : nil

            // Scratching follows the hand exactly; everything else eases so
            // pitch changes and play/pause do not click.
            let smoothing = renderState.isScratching ? 1.0 : 0.15
            let total = renderState.frameCount
            let gain = renderState.gain

            for i in 0..<frames {
                renderState.currentRate += (renderState.targetRate - renderState.currentRate) * smoothing
                var pos = renderState.position

                if renderState.loopStart >= 0, renderState.loopEnd > renderState.loopStart {
                    let length = renderState.loopEnd - renderState.loopStart
                    if pos >= renderState.loopEnd {
                        pos -= length
                    } else if pos < renderState.loopStart {
                        pos += length
                    }
                }

                if pos < 0 {
                    pos = 0
                    renderState.isPlaying = false
                } else if pos >= Double(total - 1) {
                    // End of track: rewind and stop, matching the web build.
                    renderState.position = 0
                    renderState.isPlaying = false
                    outL?[i] = 0
                    outR?[i] = 0
                    for j in (i + 1)..<frames {
                        outL?[j] = 0
                        outR?[j] = 0
                    }
                    return noErr
                }

                let index = Int(pos)
                let next = index + 1 < total ? index + 1 : index
                let frac = Float(pos - Double(index))

                outL?[i] = (left[index] + (left[next] - left[index]) * frac) * gain
                outR?[i] = (right[index] + (right[next] - right[index]) * frac) * gain

                renderState.position = pos + renderState.currentRate
            }

            return noErr
        }
    }
}

// MARK: - Plugin

public class DeckAudioPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
    private let engine = AVAudioEngine()
    private var decks: [String: Deck] = [:]
    private var format: AVAudioFormat!

    private var positionSink: FlutterEventSink?
    private var positionTimer: Timer?

    /// Waveform analysis runs in Dart; sending full-rate stereo PCM would be
    /// tens of megabytes, so the samples are folded to mono at this rate.
    /// 16 kHz keeps Nyquist above the 4 kHz high-band split Mixxx uses.
    private static let analysisSampleRate: Double = 16000

    public static func register(with registrar: FlutterPluginRegistrar) {
        let instance = DeckAudioPlugin()
        let channel = FlutterMethodChannel(
            name: "dj_pro_master/audio",
            binaryMessenger: registrar.messenger()
        )
        registrar.addMethodCallDelegate(instance, channel: channel)

        let events = FlutterEventChannel(
            name: "dj_pro_master/audio/position",
            binaryMessenger: registrar.messenger()
        )
        events.setStreamHandler(instance)

        instance.assetResolver = { asset in
            let key = registrar.lookupKey(forAsset: asset)
            return Bundle.main.path(forResource: key, ofType: nil)
        }
    }

    private var assetResolver: ((String) -> String?)?

    // MARK: Engine lifecycle

    private func startEngineIfNeeded() throws {
        guard !engine.isRunning else { return }

        let session = AVAudioSession.sharedInstance()
        // .playback keeps sound coming through the silent switch and, with the
        // audio background mode, while the app is not in front.
        try session.setCategory(.playback, mode: .default, options: [])
        try session.setActive(true)

        if format == nil {
            format = AVAudioFormat(
                standardFormatWithSampleRate: session.sampleRate,
                channels: 2
            )
        }
        try engine.start()
    }

    private func deck(_ id: String) throws -> Deck {
        try startEngineIfNeeded()
        if let existing = decks[id] { return existing }

        let deck = Deck(format: format)
        engine.attach(deck.sourceNode)
        engine.attach(deck.eq)
        engine.connect(deck.sourceNode, to: deck.eq, format: format)
        engine.connect(deck.eq, to: engine.mainMixerNode, format: format)
        decks[id] = deck
        return deck
    }

    // MARK: Method channel

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        let args = call.arguments as? [String: Any] ?? [:]
        let deckId = args["deckId"] as? String ?? "A"

        do {
            switch call.method {
            case "load":
                try load(deckId: deckId, args: args, result: result)

            case "play":
                let deck = try deck(deckId)
                try startEngineIfNeeded()
                deck.state.isPlaying = true
                result(nil)

            case "pause":
                try deck(deckId).state.isPlaying = false
                result(nil)

            case "seek":
                let deck = try deck(deckId)
                let ms = args["ms"] as? Double ?? 0
                let frame = ms / 1000.0 * deck.state.sampleRate
                deck.state.position = min(max(0, frame), Double(max(deck.state.frameCount - 1, 0)))
                result(nil)

            case "setRate":
                let deck = try deck(deckId)
                // While scratching the platter owns the rate; the pitch fader
                // takes over again when the hand comes off.
                if !deck.state.isScratching {
                    deck.state.targetRate = args["rate"] as? Double ?? 1.0
                }
                result(nil)

            case "setVolume":
                try deck(deckId).state.gain = Float(args["volume"] as? Double ?? 1.0)
                result(nil)

            case "setEq":
                let deck = try deck(deckId)
                deck.eq.bands[0].gain = Float(args["low"] as? Double ?? 0)
                deck.eq.bands[1].gain = Float(args["mid"] as? Double ?? 0)
                deck.eq.bands[2].gain = Float(args["high"] as? Double ?? 0)
                result(nil)

            case "setFilter":
                let deck = try deck(deckId)
                setFilter(deck: deck, position: args["position"] as? Double ?? 0)
                result(nil)

            case "beginScratch":
                let deck = try deck(deckId)
                deck.state.isScratching = true
                deck.state.targetRate = 0
                deck.state.currentRate = 0
                deck.state.isPlaying = true
                result(nil)

            case "scratchTo":
                let deck = try deck(deckId)
                let rate = args["rate"] as? Double ?? 0
                deck.state.targetRate = rate
                deck.state.currentRate = rate
                result(nil)

            case "endScratch":
                let deck = try deck(deckId)
                deck.state.isScratching = false
                deck.state.targetRate = args["rate"] as? Double ?? 1.0
                deck.state.isPlaying = args["resume"] as? Bool ?? deck.state.isPlaying
                result(nil)

            case "setLoop":
                let deck = try deck(deckId)
                if let startMs = args["startMs"] as? Double,
                   let endMs = args["endMs"] as? Double {
                    deck.state.loopStart = startMs / 1000.0 * deck.state.sampleRate
                    deck.state.loopEnd = endMs / 1000.0 * deck.state.sampleRate
                } else {
                    deck.state.loopStart = -1
                    deck.state.loopEnd = -1
                }
                result(nil)

            case "dispose":
                if let deck = decks.removeValue(forKey: deckId) {
                    engine.detach(deck.sourceNode)
                    engine.detach(deck.eq)
                    deck.state.freeBuffers()
                }
                result(nil)

            default:
                result(FlutterMethodNotImplemented)
            }
        } catch {
            result(FlutterError(
                code: "audio_error",
                message: "\(call.method) failed on deck \(deckId): \(error.localizedDescription)",
                details: nil
            ))
        }
    }

    /// Musical sweep: below centre a low-pass closes down, above it a high-pass
    /// opens up, with the knob bypassed near the middle.
    private func setFilter(deck: Deck, position: Double) {
        let band = deck.eq.bands[3]
        let p = min(max(position, -1), 1)
        if abs(p) < 0.02 {
            band.bypass = true
            return
        }
        band.bypass = false
        if p < 0 {
            band.filterType = .lowPass
            band.frequency = Float(20000 * pow(0.0015, -p))
        } else {
            band.filterType = .highPass
            band.frequency = Float(20 * pow(500.0, p))
        }
    }

    // MARK: Loading

    private func load(deckId: String, args: [String: Any], result: @escaping FlutterResult) throws {
        let deck = try deck(deckId)

        let path: String?
        if let assetPath = args["assetPath"] as? String {
            path = assetResolver?(assetPath)
        } else if let filePath = args["filePath"] as? String {
            path = filePath
        } else if let urlString = args["url"] as? String {
            // Decoding needs the whole file, so fetch it before handing over.
            downloadThenLoad(deck: deck, urlString: urlString, result: result)
            return
        } else {
            path = nil
        }

        guard let resolved = path, FileManager.default.fileExists(atPath: resolved) else {
            result(FlutterError(
                code: "not_found",
                message: "No audio file for deck \(deckId)",
                details: nil
            ))
            return
        }

        try decode(deck: deck, url: URL(fileURLWithPath: resolved), result: result)
    }

    private func downloadThenLoad(deck: Deck, urlString: String, result: @escaping FlutterResult) {
        guard let url = URL(string: urlString) else {
            result(FlutterError(code: "bad_url", message: urlString, details: nil))
            return
        }
        let task = URLSession.shared.downloadTask(with: url) { [weak self] tempURL, _, error in
            guard let self else { return }
            if let error {
                DispatchQueue.main.async {
                    result(FlutterError(code: "download_failed", message: error.localizedDescription, details: nil))
                }
                return
            }
            guard let tempURL else {
                DispatchQueue.main.async {
                    result(FlutterError(code: "download_failed", message: "No data", details: nil))
                }
                return
            }
            // AVAudioFile needs a recognisable extension to pick a decoder.
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("mp3")
            try? FileManager.default.moveItem(at: tempURL, to: dest)

            DispatchQueue.main.async {
                do {
                    try self.decode(deck: deck, url: dest, result: result)
                } catch {
                    result(FlutterError(code: "decode_failed", message: error.localizedDescription, details: nil))
                }
            }
        }
        task.resume()
    }

    private func decode(deck: Deck, url: URL, result: @escaping FlutterResult) throws {
        let file = try AVAudioFile(forReading: url)
        let processingFormat = file.processingFormat
        let total = Int(file.length)

        guard total > 1,
              let buffer = AVAudioPCMBuffer(pcmFormat: processingFormat, frameCapacity: AVAudioFrameCount(total)) else {
            result(FlutterError(code: "decode_failed", message: "Empty audio file", details: nil))
            return
        }
        try file.read(into: buffer)

        guard let channelData = buffer.floatChannelData else {
            result(FlutterError(code: "decode_failed", message: "Unsupported sample format", details: nil))
            return
        }

        let frames = Int(buffer.frameLength)
        let channels = Int(processingFormat.channelCount)

        // Swap the samples in while stopped so the render block never reads a
        // buffer that is being freed.
        deck.state.isPlaying = false
        deck.state.freeBuffers()

        let left = UnsafeMutablePointer<Float>.allocate(capacity: frames)
        let right = UnsafeMutablePointer<Float>.allocate(capacity: frames)
        left.update(from: channelData[0], count: frames)
        if channels > 1 {
            right.update(from: channelData[1], count: frames)
        } else {
            right.update(from: channelData[0], count: frames)
        }

        deck.state.left = left
        deck.state.right = right
        deck.state.frameCount = frames
        deck.state.sampleRate = processingFormat.sampleRate
        deck.state.position = 0
        deck.state.currentRate = 1.0
        deck.state.targetRate = 1.0

        let mono = downsampleToMono(
            left: left,
            right: right,
            frames: frames,
            sourceRate: processingFormat.sampleRate
        )

        result([
            "durationMs": Double(frames) / processingFormat.sampleRate * 1000.0,
            "sampleRate": processingFormat.sampleRate,
            "analysisSampleRate": DeckAudioPlugin.analysisSampleRate,
            "pcm": FlutterStandardTypedData(float32: mono),
        ])
    }

    /// Box-average down to mono at the analysis rate. Averaging over each
    /// output frame's whole span keeps aliasing out of the result.
    private func downsampleToMono(
        left: UnsafeMutablePointer<Float>,
        right: UnsafeMutablePointer<Float>,
        frames: Int,
        sourceRate: Double
    ) -> Data {
        let ratio = sourceRate / DeckAudioPlugin.analysisSampleRate
        let outCount = max(Int(Double(frames) / ratio), 1)
        var out = [Float](repeating: 0, count: outCount)

        for i in 0..<outCount {
            let start = Int(Double(i) * ratio)
            let end = min(Int(Double(i + 1) * ratio), frames)
            if start >= end {
                out[i] = (left[min(start, frames - 1)] + right[min(start, frames - 1)]) * 0.5
                continue
            }
            var sum: Float = 0
            for j in start..<end {
                sum += (left[j] + right[j]) * 0.5
            }
            out[i] = sum / Float(end - start)
        }

        return out.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    // MARK: Position stream

    public func onListen(withArguments _: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        positionSink = events
        // 30 Hz is enough for the playhead and waveform; the UI runs its own
        // frame loop between updates.
        positionTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            guard let self, let sink = self.positionSink else { return }
            var payload: [String: Any] = [:]
            for (id, deck) in self.decks {
                let rate = deck.state.sampleRate
                payload[id] = [
                    "ms": rate > 0 ? deck.state.position / rate * 1000.0 : 0,
                    "playing": deck.state.isPlaying,
                ]
            }
            sink(payload)
        }
        return nil
    }

    public func onCancel(withArguments _: Any?) -> FlutterError? {
        positionTimer?.invalidate()
        positionTimer = nil
        positionSink = nil
        return nil
    }
}
