/*
顺丰 Cookie 获取
Loon Request Script
*/

const KEY = "sfexpress_cookie";


function log(msg){
    console.log("[SF Cookie] " + msg);
}


function extract(cookie){

    if(!cookie){
        return "";
    }


    let arr=[];


    let sid =
    cookie.match(
        /sessionId=[^;]+/i
    );

    if(sid){
        arr.push(sid[0]);
    }


    let js =
    cookie.match(
        /JSESSIONID=[^;]+/i
    );

    if(js){
        arr.push(js[0]);
    }


    let token =
    cookie.match(
        /token=[^;]+/i
    );

    if(token){
        arr.push(token[0]);
    }


    return arr.join("; ");
}



try{


    let cookie =
    $request.headers.Cookie ||
    $request.headers.cookie;


    let result =
    extract(cookie);



    if(result){


        let old =
        $persistentStore.read(KEY);



        if(old !== result){


            $persistentStore.write(
                result,
                KEY
            );


            log(
                "保存成功:" +
                result
            );


            $notification.post(
                "顺丰签到",
                "登录状态更新",
                "Cookie已更新"
            );


        }else{


            log(
                "Cookie无变化"
            );

        }


    }else{


        log(
            "请求没有Cookie"
        );

    }



}catch(e){


    log(
        "异常:" + e
    );

}



$done();