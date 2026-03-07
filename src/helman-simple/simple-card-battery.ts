import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { formatPower } from "../power-format";
import { BATT_COLOR, withAlpha } from "../color-utils";
import { simpleCardSharedStyles } from "./simple-card-shared-styles";

const BODY_TOP = 10;
const BODY_HEIGHT = 70;
const BODY_X = 4;
const BODY_WIDTH = 50;
const INNER_PAD = 3;

@customElement("simple-card-battery")
export class SimpleCardBattery extends LitElement {
    // Static styles
    static styles = [simpleCardSharedStyles, css`
        :host {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            width: fit-content;
        }
        .svg-wrapper {
            width: 50px;
            height: 50px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        svg {
            overflow: visible;
        }
        .battery-body {
            fill: none;
            stroke: var(--simple-card-neutral-stroke);
            stroke-width: 2.5;
            transition: stroke 0.6s;
        }
        .battery-body.active {
            animation: cover-pulse 1.8s ease-in-out infinite;
        }
        .battery-body.low {
            stroke: var(--simple-card-danger-color);
            animation: cover-low-pulse 1.2s ease-in-out infinite;
        }
        .battery-body.low-orange {
            stroke: var(--simple-card-warning-color);
            animation: cover-orange-pulse 1.2s ease-in-out infinite;
        }
        @keyframes cover-pulse {
            0%, 100% { filter: drop-shadow(0 0 3px var(--pulse-color, var(--simple-card-source-battery))); }
            50%       { filter: drop-shadow(0 0 10px var(--pulse-color, var(--simple-card-source-battery))) drop-shadow(0 0 18px var(--pulse-color-soft, var(--simple-card-source-battery-88))); }
        }
        @keyframes cover-low-pulse {
            0%, 100% { filter: drop-shadow(0 0 3px var(--simple-card-danger-color)); }
            50%       { filter: drop-shadow(0 0 10px var(--simple-card-danger-color)) drop-shadow(0 0 18px var(--simple-card-danger-color-88)); }
        }
        @keyframes cover-orange-pulse {
            0%, 100% { filter: drop-shadow(0 0 3px var(--simple-card-warning-color)); }
            50%       { filter: drop-shadow(0 0 10px var(--simple-card-warning-color)) drop-shadow(0 0 18px var(--simple-card-warning-color-88)); }
        }

        .battery-terminal {
            fill: var(--simple-card-neutral-stroke);
            transition: fill 0.6s;
        }
        .battery-terminal.active {
            animation: terminal-pulse 1.8s ease-in-out infinite;
        }
        .battery-terminal.low {
            fill: var(--simple-card-danger-color);
            animation: terminal-pulse 1.2s ease-in-out infinite;
        }
        .battery-terminal.low-orange {
            fill: var(--simple-card-warning-color);
            animation: terminal-pulse 1.2s ease-in-out infinite;
        }
        @keyframes terminal-pulse {
            0%, 100% { opacity: 0.8; }
            50%       { opacity: 1; }
        }

        /* Fill bar color: gray when idle at normal SoC, SoC-based when low or active */
        .fill-idle   { fill: var(--simple-card-neutral-stroke-soft); }
        .fill-green  { fill: var(--simple-card-source-battery); }
        .fill-orange { fill: var(--simple-card-warning-color); }
        .fill-red    { fill: var(--simple-card-danger-color); }
        /* Active pulse overlaid on color class when charging or discharging */
        .fill-active { animation: fill-pulse 1.8s ease-in-out infinite; }
        @keyframes fill-pulse {
            0%, 100% { opacity: 0.75; }
            50%       { opacity: 1; }
        }
        .soc-label {
            font-size: 1.8rem;
            font-weight: 700;
            fill: white;
            stroke: rgba(0,0,0,0.55);
            stroke-width: 6;
            paint-order: stroke fill;
            text-anchor: middle;
            letter-spacing: 0.02em;
        }
        .soc-percent {
            font-size: 1.2rem;
            font-weight: 600;
            opacity: 0.9;
        }
        .power-label.charge { color: var(--simple-card-source-battery); }
        .power-label.discharge { color: var(--simple-card-source-battery); }
    `];

    // Private properties
    private readonly _clipId = `batt-clip-${Math.random().toString(36).slice(2)}`;

