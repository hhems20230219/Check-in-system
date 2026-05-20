const allowedLocations = [
    {
        name: "新興分隊",
        latitude: 22.63079897490298,
        longitude: 120.31128600119564,
        radiusMeter: 150
    },
    {
        name: "日月光K11",
        latitude: 22.722299033254743,
        longitude: 120.30463460899924,
        radiusMeter: 150
    },
    {
        name: "吉林街",
        latitude: 22.64429795493502,
        longitude: 120.30653292981619,
        radiusMeter: 150
    }
];

let currentLocationState = {
    hasLocation: false,
    isAllowed: false,
    locationName: "",
    distanceMeter: null,
    latitude: null,
    longitude: null,
    message: "尚未定位"
};

function requestCurrentLocation() {
    return new Promise(function (resolve) {
        if (!navigator.geolocation) {
            currentLocationState = {
                hasLocation: false,
                isAllowed: false,
                locationName: "",
                distanceMeter: null,
                latitude: null,
                longitude: null,
                message: "此瀏覽器不支援定位功能"
            };

            resolve(currentLocationState);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                const nearestLocation = findNearestAllowedLocation(latitude, longitude);

                currentLocationState = {
                    hasLocation: true,
                    isAllowed: nearestLocation.isAllowed,
                    locationName: nearestLocation.name,
                    distanceMeter: nearestLocation.distanceMeter,
                    latitude: latitude,
                    longitude: longitude,
                    message: nearestLocation.isAllowed
                        ? `已定位：${nearestLocation.name}，距離約 ${nearestLocation.distanceMeter} 公尺`
                        : `定位成功，但不在允許範圍內，最近位置：${nearestLocation.name}，距離約 ${nearestLocation.distanceMeter} 公尺`
                };

                resolve(currentLocationState);
            },
            function () {
                currentLocationState = {
                    hasLocation: false,
                    isAllowed: false,
                    locationName: "",
                    distanceMeter: null,
                    latitude: null,
                    longitude: null,
                    message: "定位失敗，請確認瀏覽器定位權限"
                };

                resolve(currentLocationState);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

function findNearestAllowedLocation(latitude, longitude) {
    let nearest = null;

    allowedLocations.forEach(function (location) {
        const distance = calculateDistanceMeter(
            latitude,
            longitude,
            location.latitude,
            location.longitude
        );

        if (nearest === null || distance < nearest.distanceMeter) {
            nearest = {
                name: location.name,
                distanceMeter: Math.round(distance),
                isAllowed: distance <= location.radiusMeter
            };
        }
    });

    return nearest;
}

function calculateDistanceMeter(lat1, lon1, lat2, lon2) {
    const earthRadiusMeter = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeter * c;
}

function toRadians(value) {
    return value * Math.PI / 180;
}

function isLocationRequired(workType) {
    return workType === "協勤" || workType === "常年訓練";
}
