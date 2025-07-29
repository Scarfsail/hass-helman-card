import { LitElement, css, html, nothing } from "lit-element"
import { keyed } from 'lit/directives/keyed.js';
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import { fetchSourceAndConsumerRoots, enrichDeviceTreeWithHistory } from "./energy-data-helper";
import { DeviceNode } from "./DeviceNode";
import "./power-device";
import "./power-devices-container";
import { HelmanCardConfig } from "./helman-card-config";
import "./power-flow-arrows"

@customElement("helman-card")
export class HelmanCard extends LitElement implements LovelaceCard {
    private config!: HelmanCardConfig;
    @state() private _hass?: HomeAssistant;
    @state() private _deviceTree: DeviceNode[] = [];
    @state() private _showAllHouseChildren = false;
    private _historyInterval?: number;
    public set hass(value: HomeAssistant) {
        this._hass = value;

    }


    getCardSize() {
        return this.config?.card_size ?? 1;
    }
    static get styles() {
        return css`
            .card-content {
                padding-right: 10px;
                padding-left: 10px;
                display: flex;
                flex-direction: column;
                gap:5px
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
        if (!this.config.history_buckets) {
            this.config.history_buckets = 60;
        }
        if (!this.config.history_bucket_duration) {
            this.config.history_bucket_duration = 1;
        }

    }

    async connectedCallback() {
        super.connectedCallback();
        if (this._hass) {
            await this._fetchCurrentData();
            this.requestUpdate();
            this._historyInterval = window.setInterval(this.periodicalPowerValuesUpdate.bind(this), this.config.history_bucket_duration * 1000);
            this.periodicalPowerValuesUpdate();
            this._fetchHistoricalData();
        }
    }

    private periodicalPowerValuesUpdate() {
        if (!this._hass || this._deviceTree.length === 0) {
            return;
        }
        const sourceNodes: DeviceNode[] = [];
        const collectSources = (nodes: DeviceNode[]) => {
            for (const node of nodes) {
                if (node.isSource) {
                    sourceNodes.push(node);
                }
                if (node.children) {
                    collectSources(node.children);
                }
            }
        };
        collectSources(this._deviceTree);

        this._deviceTree.forEach(device => device.updateHistoryBuckets(this._hass!, sourceNodes));
        this.requestUpdate();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this._historyInterval) {
            clearInterval(this._historyInterval);
        }
    }
    private async _fetchCurrentData(): Promise<void> {
        this._deviceTree = await fetchSourceAndConsumerRoots(this._hass!, this.config);
    }

    private async _fetchHistoricalData(): Promise<void> {
        try {
            await enrichDeviceTreeWithHistory(this._deviceTree, this._hass!, this.config.history_buckets, this.config.history_bucket_duration);
        } catch (error) {
            console.error('Error fetching device tree:', error);
        }
    }

    render() {
        if (!this._hass || this._deviceTree.length === 0) {
            return html``;
        }
        const sourcesNode = this._deviceTree.find((device) => device.id === "sources");
        const sourcesChildren = sourcesNode?.children || [];
        const consumerNode = this._deviceTree.find((device) => device.id === "consumers");
        const consumersChildren = consumerNode?.children || [];
        const houseNode = consumersChildren.find((device) => device.id === "house");
        const houseDevices = houseNode?.children || [];
        return html`
            <ha-card>
                <div class="card-content">
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${sourcesChildren}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .currentParentPower=${sourcesNode!.powerValue}
                        .parentPowerHistory=${sourcesNode!.powerHistory}
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[...sourcesChildren]}></power-flow-arrows>
                    
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${consumerNode ? [consumerNode] : []}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .devices_full_width=${true}
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[...consumersChildren]}></power-flow-arrows>
                    
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${consumersChildren}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .currentParentPower=${consumerNode!.powerValue}
                        .parentPowerHistory=${consumerNode!.powerHistory}                        
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[houseNode, undefined, undefined]}></power-flow-arrows>
              
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${houseDevices}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .currentParentPower=${houseNode!.powerValue}
                        .parentPowerHistory=${houseNode!.powerHistory}
                        .devices_full_width=${true}
                        .sortChildrenByPower=${true}
                        .show_only_top_children=${this._showAllHouseChildren ? 0 : 3}
                    ></power-devices-container>
                    <div style="text-align: center; cursor: pointer;" @click=${() => { this._showAllHouseChildren = !this._showAllHouseChildren; }}>...</div>                    
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


