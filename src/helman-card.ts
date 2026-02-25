import { LitElement, css, html } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import { DeviceNode } from "./DeviceNode";
import "./power-device";
import "./power-devices-container";
import { HelmanCardConfig, HelmanUiConfig } from "./HelmanCardConfig";
import "./power-flow-arrows"
import "./power-device-info"
import "./power-house-devices-section"

const EMPTY_ARRAY: readonly DeviceNode[] = Object.freeze([]);

interface DeviceNodeDTO {
    id: string;
    displayName: string;
    powerSensorId: string | null;
    switchEntityId: string | null;
    isSource: boolean;
    isUnmeasured: boolean;
    valueType: 'default' | 'positive' | 'negative';
    labels: string[];
    labelBadgeTexts: string[];
    sourceConfig: any | null;
    color: string | null;
    icon: string | null;
    compact: boolean;
    showAdditionalInfo: boolean;
    childrenFullWidth: boolean;
    hideChildren: boolean;
    hideChildrenIndicator: boolean;
    sortChildrenByPower: boolean;
    children: DeviceNodeDTO[];
    ratioSensorId: string | null;
    sourceType: string | null;
}

interface TreePayload {
    sources: DeviceNodeDTO[];
    consumers: DeviceNodeDTO[];
    consumptionTotalSensorId: string | null;
    productionTotalSensorId: string | null;
    uiConfig: HelmanUiConfig;
}

interface HistoryPayload {
    buckets: number;
    bucket_duration: number;
    entity_history: Record<string, number[]>;
}

@customElement("helman-card")
export class HelmanCard extends LitElement implements LovelaceCard {
    // 1. Static HA configuration methods
    public static async getStubConfig(_hass: HomeAssistant): Promise<Partial<HelmanCardConfig>> {
        return { type: `custom:helman-card` };
    }

    // 2. Static styles
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

    // 3. Private properties
    private config!: HelmanCardConfig;
    private _historyInterval?: number;
    private _sourceNodes: DeviceNode[] = [];

    // 5. State properties
    @state() private _hass?: HomeAssistant;
    @state() private _deviceTree: DeviceNode[] = [];
    @state() private _uiConfig?: HelmanUiConfig;
    @state() private _computedNodes?: {
        sourcesNode: DeviceNode | undefined;
        sourcesChildren: readonly DeviceNode[];
        consumerNode: DeviceNode | undefined;
        consumersChildren: readonly DeviceNode[];
        houseNode: DeviceNode | undefined;
        houseDevices: readonly DeviceNode[];
    };

    // 7. HA-specific setters
    public set hass(hass: HomeAssistant) {
        this._hass = hass;
    }

    // 8. HA-specific methods
    getCardSize() {
        return this.config?.card_size ?? 1;
    }

    async setConfig(config: HelmanCardConfig) {
        this.config = { ...config };
    }

