"""
Generate pixel-art PNG sprites for Gravity Horizon using geometric primitives.
Draws at low resolution then scales up with nearest-neighbor for crisp pixel edges.
"""
from PIL import Image, ImageDraw
import os

OUT_DIR = 'assets/sprites'
os.makedirs(OUT_DIR, exist_ok=True)

def create_canvas(w, h):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)

def save_sprite(name, img, scale=2):
    if scale > 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    path = os.path.join(OUT_DIR, f'{name}.png')
    img.save(path)
    print(f'  {name}.png ({img.width}x{img.height})')
    return img

# =============================================================================
# PALETTES (RGBA tuples)
# =============================================================================

C_TRANSPARENT = (0, 0, 0, 0)

# Interceptor — green arrow fighter
I_D = (0, 60, 20, 255); I_S = (0, 110, 40, 255); I_B = (0, 180, 70, 255)
I_H = (80, 255, 130, 255); I_C = (200, 255, 220, 255); I_E = (0, 255, 255, 255)
I_G = (0, 220, 255, 255)

# Vanguard — blue heavy gunship
V_D = (0, 40, 80, 255); V_S = (0, 80, 150, 255); V_B = (0, 140, 220, 255)
V_H = (80, 200, 255, 255); V_C = (180, 235, 255, 255); V_E = (255, 255, 0, 255)
V_G = (0, 255, 255, 255)

# Spectre — purple stealth delta
S_D = (50, 0, 70, 255); S_S = (90, 0, 130, 255); S_B = (150, 0, 200, 255)
S_H = (210, 80, 255, 255); S_C = (240, 180, 255, 255); S_E = (255, 0, 255, 255)
S_G = (200, 0, 255, 255)

# Titan — orange bomber
T_D = (100, 50, 0, 255); T_S = (160, 80, 0, 255); T_B = (220, 120, 0, 255)
T_H = (255, 180, 40, 255); T_C = (255, 220, 150, 255); T_E = (255, 255, 0, 255)
T_G = (255, 200, 0, 255)

# Harbinger — dark purple organic
H_D = (40, 0, 50, 255); H_S = (80, 0, 100, 255); H_B = (140, 0, 170, 255)
H_H = (200, 40, 240, 255); H_C = (230, 130, 255, 255); H_E = (255, 100, 255, 255)
H_G = (180, 0, 255, 255)

# Aliens
AN_D = (120, 20, 20, 255); AN_S = (180, 40, 40, 255); AN_B = (240, 60, 60, 255)
AN_H = (255, 120, 120, 255); AN_E = (255, 255, 255, 255); AN_A = (255, 200, 0, 255)

AF_D = (20, 80, 120, 255); AF_S = (40, 140, 200, 255); AF_B = (60, 200, 255, 255)
AF_H = (150, 230, 255, 255); AF_E = (255, 255, 200, 255); AF_A = (0, 255, 255, 255)

AT_D = (40, 40, 40, 255); AT_S = (80, 80, 80, 255); AT_B = (140, 140, 140, 255)
AT_H = (200, 200, 200, 255); AT_E = (255, 50, 50, 255); AT_A = (255, 200, 50, 255)
AT_P = (160, 160, 160, 255)

# Bosses
BD_D = (80, 10, 10, 255); BD_S = (140, 20, 20, 255); BD_B = (200, 40, 40, 255)
BD_H = (255, 80, 80, 255); BD_E = (255, 255, 0, 255); BD_C = (255, 0, 0, 255)
BD_W = (200, 200, 200, 255); BD_G = (255, 100, 0, 255)

BC_D = (10, 80, 10, 255); BC_S = (20, 140, 20, 255); BC_B = (40, 200, 40, 255)
BC_H = (80, 255, 80, 255); BC_E = (200, 255, 200, 255); BC_C = (0, 255, 0, 255)
BC_W = (200, 200, 200, 255); BC_G = (0, 255, 100, 255)

BA_D = (60, 0, 100, 255); BA_S = (100, 0, 160, 255); BA_B = (160, 0, 220, 255)
BA_H = (220, 80, 255, 255); BA_E = (255, 255, 255, 255); BA_C = (255, 0, 255, 255)
BA_W = (180, 180, 180, 255); BA_G = (180, 0, 255, 255)

