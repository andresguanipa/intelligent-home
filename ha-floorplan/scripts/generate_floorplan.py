#!/usr/bin/env python3
"""Genera el mapa 3D isométrico (casa_base.png + capas *_on.png) del "Plan 4".

Las coordenadas están en píxeles del plano original (captura de 923 px de ancho,
~18.6 px por pie). Origen: esquina superior izquierda de la casa.

Uso:  python3 scripts/generate_floorplan.py [carpeta-salida]
Requiere Pillow. Salida: casa_base.png, sala_on.png, cocina_on.png,
dormitorio_on.png, transparente.png (1920x1200, RGBA) y positions.txt con los
porcentajes top/left para los iconos del dashboard.
"""
import math
import os
import sys
from functools import cmp_to_key

from PIL import Image, ImageChops, ImageDraw, ImageFilter

W_OUT, H_OUT = 1920, 1200
SS = 2                      # supermuestreo para suavizar bordes
K = 1.42                    # escala plano → pantalla
OX, OY = 12, 714            # origen del plano (esquina de la casa)
COS30, SIN30 = math.cos(math.radians(30)), 0.5
T = 7                       # grosor de muros


def proj(x, y, z=0):
    """Plano (px) → píxeles de la imagen final (sin supermuestreo)."""
    x -= OX
    y -= OY
    # Centrado: el ancho proyectado va de -448*cos30 a 880*cos30
    sx = (x - y) * COS30 * K + W_OUT / 2 - (880 - 448) / 2 * COS30 * K
    sy = (x + y) * SIN30 * K - z * K + 210
    return sx, sy


def P(x, y, z=0):
    sx, sy = proj(x, y, z)
    return sx * SS, sy * SS


# ----------------------------------------------------------------------------
#  Habitaciones (suelos)
# ----------------------------------------------------------------------------
FLOORS = {
    "sala": ([(20, 722), (245, 722), (245, 890), (430, 890), (430, 955), (362, 955),
              (362, 1033), (345, 1033), (345, 1155), (138, 1155), (138, 1047), (20, 1047)],
             (60, 64, 84)),
    "cocina": ([(245, 722), (430, 722), (430, 890), (245, 890)], (64, 68, 80)),
    "dormitorio2": ([(432, 722), (642, 722), (642, 940), (432, 940)], (68, 62, 82)),
    "suite": ([(642, 722), (888, 722), (888, 955), (642, 955)], (72, 64, 86)),
    "vestidor": ([(782, 955), (888, 955), (888, 1033), (782, 1033)], (66, 60, 78)),
    "pasillo": ([(362, 955), (432, 955), (432, 940), (642, 940), (642, 955), (782, 955), (782, 1033), (362, 1033)], (54, 56, 72)),
    "bano2": ([(345, 1033), (497, 1033), (497, 1155), (345, 1155)], (56, 76, 88)),
    "lavanderia": ([(497, 1033), (635, 1033), (635, 1155), (497, 1155)], (60, 64, 76)),
    "bano_suite": ([(635, 1033), (888, 1033), (888, 1155), (635, 1155)], (56, 76, 88)),
    "entrada": ([(16, 1047), (138, 1047), (138, 1155), (16, 1155)], (70, 62, 56)),
}

# Polígonos de las capas de luz → archivo
LIGHTS = {
    "sala_on.png": "sala",
    "cocina_on.png": "cocina",
    "dormitorio_on.png": "suite",
}

# ----------------------------------------------------------------------------
#  Muros: (x1, y1, x2, y2, altura, [huecos (puertas) a lo largo del eje])
# ----------------------------------------------------------------------------
H_FAR, H_IN, H_NEAR = 72, 50, 14
WALLS = [
    # Exterior: lejanos (arriba/izquierda) altos, cercanos (abajo/derecha) bajos
    (14, 718, 890, 718, H_FAR, []),
    (16, 718, 16, 1158, H_FAR, []),
    (14, 1158, 890, 1158, H_NEAR, []),
    (888, 718, 888, 1158, H_NEAR, []),
    # Cocina/sala | dormitorio 2 y suite
    (432, 718, 432, 955, H_IN, []),
    (642, 718, 642, 955, H_IN, []),
    # Dormitorio 2 hacia el pasillo (puerta)
    (432, 940, 642, 940, H_IN, [(588, 636)]),
    # Suite hacia el pasillo (puerta)
    (642, 955, 782, 955, H_IN, [(655, 706)]),
    # Vestidor
    (782, 955, 782, 1033, H_IN, []),
    # Pasillo: norte (bajo la nevera) y calentador
    (362, 955, 435, 955, H_IN, []),
    (490, 915, 490, 955, H_IN, []),
    # Baño 2 / lavandería / baño principal (lado pasillo, con puertas)
    (345, 1033, 497, 1033, H_IN, [(445, 495)]),
    (497, 1033, 635, 1033, H_IN, [(515, 570)]),
    (635, 1033, 888, 1033, H_IN, [(645, 692)]),
    (345, 1033, 345, 1158, H_IN, []),
    (497, 1033, 497, 1158, H_IN, []),
    (635, 1033, 635, 1158, H_IN, []),
    # Closet y entrada (recuadro sin etiqueta)
    (22, 1047, 138, 1047, H_IN, [(70, 125)]),
    (138, 1047, 138, 1158, H_IN, []),
    (68, 962, 68, 1047, H_IN, []),
]

