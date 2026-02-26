import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { formatPower } from "./power-format";

const BODY_TOP = 10;
const BODY_HEIGHT = 70;
const BODY_X = 4;
const BODY_WIDTH = 50;
const INNER_PAD = 3;

@customElement("simple-card-battery")
export class SimpleCardBattery extends LitElement {
    // Static styles
    static styles = css`
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
            stroke: #6b7280;
            stroke-width: 2.5;
            transition: stroke 0.6s;
        }
        .battery-body.active-charge {
            stroke: #22c55e;
            filter: drop-shadow(0 0 6px #22c55e88);
        }
        .battery-body.active-discharge {
            stroke: #f59e0b;
            filter: drop-shadow(0 0 6px #f59e0b88);
        }
        .battery-body.low {
            stroke: #ef4444;
            filter: drop-shadow(0 0 6px #ef444488);
        }
        .battery-terminal {
            fill: #6b7280;
            transition: fill 0.6s;
        }
        .battery-terminal.active-charge { fill: #22c55e; }
        .battery-terminal.active-discharge { fill: #f59e0b; }
        .battery-terminal.low { fill: #ef4444; }

        .fill-charging {
            fill: #22c55e;
            animation: charge-pulse 1.8s ease-in-out infinite;
        }
        .fill-discharging {
            fill: #f59e0b;
            animation: discharge-pulse 1.8s ease-in-out infinite;
        }
        .fill-low {
            fill: #ef4444;
            animation: discharge-pulse 1.2s ease-in-out infinite;
        }
        .fill-idle {
            fill: #4b5563;
        }
        @keyframes charge-pulse {
            0%, 100% { opacity: 0.75; }
            50% { opacity: 1; filter: drop-shadow(0 0 4px #4ade8088); }
        }
        @keyframes discharge-pulse {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; filter: drop-shadow(0 0 4px #fbbf2488); }
        }

        .soc-label {
            font-size: 1.125rem;
            font-weight: 700;
            fill: white;
            text-anchor: middle;
            letter-spacing: 0.02em;
        }
        .power-label {
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--primary-text-color);
            min-height: 1.1em;
            text-align: center;
            line-height: 1.3;
        }
        .power-label.charge { color: #22c55e; }
        .power-label.discharge { color: #f59e0b; }
        .power-label.low { color: #ef4444; }
        .unit {
            font-size: 0.7em;
            font-weight: 400;
            opacity: 0.8;
        }
    `;

    // Public properties
    @property({ type: Number }) public power = 0;
    @property({ type: Number }) public soc = 0;
    @property({ type: Number }) public minSoc = 10;

    // Render method
    render() {
        const isCharging = this.power > 5;
        const isDischarging = this.power < -5;
        const isLow = this.soc <= 20 && !isCharging;
        const isActive = isCharging || isDischarging;

        const socClamped = Math.max(0, Math.min(100, this.soc));
        const fillHeight = BODY_HEIGHT * socClamped / 100;
        const fillY = BODY_TOP + BODY_HEIGHT - fillHeight;

        const bodyStateClass = isLow ? 'low' : isCharging ? 'active-charge' : isDischarging ? 'active-discharge' : '';
        const fillClass = isLow ? 'fill-low' : isCharging ? 'fill-charging' : isDischarging ? 'fill-discharging' : 'fill-idle';
        const powerClass = isLow ? 'low' : isCharging ? 'charge' : 'discharge';

        const absPower = Math.abs(this.power);
        const { value, unit } = formatPower(absPower);

        const innerX = BODY_X + INNER_PAD;
        const innerWidth = BODY_WIDTH - INNER_PAD * 2;
        const innerFillY = Math.max(fillY, BODY_TOP + INNER_PAD);
        const innerFillHeight = Math.max(0, fillY + fillHeight - innerFillY - INNER_PAD);

        return html`
            <div class="svg-wrapper">
                <svg viewBox="-10 -15 77 112"
                     width="50" height="50"
                     xmlns="http://www.w3.org/2000/svg">
                    <!-- Terminal cap -->
                    <rect class="battery-terminal ${bodyStateClass}"
                        x="${BODY_X + BODY_WIDTH / 2 - 8}" y="2" width="16" height="7" rx="3"/>

                    <!-- Battery body outline -->
                    <rect class="battery-body ${bodyStateClass}"
                        x="${BODY_X}" y="${BODY_TOP}"
                        width="${BODY_WIDTH}" height="${BODY_HEIGHT}" rx="5"/>

                    <!-- Fill level -->
                    <clipPath id="battery-clip">
                        <rect x="${innerX}" y="${BODY_TOP + INNER_PAD}"
                              width="${innerWidth}" height="${BODY_HEIGHT - INNER_PAD * 2}" rx="3"/>
                    </clipPath>
                    <rect class="${fillClass}"
                        x="${innerX}" y="${innerFillY}"
                        width="${innerWidth}" height="${innerFillHeight}" rx="2"
                        clip-path="url(#battery-clip)"/>

                    <!-- SoC percentage inside -->
                    <text class="soc-label"
                        x="${BODY_X + BODY_WIDTH / 2}"
                        y="${BODY_TOP + BODY_HEIGHT / 2}"
                        dy="0.35em">
                        ${socClamped.toFixed(0)}%
                    </text>
                </svg>
            </div>
            <div class="power-label ${isActive ? powerClass : ''}">
                ${isActive
                    ? html`${isCharging ? '↑' : '↓'} ${value} <span class="unit">${unit}</span>`
                    : html`—`}
            </div>
        `;
    }
}
