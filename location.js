/* location.js：負責 GPS 定位、距離計算、合法地點判斷 */

const attendanceLocation = (function () {
    const config = {
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

    let currentState = {
        isLocated: false,
        isValid: false,
        nearestLocationName: "",
        distanceMeters: null,
        message: "尚未定位"
    };

    /* 計算兩點距離，單位：公尺 */
    function getDistanceMeters(lat1, lon1, lat2, lon2) {
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

    /* 找出最近的合法地點 */
    function findNearestLocation(latitude, longitude) {
        let nearest = null;

        config.allowedLocations.forEach(function (item) {
            const distance = getDistanceMeters(
                latitude,
                longitude,
                item.latitude,
                item.longitude
            );

            if (!nearest || distance < nearest.distanceMeters) {
                nearest = {
                    name: item.name,
                    distanceMeters: distance
                };
            }
        });

        return nearest;
    }

    /* 取得定位失敗提醒文字 */
    function getLocationFailMessage(error) {
        const helpText = "可嘗試開啟 WiFi 或藍牙，並確認瀏覽器定位權限已允許。";

        if (!error) {
            return "定位失敗，" + helpText;
        }

        if (error.code === error.PERMISSION_DENIED) {
            return "定位失敗：瀏覽器定位權限被拒絕，請允許此網站使用定位。";
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
            return "定位失敗：目前無法取得位置，" + helpText;
        }

        if (error.code === error.TIMEOUT) {
            return "定位逾時：目前定位時間過久，" + helpText;
        }

        return "定位失敗，" + helpText;
    }

    /* 執行定位 */
    function refreshLocation(onDone) {
        if (!config.enableLocationCheck) {
            currentState = {
                isLocated: true,
                isValid: true,
                nearestLocationName: "定位檢查已關閉",
                distanceMeters: 0,
                message: "定位功能已關閉，目前視為定位成功"
            };

            onDone(currentState);
            return;
        }

        if (!navigator.geolocation) {
            currentState = {
                isLocated: false,
                isValid: false,
                nearestLocationName: "",
                distanceMeters: null,
                message: "此瀏覽器不支援 GPS 定位，請改用支援定位功能的瀏覽器"
            };

            onDone(currentState);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                const nearest = findNearestLocation(latitude, longitude);
                const isValid = nearest.distanceMeters <= config.allowedRadiusMeters;

                currentState = {
                    isLocated: true,
                    isValid: isValid,
                    nearestLocationName: nearest.name,
                    distanceMeters: nearest.distanceMeters,
                    message: isValid
                        ? `定位成功：靠近 ${nearest.name}，距離約 ${Math.round(nearest.distanceMeters)} 公尺`
                        : `定位失敗：最近地點為 ${nearest.name}，距離約 ${Math.round(nearest.distanceMeters)} 公尺，超出允許範圍 ${config.allowedRadiusMeters} 公尺`
                };

                onDone(currentState);
            },
            function (error) {
                currentState = {
                    isLocated: false,
                    isValid: false,
                    nearestLocationName: "",
                    distanceMeters: null,
                    message: getLocationFailMessage(error)
                };

                onDone(currentState);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }

    /* 提供外部讀取目前狀態 */
    function getCurrentState() {
        return currentState;
    }

    return {
        config: config,
        refreshLocation: refreshLocation,
        getCurrentState: getCurrentState
    };
})();
