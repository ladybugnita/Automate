import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import SignupPage from "./components/SignupPage";
import TokenPage from "./components/TokenPage";
import Dashboard from "./components/Dashboard";
import LoginPage from "./components/LoginPage";

function App(){
  return (
  <Router>
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/token" element={<TokenPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  </Router>
  );
}

export default App;