import { LitElement, css, html } from "lit-element"
import { keyed } from 'lit/directives/keyed.js';
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import { DeviceNode, fetchDeviceTree, sortDevicesByPowerAndName } from "./energy-data-helper";
import "./power-device";

interface HelmanCardConfig extends LovelaceCardConfig {
    house_power_entity?: string;
    power_sensor_label?: string;
    power_switch_label?: string;
    power_sensor_name_cleaner_regex?: string;
    unmeasured_power_title?: string;
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

    private async _fetchData(): Promise<void> {
        try {
            const housePowerEntityId = this.config?.house_power_entity;
            const powerSensorLabel = this.config?.power_sensor_label;
            const powerSwitchLabel = this.config?.power_switch_label;
            const powerSensorNameCleanerRegex = this.config?.power_sensor_name_cleaner_regex;
            this._deviceTree = await fetchDeviceTree(this._hass!, housePowerEntityId, powerSensorLabel, powerSwitchLabel, powerSensorNameCleanerRegex);
            this.requestUpdate();
        } catch (error) {
            console.error('Error fetching device tree:', error);
        }
    }

    render() {
        if (!this._hass || this._deviceTree.length === 0) {
            return html``;
        }

        const sortedRoot = sortDevicesByPowerAndName(this._deviceTree, this._hass);

        return html`
            <ha-card>
                <div class="card-content">
                    ${sortedRoot.map(device => keyed(device.name, html`
                        <power-device
                            .hass=${this._hass!}
                            .device=${device}
                            .unmeasuredPowerTitle=${this.config?.unmeasured_power_title}
                        ></power-device>
                    `))}
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



