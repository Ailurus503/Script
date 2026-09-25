/*
 * Vae+ 授权 / 请求模板捕获
 * Surge 单 http-request 版本
 *
 * Surge 配置：
 *
 * Vae+ 授权获取 = type=http-request, pattern=^https:\/\/api1\.starfans\.com\/auth\/, requires-body=true, script-path=你的脚本地址, timeout=10, debug=true
 *
 * MITM：
 *
 * hostname = %APPEND% api1.starfans.com
 *
 * 持久化模板：
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
 *   /GAME/completeTask.json + taskKey=201
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY = "VAE_SIGN_REQUEST";
const TASK_LIST_KEY = "VAE_TASK_LIST_REQUEST";
const DAILY_REWARD_KEY = "VAE_DAILY_REWARD_REQUEST";


function log(message) {
    console.log(
        "[Vae+ Auth] " + message
    );
}


function finish() {
    /*
     * 不修改原始请求。
     */
    $done({});
}


function readStore(key) {
    try {
        return $persistentStore.read(key);
    } catch (e) {
        log(
            "读取持久化数据失败：" +
            String(e)
        );

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
        log(
            "写入持久化数据失败：" +
            String(e)
        );

        return false;
    }
}


function readTemplate(key) {
    const raw = readStore(key);

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
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
        .sort(function (a, b) {
            return a
                .toLowerCase()
                .localeCompare(
                    b.toLowerCase()
                );
        })
        .forEach(function (key) {

            const lower =
                key.toLowerCase();

            /*
             * 这些 Header 重放时不应该固定保存。
             */
            if (
                lower === "content-length" ||
                lower === "host" ||
                lower === "connection" ||
                lower === "accept-encoding"
            ) {
                return;
            }

            result[key] =
                headers[key];
        });

    return result;
}


