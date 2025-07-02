import { LitElement, TemplateResult, css, html, nothing } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./energy-data-helper";
import "./power-device";

@customElement("power-device")
export class PowerDevice extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public device!: DeviceNode;
    @property({ type: Number }) public parentPower?: number;
    @property({ type: Boolean }) public childrenHiddenByDefault = true;

    @state() private _childrenHidden = true;

    firstUpdated() {
        this._childrenHidden = this.childrenHiddenByDefault;
    }

    private _showMoreInfo(entityId: string) {
        const event = new CustomEvent("hass-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId },
        });
        this.dispatchEvent(event);
    }

    private _toggleChildren() {
        if (this.device.children.length > 0) {
            this._childrenHidden = !this._childrenHidden;
        }
    }

    static get styles() {
        return css`
            .switchIIconPlaceholder {
                width: 40px;
                height: 40px;
                flex-shrink: 0;
            }
            .device {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
            }
            .deviceContent {
                display: flex;
                align-items: center;
                flex-basis: 100%;
                min-width: 0; /* Prevents text overflow issues */
            }
            .deviceName {
                flex-grow: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-left: 0px;
            }
            .deviceName.has-children {
                cursor: pointer;
            }
            .powerDisplay {
                flex-shrink: 0;
                margin-left: auto; /* Aligns to the right */
                padding-left: 8px; /* Adds space between name and power */
                cursor: pointer;
            }
            .deviceChildren {
                flex-basis: 100%;
                padding-left: 20px; /* Aligns with the device name */
            }
            .powerPercentages{
                font-size: 0.7em;
                margin-right: 4px; /* Adds space between percentage and power value */
            }
            state-badge {
                cursor: pointer;
                flex-shrink: 0;
            }
        `;
    }

    render() {
        const device = this.device;
        const parentPower = this.parentPower;
        let powerDisplay = html`<span class="powerDisplay">No power sensor found</span>`;
        let switchIcon: TemplateResult | typeof nothing = nothing;

        if (device.switchEntityId) {
            switchIcon = html`
                <state-badge
                    .hass=${this.hass}
                    .stateObj=${this.hass!.states[device.switchEntityId]}
                    @click=${() => this._showMoreInfo(device.switchEntityId!)}
                ></state-badge>
            `;
        } else {
            switchIcon = html`<div class="switchIIconPlaceholder"></div>`;
        }

        const hasChildren = device.children.length > 0;
        const indicator = hasChildren ? (this._childrenHidden ? '►' : '▼') : '';

        if (device.powerSensorId) {
            const powerState = this.hass!.states[device.powerSensorId];
            const currentPower = parseFloat(powerState.state) || 0;
            let percentageDisplay: TemplateResult | typeof nothing = nothing;
            let percentage = 0;
            if (parentPower && parentPower > 0) {
                percentage = (currentPower / parentPower) * 100;
                percentageDisplay = html`<span class=powerPercentages> (${percentage.toFixed(1)}%)</span>`;
            }

            const backgroundStyle = `background: linear-gradient(to right, rgba(var(--rgb-accent-color), 0.15) ${percentage}%, transparent ${percentage}%);`;

            powerDisplay = html`<span class="powerDisplay" @click=${() => this._showMoreInfo(device.powerSensorId!)}>${percentageDisplay}${powerState.state} ${powerState.attributes.unit_of_measurement || ""}</span>`;

            const sortedChildren = [...device.children].sort((a, b) => {
                const stateA = a.powerSensorId ? parseFloat(this.hass!.states[a.powerSensorId]?.state) || 0 : 0;
                const stateB = b.powerSensorId ? parseFloat(this.hass!.states[b.powerSensorId]?.state) || 0 : 0;
                return stateB - stateA;
            });

            return html`
                <div class="device">
                    <div class="deviceContent" style="${backgroundStyle}">
                        ${switchIcon}
                        <span class="deviceName ${hasChildren ? 'has-children' : ''}" @click=${this._toggleChildren}>${device.name} ${indicator}</span>
                        ${powerDisplay}
                    </div>
                    ${!this._childrenHidden && sortedChildren.length > 0 ? html`
                        <div class="deviceChildren">
                            ${sortedChildren.map(child => html`
                                <power-device
                                    .hass=${this.hass}
                                    .device=${child}
                                    .parentPower=${currentPower}
                                ></power-device>
                            `)}
                        </div>
                    ` : nothing}
                </div>
            `;
        }

        return html`
            <div class="device">
                <div class="deviceContent">
                    ${switchIcon}
                    <span class="deviceName">${device.name}:</span>
                    ${powerDisplay}
                </div>
            </div>
        `;
    }
}
