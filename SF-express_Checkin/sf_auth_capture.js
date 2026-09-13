const KEY = "sfexpress_native_auth_v21";

function getHeader(headers, name) {
    const target = name.toLowerCase();
    for (const key in headers) {
        if (key.toLowerCase() === target) {
            return headers[key];
        }
    }
    return "";
}

try {
    if (!$request || !$request.headers || !$request.url) {
        console.log("[SF V2.1] 未获取到请求信息");
        $done({});
        return;
    }

    const method = ($request.method || "GET").toUpperCase();

    // 这一版只测试 GET，避免 POST body 影响签名判断
    if (method !== "GET") {
        $done({});
        return;
    }

    const src = $request.headers;

    const auth = {
        capturedAt: Date.now(),
        url: $request.url,
        method: method,

        token: getHeader(src, "token"),
        syttoken: getHeader(src, "syttoken"),
        requestsign: getHeader(src, "requestsign"),
        timeinterval: getHeader(src, "timeinterval"),

        deviceid: getHeader(src, "deviceid"),
        srcdeviceguid: getHeader(src, "srcdeviceguid"),
        hsession: getHeader(src, "HSESSION"),

        userAgent: getHeader(src, "User-Agent"),
        accept: getHeader(src, "Accept"),
        contentType: getHeader(src, "Content-Type"),

        appVersion: getHeader(src, "appversion"),
        osVersion: getHeader(src, "osversion"),
        platform: getHeader(src, "platform"),
        channel: getHeader(src, "channel")
    };

    if (!auth.token || !auth.requestsign || !auth.timeinterval) {
        console.log("[SF V2.1] 当前 GET 未包含完整认证字段");
        $done({});
        return;
    }

    const ok = $persistentStore.write(
        JSON.stringify(auth),
        KEY
    );

    if (ok) {
        console.log("[SF V2.1] 已捕获一组 GET 原生认证");

        $notification.post(
            "顺丰 V2.1",
            "原生 GET 认证已捕获",
            "请立即运行 V2.1 测试脚本"
        );
    } else {
        console.log("[SF V2.1] 保存认证失败");
    }

} catch (e) {
    console.log("[SF V2.1] 捕获异常：" + e);
}

$done({});