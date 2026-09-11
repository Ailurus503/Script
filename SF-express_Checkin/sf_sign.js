/*
 * 顺丰会员自动签到 - Loon
 * 修正版
 *
 * 修正：
 * 1. POST Body 实际为 {}，不是 e30=
 * 2. 补齐顺丰 H5 接口主要请求头
 * 3. 同时发送 JSESSIONID + sessionId
 * 4. 自动查询今日签到状态
 * 5. 未签到才执行签到
 */

const KEY = "sfexpress_sessionid";

const BASE =
  "https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/" +
  "~memberNonactivity~integralSignV2Service~";

function notify(subtitle, message) {
  $notification.post("顺丰签到", subtitle, message || "");
}

function log(name, data) {
  console.log("[SF] " + name + ": " + JSON.stringify(data));
}

/* Base64 解码 */
function base64Decode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  str = String(str || "")
    .replace(/\s/g, "")
    .replace(/=+$/, "");

  let output = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < str.length; i++) {
    const value = chars.indexOf(str[i]);

    if (value < 0) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }

  return output;
}

/* UTF-8 解码 */
function utf8Decode(bytes) {
  let result = "";

  for (let i = 0; i < bytes.length; ) {
    const b1 = bytes[i++];

    if (b1 < 0x80) {
      result += String.fromCharCode(b1);
    } else if ((b1 & 0xe0) === 0xc0) {
      const b2 = bytes[i++] & 0x3f;

      result += String.fromCharCode(
        ((b1 & 0x1f) << 6) | b2
      );
    } else if ((b1 & 0xf0) === 0xe0) {
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;

      result += String.fromCharCode(
        ((b1 & 0x0f) << 12) |
        (b2 << 6) |
        b3
      );
    } else {
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;
      const b4 = bytes[i++] & 0x3f;

      let cp =
        ((b1 & 0x07) << 18) |
        (b2 << 12) |
        (b3 << 6) |
        b4;

      cp -= 0x10000;

      result += String.fromCharCode(
        0xd800 + (cp >> 10),
        0xdc00 + (cp & 0x3ff)
      );
    }
  }

  return result;
}

/* 顺丰响应可能为 Base64，也可能直接 JSON */
function parseResponse(data) {
  if (!data) {
    throw new Error("服务器返回空数据");
  }

  const raw = String(data).trim();

  /* 直接 JSON */
  if (raw.startsWith("{") || raw.startsWith("[")) {
    return JSON.parse(raw);
  }

  /* Base64 JSON */
  const bytes = base64Decode(raw);
  const decoded = utf8Decode(bytes);

  return JSON.parse(decoded);
}

function getHeaders(sessionId) {
  return {
    "Content-Type": "application/json",

    "Accept":
      "application/json, text/plain, */*",

    "channel":
      "autoappmy",

    "syscode":
      "MCS-MIMP-CORE",

    "platform":
      "SFAPP",

    "Origin":
      "https://mcs-mimp-web.sf-express.com",

    "Referer":
      "https://mcs-mimp-web.sf-express.com/up-member/newHome",

    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Mobile/15E148 mediaCode=SFEXPRESSAPP-iOS-ML",

    "Cookie":
      "JSESSIONID=" +
      sessionId +
      "; sessionId=" +
      sessionId
  };
}

function request(api, sessionId, callback) {
  const options = {
    url: BASE + api,

    headers: getHeaders(sessionId),

    /*
     * 重点：
     *
     * HAR 中：
     *
     * encoding: base64
     * text: e30=
     *
     * 代表 HAR 把原始 {} 用 Base64 保存。
     *
     * 实际 HTTP Body 是：
     *
     * {}
     */
    body: "{}",

    timeout: 20
  };

  console.log("[SF] POST " + api);

  $httpClient.post(
    options,
    function(error, response, data) {
      if (error) {
        callback(
          new Error("网络请求失败：" + error)
        );

        return;
      }

      const status =
        response &&
        (response.statusCode ||
          response.status);

      if (
        status &&
        Number(status) >= 400
      ) {
        callback(
          new Error("HTTP " + status)
        );

        return;
      }

      try {
        const obj =
          parseResponse(data);

        log(api, obj);

        callback(null, obj);
      } catch (e) {
        console.log(
          "[SF] 原始返回：" + data
        );

        callback(
          new Error(
            "返回解析失败：" +
              e.message
          )
        );
      }
    }
  );
}

/* =========================
   主程序
   ========================= */

const sessionId =
  $persistentStore.read(KEY);

if (!sessionId) {
  notify(
    "没有登录凭据",
    "请先打开顺丰 App → 进入会员签到页面，让 Loon 捕获 sessionId。"
  );

  $done();
} else {
  /*
   * 第一步：
   * 查询今天是否已经签到
   */

  request(
    "getTodaySign",
    sessionId,
    function(error, result) {
      if (error) {
        notify(
          "查询失败",
          error.message
        );

        $done();

        return;
      }

      if (!result) {
        notify(
          "查询异常",
          "服务器没有返回有效数据"
        );

        $done();

        return;
      }

      if (result.success !== true) {
        notify(
          "查询失败",
          result.errorMessage ||
            result.message ||
            "顺丰接口返回失败"
        );

        $done();

        return;
      }

      if (!result.obj) {
        notify(
          "查询异常",
          "接口没有返回签到状态"
        );

        $done();

        return;
      }

      /*
       * 今天已经签到
       */

      if (result.obj.signed === true) {
        const days =
          result.obj.dayCount != null
            ? result.obj.dayCount
            : "?";

        const text =
          result.obj.bubbleText || "";

        notify(
          "今日已签到",
          "连续签到 " +
            days +
            " 天" +
            (text
              ? "\n" + text
              : "")
        );

        $done();

        return;
      }

      /*
       * 今天尚未签到
       */

      console.log(
        "[SF] 今日尚未签到，开始签到"
      );

      request(
        "sign",
        sessionId,
        function(
          signError,
          signResult
        ) {
          if (signError) {
            notify(
              "签到失败",
              signError.message
            );

            $done();

            return;
          }

          if (
            !signResult ||
            signResult.success !== true
          ) {
            notify(
              "签到失败",
              signResult &&
              (signResult.errorMessage ||
                signResult.message)
                ? signResult.errorMessage ||
                    signResult.message
                : "服务器未返回签到成功"
            );

            $done();

            return;
          }

          if (
            !signResult.obj ||
            signResult.obj.signed !==
              true
          ) {
            notify(
              "签到异常",
              "服务器没有返回 signed=true"
            );

            $done();

            return;
          }

          const obj =
            signResult.obj;

          const days =
            obj.dayCount != null
              ? obj.dayCount
              : "?";

          let awardText = "";

          /*
           * HAR 实际返回：
           *
           * awardType: SFP
           * awardNum: 2
           */

          if (
            obj.awardNum != null
          ) {
            awardText =
              obj.awardNum +
              (obj.awardType ===
              "SFP"
                ? " 积分"
                : "");
          }

          /*
           * 兼容 award.productDTOList
           */

          if (
            !awardText &&
            obj.award &&
            Array.isArray(
              obj.award
                .productDTOList
            ) &&
            obj.award
              .productDTOList
              .length > 0
          ) {
            const p =
              obj.award
                .productDTOList[0];

            awardText =
              (p.amount != null
                ? p.amount + " "
                : "") +
              (p.productName ||
                "");
          }

          notify(
            "签到成功",
            "连续签到 " +
              days +
              " 天" +
              (awardText
                ? "\n获得：" +
                  awardText
                : "")
          );

          $done();
        }
      );
    }
  );
}