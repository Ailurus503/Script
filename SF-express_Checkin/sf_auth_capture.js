const KEY = "sfexpress_native_auth_v2";

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
    if (!$request || !$request.headers) {
        console.log("[SF V2] 未获取到请求信息");
        $done({});
        return;
    }

    const src = $request.headers;

    // 只保存可能与顺丰原生认证有关的请求头。
    // 不在日志中输出任何真实值。
    const auth = {
        capturedAt: Date.now(),

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
        console.log("[SF V2] 当前请求未包含完整原生认证信息");
        $done({});
        return;
    }

    const ok = $persistentStore.write(
        JSON.stringify(auth),
        KEY
    );

    if (ok) {
        console.log("[SF V2] 原生认证信息已更新");
        $notification.post(
            "顺丰 V2",
            "原生认证已捕获",
            "现在可以立即运行 V2 测试脚本"
        );
    } else {
        console.log("[SF V2] 保存失败");
    }

} catch (e) {
    console.log("[SF V2] 捕获异常：" + e);
}

$done({});