import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        display: ['Cinzel', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        royal: {
          DEFAULT: "hsl(var(--royal-blue))",
          foreground: "hsl(var(--royal-blue-foreground))",
        },
        silver: {
          DEFAULT: "hsl(var(--silver))",
          foreground: "hsl(var(--silver-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          primary: "hsl(var(--primary))",
          "primary-foreground": "hsl(var(--primary-foreground))",
          accent: "hsl(var(--accent))",
          "accent-foreground": "hsl(var(--accent-foreground))",
          border: "hsl(var(--border))",
          ring: "hsl(var(--ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(40px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "vote-burst": { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.4)" }, "100%": { transform: "scale(1)" } },
        "crown-pulse": { "0%,100%": { filter: "drop-shadow(0 0 8px hsl(43 95% 60% / 0.5))" }, "50%": { filter: "drop-shadow(0 0 24px hsl(43 95% 65% / 0.9))" } },
        "shimmer": { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "shimmer-sweep": { "0%": { transform: "translateX(-50%) skewX(-12deg)" }, "100%": { transform: "translateX(300%) skewX(-12deg)" } },
        "glitch-shift": { "0%,100%": { transform: "translate(0,0)" }, "20%": { transform: "translate(-3px,1px)" }, "40%": { transform: "translate(2px,-2px)" }, "60%": { transform: "translate(-1px,2px)" }, "80%": { transform: "translate(2px,1px)" } },
        "glitch-flicker": { "0%,100%": { opacity: "0.18" }, "50%": { opacity: "0.32" } },
        "pulse-glow": { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "0.85" } },
        "scan-roll": { "0%": { transform: "translateY(0)" }, "100%": { transform: "translateY(120vh)" } },
        "sparkle-twinkle": { "0%,100%": { opacity: "0.4", transform: "scale(1)" }, "50%": { opacity: "0.95", transform: "scale(1.05)" } },
        "filter-pop": { "0%": { transform: "scale(1)" }, "30%": { transform: "scale(1.025)" }, "100%": { transform: "scale(1)" } },
        "vote-flash": { "0%": { opacity: "0" }, "25%": { opacity: "1" }, "100%": { opacity: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "scale-in": "scale-in 0.25s ease-out",
        "slide-up": "slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
        "vote-burst": "vote-burst 0.5s ease-out",
        "crown-pulse": "crown-pulse 2.5s ease-in-out infinite",
        "shimmer": "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
