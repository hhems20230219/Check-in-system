/* ==============================
   GPS 定位模組
   負責：定位、距離計算、合法位置判斷
   ============================== */

const locationConfig = {
    enableLocationCheck: true,
    allowedRadiusMeters: 300,
    allowedLocations: [
        {
            name: "新興分隊",
            latitude: 22.63079897490298,
            longitude: 120.31128600119564
        },
        {
            name: "日月光K11",
            latitude: 22.722299033254743,
            longitude: 120.30463460899924
        },
        {
            name: "吉林街",
            latitude: 22.64429795493502,
            longitude: 120.30653292981619
        }
    ]
};

const locationState = {
    isValid: false,
    currentLatitude: null,
    currentLongitude: null,
    nearestLocationName: "",
    nearestDistanceMeters: null,
    message: "尚未定位"
};

/* ==============================
   計算兩點 GPS 距離
   ============================== */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;
    const radLat1 = lat1 * Math.PI / 180;
    const radLat2 = lat2 * Math.PI / 180;
    const deltaLat = (lat2 - lat1) * Math.PI / 180;
    const deltaLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(radLat1) * Math.cos(radLat2) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
}

/* ==============================
   檢查目前座標是否在合法範圍內
   ============================== */
function checkAllowedLocation(latitude, longitude) {
    let nearestLocation = null;
    let nearestDistance = Number.MAX_VALUE;

    locationConfig.allowedLocations.forEach(function (item) {
        const distance = calculateDistanceMeters(
            latitude,
            longitude,
            item.latitude,
            item.longitude
        );

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestLocation = item;
        }
    });

    const isValid = nearestDistance <= locationConfig.allowedRadiusMeters;

    return {
        isValid: isValid,
        nearestLocationName: nearestLocation ? nearestLocation.name : "",
        nearestDistanceMeters: nearestDistance
    };
}

/* ==============================
   取得目前定位
   ============================== */
function locateCurrentPosition(onSuccess, onError) {
    if (!locationConfig.enableLocationCheck) {
        locationState.isValid = true;
        locationState.message = "定位驗證已關閉";
        if (onSuccess) onSuccess(locationState);
        return;
    }

    if (!navigator.geolocation) {
        locationState.isValid = false;
        locationState.message = "此瀏覽器不支援定位功能";
        if (onError) onError(locationState);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const result = checkAllowedLocation(latitude, longitude);

            locationState.currentLatitude = latitude;
            locationState.currentLongitude = longitude;
            locationState.isValid = result.isValid;
            locationState.nearestLocationName = result.nearestLocationName;
            locationState.nearestDistanceMeters = result.nearestDistanceMeters;
            locationState.message = result.isValid
                ? `定位成功：${result.nearestLocationName}，距離約 ${Math.round(result.nearestDistanceMeters)} 公尺`
                : `定位失敗：最近位置為 ${result.nearestLocationName}，距離約 ${Math.round(result.nearestDistanceMeters)} 公尺`;

            if (onSuccess) onSuccess(locationState);
        },
        function () {
            locationState.isValid = false;
            locationState.message = "定位失敗，請確認 GPS 權限是否已開啟";
            if (onError) onError(locationState);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}
