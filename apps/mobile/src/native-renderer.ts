import {
  BlendMode,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkCanvas,
  type SkPicture,
} from "@shopify/react-native-skia";
import {
  interpolatePoints,
  seededRandom,
  type Point,
  type Stroke,
} from "../../../packages/drawing-engine/model";

const bounded = (v: number) => Math.max(0, Math.min(1, v));
function tint(hex: string, light: number, desaturate = 0): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const gray = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(
          Math.max(
            0,
            Math.min(
              255,
              (v + (gray - v) * desaturate) * (1 - Math.max(0, -light)) +
                (255 - v) * Math.max(0, light),
            ),
          ),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Native commands are cached per immutable stroke. Only the active stroke is rerecorded. */
export function recordStroke(
  stroke: Stroke,
  width: number,
  height: number,
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
  drawStroke(canvas, stroke);
  return recorder.finishRecordingAsPicture();
}

export function drawStroke(canvas: SkCanvas, stroke: Stroke): void {
  const mix = stroke.settings.mix;
  if (stroke.settings.tool !== "eraser" && mix > 0.001) {
    if (mix < 0.999) drawStrokePass(canvas, stroke, BlendMode.SrcOver, 1 - mix);
    drawStrokePass(canvas, stroke, BlendMode.Multiply, mix);
  } else drawStrokePass(canvas, stroke, BlendMode.SrcOver, 1);
}

function drawStrokePass(
  canvas: SkCanvas,
  stroke: Stroke,
  blend: BlendMode,
  coverage: number,
): void {
  if (!stroke.points.length) return;
  const s = stroke.settings;
  const random = seededRandom(stroke.seed);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(
    Skia.Color(
      s.material === "graphite"
        ? tint(s.color, -0.35, 0.85)
        : s.material === "natural"
          ? tint(s.color, -0.08, 0.38)
          : s.color,
    ),
  );
  const opacity = bounded(
    s.opacity * s.alpha * (0.25 + s.intensity * 0.75) * coverage,
  );
  const setOpacity = (factor = 1) => paint.setAlphaf(bounded(opacity * factor));
  const base = s.size;
  const erasing = s.tool === "eraser";
  if (erasing) paint.setBlendMode(BlendMode.DstOut);
  else paint.setBlendMode(blend);

  // Continuous ink/chisel tools use one path, preventing dark seams between samples.
  if (["pen", "marker", "eraser"].includes(s.tool)) {
    const path = Skia.Path.Make();
    const first = stroke.points[0];
    path.moveTo(first.x, first.y);
    for (const p of stroke.points.slice(1)) path.lineTo(p.x, p.y);
    if (stroke.points.length === 1) path.lineTo(first.x + 0.01, first.y + 0.01);
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(base);
    paint.setStrokeJoin(StrokeJoin.Round);
    paint.setStrokeCap(
      s.tool === "marker" ? StrokeCap.Square : StrokeCap.Round,
    );
    setOpacity(s.tool === "marker" ? 0.78 : 1);
    canvas.drawPath(path, paint);
    paint.setStyle(PaintStyle.Fill);
    if (
      !erasing &&
      ["glitter", "metallic", "oil", "pearl", "acrylic"].includes(s.material)
    ) {
      const finish = Skia.Paint();
      finish.setAntiAlias(true);
      finish.setColor(Skia.Color(tint(s.color, 0.65)));
      finish.setAlphaf(opacity * 0.35);
      for (let i = 0; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        if (s.material === "glitter") {
          for (let k = 0; k < 3; k++)
            canvas.drawCircle(
              p.x + (random() - 0.5) * base * 0.6,
              p.y + (random() - 0.5) * base * 0.6,
              0.6 + random(),
              finish,
            );
        } else
          canvas.drawOval(
            Skia.XYWHRect(
              p.x - base * 0.22,
              p.y - base * 0.22,
              base * 0.45,
              Math.max(0.6, base * 0.09),
            ),
            finish,
          );
      }
      finish.dispose();
    }
  } else {
    const samples: Point[] = [stroke.points[0]];
    const spacing = Math.max(1.1, base * (s.tool === "airbrush" ? 0.18 : 0.15));
    for (let i = 1; i < stroke.points.length; i++)
      samples.push(
        ...interpolatePoints(stroke.points[i - 1], stroke.points[i], spacing),
      );
    let previous = samples[0];
    for (const p of samples) {
      const pressure =
        p.pressure === undefined || p.pressure === 0 ? 0.65 : p.pressure;
      const radius = (base * (0.3 + pressure * 0.7)) / 2;
      const angle =
        (Math.atan2(p.y - previous.y, p.x - previous.x) * 180) / Math.PI;
      const granular =
        ["pencil", "crayon", "charcoal", "texture"].includes(s.tool) ||
        ["pastel", "natural", "graphite"].includes(s.material);
      if (s.tool === "airbrush") {
        for (let ring = 7; ring >= 1; ring--) {
          setOpacity(0.026 + 0.035 * (1 - ring / 7));
          canvas.drawCircle(p.x, p.y, (radius * ring) / 7, paint);
        }
      } else if (s.tool === "watercolor" || s.material === "watercolor") {
        setOpacity(0.09);
        canvas.drawCircle(p.x, p.y, radius, paint);
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(Math.max(0.7, radius * 0.055));
        setOpacity(0.06);
        canvas.drawCircle(p.x, p.y, radius * 0.96, paint);
        paint.setStyle(PaintStyle.Fill);
      } else if (s.tool === "broad" || s.tool === "fine") {
        canvas.save();
        canvas.translate(p.x, p.y);
        canvas.rotate(angle, 0, 0);
        setOpacity(0.3);
        canvas.drawOval(
          Skia.XYWHRect(-radius * 0.3, -radius, radius * 0.6, radius * 2),
          paint,
        );
        for (let b = -3; b <= 3; b++) {
          setOpacity(0.06 + random() * 0.1);
          canvas.drawRect(
            Skia.XYWHRect(-radius * 0.4, (b * radius) / 4, radius * 0.8, 0.8),
            paint,
          );
        }
        canvas.restore();
      } else if (granular) {
        setOpacity(s.tool === "charcoal" ? 0.05 : 0.14);
        canvas.drawCircle(p.x, p.y, radius, paint);
        const grains = Math.ceil(6 + s.texture * 24);
        for (let grain = 0; grain < grains; grain++) {
          const a = random() * Math.PI * 2,
            distance = Math.sqrt(random()) * radius;
          setOpacity(0.12 + random() * 0.4);
          const x = p.x + Math.cos(a) * distance,
            y = p.y + Math.sin(a) * distance;
          if (s.tool === "texture")
            canvas.drawRect(
              Skia.XYWHRect(x, y, Math.max(0.7, radius * 0.05), radius * 0.3),
              paint,
            );
          else
            canvas.drawCircle(
              x,
              y,
              (s.tool === "crayon" ? 1.4 : 0.65) + random() * radius * 0.08,
              paint,
            );
        }
      } else {
        const softness = s.softness;
        if (softness > 0.05)
          for (let i = 3; i > 0; i--) {
            setOpacity(0.035);
            canvas.drawCircle(
              p.x,
              p.y,
              radius * (1 + (softness * i) / 4),
              paint,
            );
          }
        setOpacity(
          s.material === "acrylic" || s.material === "oil" ? 0.65 : 0.34,
        );
        canvas.drawCircle(p.x, p.y, radius, paint);
      }
      // Material finish is part of the painted command, never a UI-only decoration.
      if (
        ["oil", "metallic", "pearl", "acrylic", "glitter"].includes(s.material)
      ) {
        const highlight = Skia.Paint();
        highlight.setAntiAlias(true);
        highlight.setColor(Skia.Color(tint(s.color, 0.6)));
        highlight.setAlphaf(opacity * (s.material === "pearl" ? 0.14 : 0.25));
        if (s.material === "glitter") {
          for (let k = 0; k < 3; k++) {
            const a = random() * 6.28,
              d = random() * radius;
            const x = p.x + Math.cos(a) * d,
              y = p.y + Math.sin(a) * d;
            canvas.drawRect(Skia.XYWHRect(x - 1, y - 1, 2, 2), highlight);
          }
        } else if (s.material === "oil") {
          for (let k = -2; k <= 2; k++)
            canvas.drawRect(
              Skia.XYWHRect(
                p.x - radius * 0.55,
                p.y + k * radius * 0.27,
                radius * 1.1,
                0.8,
              ),
              highlight,
            );
        } else
          canvas.drawOval(
            Skia.XYWHRect(
              p.x - radius * 0.6,
              p.y - radius * 0.65,
              radius,
              Math.max(1, radius * 0.22),
            ),
            highlight,
          );
        highlight.dispose();
      }
      previous = p;
    }
  }
  paint.dispose();
}
