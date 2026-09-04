import 'package:flutter/material.dart';
import '../../deck/models/track.dart';
import '../services/library_service.dart';
import '../services/yt_proxy_service.dart';
import '../../../core/theme/dj_colors.dart';
import '../../../core/theme/dj_typography.dart';

class LibraryScreen extends StatefulWidget {
  final Function(String deckId, Track track) onLoadTrack;

  /// Which tab to open on: 0 crates, 1 YouTube, 2 cloud.
  final int initialTabIndex;

  const LibraryScreen({
    super.key,
    required this.onLoadTrack,
    this.initialTabIndex = 0,
  });

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  final YTProxyService _ytProxy = YTProxyService();

  final List<Track> _localTracks = List.from(LibraryService.defaultTracks);
  List<Track> _ytResults = [];
  bool _isSearchingYt = false;

  final FocusNode _searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 3,
      vsync: this,
      initialIndex: widget.initialTabIndex,
    );
    // Opening straight onto YouTube means the user came here to search, so put
    // the cursor in the box for them.
    if (widget.initialTabIndex == 1) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _searchFocus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _searchFocus.dispose();
    _searchController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  void _onSearch(String query) async {
    if (query.trim().isEmpty) return;
    // Searching always means YouTube, so switch there rather than silently
    // doing nothing when another tab happens to be showing.
    if (_tabController.index != 1) _tabController.animateTo(1);

    setState(() => _isSearchingYt = true);
    final results = await _ytProxy.searchTracks(query);
    if (mounted) {
      setState(() {
        _ytResults = results;
        _isSearchingYt = false;
      });
    }
  }

  void _pickFile() async {
    final track = await LibraryService.pickLocalTrack();
    if (track != null) {
      setState(() {
        _localTracks.insert(0, track);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DJColors.background,
      appBar: AppBar(
        backgroundColor: DJColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('MUSIC LIBRARY', style: DJTypography.brandTitle.copyWith(fontSize: 16)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: DJColors.deckA),
            tooltip: 'Import Local Audio',
            onPressed: _pickFile,
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: DJColors.deckA,
          labelColor: DJColors.deckA,
          unselectedLabelColor: DJColors.textSecondary,
          labelStyle: DJTypography.buttonLabel.copyWith(fontSize: 10),
          tabs: const [
            Tab(icon: Icon(Icons.folder, size: 16), text: 'CRATES'),
            Tab(icon: Icon(Icons.play_circle_outline, size: 16), text: 'YOUTUBE PROXY'),
            Tab(icon: Icon(Icons.cloud_sync, size: 16), text: 'CLOUD SYNC'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.all(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: DJColors.surfaceElevated,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: DJColors.surfaceBorder),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      focusNode: _searchFocus,
                      style: DJTypography.trackTitle,
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        icon: const Icon(Icons.search,
                            color: DJColors.textSecondary, size: 20),
                        hintText: 'Search YouTube for a track, artist or mix...',
                        hintStyle: DJTypography.trackArtist,
                        border: InputBorder.none,
                      ),
                      onSubmitted: _onSearch,
                    ),
                  ),
                  if (_isSearchingYt)
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: DJColors.deckA),
                    )
                  else
                    IconButton(
                      icon: const Icon(Icons.play_circle_fill,
                          color: Color(0xFFFF0033), size: 22),
                      tooltip: 'Search YouTube',
                      onPressed: () => _onSearch(_searchController.text),
                    ),
                ],
              ),
            ),
          ),
          // Tab View
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTrackList(_localTracks),
                _buildYouTubeStreamList(),
                _buildCloudSyncView(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrackList(List<Track> tracks) {
    if (tracks.isEmpty) {
      return Center(
        child: Text('No tracks found', style: DJTypography.trackArtist),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: tracks.length,
      itemBuilder: (context, index) {
        final track = tracks[index];
        return _buildTrackCard(track);
      },
    );
  }

  Widget _buildYouTubeStreamList() {
    if (_isSearchingYt) {
      return const Center(
        child: CircularProgressIndicator(color: DJColors.deckA),
      );
    }
    if (_ytResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.search, size: 40, color: DJColors.textMuted),
            const SizedBox(height: 8),
            Text(
              'Search YouTube proxy for tracks',
              style: DJTypography.trackArtist,
            ),
          ],
        ),
      );
    }
    return _buildTrackList(_ytResults);
  }

  Widget _buildCloudSyncView() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _buildCloudAccountTile('Apple iCloud Drive', Icons.cloud_outlined, 'Synced • 142 Tracks', true),
        _buildCloudAccountTile('Google Drive', Icons.folder_shared, 'Connect Account', false),
        _buildCloudAccountTile('Dropbox DJ Crates', Icons.archive_outlined, 'Connect Account', false),
      ],
    );
  }

  Widget _buildCloudAccountTile(String name, IconData icon, String status, bool isConnected) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DJColors.surfaceElevated,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: DJColors.surfaceBorder),
      ),
      child: Row(
        children: [
          Icon(icon, color: isConnected ? DJColors.deckA : DJColors.textMuted, size: 28),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: DJTypography.trackTitle),
                Text(status, style: DJTypography.trackArtist.copyWith(fontSize: 10)),
              ],
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: isConnected ? DJColors.surfaceBorder : DJColors.deckA,
              foregroundColor: isConnected ? DJColors.textSecondary : Colors.black,
            ),
            onPressed: () {},
            child: Text(isConnected ? 'SYNC' : 'LINK', style: DJTypography.buttonLabel.copyWith(fontSize: 9)),
          ),
        ],
      ),
    );
  }

  Widget _buildTrackCard(Track track) {
    final durationStr =
        '${track.duration.inMinutes}:${(track.duration.inSeconds % 60).toString().padLeft(2, '0')}';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: DJColors.surfaceElevated,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: DJColors.surfaceBorder),
      ),
      child: Row(
        children: [
          // Vinyl album icon badge
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: DJColors.background,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: DJColors.surfaceBorder),
            ),
            child: const Icon(Icons.music_note, color: DJColors.textSecondary, size: 20),
          ),
          const SizedBox(width: 10),
          // Title & Artist
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  track.title,
                  style: DJTypography.trackTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  track.artist,
                  style: DJTypography.trackArtist,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                // BPM, Key, Time
                Row(
                  children: [
                    Text('${track.bpm.toStringAsFixed(1)} BPM',
                        style: DJTypography.digitalDisplaySmall.copyWith(fontSize: 10, color: DJColors.vuGreen)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: DJColors.deckA.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: Text(track.camelot,
                          style: DJTypography.digitalDisplaySmall.copyWith(fontSize: 9, color: DJColors.deckA)),
                    ),
                    const SizedBox(width: 8),
                    Text(durationStr, style: DJTypography.digitalDisplaySmall.copyWith(fontSize: 10)),
                  ],
                ),
              ],
            ),
          ),
          // Load to Deck A / Load to Deck B Buttons
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: () {
                  widget.onLoadTrack('A', track);
                  Navigator.pop(context);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: DJColors.deckA.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: DJColors.deckA),
                  ),
                  child: Text(
                    'LOAD A',
                    style: DJTypography.buttonLabel.copyWith(
                      fontSize: 9,
                      color: DJColors.deckA,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: () {
                  widget.onLoadTrack('B', track);
                  Navigator.pop(context);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: DJColors.deckB.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: DJColors.deckB),
                  ),
                  child: Text(
                    'LOAD B',
                    style: DJTypography.buttonLabel.copyWith(
                      fontSize: 9,
                      color: DJColors.deckB,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
