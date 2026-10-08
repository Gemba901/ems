import { AttendanceLocationCheck, WorkArrangement, WorkPlaceKind } from 'db';
import { WorkPlace, allowedPlaces, checkLocation, distanceMeters } from './work-location';

// Near Nairobi CBD. 0.001° of latitude is about 111 m.
const OFFICE: WorkPlace = { kind: WorkPlaceKind.SITE, name: 'Head office', latitude: -1.2864, longitude: 36.8172, radiusMeters: 150 };
const YARD: WorkPlace = { kind: WorkPlaceKind.SITE, name: 'Yard', latitude: -1.3, longitude: 36.85, radiusMeters: 500 };
const HOME: WorkPlace = { kind: WorkPlaceKind.HOME, name: 'Home', latitude: -1.25, longitude: 36.78, radiusMeters: 150 };

function north(place: WorkPlace, meters: number, accuracyMeters = 10) {
    return { latitude: place.latitude + meters / 111_195, longitude: place.longitude, accuracyMeters };
}

describe('distanceMeters', () => {
    it('measures short distances to within a metre', () => {
        expect(distanceMeters(OFFICE, north(OFFICE, 200))).toBeCloseTo(200, 0);
        expect(distanceMeters(OFFICE, OFFICE)).toBe(0);
    });
});

describe('allowedPlaces', () => {
    it('follows the arrangement', () => {
        expect(allowedPlaces(WorkArrangement.ON_SITE, [OFFICE], HOME)).toEqual([OFFICE]);
        expect(allowedPlaces(WorkArrangement.REMOTE, [OFFICE], HOME)).toEqual([HOME]);
        expect(allowedPlaces(WorkArrangement.HYBRID, [OFFICE], HOME)).toEqual([OFFICE, HOME]);
        expect(allowedPlaces(WorkArrangement.REMOTE, [OFFICE], null)).toEqual([]);
    });
});

describe('checkLocation', () => {
    it('is NO_LOCATION without a point and NO_APPROVED_PLACE without places', () => {
        expect(checkLocation(null, [OFFICE]).locationCheck).toBe(AttendanceLocationCheck.NO_LOCATION);
        const none = checkLocation(north(OFFICE, 0), []);
        expect(none.locationCheck).toBe(AttendanceLocationCheck.NO_APPROVED_PLACE);
        expect(none.distanceMeters).toBeNull();
    });

    it('is INSIDE within the radius plus the forgiven GPS error', () => {
        expect(checkLocation(north(OFFICE, 140), [OFFICE]).locationCheck).toBe(AttendanceLocationCheck.INSIDE);
        // 150 m radius + 60 m accuracy.
        expect(checkLocation(north(OFFICE, 200, 60), [OFFICE]).locationCheck).toBe(AttendanceLocationCheck.INSIDE);
    });

    it('caps the forgiven error, so a vague reading near the edge is LOW_ACCURACY', () => {
        const result = checkLocation(north(OFFICE, 400, 800), [OFFICE]);
        expect(result.locationCheck).toBe(AttendanceLocationCheck.LOW_ACCURACY);
    });

    it('is OUTSIDE when even the reading’s error cannot reach the place', () => {
        const result = checkLocation(north(OFFICE, 2_000, 30), [OFFICE]);
        expect(result.locationCheck).toBe(AttendanceLocationCheck.OUTSIDE);
        expect(result.checkedPlaceName).toBe('Head office');
        expect(result.distanceMeters).toBeGreaterThan(1_990);
        expect(result.distanceMeters).toBeLessThan(2_010);
    });

    it('checks against the place whose edge is closest and copies it', () => {
        // 600 m from the yard's centre (edge 100 m away) beats the office further off.
        const result = checkLocation(north(YARD, 600), [OFFICE, YARD]);
        expect(result.checkedPlaceName).toBe('Yard');
        expect(result.checkedPlaceRadiusMeters).toBe(500);
        expect(result.checkedPlaceLatitude).toBe(YARD.latitude);

        const atHome = checkLocation(north(HOME, 20), [OFFICE, HOME]);
        expect(atHome.locationCheck).toBe(AttendanceLocationCheck.INSIDE);
        expect(atHome.checkedPlaceKind).toBe(WorkPlaceKind.HOME);
    });
});
