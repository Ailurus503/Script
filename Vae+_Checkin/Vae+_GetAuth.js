/*
 * Vae+ 请求捕获 / 持久化 - Surge
 *
 * 同一个脚本同时用于：
 * 1. http-request：暂存请求 URL / Header / Body
 * 2. http-response：根据响应 requestVar 判断接口类型并保存模板
 *
 * Surge 必须：
 * - http-request requires-body=true
 * - http-response requires-body=true
 * - MITM api1.starfans.com
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY = "VAE_SIGN_REQUEST";
const TASK_LIST_KEY = "VAE_TASK_LIST_REQUEST";
const DAILY_REWARD_KEY = "VAE_DAILY_REWARD_REQUEST";

const PENDING_PREFIX = "VAE_PENDING_";


function log(message) {
    console.log("[Vae+ Auth] " + message);
}


function finish() {
    // Surge 中 $done({}) 表示请求/响应保持不变
    $done({});
}


function parseJSON(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}


function readStore(key) {
    try {
        return $persistentStore.read(key);
    } catch (e) {
        return null;
    }
}


function writeStore(key, value) {
    try {
        return $persistentStore.write(
            String(value),
            key
        );
    } catch (e) {
        return false;
    }
}


function deleteStore(key) {
    try {
        return $persistentStore.write(
            null,
            key
        );
    } catch (e) {
        return false;
    }
}


function cleanHeaders(headers) {
    const result = {};

    if (!headers) return result;

    Object.keys(headers).forEach(function (key) {
        const lower = key.toLowerCase();

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


function getPendingKey() {
    if (
        typeof $request === "undefined" ||
        !$request ||
        !$request.id
    ) {
        return "";
    }

    const id = String($request.id)
        .replace(/[^A-Za-z0-9_.-]/g, "_");

    return PENDING_PREFIX + id;
}


function normalizeTemplate(template) {
    if (!template) return null;

    return {
        action: template.action || "",
        url: template.url || "",
        method: (
            template.method ||
            "POST"
        ).toUpperCase(),
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


function readTemplate(key) {
    const raw = readStore(key);

    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}


function saveTemplate(
    key,
    template,
    notifyChange,
    notifySubtitle,
    notifyBody
) {
    if (!template) return false;

    const oldTemplate =
        readTemplate(key);

    const changed =
        !templatesEqual(
            oldTemplate,
            template
        );

    const success =
        writeStore(
            key,
            JSON.stringify(template)
        );

    if (!success) {
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
        String(
            template.body || ""
        ).length
    );

    if (
        notifyChange &&
        changed
    ) {
        $notification.post(
            "Vae+ 授权更新",
            notifySubtitle || "",
            notifyBody || ""
        );
    }

    return true;
}


/*
 * 第一阶段：
 * http-request
 *
 * Surge 的 response script 不提供 request body，
 * 因此先在这里暂存。
 */
function captureRequest() {
    const pendingKey =
        getPendingKey();

    if (!pendingKey) {
        log("缺少 request.id");
        return;
    }

    const body =
        typeof $request.body === "string"
            ? $request.body
            : "";

    if (!body) {
        log("请求 Body 为空");
        return;
    }

    const pending = {
        version: 6,

        url:
            $request.url || "",

        method:
            (
                $request.method ||
                "POST"
            ).toUpperCase(),

        headers:
            cleanHeaders(
                $request.headers || {}
            ),

        body: body,

        updateTime:
            Date.now()
    };

    const success =
        writeStore(
            pendingKey,
            JSON.stringify(pending)
        );

    if (success) {
        log(
            "已暂存请求：" +
            $request.id
        );
    } else {
        log("暂存请求失败");
    }
}


/*
 * 从响应中获取真实接口动作。
 */
function getRequestVar() {
    if (
        typeof $response === "undefined" ||
        !$response ||
        typeof $response.body !== "string"
    ) {
        return "";
    }

    const json =
        parseJSON(
            $response.body
        );

    if (!json) return "";

    return typeof json.requestVar === "string"
        ? json.requestVar
        : "";
}


function getActionInfo(requestVar) {
    if (!requestVar) return null;

    // completeTask 必须优先
    if (
        requestVar.indexOf(
            "/GAME/completeTask.json"
        ) !== -1 &&
        requestVar.indexOf(
            "taskKey=201"
        ) !== -1
    ) {
        return {
            key: DAILY_REWARD_KEY,
            action:
                "/GAME/completeTask.json&taskKey=201",
            notify: true,
            subtitle:
                "每日登录奖励请求已保存",
            body:
                "taskKey=201"
        };
    }

    if (
        requestVar.indexOf(
            "/GAME/getTaskList.json"
        ) !== -1
    ) {
        return {
            key: TASK_LIST_KEY,
            action:
                "/GAME/getTaskList.json",
            notify: false
        };
    }

    // getRecordByMonth 必须在 getRecord 之前
    if (
        requestVar.indexOf(
            "/USER_HOME/getRecordByMonth.json"
        ) !== -1
    ) {
        return {
            key: SIGN_KEY,
            action:
                "/USER_HOME/getRecordByMonth.json",
            notify: true,
            subtitle:
                "签到请求已更新",
            body:
                "getRecordByMonth"
        };
    }

    if (
        requestVar.indexOf(
            "/USER_HOME/getRecord.json"
        ) !== -1
    ) {
        return {
            key: STATUS_KEY,
            action:
                "/USER_HOME/getRecord.json",
            notify: false
        };
    }

    return null;
}


/*
 * 第二阶段：
 * http-response
 */
function captureResponse() {
    const requestVar =
        getRequestVar();

    if (!requestVar) {
        return;
    }

    const actionInfo =
        getActionInfo(
            requestVar
        );

    if (!actionInfo) {
        return;
    }

    const pendingKey =
        getPendingKey();

    if (!pendingKey) {
        log(
            actionInfo.action +
            "：无法取得 request.id"
        );
        return;
    }

    const raw =
        readStore(
            pendingKey
        );

    if (!raw) {
        log(
            actionInfo.action +
            "：未找到对应请求缓存"
        );
        return;
    }

    // 使用后立即清理临时缓存
    deleteStore(
        pendingKey
    );

    const template =
        parseJSON(raw);

    if (!template) {
        log(
            actionInfo.action +
            "：请求缓存解析失败"
        );
        return;
    }

    template.action =
        actionInfo.action;

    template.updateTime =
        Date.now();

    saveTemplate(
        actionInfo.key,
        template,
        actionInfo.notify,
        actionInfo.subtitle,
        actionInfo.body
    );
}


function main() {
    try {
        /*
         * Surge 会把同一个 JS 分别声明成
         * http-request 与 http-response。
         */
        if (
            typeof $response !==
            "undefined"
        ) {
            captureResponse();
        } else {
            captureRequest();
        }

    } catch (e) {
        log(
            "运行异常：" +
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
    finish();
}