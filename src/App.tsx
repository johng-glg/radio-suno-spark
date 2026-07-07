import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { RadioProvider } from "@/hooks/useRadio";
import RadioPage from "./pages/RadioPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

const App = () => {
  return (
    <RadioProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RadioPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </RadioProvider>
  );
};

export default App;
