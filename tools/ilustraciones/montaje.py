# Compone la ilustración de un jugador CLUTCH o PECHO FRÍO como su campeón, sin IA: su foto oficial de Leaguepedia
# (PNG con fondo transparente) delante del arte oficial del campeón (splash art), con acabado de pintura, el tono
# del rasgo (dorado o hielo), luz de contorno y partículas. Ver tools/ilustraciones/PLAN.md.
# Uso: python3 montaje.py foto.png splash.jpg salida.png clutch|choke cx cy zoom [luz] [alto]
import sys
import numpy as np, cv2
from PIL import Image, ImageFilter
foto, splash, out, kind = sys.argv[1:5]
cx, cy, zoom = float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])  # centro del recorte del campeón (0-1) y zoom
gain = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0  # más luz para artes muy oscuros
keep = float(sys.argv[9]) if len(sys.argv) > 9 else 1.0  # parte de arriba de la foto que se usa (para fotos de medio cuerpo)
S = 1200
rng = np.random.default_rng(7)
ice = kind == 'choke'
tint = np.array([150, 215, 255]) if ice else np.array([255, 205, 120])  # RGB

# --- fondo: el campeón, recortado y escalado
bg = Image.open(splash).convert('RGB')
W, H = bg.size
side = min(W, H) / zoom
x0 = int(np.clip(cx * W - side / 2, 0, W - side)); y0 = int(np.clip(cy * H - side / 2, 0, H - side))
bg = bg.crop((x0, y0, int(x0 + side), int(y0 + side))).resize((S, S), Image.LANCZOS)
b = np.clip(np.asarray(bg).astype(np.float32) / 255 * gain, 0, 1)
gray = b.mean(axis=2, keepdims=True)
if ice:  # frío: casi sin color, azulado y más oscuro
    b = (gray * 0.75 + b * 0.25) * (tint / 255) * 1.05
    b = b * 0.72
else:    # dorado y cálido
    b = (gray * 0.35 + b * 0.65) * (0.6 + 0.4 * tint / 255)
    b = b * 0.78
# viñeta y oscurecer abajo (ahí va el texto)
yy, xx = np.mgrid[0:S, 0:S] / S
vig = 1 - 0.55 * np.clip(np.hypot(xx - 0.5, (yy - 0.42) * 1.1) * 1.6 - 0.25, 0, 1)
b = b * vig[..., None]
b = b * (1 - 0.65 * np.clip((yy - 0.62) / 0.38, 0, 1))[..., None]
# niebla de luz detrás del jugador
glow = np.exp(-(((xx - 0.5) / 0.32) ** 2 + ((yy - 0.48) / 0.36) ** 2))
b = b + glow[..., None] * (tint / 255) * 0.28

# --- el jugador con acabado de pintura
ph = Image.open(foto).convert('RGBA')
bbox = ph.split()[3].getbbox(); ph = ph.crop(bbox)
ph = ph.crop((0, 0, ph.width, int(ph.height * keep)))
pw, phh = ph.size
scale = (S * 0.66) / phh  # alto del jugador: 66 % del cuadro
ph = ph.resize((int(pw * scale), int(phh * scale)), Image.LANCZOS)
rgb = np.asarray(ph.convert('RGB'))
alpha = np.asarray(ph.split()[3]).astype(np.float32) / 255
bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
soft = cv2.edgePreservingFilter(bgr, flags=1, sigma_s=50, sigma_r=0.28)  # pinceladas suaves
paint = cv2.stylization(bgr, sigma_s=40, sigma_r=0.25)
paint = cv2.cvtColor(paint, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
soft = cv2.cvtColor(soft, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
orig = rgb.astype(np.float32) / 255
p = soft * 0.55 + paint * 0.2 + orig * 0.25  # que siga pareciéndose a él
# luz del rasgo sobre el jugador (más en los bordes)
pg = p.mean(axis=2, keepdims=True)
p = p * 0.82 + (pg * tint / 255) * (0.28 if ice else 0.22)
edge = alpha - cv2.erode(alpha, np.ones((9, 9), np.uint8))
edge = cv2.GaussianBlur(edge, (0, 0), 6)
p = np.clip(p + edge[..., None] * (tint / 255) * 1.2, 0, 1)
# pegar: centrado y apoyado abajo
H2, W2 = alpha.shape
ox, oy = (S - W2) // 2, S - H2
canvas = b.copy()
def specks(img, n, mask=None):
    for _ in range(n):
        x, y = rng.uniform(0, S), rng.uniform(0, S * 0.9)
        if mask is not None and mask[int(y), int(x)] > 0.05: continue
        r = rng.uniform(1.2, 4.5) * (1.3 if rng.random() < 0.1 else 1)
        a = rng.uniform(0.25, 0.9)
        col = (np.array([1, 1, 1]) * 0.6 + tint / 255 * 0.4) * a + img[int(y), int(x)] * (1 - a)
        cv2.circle(img, (int(x), int(y)), int(r), tuple(float(v) for v in col), -1, lineType=cv2.LINE_AA)
specks(canvas, 200 if ice else 140)
# halo detrás del jugador
halo = np.zeros((S, S), np.float32); halo[oy:oy + H2, ox:ox + W2] = alpha
halo = cv2.GaussianBlur(halo, (0, 0), 28)
canvas = canvas + halo[..., None] * (tint / 255) * 0.55
region = canvas[oy:oy + H2, ox:ox + W2]
region[:] = region * (1 - alpha[..., None]) + p * alpha[..., None]
# el jugador también se funde abajo con la oscuridad
fade = np.clip((yy[oy:oy + H2, ox:ox + W2] - 0.80) / 0.2, 0, 1)
region[:] = region * (1 - 0.6 * fade[..., None])

# --- unas pocas partículas por delante, nunca sobre el jugador
full = np.zeros((S, S), np.float32); full[oy:oy + H2, ox:ox + W2] = alpha
specks(canvas, 60 if ice else 50, cv2.dilate(full, np.ones((25, 25), np.uint8)))
canvas = cv2.GaussianBlur(canvas, (0, 0), 0.6) * 0.25 + canvas * 0.75
# un poco de grano de pintura
canvas = np.clip(canvas + rng.normal(0, 0.012, canvas.shape), 0, 1)
Image.fromarray((canvas * 255).astype(np.uint8)).save(out)
print('ok', out)
