export const TRANSIT_BEACON_ID = "__transit_beacon__";
export const TRANSIT_BEACON_LABEL = "Transit Beacon";
export const TRANSIT_BEACON_POSITION: [number, number, number] = [7800, 5600, 3200];
export const TRANSIT_BEACON_RADIUS = 36;
export const TRANSIT_BEACON_HINT = "external traffic relay";

export interface TransitBeaconSceneObject {
	id: string;
	label: string;
	hint?: string;
	position: [number, number, number];
	bodyRadius: number;
}

export const TRANSIT_BEACON_OBJECT: TransitBeaconSceneObject = {
	id: TRANSIT_BEACON_ID,
	label: TRANSIT_BEACON_LABEL,
	hint: TRANSIT_BEACON_HINT,
	position: TRANSIT_BEACON_POSITION,
	bodyRadius: TRANSIT_BEACON_RADIUS,
};
