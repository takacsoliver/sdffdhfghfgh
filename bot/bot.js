var SteamUser = require('steam-user');
var SteamTotp = require('steam-totp');
var SteamMobileAuth = require('steamcommunity-mobile-confirmations');
var Steam = require('steam'); //use npm install steam@0.6.8 - this code isn't compatible with the latest version.
var SteamTradeOffers = require('steam-tradeoffers'); //use npm install steam-tradeoffers@1.2.3 - this code isn't compatible with the latest version.
var mysql = require('mysql');
var request = require("request");
var SteamCommunity = require('steamcommunity');

var community = new SteamCommunity();
var steam = new Steam.SteamClient();
var offers = new SteamTradeOffers();

var admin = '76561198331338945'; //the id of the person that can use /commands and empty the bots inventory via chat etc

//contents of mafile
var TOTP_UserConfig = {"shared_secret":"6ZO9pH/fUC4LUG5JVGlnQmtG1sI=","serial_number":"4877503845860395080","revocation_code":"R38550","uri":"otpauth://totp/Steam:betandwinskinsbot01?secret=5GJ33JD735IC4C2QNZEVI2LHIJVUNVWC&issuer=Steam","server_time":1491085860,"account_name":"betandwinskinsbot01","token_gid":"73970496d31ddde","identity_secret":"r7lkBb+OQibgs8eyqJcTtrVn4Ew=","secret_1":"TOOYoziB5yV9qeFGuaebIjI5UCk=","status":1,"device_id":"android:20492ad5-6392-2ad5-2ad5-2ad563921567","fully_enrolled":true,"Session":{"SessionID":"d4a73a0befd7cd0471e26ba1","SteamLogin":"76561198377847815%7C%7C634CBB82549B404AFBC76B1B5EBB7CFFDE271A4D","SteamLoginSecure":"76561198377847815%7C%7CC40C008983827FBF29DBC992196919C623C003A9","WebCookie":"DB6ADB6097433B38A92B904911B2E806D6CCD7D1","OAuthToken":"300dae82db1e7ec79966cae09635fdb3","SteamID":76561198377847815}} //object containing shared_secret, identitiy_secret etc. get it by logging in the bot with this software https://github.com/Jessecar96/SteamDesktopAuthenticator/releases (after you log in you will have an mafile created, copy-paste the contents of that file here)

var client = new SteamUser();
var code = SteamTotp.generateAuthCode(TOTP_UserConfig.shared_secret);
var logOnOptions = {
    "accountName": "betandwinskinsbot01",
    "password": "T!m1efz[xm-h53Un",
    "twoFactorCode": code
}


// EDIT THESE VARIABLES IN include/config.php AS WELL ON THE SITE!
var GameTime=90; //round time in seconds (recommended: 120) //should make this 3-5 seconds longer than the one in config.php
var maxitems=20; //max items a player can deposit PER ROUND (recommended: 10)
var maxitemsinpot=100; //max items in pot (recommended: 50)
var minbet=0.1; //min value PER BET an user can deposit
//if you chance one of these variables ^ and you get any kind of errors on the site you may also want to check app.js in static/js/app.js
var accesspassword='T!m1efz[xm-h53Un'; //you can set this to whatever you want as long as its matching the same variable in include/config.php (this is used to safely access endgame.php and cost.php)
var gamedbprefix='z_round_';
var offerssent=[]; //as long as the bot is running it adds the game ids in this array and checks it before sending an offer (another thing to stop multiple offers...). if the bot is restarted this is emptied
var itemprices={}; //as long as the bot is running it adds the item prices in this array, whenever it gets an item from this array it doesnt try to get it from the site (saves time, resources)
var sitename = "betandwinskins.com"; //site url WITH NO http:// in front of it and NO forward slash ( / ) after it
var steamstatusurl = 'http://'+sitename+'/steamstatus.php';
var contentcreatorsurl = 'http://'+sitename+'/cc.php';
var gamestarted='no';

// (HAS TO BE GENERATED ON THE BOT ACCOUNT !!!)
var apik = '86582B80612E3A774BB20FFB5B888703'; //steam api key, you can get one at https://steamcommunity.com/dev
////
var prf=gamedbprefix;



//when first logging in the bot you will receive an authentication code via e-mail and then the bot won't be able to trade for 7 days
var authCode = ''; //this is the code you'll receive via e-mail when first logging in the bot
var mobileConfirmations;
var globalSessionID;


if (require('fs').existsSync('sentry_' + logOnOptions['accountName'] + '.hash')) {
    logOnOptions['shaSentryfile'] = require('fs').readFileSync('sentry_' + logOnOptions['accountName'] + '.hash');

} else if (require('fs').existsSync('ssfn_' + logOnOptions['accountName'])) {
    var sha = require('crypto').createHash('sha1');
    sha.update(require('fs').readFileSync('ssfn_' + logOnOptions['accountName']));
    var sentry = new Buffer(sha.digest(), 'binary');
    logOnOptions['shaSentryfile'] = sentry;
    require('fs').writeFileSync('sentry_' + logOnOptions['accountName'] + '.hash', sentry);

    myconsolelog('Converting ssfn to sentry file!');
    myconsolelog('Now you can remove ssfn_' + logOnOptions['accountName']);

} else if (authCode != '') {

    logOnOptions['authCode'] = authCode;

}



//socket
var connections=0;
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
io.on('connection', function(socket){

    connections=connections+1;
 //   myconsolelog('[socket] a user connected. total connections: '+connections);
    //

    socket.emit('handshake',1);
    socket.emit('online',connections);

    request(steamstatusurl+'?pw='+accesspassword, function(error, response, body) {
        //myconsolelog('steamstatus: '+body);
        io.emit('steamstatus',body);
    });
    request(contentcreatorsurl+'?pw='+accesspassword, function(error, response, body) {
        //myconsolelog('steamstatus: '+body);
        io.emit('cc',body);
    });

    socket.on('disconnect', function(){

        connections=connections-1;
//        myconsolelog('[socket] user disconnected total connections: '+connections);
        socket.emit('online',connections);

    });
    
});
//


var mysqlInfo; //ENABLE REMOTE MYSQL IF THE DATABASE IS HOSTED ON ANOTHER SERVER THAN THE BOT (usually the case)
mysqlInfo = {
    host: 'localhost',
    user: 'root',
    password: 'T!m1efz[xm-h53Un',
    database: 'csgospinner',
    charset: 'utf8_general_ci'
};

var mysqlConnection = mysql.createConnection(mysqlInfo);

mysqlConnection.connect(function(err) {
    if (err) {
        myconsolelog('MYSQL ERROR. err.code: '+err.code+' (err.fatal: '+err.fatal+')');
        myconsolelog('MYSQL ERROR. err.stack: '+err.stack);
        return;
    }

    myconsolelog('Connected to MySQL database "'+mysqlInfo['database']+'" on host "'+mysqlInfo['host']+'". Connection id: ' + mysqlConnection.threadId);
});

var recheck = true;

client.logOn(logOnOptions);

client.on('debug', function(text) {
    console.log(text);
    require('fs').appendFile('debug.log', text + "\r\n");
});


client.on('error', function(text){
        console.log('There was an error: ' + text);
});


















