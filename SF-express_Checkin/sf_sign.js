/*
 * 顺丰会员自动签到 - Loon
 * 修正版 V2
 *
 * 原则：
 * 保留第一版已经验证可以正常请求顺丰服务器的结构，
 * 仅修正 HAR Body：
 *
 * HAR:
 * encoding = base64
 * text     = e30=
 *
 * 实际 HTTP Body：
 * {}
 */

const KEY = "sfexpress_sessionid";

const BASE =
  "https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/" +
  "~memberNonactivity~integralSignV2Service~";


/* ==============================
 * 通知
 * ============================== */

function notify(subtitle, message) {
  $notification.post(
    "顺丰签到",
    subtitle,
    message || ""
  );
}


/* ==============================
 * Base64 解码
 * ============================== */

function base64ToBytes(input) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  const clean = String(input || "")
    .replace(/[\r\n\s]/g, "")
    .replace(/=+$/, "");

  let buffer = 0;
  let bits = 0;

  const out = [];

  for (let i = 0; i < clean.length; i++) {

    const v = chars.indexOf(clean[i]);

    if (v < 0) {
      continue;
    }

    buffer = (buffer << 6) | v;
    bits += 6;

    if (bits >= 8) {

      bits -= 8;

      out.push(
        (buffer >> bits) & 0xff
      );
    }
  }

  return out;
}


/* ==============================
 * UTF8 解码
 * ============================== */

function utf8Decode(bytes) {

  let s = "";

  for (let i = 0; i < bytes.length;) {

    const b0 = bytes[i++];

    if (b0 < 0x80) {

      s += String.fromCharCode(b0);

    } else if ((b0 & 0xe0) === 0xc0) {

      const b1 =
        bytes[i++] & 0x3f;

      s += String.fromCharCode(
        ((b0 & 0x1f) << 6) |
        b1
      );

    } else if ((b0 & 0xf0) === 0xe0) {

      const b1 =
        bytes[i++] & 0x3f;

      const b2 =
        bytes[i++] & 0x3f;

      s += String.fromCharCode(
        ((b0 & 0x0f) << 12) |
        (b1 << 6) |
        b2
      );

    } else {

      const b1 =
        bytes[i++] & 0x3f;

      const b2 =
        bytes[i++] & 0x3f;

      const b3 =
        bytes[i++] & 0x3f;

      let cp =
        ((b0 & 0x07) << 18) |
        (b1 << 12) |
        (b2 << 6) |
        b3;

      cp -= 0x10000;

      s += String.fromCharCode(
        0xd800 + (cp >> 10),
        0xdc00 + (cp & 0x3ff)
      );
    }
  }

  return s;
}


/* ==============================
 * 解析返回
 *
 * 顺丰有时直接返回 JSON，
 * 有时返回 Base64 JSON。
 * ============================== */

function parseResponse(data) {

  const raw =
    String(data || "").trim();

  if (!raw) {

    throw new Error(
      "服务器返回空内容"
    );
  }


  /* 直接 JSON */

  if (
    raw.charAt(0) === "{" ||
    raw.charAt(0) === "["
  ) {

    return JSON.parse(raw);
  }


  /* Base64 */

  const decoded =
    utf8Decode(
      base64ToBytes(raw)
    );

  return JSON.parse(decoded);
}


/* ==============================
 * 请求头
 *
 * 保留第一版最小请求头。
 * 不再乱加 channel/syscode 等。
 * ============================== */

function headers(sessionId) {

  return {

    "Content-Type":
      "application/json",

    "Origin":
      "https://mcs-mimp-web.sf-express.com",

    "Referer":
      "https://mcs-mimp-web.sf-express.com/up-member/newHome",

    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Mobile/15E148 mediaCode=SFEXPRESSAPP-iOS-ML",

    "Cookie":
      "sessionId=" + sessionId
  };
}


/* ==============================
 * POST
 * ============================== */

