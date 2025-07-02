import { LitElement, TemplateResult, css, html, nothing } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import { DeviceNode, fetchDeviceTree } from "./energy-data-helper";

interface HelmanCardConfig extends LovelaceCardConfig {
    house_power_entity?: string;
}

@customElement("helman-card")
export class HelmanCard extends LitElement implements LovelaceCard {
    private config?: HelmanCardConfig;
    @state() private _hass?: HomeAssistant;
    @state() private _deviceTree: DeviceNode[] = [];

    public set hass(value: HomeAssistant) {
        this._hass = value;

    }

    getCardSize() {
        return this.config?.card_size ?? 1;
    }
    static get styles() {
        return css`
            .card-content {
                padding-right: 16px;
                padding-left: 0px
            }
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
            .powerDisplay {
                flex-shrink: 0;
                margin-left: auto; /* Aligns to the right */
                padding-left: 8px; /* Adds space between name and power */
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
    public static async getStubConfig(hass: HomeAssistant): Promise<Partial<HelmanCardConfig>> {
        return {
            type: `custom:helman-card`,
        };
    }

    async setConfig(config: HelmanCardConfig) {
        this.config = { ...config };
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._hass) {
            this._fetchData();
        }
    }

    private async _fetchData() {
        this._deviceTree = await fetchDeviceTree(this._hass!, this.config?.house_power_entity)
    }

    private _showMoreInfo(entityId: string) {
        const event = new CustomEvent("hass-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId },
        });
        this.dispatchEvent(event);
    }
    
    render() {
        if (!this._hass || this._deviceTree.length === 0) {
            return html``;
        }

        const renderDevice = (device: DeviceNode, parentPower?: number): TemplateResult => {
            let powerDisplay = html`<span class="powerDisplay">No power sensor found</span>`;
            let switchIcon: TemplateResult | typeof nothing = nothing;

            if (device.switchEntityId) {
                switchIcon = html`
                    <state-badge
                        .hass=${this._hass}                                                
                        .stateObj=${this._hass!.states[device.switchEntityId]}
                        @click=${() => this._showMoreInfo(device.switchEntityId!)}
                    ></state-badge>
                `;
            } else {
                switchIcon = html`<div class="switchIIconPlaceholder"></div>`;
            }

            if (device.powerSensorId) {
                const powerState = this._hass!.states[device.powerSensorId];
                const currentPower = parseFloat(powerState.state) || 0;
                let percentageDisplay:TemplateResult | typeof nothing = nothing;
                if (parentPower && parentPower > 0) {
                    const percentage = (currentPower / parentPower) * 100;
                    percentageDisplay = html`<span class=powerPercentages> (${percentage.toFixed(1)}%)</span>`;
                }

                powerDisplay = html`<span class="powerDisplay">${percentageDisplay}${powerState.state} ${powerState.attributes.unit_of_measurement || ""}</span>`;
            
                const sortedChildren = [...device.children].sort((a, b) => {
                    const stateA = a.powerSensorId ? parseFloat(this._hass!.states[a.powerSensorId]?.state) || 0 : 0;
                    const stateB = b.powerSensorId ? parseFloat(this._hass!.states[b.powerSensorId]?.state) || 0 : 0;
                    return stateB - stateA;
                });

                return html`
                    <div class="device">
                        <div class="deviceContent">
                            ${switchIcon}
                            <span class="deviceName">${device.name}:</span>
                            ${powerDisplay}
                        </div>                        
                        ${sortedChildren.length > 0 ? html`
                            <div class="deviceChildren">
                                ${sortedChildren.map(child => renderDevice(child, currentPower))}
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

        const sortedRoot = [...this._deviceTree].sort((a, b) => {
            const stateA = a.powerSensorId ? parseFloat(this._hass!.states[a.powerSensorId]?.state) || 0 : 0;
            const stateB = b.powerSensorId ? parseFloat(this._hass!.states[b.powerSensorId]?.state) || 0 : 0;
            return stateB - stateA;
        });

        return html`
            <ha-card>
                <h1>House Electricity Manager</h1>
                <div class="card-content">
                    ${sortedRoot.map(device => renderDevice(device))}
                </div>
            </ha-card>
        `;
    }
}

// Register the custom card in Home Assistant
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: 'helman-card',
    name: 'House Electricity Manager Card',
    description: 'A custom card for Home Assistant to control power devices. It allows users to see power consumption, control devices, and manage power settings.',
    preview: true,
});



