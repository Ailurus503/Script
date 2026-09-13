const KEY = "sfexpress_native_auth_v2";

const URL =
    "https://ucmp.sf-express.com/proxy/esgcempcore/memberNonactivity/integralSignV2Service/getTodaySign";

function finish(title, subtitle, body) {
    $notification.post(title, subtitle, body);
    $done();
}

function addHeader(obj, name, value) {
    if (value !== undefined &&
        value !== null &&
        String(value).length > 0) {
        obj[name] = String(value);
    }
}

try {
    const raw = $persistentStore.read(KEY);

    if (!raw) {
        finish(
            "顺丰 V2",
            "没有认证信息",
            "请先打开顺丰 App，让捕获脚本运行一次"
        );
        return;
    }

    let auth;

    try {
        auth = JSON.parse(raw);
    } catch (e) {
        finish(
            "顺丰 V2",
            "认证数据损坏",
            "请重新打开顺丰 App 捕获一次"
        );
        return;
    }

    const age = Date.now() - Number(auth.capturedAt || 0);

    const headers = {};

    addHeader(headers, "token", auth.token);
    addHeader(headers, "syttoken", auth.syttoken);
    addHeader(headers, "requestsign", auth.requestsign);
    addHeader(headers, "timeinterval", auth.timeinterval);

    addHeader(headers, "deviceid", auth.deviceid);
    addHeader(headers, "srcdeviceguid", auth.srcdeviceguid);
    addHeader(headers, "HSESSION", auth.hsession);

    addHeader(headers, "User-Agent", auth.userAgent);
    addHeader(headers, "Accept", auth.accept || "application/json");
    addHeader(headers, "Content-Type", auth.contentType);

    addHeader(headers, "appversion", auth.appVersion);
    addHeader(headers, "osversion", auth.osVersion);
    addHeader(headers, "platform", auth.platform);
    addHeader(headers, "channel", auth.channel);

    console.log(
        "[SF V2] 开始测试，认证信息年龄：" +
        Math.round(age / 1000) +
        " 秒"
    );

    $httpClient.get(
        {
            url: URL,
            headers: headers,
            timeout: 15
        },
        function (error, response, data) {

            if (error) {
                console.log("[SF V2] 网络错误：" + error);

                finish(
                    "顺丰 V2",
                    "请求失败",
                    String(error)
                );
                return;
            }

            const status =
                response && response.status
                    ? response.status
                    : "未知";

            console.log("[SF V2] HTTP Status: " + status);

            let obj;

            try {
                obj = JSON.parse(data);
            } catch (e) {
                console.log("[SF V2] 非 JSON 响应");

                finish(
                    "顺丰 V2",
                    "服务器返回异常",
                    "HTTP " + status
                );
                return;
            }

            // 不把 token / requestsign 等信息打印出来
            console.log(
                "[SF V2] Response: " +
                JSON.stringify(obj)
            );

            if (obj.success === true) {

                const info = obj.obj || {};

                let msg = "";

                if (typeof info.signed !== "undefined") {
                    msg +=
                        "签到状态：" +
                        (info.signed ? "已签到" : "未签到");
                }

                if (info.dayCount !== undefined) {
                    msg +=
                        "\n连续签到：" +
                        info.dayCount +
                        " 天";
                }

                if (info.bubbleText) {
                    msg += "\n" + info.bubbleText;
                }

                msg +=
                    "\n认证年龄：" +
                    Math.round(age / 1000) +
                    " 秒";

                finish(
                    "顺丰 V2",
                    "原生认证复用成功",
                    msg
                );

                return;
            }

            const errorCode =
                obj.errorCode ||
                obj.code ||
                "";

            const errorMessage =
                obj.errorMessage ||
                obj.message ||
                "未知错误";

            finish(
                "顺丰 V2",
                "原生认证复用失败",
                (errorCode ? errorCode + " · " : "") +
                errorMessage +
                "\n认证年龄：" +
                Math.round(age / 1000) +
                " 秒"
            );
        }
    );

} catch (e) {
    console.log("[SF V2] 脚本异常：" + e);

    finish(
        "顺丰 V2",
        "脚本异常",
        String(e)
    );
}