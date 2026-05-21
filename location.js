/* 定位設定與狀態管理 */
const locationManager = {
    enableLocationCheck: true,
    allowedRadiusMeters: 300,
    isLocationValid: false,
    lastPosition: null,

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
    ],

    /* 判斷指定協勤種類是否需要定位 */
    isLocationRequired(workType) {
        return workType === "協勤" || workType === "常年訓練";
    },

    /* 執行瀏覽器定位 */
    locate() {
        return new Promise((resolve) => {
            if (!this.enableLocationCheck) {
                this.isLocationValid = true;
                this.updateLocationStatus("定位檢查已關閉，目前允許操作。", true);
                resolve({
                    success: true,
                    message: "定位檢查已關閉"
                });
                return;
            }

            if (!navigator.geolocation) {
                this.isLocationValid = false;
                this.updateLocationStatus("此瀏覽器不支援 GPS 定位。", false);
                resolve({
                    success: false,
                    message: "此瀏覽器不支援 GPS 定位"
                });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;

                    const nearest = this.findNearestLocation(latitude, longitude);
                    this.lastPosition = {
                        latitude,
                        longitude,
                        nearest
                    };

                    this.isLocationValid = nearest.distance <= this.allowedRadiusMeters;

                    if (this.isLocationValid) {
                        this.updateLocationStatus(
                            `定位成功：目前靠近 ${nearest.name}，距離約 ${Math.round(nearest.distance)} 公尺。`,
                            true
                        );
                    } else {
                        this.updateLocationStatus(
                            `定位失敗：最近位置為 ${nearest.name}，距離約 ${Math.round(nearest.distance)} 公尺，超過允許範圍。`,
                            false
                        );
                    }

                    resolve({
                        success: this.isLocationValid,
                        message: this.isLocationValid ? "定位成功" : "定位超出範圍",
                        nearest
                    });
                },
                () => {
                    this.isLocationValid = false;
                    this.updateLocationStatus("定位失敗，請確認 GPS 權限是否已開啟。", false);
                    resolve({
                        success: false,
                        message: "定位失敗"
                    });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    },

    /* 找出最近合法位置 */
    findNearestLocation(latitude, longitude) {
        let nearest = null;

        this.allowedLocations.forEach((item) => {
            const distance = this.calculateDistanceMeters(
                latitude,
                longitude,
                item.latitude,
                item.longitude
            );

            if (!nearest || distance < nearest.distance) {
                nearest = {
                    name: item.name,
                    distance
                };
            }
        });

        return nearest;
    },

    /* Haversine 距離計算 */
    calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        const earthRadius = 6371000;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
            Math.cos(this.toRadians(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return earthRadius * c;
    },

    /* 角度轉弧度 */
    toRadians(value) {
        return value * Math.PI / 180;
    },

    /* 更新定位文字 */
    updateLocationStatus(message, isSuccess) {
        $("#locationStatus")
            .removeClass("text-muted text-success text-danger")
            .addClass(isSuccess ? "text-success" : "text-danger")
            .text(message);
    }
};
