import { AttendanceLocationCheck, WorkArrangement, WorkPlaceKind } from 'db';

// A place an employee may clock in at: a company site or their approved home.
export type WorkPlace = {
    kind: WorkPlaceKind;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
};

export type LocationPoint = { latitude: number; longitude: number; accuracyMeters: number };

// Saved on the attendance record as-is.
export type LocationCheckResult = {
    locationCheck: AttendanceLocationCheck;
    checkedPlaceKind: WorkPlaceKind | null;
    checkedPlaceName: string | null;
    checkedPlaceLatitude: number | null;
    checkedPlaceLongitude: number | null;
    checkedPlaceRadiusMeters: number | null;
    distanceMeters: number | null;
};

// GPS error up to this much is forgiven; beyond it a reading near the edge is LOW_ACCURACY
// rather than INSIDE, so a vague fix can't stretch a radius across town.
export const ACCURACY_ALLOWANCE_METERS = 100;

const EARTH_RADIUS_METERS = 6_371_008.8;

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
    const rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad;
    const dLon = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ON_SITE: company sites only. REMOTE: the approved home only. HYBRID: either.
export function allowedPlaces(arrangement: WorkArrangement, sites: WorkPlace[], home: WorkPlace | null): WorkPlace[] {
    const homes = home ? [home] : [];
    if (arrangement === WorkArrangement.REMOTE) return homes;
    if (arrangement === WorkArrangement.HYBRID) return [...sites, ...homes];
    return sites;
}

const NO_PLACE = {
    checkedPlaceKind: null,
    checkedPlaceName: null,
    checkedPlaceLatitude: null,
    checkedPlaceLongitude: null,
    checkedPlaceRadiusMeters: null,
    distanceMeters: null,
};

// Compares a clock-in point with the closest allowed place (closest edge, so a large site
// next door wins over a small one slightly nearer). INSIDE when within the radius plus the
// forgiven GPS error; LOW_ACCURACY when only a vague reading could put it inside; else OUTSIDE.
export function checkLocation(point: LocationPoint | null, places: WorkPlace[]): LocationCheckResult {
    if (!point) return { locationCheck: AttendanceLocationCheck.NO_LOCATION, ...NO_PLACE };
    if (places.length === 0) return { locationCheck: AttendanceLocationCheck.NO_APPROVED_PLACE, ...NO_PLACE };

    let best: { place: WorkPlace; distance: number } | null = null;
    for (const place of places) {
        const distance = distanceMeters(point, place);
        if (!best || distance - place.radiusMeters < best.distance - best.place.radiusMeters) best = { place, distance };
    }
    const { place, distance } = best!;

    let locationCheck: AttendanceLocationCheck = AttendanceLocationCheck.OUTSIDE;
    if (distance <= place.radiusMeters + Math.min(point.accuracyMeters, ACCURACY_ALLOWANCE_METERS)) {
        locationCheck = AttendanceLocationCheck.INSIDE;
    } else if (point.accuracyMeters > ACCURACY_ALLOWANCE_METERS && distance <= place.radiusMeters + point.accuracyMeters) {
        locationCheck = AttendanceLocationCheck.LOW_ACCURACY;
    }

    return {
        locationCheck,
        checkedPlaceKind: place.kind,
        checkedPlaceName: place.name,
        checkedPlaceLatitude: place.latitude,
        checkedPlaceLongitude: place.longitude,
        checkedPlaceRadiusMeters: place.radiusMeters,
        distanceMeters: Math.round(distance),
    };
}
