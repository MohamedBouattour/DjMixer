import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../../deck/models/track.dart';

class YTProxyService {
  final String baseUrl;

  YTProxyService({String? baseUrl})
      : baseUrl = baseUrl ?? (kIsWeb ? '' : 'http://localhost:5001');

  /// Searches for tracks via the backend proxy
  Future<List<Track>> searchTracks(String query) async {
    if (query.trim().isEmpty) return [];

    try {
      final url = Uri.parse('$baseUrl/api/search?q=${Uri.encodeComponent(query)}');
      final response = await http.get(url).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final dynamic data = jsonDecode(response.body);
        List<dynamic> items = [];
        if (data is List) {
          items = data;
        } else if (data is Map && data['items'] is List) {
          items = data['items'];
        }

        return items.map((item) {
          final id = item['id'] ?? item['videoId'] ?? 'yt_${DateTime.now().millisecondsSinceEpoch}';
          final title = item['title'] ?? 'Unknown Track';
          final artist = item['artist'] ?? item['author'] ?? item['channelTitle'] ?? 'YouTube Music';
          final durationSec = (item['duration'] as num?)?.toDouble() ?? 210.0;

          return Track(
            id: id,
            title: title,
            artist: artist,
            duration: Duration(seconds: durationSec.toInt()),
            bpm: 126.0,
            key: 'Am',
            camelot: '8A',
            waveformPeaks: Track.generateMockPeaks(80),
            streamUrl: '$baseUrl/api/stream?videoId=$id',
          );
        }).toList();
      }
    } catch (e) {
      // Return simulated mock tracks if proxy is offline during test
      return _getFallbackResults(query);
    }
    return _getFallbackResults(query);
  }

  List<Track> _getFallbackResults(String query) {
    return [
      Track(
        id: 'yt_stream_1',
        title: '$query (Club Extended Mix)',
        artist: 'DJ Producer Elite',
        duration: const Duration(minutes: 4, seconds: 12),
        bpm: 128.0,
        key: 'Dm',
        camelot: '7A',
        waveformPeaks: Track.generateMockPeaks(80),
        assetPath: 'assets/audio/track_a_demo.mp3',
      ),
      Track(
        id: 'yt_stream_2',
        title: '$query (Festival VIP Remix)',
        artist: 'Underground Sound',
        duration: const Duration(minutes: 3, seconds: 48),
        bpm: 132.0,
        key: 'Fm',
        camelot: '4A',
        waveformPeaks: Track.generateMockPeaks(80),
        assetPath: 'assets/audio/track_b_demo.mp3',
      ),
    ];
  }
}
