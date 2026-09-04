import 'dart:async';
import 'package:flutter/foundation.dart';

class AbletonLinkState {
  final bool isEnabled;
  final int connectedPeers;
  final double tempo; // BPM
  final double beat;
  final int quantum; // e.g. 4 beats per bar

  const AbletonLinkState({
    this.isEnabled = false,
    this.connectedPeers = 0,
    this.tempo = 126.0,
    this.beat = 0.0,
    this.quantum = 4,
  });

  AbletonLinkState copyWith({
    bool? isEnabled,
    int? connectedPeers,
    double? tempo,
    double? beat,
    int? quantum,
  }) {
    return AbletonLinkState(
      isEnabled: isEnabled ?? this.isEnabled,
      connectedPeers: connectedPeers ?? this.connectedPeers,
      tempo: tempo ?? this.tempo,
      beat: beat ?? this.beat,
      quantum: quantum ?? this.quantum,
    );
  }
}

class AbletonLinkService extends ChangeNotifier {
  AbletonLinkState _state = const AbletonLinkState();
  Timer? _tickTimer;

  AbletonLinkState get state => _state;

  void toggleLink(bool enable) {
    _state = _state.copyWith(
      isEnabled: enable,
      connectedPeers: enable ? 1 : 0,
    );
    notifyListeners();

    if (enable) {
      _startLinkClock();
    } else {
      _tickTimer?.cancel();
    }
  }

  void updateTempo(double newTempo) {
    _state = _state.copyWith(tempo: newTempo);
    notifyListeners();
  }

  void _startLinkClock() {
    _tickTimer?.cancel();
    // 50ms sync tick interval
    _tickTimer = Timer.periodic(const Duration(milliseconds: 50), (timer) {
      if (!_state.isEnabled) return;
      final beatsPerSec = _state.tempo / 60.0;
      final nextBeat = (_state.beat + beatsPerSec * 0.05) % 64.0;
      _state = _state.copyWith(beat: nextBeat);
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _tickTimer?.cancel();
    super.dispose();
  }
}
