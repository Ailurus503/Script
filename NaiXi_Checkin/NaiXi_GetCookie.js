/*
 * 奶昔论坛 Cookie 获取
 * Loon http-request
 *
 * 改进：
 * 1. 不再用残缺 Cookie 覆盖完整 Cookie
 * 2. 新旧 Cookie 自动合并
 * 3. 只有存在登录认证 Cookie 时才保存
 * 4. Cookie 没变化时不重复通知
 * 5. 不修改网页响应
 */

const COOKIE_KEY = "NaixiCookie";

function log(message) {
    console.log(
        "[奶昔 Cookie] " + message
    );
}

function notify(
    title,
    subtitle,
    body
) {
    $notification.post(
        title || "",
        subtitle || "",
        body || ""
    );
}


/*
 * 不区分大小写读取 Header
 */
function getHeader(
    headers,
    name
) {

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


/*
 * Cookie 字符串 → 对象
 */
function parseCookie(cookie) {

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

            const pos =
                item.indexOf("=");

            if (pos <= 0) {
                return;
            }

            const name =
                item
                    .substring(
                        0,
                        pos
                    )
                    .trim();

            const value =
                item
                    .substring(
                        pos + 1
                    )
                    .trim();

            if (!name) {
                return;
            }

            result[name] = value;
        });

    return result;
}


/*
 * Cookie 对象 → 字符串
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
 * 合并 Cookie。
 *
 * 旧 Cookie 保留，
 * 新请求中出现的同名 Cookie
 * 覆盖旧值。
 */
function mergeCookie(
    oldCookie,
    newCookie
) {

    const oldObj =
        parseCookie(oldCookie);

    const newObj =
        parseCookie(newCookie);

    Object.keys(newObj)
        .forEach(function (key) {

            oldObj[key] =
                newObj[key];
        });

    return buildCookie(
        oldObj
    );
}


/*
 * 判断 Cookie 中是否存在
 * Discuz 登录认证相关 Cookie。
 *
 * 不绑定具体随机前缀。
 *
 * 常见登录 Cookie 名称中会出现：
 * *_auth
 *
 * 这里只判断 Cookie 名，
 * 不记录或打印具体认证值。
 */
function hasLoginCookie(cookie) {

    const obj =
        parseCookie(cookie);

    const keys =
        Object.keys(obj);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {

        const name =
            keys[i]
                .toLowerCase();

        if (
            name === "auth" ||
            name.endsWith("_auth") ||
            name.indexOf("auth") !== -1
        ) {

            if (
                String(
                    obj[keys[i]] || ""
                ).length > 5
            ) {

                return true;
            }
        }
    }

    return false;
}


/*
 * Cookie 是否完全一致。
 */
function cookieEqual(
    a,
    b
) {

    const aObj =
        parseCookie(a);

    const bObj =
        parseCookie(b);

    const aKeys =
        Object.keys(aObj)
            .sort();

    const bKeys =
        Object.keys(bObj)
            .sort();

    if (
        aKeys.length !==
        bKeys.length
    ) {
        return false;
    }

    for (
        let i = 0;
        i < aKeys.length;
        i++
    ) {

        if (
            aKeys[i] !==
            bKeys[i]
        ) {
            return false;
        }

        if (
            String(
                aObj[aKeys[i]]
            ) !==
            String(
                bObj[bKeys[i]]
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
            typeof $request ===
                "undefined" ||
            !$request
        ) {

            log(
                "未发现请求对象"
            );

            return;
        }


        const incomingCookie =
            getHeader(
                $request.headers ||
                {},
                "Cookie"
            );


        /*
         * 请求本身没有 Cookie，
         * 直接忽略。
         */
        if (!incomingCookie) {

            log(
                "当前请求无 Cookie，忽略"
            );

            return;
        }


        const oldCookie =
            $persistentStore.read(
                COOKIE_KEY
            ) || "";


        /*
         * 关键：
         * 不直接覆盖。
         *
         * 将当前请求 Cookie
         * 合并进原有 Cookie。
         */
        const mergedCookie =
            mergeCookie(
                oldCookie,
                incomingCookie
            );


        /*
         * 如果合并后仍没有
         * 登录认证 Cookie，
         * 不写入。
         *
         * 防止 lastact 等普通 Cookie
         * 被误当成登录 Cookie。
         */
        if (
            !hasLoginCookie(
                mergedCookie
            )
        ) {

            log(
                "未检测到登录认证 Cookie，忽略"
            );

            return;
        }


        /*
         * 内容完全没变化：
         * 不重复保存、
         * 不重复通知。
         */
        if (
            oldCookie &&
            cookieEqual(
                oldCookie,
                mergedCookie
            )
        ) {

            log(
                "Cookie 未变化"
            );

            return;
        }


        const saved =
            $persistentStore.write(
                mergedCookie,
                COOKIE_KEY
            );


        if (
            saved === false
        ) {

            log(
                "Cookie 保存失败"
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
            "登录状态已更新"
        );


    } catch (e) {

        log(
            "捕获异常：" +
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


try {

    main();

} finally {

    /*
     * http-request：
     * 不修改原始请求。
     */
    $done({});
}