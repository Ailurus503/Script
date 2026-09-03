/*
Vae+ Auto Sign Final
Loon
*/


const KEY =
"VAE_SIGN_REQUEST";


function log(t){
    console.log(
        "[Vae签到] "+t
    );
}


function notify(title,body){

    $notification.post(
        "Vae+",
        title,
        body
    );

}



function parseJSON(t){

    try{
        return JSON.parse(t);
    }catch(e){
        return null;
    }

}



function findRecord(obj){

    if(!obj ||
       typeof obj!=="object")
        return null;


    if(obj.signRecord)
        return obj.signRecord;



    for(let k in obj){

        if(
            typeof obj[k]==="object"
        ){

            let r =
            findRecord(obj[k]);

            if(r)
                return r;

        }

    }


    return null;

}



let saved =
$persistentStore.read(
    KEY
);


if(!saved){


    notify(
        "没有签到授权",
        "请打开 Vae+进入每日签到刷新"
    );


    $done();

}


let req =
parseJSON(saved);



if(!req || !req.url){


    notify(
        "签到数据异常",
        "请重新获取授权"
    );


    $done();

}



let option={

    url:req.url,

    headers:req.headers || {},

    body:req.body || ""

};



log(
    "开始执行签到"
);



$httpClient.post(
option,
function(error,response,body){


    if(error){


        notify(
            "签到失败",
            String(error)
        );


        $done();
        return;

    }



    let json =
    parseJSON(body);



    if(!json){


        notify(
            "返回异常",
            body.slice(0,100)
        );


        $done();
        return;

    }



    let record =
    findRecord(json);



    if(!record){


        notify(
            "签到结果未知",
            "没有找到签到数据"
        );


        $done();
        return;

    }



    let today =
    record.signToday === true;



    if(today){


        notify(
            "签到成功 ✅",
            "连续签到:"
            +(record.continuity||0)
            +"天\n累计:"
            +(record.totalCount||0)
            +"天"
        );


    }else{


        notify(
            "今日未签到 ⚠️",
            "请打开Vae+刷新签到授权"
        );

    }



    $done();


});