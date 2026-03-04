export const SOLAR_COLOR = '#facc15'; // yellow-400
export const GRID_COLOR  = '#38bdf8'; // sky-400
export const BATT_COLOR  = '#22c55e'; // green-500

/** Returns the canonical color for a source node based on its sourceType. */
export function canonicalSourceColor(sourceType: string | null | undefined, fallback?: string): string {
    switch (sourceType) {
        case 'solar':   return SOLAR_COLOR;
        case 'grid':    return GRID_COLOR;
        case 'battery': return BATT_COLOR;
        default:        return fallback ?? '#6b7280';
    }
}

/** Compute a blended sourceColor from the latest history bucket of a consumer node. */
export function computeSourceColor(node: { sourcePowerHistory?: { [sourceId: string]: { power: number; color: string } }[] }): string | undefined {
    const history = node.sourcePowerHistory;
    if (!history?.length) return undefined;
    const lastBucket = history[history.length - 1];
    const entries = Object.values(lastBucket).map(({ power, color }) => ({ hex: color, weight: power }));
    return entries.some(e => e.weight > 0) ? blendHex(entries) : undefined;
}

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
