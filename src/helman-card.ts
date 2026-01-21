import { LitElement, css, html, nothing } from "lit-element"
import { keyed } from 'lit/directives/keyed.js';
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import { fetchSourceAndConsumerRoots, enrichDeviceTreeWithHistory } from "./energy-data-helper";
import { DeviceNode } from "./DeviceNode";
import "./power-device";
import "./power-devices-container";
import { HelmanCardConfig } from "./HelmanCardConfig";
import "./power-flow-arrows"
import "./power-device-info"
import "./power-house-devices-section"

// Constant for empty arrays to avoid creating new empty arrays repeatedly
const EMPTY_ARRAY: readonly DeviceNode[] = Object.freeze([]);

@customElement("helman-card")
export class HelmanCard extends LitElement implements LovelaceCard {
    private config!: HelmanCardConfig;
    @state() private _hass?: HomeAssistant;
    @state() private _deviceTree: DeviceNode[] = [];
    @state() private _showAllHouseChildren = false; // deprecated locally, now handled in section
    @state() private _sourceNodes: DeviceNode[] = [];
    @state() private _computedNodes?: {
        sourcesNode: DeviceNode | undefined;
        sourcesChildren: readonly DeviceNode[];
        consumerNode: DeviceNode | undefined;
        consumersChildren: readonly DeviceNode[];
        houseNode: DeviceNode | undefined;
        houseDevices: readonly DeviceNode[];
    };
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
            this._sourceNodes = this._collectSourceNodes(this._deviceTree);
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
        // Use cached source nodes instead of collecting them every time
        this._deviceTree.forEach(device => device.updateHistoryBuckets(this._hass!, this._sourceNodes));
        this.requestUpdate();
    }

    private _collectSourceNodes(nodes: DeviceNode[]): DeviceNode[] {
        const sourceNodes: DeviceNode[] = [];
        const collectSources = (nodeList: DeviceNode[]) => {
            for (const node of nodeList) {
                if (node.isSource) {
                    sourceNodes.push(node);
                }
                if (node.children) {
                    collectSources(node.children);
                }
            }
        };
        collectSources(nodes);
        return sourceNodes;
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this._historyInterval) {
            clearInterval(this._historyInterval);
        }
    }

    willUpdate(changedProperties: Map<string, any>): void {
        super.willUpdate(changedProperties);
        
        // Recompute nodes only when _deviceTree changes
        if (changedProperties.has('_deviceTree')) {
            const sourcesNode = this._deviceTree.find((device) => device.id === "sources");
            const sourcesChildren = sourcesNode?.children ?? EMPTY_ARRAY;
            const consumerNode = this._deviceTree.find((device) => device.id === "consumers");
            const consumersChildren = consumerNode?.children ?? EMPTY_ARRAY;
            const houseNode = consumersChildren.find((device) => device.id === "house");
            const houseDevices = houseNode?.children ?? EMPTY_ARRAY;

            this._computedNodes = {
                sourcesNode,
                sourcesChildren,
                consumerNode,
                consumersChildren,
                houseNode,
                houseDevices
            };
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
        if (!this._hass || this._deviceTree.length === 0 || !this._computedNodes) {
            return html``;
        }
        // Use pre-computed nodes from willUpdate
        const { sourcesNode, sourcesChildren, consumerNode, consumersChildren, houseNode, houseDevices } = this._computedNodes;

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
                    <power-flow-arrows .devices=${[...sourcesChildren]} .maxPower=${this.config?.max_power}></power-flow-arrows>
                    
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${consumerNode ? [consumerNode] : []}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .devices_full_width=${true}
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[...consumersChildren]} .maxPower=${this.config?.max_power}></power-flow-arrows>
                    
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${consumersChildren}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .currentParentPower=${consumerNode!.powerValue}
                        .parentPowerHistory=${consumerNode!.powerHistory}                        
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[houseNode, undefined, undefined]} .maxPower=${this.config?.max_power}></power-flow-arrows>
                    <power-house-devices-section
                        .hass=${this._hass!}
                        .devices=${houseDevices}
                        .historyBuckets=${this.config.history_buckets}
                        .historyBucketDuration=${this.config.history_bucket_duration}
                        .currentParentPower=${houseNode!.powerValue}
                        .parentPowerHistory=${houseNode!.powerHistory}
                        .devices_full_width=${true}
                        .sortChildrenByPower=${true}
                        .initial_show_only_top_children=${3}
                        .config=${this.config}
                    ></power-house-devices-section>
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