    // Public properties
    @property({ type: Number }) public power = 0;
    @property({ type: Number }) public soc = 0;
    @property({ type: Number }) public minSoc = 10;
    /** When charging: color of the energy source (solar yellow, grid blue, or blended). */
    @property({ type: String }) public sourceColor?: string;
    /** When true: renders SVG at 40px and suppresses the power label (for use as an icon). */
    @property({ type: Boolean }) public compact = false;

    // Render method
    render() {
        const isCharging = this.power > 50;
        const isDischarging = this.power < -50;

        const socClamped = Math.max(0, Math.min(100, this.soc));
        const fillHeight = BODY_HEIGHT * socClamped / 100;
        const fillY = BODY_TOP + BODY_HEIGHT - fillHeight;

        // Cover: charge/discharge state takes priority; SoC warning only when idle
        const coverClass = (isCharging || isDischarging) ? 'active'
            : socClamped < this.minSoc ? 'low'
            : socClamped < this.minSoc + 10 ? 'low-orange'
            : '';

        // Glow color: charging uses sourceColor (e.g. solar yellow), discharging uses battery source green
        const pulseColor = isCharging ? (this.sourceColor ?? BATT_COLOR) : isDischarging ? BATT_COLOR : null;
        const pulseColorSoft = pulseColor ? withAlpha(pulseColor, '88') : null;

        // Fill bar: dark gray when idle at normal SoC; SoC color when low or active
        const fillColorClass = socClamped < this.minSoc ? 'fill-red' : socClamped < this.minSoc + 10 ? 'fill-orange' : 'fill-green';
        const fillClass = (isCharging || isDischarging)
            ? `${fillColorClass} fill-active`
            : (socClamped < 30 ? fillColorClass : 'fill-idle');

        const powerClass = isCharging ? 'charge' : isDischarging ? 'discharge' : '';

        const absPower = Math.abs(this.power);
        const { value, unit } = formatPower(absPower);

        const innerX = BODY_X + INNER_PAD;
        const innerWidth = BODY_WIDTH - INNER_PAD * 2;
        const innerFillY = Math.max(fillY, BODY_TOP + INNER_PAD);
        const innerFillHeight = Math.max(0, fillY + fillHeight - innerFillY - INNER_PAD);

        const svgSize = this.compact ? 40 : 50;
        return html`
            <div class="svg-wrapper" style="${this.compact ? 'width:40px;height:40px;' : ''}">
                <svg viewBox="-10 -15 77 112"
                     width="${svgSize}" height="${svgSize}"
                     xmlns="http://www.w3.org/2000/svg">
                    <!-- Terminal cap -->
                    <rect class="battery-terminal ${coverClass}"
                        x="${BODY_X + BODY_WIDTH / 2 - 8}" y="2" width="16" height="7" rx="3"
                        style="${pulseColor ? `fill: ${pulseColor};` : ''}"/>

                    <!-- Battery body outline -->
                    <rect class="battery-body ${coverClass}"
                        x="${BODY_X}" y="${BODY_TOP}"
                        width="${BODY_WIDTH}" height="${BODY_HEIGHT}" rx="5"
                        style="${pulseColor ? `stroke: ${pulseColor}; --pulse-color: ${pulseColor}; --pulse-color-soft: ${pulseColorSoft};` : ''}"/>

                    <!-- Fill level -->
                    <clipPath id="${this._clipId}">
                        <rect x="${innerX}" y="${BODY_TOP + INNER_PAD}"
                              width="${innerWidth}" height="${BODY_HEIGHT - INNER_PAD * 2}" rx="3"/>
                    </clipPath>
                    <rect class="${fillClass}"
                        x="${innerX}" y="${innerFillY}"
                        width="${innerWidth}" height="${innerFillHeight}" rx="2"
                        clip-path="url(#${this._clipId})"/>

                    <!-- SoC percentage inside -->
                    <text class="soc-label"
                        dominant-baseline="middle">
                        <tspan x="${2+ BODY_X + BODY_WIDTH / 2}" y="43">${socClamped.toFixed(0)}</tspan>
                        <tspan x="${2+BODY_X + BODY_WIDTH / 2}" y="64" class="soc-percent">%</tspan>
                    </text>
                </svg>
            </div>
            ${this.compact ? '' : html`
            <div class="power-label ${powerClass}">
                ${isCharging ? html`↑ ${value} <span class="unit">${unit}</span>`
                    : isDischarging ? html`↓ ${value} <span class="unit">${unit}</span>`
                    : html`${value} <span class="unit">${unit}</span>`}
            </div>`}
        `;
    }
}
