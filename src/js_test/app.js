var protoBuf = require("protobufjs");
var zmq      = require('zmq');
var speech   = require('./lib/google-say.js');
var visa     = require('./lib/visa_pay.js');

var assetsPath = '/home/pi/Marriott-Demo/assets';
var audioPath = assetsPath + '/audio';

var creator_ip = '127.0.0.1';
var creator_wakeword_base_port = 60001;
var creator_everloop_base_port = 20013 + 8 // port for Everloop driver.

var protoBuilder = protoBuf.loadProtoFile('../../protocol-buffers/malos/driver.proto');
var matrixMalosBuilder = protoBuilder.build("matrix_malos");
var configSocket = zmq.socket('push')
configSocket.connect('tcp://' + creator_ip + ':' + creator_wakeword_base_port /* config */)

// ********** Start error management.
var errorSocket = zmq.socket('sub')
errorSocket.connect('tcp://' + creator_ip + ':' + (creator_wakeword_base_port + 2))
errorSocket.subscribe('')
errorSocket.on('message', function(error_message) {
    process.stdout.write('Received Wakeword error: ' + error_message.toString('utf8') + "\n")
});
// ********** End error management.

/**************************************
 * start/stop service functions
 **************************************/

function startWakeUpRecognition(){
    console.log('<== config wakeword recognition..')
    var wakeword_config = new matrixMalosBuilder.WakeWordParams;
    var prefix = assetsPath + '/commands';
    wakeword_config.set_wake_word("MARRIOTT");
    wakeword_config.set_lm_path(prefix + ".lm");
    wakeword_config.set_dic_path(prefix + ".dic");
    wakeword_config.set_channel(matrixMalosBuilder.WakeWordParams.MicChannel.channel8);
    wakeword_config.set_enable_verbose(false)
    sendConfigProto(wakeword_config);
}

function stopWakeUpRecognition(){
    console.log('<== stop wakeword recognition..')
    var wakeword_config = new matrixMalosBuilder.WakeWordParams;
    wakeword_config.set_stop_recognition(true)
    sendConfigProto(wakeword_config);
}

/**************************************
 * Register wakeword callbacks
 **************************************/

var updateSocket = zmq.socket('sub')
updateSocket.connect('tcp://' + creator_ip + ':' + (creator_wakeword_base_port + 3))
updateSocket.subscribe('')

var foodOrder = '';

var audio = {
    checkout: 'checkout',
    callDesk: 'call_desk',
    callConcierge: 'call_concierge',
    didntCatch: 'didnt_catch',
    orderTowels: 'order_towels',
    orderSheets: 'order_sheets',
    orderPillows: 'order_pillows'
};

function setLights(status) {
    play('lights_' + status);
}

function askChargeFood(food) {
    play('ask_charge_' + food);
}

function chargeFood(food) {
    play('charge_' + food);
}

function play(audioFile) {
    speech.playFile(audioPath + '/' + audioFile + '.mp3');
}

updateSocket.on('message', function(wakeword_buffer) {
    var wakeWordData = new matrixMalosBuilder.WakeWordParams.decode(wakeword_buffer);
    console.log('==> WakeWord Reached:',wakeWordData.wake_word)
    var str = wakeWordData.wake_word;

    if (foodOrder) {
        var success = false;
        switch (true) {
            case /( TO)?( THE)?ROOM.*/.test(str):
                success = true;
                chargeFood(foodOrder + "_room");
                break;
            case /VISA( CHECKOUT)?.*/.test(str):
                success = true;
                chargeFood(foodOrder + "_visa");
                break;
            default:
                play(audio.didntCatch);
        }
        if (success) {
            foodOrder = '';
            setEverloop(10, 255, 0, 0, 0.1);
            turnOffEverloopDelayed();
        }
    } else {
        switch (true) {
            case /MARRIOTT CALL CONCIERGE.*/.test(str):
                setEverloop(140, 255, 75, 0, 0.05);
                play(audio.callConcierge);
                turnOffEverloopDelayed();
                break;

            case /MARRIOTT CALL( THE)* FRONT DESK.*/.test(str):
                setEverloop(0, 25, 255, 0, 0.05);
                play(audio.callDesk);
                turnOffEverloopDelayed();
                break;

            case /MARRIOTT CHECKOUT.*/.test(str):
                setEverloop(0, 25, 255, 0, 0.05);
                play(audio.checkout);
                turnOffEverloopDelayed();
                break;

            case /MARRIOTT(( TURN)? OFF( THE)* LIGHTS| LIGHTS OFF).*/.test(str):
                turnOffEverloop();
                setLights('off');
                break;

            case /MARRIOTT DIM( THE)* LIGHTS.*/.test(str):
                setEverloop(127, 127, 127, 127, 0.01);
                setLights('dim');
                break;

            case /MARRIOTT(( TURN)? ON( THE)* LIGHTS| LIGHTS ON).*/.test(str):
                setEverloop(255, 255, 255, 255, 1);
                setLights('on');
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST) BREAKFAST.*/.test(str):
                foodOrder = 'breakfast';
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST)( THE)* CONTINENTAL BREAKFAST.*/.test(str):
                foodOrder = 'continental_breakfast';
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST) (LUNCH|LIGHTS).*/.test(str):
                foodOrder = 'lunch';
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST) (DINNER|DIM).*/.test(str):
                foodOrder = 'dinner';
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST) TOWELS.*/.test(str):
                setEverloop(255, 75, 255, 0, 0.05);
                turnOffEverloopDelayed();
                play(audio.orderTowels);
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST) PILLOWS.*/.test(str):
                setEverloop(255, 75, 255, 0, 0.05);
                turnOffEverloopDelayed();
                play(audio.orderPillows);
                break;

            case /MARRIOTT ((I )?WANT|ORDER|REQUEST)( BED)? SHEETS.*/.test(str):
                setEverloop(255, 75, 255, 0, 0.05);
                turnOffEverloopDelayed();
                play(audio.orderSheets);
                break;

            default:
                play(audio.didntCatch);
        }
        if (foodOrder) {
            setEverloop(0, 110, 255, 0, 0.1);
            askChargeFood(foodOrder);
        }
    }
});

function turnOffEverloop() {
    setEverloop(0, 0, 0, 0, 0);
}

function turnOffEverloopDelayed(delay = 1500) {
    setTimeout(function() {
        turnOffEverloop();
    }, delay);
}

/**************************************
 * Everloop Ring LEDs handler
 **************************************/

var ledsConfigSocket = zmq.socket('push')
ledsConfigSocket.connect('tcp://' + creator_ip + ':' + creator_everloop_base_port /* config */)

function setEverloop(r, g, b, w, i) {
    var config = new matrixMalosBuilder.DriverConfig
    config.image = new matrixMalosBuilder.EverloopImage
    for (var j = 0; j < 35; ++j) {
        var ledValue = new matrixMalosBuilder.LedValue;
        ledValue.setRed(Math.round(r*i));
        ledValue.setGreen(Math.round(g*i));
        ledValue.setBlue(Math.round(b*i));
        ledValue.setWhite(Math.round(w*i));
        config.image.led.push(ledValue)
    }
    ledsConfigSocket.send(config.encode().toBuffer());
}

/**************************************
 * sendConfigProto: build Proto message
 **************************************/

function sendConfigProto(cfg){
    var config = new matrixMalosBuilder.DriverConfig
    config.set_wakeword(cfg)
    configSocket.send(config.encode().toBuffer())
}

/**********************************************
 ****************** MAIN **********************
 **********************************************/

startWakeUpRecognition();