# Muebles: (x0, y0, x1, y1, altura, color superior)
FURNITURE = [
    # Cocina
    (232, 832, 298, 955, 30, (150, 128, 112)),        # isla
    (245, 722, 412, 762, 32, (118, 106, 98)),         # encimera norte
    (392, 722, 430, 890, 32, (118, 106, 98)),         # encimera este
    (372, 892, 430, 935, 40, (170, 172, 180)),        # nevera
    # Sala
    (70, 880, 190, 935, 22, (96, 104, 150)),          # sofá
    (95, 950, 165, 990, 10, (120, 98, 80)),           # mesa de centro
    # Dormitorio 2
    (452, 735, 585, 860, 14, (110, 130, 170)),        # cama
    (495, 915, 575, 942, 22, (120, 100, 84)),         # cómoda
    # Suite
    (700, 735, 830, 860, 14, (150, 130, 188)),        # cama
    (665, 735, 692, 765, 14, (120, 100, 84)),         # mesita
    # Baño 2
    (348, 1040, 390, 1152, 14, (170, 205, 225)),      # bañera
    (445, 1122, 495, 1155, 22, (168, 178, 188)),      # lavabo
    (408, 1105, 436, 1140, 16, (200, 205, 212)),      # inodoro
    # Lavandería
    (575, 1098, 630, 1152, 24, (205, 210, 218)),      # lavadora/secadora
    # Baño principal
    (828, 1040, 886, 1152, 8, (150, 195, 215)),       # ducha
    (698, 1125, 822, 1155, 22, (168, 178, 188)),      # doble lavabo
    (650, 1105, 680, 1140, 16, (200, 205, 212)),      # inodoro
]

# Colores de muros (cara superior, cara +x, cara +y)
WALL_TOP, WALL_RX, WALL_RY = (206, 211, 224), (150, 156, 172), (178, 184, 200)


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


class Box:
    def __init__(self, x0, y0, x1, y1, h, top, rx=None, ry=None, wall=False):
        self.x0, self.y0, self.x1, self.y1, self.h = x0, y0, x1, y1, h
        self.top = top
        self.rx = rx or shade(top, 0.72)
        self.ry = ry or shade(top, 0.85)
        self.wall = wall

    def draw(self, d):
        x0, y0, x1, y1, h = self.x0, self.y0, self.x1, self.y1, self.h
        # cara +x (derecha-abajo en pantalla)
        d.polygon([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)], fill=self.rx)
        # cara +y (izquierda-abajo)
        d.polygon([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)], fill=self.ry)
        # tapa
        d.polygon([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], fill=self.top)
        if self.wall:  # filo claro en la tapa
            d.line([P(x0, y1, h), P(x1, y1, h), P(x1, y0, h)], fill=(232, 236, 245), width=SS)


def wall_boxes():
    boxes = []
    for x1, y1, x2, y2, h, gaps in WALLS:
        horiz = y1 == y2
        a, b = (x1, x2) if horiz else (y1, y2)
        cuts = [a]
        for g0, g1 in sorted(gaps):
            cuts += [g0, g1]
        cuts.append(b)
        spans = [(cuts[i], cuts[i + 1]) for i in range(0, len(cuts), 2)]
        for s0, s1 in spans:
            n = max(1, math.ceil((s1 - s0) / 34))
            step = (s1 - s0) / n
            for i in range(n):
                p0, p1 = s0 + i * step, s0 + (i + 1) * step
                if horiz:
                    boxes.append(Box(p0, y1 - T / 2, p1, y1 + T / 2, h, WALL_TOP, WALL_RX, WALL_RY, True))
                else:
                    boxes.append(Box(x1 - T / 2, p0, x1 + T / 2, p1, h, WALL_TOP, WALL_RX, WALL_RY, True))
    return boxes


