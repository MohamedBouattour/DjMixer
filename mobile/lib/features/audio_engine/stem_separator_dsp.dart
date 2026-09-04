class StemState {
  final double vocalVolume;
  final double drumVolume;
  final double bassVolume;
  final double melodyVolume;

  final bool vocalMuted;
  final bool drumMuted;
  final bool bassMuted;
  final bool melodyMuted;

  final bool vocalSolo;
  final bool drumSolo;
  final bool bassSolo;
  final bool melodySolo;

  const StemState({
    this.vocalVolume = 1.0,
    this.drumVolume = 1.0,
    this.bassVolume = 1.0,
    this.melodyVolume = 1.0,
    this.vocalMuted = false,
    this.drumMuted = false,
    this.bassMuted = false,
    this.melodyMuted = false,
    this.vocalSolo = false,
    this.drumSolo = false,
    this.bassSolo = false,
    this.melodySolo = false,
  });

  bool get hasAnySolo => vocalSolo || drumSolo || bassSolo || melodySolo;

  /// Computes effective output gain for each of the 4 stems considering Solo & Mute states
  (double vocal, double drum, double bass, double melody) computeEffectiveGains() {
    if (hasAnySolo) {
      return (
        (vocalSolo && !vocalMuted) ? vocalVolume : 0.0,
        (drumSolo && !drumMuted) ? drumVolume : 0.0,
        (bassSolo && !bassMuted) ? bassVolume : 0.0,
        (melodySolo && !melodyMuted) ? melodyVolume : 0.0,
      );
    }

    return (
      vocalMuted ? 0.0 : vocalVolume,
      drumMuted ? 0.0 : drumVolume,
      bassMuted ? 0.0 : bassVolume,
      melodyMuted ? 0.0 : melodyVolume,
    );
  }

  StemState copyWith({
    double? vocalVolume,
    double? drumVolume,
    double? bassVolume,
    double? melodyVolume,
    bool? vocalMuted,
    bool? drumMuted,
    bool? bassMuted,
    bool? melodyMuted,
    bool? vocalSolo,
    bool? drumSolo,
    bool? bassSolo,
    bool? melodySolo,
  }) {
    return StemState(
      vocalVolume: vocalVolume ?? this.vocalVolume,
      drumVolume: drumVolume ?? this.drumVolume,
      bassVolume: bassVolume ?? this.bassVolume,
      melodyVolume: melodyVolume ?? this.melodyVolume,
      vocalMuted: vocalMuted ?? this.vocalMuted,
      drumMuted: drumMuted ?? this.drumMuted,
      bassMuted: bassMuted ?? this.bassMuted,
      melodyMuted: melodyMuted ?? this.melodyMuted,
      vocalSolo: vocalSolo ?? this.vocalSolo,
      drumSolo: drumSolo ?? this.drumSolo,
      bassSolo: bassSolo ?? this.bassSolo,
      melodySolo: melodySolo ?? this.melodySolo,
    );
  }
}