client.on('loggedOn', function(result) {
        console.log('Logged in!');
        client.setPersona(SteamUser.Steam.EPersonaState.LookingToTrade);
           setTimeout(loadinventory,5000);
    	

       
    setTimeout(function() {
        mysqlConnection.query('SELECT `value` FROM `info` WHERE `name`=\'current_game\'', function(err, rows, fields) {
            if (err) return;

            mysqlConnection.query('SELECT `starttime` FROM `games` WHERE `id`=\'' + rows[0].value + '\'', function(errs, rowss, fieldss) {
                if (errs) return;

                var timeleft;
                if (rowss[0].starttime == 2147483647) timeleft = GameTime;
                else {
                    var unixtime = Math.round(new Date().getTime() / 1000.0);
                    timeleft = rowss[0].starttime + GameTime - unixtime;
                    if (timeleft < 0) timeleft = 0;
                }
                if (timeleft != GameTime) {
                    setTimeout(EndGame, timeleft * 1000);
                    io.emit('roundstart','1');
                    gamestarted='yes';
                    myconsolelog('Restoring game on ' + timeleft + 'second');
                }
            });
        });
        weblogon();
    }, 1500);
       
       
});














 
function weblogon() {
        client.webLogOn();     
}
 
 
 
 
 
 
 
 
client.on('webSession', function(sessionID, cookies) {
    console.log('received websession: '+sessionID+' / '+cookies);
                globalSessionID = sessionID;   
                offers.setup({
                        sessionID: sessionID,
                        webCookie: cookies,
                        APIKey: apik
                }, function(err) {
                        if (err) {
                            console.log('offers.setup error: '+err);
                            return;
                        }
                    console.log("SessionID and cookies set."+sessionID+' / '+cookies);
                    /*mobileConfirmations = new SteamMobileAuth(
                    {
                            steamid:         TOTP_UserConfig.steamid,
                            identity_secret: TOTP_UserConfig.identity_secret,
                            //device_id:       TOTP_UserConfig.device_id,
                            device_id:       "android:" + Date.now(),
                            webCookie:       cookies
                    });*/
                });


                    community.setCookies(cookies);

                    community.startConfirmationChecker(25000,TOTP_UserConfig.identity_secret);

                    console.log("Mobile Conf. set-up and set cookies for community"+cookies);
});















/*

client.on('loggedOn', function(result) {
    myconsolelog('Logged in on Steam!');
    steam.setPersonaState(Steam.EPersonaState.LookingToTrade);
    steam.addFriend(admin);
    client.chatMessage(admin, "I'm online now.");
    loadinventory();
});

client.on('webSessionID', function(sessionID) {
    globalSessionID = sessionID;
    weblogon();
    setTimeout(function() {
        mysqlConnection.query('SELECT `value` FROM `info` WHERE `name`=\'current_game\'', function(err, rows, fields) {
            if (err) return;

            mysqlConnection.query('SELECT `starttime` FROM `games` WHERE `id`=\'' + rows[0].value + '\'', function(errs, rowss, fieldss) {
                if (errs) return;

                var timeleft;
                if (rowss[0].starttime == 2147483647) timeleft = GameTime;
                else {
                    var unixtime = Math.round(new Date().getTime() / 1000.0);
                    timeleft = rowss[0].starttime + GameTime - unixtime;
                    if (timeleft < 0) timeleft = 0;
                }
                if (timeleft != GameTime) {
                    setTimeout(EndGame, timeleft * 1000);
                    io.emit('roundstart','1');
                    gamestarted='yes';
                    myconsolelog('Restoring game on ' + timeleft + 'second');
                }
            });
        });
    }, 1500);
});

function weblogon() {
    steam.webLogOn(function(newCookie) {
        offers.setup({
            sessionID: globalSessionID,
            webCookie: newCookie
        }, function(err) {
            if (err) {}
        });
    });
}

*/

















setInterval(function () {
        //console.log("Auth key: "+SteamTotp.generateAuthCode(TOTP_UserConfig.shared_secret));
        /*
        if (mobileConfirmations) {
                mobileConfirmations.FetchConfirmations(function (err, confirmations) {
                        if (err) {
                            console.log('FetchConfirmations error: '+err);
                            weblogon();
                                return;
                        }
                        console.log('mobileConfirmations.FetchConfirmations received ' + confirmations.length + ' confirmations');
                        if (confirmations.length > 0) {
                                if ( ! confirmations.length)
                                {
                                        return;
                                }
                                mobileConfirmations.AcceptConfirmation(confirmations[0], function (err, result){
                                        if (err) {
                                                console.log('acc confirmation err: '+err);
                                                return;
                                        }
                                        console.log('mobileConfirmations.AcceptConfirmation result: ' + result);
                                });
                        };
                });
        }*/
        /*
        community.getConfirmations(function ( err, conf ) { //if this doesnt confirm it try the code above
                    if ( err ) {
                        console.log('community.getConfirmations error: '+err);
                    } else {
                        conf.forEach(function ( item ) {
                            item.respond(security.getAllowKey().time, security.getAllowKey().key, true, function () {

                            });
                        })
                    }
                });*/
/*
    var time_conf = Math.floor(Date.now() / 1000);
    var key_conf = SteamTotp.getConfirmationKey(TOTP_UserConfig.identity_secret, time_conf, 'conf');

    community.getConfirmations(time_conf, key_conf, function (err, confirmations) {
        if (err) { logger.error(err); return; }
        console.log('confirmations:');
        console.log(confirmations);

        var time_details = Math.floor(Date.now() / 1000);
        var key_details = SteamTotp.getConfirmationKey(TOTP_UserConfig.identity_secret, time_details, 'details');

        confirmations.forEach(function(confirmation) {
            confirmation.getOfferID(time_details, key_details, function(err, offerID) {
                if (err) { logger.error(err); return; }
                console.log('offerid: '+offerID);
                confirmation.respond(time_details,key_details,true,function(err){
                    if(err) console.log('confirmation.respond err: '+err);
                });
            });
        });
    });*/
console.log('checking confirmations');
community.checkConfirmations();
/*
        var timekey=Math.round(Date.now() / 1000);
        var confirmationkey = SteamTotp.getConfirmationKey(TOTP_UserConfig.identity_secret, timekey, "conf");

        community.getConfirmations(timekey, confirmationkey, function(err2,confirmations){
            if(err2){
                console.log(err2);
            }else{
                console.log(confirmations); //Gives '[]' even if there are waiting trades
                confirmations.forEach(function(conf,index,array){
                    setTimeout(function(conf){
                        var timekey2=Math.round(Date.now() / 1000);
                        var confirmationkey2 = SteamTotp.getConfirmationKey(TOTP_UserConfig.identity_secret, timekey2, "allow");

                            community.respondToConfirmation(conf.id,conf.key,timekey2,confirmationkey2,true,function(err){
                            if(err) console.log(err);
                            else conf.id+' confirmed';
                        });
                    },index*1500,conf);
                });
            }
        });
*/

},25000);
















community.on('newConfirmation',function(conf){
    console.log('newConfirmation '+conf);

                        var timekey3=Math.round(Date.now() / 1000);
                        var confirmationkey3 = SteamTotp.getConfirmationKey(TOTP_UserConfig.identity_secret, timekey3, "allow");

                            community.respondToConfirmation(conf.id,conf.key,timekey3,confirmationkey3,true,function(err){
                            if(err) console.log(err);
                            else conf.id+' confirmed (newConfirmation)';
                        });
});