def order(boxes):
    """Orden de pintado (lejos → cerca) por separación en x/y y desempate por profundidad."""
    n = len(boxes)
    before = [set() for _ in range(n)]
    eps = 0.01
    for i in range(n):
        a = boxes[i]
        for j in range(i + 1, n):
            b = boxes[j]
            a_x, b_x = a.x1 <= b.x0 + eps, b.x1 <= a.x0 + eps
            a_y, b_y = a.y1 <= b.y0 + eps, b.y1 <= a.y0 + eps
            ab = a_x or a_y
            ba = b_x or b_y
            if ab and not ba:
                before[j].add(i)
            elif ba and not ab:
                before[i].add(j)
    depth = [(b.x0 + b.x1 + b.y0 + b.y1) for b in boxes]
    done, result, remaining = set(), [], set(range(n))
    while remaining:
        ready = [i for i in remaining if before[i] <= done]
        if not ready:                      # ciclo: rompe por profundidad
            ready = list(remaining)
        i = min(ready, key=lambda k: depth[k])
        result.append(i)
        done.add(i)
        remaining.discard(i)
    return [boxes[i] for i in result]


def poly(pts, z=0):
    return [P(x, y, z) for x, y in pts]


def floor_layer(img):
    d = ImageDraw.Draw(img)
    for name, (pts, col) in FLOORS.items():
        d.polygon(poly(pts), fill=col + (255,))
    # Rejilla de baldosas muy sutil
    grid = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for gx in range(0, 900, 24):
        gd.line([P(OX + gx, OY), P(OX + gx, OY + 450)], fill=(255, 255, 255, 14), width=SS)
    for gy in range(0, 460, 24):
        gd.line([P(OX, OY + gy), P(OX + 890, OY + gy)], fill=(255, 255, 255, 14), width=SS)
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    for pts, _ in FLOORS.values():
        md.polygon(poly(pts), fill=255)
    img.paste(Image.composite(grid, Image.new("RGBA", img.size, (0, 0, 0, 0)), mask), (0, 0),
              Image.composite(grid, Image.new("RGBA", img.size, (0, 0, 0, 0)), mask))


def render_base():
    size = (W_OUT * SS, H_OUT * SS)
    img = Image.new("RGBA", size, (0, 0, 0, 0))

    # Sombra suave bajo la casa
    shadow = Image.new("L", size, 0)
    outline = [(14, 718), (890, 718), (890, 1158), (14, 1158)]
    ImageDraw.Draw(shadow).polygon([(x + 12 * SS, y + 26 * SS) for x, y in poly(outline)], fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(22 * SS))
    img.paste(Image.new("RGBA", size, (0, 0, 0, 255)), (0, 0), shadow)

    floor_layer(img)
    d = ImageDraw.Draw(img)
    objs = wall_boxes() + [Box(*f[:5], f[5]) for f in FURNITURE]
    for b in order(objs):
        b.draw(d)
    return img.resize((W_OUT, H_OUT), Image.LANCZOS)


def render_light(room, color=(255, 196, 92)):
    size = (W_OUT * SS, H_OUT * SS)
    pts, _ = FLOORS[room]
    pp = poly(pts)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(pp, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(6 * SS))
    xs, ys = [p[0] for p in pp], [p[1] for p in pp]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) * 0.62, (max(ys) - min(ys)) * 0.62
    # Gradiente radial elíptico: centro intenso → borde suave
    grad = Image.new("L", size, 0)
    gd = ImageDraw.Draw(grad)
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        a = int(200 * (1 - t) ** 1.4 + 55)
        gd.ellipse([cx - rx * (1 - t), cy - ry * (1 - t), cx + rx * (1 - t), cy + ry * (1 - t)], fill=a)
    # Base de brillo uniforme tenue + gradiente
    alpha = ImageChops.multiply(grad, mask)
    layer = Image.new("RGBA", size, color + (0,))
    layer.putalpha(alpha)
    return layer.resize((W_OUT, H_OUT), Image.LANCZOS)


def pct(x, y, z=0):
    sx, sy = proj(x, y, z)
    return round(sy / H_OUT * 100, 1), round(sx / W_OUT * 100, 1)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "config", "www", "floorplan")
    os.makedirs(out, exist_ok=True)
    render_base().save(os.path.join(out, "casa_base.png"))
    for fname, room in LIGHTS.items():
        render_light(room).save(os.path.join(out, fname))
    Image.new("RGBA", (W_OUT, H_OUT), (0, 0, 0, 0)).save(os.path.join(out, "transparente.png"))

    icons = {
        "light.sala": (130, 880), "light.cocina": (340, 830), "light.dormitorio": (765, 880),
        "doorbell (entrada, supuesta)": (60, 1160),
    }
    with open(os.path.join(out, "positions.txt"), "w") as f:
        for name, (x, y) in icons.items():
            top, left = pct(x, y, 22)
            f.write(f"{name}: top: {top}%  left: {left}%\n")
    print(open(os.path.join(out, "positions.txt")).read())


if __name__ == "__main__":
    main()
