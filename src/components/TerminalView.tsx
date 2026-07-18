import { useRef, useState } from "react";
import TerminalTab from "./TerminalTab";
import { PlusIcon, CloseIcon } from "./icons";

interface TabMeta {
  id: number;
}

/** Every open tab's TerminalTab stays mounted (just hidden via CSS) for
 * as long as the tab exists - unmounting on switch would tear down its
 * exec session (see TerminalTab's cleanup effect), which would be a
 * pretty unpleasant surprise mid-command. */
export default function TerminalView() {
  const [tabs, setTabs] = useState<TabMeta[]>([{ id: 1 }]);
  const [activeId, setActiveId] = useState(1);
  const nextId = useRef(2);

  function addTab() {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id }]);
    setActiveId(id);
  }

  function closeTab(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const freshId = nextId.current++;
        setActiveId(freshId);
        return [{ id: freshId }];
      }
      if (activeId === id) setActiveId(next[next.length - 1].id);
      return next;
    });
  }

  return (
    <div>
      <h1>Terminal</h1>
      <div className="terminal-tab-bar">
        {tabs.map((t, i) => (
          <div key={t.id} className={`terminal-tab${t.id === activeId ? " active" : ""}`} onClick={() => setActiveId(t.id)}>
            Terminal {i + 1}
            {tabs.length > 1 && (
              <span className="terminal-tab-close" onClick={(e) => closeTab(t.id, e)}>
                <CloseIcon />
              </span>
            )}
          </div>
        ))}
        <button className="icon-btn" title="New terminal tab" onClick={addTab}>
          <PlusIcon />
        </button>
      </div>
      {tabs.map((t) => (
        <div key={t.id} style={{ display: t.id === activeId ? "block" : "none" }}>
          <TerminalTab visible={t.id === activeId} />
        </div>
      ))}
    </div>
  );
}
