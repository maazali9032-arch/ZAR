import QRCode from 'qrcode';
import jsQR from 'jsqr';

export interface GoldenClassicQrInput {
  url: string;
  groomName?: string | null;
  brideName?: string | null;
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1180;
const QR_SIZE = 720;
const QR_X = (CANVAS_WIDTH - QR_SIZE) / 2;
const QR_Y = 170;

function drawCornerOrnament(ctx: CanvasRenderingContext2D, x: number, y: number, flipX: number, flipY: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX, flipY);
  ctx.strokeStyle = '#a36b09';
  ctx.fillStyle = '#d69a1b';
  ctx.lineWidth = 5;

  // A fixed hand-drawn filigree/flower motif for each of the four corners.
  for (let i = 0; i < 6; i += 1) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / 6);
    ctx.beginPath();
    ctx.ellipse(0, -43, 19, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#7d4f00';
  ctx.fill();

  ctx.strokeStyle = '#b5780b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(26, 18);
  ctx.bezierCurveTo(88, 4, 108, 39, 154, 20);
  ctx.bezierCurveTo(123, 61, 90, 59, 70, 91);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(23, 31);
  ctx.bezierCurveTo(43, 80, 71, 111, 143, 111);
  ctx.stroke();
  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  const background = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  background.addColorStop(0, '#fffdf4');
  background.addColorStop(0.5, '#f8efd9');
  background.addColorStop(1, '#fffaf0');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = '#8c5b05';
  ctx.lineWidth = 7;
  ctx.strokeRect(20, 20, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40);
  ctx.strokeStyle = '#d09a2d';
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, CANVAS_WIDTH - 68, CANVAS_HEIGHT - 68);
  ctx.strokeStyle = '#e0bc62';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, CANVAS_WIDTH - 96, CANVAS_HEIGHT - 96);

  drawCornerOrnament(ctx, 100, 100, 1, 1);
  drawCornerOrnament(ctx, CANVAS_WIDTH - 100, 100, -1, 1);
  drawCornerOrnament(ctx, 100, CANVAS_HEIGHT - 100, 1, -1);
  drawCornerOrnament(ctx, CANVAS_WIDTH - 100, CANVAS_HEIGHT - 100, -1, -1);
}

function drawMedallion(ctx: CanvasRenderingContext2D, groomName: string, brideName: string, radius: number) {
  const cx = CANVAS_WIDTH / 2;
  const cy = QR_Y + QR_SIZE / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 14, 0, Math.PI * 2);
  ctx.fillStyle = '#9a6508';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
  ctx.strokeStyle = '#f5d879';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#fff9e9';
  ctx.fill();
  ctx.strokeStyle = '#b27b16';
  ctx.lineWidth = 3;
  ctx.stroke();

  const trimmedGroom = groomName.trim() || 'Groom';
  const trimmedBride = brideName.trim() || 'Bride';
  const longest = Math.max(trimmedGroom.length, trimmedBride.length);
  const nameSize = longest > 15 ? 31 : longest > 11 ? 38 : 45;
  ctx.fillStyle = '#80540b';
  ctx.textAlign = 'center';
  ctx.font = `italic ${nameSize}px Georgia, serif`;
  ctx.fillText(trimmedGroom, cx, cy - 27);
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText('&', cx, cy + 10);
  ctx.font = `italic ${nameSize}px Georgia, serif`;
  ctx.fillText(trimmedBride, cx, cy + 52);
  ctx.font = '31px Georgia, serif';
  ctx.fillText('❦', cx, cy - radius + 35);
  ctx.fillText('❦', cx, cy + radius - 19);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = '#79500a';
  ctx.textAlign = 'center';
  ctx.font = '20px Georgia, serif';
  ctx.fillText('SCAN TO VIEW OUR', CANVAS_WIDTH / 2, 1004);
  ctx.font = '31px Georgia, serif';
  ctx.fillText('WEDDING INVITATION', CANVAS_WIDTH / 2, 1047);
  ctx.font = '25px Georgia, serif';
  ctx.fillText('❦', CANVAS_WIDTH / 2, 1090);
  ctx.restore();
}

function decodeCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

/**
 * Builds the single locked Golden Classic presentation around a genuine QR
 * matrix. The finished image is decoded before returning it; a failed decode
 * is an error rather than a silently shared non-scannable QR.
 */
export async function createGoldenClassicQr({ url, groomName, brideName }: GoldenClassicQrInput): Promise<string> {
  if (!url) throw new Error('A public invitation URL is required for the QR code.');

  const matrix = document.createElement('canvas');
  await QRCode.toCanvas(matrix, url, {
    width: QR_SIZE,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#4a2a00', light: '#fffdf4' },
  });

  // Start with the largest visually safe medallion; reduce only when the
  // decoder proves that a particular QR version needs more visible modules.
  for (const radius of [88, 78, 68, 58, 48]) {
    const output = document.createElement('canvas');
    output.width = CANVAS_WIDTH;
    output.height = CANVAS_HEIGHT;
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Your browser could not render the QR canvas.');
    drawFrame(ctx);
    ctx.drawImage(matrix, QR_X, QR_Y, QR_SIZE, QR_SIZE);
    drawMedallion(ctx, groomName ?? '', brideName ?? '', radius);
    drawCaption(ctx);

    if (decodeCanvas(output) === url) return output.toDataURL('image/png');
  }

  throw new Error('The Golden Classic QR could not be verified as scannable for this URL.');
}
