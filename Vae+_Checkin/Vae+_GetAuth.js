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
 *
 * 通知逻辑：
 * - 状态查询模板：静默更新
 * - 签到请求模板：
 *   首次捕获或模板真正变化时通知
 * - 完全相同的重复捕获：不通知
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY = "VAE_SIGN_REQUEST";

function log(message) {
    console.log("[Vae+ Auth] " + message);
}

function finish() {
    /*
     * 原样返回服务器响应。
     * 不修改 status / headers / body。
     */
    $done({
        response: $response
    });
}

function parseJSON(text) {
    if (!text) {
        return null;
    }

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
         * 重放时交给 Loon / 网络栈重新生成。
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

function readTemplate(key) {
    try {
        const raw = $persistentStore.read(key);

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);

    } catch (e) {
        return null;
    }
}

function normalizeTemplate(template) {
    if (!template) {
        return null;
    }

    /*
     * 只比较真正影响请求的内容。
     *
     * updateTime 每次捕获都会变化，
     * 所以不能参与比较。
     */
    return {
        action: template.action || "",
        url: template.url || "",
        method:
            (template.method || "POST")
                .toUpperCase(),
        headers: template.headers || {},
        body: template.body || ""
    };
}

function templatesEqual(oldTemplate, newTemplate) {
    if (!oldTemplate || !newTemplate) {
        return false;
    }

    try {
        return (
            JSON.stringify(
                normalizeTemplate(oldTemplate)
            ) ===
            JSON.stringify(
                normalizeTemplate(newTemplate)
            )
        );
    } catch (e) {
        return false;
    }
}

function buildTemplate(action) {
    if (
        typeof $request === "undefined" ||
        !$request
    ) {
        return null;
    }

    const body =
        typeof $request.body === "string"
            ? $request.body
            : "";

    if (!body) {
        log(
            action +
            "：请求 Body 为空"
        );

        return null;
    }

    return {
        version: 4,

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
}

function saveTemplate(key, template) {
    if (!template) {
        return false;
    }

    try {
        const success =
            $persistentStore.write(
                JSON.stringify(template),
                key
            );

        if (success === false) {
            log(
                template.action +
                "：持久化失败"
            );

            return false;
        }

        log(
            "已保存：" +
            template.action
        );

        log(
            "Body length: " +
            template.body.length
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

    if (
        typeof json.requestVar === "string"
    ) {
        return json.requestVar;
    }

    return "";
}

function handleStatusRequest() {
    const action =
        "/USER_HOME/getRecord.json";

    const template =
        buildTemplate(action);

    if (!template) {
        return;
    }

    /*
     * 状态查询请求直接静默更新。
     *
     * AutoSign 每次运行时需要尽量使用
     * 最近捕获到的有效请求。
     */
    if (
        saveTemplate(
            STATUS_KEY,
            template
        )
    ) {
        log(
            "状态查询模板更新成功"
        );
    }
}

function handleSignRequest() {
    const action =
        "/USER_HOME/getRecordByMonth.json";

    /*
     * 保存之前先读取旧模板，
     * 用于判断这次是否真的发生变化。
     */
    const oldTemplate =
        readTemplate(SIGN_KEY);

    const newTemplate =
        buildTemplate(action);

    if (!newTemplate) {
        return;
    }

    const changed =
        !templatesEqual(
            oldTemplate,
            newTemplate
        );

    /*
     * 无论是否发生变化，
     * 都保存最新捕获到的请求。
     */
    const saved =
        saveTemplate(
            SIGN_KEY,
            newTemplate
        );

    if (!saved) {
        return;
    }

    if (changed) {
        log(
            "签到请求模板发生变化"
        );

        $notification.post(
            "Vae+ 授权更新",
            "签到请求已更新",
            "getRecordByMonth"
        );

    } else {
        log(
            "签到请求模板未变化，静默更新"
        );
    }
}

function main() {
    try {
        const requestVar =
            getRequestVar();

        if (!requestVar) {
            return;
        }

        /*
         * 必须先判断 getRecordByMonth。
         */
        if (
            requestVar.indexOf(
                "/USER_HOME/getRecordByMonth.json"
            ) !== -1
        ) {
            handleSignRequest();
            return;
        }

        if (
            requestVar.indexOf(
                "/USER_HOME/getRecord.json"
            ) !== -1
        ) {
            handleStatusRequest();
            return;
        }

    } catch (e) {
        log(
            "捕获异常：" +
            String(e)
        );
    }
}

try {
    main();

} catch (e) {
    log(
        "主程序异常：" +
        String(e)
    );

} finally {
    /*
     * 无论捕获成功、失败还是发生异常，
     * 都把原始响应交还给 Loon。
     */
    finish();
}