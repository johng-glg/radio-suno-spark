import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import LandingPage from "./LandingPage";
import AuthPage from "./AuthPage";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const Index = () => {
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

  // Show auth page by default for unauthenticated users
  if (!loading && !user) {
    return <AuthPage onBack={() => {}} />;
  }

  return (
    <>
      <LandingPage 
        onAuthNavigate={() => {}}
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