    // 9. Lifecycle methods
    async connectedCallback() {
        super.connectedCallback();
        if (this._hass) {
            await this._loadBackendData();
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        clearInterval(this._historyInterval);
    }

    willUpdate(changedProperties: Map<string, any>): void {
        super.willUpdate(changedProperties);
        if (changedProperties.has('_deviceTree')) {
            const sourcesNode = this._deviceTree.find((device) => device.id === "sources");
            const sourcesChildren = sourcesNode?.children ?? EMPTY_ARRAY;
            const consumerNode = this._deviceTree.find((device) => device.id === "consumers");
            const consumersChildren = consumerNode?.children ?? EMPTY_ARRAY;
            const houseNode = consumersChildren.find((device) => device.id === "house");
            const houseDevices = houseNode?.children ?? EMPTY_ARRAY;
            this._computedNodes = { sourcesNode, sourcesChildren, consumerNode, consumersChildren, houseNode, houseDevices };
        }
    }

    // 10. Render method
    render() {
        if (!this._hass || this._deviceTree.length === 0 || !this._computedNodes || !this._uiConfig) {
            return html``;
        }
        const { sourcesNode, sourcesChildren, consumerNode, consumersChildren, houseNode, houseDevices } = this._computedNodes;
        const historyBuckets = this._uiConfig.history_buckets;
        const historyBucketDuration = this._uiConfig.history_bucket_duration;

        return html`
            <ha-card>
                <div class="card-content">
                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${sourcesChildren}
                        .historyBuckets=${historyBuckets}
                        .historyBucketDuration=${historyBucketDuration}
                        .currentParentPower=${sourcesNode!.powerValue}
                        .parentPowerHistory=${sourcesNode!.powerHistory}
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[...sourcesChildren]} .maxPower=${this.config?.max_power}></power-flow-arrows>

                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${consumerNode ? [consumerNode] : []}
                        .historyBuckets=${historyBuckets}
                        .historyBucketDuration=${historyBucketDuration}
                        .devices_full_width=${true}
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[...consumersChildren]} .maxPower=${this.config?.max_power}></power-flow-arrows>

                    <power-devices-container
                        .hass=${this._hass!}
                        .devices=${consumersChildren}
                        .historyBuckets=${historyBuckets}
                        .historyBucketDuration=${historyBucketDuration}
                        .currentParentPower=${consumerNode!.powerValue}
                        .parentPowerHistory=${consumerNode!.powerHistory}
                    ></power-devices-container>
                    <power-flow-arrows .devices=${[houseNode, undefined, undefined]} .maxPower=${this.config?.max_power}></power-flow-arrows>
                    <power-house-devices-section
                        .hass=${this._hass!}
                        .devices=${houseDevices}
                        .historyBuckets=${historyBuckets}
                        .historyBucketDuration=${historyBucketDuration}
                        .currentParentPower=${houseNode!.powerValue}
                        .parentPowerHistory=${houseNode!.powerHistory}
                        .devices_full_width=${true}
                        .sortChildrenByPower=${true}
                        .initial_show_only_top_children=${3}
                        .uiConfig=${this._uiConfig}
                    ></power-house-devices-section>
                </div>
            </ha-card>
        `;
    }

    // 12. Private helper methods
    private async _loadBackendData(): Promise<void> {
        clearInterval(this._historyInterval);
        try {
            const treePayload = await this._hass!.connection.sendMessagePromise<TreePayload>({
                type: "helman/get_device_tree",
            });
            this._uiConfig = treePayload.uiConfig;
            this._deviceTree = this._hydrateDeviceNodes(treePayload);
            this._sourceNodes = this._collectSourceNodes(this._deviceTree);

            const history = await this._hass!.connection.sendMessagePromise<HistoryPayload>({
                type: 'helman/get_history',
            });
            this._applyHistory(history);
            this.requestUpdate();

            this._historyInterval = window.setInterval(
                this._advanceBuckets.bind(this),
                (this._uiConfig?.history_bucket_duration ?? 1) * 1000
            );
            this._advanceBuckets();
        } catch (error) {
            console.error('Helman: failed to load backend data', error);
        }
    }

    private _hydrateNode(dto: DeviceNodeDTO): DeviceNode {
        const historyBuckets = this._uiConfig?.history_buckets ?? 60;
        const node = new DeviceNode(dto.id, dto.displayName, dto.powerSensorId, dto.switchEntityId, historyBuckets, dto.sourceConfig ?? undefined);
        node.isSource = dto.isSource;
        node.isUnmeasured = dto.isUnmeasured;
        node.valueType = dto.valueType;
        node.labels = dto.labels;
        if (dto.labelBadgeTexts.length > 0) node.customLabelTexts = dto.labelBadgeTexts;
        if (dto.color) node.color = dto.color;
        if (dto.icon) node.icon = dto.icon;
        node.compact = dto.compact;
        node.show_additional_info = dto.showAdditionalInfo;
        node.children_full_width = dto.childrenFullWidth;
        node.hideChildren = dto.hideChildren;
        node.hideChildrenIndicator = dto.hideChildrenIndicator;
        node.sortChildrenByPower = dto.sortChildrenByPower;
        if (dto.ratioSensorId) node.ratioSensorId = dto.ratioSensorId;
        node.children = dto.children.map(child => this._hydrateNode(child));
        return node;
    }

    private _hydrateDeviceNodes(payload: TreePayload): DeviceNode[] {
        const { sources, consumers, consumptionTotalSensorId, productionTotalSensorId, uiConfig } = payload;
        const historyBuckets = uiConfig.history_buckets;
        const roots: DeviceNode[] = [];

        if (sources.length > 0) {
            const sourcesNode = new DeviceNode("sources", uiConfig.sources_title, null, null, historyBuckets);
            sourcesNode.childrenCollapsed = false;
            sourcesNode.icon = 'mdi:lightning-bolt-outline';
            sourcesNode.powerSensorId = productionTotalSensorId;
            sourcesNode.children = sources.map(dto => this._hydrateNode(dto));
            roots.push(sourcesNode);
        }

        if (consumers.length > 0) {
            const consumersNode = new DeviceNode("consumers", uiConfig.consumers_title, null, null, historyBuckets);
            consumersNode.hideChildren = true;
            consumersNode.hideChildrenIndicator = true;
            consumersNode.icon = 'mdi:lightning-bolt-outline';
            consumersNode.powerSensorId = consumptionTotalSensorId;
            consumersNode.children = consumers.map(dto => this._hydrateNode(dto));
            roots.push(consumersNode);
        }

        return roots;
    }

    private _collectSourceNodes(nodes: DeviceNode[]): DeviceNode[] {
        const sourceNodes: DeviceNode[] = [];
        const collect = (nodeList: DeviceNode[]) => {
            for (const node of nodeList) {
                if (node.isSource) sourceNodes.push(node);
                if (node.children) collect(node.children);
            }
        };
        collect(nodes);
        return sourceNodes;
    }

    private _applyHistory(history: HistoryPayload): void {
        const { entity_history, buckets } = history;
        const allNodes = this._walkTree(this._deviceTree);

        for (const node of allNodes) {
            if (!node.powerSensorId) continue;

            const rawHistory = entity_history[node.powerSensorId];
            if (rawHistory) {
                let h = [...rawHistory];
                if (node.valueType === 'positive') h = h.map(v => Math.max(0, v));
                else if (node.valueType === 'negative') h = h.map(v => Math.abs(Math.min(0, v)));
                node.powerHistory = h;
                node.historyBuckets = buckets;
            }

            if (node.isSource) continue;
            node.sourcePowerHistory = [];
            if (!rawHistory) continue;
            for (let i = 0; i < buckets; i++) {
                const bucket: { [sourceId: string]: { power: number; color: string } } = {};
                const consumerPower = node.powerHistory[i] ?? 0;
                for (const src of this._sourceNodes) {
                    if (!src.ratioSensorId) continue;
                    const ratioHistory = entity_history[src.ratioSensorId];
                    const ratio = (ratioHistory?.[i] ?? 0) / 100;
                    if (ratio > 0 && consumerPower > 0) {
                        bucket[src.id] = { power: consumerPower * ratio, color: src.color || 'grey' };
                    }
                }
                node.sourcePowerHistory.push(bucket);
            }
        }
    }

    private _walkTree(nodes: DeviceNode[]): DeviceNode[] {
        const result: DeviceNode[] = [];
        const walk = (nodeList: DeviceNode[]) => {
            for (const node of nodeList) {
                result.push(node);
                walk(node.children);
            }
        };
        walk(nodes);
        return result;
    }

    private _advanceBuckets(): void {
        if (!this._hass || this._deviceTree.length === 0) return;
        this._advanceTree(this._deviceTree);
        this.requestUpdate();
    }

    private _advanceTree(nodes: DeviceNode[]): void {
        const maxBuckets = this._uiConfig?.history_buckets ?? 60;
        for (const node of nodes) {
            // Advance history arrays
            if (node.powerHistory.length > 0) {
                node.powerHistory.push(node.powerHistory[node.powerHistory.length - 1]);
                if (node.sourcePowerHistory) {
                    node.sourcePowerHistory.push(node.sourcePowerHistory[node.sourcePowerHistory.length - 1]);
                }
            }
            if (node.powerHistory.length > maxBuckets) {
                node.powerHistory.shift();
                node.sourcePowerHistory?.shift();
            }

            // Update live power from hass.states
            if (node.powerSensorId) {
                const rawPower = parseFloat(this._hass!.states[node.powerSensorId]?.state ?? '0') || 0;
                let power: number;
                switch (node.valueType) {
                    case 'positive': power = Math.max(0, rawPower); break;
                    case 'negative': power = Math.abs(Math.min(0, rawPower)); break;
                    default: power = rawPower;
                }
                if (node.powerHistory.length === 0) node.powerHistory.push(0);
                node.powerHistory[node.powerHistory.length - 1] = power;
                node.powerValue = power;
            }

            // Recurse into children so source nodes get their power updated
            // before we compute source ratios on non-source nodes below
            this._advanceTree(node.children);

            // Compute source ratio for the newest bucket (non-source nodes only)
            if (!node.isSource && node.powerSensorId && node.sourcePowerHistory && node.sourcePowerHistory.length > 0) {
                const bucket: { [sourceId: string]: { power: number; color: string } } = {};
                const powerVal = node.powerValue || 0;
                if (powerVal > 0) {
                    for (const src of this._sourceNodes) {
                        if (!src.ratioSensorId) continue;
                        const ratio = parseFloat(this._hass!.states[src.ratioSensorId]?.state ?? '0') / 100;
                        if (ratio > 0) bucket[src.id] = { power: powerVal * ratio, color: src.color || 'grey' };
                    }
                }
                node.sourcePowerHistory[node.sourcePowerHistory.length - 1] = bucket;
            }
        }
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
