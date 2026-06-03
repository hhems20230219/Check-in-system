// 定位設定集中管理
const positionConfig = {
  enableLocation: true,
  allowedDistanceMeters: 250,
  timeoutMilliseconds: 10000,
  maximumAgeMilliseconds: 0,
  enableHighAccuracy: true,
  locations: [
    {
      locationName: "吉林街",
      latitude: 22.644384539357215,
      longitude: 120.3064311681963
    },
    {
      locationName: "日月光K11",
      latitude: 22.722313701417736,
      longitude: 120.30458918139558
    },
    {
      locationName: "新興分隊",
      latitude: 22.630696535088223,
      longitude: 120.31130951654032
    }
  ]
};

// 計算兩點距離，單位：公尺
function calculateDistanceMeters(latitude1, longitude1, latitude2, longitude2) {
  const earthRadius = 6371000;
  const radian1 = latitude1 * Math.PI / 180;
  const radian2 = latitude2 * Math.PI / 180;
  const deltaLatitude = (latitude2 - latitude1) * Math.PI / 180;
  const deltaLongitude = (longitude2 - longitude1) * Math.PI / 180;

  const value =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(radian1) * Math.cos(radian2) *
    Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

// 取得定位並判斷是否在允許範圍
function getCurrentLocationResult() {
  appLog("INFO", "開始取得定位");

  return new Promise(function (resolve) {
    if (!positionConfig.enableLocation) {
      appLog("WARN", "定位功能已關閉");

      resolve({
        success: true,
        status: "disabled",
        message: "定位功能已關閉，系統允許略過定位檢查",
        data: {
          isAllowed: true,
          nearestLocationName: "-",
          distanceMeters: 0,
          latitude: null,
          longitude: null
        }
      });
      return;
    }

    if (!isSecureLocationEnvironment()) {
      resolve({
        success: false,
        status: "failed",
        message: "定位失敗：請使用 HTTPS 或 localhost 開啟系統",
        data: null
      });
      return;
    }

    if (!navigator.geolocation) {
      appLog("ERROR", "瀏覽器不支援 Geolocation API");

      resolve({
        success: false,
        status: "failed",
        message: "定位失敗：瀏覽器不支援定位",
        data: null
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        const nearestResult = getNearestLocation(latitude, longitude);

        if (!nearestResult) {
          appLog("ERROR", "定位點設定不存在");

          resolve({
            success: false,
            status: "failed",
            message: "定位失敗：尚未設定允許地點",
            data: null
          });
          return;
        }

        const isAllowed = nearestResult.distanceMeters <= positionConfig.allowedDistanceMeters;

        appLog("INFO", "定位完成", {
          latitude: latitude,
          longitude: longitude,
          nearestLocationName: nearestResult.location.locationName,
          distanceMeters: nearestResult.distanceMeters,
          isAllowed: isAllowed
        });

        resolve({
          success: true,
          status: isAllowed ? "allowed" : "outOfRange",
          message: isAllowed
            ? `定位成功：目前位於允許範圍內，最近位置 ${nearestResult.location.locationName}，距離 ${Math.round(nearestResult.distanceMeters)} 公尺`
            : `定位超出範圍：最近位置 ${nearestResult.location.locationName}，距離 ${Math.round(nearestResult.distanceMeters)} 公尺，允許範圍 ${positionConfig.allowedDistanceMeters} 公尺`,
          data: {
            isAllowed: isAllowed,
            nearestLocationName: nearestResult.location.locationName,
            distanceMeters: Math.round(nearestResult.distanceMeters),
            latitude: latitude,
            longitude: longitude
          }
        });
      },
      function (error) {
        const errorMessage = getGeolocationErrorMessage(error);

        appLog("ERROR", "定位失敗", {
          code: error.code,
          message: error.message,
          displayMessage: errorMessage
        });

        resolve({
          success: false,
          status: "failed",
          message: errorMessage,
          data: null
        });
      },
      {
        enableHighAccuracy: positionConfig.enableHighAccuracy,
        timeout: positionConfig.timeoutMilliseconds,
        maximumAge: positionConfig.maximumAgeMilliseconds
      }
    );
  });
}

// 取得最近的允許地點
function getNearestLocation(latitude, longitude) {
  if (!positionConfig.locations || positionConfig.locations.length === 0) {
    return null;
  }

  let nearestLocation = null;
  let nearestDistance = Number.MAX_VALUE;

  positionConfig.locations.forEach(function (location) {
    const distance = calculateDistanceMeters(
      latitude,
      longitude,
      location.latitude,
      location.longitude
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestLocation = location;
    }
  });

  return {
    location: nearestLocation,
    distanceMeters: nearestDistance
  };
}

// 判斷是否為可使用定位的環境
function isSecureLocationEnvironment() {
  const isHttps = location.protocol === "https:";
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  if (!isHttps && !isLocalhost) {
    appLog("ERROR", "定位需要 HTTPS 或 localhost", {
      protocol: location.protocol,
      hostname: location.hostname
    });
  }

  return isHttps || isLocalhost;
}

// 轉換定位錯誤訊息
function getGeolocationErrorMessage(error) {
  if (!error) {
    return "定位失敗：未知錯誤";
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "定位失敗：請允許瀏覽器定位權限";
    case error.POSITION_UNAVAILABLE:
      return "定位失敗：目前無法取得 GPS 位置，請開啟定位服務後重試";
    case error.TIMEOUT:
      return "定位失敗：定位逾時，請移至空曠處或重新定位";
    default:
      return "定位失敗：未知定位錯誤";
  }
}