community.on('confKeyNeeded', function(tag, callback) {
    console.log('confKeyNeeded');
    var time = Math.floor(Date.now() / 1000);
    callback(null, time, SteamTotp.getConfirmationKey(TOTP_UserConfig.identity_secret, time, tag));
});










function myconsolelog(text){
    console.log(text);
    require('fs').appendFile('bot_debug.log', text + "\r\n");
}












function getUserName(steamid) {
    getUserInfo(steamid, function(error, data) {
        if (error) throw error;
        var datadec = JSON.parse(JSON.stringify(data.response));
        return (cleanString(datadec.players[0].personaname));
    });
}








function proceedWinners() {
    var url = 'http://' + sitename + '/endgame.php?pw='+accesspassword;
    request(url, function(error, response, body) {

        myconsolelog('proceedwinners() callback response: '+body);
        gamestarted='no';
        io.emit('roundend',body);

    });
}









function getUserInfo(steamids, callback) {
    var url = 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=' + apik + '&steamids=' + steamids + '&format=json';
    request({
        url: url,
        json: true
    }, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            callback(null, body);
        } else if (error) {
            getUserInfo(steamids, callback);
        }
    });
}

function addslashes(str) {
    str = str.replace(/\\/g, '\\\\');
    str = str.replace(/\'/g, '\\\'');
    str = str.replace(/\"/g, '\\"');
    str = str.replace(/\0/g, '\\0');
    return str;
}

var locked = false,
    proceeded;
var itemscopy;
var detected = false;
var detected2 = false;
var endtimer = -1;

function updateOffer(tradeoffer,gameid) {
                                                       
        var url = "https://api.steampowered.com/IEconService/GetTradeOffer/v1/?key="+apik+"&format=json&tradeofferid="+tradeoffer+"";
        request(url, function(error, response, body){
               
                var sResponse = JSON.parse(body);
                var offerState = sResponse.response.offer.trade_offer_state;
                mysqlConnection.query('UPDATE `queue` SET `tradeStatus`=\''+offerState+'\' WHERE `id`=\''+gameid+'\'', function(err, row, fields) { if (err) throw err; });
                console.log("Successfully updated round #" + gameid);
               
        });
}
 
function checktrade(tradeoffer,rid) {
       
var url = "https://api.steampowered.com/IEconService/GetTradeOffer/v1/?key="+apik+"&format=json&tradeofferid="+tradeoffer+"";
request(url, function(error, response, body){
       
        if (body.indexOf("trade_offer_state") != -1) {
        var sResponse = JSON.parse(body);
       
        var offerState = sResponse.response.offer.trade_offer_state;
        mysqlConnection.query('UPDATE queue SET tradeStatus="'+offerState+'" WHERE id="'+rid+'"', function(err, row, fields) { if (err) throw err; });
       
        if (offerState == "8") {
               
                mysqlConnection.query('SELECT * FROM `queue` WHERE id="'+rid+'"', function(err, row, fields) {
                for(var i=0; i < row.length; i++) {
                               
                                //Get the number of attempts
                                var attempts = row[i].attempts;
                                if (attempts == 0) {
                                       
                                        //If another attempt to send items not made yet set attempts to 1
                                        attempts++;
                                        mysqlConnection.query('UPDATE queue SET attempts='+attempts+' WHERE id="'+rid+'"', function(err, row, fields) { if (err) throw err; });
                                        console.log('Updating the attempts made to send round #' + rid);
                                       
                                } else {
                               
                                        if (attempts == 1) {
                                                //If attempts has already been made set attempts to 2
                                                mysqlConnection.query('UPDATE queue SET attempts=2 WHERE id="'+rid+'"', function(err, row, fields) { if (err) throw err; });
                                                console.log('Updating the attempts made to send round #' + rid);
                                        }
                               
                                }
                                       
                }
                });
        }
       
        }
       
});
}

function sendoffers() {
    myconsolelog('........');
    myconsolelog('sendoffers() was called.');

    detected2 = false;
    offers.loadMyInventory({
        appId: 730,
        contextId: 2
    }, function(err, itemx) {
        if (err) {
            myconsolelog('Tried checking offers: ERROR 1! (error while loading own inventory). Check if steam servers are down at http://steamstat.us');
            weblogon();
            setTimeout(sendoffers, 2000);
            return;
        }
        if (detected2 == true) {
            myconsolelog('Tried checking offers: ERROR 2! (detected2==true) Maybe its sent already?');
            return;
        }
        if(itemx.length>0){ //sendoffers() cant work if the bot's inventory isnt being loaded (servers down)
            myconsolelog(itemx.length+' items in inventory.');
        }else{
            myconsolelog('WARNING! '+itemx.length+' items in inventory. The inventory may actually be empty OR steam servers are down. Check http://steamstat.us');
        }
        detected2 = true;
        itemscopy = itemx;
        detected = false;

                //Update the Status of trades
                mysqlConnection.query('SELECT * FROM queue WHERE tradeStatus =\'2\' OR tradeStatus =\'8\' AND token !="" ORDER BY id DESC LIMIT 10', function(err, rows, fields) {
                                for (var i=0;i < rows.length; i++) {
                                        var rid = rows[i].id;
                                        var tradeoffer = rows[i].status.replace("sent ","");
                                        checktrade(tradeoffer,rid);
                                }
                                console.log("Updating the status of trades..");
                });

        mysqlConnection.query('SELECT * FROM `queue` WHERE `status`=\'active\' ORDER BY `gameid` DESC LIMIT 1', function(err, row, fields) {
            if (err) {
                myconsolelog('Tried checking offers: ERROR 3! (mysql query error: '+err.stack+')');
                return;
            }
            if (detected == true) {
                myconsolelog('Tried checking offers: ERROR 4! (detected==true)');
                return;
            }

            detected = true;
///AUG | Chameleon (Field-Tested)/Dual Berettas | Moon in Libra (Factory New)/AK-47 | Safari Mesh (Field-Tested)/XM1014 | Blue Spruce (Field-Tested)/G3SG1 | Polar Camo (Minimal Wear)
            for (var y = 0; y < row.length; y++) {
                myconsolelog('Y: '+y+' Processing offer '+row[y].id+' for game '+row[y].gameid);
                if(!in_array(row[y].gameid,offerssent)){
                    if(row[y].token.length<5){
                        myconsolelog('Token is: '+row[y].token+' which seems to be incorrect. Stopping the process...');
                        myconsolelog('The "token" is the last part in trade url and it is 6 characters long, maybe user hasn\'t set his trade url in the database. Check user with steam id '+row[y].userid);
                    }

                    var queueid = row[y].id;
                    var gameid = row[y].gameid;
                    var theuserid = row[y].userid;
                    var thetoken = row[y].token;
                    var theitems=row[y].items;

                    var sendItems = (row[y].items).split('/');
                    var item = [],
                        queries = [],
                        itemstobesent = '',
                        itemidsintheoffer = [],
                        num = 0;

                    for (var x = 0; x < itemscopy.length; x++) {
                        (function(z){ //fucking bullshit asynchronous crap
                        mysqlConnection.query('SELECT * FROM `sentitems` WHERE `itemid`=\''+itemscopy[z].id+'\'', function(errz, rowz, fieldsz) {
                            if (errz) {
                                myconsolelog('Q:'+queueid+'/G:'+gameid+'/ Error while trying to check for sent items (mysql query error: '+errz.stack+')');
                                return;
                            }
                            itemscopy[z].market_name=itemscopy[z].market_name.replace('★','&#9733;');
                            itemscopy[z].market_name=itemscopy[z].market_name.replace('龍王','??');
                            itemscopy[z].market_name=itemscopy[z].market_name.replace('壱','?');

                            var countitems=rowz.length;
                                for (var j = 0; j < sendItems.length; j++) {
                                    if (itemscopy[z].tradable && (itemscopy[z].market_name).indexOf(sendItems[j]) == 0) {
                                            if(!(countitems>0)){
                                                    item[num] = {
                                                        appid: 730,
                                                        contextid: 2,
                                                        amount: 1, //was itemscopy[z].amount ?
                                                        assetid: itemscopy[z].id
                                                    }
                                                    itemstobesent=itemstobesent+''+itemscopy[z].market_name+'/';
                                                    queries[num]='INSERT INTO `sentitems` (`itemid`,`name`,`gameid`,`queueid`,`userid`) VALUES ("'+itemscopy[z].id+'","'+itemscopy[z].market_name.replace('龍王','??')+'","'+gameid+'","'+queueid+'","'+theuserid+'")';
                                                    myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'Added '+itemscopy[z].market_name+' in the list for sending ('+queueid+'/G:'+gameid+'/Z:'+z+')');

                                                    sendItems[j] = "empty";
                                                    itemscopy[z].market_name = "zzzzagain";
                                                    num++;

                                                }else{
                                                    myconsolelog('Q:'+queueid+'/G:'+gameid+'/Z:'+z+' '+itemscopy[z].market_name+' with id '+itemscopy[z].id+' was already sent in another offer. looking for another item...');
                                                }
                                    }
                                }
                            if(num==sendItems.length){
                                myconsolelog(num+'=='+sendItems.length);
                                    //myconsolelog('Gone through all the items TRYING to send the offer now. Result: num: '+num+'; sendItems.length: '+sendItems.length);
                                    offers.makeOffer({
                                        partnerSteamId: theuserid,
                                        itemsFromMe: item,
                                        accessToken: thetoken,
                                        itemsFromThem: [],
                                        message: 'Congratulations! You won a round on '+sitename+'! These are the winnings from round #' + gameid
                                    }, function(err, response) {
                                            if (err) {
                                            //myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+y+'(y) / '+z+'(z) / '+j+' (j) / '+x+' (x) / '+num+' (num) / '+sendItems.length+' (sendItems.length) / '+item+' (item)');
                                                myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'(ERROR) Tried sending offers: Token: '+thetoken+'; USERID: '+theuserid+'; items: '+itemstobesent+' (steam servers down? too many offers sent already? empty token (from trade link) in database? check pls). ' + err + '. https://github.com/SteamRE/SteamKit/blob/master/Resources/SteamLanguage/eresult.steamd');
                                                
                                                //myconsolelog('Trying sendoffers again in 2 seconds...');
                                                //setTimeout(sendoffers, 2000);

                                                return;
                                            }
                                            offerssent[gameid]=gameid; //add it to the array

                                            //myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+y+'(y) / '+z+'(z) / '+j+' (j) / '+x+' (x) / '+num+' (num) / '+sendItems.length+' (sendItems.length) / '+item+' (item)');
                                            myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'Trade offer ' + queueid + ' (game '+gameid+') sent! Marking items as sent in the database....');

                                            var thetheitems=theitems.replace(/\/$/, '');
                                            var theitemstobesent=itemstobesent.replace(/\/$/, '');

                                            var numtheitems = (thetheitems).split('/').length;
                                            var numitemstobesent = (theitemstobesent).split('/').length;

                                            if(numtheitems!=numitemstobesent){
                                                myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'WARNING !!! Sent '+numtheitems+' items! Needed to send '+numitemstobesent+'!!!');
                                                myconsolelog('Sent ('+numtheitems+'): '+thetheitems);
                                                myconsolelog('Needed to send ('+numitemstobesent+'): '+theitemstobesent);
                                            }else{
                                                myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'ALL IS GOOD! Sent '+numtheitems+' items! Needed to send '+numitemstobesent+'.');
                                            }
                                            //myconsolelog('Tried sending: '+thetheitems+'. Ended up sending: '+theitemstobesent);

                                            for(bla=0;bla<queries.length;bla++){
                                                mysqlConnection.query(queries[bla], function (blaerr, blarows, blafields){
                                                    if(blaerr) {
                                                        throw blaerr;
                                                    }
                                                    myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'SUCCESS marking the item as sent in the database.');
                                                });
                                            }


                                            myconsolelog('Q:'+queueid+'/G:'+gameid+'/ '+'Calling sendoffers again in 2 seconds...');
                                            setTimeout(sendoffers, 2000);
                                            updateOffer(response.tradeofferid,gameid);
                                            mysqlConnection.query('UPDATE `queue` SET `status`=\'sent ' + response.tradeofferid + '\' WHERE `id`=\'' + queueid + '\'', function(err, row, fields) {
                                                if (err) throw err;
                                            });

                                    });

                                num++; //avoid running this multiple times when the loop runs
                            }
                        });
                        })(x); 
                    }
                }else{
                    myconsolelog('Tried processing game '+row[y].gameid+' (queue '+row[y].id+') again? Check the queues in the database...');
                }
            }
        });
    })
}