# Minion + UFO
M_D = (0, 100, 50, 255); M_S = (0, 160, 80, 255); M_B = (0, 220, 110, 255)
M_H = (100, 255, 160, 255); M_E = (255, 255, 200, 255); M_G = (0, 255, 200, 255)

U_D = (120, 0, 120, 255); U_S = (180, 0, 180, 255); U_B = (240, 0, 240, 255)
U_H = (255, 100, 255, 255); U_E = (255, 255, 0, 255); U_W = (255, 255, 255, 255)
U_G = (0, 255, 255, 255)

# =============================================================================
# HELPER: draw polygon with layers (dark -> shadow -> base -> highlight)
# =============================================================================

def draw_ship(draw, w, h, palette):
    """Generic ship body using palette dict with keys D,S,B,H,C,E,G"""
    D,S,B,H,C,E,G = palette['D'], palette['S'], palette['B'], palette['H'], palette['C'], palette['E'], palette['G']
    cx = w // 2
    # Base fuselage (triangle)
    draw.polygon([(cx, 0), (cx-3, h-4), (cx+3, h-4)], fill=B)
    # Shadow underbelly
    draw.polygon([(cx-3, h-4), (cx+3, h-4), (cx+2, h-2), (cx-2, h-2)], fill=S)
    # Highlight top ridge
    draw.polygon([(cx, 0), (cx-1, h-5), (cx+1, h-5)], fill=H)
    # Wings
    draw.polygon([(cx-3, h-6), (cx-8, h-2), (cx-3, h-3)], fill=B)
    draw.polygon([(cx+3, h-6), (cx+8, h-2), (cx+3, h-3)], fill=B)
    # Wing shadows
    draw.polygon([(cx-8, h-2), (cx-3, h-3), (cx-3, h-1)], fill=S)
    draw.polygon([(cx+8, h-2), (cx+3, h-3), (cx+3, h-1)], fill=S)
    # Cockpit
    draw.rectangle([cx-1, 3, cx+1, 6], fill=C)
    # Engine glow
    draw.rectangle([cx-2, h-2, cx-1, h-1], fill=G)
    draw.rectangle([cx+1, h-2, cx+2, h-1], fill=G)
    return

# =============================================================================
# PLAYER SHIPS — 20x12 logical → 40x24 output
# =============================================================================

print('Generating player ships...')

# Interceptor: sleek, swept wings, single central engine
img, d = create_canvas(20, 12)
d.polygon([(10,0),(7,8),(13,8)], fill=I_B)           # fuselage
d.polygon([(7,8),(13,8),(12,10),(8,10)], fill=I_S)   # shadow belly
d.polygon([(10,0),(8,7),(12,7)], fill=I_H)           # highlight ridge
d.polygon([(7,6),(2,11),(7,9)], fill=I_B)            # left wing
d.polygon([(13,6),(18,11),(13,9)], fill=I_B)         # right wing
d.polygon([(2,11),(7,9),(7,11)], fill=I_S)           # left wing shadow
d.polygon([(18,11),(13,9),(13,11)], fill=I_S)        # right wing shadow
d.rectangle([9,3,10,6], fill=I_C)                    # cockpit
d.rectangle([9,10,10,11], fill=I_G)                  # engine glow
d.point([10,1], fill=I_H)
save_sprite('ship_interceptor', img, 2)

# Vanguard: heavy, broad, twin engines, armored nose
img, d = create_canvas(20, 12)
d.polygon([(10,1),(6,9),(14,9)], fill=V_B)           # broad fuselage
d.polygon([(6,9),(14,9),(13,11),(7,11)], fill=V_S)   # belly shadow
d.polygon([(10,1),(8,8),(12,8)], fill=V_H)           # ridge
d.polygon([(6,7),(0,11),(6,10)], fill=V_B)           # wide left wing
d.polygon([(14,7),(20,11),(14,10)], fill=V_B)        # wide right wing
d.polygon([(0,11),(6,10),(6,11)], fill=V_S)
d.polygon([(20,11),(14,10),(14,11)], fill=V_S)
d.rectangle([8,3,11,6], fill=V_C)                    # wide cockpit
d.rectangle([7,10,8,11], fill=V_G)                   # left engine
d.rectangle([11,10,12,11], fill=V_G)                 # right engine
d.rectangle([9,3,10,4], fill=V_E)                    # nose sensor
save_sprite('ship_vanguard', img, 2)

