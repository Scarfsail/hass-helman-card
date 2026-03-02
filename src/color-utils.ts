/** Weighted RGB average of hex color values. Returns gray if no active inputs. */
export function blendHex(colors: { hex: string; weight: number }[]): string {
    const active = colors.filter(c => c.weight > 0);
    if (active.length === 0) return '#6b7280';
    if (active.length === 1) return active[0].hex;
    const total = active.reduce((s, c) => s + c.weight, 0);
    let r = 0, g = 0, b = 0;
    for (const { hex, weight } of active) {
        const n = parseInt(hex.slice(1), 16);
        r += ((n >> 16) & 0xff) * weight / total;
        g += ((n >> 8)  & 0xff) * weight / total;
        b += (n         & 0xff) * weight / total;
    }
    return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