//CLEANSTRING


function cleanString(input) {
    var output = "";
    for (var i=0; i<input.length; i++) {
        if (input.charCodeAt(i) <= 127) {
            output += input.charAt(i);
        }
    }
    return output;
}





//FUNCTION


(function() {
    /**
     * Decimal adjustment of a number.
     *
     * @param {String}  type  The type of adjustment.
     * @param {Number}  value The number.
     * @param {Integer} exp   The exponent (the 10 logarithm of the adjustment base).
     * @returns {Number} The adjusted value.
     */
    function decimalAdjust(type, value, exp) {
        // If the exp is undefined or zero...
        if (typeof exp === 'undefined' || +exp === 0) {
            return Math[type](value);
        }
        value = +value;
        exp = +exp;
        // If the value is not a number or the exp is not an integer...
        if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
            return NaN;
        }
        // Shift
        value = value.toString().split('e');
        value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
        // Shift back
        value = value.toString().split('e');
        return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
    }

    // Decimal round
    if (!Math.round10) {
        Math.round10 = function(value, exp) {
            return decimalAdjust('round', value, exp);
        };
    }
    // Decimal floor
    if (!Math.floor10) {
        Math.floor10 = function(value, exp) {
            return decimalAdjust('floor', value, exp);
        };
    }
    // Decimal ceil
    if (!Math.ceil10) {
        Math.ceil10 = function(value, exp) {
            return decimalAdjust('ceil', value, exp);
        };
    }
})();











//JÁTÉK VÉGE


function EndGame() {
    endtimer = -1;
    proceedWinners();
    myconsolelog('EndGame was called... (EndGame ends the timer, proceedWinners(), sendoffers())');

    setTimeout(sendoffers, 2000);

}