# Spectre: stealth delta, dark, bat-wing, sharp angles
img, d = create_canvas(20, 12)
d.polygon([(10,1),(7,9),(13,9)], fill=S_B)
d.polygon([(7,9),(13,9),(12,11),(8,11)], fill=S_S)
d.polygon([(10,1),(8,8),(12,8)], fill=S_H)
# Bat wings: angled sharply back
pts_l = [(7,6),(1,10),(7,9),(5,7)]
pts_r = [(13,6),(19,10),(13,9),(15,7)]
d.polygon(pts_l, fill=S_B)
d.polygon(pts_r, fill=S_B)
d.polygon([(1,10),(7,9),(7,11)], fill=S_D)
d.polygon([(19,10),(13,9),(13,11)], fill=S_D)
d.rectangle([9,3,10,6], fill=S_C)
d.rectangle([9,10,10,11], fill=S_G)
d.point([10,0], fill=S_H)
save_sprite('ship_spectre', img, 2)

# Titan: bomber, bulky, large twin engine pods, bomb bay
img, d = create_canvas(20, 12)
# Thick fuselage
d.polygon([(10,1),(7,8),(13,8)], fill=T_B)
d.polygon([(7,8),(13,8),(12,10),(8,10)], fill=T_S)
d.polygon([(10,1),(8,7),(12,7)], fill=T_H)
# Large engine pods (rectangular)
d.rectangle([4,7,7,11], fill=T_B)
d.rectangle([13,7,16,11], fill=T_B)
d.rectangle([4,10,7,11], fill=T_D)
d.rectangle([13,10,16,11], fill=T_D)
# Connecting struts
d.rectangle([7,8,8,9], fill=T_S)
d.rectangle([12,8,13,9], fill=T_S)
# Cockpit
d.rectangle([9,3,10,6], fill=T_C)
# Bomb bay indicator
d.rectangle([9,7,10,8], fill=T_E)
# Engine glows
d.rectangle([5,10,6,11], fill=T_G)
d.rectangle([14,10,15,11], fill=T_G)
save_sprite('ship_titan', img, 2)

# Harbinger: organic, curved tendrils, asymmetric, core glow
img, d = create_canvas(20, 12)
# Curved body using multiple segments
d.polygon([(10,1),(7,8),(13,8)], fill=H_B)
d.polygon([(7,8),(13,8),(12,10),(8,10)], fill=H_S)
d.polygon([(10,1),(8,7),(12,7)], fill=H_H)
# Left tendril: curves outward and back
d.polygon([(7,5),(2,8),(5,10),(7,8)], fill=H_B)
d.polygon([(2,8),(5,10),(4,11),(1,9)], fill=H_S)
# Right tendril: shorter, curves up
pts_r = [(13,5),(17,7),(15,9),(13,8)]
d.polygon(pts_r, fill=H_B)
d.polygon([(17,7),(15,9),(16,10),(18,8)], fill=H_S)
# Core glow in center
d.rectangle([9,4,10,7], fill=H_G)
d.rectangle([8,5,11,6], fill=H_G)
# Organic eye/cockpit
d.rectangle([9,3,10,4], fill=H_C)
d.point([10,2], fill=H_H)
save_sprite('ship_harbinger', img, 2)

# =============================================================================
# ALIENS — 12x9 logical → 24x18 output
# =============================================================================

print('\nGenerating aliens...')

# Normal alien: classic invader shape
img, d = create_canvas(12, 9)
# Head dome
d.polygon([(6,1),(3,4),(9,4)], fill=AN_B)
d.polygon([(6,1),(4,4),(8,4)], fill=AN_H)
# Eyes
d.point([5,3], fill=AN_E)
d.point([7,3], fill=AN_E)
# Body
d.rectangle([3,4,8,6], fill=AN_B)
d.rectangle([4,4,7,5], fill=AN_H)
# Legs/tentacles
d.polygon([(3,6),(1,8),(3,7)], fill=AN_B)
d.polygon([(9,6),(11,8),(9,7)], fill=AN_B)
d.polygon([(5,6),(4,8),(5,7)], fill=AN_S)
d.polygon([(7,6),(8,8),(7,7)], fill=AN_S)
# Antennae
d.point([4,0], fill=AN_A)
d.point([8,0], fill=AN_A)
d.point([3,1], fill=AN_A)
d.point([9,1], fill=AN_A)
save_sprite('alien_normal', img, 2)

