import { LitElement, css, html, svg } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { formatPower } from "../power-format";

@customElement("simple-card-house")
export class SimpleCardHouse extends LitElement {
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
            display: flex;
            align-items: center;
            justify-content: center;
        }
        svg { overflow: hidden; }

        .house-body {
            fill: #374151;
            stroke: #6b7280;
            stroke-width: 2;
            transition: fill 0.6s, stroke 0.6s;
        }
        .house-body.active {
            fill: #4b5563;
            stroke: #fde68a;
            filter: drop-shadow(0 0 8px #fde68a44);
        }
        .roof {
            fill: #4b5563;
            stroke: #6b7280;
            stroke-width: 2;
            stroke-linejoin: round;
            transition: fill 0.6s, stroke 0.6s;
        }
        .roof.active {
            fill: #6b7280;
            stroke: #fde68a;
        }
        .door {
            fill: #1f2937;
            stroke: #6b7280;
            stroke-width: 1.5;
        }
        .door.active {
            fill: #2d3748;
            stroke: #fde68a88;
        }
        .window {
            fill: #1f2937;
            stroke: #4b5563;
            stroke-width: 1;
            transition: fill 0.6s, filter 0.6s;
        }
        .window.active {
            fill: var(--window-color, #fef08a);
            animation: window-glow 2.4s ease-in-out infinite;
        }
        @keyframes window-glow {
            0%, 100% { filter: drop-shadow(0 0 4px var(--window-color, #fef08a)); opacity: 0.85; }
            50%       { filter: drop-shadow(0 0 10px var(--window-color, #fef08a)); opacity: 1; }
        }
        .chimney {
            fill: #4b5563;
            stroke: #6b7280;
            stroke-width: 1.5;
        }

        .power-label {
            font-size: 0.78rem;
            font-weight: 700;
            color: #6b7280;
            min-height: 1.1em;
            text-align: center;
            line-height: 1.3;
        }
        .power-label.active { color: #fde68a; }
        .unit { font-size: 0.7em; font-weight: 400; opacity: 0.8; }
    `;

    // Public properties
    @property({ type: Number }) public power = 0;
    /** Blended source color based on power ratios from solar/grid/battery. */
    @property({ type: String }) public sourceColor?: string;
    /** When true: renders SVG at 40px and suppresses the power label (for use as an icon). */
    @property({ type: Boolean }) public compact = false;

    // Render method
    render() {
        const active = this.power > 50;
        const { value, unit } = formatPower(this.power);
        const borderColor = (active && this.sourceColor) ? this.sourceColor : undefined;
        const svgSize = this.compact ? 40 : 50;

        return html`
            <div class="svg-wrapper" style="${this.compact ? 'width:40px;height:40px;' : ''}">
                <svg viewBox="-15 -14 110 110" width="${svgSize}" height="${svgSize}" xmlns="http://www.w3.org/2000/svg"
                     style="${borderColor ? `--window-color: ${borderColor}` : ''}">
                    ${this._renderHouse(active, borderColor)}
                </svg>
            </div>
            ${this.compact ? '' : html`
            <div class="power-label ${active ? 'active' : ''}"
                 style="${borderColor ? `color: ${borderColor}` : ''}">
                ${value} <span class="unit">${unit}</span>
            </div>`}
        `;
    }

    // Private helper methods
    private _renderHouse(active: boolean, borderColor?: string) {
        const a = active ? 'active' : '';
        // Dynamic border styles when we have a source color
        const bodyStyle = (active && borderColor)
            ? `stroke: ${borderColor}; filter: drop-shadow(0 0 8px ${borderColor}44)`
            : '';
        const roofStyle = (active && borderColor) ? `stroke: ${borderColor}` : '';
        const doorStyle = (active && borderColor) ? `stroke: ${borderColor}88` : '';
        const crossColor = active ? (borderColor ? `${borderColor}66` : '#fde68a66') : '#374151';
        const knobColor  = active ? (borderColor ? `${borderColor}88` : '#fde68a88') : '#4b5563';
        return svg`
            <!-- Chimney -->
            <rect class="chimney" x="52" y="15" width="7" height="16" rx="1.5"/>

            <!-- Roof -->
            <polygon class="roof ${a}" style="${roofStyle}" points="40,6 73,36 7,36"/>

            <!-- House body -->
            <rect class="house-body ${a}" style="${bodyStyle}" x="13" y="35" width="54" height="41" rx="2"/>

            <!-- Left window -->
            <rect class="window ${a}" x="19" y="42" width="15" height="13" rx="2"/>
            <line stroke="${crossColor}" stroke-width="1"
                  x1="26" y1="42" x2="26" y2="55"/>
            <line stroke="${crossColor}" stroke-width="1"
                  x1="19" y1="48" x2="34" y2="48"/>

            <!-- Right window -->
            <rect class="window ${a}" x="46" y="42" width="15" height="13" rx="2"/>
            <line stroke="${crossColor}" stroke-width="1"
                  x1="53" y1="42" x2="53" y2="55"/>
            <line stroke="${crossColor}" stroke-width="1"
                  x1="46" y1="48" x2="61" y2="48"/>

            <!-- Door -->
            <rect class="door ${a}" style="${doorStyle}" x="32" y="54" width="16" height="22" rx="2"/>
            <!-- Door knob -->
            <circle fill="${knobColor}" cx="45" cy="65" r="1.5"/>
        `;
    }
}
