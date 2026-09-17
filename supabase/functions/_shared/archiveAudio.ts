// Copies a generated track's audio into our own Supabase Storage bucket so the
// playable link never expires (Suno's CDN links are signed and go 403 later).

export const SONG_AUDIO_BUCKET = 'song-audio';

export async function archiveSongAudio(
  supabase: any,
  songId: string,
  sourceUrl: string,
): Promise<string | null> {
  try {
    if (!sourceUrl) return null;

    const resp = await fetch(sourceUrl);
    if (!resp.ok) {
      console.error(`archiveSongAudio: source fetch failed (${resp.status}) for song ${songId}`);
      return null;
    }

    const contentType = resp.headers.get('content-type') || 'audio/mpeg';
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength < 1024) {
      console.error(`archiveSongAudio: suspiciously small payload for song ${songId}`);
      return null;
    }

    const ext = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : 'mp3';
    const path = `${songId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(SONG_AUDIO_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });

    if (uploadError) {
      console.error(`archiveSongAudio: upload failed for song ${songId}:`, uploadError);
      return null;
    }

    const { error: updateError } = await supabase
      .from('songs')
      .update({ storage_path: path, updated_at: new Date().toISOString() })
      .eq('id', songId);

    if (updateError) {
      console.error(`archiveSongAudio: db update failed for song ${songId}:`, updateError);
      return null;
    }

    console.log(`archiveSongAudio: archived song ${songId} -> ${path}`);
    return path;
  } catch (error) {
    console.error(`archiveSongAudio: unexpected error for song ${songId}:`, error);
    return null;
  }
}
