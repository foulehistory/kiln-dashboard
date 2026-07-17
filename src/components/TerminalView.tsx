import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { usePolling } from "../usePolling";

export default function TerminalView() {
  const { data: containers } = usePolling(() => window.kiln.containers().then((r) => r.body), 3000);
  const running = (containers ?? []).filter((c) => c.status === "running");

  const [selected, setSelected] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const sessionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      theme: { background: "#000000" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    const offData = window.kiln.onExecData(({ sessionId, data }) => {
      if (sessionId === sessionRef.current) term.write(data);
    });
    const offClosed = window.kiln.onExecClosed(({ sessionId }) => {
      if (sessionId === sessionRef.current) {
        term.write("\r\n\x1b[90m[session closed]\x1b[0m\r\n");
        sessionRef.current = null;
      }
    });

    const onData = term.onData((data) => {
      if (sessionRef.current !== null) window.kiln.execWrite(sessionRef.current, data);
    });

    return () => {
      window.removeEventListener("resize", onResize);
      offData();
      offClosed();
      onData.dispose();
      term.dispose();
      if (sessionRef.current !== null) window.kiln.execClose(sessionRef.current);
    };
  }, []);

  async function connect(containerId: string) {
    setSelected(containerId);
    if (sessionRef.current !== null) {
      window.kiln.execClose(sessionRef.current);
      sessionRef.current = null;
    }
    const term = termRef.current;
    if (!term || !containerId) return;
    term.reset();
    term.write(`Connecting to ${containerId.slice(0, 12)}...\r\n`);
    try {
      const sessionId = await window.kiln.execStart(containerId);
      sessionRef.current = sessionId;
      term.write("Connected. Type away.\r\n\r\n");
    } catch (e) {
      term.write(`\x1b[91mFailed to start exec: ${String(e)}\x1b[0m\r\n`);
    }
  }

  return (
    <div>
      <h1>Terminal</h1>
      <div className="toolbar">
        <select value={selected} onChange={(e) => connect(e.target.value)}>
          <option value="">Select a running container…</option>
          {running.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id.slice(0, 12)})
            </option>
          ))}
        </select>
        {running.length === 0 && <span className="muted">No running containers to attach to.</span>}
      </div>
      <div className="terminal-container" ref={containerRef} />
    </div>
  );
}