function safeDecode(text) {
    if (!text) {
        return "";
    }

    try {
        return decodeURIComponent(
            String(text)
                .replace(
                    /\+/g,
                    "%20"
                )
        );
    } catch (e) {
        return String(text);
    }
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


/*
 * 递归展开 JSON。
 *
 * 用来兼容接口名位于：
 * - JSON 字段
 * - 嵌套 JSON
 * - 数组
 *
 * 中的情况。
 */
function flattenJSON(
    value,
    output
) {
    output =
        output || [];

    if (
        value === null ||
        value === undefined
    ) {
        return output;
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        output.push(
            String(value)
        );

        return output;
    }

    if (Array.isArray(value)) {

        value.forEach(
            function (item) {
                flattenJSON(
                    item,
                    output
                );
            }
        );

        return output;
    }

    if (
        typeof value === "object"
    ) {

        Object.keys(value)
            .forEach(
                function (key) {

                    output.push(
                        String(key)
                    );

                    flattenJSON(
                        value[key],
                        output
                    );
                }
            );
    }

    return output;
}


/*
 * 生成用于接口识别的文本。
 *
 * 同时检查：
 * - URL
 * - URL Decode 后的 URL
 * - Body
 * - URL Decode 后的 Body
 * - JSON 展开内容
 */
function buildSearchText() {

    const parts = [];

    const url =
        (
            typeof $request !==
                "undefined" &&
            $request &&
            $request.url
        )
            ? String(
                $request.url
            )
            : "";

    const body =
        (
            typeof $request !==
                "undefined" &&
            $request &&
            typeof $request.body ===
                "string"
        )
            ? $request.body
            : "";

    parts.push(url);
    parts.push(body);

    parts.push(
        safeDecode(url)
    );

    parts.push(
        safeDecode(body)
    );


    /*
     * 尝试把 Body 当 JSON 解析。
     */
    const json =
        parseJSON(body);

    if (json) {

        const flattened =
            flattenJSON(
                json
            );

        parts.push(
            flattened.join("\n")
        );
    }


    /*
     * URL Decode 后再尝试解析 JSON。
     */
    const decodedBody =
        safeDecode(body);

    if (
        decodedBody &&
        decodedBody !== body
    ) {

        const decodedJSON =
            parseJSON(
                decodedBody
            );

        if (decodedJSON) {

            const flattened =
                flattenJSON(
                    decodedJSON
                );

            parts.push(
                flattened.join("\n")
            );
        }
    }


    return parts.join("\n");
}


/*
 * 判断 taskKey=201。
 */
function containsTask201(text) {

    if (!text) {
        return false;
    }

    return (
        text.indexOf(
            "taskKey=201"
        ) !== -1 ||

        text.indexOf(
            "taskKey%3D201"
        ) !== -1 ||

        text.indexOf(
            "\"taskKey\":201"
        ) !== -1 ||

        text.indexOf(
            "\"taskKey\":\"201\""
        ) !== -1 ||

        text.indexOf(
            "'taskKey':201"
        ) !== -1 ||

        text.indexOf(
            "'taskKey':'201'"
        ) !== -1 ||

        /taskKey[\s:=&"']+201/i
            .test(text)
    );
}


/*
 * 识别请求类型。
 */
function detectAction() {

    const text =
        buildSearchText();

    if (!text) {

        log(
            "请求 URL 和 Body 均为空"
        );

        return null;
    }


    /*
     * 每日登录奖励
     *
     * completeTask 必须最优先判断。
     */
    if (
        text.indexOf(
            "/GAME/completeTask.json"
        ) !== -1 &&
        containsTask201(text)
    ) {

        return {

            key:
                DAILY_REWARD_KEY,

            action:
                "/GAME/completeTask.json&taskKey=201",

            notify:
                true,

            subtitle:
                "每日登录奖励请求已保存",

            notifyBody:
                "taskKey=201"
        };
    }


    /*
     * 每日任务列表
     */
    if (
        text.indexOf(
            "/GAME/getTaskList.json"
        ) !== -1
    ) {

        return {

            key:
                TASK_LIST_KEY,

            action:
                "/GAME/getTaskList.json",

            notify:
                false
        };
    }


    /*
     * 每月签到接口
     *
     * 必须放在 getRecord 前面，
     * 避免被 getRecord 误匹配。
     */
    if (
        text.indexOf(
            "/USER_HOME/getRecordByMonth.json"
        ) !== -1
    ) {

        return {

            key:
                SIGN_KEY,

            action:
                "/USER_HOME/getRecordByMonth.json",

            notify:
                true,

            subtitle:
                "签到请求已更新",

            notifyBody:
                "getRecordByMonth"
        };
    }


    /*
     * 签到状态接口
     */
    if (
        text.indexOf(
            "/USER_HOME/getRecord.json"
        ) !== -1
    ) {

        return {

            key:
                STATUS_KEY,

            action:
                "/USER_HOME/getRecord.json",

            notify:
                false
        };
    }


    return null;
}


/*
 * 构造可供自动签到脚本重放的请求模板。
 */
function buildTemplate(action) {

    if (
        typeof $request ===
            "undefined" ||
        !$request
    ) {

        log(
            action +
            "：不存在 $request"
        );

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


    const headers =
        cleanHeaders(
            $request.headers ||
            {}
        );


    return {

        version: 7,

        action:
            action,

        url:
            $request.url ||
            "",

        method:
            (
                $request.method ||
                "POST"
            ).toUpperCase(),

        headers:
            headers,

        body:
            body,

        updateTime:
            Date.now()
    };
}


/*
 * updateTime 不参与模板变化判断。
 */
function normalizeTemplate(
    template
) {

    if (!template) {
        return null;
    }


    return {

        action:
            template.action ||
            "",

        url:
            template.url ||
            "",

        method:
            (
                template.method ||
                "POST"
            ).toUpperCase(),

        headers:
            template.headers ||
            {},

        body:
            template.body ||
            ""
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
            ) ===
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


/*
 * 保存请求模板。
 */
function saveTemplate(
    info,
    template
) {

    if (
        !info ||
        !template
    ) {
        return false;
    }


    const oldTemplate =
        readTemplate(
            info.key
        );


    const changed =
        !templatesEqual(
            oldTemplate,
            template
        );


    const success =
        writeStore(
            info.key,
            JSON.stringify(
                template
            )
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
        "Method: " +
        template.method
    );


    log(
        "Body length: " +
        template.body.length
    );


    /*
     * 状态查询、任务列表：
     * 静默更新。
     *
     * 签到、每日登录奖励：
     * 首次捕获或内容变化时通知。
     */
    if (
        info.notify &&
        changed
    ) {

        $notification.post(
            "Vae+ 授权更新",
            info.subtitle ||
                "",
            info.notifyBody ||
                ""
        );
    }


    if (
        info.notify &&
        !changed
    ) {

        log(
            template.action +
            "：模板未变化，静默更新"
        );
    }


    return true;
}


/*
 * 主程序。
 */
function main() {

    try {

        if (
            typeof $request ===
                "undefined" ||
            !$request
        ) {

            log(
                "当前不是 http-request 环境"
            );

            return;
        }


        const info =
            detectAction();


        if (!info) {

            log(
                "当前请求未识别为目标接口"
            );

            return;
        }


        log(
            "识别接口：" +
            info.action
        );


        const template =
            buildTemplate(
                info.action
            );


        if (!template) {
            return;
        }


        saveTemplate(
            info,
            template
        );


    } catch (e) {

        log(
            "捕获异常：" +
            String(e)
        );
    }
}


/*
 * 启动。
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