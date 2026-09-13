const KEY = "sfexpress_native_auth_v21";

function finish(title, subtitle, body) {
    $notification.post(title, subtitle, body);
    $done();
}

function addHeader(obj, name, value) {
    if (
        value !== undefined &&
        value !== null &&
        String(value).length > 0
    ) {
        obj[name] = String(value);
    }
}

try {
    const raw = $persistentStore.read(KEY);

    if (!raw) {
        finish(
            "顺丰 V2.1",
            "没有认证信息",
            "请先打开顺丰 App 捕获一次 GET 请求"
        );
        return;
    }

    let auth;

    try {
        auth = JSON.parse(raw);
    } catch (e) {
        finish(
            "顺丰 V2.1",
            "认证数据损坏",
            "请重新捕获"
        );
        return;
    }

    if (!auth.url) {
        finish(
            "顺丰 V2.1",
            "缺少原请求 URL",
            "请重新捕获"
        );
        return;
    }

    if ((auth.method || "").toUpperCase() !== "GET") {
        finish(
            "顺丰 V2.1",
            "不是 GET 请求",
            "请重新捕获"
        );
        return;
    }

    const age =
        Date.now() -
        Number(auth.capturedAt || 0);

    const headers = {};

    addHeader(headers, "token", auth.token);
    addHeader(headers, "syttoken", auth.syttoken);
    addHeader(headers, "requestsign", auth.requestsign);
    addHeader(headers, "timeinterval", auth.timeinterval);

    addHeader(headers, "deviceid", auth.deviceid);
    addHeader(headers, "srcdeviceguid", auth.srcdeviceguid);
    addHeader(headers, "HSESSION", auth.hsession);

    addHeader(headers, "User-Agent", auth.userAgent);
    addHeader(
        headers,
        "Accept",
        auth.accept || "application/json"
    );

    addHeader(headers, "Content-Type", auth.contentType);
    addHeader(headers, "appversion", auth.appVersion);
    addHeader(headers, "osversion", auth.osVersion);
    addHeader(headers, "platform", auth.platform);
    addHeader(headers, "channel", auth.channel);

    console.log(
        "[SF V2.1] 重放原始 GET"
    );

    console.log(
        "[SF V2.1] 认证年龄：" +
        Math.round(age / 1000) +
        " 秒"
    );

    // 日志只打印 URL，不打印任何 token
    console.log(
        "[SF V2.1] URL：" + auth.url
    );

    $httpClient.get(
        {
            url: auth.url,
            headers: headers,
            timeout: 15
        },
        function (error, response, data) {

            if (error) {
                console.log(
                    "[SF V2.1] HTTPClient Error：" +
                    String(error)
                );

                finish(
                    "顺丰 V2.1",
                    "请求没有正常完成",
                    String(error) +
                    "\n认证年龄：" +
                    Math.round(age / 1000) +
                    " 秒"
                );
                return;
            }

            const status =
                response && response.status
                    ? response.status
                    : "未知";

            console.log(
                "[SF V2.1] HTTP Status：" +
                status
            );

            if (!data) {
                finish(
                    "顺丰 V2.1",
                    "收到空响应",
                    "HTTP " +
                    status +
                    "\n认证年龄：" +
                    Math.round(age / 1000) +
                    " 秒"
                );
                return;
            }

            let obj = null;

            try {
                obj = JSON.parse(data);
            } catch (e) {
                console.log(
                    "[SF V2.1] 返回内容不是 JSON"
                );
            }

            if (obj) {
                console.log(
                    "[SF V2.1] Response：" +
                    JSON.stringify(obj)
                );

                const msg =
                    obj.errorMessage ||
                    obj.message ||
                    obj.msg ||
                    "";

                const code =
                    obj.errorCode ||
                    obj.code ||
                    "";

                if (
                    obj.success === true ||
                    obj.status === true
                ) {
                    finish(
                        "顺丰 V2.1",
                        "原生认证可以重放",
                        "HTTP " +
                        status +
                        "\n认证年龄：" +
                        Math.round(age / 1000) +
                        " 秒"
                    );
                    return;
                }

                finish(
                    "顺丰 V2.1",
                    "服务器已返回结果",
                    "HTTP " +
                    status +
                    (code ? "\nCode：" + code : "") +
                    (msg ? "\n" + msg : "") +
                    "\n认证年龄：" +
                    Math.round(age / 1000) +
                    " 秒"
                );

                return;
            }

            finish(
                "顺丰 V2.1",
                "服务器已响应",
                "HTTP " +
                status +
                "\n认证年龄：" +
                Math.round(age / 1000) +
                " 秒"
            );
        }
    );

} catch (e) {
    console.log(
        "[SF V2.1] 脚本异常：" + e
    );

    finish(
        "顺丰 V2.1",
        "脚本异常",
        String(e)
    );
}