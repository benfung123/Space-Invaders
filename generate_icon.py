from PIL import Image, ImageDraw

# Pixel-art ship design (11x9 grid)
SHIP_PIXELS = [
    ".....X.....",
    "....XXX....",
    "...XX.XX...",
    "..XX...XX..",
    ".XXXXXXXXX.",
    "XXXXX.XXXXX",
    "..XX...XX..",
    ".XX.....XX.",
    "XX.......XX",
]

def draw_pixel_icon(size, bg_color=(5, 5, 5), ship_color=(0, 255, 0), glow_color=(0, 200, 0)):
    img = Image.new('RGBA', (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    
    pixel_size = size // 16
    grid_w = len(SHIP_PIXELS[0])
    grid_h = len(SHIP_PIXELS)
    
    offset_x = (size - grid_w * pixel_size) // 2
    offset_y = (size - grid_h * pixel_size) // 2
    
    # Draw glow behind ship
    for y, row in enumerate(SHIP_PIXELS):
        for x, ch in enumerate(row):
            if ch == 'X':
                gx = offset_x + x * pixel_size
                gy = offset_y + y * pixel_size
                draw.rectangle([gx-1, gy-1, gx+pixel_size+1, gy+pixel_size+1], fill=glow_color+(120,))
    
    # Draw ship pixels
    for y, row in enumerate(SHIP_PIXELS):
        for x, ch in enumerate(row):
            if ch == 'X':
                px = offset_x + x * pixel_size
                py = offset_y + y * pixel_size
                draw.rectangle([px, py, px+pixel_size-1, py+pixel_size-1], fill=ship_color)
    
    return img

def save_icons():
    sizes = {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192,
    }
    
    import os
    base = 'android/app/src/main/res'
    
    for name, size in sizes.items():
        folder = f'{base}/mipmap-{name}'
        os.makedirs(folder, exist_ok=True)
        icon = draw_pixel_icon(size)
        icon.save(f'{folder}/ic_launcher.png', 'PNG')
        print(f'Saved {name}: {size}x{size}')
    
    # Also save a high-res version for adaptive icon foreground
    folder = f'{base}/mipmap-xxxhdpi'
    fg = draw_pixel_icon(192)
    fg.save(f'{folder}/ic_launcher_foreground.png', 'PNG')
    print('Saved adaptive foreground: 192x192')
    
    # Adaptive background (solid black)
    bg = Image.new('RGBA', (192, 192), (5, 5, 5, 255))
    bg.save(f'{folder}/ic_launcher_background.png', 'PNG')
    print('Saved adaptive background: 192x192')
    
    # Also save a 512x512 version for Play Store
    store_icon = draw_pixel_icon(512)
    store_icon.save('assets/icon-512.png', 'PNG')
    print('Saved Play Store icon: 512x512')

if __name__ == '__main__':
    save_icons()
