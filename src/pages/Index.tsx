import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import LandingPage from "./LandingPage";
import PlayerPage from "./PlayerPage";
import AuthPage from "./AuthPage";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<'landing' | 'player' | 'auth'>('landing');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>();
  const { user, loading } = useAuth();

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

  const handleStartRadio = (genres: string[], mood?: string) => {
    if (!user) {
      setCurrentPage('auth');
      return;
    }
    setSelectedGenres(genres);
    setSelectedMood(mood);
    setCurrentPage('player');
  };

  const handleBackToLanding = () => {
    setCurrentPage('landing');
    setSelectedGenres([]);
    setSelectedMood(undefined);
  };

  const handleAuthNavigation = () => {
    setCurrentPage('auth');
  };

  const handleBackFromAuth = () => {
    setCurrentPage('landing');
  };

  if (currentPage === 'auth') {
    return <AuthPage onBack={handleBackFromAuth} />;
  }

  if (currentPage === 'player') {
    return (
      <PlayerPage
        selectedGenres={selectedGenres}
        selectedMood={selectedMood}
        onBack={handleBackToLanding}
      />
    );
  }

  return (
    <LandingPage 
      onStartRadio={handleStartRadio} 
      onAuthNavigate={handleAuthNavigation}
      user={user}
    />
  );
};

export default Index;
