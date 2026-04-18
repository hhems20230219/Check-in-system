window.AttendanceApi = (function () {
    const API_URL = 'https://script.google.com/macros/s/AKfycbwA1WejPQ8bFPtTpZ6u0ustwzMEkruwDl5-5iJPaT2wudookaVI1IdQ4UTl9vPjmsDl/exec';

    async function post(action, payload = {}) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
                action,
                ...payload
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'API 錯誤');
        }

        return result;
    }

    async function getInitData() {
        return await post('getInitData');
    }

    async function checkIn(payload) {
        return await post('checkIn', payload);
    }

    async function checkOut(payload) {
        return await post('checkOut', payload);
    }

    return {
        getInitData,
        checkIn,
        checkOut
    };
})();
