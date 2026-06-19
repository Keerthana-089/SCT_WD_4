import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Premium To-Do App" },
      { name: "description", content: "A premium productivity to-do app to plan, prioritize and complete your tasks beautifully." },
      { property: "og:title", content: "Lumen — Premium To-Do App" },
      { property: "og:description", content: "Plan, prioritize and complete your tasks beautifully." },
    ],
  }),
  component: Index,
});

function Index() {
  // The full app is a self-contained HTML/CSS/JS bundle in /public/todo/.
  // Redirect the SPA root to it on mount, and offer a manual link as fallback.
  useEffect(() => {
    window.location.replace("/todo/index.html");
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(180deg,#0a0613,#0f0a1f)",
      color: "#f4f1ff",
      fontFamily: "Poppins, system-ui, sans-serif",
    }}>
      <a href="/todo/index.html" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}>
        Open Lumen To-Do →
      </a>
    </div>
  );
}
