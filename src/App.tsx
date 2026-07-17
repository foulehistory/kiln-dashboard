import { useEffect, useState } from "react";
import ContainersView from "./components/ContainersView";
import ImagesView from "./components/ImagesView";
import NetworksView from "./components/NetworksView";
import TerminalView from "./components/TerminalView";
import UpdatesWidget from "./components/UpdatesWidget";
import { initialTheme, THEME_KEY, type Theme } from "./theme";

type Tab = "containers" | "images" | "networks" | "terminal";

export default function App() {
  const [tab, setTab] = useState<Tab>("containers");
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <div className="app">
      <div className="sidebar">
        <div className="brand">
          kiln<span>d</span>ash
        </div>
        <NavItem label="Containers" active={tab === "containers"} onClick={() => setTab("containers")} />
        <NavItem label="Images" active={tab === "images"} onClick={() => setTab("images")} />
        <NavItem label="Networks" active={tab === "networks"} onClick={() => setTab("networks")} />
        <NavItem label="Terminal" active={tab === "terminal"} onClick={() => setTab("terminal")} />
        <div className="sidebar-spacer" />
        <UpdatesWidget />
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
        </button>
      </div>
      <div className="main">
        {tab === "containers" && <ContainersView />}
        {tab === "images" && <ImagesView />}
        {tab === "networks" && <NetworksView />}
        {tab === "terminal" && <TerminalView />}
      </div>
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div className={`nav-item${active ? " active" : ""}`} onClick={onClick}>
      {label}
    </div>
  );
}
