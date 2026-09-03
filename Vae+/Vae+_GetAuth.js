/*
Vae+ Auth Capture Final
Loon

保存:
VAE_SIGN_REQUEST
VAE_SIGN_AUTH
*/


const REQUEST_KEY = "VAE_SIGN_REQUEST";
const AUTH_KEY = "VAE_SIGN_AUTH";

function log(t){
    console.log("[Vae+] " + t);
}


function parseJSON(t){
    try{
        return JSON.parse(t);
    }catch(e){
        return null;
    }
}


function parseForm(str){

    let obj={};

    if(!str) return obj;


    str.split("&").forEach(i=>{

        let p=i.indexOf("=");

        if(p>0){

            obj[
                decodeURIComponent(i.slice(0,p))
            ] =
            decodeURIComponent(
                i.slice(p+1)
            );

        }

    });

    return obj;
}



function save(key,data){

    $persistentStore.write(
        JSON.stringify(data),
        key
    );

}



try{


    if(!$response.body){
        $done({});
        return;
    }


    let res =
    parseJSON(
        $response.body
    );


    if(!res){
        $done({});
        return;
    }


    let requestVar =
    res.requestVar || "";


    if(
        !requestVar ||
        !requestVar.includes(
            "/USER_HOME/getRecord.json"
        )
    ){

        $done({});
        return;
    }



    let url =
    $request.url || "";


    let q="";


    if(url.includes("?")){

        let query =
        url.split("?")[1];

        let params =
        parseForm(query);


        q=params.q || "";

    }



    if(!q && $request.body){

        let body =
        parseForm(
            $request.body
        );

        q=body.q || "";

    }



    let requestData={

        url:url,

        method:
        $request.method || "POST",


        headers:
        $request.headers || {},


        body:
        $request.body || "",


        q:q,


        action:
        "/USER_HOME/getRecord.json",


        updateTime:
        new Date().toISOString()

    };



    let authData={

        action:
        "/USER_HOME/getRecord.json",


        q:q,


        requestVar:requestVar,


        updateTime:
        new Date().toISOString()

    };



    save(
        REQUEST_KEY,
        requestData
    );


    save(
        AUTH_KEY,
        authData
    );


    log(
        "签到请求已更新"
    );


    $notification.post(
        "Vae+",
        "签到授权更新",
        "签到请求已保存"
    );


}catch(e){

    log(
        "错误:"+e
    );

}


$done({});