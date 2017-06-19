var protoBuf = require("protobufjs");
var zmq      = require('zmq');
var speech   = require('./lib/google-say.js');
var visa     = require('./lib/visa_pay.js');

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
    var prefix = '/home/pi/Marriott-Demo/assets/commands';
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

updateSocket.on('message', function(wakeword_buffer) {
    var wakeWordData = new matrixMalosBuilder.WakeWordParams.decode(wakeword_buffer);
    console.log('==> WakeWord Reached:',wakeWordData.wake_word)
    var str = wakeWordData.wake_word;

    if (foodOrder) {
        switch (true) {
            case /( TO)?( THE)?ROOM.*/.test(str):
                // Process room payment
                setEverloop(0, 25, 255, 0, 0.05);
                speech.say('Charging your ' + foodOrder + ' to your room.');
                foodOrder = '';
                break;
            case /VISA( CHECKOUT)?.*/.test(str):
                // Process VISA checkout
                setEverloop(140, 255, 75, 0, 0.05);
                speech.say('Charging your ' + foodOrder + ' to VISA checkout.');
                foodOrder = '';
                break;
            default:
                speech.say('Sorry, I didn\'t quite get that');
        }
    } else {
        switch (true) {
            case /MARRIOTT CALL CONCIERGE.*/.test(str):
                setEverloop(140, 255, 75, 0, 0.05);
                speech.say('Calling concierge.');
                break;

            case /MARRIOTT CALL( THE)* FRONT DESK.*/.test(str):
                speech.say('Calling the front desk.');
                setEverloop(0, 25, 255, 0, 0.05);
                break;

            case /MARRIOTT CHECKOUT.*/.test(str):
                speech.say('Checking out.');
                setEverloop(0, 25, 255, 0, 0.05);
                break;

            case /MARRIOTT( TURN)? OFF( THE)* LIGHTS?.*/.test(str):
                speech.say('Turning off the lights.');
                setEverloop(0, 0, 0, 0, 0);
                break;

            case /MARRIOTT DIM( THE)* LIGHTS?.*/.test(str):
                speech.say('Dimming the lights.');
                setEverloop(127, 127, 127, 127, 0.01);
                break;

            case /MARRIOTT( TURN)? ON( THE)* LIGHTS?.*/.test(str):
                speech.say('Turning on the lights.');
                setEverloop(255, 255, 255, 255, 1);
                break;

            case /MARRIOTT (ORDER|REQUEST) BREAKFAST.*/.test(str):
                foodOrder = 'breakfast';
                break;

            case /MARRIOTT (ORDER|REQUEST)( THE)* CONTINENTAL BREAKFAST.*/.test(str):
                foodOrder = 'continental breakfast';
                break;

            case /MARRIOTT (ORDER|REQUEST) (LUNCH|LIGHTS).*/.test(str):
                foodOrder = 'lunch';
                break;

            case /MARRIOTT (ORDER|REQUEST) (DINNER|DIM).*/.test(str):
                foodOrder = 'dinner';
                break;

            case /MARRIOTT (ORDER|REQUEST) TOWELS.*/.test(str):
                speech.say('Ordering towels.');
                setEverloop(255, 75, 255, 0, 0.05);
                // Ask to charge to VISA or room
                break;

            default:
                speech.say('Sorry, I didn\'t quite get that');
        }
        if (foodOrder) {
            speech.say('Would you like to charge your ' + foodOrder + ' to the room or VISA checkout?');
        }
    }
});

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
