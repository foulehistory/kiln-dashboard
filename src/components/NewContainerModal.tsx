import { useEffect, useState } from "react";
import type { ImageInfo, NetworkInfo, RunSpec } from "../types";

function imageLabel(img: ImageInfo): string {
  return img.repository && img.tag ? `${img.repository}:${img.tag}` : img.id.slice(0, 16);
}

function extractError(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object" && "error" in (body as Record<string, unknown>)) {
    return String((body as Record<string, unknown>).error);
  }
  return `request failed (status ${status})`;
}

/// Dynamic list of free-text rows (volumes, env vars, ports), each with
/// its own remove button and a trailing "+" row - the same shape for all
/// three so `kiln:run`'s array fields don't need three near-identical
/// components.
function ListField({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      {values.map((v, i) => (
        <div className="list-row" key={i}>
          <input
            value={v}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((existing, j) => (j === i ? e.target.value : existing)))}
          />
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="list-add" onClick={() => onChange([...values, ""])}>
        + Add
      </button>
    </div>
  );
}

export default function NewContainerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [image, setImage] = useState("");
  const [command, setCommand] = useState("");
  const [name, setName] = useState("");
  const [network, setNetwork] = useState("");
  const [memory, setMemory] = useState("");
  const [cpus, setCpus] = useState("");
  const [restart, setRestart] = useState("no");
  const [volumes, setVolumes] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<string[]>([]);
  const [ports, setPorts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.kiln.images().then((r) => {
      if (r.status === 200 && Array.isArray(r.body)) {
        setImages(r.body);
        if (r.body.length > 0) setImage(imageLabel(r.body[0]));
      }
    });
    window.kiln.networks().then((r) => {
      if (r.status === 200 && Array.isArray(r.body)) setNetworks(r.body);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!image.trim()) {
      setError("Pick an image.");
      return;
    }
    if (ports.some((p) => p.trim()) && !network) {
      setError("Publishing a port requires picking a network (there's no container IP to route to otherwise).");
      return;
    }

    const environment: [string, string][] = envVars
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => {
        const eq = v.indexOf("=");
        return eq === -1 ? [v, ""] : [v.slice(0, eq), v.slice(eq + 1)];
      });

    const spec: RunSpec = {
      image: image.trim(),
      command: command.trim() ? command.trim().split(/\s+/) : undefined,
      name: name.trim() || undefined,
      network: network || undefined,
      volumes: volumes.map((v) => v.trim()).filter(Boolean),
      environment,
      memory: memory.trim() || undefined,
      cpus: cpus.trim() ? Number(cpus.trim()) : undefined,
      ports: ports.map((p) => p.trim()).filter(Boolean),
      restart: restart !== "no" ? restart : undefined,
    };

    setSubmitting(true);
    setError(null);
    const r = await window.kiln.run(spec);
    setSubmitting(false);
    if (r.status !== 200 && r.status !== 201) {
      setError(extractError(r.body, r.status));
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New container</h2>
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Image</label>
              {images.length > 0 ? (
                <select value={image} onChange={(e) => setImage(e.target.value)}>
                  {images.map((img) => (
                    <option key={img.id} value={imageLabel(img)}>
                      {imageLabel(img)}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="e.g. busybox:latest" />
              )}
            </div>
            <div className="form-field">
              <label className="form-label">Name (optional)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="auto-generated if empty" />
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Command (optional)</label>
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="uses the image's default CMD if empty" />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Network</label>
              <select value={network} onChange={(e) => setNetwork(e.target.value)}>
                <option value="">none</option>
                {networks.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Restart policy</label>
              <select value={restart} onChange={(e) => setRestart(e.target.value)}>
                <option value="no">no</option>
                <option value="always">always</option>
                <option value="on-failure">on-failure</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Memory limit (optional)</label>
              <input value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="e.g. 512m" />
            </div>
            <div className="form-field">
              <label className="form-label">CPU limit (optional)</label>
              <input value={cpus} onChange={(e) => setCpus(e.target.value)} placeholder="e.g. 0.5" />
            </div>
          </div>

          <ListField label="Volumes" placeholder="volume-name:/container/path" values={volumes} onChange={setVolumes} />
          <ListField label="Ports" placeholder="host-port:container-port" values={ports} onChange={setPorts} />
          <ListField label="Environment" placeholder="KEY=value" values={envVars} onChange={setEnvVars} />

          {error && <div className="updates-error">{error}</div>}

          <div className="confirm-actions" style={{ marginTop: 16 }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
