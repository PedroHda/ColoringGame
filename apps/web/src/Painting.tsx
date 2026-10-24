import { useEffect, useRef, useState } from "react";
import {
  CanvasBrushEngine,
  DEFAULT_BRUSH_SETTINGS,
  tools,
  materials,
  getDefaultBrushSettings,
} from "../../../packages/drawing-engine/index";
import type {
  BrushSettings,
  Point,
  ToolId,
  MaterialId,
} from "../../../packages/drawing-engine/index";
import type { Drawing } from "../../../packages/shared-types/index";
import {
  isToolUnlocked,
  isMaterialUnlocked,
  toolUnlocks,
  materialUnlocks,
  discover,
} from "../../../packages/core/index";
import type { Player } from "../../../packages/core/index";
import { hsvToHex, hexToHsv } from "../../../packages/core/colors";
import { stages, paths } from "../../../packages/game-content/index";
import { narrate } from "./audio";
import { clampPan, zoomAt } from "../../../packages/drawing-engine/viewport";

export function Painting({
  drawing,
  player,
  onPlayer,
  onSave,
  onBack,
  onComplete,
  notify,
}: {
  drawing: Drawing;
  player: Player;
  onPlayer: (p: Player) => void;
  onSave: (d: Drawing) => Promise<void>;
  onBack: () => void;
  onComplete: (d: Drawing) => void;
  notify: (s: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    line = useRef<HTMLImageElement>(null),
    board = useRef<HTMLDivElement>(null),
    cursorElement = useRef<HTMLDivElement>(null),
    engine = useRef<CanvasBrushEngine | null>(null),
    current = useRef(drawing);
  const settingsRef = useRef<BrushSettings>({ ...DEFAULT_BRUSH_SETTINGS });
  const [hexDraft, setHexDraft] = useState(DEFAULT_BRUSH_SETTINGS.color);
  const [theme, setTheme] = useState("path-01");
  const [brush, setBrush] = useState<BrushSettings>({
      ...DEFAULT_BRUSH_SETTINGS,
    }),
    [hsv, setHsv] = useState(hexToHsv(brush.color)),
    [recent, setRecent] = useState<string[]>([]),
    [revision, setRevision] = useState(0),
    [panel, setPanel] = useState(true),
    [hand, setHand] = useState(false),
    [dropper, setDropper] = useState(false),
    [zoom, setZoom] = useState(1),
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [status, setStatus] = useState("Salvo no dispositivo"),
    [ready, setReady] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      distance: number;
      zoom: number;
      offset: { x: number; y: number };
      center: { x: number; y: number };
    } | null>(null),
    pan = useRef<{ x: number; y: number } | null>(null),
    active = useRef(false),
    undoCount = current.current.document.redo.length;
  const update = (patch: Partial<BrushSettings>) => {
    setBrush((old) => {
      const next = { ...old, ...patch };
      settingsRef.current = next;
      return next;
    });
  };
  useEffect(() => setHexDraft(brush.color), [brush.color]);
  const setColor = (color: string) => {
    if (/^#[\da-f]{6}$/i.test(color)) {
      const hex = color.toUpperCase();
      setHsv(hexToHsv(hex));
      update({ color: hex });
    }
  };
  useEffect(() => {
    const e = new CanvasBrushEngine(
      canvas.current!,
      drawing.document.width,
      drawing.document.height,
    );
    e.setDocument(drawing.document);
    engine.current = e;
    current.current = drawing;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [drawing.id]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (/INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName))
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  async function save() {
    const e = engine.current;
    if (!e) return;
    current.current = {
      ...current.current,
      document: e.getDocument(),
      updatedAt: new Date().toISOString(),
    };
    setRevision((n) => n + 1);
    setStatus("Salvando traços…");
    try {
      await onSave(current.current);
      setStatus("Salvo no dispositivo");
    } catch (error) {
      setStatus("Falha ao salvar — exporte sua arte");
      notify(String(error));
    }
  }
  async function finishStroke() {
    if (!active.current) return;
    active.current = false;
    const stroke = engine.current?.end();
    if (stroke) {
      setRecent((colors) =>
        [
          stroke.settings.color,
          ...colors.filter((c) => c !== stroke.settings.color),
        ].slice(0, 8),
      );
      onPlayer(
        discover(
          discover(player, "tool", stroke.settings.tool),
          "material",
          stroke.settings.material,
        ),
      );
      await save();
    }
  }
  async function thumbnail() {
    if (!canvas.current || !line.current?.complete) return;
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = Math.round(
      (320 * drawing.document.height) / drawing.document.width,
    );
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas.current, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(line.current, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) =>
      c.toBlob(r, "image/png"),
    );
    if (blob) {
      current.current = {
        ...current.current,
        thumbnail: new Uint8Array(await blob.arrayBuffer()),
      };
      await onSave(current.current);
    }
  }
  function undo() {
    if (engine.current?.undo()) {
      void save();
    }
  }
  function redo() {
    if (engine.current?.redo()) {
      void save();
    }
  }
  const point = (event: {
    clientX: number;
    clientY: number;
    pressure?: number;
    timeStamp?: number;
  }): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * drawing.document.width,
      y: ((event.clientY - r.top) / r.height) * drawing.document.height,
      pressure: event.pressure && event.pressure > 0 ? event.pressure : 0.5,
      time: event.timeStamp ?? performance.now(),
    };
  };
  function start(event: React.PointerEvent<HTMLDivElement>) {
    if (!ready) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size >= 2) {
      if (active.current) {
        engine.current?.cancelActive();
        active.current = false;
      }
      if (pointers.current.size > 2) return;
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        offset,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    if (hand || event.button === 1 || event.button === 2) {
      pan.current = {
        x: event.clientX - offset.x,
        y: event.clientY - offset.y,
      };
      return;
    }
    if (dropper) {
      setColor(engine.current!.sample(point(event).x, point(event).y));
      setDropper(false);
      return;
    }
    if (event.button !== 0) return;
    engine.current!.begin(point(event), settingsRef.current);
    active.current = true;
  }
  function move(event: React.PointerEvent<HTMLDivElement>) {
    const r = board.current!.getBoundingClientRect();
    if (cursorElement.current) {
      const dot = cursorElement.current;
      dot.style.display = "block";
      dot.style.left = `${event.clientX - r.left}px`;
      dot.style.top = `${event.clientY - r.top}px`;
      const diameter = Math.max(
        4,
        (settingsRef.current.size / drawing.document.width) *
          (canvas.current?.getBoundingClientRect().width ?? 0),
      );
      dot.style.width = dot.style.height = `${diameter}px`;
    }
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()],
        g = gesture.current;
      const nextZoom = Math.max(
        1,
        Math.min(
          5,
          (g.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.distance),
        ),
      );
      const fixed = zoomAt(
        g.center,
        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        g.offset,
        g.zoom,
        nextZoom,
      );
      setZoom(nextZoom);
      setOffset(
        clampPan(
          {
            x: fixed.x + (a.x + b.x) / 2 - g.center.x,
            y: fixed.y + (a.y + b.y) / 2 - g.center.y,
          },
          nextZoom,
          r.width,
          r.height,
        ),
      );
      return;
    }
    if (pan.current) {
      setOffset(
        clampPan(
          {
            x: event.clientX - pan.current.x,
            y: event.clientY - pan.current.y,
          },
          zoom,
          r.width,
          r.height,
        ),
      );
      return;
    }
    if (active.current) {
      const events = event.nativeEvent.getCoalescedEvents?.() ?? [
        event.nativeEvent,
      ];
      for (const e of events) engine.current?.move(point(e));
    }
  }
  function end(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
    pan.current = null;
    void finishStroke();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function exportImage() {
    try {
      const blob = await engine.current!.exportComposite(line.current!);
      downloadBlob(blob, `colore-${drawing.id}.png`);
      await thumbnail();
      notify("Sua pintura foi exportada em PNG.");
    } catch (e) {
      notify(String(e));
    }
  }
  const chooseTool = (tool: ToolId) => {
    if (!isToolUnlocked(player, tool)) return;
    update({
      ...getDefaultBrushSettings(tool),
      color: brush.color,
      material: brush.material,
    });
    setHand(false);
    setDropper(false);
  };
  const nudgeHsv = (patch: Partial<typeof hsv>) => {
    const value = { ...hsv, ...patch };
    setHsv(value);
    update({ color: hsvToHex(value.h, value.s, value.v) });
  };
  function wheel(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const r = event.currentTarget.getBoundingClientRect(),
      x = event.clientX - r.left - r.width / 2,
      y = event.clientY - r.top - r.height / 2;
    nudgeHsv({
      h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
      s: Math.min(1, Math.hypot(x, y) / (r.width / 2)),
    });
  }
  return (
    <section className={`editor ${panel ? "" : "focus-mode"}`}>
      <div className="editor-heading">
        <button
          className="text-button"
          onClick={async () => {
            await finishStroke();
            await thumbnail();
            onBack();
          }}
        >
          ← Voltar ao caminho
        </button>
        <div>
          <p className="eyebrow">
            {drawing.kind === "clothing"
              ? "GUARDA-ROUPA · FEITO POR VOCÊ"
              : "SEU TEMPO. SUAS CORES."}
          </p>
          <h1>{drawing.title}</h1>
        </div>
        <button onClick={() => setPanel((v) => !v)} aria-pressed={!panel}>
          ◫ {panel ? "Focar na arte" : "Mostrar ateliê"}
        </button>
      </div>
      <div className="editor-layout">
        <div className="canvas-column">
          <div className="canvas-actions">
            <div>
              <button
                onClick={undo}
                disabled={!current.current.document.strokes.length}
                title="Ctrl+Z"
              >
                ↶ Desfazer
              </button>
              <button onClick={redo} disabled={!undoCount} title="Ctrl+Shift+Z">
                ↷ Refazer
              </button>
              <button
                onClick={() => {
                  setHand((v) => !v);
                  setDropper(false);
                }}
                aria-pressed={hand}
              >
                ✥ Mover
              </button>
              <button
                onClick={() => {
                  setDropper((v) => !v);
                  setHand(false);
                }}
                aria-pressed={dropper}
              >
                ⌾ Conta-gotas
              </button>
            </div>
            <div>
              <button
                aria-label="Diminuir zoom"
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              >
                −
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                aria-label="Aumentar zoom"
                onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
              >
                ＋
              </button>
            </div>
          </div>
          <div
            className={`drawing-board ${hand ? "hand" : ""}`}
            ref={board}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={() => void finishStroke()}
            onPointerLeave={() => {
              if (cursorElement.current)
                cursorElement.current.style.display = "none";
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              className="drawing-transform"
              style={{
                aspectRatio: `${drawing.document.width}/${drawing.document.height}`,
                transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
              }}
            >
              <div className="paper-layer" />
              <canvas ref={canvas} aria-label="Camada de pintura livre" />
              <img
                ref={line}
                className="line-layer"
                src={drawing.asset}
                alt="Contornos da ilustração; desenhe com o dedo ou mouse"
                draggable={false}
                onLoad={() => setReady(true)}
                onError={() =>
                  notify(
                    "A ilustração não carregou. Seu trabalho permanece salvo.",
                  )
                }
              />
            </div>
            {!hand && (
              <div
                className="brush-cursor"
                ref={cursorElement}
                style={{
                  display: "none",
                  width: Math.max(
                    4,
                    (brush.size / drawing.document.width) *
                      (canvas.current?.getBoundingClientRect().width ?? 0),
                  ),
                  height: Math.max(
                    4,
                    (brush.size / drawing.document.width) *
                      (canvas.current?.getBoundingClientRect().width ?? 0),
                  ),
                  borderColor:
                    brush.tool === "eraser" ? "#775F49" : brush.color,
                }}
              />
            )}
            {!ready && <div className="loading-art">Preparando o papel…</div>}
          </div>
          <div className="paint-meta">
            <span role="status">● {status}</span>
            <span>
              {current.current.document.strokes.length} traços ·{" "}
              {drawing.document.width} × {drawing.document.height}
            </span>
          </div>
          <p className="quiet">
            Um dedo pinta. Dois dedos ampliam e movem. Você decide quando a obra
            está pronta.
          </p>
          {drawing.stageId && (
            <div className="painting-story">
              <p>{stages.find((s) => s.id === drawing.stageId)?.intro}</p>
              <button
                onClick={() => {
                  if (
                    !narrate(
                      stages.find((s) => s.id === drawing.stageId)?.intro ?? "",
                      player.preferences.narration,
                    )
                  )
                    notify("Narração indisponível; leia o texto acima.");
                }}
              >
                ◖ Ouvir a história
              </button>
            </div>
          )}
          <div className="editor-bottom">
            <button onClick={exportImage}>↓ Exportar PNG</button>
            <button
              className="primary"
              onClick={async () => {
                await finishStroke();
                await thumbnail();
                onComplete(current.current);
              }}
            >
              {drawing.kind === "clothing"
                ? "Salvar e vestir →"
                : drawing.completed
                  ? "Obra concluída · ver história"
                  : "Concluir minha pintura →"}
            </button>
          </div>
        </div>
        {panel && (
          <aside className="brush-panel">
            <div className="panel-title">
              <p className="eyebrow">SEU ATELIÊ</p>
              <h2>Deixe sua marca.</h2>
              <span className="paint-dot" style={{ background: brush.color }} />
            </div>
            <label>
              Ferramenta
              <select
                aria-label="Ferramenta"
                value={brush.tool}
                onChange={(e) => chooseTool(e.target.value as ToolId)}
              >
                {tools.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={!isToolUnlocked(player, t.id)}
                  >
                    {t.name}
                    {!isToolUnlocked(player, t.id)
                      ? ` · nível ${toolUnlocks[t.id]}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="control-description">
              {tools.find((t) => t.id === brush.tool)?.description}
            </p>
            <div className="quick-tools">
              {tools
                .filter((t) => isToolUnlocked(player, t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={brush.tool === t.id}
                    onClick={() => chooseTool(t.id)}
                    title={t.description}
                  >
                    {t.name}
                  </button>
                ))}
            </div>
            <label>
              Material
              <select
                aria-label="Material"
                value={brush.material}
                onChange={(e) =>
                  update({ material: e.target.value as MaterialId })
                }
              >
                {materials.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    disabled={!isMaterialUnlocked(player, m.id)}
                  >
                    {m.name}
                    {!isMaterialUnlocked(player, m.id)
                      ? ` · nível ${materialUnlocks[m.id]}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="hsv-wheel"
              role="slider"
              tabIndex={0}
              aria-label="Círculo cromático"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(hsv.h)}
              aria-valuetext={brush.color}
              onPointerDown={wheel}
              onPointerMove={wheel}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  nudgeHsv(
                    e.key === "ArrowLeft"
                      ? { h: (hsv.h + 355) % 360 }
                      : e.key === "ArrowRight"
                        ? { h: (hsv.h + 5) % 360 }
                        : e.key === "ArrowUp"
                          ? { s: Math.min(1, hsv.s + 0.05) }
                          : { s: Math.max(0, hsv.s - 0.05) },
                  );
                }
              }}
            >
              <i
                style={{
                  left: `${50 + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * 48}%`,
                  top: `${50 + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * 48}%`,
                  background: brush.color,
                }}
              />
            </div>
            <div className="color-inputs">
              <label>
                HEX
                <input
                  aria-label="Cor HEX"
                  value={hexDraft}
                  onChange={(e) => {
                    setHexDraft(e.target.value);
                    setColor(e.target.value);
                  }}
                  onBlur={() => setHexDraft(brush.color)}
                  maxLength={7}
                />
              </label>
              {["R", "G", "B"].map((c, i) => (
                <label key={c}>
                  {c}
                  <input
                    type="number"
                    aria-label={`Canal ${c}`}
                    min={0}
                    max={255}
                    value={parseInt(
                      brush.color.slice(1 + i * 2, 3 + i * 2),
                      16,
                    )}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 0 && n <= 255 && Number.isInteger(n))
                        setColor(
                          brush.color.slice(0, 1 + i * 2) +
                            n.toString(16).padStart(2, "0") +
                            brush.color.slice(3 + i * 2),
                        );
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="range-label">
              Luminosidade <output>{Math.round(hsv.v * 100)}%</output>
              <input
                aria-label="Luminosidade"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={hsv.v}
                onChange={(e) => nudgeHsv({ v: Number(e.target.value) })}
              />
            </label>
            <label className="range-label">
              Saturação <output>{Math.round(hsv.s * 100)}%</output>
              <input
                aria-label="Saturação"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={hsv.s}
                onChange={(e) => nudgeHsv({ s: Number(e.target.value) })}
              />
            </label>
            {(
              [
                "size",
                "opacity",
                "alpha",
                "intensity",
                "softness",
                "texture",
                "mix",
              ] as const
            ).map((key) => (
              <label className="range-label" key={key}>
                {
                  {
                    size: "Espessura",
                    opacity: "Opacidade",
                    alpha: "Alfa da cor",
                    intensity: "Intensidade",
                    softness: "Suavidade",
                    texture: "Textura",
                    mix: "Mistura de pigmentos",
                  }[key]
                }
                <output>
                  {key === "size"
                    ? `${brush.size}px`
                    : `${Math.round(brush[key] * 100)}%`}
                </output>
                <input
                  aria-label={key}
                  type="range"
                  min={key === "size" ? 1 : 0}
                  max={key === "size" ? 256 : 1}
                  step={key === "size" ? 1 : 0.01}
                  value={brush[key]}
                  onChange={(e) => update({ [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <div className="swatches">
              {[
                ...new Set([
                  ...recent,
                  "#FFFFFF",
                  "#000000",
                  "#B9684E",
                  "#D4A34E",
                  "#728452",
                  "#548E98",
                ]),
              ]
                .slice(0, 14)
                .map((color) => (
                  <button
                    key={color}
                    aria-label={`Usar ${color}`}
                    style={{ background: color }}
                    onClick={() => setColor(color)}
                  />
                ))}
            </div>
            <label>
              Paletas da viagem
              <select
                aria-label="Paleta temática"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                {paths.map((path) => (
                  <option
                    key={path.id}
                    value={path.id}
                    disabled={
                      path.index !== 0 &&
                      !player.rewards.includes(`path:${path.id}`)
                    }
                  >
                    {path.title}
                    {path.index !== 0 &&
                    !player.rewards.includes(`path:${path.id}`)
                      ? " · concluir caminho"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="swatches">
              {paths
                .find((path) => path.id === theme)
                ?.palette.map((color) => (
                  <button
                    key={color}
                    aria-label={`Pigmento temático ${color}`}
                    style={{ background: color }}
                    onClick={() => setColor(color)}
                  />
                ))}
            </div>
            <button
              className="wide"
              onClick={() => {
                if (player.favorites.length >= 30) {
                  notify("Você já tem 30 paletas favoritas.");
                  return;
                }
                onPlayer({
                  ...player,
                  favorites: [
                    ...player.favorites,
                    [...new Set([brush.color, ...recent])].slice(0, 8),
                  ],
                });
                notify("Paleta guardada no seu perfil.");
              }}
            >
              ♡ Guardar paleta
            </button>
            {player.favorites.map((colors, i) => (
              <div className="favorite-palette" key={i}>
                <span>Paleta {i + 1}</span>
                {colors.map((c) => (
                  <button
                    key={c}
                    aria-label={`Favorita ${c}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            ))}
          </aside>
        )}
      </div>
      <span hidden>{revision}</span>
    </section>
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
