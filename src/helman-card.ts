import { LitElement, TemplateResult, css, html, nothing } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";

interface HelmanCardConfig extends LovelaceCardConfig {

}

interface EnergyPrefs {
    energy_sources: unknown[];
    device_consumption: DeviceConsumption[];
}

interface DeviceConsumption {
    stat_consumption: string;
    included_in_stat?: string;
}

interface EntityRegistryEntry {
    entity_id: string;
    device_id: string | null;
}

interface DeviceNode {
    name: string;
    powerSensorId: string | null;
    children: DeviceNode[];
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
        const [energyPrefs, entityRegistry] = await Promise.all([
            this._hass!.connection.sendMessagePromise<EnergyPrefs>(
                { type: "energy/get_prefs" }
            ),
            this._hass!.connection.sendMessagePromise<EntityRegistryEntry[]>(
                { type: "config/entity_registry/list" }
            ),
        ]);

        const deviceMap = new Map<string, DeviceNode>();
        const consumptionMap = new Map<string, DeviceConsumption>();

        // Create all nodes and put them in a map
        for (const source of energyPrefs.device_consumption) {
            const energyEntity = entityRegistry.find(e => e.entity_id === source.stat_consumption);
            let powerSensorId: string | null = null;

            if (energyEntity && energyEntity.device_id) {
                const deviceEntities = entityRegistry.filter(e => e.device_id === energyEntity.device_id);
                const powerEntity = deviceEntities.find(e => {
                    const state = this._hass!.states[e.entity_id];
                    return state && state.attributes.device_class === 'power';
                });
                if (powerEntity) {
                    powerSensorId = powerEntity.entity_id;
                }
            }
            
            if (!powerSensorId) {
                console.warn(`Could not find a power sensor for "${source.stat_consumption}". This device will be skipped.`);
                continue;
            }

            const name = this._hass!.states[powerSensorId]?.attributes.friendly_name || powerSensorId;

            deviceMap.set(source.stat_consumption, {
                name: name,
                powerSensorId: powerSensorId,
                children: []
            });
            consumptionMap.set(source.stat_consumption, source);
        }

        const tree: DeviceNode[] = [];
        for (const source of energyPrefs.device_consumption) {
            const deviceNode = deviceMap.get(source.stat_consumption);
            if (!deviceNode) {
                continue;
            }

            if (source.included_in_stat && deviceMap.has(source.included_in_stat)) {
                const parent = deviceMap.get(source.included_in_stat)!;
                parent.children.push(deviceNode);
            } else {
                tree.push(deviceNode);
            }
        }

        this._deviceTree = tree;
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

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: 'helman-card',
    name: 'House Electricity Manager Card',
    description: 'A custom card for Home Assistant to control power devices. It allows users to see power consumption, control devices, and manage power settings.',
    preview: true,
});



