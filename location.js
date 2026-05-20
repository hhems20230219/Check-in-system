const locationConfig = {
    allowDistanceMeters: 300,
    places: [
        { name: "新興分隊", lat: 22.63079897490298, lng: 120.31128600119564 },
        { name: "日月光K11", lat: 22.722299033254743, lng: 120.30463460899924 },
        { name: "吉林街", lat: 22.64429795493502, lng: 120.30653292981619 }
    ]
};

let currentLocationState = {
    success: false,
    allowed: false,
    nearestName: "",
    distanceMeters: null,
    message: "尚未定位"
};

function getDistanceMeters(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
    return value * Math.PI / 180;
}

function findNearestPlace(lat, lng) {
    let nearest = null;

    locationConfig.places.forEach(place => {
        const distance = getDistanceMeters(lat, lng, place.lat, place.lng);

        if (!nearest || distance < nearest.distanceMeters) {
            nearest = {
                name: place.name,
                distanceMeters: distance
            };
        }
    });

    return nearest;
}

function updateLocationUi() {
    $("#locationStatus").text(currentLocationState.message);

    if (currentLocationState.success) {
        $("#nearestLocation").text(
            `最近位置：${currentLocationState.nearestName}，距離 ${Math.round(currentLocationState.distanceMeters)} 公尺`
        );
        $("#locationAllowed").text(currentLocationState.allowed ? "允許簽到/簽退：是" : "允許簽到/簽退：否");
    } else {
        $("#nearestLocation").text("最近位置：-");
        $("#locationAllowed").text("允許簽到/簽退：否");
    }
}

function refreshLocation() {
    console.log("開始取得目前定位");

    if (!navigator.geolocation) {
        currentLocationState = {
            success: false,
            allowed: false,
            nearestName: "",
            distanceMeters: null,
            message: "瀏覽器不支援定位功能"
        };
        updateLocationUi();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const nearest = findNearestPlace(lat, lng);

            currentLocationState = {
                success: true,
                allowed: nearest.distanceMeters <= locationConfig.allowDistanceMeters,
                nearestName: nearest.name,
                distanceMeters: nearest.distanceMeters,
                message: "定位成功"
            };

            console.log("定位成功，已更新定位狀態");
            updateLocationUi();
        },
        error => {
            currentLocationState = {
                success: false,
                allowed: false,
                nearestName: "",
                distanceMeters: null,
                message: `定位失敗：${error.message}`
            };

            console.log("定位失敗，請確認瀏覽器定位權限");
            updateLocationUi();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function isLocationRequired(serviceType) {
    return serviceType === "協勤" || serviceType === "常年訓練";
}

function canOperateByLocation(serviceType) {
    if (!isLocationRequired(serviceType)) {
        return true;
    }

    return currentLocationState.success && currentLocationState.allowed;
}
