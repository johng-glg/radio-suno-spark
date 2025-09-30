import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { StationProvider } from "@/contexts/StationContext";
import Index from "./pages/Index";
import AdminPage from "./pages/AdminPage";

const App = () => {
  return (
    <StationProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<Index />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </StationProvider>
  );
};

export default App;
