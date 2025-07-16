import type { HomeAssistant } from "../hass-frontend/src/types";

export class DeviceNode {
    constructor(name: string, powerSensorId: string | null, switchEntityId: string | null, historyBuckets: number) {
        this.name = name;
        this.powerSensorId = powerSensorId;
        this.switchEntityId = switchEntityId;
        this.children = [];
        this.childrenHidden = true;
        this.historyBuckets = historyBuckets;
        this.powerHistory = [];
        this.valueType = 'default';
        this.isVirtual = false;
    }

    public updateHistoryBuckets(hass: HomeAssistant) {
        if (this.powerHistory.length > 0) {
            this.powerHistory.push(this.powerHistory[this.powerHistory.length - 1]); // Push the last value or liveAvg if history is empty
        }
        if (this.powerHistory.length > this.historyBuckets) { // Keep history items based on config
            this.powerHistory.shift();
        }

        for (const child of this.children) {
            child.updateHistoryBuckets(hass);
        }
        this.updateLivePower(hass);
    }

    private updateLivePower(hass: HomeAssistant, unmeasuredPower?: number) {
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

        if (this.children.length > 0 && !this.isVirtual) {
            const childrenPower = this.children.filter(child => !child.isUnmeasured).reduce((sum, child) => {
                return sum + (child.powerValue || 0);
            }, 0);

            const unmeasuredPower = this.powerValue - childrenPower;
            const unmeasuredNode = this.children.find(child => child.isUnmeasured);
            if (unmeasuredNode) {
                unmeasuredNode.updateLivePower(hass, unmeasuredPower);
            }
        }

    }

    public name: string;
    public powerSensorId: string | null;
    public switchEntityId: string | null;
    public children: DeviceNode[];
    public powerValue?: number;
    public childrenHidden?: boolean;
    //powerHistory?: number[];
    public powerHistory: number[] = [];
    public historyBuckets: number;
    public isUnmeasured: boolean = false; // Indicates if this node represents unmeasured power
    public valueType: 'positive' | 'negative' | 'default';
    public isVirtual: boolean;
}