function post(
  api,
  sessionId,
  callback
) {

  const options = {

    url:
      BASE + api,

    headers:
      headers(sessionId),

    /*
     * 重点：
     *
     * 这里必须是真正的 JSON：
     */
    body:
      "{}"
  };


  console.log(
    "[SF] POST " + api
  );


  $httpClient.post(
    options,
    function(
      error,
      response,
      data
    ) {

      /*
       * 网络错误
       */

      if (error) {

        console.log(
          "[SF] HTTP Error: " +
          String(error)
        );

        callback(
          new Error(
            "网络请求失败：" +
            String(error)
          )
        );

        return;
      }


      /*
       * HTTP 状态
       */

      const status =
        response &&
        (
          response.status ||
          response.statusCode
        );


      console.log(
        "[SF] HTTP Status: " +
        status
      );


      if (
        status &&
        Number(status) >= 400
      ) {

        callback(
          new Error(
            "HTTP " + status
          )
        );

        return;
      }


      /*
       * 打印原始响应
       */

      console.log(
        "[SF] RAW: " +
        String(data)
      );


      /*
       * 解析响应
       */

      try {

        const result =
          parseResponse(data);

        console.log(
          "[SF] " +
          api +
          ": " +
          JSON.stringify(result)
        );

        callback(
          null,
          result
        );

      } catch (e) {

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


/* =====================================
 *
 * 主程序
 *
 * ===================================== */


const sessionId =
  $persistentStore.read(KEY);


/* 没抓到 Cookie */

if (!sessionId) {

  notify(
    "未获取登录凭据",
    "请开启 Loon 后进入一次顺丰 App 会员签到页。"
  );

  $done();

} else {


  console.log(
    "[SF] 已读取 sessionId"
  );


  /*
   * ① 查询今天签到状态
   */

  post(
    "getTodaySign",
    sessionId,
    function(
      error,
      today
    ) {

      if (error) {

        notify(
          "查询失败",
          error.message
        );

        $done();

        return;
      }


      /*
       * 顺丰返回失败
       */

      if (
        !today ||
        today.success !== true
      ) {

        const msg =
          today &&
          (
            today.errorMessage ||
            today.message
          )
            ?
            (
              today.errorMessage ||
              today.message
            )
            :
            "顺丰接口返回失败";


        notify(
          "查询失败",
          msg
        );


        console.log(
          "[SF] getTodaySign: " +
          JSON.stringify(today)
        );


        $done();

        return;
      }


      /*
       * 没有 obj
       */

      if (!today.obj) {

        notify(
          "查询异常",
          "服务器没有返回签到状态"
        );

        $done();

        return;
      }


      /*
       * ② 今天已经签到
       */

      if (
        today.obj.signed === true
      ) {

        const days =
          today.obj.dayCount != null
            ?
            today.obj.dayCount
            :
            "?";


        const bubble =
          today.obj.bubbleText || "";


        notify(
          "今日已签到",

          "连续签到 " +
          days +
          " 天" +

          (
            bubble
              ?
              "\n" + bubble
              :
              ""
          )
        );


        $done();

        return;
      }


      /*
       * ③ 尚未签到
       */

      console.log(
        "[SF] 今日未签到，开始执行签到"
      );


      post(
        "sign",
        sessionId,
        function(
          signError,
          result
        ) {


          if (signError) {

            notify(
              "签到失败",
              signError.message
            );

            $done();

            return;
          }


          /*
           * 签到接口返回失败
           */

          if (
            !result ||
            result.success !== true
          ) {

            const msg =
              result &&
              (
                result.errorMessage ||
                result.message
              )
                ?
                (
                  result.errorMessage ||
                  result.message
                )
                :
                "服务器未返回成功状态";


            notify(
              "签到失败",
              msg
            );


            $done();

            return;
          }


          /*
           * 未返回 signed=true
           */

          if (
            !result.obj ||
            result.obj.signed !== true
          ) {

            notify(
              "签到异常",
              "服务器没有返回 signed=true"
            );

            $done();

            return;
          }


          const obj =
            result.obj;


          const days =
            obj.dayCount != null
              ?
              obj.dayCount
              :
              "?";


          let award = "";


          /*
           * HAR 中：
           *
           * awardNum
           * awardType = SFP
           */

          if (
            obj.awardNum != null
          ) {

            award =
              obj.awardNum +
              (
                obj.awardType === "SFP"
                  ?
                  " 积分"
                  :
                  ""
              );
          }


          /*
           * 签到成功
           */

          notify(
            "签到成功",

            "连续签到 " +
            days +
            " 天" +

            (
              award
                ?
                "\n获得：" +
                award
                :
                ""
            )
          );


          $done();
        }
      );
    }
  );
}