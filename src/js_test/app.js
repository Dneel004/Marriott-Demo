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
    var prefix = '../../assets/commands';
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

updateSocket.on('message', function(wakeword_buffer) {
    var wakeWordData = new matrixMalosBuilder.WakeWordParams.decode(wakeword_buffer);
    console.log('==> WakeWord Reached:',wakeWordData.wake_word)

    switch(wakeWordData.wake_word) {
        case "MARRIOTT RING RED":
            setEverloop(255, 0, 25, 0, 0.05)
            break;
        case "MARRIOTT RING BLUE":
            setEverloop(0, 25, 255, 0, 0.05)
            break;
        case "MARRIOTT RING CLEAR":
            setEverloop(0, 0, 0, 0, 0)
            break;
        default:
            // Marriott: sorry i didn't quite get that
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
