/*
 * 奶昔论坛 Cookie 获取
 * Loon http-response
 *
 * 只监听真正的登录提交响应：
 * member.php?mod=logging&action=login&loginsubmit=yes
 *
 * 从响应 Set-Cookie 中提取最新登录 Cookie，
 * 再与原有 Cookie 合并。
 *
 * 不修改网页响应。
 */

const COOKIE_KEY = "NaixiCookie";

function log(msg) {
    console.log("[奶昔 Cookie] " + msg);
}

function notify(title, subtitle, body) {
    $notification.post(
        title || "",
        subtitle || "",
        body || ""
    );
}


/*
 * Cookie 字符串转对象
 */
function parseCookieString(cookie) {

    const result = {};

    if (!cookie) {
        return result;
    }

    String(cookie)
        .split(";")
        .forEach(function (item) {

            item = item.trim();

            if (!item) {
                return;
            }

            const index = item.indexOf("=");

            if (index <= 0) {
                return;
            }

            const name =
                item.substring(0, index).trim();

            const value =
                item.substring(index + 1).trim();

            if (!name) {
                return;
            }

            result[name] = value;
        });

    return result;
}


/*
 * 对象转 Cookie 字符串
 */
function buildCookie(obj) {

    return Object.keys(obj)
        .filter(function (key) {

            return (
                key &&
                obj[key] !== undefined &&
                obj[key] !== null &&
                String(obj[key]) !== ""
            );
        })
        .map(function (key) {

            return (
                key +
                "=" +
                obj[key]
            );
        })
        .join("; ");
}


/*
 * 读取所有 Set-Cookie
 *
 * Loon 不同版本/场景下，
 * Header 名大小写可能不同。
 */
function getSetCookies(headers) {

    if (!headers) {
        return [];
    }

    const result = [];

    Object.keys(headers)
        .forEach(function (key) {

            if (
                key.toLowerCase() ===
                "set-cookie"
            ) {

                const value =
                    headers[key];

                if (Array.isArray(value)) {

                    value.forEach(
                        function (v) {

                            if (v) {
                                result.push(
                                    String(v)
                                );
                            }
                        }
                    );

                } else if (value) {

                    /*
                     * 某些环境会把多条 Set-Cookie
                     * 合并为一条。
                     *
                     * Discuz 的 Cookie 本身不包含
                     * 需要保留的逗号值，所以这里做兼容。
                     */
                    String(value)
                        .split(/,(?=\s*[^;,]+=)/)
                        .forEach(
                            function (v) {

                                if (v.trim()) {
                                    result.push(
                                        v.trim()
                                    );
                                }
                            }
                        );
                }
            }
        });

    return result;
}


/*
 * 从一条 Set-Cookie 中，
 * 只取第一个 name=value。
 */
function parseSetCookie(line) {

    if (!line) {
        return null;
    }

    const first =
        String(line)
            .split(";")[0]
            .trim();

    const index =
        first.indexOf("=");

    if (index <= 0) {
        return null;
    }

    return {
        name:
            first
                .substring(
                    0,
                    index
                )
                .trim(),

        value:
            first
                .substring(
                    index + 1
                )
                .trim()
    };
}


/*
 * 判断是否是明确的删除 Cookie。
 */
function isDeletedCookie(value) {

    const text =
        String(value || "")
            .toLowerCase();

    return (
        text === "deleted" ||
        text === ""
    );
}


/*
 * 判断是否抓到了真正的登录 Cookie。
 *
 * HAR 中登录成功后，
 * 会下发类似：
 *
 * naixi_xxxx_auth
 * naixi_xxxx_ulastactivity
 *
 * 其中 *_auth 是最重要的登录认证字段。
 */
function hasAuthCookie(obj) {

    return Object.keys(obj)
        .some(function (key) {

            return (
                /_auth$/i.test(key) &&
                key.indexOf(
                    "invite_auth"
                ) === -1 &&
                key.indexOf(
                    "activationauth"
                ) === -1 &&
                obj[key] &&
                !isDeletedCookie(
                    obj[key]
                )
            );
        });
}


/*
 * 合并旧 Cookie 和新的 Set-Cookie。
 *
 * 新 Cookie 优先。
 * 遇到 deleted 则删除旧字段。
 */
