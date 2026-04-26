import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GitHubIcon, ThetaMark } from "../lib/ui.jsx";

/**
 * Navbar — implements `plans/NAVBAR.md` (Synaptrove pill navbar pattern).
 *
 * Adapted for Theoria's dark page: the spec's "permanently light" colors
 * (black on white) are inverted to white-on-dark so contrast holds against
 * #08090b. All geometry, timing, easing, breakpoints, and the entrance
 * animation are kept exactly per the spec.
 */

// Spec §3 — single 50px boundary, no hysteresis.
const SCROLL_THRESHOLD = 50;

// Spec §2.4 — Quint Out, the only acceptable curve.
const PILL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PILL_TRANSITION = `all 500ms ${PILL_EASE}`;

const DESKTOP_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#docs", label: "Docs" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasAnimated = useRef(false);

  // Spec §3 — passive listener, initial sample on mount.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Spec §6 — entrance animation runs once. Framer Motion in place of GSAP
  // (the spec explicitly permits this swap). Guarded against replay.
  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  const entranceInitial = hasAnimated.current ? false : { opacity: 0, y: -12 };
  const entranceAnimate = { opacity: 1, y: 0 };

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Wrapper — adds safe padding around the pill when scrolled (spec §2.2). */}
      <div
        style={{ transition: PILL_TRANSITION }}
        className={scrolled ? "px-4 pt-3 sm:px-6" : "px-0 pt-0"}
      >
        {/* Inner pill — the single animated element (spec §2.3). */}
        <div
          style={{
            transition: PILL_TRANSITION,
            backdropFilter: scrolled ? "blur(24px)" : "none",
            WebkitBackdropFilter: scrolled ? "blur(24px)" : "none",
            background: scrolled ? "rgba(12, 13, 16, 0.85)" : "transparent",
            boxShadow: scrolled
              ? "0 4px 24px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)"
              : "none",
          }}
          className={
            "mx-auto flex items-center justify-between " +
            (scrolled
              ? "h-16 sm:h-[68px] max-w-2xl rounded-full px-5 sm:px-6"
              : "h-20 max-w-5xl px-4 sm:px-6 lg:px-8")
          }
        >
          {/* Logo block (spec §4) */}
          <motion.a
            href="#"
            data-nav-item
            aria-label="Theoria home"
            className="flex items-center gap-2"
            initial={entranceInitial}
            animate={entranceAnimate}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: scrolled ? 40 : 44,
                height: scrolled ? 40 : 44,
                transition: PILL_TRANSITION,
              }}
            >
              <ThetaMark size={scrolled ? 36 : 40} />
            </span>
            <span
              className="font-bold tracking-tight text-fg leading-none"
              style={{
                fontSize: scrolled ? 20 : 24,
                transition: PILL_TRANSITION,
              }}
            >
              Theoria
            </span>
          </motion.a>

          {/* Action cluster (spec §5) */}
          <motion.div
            data-nav-item
            className="flex items-center gap-1"
            initial={entranceInitial}
            animate={entranceAnimate}
            transition={{
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.21, // 0.15 + 0.06 stagger per spec §6
            }}
          >
            {/* Desktop nav links (spec §5.1) */}
            {DESKTOP_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={
                  "hidden md:inline-flex items-center justify-center font-medium text-fg-1 hover:text-fg hover:bg-white/[0.06] rounded-full " +
                  (scrolled ? "h-9 px-3 text-base" : "h-10 px-4 text-lg")
                }
                style={{ transition: PILL_TRANSITION }}
              >
                {link.label}
              </a>
            ))}

            {/* GitHub icon link (spec §5.2) */}
            <a
              href="https://github.com/Abhra0404/Monitoring-tool"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="hidden md:inline-flex items-center justify-center rounded-full p-1.5 text-fg-1 hover:text-fg hover:bg-white/[0.06]"
              style={{ transition: PILL_TRANSITION }}
            >
              <GitHubIcon size={scrolled ? 24 : 28} />
            </a>

            {/* Mobile menu trigger (spec §5.3) */}
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="md:hidden inline-flex items-center justify-center rounded-full text-fg hover:bg-white/[0.06]"
              style={{
                width: scrolled ? 36 : 40,
                height: scrolled ? 36 : 40,
                transition: PILL_TRANSITION,
              }}
            >
              <Menu size={scrolled ? 20 : 24} />
            </button>
          </motion.div>
        </div>
      </div>

      {/* Mobile sheet — out of scope for the spec, kept minimal but on-brand. */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-nav"
            className="fixed inset-0 z-[60] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              className="absolute inset-x-4 top-4 rounded-3xl border border-stroke-1 bg-surface-1/95 p-5 shadow-2xl backdrop-blur-xl"
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <a
                  href="#"
                  className="flex items-center gap-2"
                  onClick={() => setMobileOpen(false)}
                >
                  <ThetaMark size={36} />
                  <span className="text-xl font-bold tracking-tight text-fg">
                    Theoria
                  </span>
                </a>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg hover:bg-white/[0.06]"
                >
                  <X size={22} />
                </button>
              </div>

              <nav className="mt-6 flex flex-col" aria-label="Primary mobile">
                {DESKTOP_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl px-3 py-3 text-lg font-medium text-fg-1 hover:bg-white/[0.06] hover:text-fg"
                  >
                    {link.label}
                  </a>
                ))}
                <a
                  href="https://github.com/Abhra0404/Monitoring-tool"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 flex items-center gap-2 rounded-xl px-3 py-3 text-lg font-medium text-fg-1 hover:bg-white/[0.06] hover:text-fg"
                >
                  <GitHubIcon size={20} /> GitHub
                </a>
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
