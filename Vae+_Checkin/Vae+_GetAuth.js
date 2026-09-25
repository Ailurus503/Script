/*
 * Vae+ Surge 单 http-request 诊断版
 *
 * 目的：
 * 找出 Vae+ 请求 Body 中是否存在可以直接识别
 * getRecord / getRecordByMonth / getTaskList / completeTask
 * 的字段。
 *
 * 注意：
 * - 不保存 Cookie
 * - 不保存 Authorization
 * - 不保存请求模板
 * - 不打印完整 Body
 * - 只输出结构和可能有用的识别字段
 */

function log(message) {
    console.log(
        "[Vae+ Diagnose] " + message
    );
}


function finish() {
    $done({});
}


function getHeader(headers, name) {
    if (!headers) {
        return "";
    }

    const target =
        String(name).toLowerCase();

    const keys =
        Object.keys(headers);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {
        if (
            keys[i].toLowerCase() ===
            target
        ) {
            return String(
                headers[keys[i]] || ""
            );
        }
    }

    return "";
}


function safeDecode(text) {
    if (!text) {
        return "";
    }

    let result =
        String(text);

    /*
     * 最多尝试三层 URL Decode。
     */
    for (
        let i = 0;
        i < 3;
        i++
    ) {
        try {
            const decoded =
                decodeURIComponent(
                    result.replace(
                        /\+/g,
                        "%20"
                    )
                );

            if (
                decoded === result
            ) {
                break;
            }

            result =
                decoded;

        } catch (e) {
            break;
        }
    }

    return result;
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
 * 敏感字段永远不输出值。
 */
function isSensitiveKey(key) {
    const text =
        String(key || "")
            .toLowerCase();

    return (
        text.indexOf("cookie") !== -1 ||
        text.indexOf("token") !== -1 ||
        text.indexOf("authorization") !== -1 ||
        text.indexOf("passwd") !== -1 ||
        text.indexOf("password") !== -1 ||
        text.indexOf("secret") !== -1 ||
        text.indexOf("session") !== -1 ||
        text.indexOf("jsessid") !== -1 ||
        text.indexOf("sign") !== -1 ||
        text.indexOf("deviceid") !== -1 ||
        text.indexOf("openid") !== -1 ||
        text.indexOf("userid") !== -1 ||
        text === "uid"
    );
}


/*
 * 这些字段最可能包含业务接口标识。
 */
function isInterestingKey(key) {
    const text =
        String(key || "")
            .toLowerCase();

    const words = [
        "action",
        "api",
        "path",
        "url",
        "uri",
        "request",
        "method",
        "service",
        "module",
        "function",
        "func",
        "command",
        "cmd",
        "task",
        "key",
        "type",
        "name",
        "route",
        "target"
    ];

    for (
        let i = 0;
        i < words.length;
        i++
    ) {
        if (
            text.indexOf(
                words[i]
            ) !== -1
        ) {
            return true;
        }
    }

    return false;
}


function safeValue(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return String(value);
    }

    if (
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }

    if (
        typeof value !== "string"
    ) {
        return (
            "[" +
            typeof value +
            "]"
        );
    }

    let text =
        safeDecode(value);

    /*
     * 防止误输出很长数据。
     */
    if (
        text.length > 160
    ) {
        text =
            text.substring(
                0,
                160
            ) +
            "...";
    }

    return text;
}


function inspectJSON(
    value,
    path,
    depth,
    result
) {
    if (
        depth > 8 ||
        value === null ||
        value === undefined
    ) {
        return;
    }

    if (
        Array.isArray(value)
    ) {
        result.paths.push(
            path + "[]"
        );

        const limit =
            Math.min(
                value.length,
                3
            );

        for (
            let i = 0;
            i < limit;
            i++
        ) {
            inspectJSON(
                value[i],
                path + "[" + i + "]",
                depth + 1,
                result
            );
        }

        return;
    }


    if (
        typeof value ===
        "object"
    ) {
        const keys =
            Object.keys(value);

        for (
            let i = 0;
            i < keys.length;
            i++
        ) {
            const key =
                keys[i];

            const newPath =
                path
                    ? path + "." + key
                    : key;

            result.paths.push(
                newPath
            );

            if (
                !isSensitiveKey(key) &&
                isInterestingKey(key)
            ) {
                const child =
                    value[key];

                if (
                    typeof child === "string" ||
                    typeof child === "number" ||
                    typeof child === "boolean"
                ) {
                    result.interesting.push(
                        newPath +
                        "=" +
                        safeValue(child)
                    );
                }
            }

            inspectJSON(
                value[key],
                newPath,
                depth + 1,
                result
            );
        }
    }
}


function inspectForm(body) {
    const result = {
        keys: [],
        interesting: []
    };

    if (!body) {
        return result;
    }

    const items =
        body.split("&");

    for (
        let i = 0;
        i < items.length;
        i++
    ) {
        if (!items[i]) {
            continue;
        }

        const pos =
            items[i].indexOf("=");

        let rawKey;
        let rawValue;

        if (pos === -1) {
            rawKey =
                items[i];

            rawValue =
                "";
        } else {
            rawKey =
                items[i]
                    .substring(
                        0,
                        pos
                    );

            rawValue =
                items[i]
                    .substring(
                        pos + 1
                    );
        }

        const key =
            safeDecode(
                rawKey
            );

        const value =
            safeDecode(
                rawValue
            );

        result.keys.push(
            key
        );

        if (
            !isSensitiveKey(key) &&
            isInterestingKey(key)
        ) {
            result.interesting.push(
                key +
                "=" +
                safeValue(value)
            );
        }
    }

    return result;
}