# Fast alien: streamlined, dart-like
img, d = create_canvas(12, 9)
# Sleek body
d.polygon([(6,1),(3,5),(9,5)], fill=AF_B)
d.polygon([(6,1),(4,5),(8,5)], fill=AF_H)
# Eyes (slanted)
d.point([5,3], fill=AF_E)
d.point([7,3], fill=AF_E)
d.point([4,4], fill=AF_E)
d.point([8,4], fill=AF_E)
# Tail fins
d.polygon([(3,5),(1,8),(3,7)], fill=AF_B)
d.polygon([(9,5),(11,8),(9,7)], fill=AF_B)
# Speed lines on body
d.point([5,5], fill=AF_A)
d.point([7,5], fill=AF_A)
d.point([6,6], fill=AF_A)
save_sprite('alien_fast', img, 2)

# Tank alien: armored beetle, wide, plates
img, d = create_canvas(12, 9)
# Heavy shell (rounded rect shape)
d.polygon([(2,2),(1,5),(11,5),(10,2)], fill=AT_B)
d.polygon([(2,2),(1,5),(3,5),(4,2)], fill=AT_H)
d.polygon([(10,2),(11,5),(9,5),(8,2)], fill=AT_H)
# Armor plates
d.rectangle([3,2,4,4], fill=AT_P)
d.rectangle([5,2,6,4], fill=AT_P)
d.rectangle([7,2,8,4], fill=AT_P)
# Angry eyes
d.point([3,3], fill=AT_E)
d.point([8,3], fill=AT_E)
# Heavy legs
d.rectangle([2,5,3,8], fill=AT_S)
d.rectangle([9,5,10,8], fill=AT_S)
d.rectangle([4,5,5,7], fill=AT_S)
d.rectangle([7,5,8,7], fill=AT_S)
# Mandibles
pts_l = [(2,2),(0,4),(2,3)]
pts_r = [(10,2),(12,4),(10,3)]
d.polygon(pts_l, fill=AT_A)
d.polygon(pts_r, fill=AT_A)
save_sprite('alien_tank', img, 2)

# =============================================================================
# BOSSES — 70x35 logical → 140x70 output
# =============================================================================

print('\nGenerating bosses...')

# Destroyer: aggressive wedge/arrowhead, forward-swept wings, red
img, d = create_canvas(70, 35)
cx = 35
# Main wedge body
d.polygon([(cx,0),(15,30),(55,30)], fill=BD_B)
d.polygon([(cx,0),(20,25),(50,25)], fill=BD_H)
# Shadow belly
d.polygon([(15,30),(55,30),(50,34),(20,34)], fill=BD_S)
# Forward-swept wing tips
d.polygon([(15,25),(5,15),(15,20)], fill=BD_B)
d.polygon([(55,25),(65,15),(55,20)], fill=BD_B)
d.polygon([(5,15),(15,20),(15,24)], fill=BD_S)
d.polygon([(65,15),(55,20),(55,24)], fill=BD_S)
# Core/cockpit area
d.ellipse([cx-6,8,cx+6,18], fill=BD_C)
d.ellipse([cx-4,10,cx+4,16], fill=BD_E)
# Weapon hardpoints
d.rectangle([20,28,24,32], fill=BD_W)
d.rectangle([46,28,50,32], fill=BD_W)
# Engine exhausts
d.rectangle([28,32,32,34], fill=BD_G)
d.rectangle([38,32,42,34], fill=BD_G)
# Detail lines
d.polygon([(cx,5),(cx-2,15),(cx+2,15)], fill=BD_H)
save_sprite('boss_destroyer', img, 2)

