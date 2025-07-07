import { LitElement, TemplateResult, css, html, nothing } from "lit-element";
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode, sortDevicesByPowerAndName, getPower } from "./energy-data-helper";
import "./power-device";

@customElement("power-device")
export class PowerDevice extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public device!: DeviceNode;
    @property({ type: Number }) public parentPower?: number;
    @property({ type: String }) public unmeasuredPowerTitle?: string;;

    @state() private _childrenHidden = true;

    firstUpdated() {
        this._childrenHidden = this.device.childrenHidden ?? true; // Default to true if not set
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
            this.device.childrenHidden = this._childrenHidden; // Update the device state to reflect the visibility
        }
    }

    static get styles() {
        return css`
            .switchIconPlaceholder {
                width: 40px;
                height: 40px;
                flex-shrink: 0;
                display:inline-flex;
                align-items: center;
                justify-content: center;
            }
            .device {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                margin-top: 3px;

            }
            .deviceContent {
                display: flex;
                align-items: center;
                flex-basis: 100%;
                min-width: 0; /* Prevents text overflow issues */
                box-shadow: 0 2px 7px rgba(0,0,0,0.8);
                border-radius: 10px;
                transition: box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out;
                position: relative;
                z-index: 1;
            }
            .deviceContent:hover {
                box-shadow: 0 4px 14px rgba(0,0,0,0.8);
                transform: scale(1.01);
                z-index: 2;
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
                padding-right: 8px; /* Adds space between power and right edge */
            }
            .powerDisplay.has-sensor{
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
        let parentPower = this.parentPower;
        let powerDisplay = html`<span class="powerDisplay">No power sensor found</span>`;
        let switchIcon: TemplateResult | typeof nothing = nothing;

        if (device.switchEntityId) {
            switchIcon = html`
                <state-badge
                    .hass=${this.hass}
                    .stateObj=${this.hass!.states[device.switchEntityId]}
                    .stateColor=${true}
                    @click=${() => this._showMoreInfo(device.switchEntityId!)}
                ></state-badge>
            `;
        } else {
            switchIcon = html`<div class="switchIconPlaceholder"><ha-icon icon="mdi:border-none-variant" style=" color: var(--disabled-text-color);"></ha-icon></div>`;
        }

        const hasChildren = device.children.length > 0;
        const indicator = hasChildren ? (this._childrenHidden ? '►' : '▼') : '';

        let currentPower: number;
        let percentageDisplay: TemplateResult | typeof nothing = nothing;
        let percentage = 0;
        let backgroundStyle = '';
        let onPowerClick: () => void = () => false;

        if (device.powerValue !== undefined) {
            currentPower = device.powerValue;
        } else if (device.powerSensorId) {
            currentPower = parseFloat(this.hass!.states[device.powerSensorId].state) || 0;
            onPowerClick = () => this._showMoreInfo(device.powerSensorId!)
        } else {
            currentPower = 0;
        }
        if (!parentPower || parentPower == 0) {
            parentPower = currentPower; // If no parent power, use current power as reference
        }

        percentage = (currentPower / parentPower) * 100;
        percentageDisplay = html`<span class=powerPercentages> (${Math.round(percentage).toFixed(0)}%)</span>`;

        powerDisplay = html`<span class="powerDisplay ${device.powerSensorId ? 'has-sensor' : ''}" @click=${onPowerClick}>${percentageDisplay}${currentPower.toFixed(0)} W</span>`;

        if (percentage > 0) {
            backgroundStyle = `background: linear-gradient(to right, rgba(var(--rgb-accent-color), 0.13) ${percentage}%, transparent ${percentage}%);`;
        }

        const childrenWithUnmeasured = [...device.children];
        const sumOfChildrenPower = device.children.reduce((acc, child) => acc + getPower(child, this.hass), 0);

        const unmeasuredPower = currentPower - sumOfChildrenPower;

        if (unmeasuredPower > 1) { // Only show if greater than 1W
            const unmeasuredNode: DeviceNode = {
                name: this.unmeasuredPowerTitle ?? 'Unmeasured power',
                powerSensorId: null,
                switchEntityId: null,
                children: [],
                powerValue: Math.round(unmeasuredPower),
            };
            childrenWithUnmeasured.push(unmeasuredNode);
        }

        const childrenToRender = sortDevicesByPowerAndName(childrenWithUnmeasured, this.hass);

        return html`
            <div class="device">
                <div class="deviceContent" style="${backgroundStyle}">
                    ${switchIcon}
                    <span class="deviceName ${hasChildren ? 'has-children' : ''}" @click=${this._toggleChildren}>${device.name} ${indicator}</span>
                    ${powerDisplay}
                </div>
                ${!this._childrenHidden && childrenToRender.length > 0 ? html`
                    <div class="deviceChildren">
                        ${childrenToRender.map((child, idx) => keyed(`${device.name}-${child.name}`, html`
                            <power-device
                                .hass=${this.hass}
                                .device=${child}
                                .parentPower=${currentPower}
                                .unmeasuredPowerTitle=${this.unmeasuredPowerTitle}
                            ></power-device>
                        `))}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
