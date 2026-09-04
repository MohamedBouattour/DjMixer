enum AudioRoutingMode {
  stereoMasterOnly('Stereo Master (Standard)', 'Ch 1/2 Master'),
  djSplitCable('DJ Split-Cable (L=Cue, R=Master)', 'Left=Headphone, Right=Master'),
  multiChannelUsb('Multi-Channel USB Interface', 'Ch 1/2 Master, Ch 3/4 Cue');

  final String title;
  final String description;
  const AudioRoutingMode(this.title, this.description);
}

class SplitCueRouter {
  AudioRoutingMode mode;
  double cueMasterMix; // 0.0 (100% Cue PFL) to 1.0 (100% Master)
  double headphoneVolume;
  double masterVolume;
  double boothVolume;

  bool cueDeckA;
  bool cueDeckB;
  bool cueSampler;

  SplitCueRouter({
    this.mode = AudioRoutingMode.stereoMasterOnly,
    this.cueMasterMix = 0.5,
    this.headphoneVolume = 0.8,
    this.masterVolume = 0.9,
    this.boothVolume = 0.7,
    this.cueDeckA = false,
    this.cueDeckB = false,
    this.cueSampler = false,
  });

  /// Computes channel outputs for DJ Split-Cable mode:
  /// Left Channel (Headphones): Pre-Cue mix
  /// Right Channel (Speakers): Master Out mix
  (double leftOut, double rightOut) computeSplitCableSignals({
    required double deckASignal,
    required double deckBSignal,
    required double masterMixedSignal,
  }) {
    // 1. Calculate Cue audition signal
    double cueSignal = 0.0;
    int cueCount = 0;
    if (cueDeckA) {
      cueSignal += deckASignal;
      cueCount++;
    }
    if (cueDeckB) {
      cueSignal += deckBSignal;
      cueCount++;
    }
    if (cueCount > 1) {
      cueSignal /= cueCount;
    }

    // Blend between pure Cue and Master inside headphones
    final headphoneSignal = (cueSignal * (1.0 - cueMasterMix) +
            masterMixedSignal * cueMasterMix) *
        headphoneVolume;

    // Master House output on Right channel
    final houseSignal = masterMixedSignal * masterVolume;

    switch (mode) {
      case AudioRoutingMode.djSplitCable:
        // Left = Headphone Cue, Right = Master House
        return (headphoneSignal.clamp(0.0, 1.0), houseSignal.clamp(0.0, 1.0));

      case AudioRoutingMode.stereoMasterOnly:
      case AudioRoutingMode.multiChannelUsb:
        // Both channels receive master output
        return (houseSignal.clamp(0.0, 1.0), houseSignal.clamp(0.0, 1.0));
    }
  }
}
