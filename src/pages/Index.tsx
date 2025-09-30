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
  const [holiday, setHoliday] = useState<string>();
  const { user, loading } = useAuth();
  const { isAdmin } = useAdmin();

  // Force dark mode for the radio app
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Redirect unauthenticated users to auth page
  useEffect(() => {
    if (!loading && !user && currentPage !== 'auth') {
      setCurrentPage('auth');
    }
  }, [loading, user, currentPage]);

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

  const handleStartRadio = (genres: string[], mood?: string, instrumental?: boolean, wildcard?: boolean, holiday?: string) => {
    if (!user) {
      setCurrentPage('auth');
      return;
    }
    setSelectedGenres(genres);
    setSelectedMood(mood);
    setInstrumentalMode(instrumental || false);
    setWildcardMode(wildcard || false);
    setHoliday(holiday);
    setCurrentPage('player');
  };

  const handleBackToLanding = () => {
    setCurrentPage('landing');
    setSelectedGenres([]);
    setSelectedMood(undefined);
    setInstrumentalMode(false);
    setWildcardMode(false);
    setHoliday(undefined);
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
    holiday?: string;
  }) => {
    setSelectedGenres(settings.genres);
    setSelectedMood(settings.mood);
    setInstrumentalMode(settings.instrumentalMode);
    setWildcardMode(settings.wildcardMode);
    setHoliday(settings.holiday);
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
          holiday={holiday}
          onBack={handleBackToLanding}
          onSettingsUpdate={handleSettingsUpdate}
        />
        {isAdmin && (
          <div className="fixed top-4 right-4 z-50">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin">
                <Shield className="h-4 w-4 mr-2" />
                Admin
              </Link>
            </Button>
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
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">
              <Shield className="h-4 w-4 mr-2" />
              Admin
            </Link>
          </Button>
        </div>
      )}
    </>
  );
};

export default Index;
