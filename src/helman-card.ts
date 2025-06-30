import { LitElement, TemplateResult, css, html, nothing } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import { DeviceNode, fetchDeviceTree } from "./energy-data-helper";

interface HelmanCardConfig extends LovelaceCardConfig {

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
            .device {
                padding-left: 20px;
            }
            .children {
                padding-left: 20px;
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
        this._deviceTree = await fetchDeviceTree(this._hass!)
    }
    
    render() {
        if (!this._hass || this._deviceTree.length === 0) {
            return html``;
        }

        const renderDevice = (device: DeviceNode): TemplateResult => {
            let powerDisplay = html`<span>No power sensor found</span>`;

            if (device.powerSensorId) {
                const powerState = this._hass!.states[device.powerSensorId];
                powerDisplay = html`<span>${powerState.state} ${powerState.attributes.unit_of_measurement || ""}</span>`;
            }

            return html`
                <div class="device">
                    <span>${device.name}:</span>
                    ${powerDisplay}
                    ${device.children.length > 0 ? html`
                        <div class="children">
                            ${device.children.map(child => renderDevice(child))}
                        </div>
                    ` : nothing}
                </div>
            `;
        }

        return html`
            <ha-card>
                <h1>House Electricity Manager</h1>
                <div class="card-content">
                    ${this._deviceTree.map(renderDevice)}
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



