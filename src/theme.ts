import { createTheme } from "@mui/material/styles";

// Fallback theme used when this app runs standalone (its own dev/preview
// server, see src/main.tsx) without a `theme` prop from the shell. When
// mounted as a remote inside the shell, LoginPage/SignupPage receive the
// shell's theme (shell/src/theme/theme.ts) as a prop instead — see the
// `theme` prop on those components.
export const theme = createTheme({
  palette: {
    primary: { main: "#981652", light: "#b8336a", contrastText: "#ffffff" },
    secondary: { main: "#7b4d88", light: "#f0b9fd", contrastText: "#ffffff" },
    background: { default: "#ebfdff", paper: "#ffffff" },
    text: { primary: "#0a1e21", secondary: "#574147" },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "'Public Sans', sans-serif",
    h1: { fontFamily: "'Public Sans', sans-serif", fontSize: "3rem", fontWeight: 700 },
    body1: { fontFamily: "'Public Sans', sans-serif", fontSize: "1rem" },
    button: {
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          paddingTop: 14,
          paddingBottom: 14,
          // Matches login.html / signup.html: shadow-md, hover:shadow-lg.
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
          "&:hover": {
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
          },
        },
        containedPrimary: {
          "&:hover": {
            backgroundColor: "#b8336a", // primary-container
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },
  },
});
