/* Vae+ 授权捕获。Surge http-response, requires-body=true。
 * 只保存 Cookie、公钥和设备鉴权字段；不保存业务请求或 q。
 * 对 api1.starfans.com 启用 MITM；登录请求可能在 /auth/ 之外。
 */
(function () {
    const KEY = 'VAE_AUTH_V2';
    const URL = /^https:\/\/api1\.starfans\.com\//i;
    const FIELDS = ['userId', 'self_userid', 'uvkey', 'uvsign', 'registrationId', 'sysModel', 'sys_v', 'app_v', 'terminal', 'app_o'];
    function header(obj, name) {
        if (!obj) return '';
        const k = Object.keys(obj).find(x => x.toLowerCase() === name.toLowerCase());
        return k ? String(obj[k] || '') : '';
    }
    function params(s) {
        const out = {};
        String(s || '').split('&').forEach(piece => {
            const i = piece.indexOf('=');
            if (i < 0) return;
            try { out[decodeURIComponent(piece.slice(0, i).replace(/\+/g, ' '))] = decodeURIComponent(piece.slice(i + 1).replace(/\+/g, ' ')); } catch (_) {}
        });
        return out;
    }
    function findKey(value, depth) {
        if (!value || typeof value !== 'object' || depth > 7) return '';
        for (const name of ['sslPubKey', 'ssl_pub_key']) {
            if (typeof value[name] === 'string' && value[name].length > 140) return value[name];
        }
        for (const name of Object.keys(value)) {
            const found = findKey(value[name], depth + 1);
            if (found) return found;
        }
        return '';
    }
    try {
        if (!URL.test(($request || {}).url || '')) return $done({});
        const body = JSON.parse(($response || {}).body || '{}');
        const rv = params(body.requestVar);
        let device = {};
        try { device = JSON.parse(rv.data || '{}'); } catch (_) {}
        const saved = JSON.parse($persistentStore.read(KEY) || '{}');
        const requestUrl = String(($request || {}).url || '');
        const actionText = String(rv.action || '') + ' ' + requestUrl;
        if (/(?:logout|signout|sign-out|退出登录)/i.test(actionText) && body.state === true) {
            $persistentStore.write('', KEY);
            console.log('[Vae+ GetAuth] 已确认退出登录，旧授权资料已清除');
            return $done({});
        }
        const loginUser = body.result && body.result.userInfo && body.result.userInfo.userId;
        const incomingUser = String(loginUser || device.userId || rv.userId || '');
        if (saved.userId && incomingUser && saved.userId !== incomingUser) {
            Object.keys(saved).forEach(k => delete saved[k]);
        }
        const previousCookie = String(saved.cookie || '');
        let cookieCaptured = false;
        const cookie = header($request.headers, 'Cookie');
        if (cookie) {
            saved.cookie = cookie;
            cookieCaptured = true;
        }
        const setCookie = header($response.headers, 'Set-Cookie');
        if (setCookie) {
            const first = setCookie.split(';')[0].trim();
            if (/^[^=;,\s]+=/.test(first)) {
                const name = first.split('=')[0];
                const old = String(saved.cookie || '').split(';').map(x => x.trim()).filter(x => x && x.split('=')[0] !== name);
                old.push(first);
                saved.cookie = old.join('; ');
                cookieCaptured = true;
            }
        }
        const agent = header($request.headers, 'User-Agent');
        if (agent) saved.userAgent = agent;
        for (const k of FIELDS) {
            const v = device[k] == null ? (rv[k] == null ? '' : rv[k]) : device[k];
            if (v !== '') saved[k] = String(v);
        }
        if (incomingUser) saved.userId = incomingUser;
        const publicKey = findKey(body, 0);
        if (publicKey) saved.sslPubKey = publicKey.replace(/-----[^-]+-----|\s/g, '');
        if (!publicKey && /(?:login|authoriz|signin)/i.test(String(rv.action || $request.url))) {
            const result = body.result && typeof body.result === 'object' ? body.result : {};
            console.log('[Vae+ GetAuth] 登录响应未找到 sslPubKey；字段：' + Object.keys(result).join(','));
        }
        if (Object.keys(saved).length) {
            const authReady = Boolean(saved.cookie && saved.userId && saved.sslPubKey && saved.uvkey && saved.uvsign);
            const cookieChanged = cookieCaptured && saved.cookie !== previousCookie;
            const shouldNotify = authReady && (saved.authNoticeVersion !== 1 || cookieChanged);
            if (shouldNotify && typeof $notification !== 'undefined') {
                try {
                    $notification.post(
                        'Vae+ 授权获取',
                        'Cookie 已捕获',
                        '授权资料已保存，可以运行 Vae+ 每日签到。'
                    );
                    saved.authNoticeVersion = 1;
                } catch (e) {
                    console.log('[Vae+ GetAuth] 通知发送失败：' + String(e));
                }
            }
            saved.updatedAt = Date.now();
            $persistentStore.write(JSON.stringify(saved), KEY);
            const cookieStatus = cookieCaptured ? '本次捕获' : (saved.cookie ? '已有保存' : '未获取');
            console.log('[Vae+ GetAuth] 授权资料已更新；Cookie=' + cookieStatus + '；公钥=' + (saved.sslPubKey ? '已获取' : '尚未捕获登录响应'));
        }
    } catch (e) {
        console.log('[Vae+ GetAuth] 解析失败：' + String(e));
    }
    $done({});
})();