//INVENTORY BETÖLTÉSE


function loadinventory(){
    offers.loadMyInventory({
        appId: 730,
        contextId: 2
    }, function(err, itemx) {
        if (err) {
            myconsolelog('Error on loading inventory. '+err+'. Calling weblogon(). Calling loadinventory again after 2 seconds... (if this persists check the api key or check if steam servers are down at http://steamstat.us)');
            weblogon();
            setTimeout(loadinventory,3500);
            return;
        }

        setTimeout(function(){ checkoffers(1); },5500);
        myconsolelog('Own inventory loaded successfully. Items list in itemx var.');
        if(itemx.length>0){
            myconsolelog(itemx.length+' items in inventory.');
        }else{
            myconsolelog('WARNING! '+itemx.length+' items in inventory. The inventory may actually be empty OR steam servers are down. Check http://steamstat.us');
        }

        //myconsolelog(itemx);
    });
}
















//FRIENDMESSAGE


client.on('friendMessage', function(steamID, message) {

    if(steamID == admin) {

  

     		if(message.indexOf("/uzmiskinove") == 0) {
			offers.loadMyInventory({
				appId: 730,
				contextId: 2
			}, function(err, items) {
				if(err) {
					steam.sendMessage(steamID, 'Problem sa Steamom, probaj ponovo.');
					steam.webLogOn(function(newCookie) {
						offers.setup({
							sessionID: globalSessionID,
							webCookie: newCookie
						}, function(err) {
							if (err) {
							}
						});
					});
					return;
				}
				var item=[],num=0;
				for (var i = 0; i < items.length; i++) {
					if (items[i].tradable) {
						item[num] = {
							appid: 730,
							contextid: 2,
							amount: items[i].amount,
							assetid: items[i].id
						}
						num++;
					}
				}
				if (num > 0) {
					offers.makeOffer ({
						partnerSteamId: admin,
						itemsFromMe: item,
						itemsFromThem: [],
						message: ''
					}, function(err, response){
						if (err) {
							throw err;
						}
					
					});
				}
			});

        } else if (message.indexOf("/send") == 0) {
            var params = message.split(' ');

            if (params.length == 1) return client.chatMessage(steamID, 'Format: /send [item name]');
            myconsolelog('Received /send request');


            offers.loadMyInventory({
                appId: 730,
                contextId: 2
            }, function(err, items) {

                if (err) {
                    client.chatMessage(steamID, 'Could not load the inventory. Calling weblogon() - try again please.');
                    myconsolelog('Could not load the inventory. Calling weblogon() - try again please.');
                    weblogon();
                    return;
                }

                var item = 0;
                for (var i = 0; i < items.length; i++) {
                    if ((items[i].market_name).indexOf(params[1]) != -1) {
                        item = items[i].id;
                        break;
                    }
                }

                if (item != 0) {
                    offers.makeOffer({
                        partnerSteamId: admin,
                        itemsFromMe: [{
                            appid: 730,
                            contextid: 2,
                            amount: 1,
                            assetid: item
                        }],
                        itemsFromThem: [],
                        message: 'You requested this item with the /send command.'
                    }, function(err, response) {
                        if (err) {
                            throw err;
                        }
                        client.chatMessage(steamID, 'Trade offer with the requested item sent!');
                        myconsolelog('Offer from /send request sent to '+steamID);
                    });
                }else{

                    client.chatMessage(steamID, 'Couldn\'t match the item requested! /send is case sensitive!');
                    myconsolelog('Couldn\'t match the item selected by '+steamID);
                }

            });

        } else if (message.indexOf("/show") == 0) {

            var params = message.split(' ');

            offers.loadMyInventory({
                appId: 730,
                contextId: 2
            }, function(err, items) {

                if (err) {
                    client.chatMessage(steamID, '(2) Could not load the inventory. Calling weblogon() - try again please.');
                    myconsolelog('(2) Could not load the inventory. Calling weblogon() - try again please.');
                    weblogon();
                    return;
                }

                client.chatMessage(steamID, 'Items list: ');

                for (var i = 0; i < items.length; i++) {
                    client.chatMessage(steamID, 'http://steamcommunity.com/id/tradecschance1/inventory/#' + items[i].appid + '_' + items[i].contextid + '_' + items[i].id);
                }

            });


        } else if (message.indexOf("/end") == 0) {

            client.chatMessage(steamID, 'Got request to end the game (/end)');
            if (endtimer != -1) clearTimeout(endtimer);
            EndGame();

        } else if (message.indexOf("/so") == 0) {

            client.chatMessage(steamID, 'Got request to send pending offers (/so)');
            sendoffers();

        } else if (message.indexOf("/co") == 0) {

            client.chatMessage(steamID, 'Got request to check incomming offers (/co)');
            checkoffers(1);

        } else {

            client.chatMessage(steamID, 'Available commands:\r\n/co - checks incomming offers\r\n/so - sends pending offers (calls sendoffers())\r\n/end - ends the game (clears timeout endtimer, calls EndGame())\r\n/show - displays all the items in the inventory\r\n/send [item] - sends trade offer with [item]\r\n/sendallitems - sends offer with all the items in the inventory (it breaks active offers, only use it when there are no active offers)');
            myconsolelog('Displayed available commands to '+steamID);
        }

    }
	

    getUserInfo(steamID, function(error, data) {
        if (error) throw error;
        var datadec = JSON.parse(JSON.stringify(data.response));
        var name = datadec.players[0].personaname;
        myconsolelog(name + ': ' + message); // Log it
    });

    //client.chatMessage(steamID, 'I\'m a bot that accepts all your unwanted items.  If you would like to grab a few crates from me, please request a trade.');
});
















function in_array(needle, haystack, strict) {
    var found = false,
        key, strict = !!strict;

    for (key in haystack) {
        if ((strict && haystack[key] === needle) || (!strict && haystack[key] == needle)) {
            found = true;
            break;
        }
    }

    return found;
}










var declinedoffer=false;
var isGood = true;

function getStatus() {
        return isGood;
}
 
function setStatus(data) {
        isGood = data;
}







//OFFEREK ELLENŐRZÉSE


