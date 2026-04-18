window.LocationService = (function () {
    const ALLOWED_DISTANCE_METERS = 300;

    const CHECK_POINTS = [
        {
            name: '新興分隊',
            latitude: 22.63077534288625,
            longitude: 120.31126055555221
        }
    // },
    //     // {
    //     //     name: '吉林街',
    //     //     latitude: 22.6444240928209,
    //     //     longitude: 120.30656976083264
    //     // }
    ];

    function getErrorMessage(error) {
        if (!error) {
            return '定位失敗';
        }

        if (error.code === 1) {
            return '定位被拒絕，請允許瀏覽器存取位置';
        }

        if (error.code === 2) {
            return '無法取得定位資訊';
        }

        if (error.code === 3) {
            return '定位逾時';
        }

        return '定位失敗';
    }

    function toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        const earthRadius = 6371000;
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }

    function compareLocation(latitude, longitude) {
        const distances = CHECK_POINTS.map(function (point) {
            const distanceMeters = calculateDistanceMeters(
                latitude,
                longitude,
                point.latitude,
                point.longitude
            );

            return {
                name: point.name,
                latitude: point.latitude,
                longitude: point.longitude,
                distanceMeters: distanceMeters
            };
        });

        distances.sort(function (a, b) {
            return a.distanceMeters - b.distanceMeters;
        });

        const nearest = distances[0];
        const matchedPoint = distances.find(function (item) {
            return item.distanceMeters <= ALLOWED_DISTANCE_METERS;
        });

        return {
            inRange: !!matchedPoint,
            nearestPoint: nearest || null,
            matchedPoint: matchedPoint || null,
            nearestDistanceMeters: nearest ? nearest.distanceMeters : null,
            allowedDistanceMeters: ALLOWED_DISTANCE_METERS,
            distances: distances
        };
    }

    function getCurrentLocation() {
        return new Promise(function (resolve) {
            if (!navigator.geolocation) {
                resolve({
                    success: false,
                    inRange: false,
                    message: '此裝置不支援定位功能'
                });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                function (position) {
                    const latitude = Number(position.coords.latitude);
                    const longitude = Number(position.coords.longitude);
                    const compareResult = compareLocation(latitude, longitude);

                    resolve({
                        success: true,
                        message: compareResult.inRange ? '定位成功' : '定位失敗',
                        latitude: latitude.toFixed(6),
                        longitude: longitude.toFixed(6),
                        inRange: compareResult.inRange,
                        nearestDistanceMeters: compareResult.nearestDistanceMeters,
                        allowedDistanceMeters: compareResult.allowedDistanceMeters,
                        matchedPoint: compareResult.matchedPoint,
                        nearestPoint: compareResult.nearestPoint,
                        distances: compareResult.distances,
                        raw: position.coords
                    });
                },
                function (error) {
                    resolve({
                        success: false,
                        inRange: false,
                        message: getErrorMessage(error),
                        error: error
                    });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    return {
        getCurrentLocation: getCurrentLocation
    };
})();
