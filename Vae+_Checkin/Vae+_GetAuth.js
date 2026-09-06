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
 * 保存的请求模板：
 *
 * VAE_STATUS_REQUEST
 *   /USER_HOME/getRecord.json
 *
 * VAE_SIGN_REQUEST
 *   /USER_HOME/getRecordByMonth.json
 *
 * VAE_TASK_LIST_REQUEST
 *   /GAME/getTaskList.json
 *
 * VAE_DAILY_REWARD_REQUEST
 *   /GAME/completeTask.json&taskKey=201
 *
 * 通知：
 * - 状态查询、任务列表：静默更新
 * - 签到请求、每日登录奖励请求：
 *   首次捕获或模板变化时通知
 */

const STATUS_KEY =
    "VAE_STATUS_REQUEST";

const SIGN_KEY =
    "VAE_SIGN_REQUEST";

const TASK_LIST_KEY =
    "VAE_TASK_LIST_REQUEST";

const DAILY_REWARD_KEY =
    "VAE_DAILY_REWARD_REQUEST";


function log(message) {
    console.log(
        "[Vae+ Auth] " + message
    );
}


function finish() {
    /*
     * 保持 Vae+ 原始响应不变。
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

    Object.keys(headers)
        .forEach(function (key) {

            const lower =
                key.toLowerCase();

            if (
                lower ===
                    "content-length" ||
                lower === "host" ||
                lower === "connection" ||
                lower ===
                    "accept-encoding"
            ) {
                return;
            }

            result[key] =
                headers[key];
        });

    return result;
}


function readTemplate(key) {
    try {

        const raw =
            $persistentStore.read(key);

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
     * updateTime 不参与比较。
     */
    return {

        action:
            template.action || "",

        url:
            template.url || "",

        method:
            (
                template.method ||
                "POST"
            ).toUpperCase(),

        headers:
            template.headers || {},

        body:
            template.body || ""
    };
}


function templatesEqual(
    oldTemplate,
    newTemplate
) {
    if (
        !oldTemplate ||
        !newTemplate
    ) {
        return false;
    }

    try {

        return (
            JSON.stringify(
                normalizeTemplate(
                    oldTemplate
                )
            )
            ===
            JSON.stringify(
                normalizeTemplate(
                    newTemplate
                )
            )
        );

    } catch (e) {

        return false;
    }
}


function buildTemplate(action) {

    if (
        typeof $request ===
            "undefined" ||
        !$request
    ) {
        return null;
    }

    const body =
        typeof $request.body ===
            "string"
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

        version: 5,

        action: action,

        url:
            $request.url || "",

        method:
            (
                $request.method ||
                "POST"
            ).toUpperCase(),

        headers:
            cleanHeaders(
                $request.headers ||
                {}
            ),

        body: body,

        updateTime:
            Date.now()
    };
}


function saveTemplate(
    key,
    template
) {
    if (!template) {
        return false;
    }

    try {

        const success =
            $persistentStore.write(
                JSON.stringify(
                    template
                ),
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
        typeof $response ===
            "undefined" ||
        !$response ||
        typeof $response.body !==
            "string"
    ) {
        return "";
    }

    const json =
        parseJSON(
            $response.body
        );

    if (!json) {
        return "";
    }

    if (
        typeof json.requestVar ===
            "string"
    ) {
        return json.requestVar;
    }

    return "";
}


/*
 * 静默保存：
 * getRecord
 */

function handleStatusRequest() {

    const action =
        "/USER_HOME/getRecord.json";

    const template =
        buildTemplate(action);

    if (!template) {
        return;
    }

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


/*
 * 签到请求：
 * getRecordByMonth
 */

function handleSignRequest() {

    const action =
        "/USER_HOME/getRecordByMonth.json";

    const oldTemplate =
        readTemplate(
            SIGN_KEY
        );

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


/*
 * 任务列表：
 * getTaskList
 */

function handleTaskListRequest() {

    const action =
        "/GAME/getTaskList.json";

    const template =
        buildTemplate(action);

    if (!template) {
        return;
    }

    if (
        saveTemplate(
            TASK_LIST_KEY,
            template
        )
    ) {

        log(
            "任务列表模板更新成功"
        );
    }
}


/*
 * 每日登录奖励：
 * taskKey=201
 */

function handleDailyRewardRequest() {

    const action =
        "/GAME/completeTask.json&taskKey=201";

    const oldTemplate =
        readTemplate(
            DAILY_REWARD_KEY
        );

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

    const saved =
        saveTemplate(
            DAILY_REWARD_KEY,
            newTemplate
        );

    if (!saved) {
        return;
    }

    if (changed) {

        log(
            "每日登录奖励请求模板发生变化"
        );

        $notification.post(
            "Vae+ 授权更新",
            "每日登录奖励请求已保存",
            "taskKey=201"
        );

    } else {

        log(
            "每日登录奖励模板未变化，静默更新"
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
         * completeTask 必须优先判断。
         */

        if (
            requestVar.indexOf(
                "/GAME/completeTask.json"
            ) !== -1 &&
            requestVar.indexOf(
                "taskKey=201"
            ) !== -1
        ) {

            handleDailyRewardRequest();
            return;
        }


        /*
         * getTaskList
         */

        if (
            requestVar.indexOf(
                "/GAME/getTaskList.json"
            ) !== -1
        ) {

            handleTaskListRequest();
            return;
        }


        /*
         * getRecordByMonth
         * 必须在 getRecord 前判断。
         */

        if (
            requestVar.indexOf(
                "/USER_HOME/getRecordByMonth.json"
            ) !== -1
        ) {

            handleSignRequest();
            return;
        }


        /*
         * getRecord
         */

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

    finish();
}