import Nav from "./components/Nav.jsx";
import Hero from "./components/Hero.jsx";
import LogoBar from "./components/LogoBar.jsx";
import DashboardDemo from "./components/DashboardDemo.jsx";
import Features from "./components/Features.jsx";
import Compare from "./components/Compare.jsx";
import QuickStart from "./components/QuickStart.jsx";
import Architecture from "./components/Architecture.jsx";
import FAQ from "./components/FAQ.jsx";
import Footer from "./components/Footer.jsx";

export default function App() {
  return (
    <div className="relative min-h-screen bg-bg text-fg noise">
      {/* Page-level hero backdrop — sits behind the (transparent) navbar so
          the aurora + grid show through it before scroll. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[120vh] overflow-hidden"
      >
        <div className="aurora" />
        <div className="absolute inset-0 grid-bg" />
      </div>

      <Nav />
      <main>
        <Hero />
        <LogoBar />
        <DashboardDemo />
        <Features />
        <Compare />
        <QuickStart />
        <Architecture />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
