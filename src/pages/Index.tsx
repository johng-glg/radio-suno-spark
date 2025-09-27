import { useState } from "react";
import LandingPage from "./LandingPage";
import PlayerPage from "./PlayerPage";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<'landing' | 'player'>('landing');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>();

  const handleStartRadio = (genres: string[], mood?: string) => {
    setSelectedGenres(genres);
    setSelectedMood(mood);
    setCurrentPage('player');
  };

  const handleBackToLanding = () => {
    setCurrentPage('landing');
    setSelectedGenres([]);
    setSelectedMood(undefined);
  };

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
    <LandingPage onStartRadio={handleStartRadio} />
  );
};

export default Index;
