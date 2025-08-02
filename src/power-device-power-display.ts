import { LitElement, TemplateResult, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";

@customElement("power-device-power-display")
export class PowerDevicePowerDisplay extends LitElement {
    @property({ type: Number }) public powerValue = 0;
    @property({ type: String }) public powerSensorId?: string;
    @property({ type: Boolean }) public compact = false;
    @property({ type: Number }) public currentParentPower?: number;

    private _showMoreInfo(entityId: string) {
        const event = new CustomEvent("show-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId },
        });
        this.dispatchEvent(event);
    }

    static get styles() {
        return css`
            .powerDisplay {
                margin-left: auto; /* Aligns to the right */
                padding-left: 8px; /* Adds space between name and power */
                padding-right: 8px; /* Adds space between power and right edge */
                position: relative;
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                align-items: center;
                z-index: 2;
                text-shadow: 0px 0px 4px rgba(0,0,0,1);
            }
            .powerDisplay.has-sensor{
                cursor: pointer;
            }
            .no-wrap {
                white-space: nowrap;
            }
            .powerPercentages{
                font-size: 0.7em;
                margin-right: 4px; /* Adds space between percentage and power value */
            }
            .clickable {
                cursor: pointer;
            }
        `;
    }

    render(): TemplateResult {
        const currentPower = this.powerValue ?? 0;
        let parentPower = this.currentParentPower;

        if (!parentPower || parentPower === 0) {
            parentPower = currentPower; // If no parent power, use current power as reference
        }

        const currentPercentage = (parentPower > 0) ? (currentPower / parentPower) * 100 : 0;
        const percentageDisplay = html`<span class=powerPercentages> (${Math.round(currentPercentage).toFixed(0)}%)</span>`;

        const onPowerClick = this.powerSensorId
            ? () => this._showMoreInfo(this.powerSensorId!)
            : () => { }; // No-op if no sensor

        const powerValue = currentPower >= 1000 ? (currentPower / 1000).toFixed(1) : currentPower.toFixed(0);
        const powerUnit = currentPower >= 1000 ? "kW" : "W";

        return html`<div class="powerDisplay ${this.powerSensorId ? 'has-sensor' : ''}" @click=${onPowerClick} style="${this.compact ? 'flex-direction: column; align-items: center;' : ''}">
                        <div>${percentageDisplay}</div>
                        <div class="no-wrap">${powerValue} ${powerUnit}</div>
                    </div>`;
    }
}
