import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import LandingPage from "./LandingPage";
import PlayerPage from "./PlayerPage";
import AuthPage from "./AuthPage";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<'landing' | 'player' | 'auth'>('landing');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>();
  const [instrumentalMode, setInstrumentalMode] = useState<boolean>(false);
  const [wildcardMode, setWildcardMode] = useState<boolean>(false);
  const { user, loading } = useAuth();
  const { isAdmin } = useAdmin();

  // Force dark mode for the radio app
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 bg-primary rounded-full animate-pulse mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect unauthenticated users to auth page by default
  if (!loading && !user && currentPage !== 'auth') {
    setCurrentPage('auth');
  }

  const handleStartRadio = (genres: string[], mood?: string, instrumental?: boolean, wildcard?: boolean) => {
    if (!user) {
      setCurrentPage('auth');
      return;
    }
    setSelectedGenres(genres);
    setSelectedMood(mood);
    setInstrumentalMode(instrumental || false);
    setWildcardMode(wildcard || false);
    setCurrentPage('player');
  };

  const handleBackToLanding = () => {
    setCurrentPage('landing');
    setSelectedGenres([]);
    setSelectedMood(undefined);
    setInstrumentalMode(false);
    setWildcardMode(false);
  };

  const handleAuthNavigation = () => {
    setCurrentPage('auth');
  };

  const handleBackFromAuth = () => {
    // Only allow back to landing if user is authenticated
    if (user) {
      setCurrentPage('landing');
    }
  };

  const handleSettingsUpdate = (settings: {
    genres: string[];
    mood?: string;
    instrumentalMode: boolean;
    wildcardMode: boolean;
  }) => {
    setSelectedGenres(settings.genres);
    setSelectedMood(settings.mood);
    setInstrumentalMode(settings.instrumentalMode);
    setWildcardMode(settings.wildcardMode);
  };

  // Show auth page by default for unauthenticated users
  if (!loading && !user) {
    return <AuthPage onBack={handleBackFromAuth} />;
  }

  if (currentPage === 'player') {
    return (
      <>
        <PlayerPage
          selectedGenres={selectedGenres}
          selectedMood={selectedMood}
          instrumentalMode={instrumentalMode}
          wildcardMode={wildcardMode}
          onBack={handleBackToLanding}
          onSettingsUpdate={handleSettingsUpdate}
        />
        {isAdmin && (
          <div className="fixed top-4 right-4 z-50">
            <Link to="/admin">
              <Button variant="outline" size="sm">
                <Shield className="h-4 w-4 mr-2" />
                Admin
              </Button>
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <LandingPage 
        onStartRadio={handleStartRadio} 
        onAuthNavigate={handleAuthNavigation}
        user={user}
      />
      {isAdmin && (
        <div className="fixed top-4 right-4 z-50">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              <Shield className="h-4 w-4 mr-2" />
              Admin
            </Button>
          </Link>
        </div>
      )}
    </>
  );
};

export default Index;