function mergeCookies(
    oldCookie,
    setCookieLines
) {

    const merged =
        parseCookieString(
            oldCookie
        );

    setCookieLines.forEach(
        function (line) {

            const item =
                parseSetCookie(
                    line
                );

            if (
                !item ||
                !item.name
            ) {
                return;
            }

            /*
             * 只处理奶昔自己的 Cookie。
             *
             * 避免 Google Analytics
             * 或其他第三方 Cookie 混进来。
             */
            if (
                item.name
                    .toLowerCase()
                    .indexOf(
                        "naixi_"
                    ) !== 0
            ) {
                return;
            }


            if (
                isDeletedCookie(
                    item.value
                )
            ) {

                delete merged[
                    item.name
                ];

                return;
            }


            merged[
                item.name
            ] =
                item.value;
        }
    );

    return merged;
}


/*
 * 判断两个 Cookie 是否一致
 */
function cookieEqual(a, b) {

    const aa =
        parseCookieString(a);

    const bb =
        parseCookieString(b);

    const ak =
        Object.keys(aa).sort();

    const bk =
        Object.keys(bb).sort();

    if (
        ak.length !==
        bk.length
    ) {
        return false;
    }

    for (
        let i = 0;
        i < ak.length;
        i++
    ) {

        if (
            ak[i] !==
            bk[i]
        ) {
            return false;
        }

        if (
            String(
                aa[ak[i]]
            ) !==
            String(
                bb[bk[i]]
            )
        ) {
            return false;
        }
    }

    return true;
}


function main() {

    try {

        if (
            typeof $response ===
                "undefined" ||
            !$response
        ) {

            log(
                "未检测到响应对象"
            );

            return;
        }


        if (
            typeof $request ===
                "undefined" ||
            !$request
        ) {

            log(
                "未检测到请求对象"
            );

            return;
        }


        const url =
            String(
                $request.url || ""
            );


        /*
         * 双保险：
         * 必须是真正的登录提交。
         */
        if (
            url.indexOf(
                "member.php"
            ) === -1 ||
            url.indexOf(
                "mod=logging"
            ) === -1 ||
            url.indexOf(
                "action=login"
            ) === -1 ||
            url.indexOf(
                "loginsubmit=yes"
            ) === -1
        ) {

            log(
                "不是登录提交响应，忽略"
            );

            return;
        }


        const setCookies =
            getSetCookies(
                $response.headers ||
                {}
            );


        if (
            !setCookies.length
        ) {

            log(
                "登录响应未发现 Set-Cookie"
            );

            return;
        }


        const oldCookie =
            $persistentStore.read(
                COOKIE_KEY
            ) || "";


        const mergedObj =
            mergeCookies(
                oldCookie,
                setCookies
            );


        /*
         * 关键验证：
         * 必须包含新的登录 auth Cookie。
         */
        if (
            !hasAuthCookie(
                mergedObj
            )
        ) {

            log(
                "未检测到有效登录认证 Cookie"
            );

            notify(
                "奶昔论坛",
                "Cookie 获取失败",
                "登录响应中未检测到有效认证信息"
            );

            return;
        }


        const newCookie =
            buildCookie(
                mergedObj
            );


        if (!newCookie) {

            log(
                "生成 Cookie 失败"
            );

            return;
        }


        if (
            oldCookie &&
            cookieEqual(
                oldCookie,
                newCookie
            )
        ) {

            log(
                "Cookie 未变化"
            );

            return;
        }


        const ok =
            $persistentStore.write(
                newCookie,
                COOKIE_KEY
            );


        if (
            ok === false
        ) {

            log(
                "Cookie 写入失败"
            );

            notify(
                "奶昔论坛",
                "Cookie 保存失败",
                "Loon 持久化写入失败"
            );

            return;
        }


        log(
            "登录 Cookie 已更新"
        );


        notify(
            "奶昔论坛",
            "Cookie 保存成功",
            "新的登录状态已保存"
        );


    } catch (e) {

        log(
            "异常：" +
            String(e)
        );

        notify(
            "奶昔论坛",
            "Cookie 获取异常",
            e.message ||
                String(e)
        );
    }
}


/*
 * 重点：
 *
 * 即使脚本报错，
 * 也把原始 response 原样交还。
 *
 * 避免出现网页白屏。
 */
try {

    main();

} finally {

    $done({
        response: $response
    });
}