import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Music, Clock, SkipForward, RefreshCw, X } from "lucide-react";
import { useStation } from "@/contexts/StationContext";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function StationQueue() {
  const { queue, skipToNext, refreshQueue, stopStation, isStationActive, stationSettings } = useStation();

  if (!isStationActive) return null;

  const readySongs = queue.filter(s => s.status === 'ready' && s.url);
  const generatingSongs = queue.filter(s => s.status === 'generating');

  console.log('StationQueue render:', { 
    totalQueue: queue.length, 
    ready: readySongs.length, 
    generating: generatingSongs.length,
    settings: stationSettings
  });

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Music className="h-5 w-5" />
            Station Queue
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshQueue}
              title="Refresh Queue"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={stopStation}
              title="Stop Station"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ready Songs */}
        {readySongs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Ready to Play</h4>
              <Badge variant="secondary">{readySongs.length}</Badge>
            </div>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2 pr-4">
                {readySongs.map((song, index) => {
                  console.log('Rendering ready song:', song.id, song.title);
                  return (
                  <div
                    key={song.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      {song.image_url ? (
                        <img
                          src={song.image_url}
                          alt={song.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{song.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{song.genre}</Badge>
                        {song.mood && (
                          <Badge variant="secondary" className="text-xs">{song.mood}</Badge>
                        )}
                      </div>
                    </div>
                    {index === 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={skipToNext}
                        title="Skip to this track"
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Generating Songs */}
        {generatingSongs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Generating</h4>
              <Badge variant="secondary">{generatingSongs.length}</Badge>
            </div>
            <div className="space-y-2">
              {generatingSongs.map((song) => (
                <div
                  key={song.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background/30"
                >
                  <div className="w-12 h-12 rounded-md bg-muted flex-shrink-0 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-muted-foreground">
                      Generating...
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{song.genre}</Badge>
                      {song.mood && (
                        <Badge variant="secondary" className="text-xs">{song.mood}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {queue.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Queue is empty</p>
            <p className="text-xs mt-1">New songs will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
