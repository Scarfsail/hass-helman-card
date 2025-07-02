import { LitElement, css, html } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import { DeviceNode, fetchDeviceTree } from "./energy-data-helper";
import "./power-device";

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
    
    render() {
        if (!this._hass || this._deviceTree.length === 0) {
            return html``;
        }

        const sortedRoot = [...this._deviceTree].sort((a, b) => {
            const stateA = a.powerSensorId ? parseFloat(this._hass!.states[a.powerSensorId]?.state) || 0 : 0;
            const stateB = b.powerSensorId ? parseFloat(this._hass!.states[b.powerSensorId]?.state) || 0 : 0;
            return stateB - stateA;
        });

        return html`
            <ha-card>
                <div class="card-content">
                    ${sortedRoot.map(device => html`
                        <power-device
                            .childrenHiddenByDefault=${false}
                            .hass=${this._hass!}
                            .device=${device}
                        ></power-device>
                    `)}
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