function checkoffers(thenumber) {
    declinedoffer=false;
    myconsolelog('Checking for offers...');
    if (thenumber > 0) {
        offers.getOffers({
            get_received_offers: 1,
            active_only: 1,
            get_sent_offers: 0,
            get_descriptions: 1,
            language: "en_us"
        }, function(error, body) {
            
            myconsolelog('Trade offers not empty... '+thenumber);

            if (error) {
                myconsolelog('Error getting offers. Steam servers down? Error: '+error);
                return;
            }
            if (body.response.trade_offers_received) {


                body.response.trade_offers_received.forEach(function(offer) {
                    if (offer.trade_offer_state == 2) {
                        mysqlConnection.query('SELECT * FROM `users` WHERE `steamid`="'+offer.steamid_other+'"',function(usrerr,usrres,usrfields){
                            if(usrres.length==0){
                                console.log('user does not exist in database: '+offer.steamid_other);
                                return;
                            }
                            var tlink=usrres[0].tlink;
                            if (tlink == '') {
                                console.log('no trade link in db for user: '+offer.steamid_other);
                                return;
                            }
                            var tokenStr = tlink.split('token=', 2);
                            var token = tokenStr[1];
                            console.log(offer.steamid_other+' - '+token);
                            offers.getHoldDuration({
                                partnerSteamId:offer.steamid_other,
                                accessToken:token,
                            }, function (holderr,duration) {
                                if(holderr){
                                        console.log('holdduration error: '+holderr);
                                        myconsolelog('Could not get trade duration for trade id '+offer.tradeofferid+'. it usually means the partner cant receive trade offers (a cooldown of some sort - like 2fa, steamguard, etc) - DECLINING OFFER');
                                        offers.declineOffer({
                                            tradeOfferId: offer.tradeofferid
                                        });
                                        declinedoffer=true;
                                        var unixtime = Math.round(new Date().getTime() / 1000.0);
                                        var messagedata={to:offer.steamid_other,msg:'Trade declined. It apears you can not receive trade offers. Try again later.',time:unixtime,type:'tradehold'};
                                        io.emit('message',messagedata);
                                        return;
                                    }
                                    if ((duration.my != 0) || (duration.their != 0)) {
                                    myconsolelog('Trade declined because either the bot or the person sending the offer has a trade period '+offer.tradeofferid);
                                    offers.declineOffer({
                                        tradeOfferId: offer.tradeofferid
                                    });
                                    declinedoffer=true;
                                    if(duration.their!=0){
                                        var unixtime = Math.round(new Date().getTime() / 1000.0);
                                        var messagedata={to:offer.steamid_other,msg:'Trade declined. You can not instantly trade because you are not using trade confirmations through the mobile authenticator.',time:unixtime,type:'tradehold'};
                                        io.emit('message',messagedata);
                                    }
                                    return;
                                }
                            });
                    });

                    myconsolelog('Trade offer incomming...');
                    myconsolelog('Trade offer id '+offer.tradeofferid+' from '+offer.steamid_other);

                        if (offer.items_to_give) {
                            myconsolelog('Trade declined (items requested from the bot inventory)');
                            offers.declineOffer({
                                tradeOfferId: offer.tradeofferid
                            });
                            return;
                        }
                        myconsolelog('dbg 1');

                        if (offer.items_to_receive == undefined){
                            myconsolelog('Undefined items_to_receive. Retrying checkoffers...');
                               weblogon();
                            setTimeout(function(){ checkoffers(1) },3500);
                            return;
                        }
                        myconsolelog('dbg 2');

                        mysqlConnection.query('SELECT `value` FROM `info` WHERE `name`=\'current_game\'', function(err, row, fields) {
                            if(err) throw err;
                        myconsolelog('dbg 3');

                            var current_game = row[0].value;
                            mysqlConnection.query('SELECT COUNT(*) AS `totalitems` FROM `'+prf+current_game+'`', function(totalerr, totalres, totalfields){
                                if(totalerr) throw totalerr;
                                if(totalres.totalitems>maxitemsinpot){
                                            myconsolelog('Trade declined (pot reached limit)');
                                            offers.declineOffer({
                                                tradeOfferId: offer.tradeofferid
                                            });

                                            offer.items_to_receive = [];
                                            var unixtime = Math.round(new Date().getTime() / 1000.0);
                                            //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'too much items\',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                            
                                            var messagedata={to:offer.steamid_other,msg:'Trade declined. The pot reached the maximum limit of '+maxitemsinpot+' items. Deposit again next round.',time:unixtime,type:'toomanyitems'};
                                            io.emit('message',messagedata);
                                            myconsolelog('[socket] too many items message sent to '+offer.steamid_other);
                                            declinedoffer=true;
                                             return;
                                }else{
                                    mysqlConnection.query('SELECT COUNT(*) AS `usersitems` FROM `'+prf+current_game+'` WHERE `userid`=\''+offer.steamid_other+'\'', function(errs, rows, fieldss) {
                                        if(errs) throw errs;
                                        myconsolelog('dbg 4');

                                        if (offer.items_to_receive.length > maxitems || offer.items_to_receive.length+rows[0].usersitems > maxitems) {

                                            myconsolelog('Trade declined (too many items)');
                                            offers.declineOffer({
                                                tradeOfferId: offer.tradeofferid
                                            });

                                            offer.items_to_receive = [];
                                            var unixtime = Math.round(new Date().getTime() / 1000.0);
                                            //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'too much items\',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                            
                                            var messagedata={to:offer.steamid_other,msg:'Trade declined. You offered too many items. Max '+maxitems+' items per round!',time:unixtime,type:'toomanyitems'};
                                            io.emit('message',messagedata);
                                            myconsolelog('[socket] too many items message sent to '+offer.steamid_other);
                                            declinedoffer=true;
                                            return;
                                        }
                                        myconsolelog('dbg 5');
                                    });
                                }
                            myconsolelog('dbg 5.5');
                            });
                        myconsolelog('dbg 6');
                        });
                        myconsolelog('dbg 7');
                        var delock = false;

                        offers.loadPartnerInventory({
                            partnerSteamId: offer.steamid_other,
                            appId: 730,
                            contextId: 2,
                            tradeOfferId: offer.tradeofferid,
                            language: "en"
                        }, function(err, hitems) {
                            myconsolelog('dbg 8');
                            if (err) {
                                myconsolelog('Error loading partnerinventory. Calling weblogon and trying again.');
                                setTimeout(function(){ checkoffers(1) },3500);
                               weblogon();
                                recheck = true;
                                return;
                            }
                            myconsolelog('dbg 9');
                            if (delock == true) return;
                            delock = true;

                            var items = offer.items_to_receive;
                            var wgg = [],
                                num = 0;
                            for (var i = 0; i < items.length; i++) {
                                for (var j = 0; j < hitems.length; j++) {
                                    if (items[i].assetid == hitems[j].id) {
                                        wgg[num] = hitems[j];
                                        num++;
                                        break;
                                    }
                                }
                            }
myconsolelog('dbg 10');
                            var price = [];

                            for (var i = 0; i < num; i++) {
                                if (wgg[i].appid != 730 && !declinedoffer) { //got other items than cs items

                                    myconsolelog('Trade declined (got other items than cs items)');

                                    offers.declineOffer({
                                        tradeOfferId: offer.tradeofferid
                                    });

                                    var unixtime = Math.round(new Date().getTime() / 1000.0);
                                    //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'only csgo items\',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                    
                                    var messagedata={to:offer.steamid_other,msg:'Trade declined. You offered something else than CS:GO items!',time:unixtime,type:'otheritems'};
                                    io.emit('message',messagedata);
                                    myconsolelog('[socket] got other items than cs items message sent to '+offer.steamid_other);
                                    declinedoffer=true;
                                    return;
                                }
myconsolelog('dbg 11');
                                if (wgg[i].market_name.indexOf("Souvenir") != -1 && !declinedoffer) {
                                    var unixtime = Math.round(new Date().getTime() / 1000.0);

                                    myconsolelog('Trade declined (got souvenir items)');

                                    offers.declineOffer({
                                        tradeOfferId: offer.tradeofferid
                                    });

                                    //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'You cant bet souvenir weapons\',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                    
                                    var messagedata={to:offer.steamid_other,msg:'Trade declined. You cannot deposit souvenir items!',time:unixtime,type:'souvenir'};
                                    io.emit('message',messagedata);
                                    myconsolelog('[socket] got souvenir items message sent to '+offer.steamid_other);
                                    declinedoffer=true;
                                    return;
                                }
myconsolelog('dbg 12');
/*
                                if (!declinedoffer && wgg[i].market_name.indexOf("Weapon Case") != -1 || wgg[i].market_name == 'Chroma 2 Case' || wgg[i].market_name == 'Chroma Case' || wgg[i].market_name == 'eSports 2013 Winter Case' || wgg[i].market_name == 'Falchion Case' || wgg[i].market_name.indexOf("Sticker Capsule") != -1) {
                                    var unixtime = Math.round(new Date().getTime() / 1000.0);
                                    offers.declineOffer({
                                        tradeOfferId: offer.tradeofferid
                                    });
                                    //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'You cant bet weapon cases\',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                    myconsolelog('Trade declined (received weapon case... ' + wgg[i].market_name+')');

                                    var messagedata={to:offer.steamid_other,msg:'Trade declined. You cannot deposit weapon cases!',time:unixtime,type:'weaponcase'};
                                    io.emit('message',messagedata);
                                    myconsolelog('[socket] got weapon cases message sent to '+offer.steamid_other);
                                    declinedoffer=true;
                                    return;
                                }
*/

myconsolelog('dbg 13');

                                var itemname = wgg[i].market_name;

                                var url = 'http://' + sitename + '/cost.php?pw='+accesspassword+'&item=' + encodeURIComponent(itemname);
                                if(!declinedoffer){
                                    myconsolelog('dbg 14');

                                        (function(someshit) {
                                        if(!(itemname in itemprices)){
                                        request(url, function(error, response, body) {
                                            if (!error && response.statusCode === 200) {

                                                var unixtime = Math.round(new Date().getTime() / 1000.0);
                                                if (body == "notfound") {
                                                    offers.declineOffer({
                                                        tradeOfferId: offer.tradeofferid
                                                    });
                                                    myconsolelog('Trade declined. Item not found (notfound response when trying to get item cost).');
                                                    //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'Item not available \',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                                
                                                    var messagedata={to:offer.steamid_other,msg:'Trade declined. An item you sent is unavailable ('+wgg[someshit].market_name+')!',time:unixtime,type:'itemunavailable'};
                                                    io.emit('message',messagedata);
                                                    myconsolelog('[socket] item unavailable message sent to '+offer.steamid_other);
                                                    
                                                } else if (body == "unauthorized") {
                                                    offers.declineOffer({
                                                        tradeOfferId: offer.tradeofferid
                                                    });
                                                    myconsolelog('Trade declined. Could not get price for item (unauthorized acces when accessing cost.php on the server. Check if accesspassword variable is set accordingly in bot_source.js (see include/config.php on site)');
                                                    //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'Item not available \',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                                
                                                    var messagedata={to:offer.steamid_other,msg:'Trade declined. Unknown error please try again or contact an administrator!',time:unixtime,type:'unauthorized'};
                                                    io.emit('message',messagedata);
                                                    myconsolelog('[socket] item cost unknown error message sent to '+offer.steamid_other);
                                                    
                                                } else {
                                                    wgg[someshit].cost = parseFloat(body);
                                                    
                                                    itemprices[wgg[someshit].market_name]=wgg[someshit].cost;

                                                    myconsolelog('Got item price from site: ' + wgg[someshit].market_name + ' = ' + body);


                                                }
                                            } else {
                                                offers.declineOffer({
                                                    tradeOfferId: offer.tradeofferid
                                                });
                                            myconsolelog('Declined offer (error on getting price on ' + wgg[someshit].market_name + ')');

                                            var messagedata={to:offer.steamid_other,msg:'Trade declined. We could not get the price on one of your items ('+wgg[someshit].market_name+')!',time:unixtime,type:'priceerror'};
                                            io.emit('message',messagedata);
                                            myconsolelog('[socket] couldnt get price on item message sent to '+offer.steamid_other);
                                                    
                                            }
                                        });
                                        }else{
                                            myconsolelog('Got item price from local array. '+wgg[someshit].market_name+' = '+itemprices[wgg[someshit].market_name]);
                                            wgg[someshit].cost=parseFloat(itemprices[wgg[someshit].market_name]);
                                        }
                                    })(i)
                                }else{
                                    myconsolelog('dbg 15');
                                    myconsolelog('declinedoffer is true apparently? declinedoffer: '+declinedoffer)
                                    return;
                                }
                            }
                            if(!declinedoffer)
                            setTimeout(function() { // UNDEFINED PRICES? LOOK AT THIS! ITS GLIZDA!
                                myconsolelog('Timeout step 1...');
                                var sum = 0;
                                for (var i = 0; i < num; i++) {
                                    sum += wgg[i].cost;
                                }
                                myconsolelog('Timeout step 1.2...');

                                if (sum < minbet && !declinedoffer) {
                                        num = 0;
                                        var unixtime = Math.round(new Date().getTime() / 1000.0);
                                        offers.declineOffer({
                                            tradeOfferId: offer.tradeofferid
                                        });
                                        myconsolelog('Trade declined, value was too small.');

                                        //mysqlConnection.query('INSERT INTO `messages` (`userid`,`msg`,`from`, `win`, `system`, `time`) VALUES (\'' + offer.steamid_other + '\',\'Value is too small. ' + sum + '<' + row[0].value + '\',\'System\', \'0\', \'1\', \'' + unixtime + '\')', function(err, row, fields) {});
                                        
                                        var messagedata={to:offer.steamid_other,msg:'Trade declined. The value of your items was too small ($'+sum+')! Min $'+minbet+' per bet.',time:unixtime,type:'priceerror'};
                                        io.emit('message',messagedata);
                                        myconsolelog('[socket] value too small message sent to '+offer.steamid_other);
                                        declinedoffer=true;

                                        return;
                                }
                                myconsolelog('Timeout step 1.3... (next: getuserinfo) - if this hangs up too long then steam servers are probably fucking up: getUserInfo('+offer.steamid_other);

                                getUserInfo(offer.steamid_other, function(error, data) {
                                    myconsolelog('Timeout step 1.4...');
                                    if (error) throw error;
                                    myconsolelog('Timeout step 2...');

                                    var datadec = JSON.parse(JSON.stringify(data.response));
                                    var name = addslashes(cleanString(datadec.players[0].personaname));
                                    var avatar = (datadec.players[0].avatarfull);
                                    if (num == 0) return;
                                    offers.acceptOffer({
                                        tradeOfferId: offer.tradeofferid
                                    }, function(err, response) {
                                        if (err != null){
                                        myconsolelog('Erorr while accepting offer (?) Calling weblogon and checking offers again in 2 seconds...'+err);
                               weblogon();
                            setTimeout(function(){ checkoffers(1) },2000);
                                       return;
                                     }
                                        myconsolelog('Accepted trade offer #' + offer.tradeofferid + ' by ' + name + ' (' + offer.steamid_other + ')');

                                        mysqlConnection.query('SELECT `value` FROM `info` WHERE `name`=\'current_game\'', function(err, row, fields) {
                                            if(err) throw err;
                                            var restosocket={};
                                            restosocket.newitems=[];

                                            var current_game = row[0].value;

                                            restosocket.current_game = current_game;

                                            mysqlConnection.query('SELECT `totalvalue`,`itemsnum` FROM `games` WHERE `id`=\'' + current_game + '\'', function(err1, row1, fields1) {
                                                var current_bank = parseFloat(row1[0].totalvalue);
                                                var itemsnum = row1[0].itemsnum;

                                              for (var j = 0; j < num; j++) {

                                                     restosocket.newitems[j]={};
                                                     var qualityclasssplit=wgg[j].type.split(' ');
                                                     var qc=qualityclasssplit[0].toLowerCase();
                                                     var qcdb;
                                                    /* consumer, industrial, mil-spec, restricted, classified, covert, knife, contraband */

                                                     if(qc=='consumer' || qc=='base'){
                                                        qcdb='1consumer';
                                                     }else if (qc=='industrial'){
                                                        qcdb='2industrial';
                                                     }else if (qc=='mil-spec'){
                                                        qcdb='3mil-spec';
                                                     }else if (qc=='restricted'){
                                                        qcdb='4restricted';
                                                     }else if (qc=='classified'){
                                                        qcdb='5classified';
                                                     }else if (qc=='covert'){
                                                        qcdb='6covert';
                                                     }else if (qc=='★'){
                                                        qcdb='7knife';
                                                        wgg[j].market_name=wgg[j].market_name.replace('★','&#9733;');
                                                     }else if (qc=='contraband'){
                                                        qcdb='9contraband';
                                                     }else{
                                                        qcdb='1consumer';
                                                     }

													 //Ide elhelyezni 90mp-nként újrainduló random botokat adót
													 
													 
                                                    mysqlConnection.query('INSERT INTO `'+prf + current_game + '` (`userid`,`offerid`,`username`,`item`,`qualityclass`,`color`,`value`,`avatar`,`image`,`from`,`to`) VALUES (\'' + offer.steamid_other + '\',\''+offer.tradeofferid+'\',\'' + name + '\',\'' + wgg[j].market_name + '\',\''+qcdb+'\',\'' + wgg[j].name_color + '\',\'' + wgg[j].cost + '\',\'' + avatar + '\',\'' + wgg[j].icon_url + '\',\'' + current_bank + '\'+\'0\',\'' + current_bank + '\'+\'' + wgg[j].cost + '\')', function(err, row, fields) {});
                                                    mysqlConnection.query('UPDATE `games` SET `itemsnum`=`itemsnum`+1, `totalvalue`=`totalvalue`+\'' + wgg[j].cost + '\' WHERE `id` = \'' + current_game + '\'', function(err, row, fields) {});
                                                    restosocket.newitems[j]={currentgame:current_game,userid:offer.steamid_other,offerid:offer.tradeofferid,username:name,item:wgg[j].market_name,qualityclass:qcdb,color:wgg[j].name_color,cost:wgg[j].cost,avatar:avatar,icon:wgg[j].icon_url};
                                                    
                                                    current_bank = parseFloat(current_bank + wgg[j].cost);
                                                    itemsnum++;
                                                }
                                                restosocket.current_bank = current_bank;
                                                restosocket.itemsnum = itemsnum;
                                                     
                                                mysqlConnection.query('SELECT COUNT(DISTINCT userid) AS playerscount FROM `'+prf + current_game+'`', function(err, rows) {
                                                    if(err) throw err;
                                                    var playerscount = rows[0].playerscount;
                                                    myconsolelog('Current Players: ' + playerscount);



                                                    if (playerscount == 2 && items.length > 0 && gamestarted==='no') { //STARTING GAME
                                                        myconsolelog('Game started var: '+gamestarted);
                                                        myconsolelog('Found 2 Players... Starting game.');
                                                        endtimer = setTimeout(EndGame, GameTime * 1000);

                                                        io.emit('roundstart','1');
                                                        gamestarted='yes';

                                                        mysqlConnection.query('UPDATE `games` SET `starttime`=UNIX_TIMESTAMP() WHERE `id` = \'' + current_game + '\'', function(err3, row3, fields3) {});

                                                        var gamestartmessage;
                                                        mysqlConnection.query('SELECT * FROM `games` WHERE `id`=\''+current_game+'\'', function(err6,row6,fields6){
                                                            if(err6) throw err6;

                                                            var gamestartedstarttime=row6.starttime;

                                                        });

                                                        myconsolelog('[socket] game start info sent to everyone');
                                                    }else{
                                                        myconsolelog('Game started var: '+gamestarted);
                                                        gamestarted='no';
                                                        var gamestartedstarttime=2147483647;
                                                    }

                                                    restosocket.playersnum=playerscount;
                                                    restosocket.gamestarted=gamestarted;
                                                    restosocket.gamestartedstarttime=gamestartedstarttime;

                                                    io.emit('roundupdate',JSON.stringify(restosocket));
                                                    io.emit('online',connections);

                                                    myconsolelog('[socket] sent game update & updated online count '+connections);
                                                });

                                                if (itemsnum > 50 || itemsnum == 50) {
                                                    myconsolelog('Hit ' + itemsnum + ' items... Not ending the game atm cause roulette is bugged.');
                                                }

                                                myconsolelog('Accepted (CONFIRMATION) trade offer #' + offer.tradeofferid + ' by ' + name + ' (' + offer.steamid_other + ')');



                                        
                                            });
                                        });
                                    });
                                });


                            }, 3500);

                        });
                    }
                        /*}else{
                            myconsolelog('Trade declined because either the bot or the person sending the offer has a trade period');
                            offers.declineOffer({
                                tradeOfferId: offer.tradeofferid
                            });
                            if(duration.their!=0){
                                var unixtime = Math.round(new Date().getTime() / 1000.0);
                                var messagedata={to:offer.steamid_other,msg:'Trade declined. You can not instantly trade because you are not using trade confirmations through the mobile authenticator.',time:unixtime,type:'tradehold'};
                                io.emit('message',messagedata);
                            }
                        } }); });*/
               });
            }
        });
    }else{
        myconsolelog('No offers? number: '+thenumber);
    }
}















function currentstate(current_game){
    var res;
    mysqlConnection.query('SELECT * FROM `games` WHERE `id`=\''+current_game+'\'', function(err,row,fields){
        if(err) throw err;

        mysqlConnection.query('SELECT * FROM `\''+prf+current_game+'\'', function(err2,row2,fields2){

        });
    });

    return res;
}





















var pew;
client.on('tradeOffers', checkoffers);

client.on('sentry', function(data) {
    require('fs').writeFileSync('sentry_' + logOnOptions['accountName'] + '.hash', data);
});

setInterval(function() {
    mysqlConnection.query('SELECT 1');
}, 5000);


setInterval(function(){
    request(steamstatusurl+'?pw='+accesspassword, function(error, response, body) {
        //myconsolelog('steamstatus: '+body);
        io.emit('steamstatus',body);
    });
    request(contentcreatorsurl+'?pw='+accesspassword, function(error, response, body) {
        //myconsolelog('steamstatus: '+body);
        io.emit('cc',body);
    });
}, 30000);


//sock
http.listen(3000, function(){
  myconsolelog("\r\n\r\n"+'[socket] Listening on *:3000');
});