# Carrier: flat mothership, wide body, hangar bays
img, d = create_canvas(70, 35)
# Wide flat body
d.polygon([(10,8),(5,25),(65,25),(60,8)], fill=BC_B)
d.polygon([(10,8),(5,25),(15,25),(20,8)], fill=BC_H)
d.polygon([(60,8),(65,25),(55,25),(50,8)], fill=BC_H)
# Shadow underbelly
d.polygon([(5,25),(65,25),(62,30),(8,30)], fill=BC_S)
# Hangar bays (dark openings)
d.rectangle([20,15,30,22], fill=BC_D)
d.rectangle([40,15,50,22], fill=BC_D)
d.rectangle([22,17,28,20], fill=BC_E)
d.rectangle([42,17,48,20], fill=BC_E)
# Bridge/top structure
d.polygon([(30,5),(25,12),(45,12),(40,5)], fill=BC_H)
d.ellipse([33,7,37,11], fill=BC_C)
# Side pods
d.rectangle([3,18,8,26], fill=BC_B)
d.rectangle([62,18,67,26], fill=BC_B)
d.rectangle([3,24,8,26], fill=BC_D)
d.rectangle([62,24,67,26], fill=BC_D)
# Engine arrays
d.rectangle([15,30,20,34], fill=BC_G)
d.rectangle([25,30,30,34], fill=BC_G)
d.rectangle([40,30,45,34], fill=BC_G)
d.rectangle([50,30,55,34], fill=BC_G)
# Antenna
d.rectangle([34,0,36,5], fill=BC_W)
d.point([35,0], fill=BC_E)
save_sprite('boss_carrier', img, 2)

# Artillery: orb cannon, spherical center, barrel arrays
img, d = create_canvas(70, 35)
cx = 35
# Main spherical body
d.ellipse([cx-18,5,cx+18,30], fill=BA_B)
d.ellipse([cx-14,8,cx+14,22], fill=BA_H)
# Core orb
d.ellipse([cx-6,12,cx+6,22], fill=BA_C)
d.ellipse([cx-4,14,cx+4,20], fill=BA_E)
# Top cannon barrel
d.polygon([(cx-3,0),(cx-5,8),(cx+5,8),(cx+3,0)], fill=BA_W)
d.rectangle([cx-2,0,cx+2,4], fill=BA_G)
# Bottom cannon barrel
d.polygon([(cx-3,35),(cx-5,27),(cx+5,27),(cx+3,35)], fill=BA_W)
d.rectangle([cx-2,31,cx+2,35], fill=BA_G)
# Side cannons
d.polygon([(10,12),(18,15),(18,20),(10,23)], fill=BA_W)
d.polygon([(60,12),(52,15),(52,20),(60,23)], fill=BA_W)
d.rectangle([14,16,16,19], fill=BA_G)
d.rectangle([54,16,56,19], fill=BA_G)
# Mounting rings
d.arc([cx-20,3,cx+20,32], start=0, end=180, fill=BA_S)
d.arc([cx-20,3,cx+20,32], start=180, end=360, fill=BA_S)
# Energy conduits
d.rectangle([cx-12,18,cx-8,24], fill=BA_G)
d.rectangle([cx+8,18,cx+12,24], fill=BA_G)
save_sprite('boss_artillery', img, 2)

# =============================================================================
# MINION + UFO
# =============================================================================

print('\nGenerating minion + UFO...')

# Minion: small dart
img, d = create_canvas(10, 8)
d.polygon([(5,0),(2,5),(8,5)], fill=M_B)
d.polygon([(5,0),(3,4),(7,4)], fill=M_H)
d.polygon([(2,5),(8,5),(7,7),(3,7)], fill=M_S)
d.point([4,3], fill=M_E)
d.point([6,3], fill=M_E)
d.rectangle([4,6,5,7], fill=M_G)
save_sprite('minion', img, 2)

# UFO: flying saucer
img, d = create_canvas(24, 11)
# Dome
d.polygon([(12,1),(8,4),(16,4)], fill=U_H)
d.polygon([(12,1),(9,4),(15,4)], fill=U_W)
# Saucer body
d.polygon([(4,4),(2,7),(22,7),(20,4)], fill=U_B)
d.polygon([(4,4),(2,7),(8,7),(10,4)], fill=U_H)
d.polygon([(20,4),(22,7),(16,7),(14,4)], fill=U_H)
# Rim lights
d.point([5,6], fill=U_G)
d.point([9,6], fill=U_G)
d.point([12,6], fill=U_G)
d.point([15,6], fill=U_G)
d.point([19,6], fill=U_G)
# Shadow underside
d.polygon([(2,7),(22,7),(20,9),(4,9)], fill=U_S)
# Engine glow center
d.rectangle([11,8,12,10], fill=U_G)
save_sprite('ufo', img, 2)

print('\nDone! All sprites saved to', OUT_DIR)
