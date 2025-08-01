import type { HomeAssistant } from "../hass-frontend/src/types";

export class DeviceNode {
    constructor(id: string, name: string, powerSensorId: string | null, switchEntityId: string | null, historyBuckets: number) {
        this.id = id;
        this.name = name;
        this.powerSensorId = powerSensorId;
        this.switchEntityId = switchEntityId;
        this.children = [];
        this.childrenCollapsed = true;
        this.historyBuckets = historyBuckets;
        this.powerHistory = [];
        this.valueType = 'default';
        this.isVirtual = false;
        this.color = undefined;
        this.isSource = false;
        this.icon = undefined;
    }

    public updateHistoryBuckets(hass: HomeAssistant, sourceNodes: DeviceNode[]) {
        if (this.powerHistory.length > 0) {
            this.powerHistory.push(this.powerHistory[this.powerHistory.length - 1]); // Push the last value
            if (this.sourcePowerHistory) {
                this.sourcePowerHistory.push(this.sourcePowerHistory[this.sourcePowerHistory.length - 1]);
            }
        }
        if (this.powerHistory.length > this.historyBuckets) { // Keep history items based on config
            this.powerHistory.shift();
            if (this.sourcePowerHistory) {
                this.sourcePowerHistory.shift();
            }
        }

        for (const child of this.children) {
            child.updateHistoryBuckets(hass, sourceNodes);
        }
        this.updateLivePower(hass, sourceNodes);
    }

    private updateLivePower(hass: HomeAssistant, sourceNodes: DeviceNode[], unmeasuredPower?: number) {
        let power: number = 0;
        if (this.isVirtual) {
            power = this.children.reduce((sum, child) => sum + (child.powerValue || 0), 0);
        } else if (this.isUnmeasured) {
            if (unmeasuredPower == undefined) {
                return;
            }
            power = unmeasuredPower;
        } else {
            if (this.powerSensorId) {
                const rawPower = parseFloat(hass!.states[this.powerSensorId].state) || 0;
                switch (this.valueType) {
                    case 'positive':
                        power = Math.max(0, rawPower);
                        break;
                    case 'negative':
                        power = Math.abs(Math.min(0, rawPower));
                        break;
                    default:
                        power = rawPower;
                        break;
                }
            }
            else if (this.powerValue !== undefined) {
                power = this.powerValue;
            } else {
                power = 0;
            }
        }
        if (this.powerHistory.length === 0) {
            this.powerHistory.push(0); // Initialize with zero if empty
        }

        this.powerHistory[this.powerHistory.length - 1] = power; // Update the last history entry with the new average
        this.powerValue = power;

        // --- Live Source Power Calculation ---
        if (this.sourcePowerHistory && !this.isSource) {
            const totalSourcePower = sourceNodes.reduce((sum, s) => sum + (s.powerValue || 0), 0);
            const bucketSourcePower: { [sourceName: string]: { power: number; color: string } } = {};

            if (totalSourcePower > 0 && this.powerValue > 0) {
                for (const sourceNode of sourceNodes) {
                    const sourcePower = sourceNode.powerValue || 0;
                    const ratio = sourcePower / totalSourcePower;
                    bucketSourcePower[sourceNode.id] = {
                        power: this.powerValue * ratio,
                        color: sourceNode.color || 'grey'
                    };
                }
            }
            this.sourcePowerHistory[this.sourcePowerHistory.length - 1] = bucketSourcePower;
        }
        // --- End Live Source Power Calculation ---

        if (this.children.length > 0 && !this.isVirtual) {
            const childrenPower = this.children.filter(child => !child.isUnmeasured).reduce((sum, child) => {
                return sum + (child.powerValue || 0);
            }, 0);

            const unmeasuredPower = this.powerValue - childrenPower;
            const unmeasuredNode = this.children.find(child => child.isUnmeasured);
            if (unmeasuredNode) {
                unmeasuredNode.updateLivePower(hass, sourceNodes, unmeasuredPower);
            }
        }

    }
    public id: string;
    public name: string;
    public powerSensorId: string | null;
    public switchEntityId: string | null;
    public children: DeviceNode[];
    public powerValue?: number;
    public childrenCollapsed?: boolean;
    public hideChildren?: boolean; // Indicates if children should be hidden in the UI
    public hideChildrenIndicator?: boolean; // Indicates if a button to show/hide children should be displayed
    public powerHistory: number[] = [];
    public historyBuckets: number;
    public isUnmeasured: boolean = false; // Indicates if this node represents unmeasured power
    public valueType: 'positive' | 'negative' | 'default';
    public isVirtual: boolean;

    public color?: string;
    public sourcePowerHistory?: { [sourceName: string]: { power: number; color: string } }[];
    public isSource: boolean;
    public icon?: string;
    public sortChildrenByPower?: boolean;
    public battery_capacity_entity_id?: string;
    public compact?: boolean; // Indicates if the device should be displayed in a compact mode
    public children_full_width?: boolean; // Indicates if the device should take full width in the UI
}
