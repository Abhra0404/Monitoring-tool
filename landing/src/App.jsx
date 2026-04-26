import { BrowserRouter, Route, Routes } from "react-router-dom";
import Landing from "./Landing.jsx";
import Docs from "./docs/Docs.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/docs/*" element={<Docs />} />
      </Routes>
    </BrowserRouter>
  );
}