/*
 * 尝试直接寻找类似：
 *
 * /USER_HOME/getRecord.json
 * /GAME/getTaskList.json
 *
 * 这样的路径。
 */
function findRouteStrings(text) {
    const result = [];

    if (!text) {
        return result;
    }

    const decoded =
        safeDecode(text);

    const regex =
        /\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json(?:[?&][A-Za-z0-9_.=%-]+)*/g;

    const matches =
        decoded.match(regex);

    if (!matches) {
        return result;
    }

    for (
        let i = 0;
        i < matches.length;
        i++
    ) {
        if (
            result.indexOf(
                matches[i]
            ) === -1
        ) {
            result.push(
                matches[i]
            );
        }
    }

    return result;
}


function detectKnownWords(text) {
    const decoded =
        safeDecode(
            text || ""
        );

    const targets = [
        "USER_HOME",
        "GAME",
        "getRecord",
        "getRecordByMonth",
        "getTaskList",
        "completeTask",
        "taskKey",
        "201"
    ];

    const found = [];

    for (
        let i = 0;
        i < targets.length;
        i++
    ) {
        if (
            decoded.indexOf(
                targets[i]
            ) !== -1
        ) {
            found.push(
                targets[i]
            );
        }
    }

    return found;
}


function main() {
    if (
        typeof $request ===
            "undefined" ||
        !$request
    ) {
        log(
            "不存在 $request"
        );

        return;
    }


    const url =
        String(
            $request.url ||
            ""
        );

    const method =
        String(
            $request.method ||
            ""
        );

    const headers =
        $request.headers ||
        {};

    const body =
        typeof $request.body ===
            "string"
            ? $request.body
            : "";

    const contentType =
        getHeader(
            headers,
            "Content-Type"
        );


    log(
        "=============================="
    );

    log(
        "URL: " +
        url
    );

    log(
        "Method: " +
        method
    );

    log(
        "Content-Type: " +
        (
            contentType ||
            "(empty)"
        )
    );

    log(
        "Body length: " +
        body.length
    );


    if (!body) {
        log(
            "Body: EMPTY"
        );

        return;
    }


    /*
     * 先直接查找已知关键词。
     */
    const knownWords =
        detectKnownWords(
            body
        );

    if (
        knownWords.length > 0
    ) {
        log(
            "Known words: " +
            knownWords.join(", ")
        );
    } else {
        log(
            "Known words: NONE"
        );
    }


    /*
     * 查找类似 /xxx/xxx.json 的字符串。
     */
    const routes =
        findRouteStrings(
            body
        );

    if (
        routes.length > 0
    ) {
        log(
            "Route strings: " +
            routes.join(" | ")
        );
    } else {
        log(
            "Route strings: NONE"
        );
    }


    /*
     * JSON
     */
    const json =
        parseJSON(body);

    if (json) {
        log(
            "Body format: JSON"
        );

        const result = {
            paths: [],
            interesting: []
        };

        inspectJSON(
            json,
            "",
            0,
            result
        );

        if (
            result.paths.length > 0
        ) {
            log(
                "JSON paths: " +
                result.paths
                    .slice(
                        0,
                        80
                    )
                    .join(" | ")
            );
        }

        if (
            result.interesting.length > 0
        ) {
            log(
                "Interesting values: " +
                result.interesting
                    .slice(
                        0,
                        40
                    )
                    .join(" | ")
            );
        } else {
            log(
                "Interesting values: NONE"
            );
        }

        return;
    }


    /*
     * application/x-www-form-urlencoded
     */
    if (
        body.indexOf("=") !== -1
    ) {
        const form =
            inspectForm(
                body
            );

        if (
            form.keys.length > 0
        ) {
            log(
                "Body format: FORM?"
            );

            log(
                "Form keys: " +
                form.keys
                    .slice(
                        0,
                        80
                    )
                    .join(" | ")
            );

            if (
                form.interesting.length > 0
            ) {
                log(
                    "Interesting values: " +
                    form.interesting
                        .slice(
                            0,
                            40
                        )
                        .join(" | ")
                );
            } else {
                log(
                    "Interesting values: NONE"
                );
            }

            return;
        }
    }


    /*
     * 看起来像 Base64 时，只标记，不直接打印。
     */
    const compact =
        body.replace(
            /\s/g,
            ""
        );

    if (
        compact.length >= 24 &&
        compact.length % 4 === 0 &&
        /^[A-Za-z0-9+/=]+$/.test(
            compact
        )
    ) {
        log(
            "Body format: BASE64-like"
        );
    } else {
        log(
            "Body format: UNKNOWN / ENCRYPTED"
        );
    }
}


try {
    main();

} catch (e) {
    log(
        "诊断异常：" +
        String(e)
    );

} finally {
    finish();
}