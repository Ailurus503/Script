/*
 * Vae+ 请求捕获 / 持久化
 * Vae_GetAuth.js
 *
 * Loon 类型：
 * http-response
 *
 * 表达式：
 * ^https:\/\/api1\.starfans\.com\/auth\/
 *
 * 设置：
 * 响应 Body：开启
 * 二进制 Body：关闭
 *
 * 保存：
 * VAE_STATUS_REQUEST
 *   = /USER_HOME/getRecord.json
 *
 * VAE_SIGN_REQUEST
 *   = /USER_HOME/getRecordByMonth.json
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY   = "VAE_SIGN_REQUEST";

function log(message) {
    console.log("[Vae+ Auth] " + message);
}

function finish() {
    /*
     * 关键：
     * 原样返回服务器响应。
     * 不修改 status / headers / body。
     */
    $done({
        response: $response
    });
}

function parseJSON(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function cleanHeaders(headers) {
    const result = {};

    if (!headers) {
        return result;
    }

    Object.keys(headers).forEach(function (key) {

        const lower = key.toLowerCase();

        /*
         * 重放请求时这些 Header
         * 交给 Loon / 网络栈重新生成。
         */

        if (
            lower === "content-length" ||
            lower === "host" ||
            lower === "connection" ||
            lower === "accept-encoding"
        ) {
            return;
        }

        result[key] = headers[key];
    });

    return result;
}

function saveTemplate(key, action) {

    if (
        typeof $request === "undefined" ||
        !$request
    ) {
        log("无法读取 $request");
        return false;
    }

    const body =
        typeof $request.body === "string"
            ? $request.body
            : "";

    if (!body) {
        log(
            action +
            "：请求 Body 为空，未保存"
        );

        return false;
    }

    const template = {

        version: 3,

        action: action,

        url: $request.url || "",

        method:
            ($request.method || "POST")
                .toUpperCase(),

        headers:
            cleanHeaders(
                $request.headers || {}
            ),

        body: body,

        updateTime: Date.now()
    };

    try {

        const success =
            $persistentStore.write(
                JSON.stringify(template),
                key
            );

        if (success === false) {
            log(
                action +
                "：持久化失败"
            );

            return false;
        }

        log(
            "已保存：" +
            action
        );

        log(
            "Body length: " +
            body.length
        );

        return true;

    } catch (e) {

        log(
            "保存异常：" +
            String(e)
        );

        return false;
    }
}

function getRequestVar() {

    if (
        typeof $response === "undefined" ||
        !$response ||
        typeof $response.body !== "string"
    ) {
        return "";
    }

    const json =
        parseJSON($response.body);

    if (!json) {
        return "";
    }

    /*
     * Vae+ /auth/ 响应中已经验证
     * requestVar 会暴露实际内部 Action。
     */

    if (
        typeof json.requestVar === "string"
    ) {
        return json.requestVar;
    }

    return "";
}

function main() {

    try {

        const requestVar =
            getRequestVar();

        /*
         * 非目标 /auth/ 请求：
         * 什么都不做。
         */

        if (!requestVar) {
            return;
        }

        /*
         * 注意：
         * 必须先判断 getRecordByMonth。
         *
         * 因为它的名字包含 getRecord，
         * 如果反过来判断可能误分类。
         */

        if (
            requestVar.indexOf(
                "/USER_HOME/getRecordByMonth.json"
            ) !== -1
        ) {

            const saved =
                saveTemplate(
                    SIGN_KEY,
                    "/USER_HOME/getRecordByMonth.json"
                );

            if (saved) {

                log(
                    "签到请求模板更新成功"
                );

                $notification.post(
                    "Vae+ 授权更新",
                    "签到请求已保存",
                    "getRecordByMonth"
                );
            }

            return;
        }

        if (
            requestVar.indexOf(
                "/USER_HOME/getRecord.json"
            ) !== -1
        ) {

            const saved =
                saveTemplate(
                    STATUS_KEY,
                    "/USER_HOME/getRecord.json"
                );

            if (saved) {
                log(
                    "状态查询模板更新成功"
                );
            }

            return;
        }

    } catch (e) {

        /*
         * 捕获脚本自身即使报错，
         * 也不能影响 App 原始响应。
         */

        log(
            "捕获异常：" +
            String(e)
        );
    }
}


/*
 * 无论上面发生什么，
 * 最终都执行 finish()，
 * 将原响应交还给 Loon。
 */

try {

    main();

} catch (e) {

    log(
        "主程序异常：" +
        String(e)
    );

} finally {

    finish();
}